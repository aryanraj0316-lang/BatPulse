import { ECHO_CONFIG } from '../constants/gameConfig';
import { EnemyDef } from '../levels/schema';
import { Body, Box, resolveCircleBoxes } from './collision';
import { NavGrid } from './nav';
import { World } from './world';

export type EnemyState = 'patrol' | 'alerted' | 'chase' | 'lost';

const MAX_PATH = 256;

export interface Enemy {
  readonly def: EnemyDef;
  readonly body: Body;
  state: EnemyState;
  /** Chase speed (slow = 15% under the player, fast = equal). */
  readonly chaseSpeed: number;
  readonly patrolSpeed: number;
  /** Index of the waypoint being walked to. */
  wp: number;
  dwell: number;
  /** After losing the bat the hunter walks back to its route through the nav grid. */
  returning: boolean;
  /** Where it is heading (sound position, last known bat position, ...). */
  tx: number;
  ty: number;
  /** Seconds left in the current search (lost state). */
  search: number;
  /** Seconds since the bat was last in clear sight. */
  noSight: number;
  repath: number;
  readonly path: Float32Array;
  pathLen: number;
  pathIdx: number;
  swayDir: number;
}

export interface PatrolInfo {
  x: number;
  y: number;
  /** Index of the waypoint being walked towards (while pausing: the one it will walk to next). */
  wp: number;
  /** Pause time left at a waypoint, 0 while walking. */
  dwell: number;
}

/**
 * Where a hunter is on its patrol loop at time t, in closed form. The simulation integrates the same motion
 * step by step; this is what the verification bots plan against.
 */
export function patrolInfo(def: EnemyDef, t: number, speed: number, out: PatrolInfo): PatrolInfo {
  const w = def.waypoints;
  out.dwell = 0;
  if (w.length === 1) {
    out.x = w[0].x;
    out.y = w[0].y;
    out.wp = 0;
    return out;
  }
  const dwell = ECHO_CONFIG.enemy.dwellSec;
  const legs: number[] = [];
  let cycle = 0;
  for (let i = 0; i < w.length; i++) {
    const n = w[(i + 1) % w.length];
    const len = Math.hypot(n.x - w[i].x, n.y - w[i].y);
    legs.push(len / speed);
    cycle += dwell + len / speed;
  }
  let u = (t + (def.phaseSec ?? 0)) % cycle;
  for (let i = 0; i < w.length; i++) {
    if (u < dwell) {
      out.x = w[i].x;
      out.y = w[i].y;
      out.wp = (i + 1) % w.length;
      out.dwell = dwell - u;
      return out;
    }
    u -= dwell;
    if (u < legs[i]) {
      const n = w[(i + 1) % w.length];
      const k = u / legs[i];
      out.x = w[i].x + (n.x - w[i].x) * k;
      out.y = w[i].y + (n.y - w[i].y) * k;
      out.wp = (i + 1) % w.length;
      return out;
    }
    u -= legs[i];
  }
  out.x = w[0].x;
  out.y = w[0].y;
  out.wp = 1 % w.length;
  return out;
}

/** Position only (see patrolInfo). */
export function patrolPose(def: EnemyDef, t: number, speed: number, out: { x: number; y: number }): { x: number; y: number } {
  const info = patrolInfo(def, t, speed, scratchInfo);
  out.x = info.x;
  out.y = info.y;
  return out;
}
const scratchInfo: PatrolInfo = { x: 0, y: 0, wp: 0, dwell: 0 };

export const enemyChaseSpeed = (def: EnemyDef): number =>
  ECHO_CONFIG.player.speed * (def.speed === 'slow' ? ECHO_CONFIG.enemy.slowHunterSpeedMult : ECHO_CONFIG.enemy.fastHunterSpeedMult);

export interface EnemyEvents {
  /** The hunter went from calm (patrol or searching) to hunting. */
  onAlert: (index: number) => void;
}

/**
 * All hunters of a level. Deterministic: same inputs, same behaviour (no randomness anywhere).
 *
 *   PATROL  walks its waypoint loop slowly.
 *   ALERTED heard a sound: walks to where it came from.
 *   CHASE   the bat is within reach or sensed directly: follows the bat's real position.
 *   LOST    chase broken off: searches around the last known spot for lostSearchSec, then goes back on patrol.
 */
export class EnemySystem {
  readonly enemies: Enemy[];
  private readonly nav: NavGrid;
  private readonly scratch: PatrolInfo = { x: 0, y: 0, wp: 0, dwell: 0 };
  /** Nearest hunter distance this step (Infinity when none). */
  nearest = Infinity;
  alertCount = 0;
  /**
   * The bat is inside a safe zone: hunters cannot see or catch it. Any hunter that was chasing gives up and searches the
   * place where it last saw the bat (and then goes back to its route), so it never learns the bat is hiding.
   */
  playerHidden = false;
  /** At most this many route searches per step, so several hunters never pile into one slow frame. */
  private planBudget = 0;
  /** Route searches done since creation (tests and profiling). */
  plansDone = 0;

  constructor(
    private readonly world: World,
    private readonly events: EnemyEvents,
  ) {
    this.nav = new NavGrid(world, ECHO_CONFIG.enemy.radius + 2);
    this.enemies = world.def.enemies.map((def) => {
      const chase = enemyChaseSpeed(def);
      const e: Enemy = {
        def,
        body: { x: def.waypoints[0].x, y: def.waypoints[0].y, vx: 0, vy: 0, r: ECHO_CONFIG.enemy.radius },
        state: 'patrol',
        chaseSpeed: chase,
        patrolSpeed: chase * ECHO_CONFIG.enemy.patrolSpeedFactor,
        wp: 0,
        dwell: 0,
        returning: false,
        tx: 0,
        ty: 0,
        search: 0,
        noSight: 0,
        repath: 0,
        path: new Float32Array(MAX_PATH * 2),
        pathLen: 0,
        pathIdx: 0,
        swayDir: 1,
      };
      return e;
    });
    this.reset();
  }

  /**
   * Back to the situation at world time `t` (0 = the spawn): every hunter on patrol where the loop puts it then.
   * `keepAlerts` is true on a checkpoint respawn: being alerted before a death still counts for the run.
   */
  reset(t: number = 0, keepAlerts: boolean = false): void {
    if (!keepAlerts) this.alertCount = 0;
    this.nearest = Infinity;
    this.playerHidden = false;
    for (const e of this.enemies) {
      const info = patrolInfo(e.def, t, e.patrolSpeed, this.scratch);
      e.body.x = info.x;
      e.body.y = info.y;
      e.body.vx = 0;
      e.body.vy = 0;
      e.state = 'patrol';
      e.returning = false;
      e.search = 0;
      e.noSight = 0;
      e.repath = 0;
      e.pathLen = 0;
      e.pathIdx = 0;
      e.wp = info.wp;
      e.dwell = info.dwell;
    }
  }

  /** The hearing range of a sound that is `loudness` units loud. */
  hear(x: number, y: number, range: number, closedDoors: readonly Box[]): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.state === 'chase') continue;
      if (Math.hypot(e.body.x - x, e.body.y - y) > range) continue;
      const calm = e.state === 'patrol' || e.state === 'lost';
      e.state = 'alerted';
      e.tx = x;
      e.ty = y;
      e.search = 0;
      e.repath = 0;
      e.pathLen = 0; // planned on the next steps within the per-step search budget
      if (calm) {
        this.alertCount++;
        this.events.onAlert(i);
      }
    }
  }

  /**
   * Advances every hunter one step. Returns true when one catches the bat.
   * `armed` is false during the spawn safe window: hunters then only patrol.
   */
  update(dt: number, px: number, py: number, pr: number, armed: boolean, closedDoors: readonly Box[], solids: readonly Box[]): boolean {
    const cfg = ECHO_CONFIG.enemy;
    this.nav.setClosedDoors(closedDoors);
    this.planBudget = 1;
    let caught = false;
    this.nearest = Infinity;

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const b = e.body;
      const dist = Math.hypot(px - b.x, py - b.y);
      const sight = !NavGrid.sightBlocked(solids, closedDoors, b.x, b.y, px, py);

      if (armed && !this.playerHidden) {
        // direct sensing, from any calm or searching state
        if ((e.state === 'patrol' || e.state === 'lost' || e.state === 'alerted') && sight && dist < cfg.senseRadius) {
          this.startChase(e, i);
        } else if (e.state === 'alerted' && sight && dist <= e.chaseSpeed * cfg.alertToChaseSec) {
          e.state = 'chase';
          e.repath = 0;
          e.noSight = 0;
        }
      }

      switch (e.state) {
        case 'patrol':
          this.patrol(e, dt);
          break;
        case 'alerted':
          this.goTo(e, dt, e.chaseSpeed);
          if (Math.hypot(e.tx - b.x, e.ty - b.y) < 14) this.beginSearch(e);
          break;
        case 'chase': {
          if (this.playerHidden) {
            // the bat vanished into a safe zone: search where it was last seen
            this.beginSearch(e);
            break;
          }
          e.tx = px;
          e.ty = py;
          e.noSight = sight ? 0 : e.noSight + dt;
          e.repath -= dt;
          if (e.repath <= 0 && this.planBudget > 0) {
            this.planBudget--;
            this.plan(e);
            e.repath = cfg.repathSec;
          }
          this.follow(e, dt, e.chaseSpeed);
          const reach = e.chaseSpeed * cfg.alertToChaseSec;
          if (e.noSight >= cfg.loseNoSightSec || dist > reach * cfg.loseDistanceMult) {
            // remember where the bat was and search there
            this.beginSearch(e);
          }
          break;
        }
        case 'lost':
          this.search(e, dt);
          break;
      }

      // walls and closed doors stop hunters too
      resolveCircleBoxes(b, solids);
      if (closedDoors.length > 0) resolveCircleBoxes(b, closedDoors);

      const d2 = Math.hypot(px - b.x, py - b.y);
      if (d2 < this.nearest) this.nearest = d2;
      if (armed && !this.playerHidden && d2 < b.r + pr * 0.8) caught = true;
    }
    return caught;
  }

  private startChase(e: Enemy, index: number) {
    const calm = e.state === 'patrol' || e.state === 'lost';
    e.state = 'chase';
    e.repath = 0;
    e.noSight = 0;
    if (calm) {
      this.alertCount++;
      this.events.onAlert(index);
    }
  }

  private beginSearch(e: Enemy) {
    e.state = 'lost';
    e.search = ECHO_CONFIG.enemy.lostSearchSec;
    e.swayDir = 1;
    e.pathLen = 0;
    e.repath = 0;
  }

  private search(e: Enemy, dt: number) {
    const cfg = ECHO_CONFIG.enemy;
    e.search -= dt;
    if (e.search <= 0) {
      // back to the route: walk to the nearest waypoint through the nav grid, then resume the loop
      e.state = 'patrol';
      e.returning = true;
      e.wp = this.nearestWaypoint(e);
      e.pathLen = 0;
      e.dwell = 0;
      return;
    }
    const b = e.body;
    if ((e.pathLen === 0 || e.repath <= 0) && this.planBudget > 0) {
      // reach the last known spot first, then sway left and right of it
      this.planBudget--;
      this.plan(e);
      e.repath = 0.5;
    }
    e.repath -= dt;
    const atSpot = Math.hypot(e.tx - b.x, e.ty - b.y) < 14;
    if (atSpot) {
      e.tx += e.swayDir * cfg.searchSway;
      e.swayDir = -e.swayDir;
      e.pathLen = 0;
    }
    this.follow(e, dt, e.patrolSpeed * 1.4);
  }

  private nearestWaypoint(e: Enemy): number {
    let best = 0;
    let bd = Infinity;
    e.def.waypoints.forEach((w, i) => {
      const d = Math.hypot(w.x - e.body.x, w.y - e.body.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private patrol(e: Enemy, dt: number) {
    const w = e.def.waypoints;
    const b = e.body;
    if (w.length === 1 && !e.returning) {
      b.vx = 0;
      b.vy = 0;
      return;
    }
    // Time left in this step is carried across waypoint arrivals, so the integrated motion matches the
    // closed form exactly (no drift however many corners the hunter turns).
    let left = dt;
    while (left > 1e-9) {
      if (e.dwell > 0) {
        const use = Math.min(e.dwell, left);
        e.dwell -= use;
        left -= use;
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      const target = w[e.wp];
      if (e.returning) {
        e.tx = target.x;
        e.ty = target.y;
        if (e.pathLen === 0 && this.planBudget > 0) {
          this.planBudget--;
          this.plan(e);
        }
        this.follow(e, left, e.patrolSpeed);
        if (Math.hypot(target.x - b.x, target.y - b.y) < 6) {
          e.returning = false;
          e.dwell = ECHO_CONFIG.enemy.dwellSec;
          e.wp = (e.wp + 1) % w.length;
        }
        return;
      }
      const dx = target.x - b.x;
      const dy = target.y - b.y;
      const d = Math.hypot(dx, dy);
      const reach = e.patrolSpeed * left;
      if (d <= reach) {
        left -= d / e.patrolSpeed;
        b.x = target.x;
        b.y = target.y;
        b.vx = 0;
        b.vy = 0;
        e.dwell = ECHO_CONFIG.enemy.dwellSec;
        e.wp = (e.wp + 1) % w.length;
        continue;
      }
      b.vx = (dx / d) * e.patrolSpeed;
      b.vy = (dy / d) * e.patrolSpeed;
      b.x += b.vx * left;
      b.y += b.vy * left;
      left = 0;
    }
  }

  /** Plans a route to (tx, ty). */
  private plan(e: Enemy) {
    this.plansDone++;
    e.pathLen = this.nav.findPath(e.body.x, e.body.y, e.tx, e.ty, e.path);
    e.pathIdx = 0;
  }

  /** Walk to the target using a route computed on demand. */
  private goTo(e: Enemy, dt: number, speed: number) {
    if (e.pathLen === 0 && this.planBudget > 0) {
      this.planBudget--;
      this.plan(e);
    }
    this.follow(e, dt, speed);
  }

  /** Follows the planned route; with no route it walks straight at the target. */
  private follow(e: Enemy, dt: number, speed: number) {
    const b = e.body;
    let nx = e.tx;
    let ny = e.ty;
    if (e.pathLen > 0) {
      while (e.pathIdx < e.pathLen - 1 && Math.hypot(e.path[e.pathIdx * 2] - b.x, e.path[e.pathIdx * 2 + 1] - b.y) < 6) e.pathIdx++;
      nx = e.path[e.pathIdx * 2];
      ny = e.path[e.pathIdx * 2 + 1];
    }
    const dx = nx - b.x;
    const dy = ny - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      b.vx = 0;
      b.vy = 0;
      return;
    }
    const step = Math.min(speed * dt, d);
    b.vx = (dx / d) * speed;
    b.vy = (dy / d) * speed;
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
  }
}
