import { Vec2, WraithEntity, Rect, EnvObject } from '../types/game';
import { GAME_CONFIG } from '../constants/gameConfig';
import { Pathfinding } from '../maze/pathfinding';
import { NavGrid, cellOf } from './NavGrid';
import { CollisionSystem } from './CollisionSystem';

/** Everything an enemy needs to know about the world this frame. */
export interface HunterWorld {
  nav: NavGrid;
  walls: Rect[];
  objects: EnvObject[];
  playerPos: Vec2;
  playerRadius: number;
  worldW: number;
  worldH: number;
}

const DEG = Math.PI / 180;
const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Does the segment p→q pass through rect r? (Liang–Barsky clip) */
function segmentHitsRect(p: Vec2, q: Vec2, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - r.x],
    [dx, r.x + r.width - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.height - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/**
 * Enemy AI ("wraith").
 *  - IDLE (DORMANT): patrols slowly within a couple of cells of its post, pausing to sweep
 *    its red vision cone (HUNTER_PATROL_RADIUS = 0 makes it stand still).
 *  - It starts HUNTING when the bat is inside that cone with a clear line of sight
 *    (walls block its view), or when the bat comes very close in any direction (sense radius).
 *  - While hunting it path-finds through the real maze (water pits and laser barriers
 *    are impassable) and is pushed out of walls exactly like the bat.
 *  - When the bat gets far enough away it gives up and stays where it is.
 */
export class HunterAI {
  static create(anchor: Vec2, speedMultiplier: number = 1.0, nav?: NavGrid): WraithEntity {
    // start out looking down an open side of its cell, so the cone points along a corridor
    let facing = Math.random() * Math.PI * 2;
    if (nav) {
      // look down the longest straight open run from this cell, so the cone watches a corridor
      const start = cellOf(nav, anchor.x, anchor.y);
      const dirs: [number, number, number, 'right' | 'bottom' | 'left' | 'top'][] = [
        [1, 0, 0, 'right'],
        [0, 1, Math.PI / 2, 'bottom'],
        [-1, 0, Math.PI, 'left'],
        [0, -1, -Math.PI / 2, 'top'],
      ];
      let best = -1;
      for (const [dc, dr, ang, side] of dirs) {
        let c = start.col;
        let r = start.row;
        let run = 0;
        while (!nav.grid[r][c].walls[side]) {
          c += dc;
          r += dr;
          run++;
          if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) break;
        }
        if (run > best) {
          best = run;
          facing = ang;
        }
      }
    }
    return {
      id: `wraith_${Date.now()}_${Math.random()}`,
      pos: { ...anchor },
      velocity: { x: 0, y: 0 },
      radius: GAME_CONFIG.HUNTER_RADIUS,
      speed: GAME_CONFIG.PLAYER_SPEED * GAME_CONFIG.HUNTER_SPEED_RATIO * speedMultiplier,
      state: 'DORMANT',
      targetPos: null,
      patrolAnchor: { ...anchor },
      searchTimer: 0,
      frenzyTimer: 0,
      revealedAt: 0,
      revealStrength: 0,
      lastBreatheTime: Date.now(),
      facing,
      baseFacing: facing,
      sweepSeed: Math.random() * 10,
      path: [],
      repathAt: 0,
      patrolTarget: null,
      pauseUntil: Date.now() + 1500 + Math.random() * 2000,
    };
  }

  /** Is the bat close enough to be sensed in any direction (no line of sight needed)? */
  static senses(w: WraithEntity, playerPos: Vec2): boolean {
    return Math.hypot(playerPos.x - w.pos.x, playerPos.y - w.pos.y) <= GAME_CONFIG.HUNTER_SENSE_RADIUS;
  }

  /** Is the bat inside this enemy's red cone, with nothing blocking the view? */
  static canSee(w: WraithEntity, playerPos: Vec2, playerRadius: number, walls: Rect[]): boolean {
    const dx = playerPos.x - w.pos.x;
    const dy = playerPos.y - w.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GAME_CONFIG.HUNTER_VISION_RANGE + playerRadius * 0.6) return false;
    if (dist > 1) {
      const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - w.facing));
      // the bat's body counts, not just its centre
      const allowance = Math.atan2(playerRadius * 0.6, dist);
      if (off > GAME_CONFIG.HUNTER_VISION_HALF_ANGLE * DEG + allowance) return false;
    }
    for (const r of walls) if (segmentHitsRect(w.pos, playerPos, r)) return false;
    return true;
  }

  /** Moves an enemy one step along the maze toward `goalCell` (or `goalPos` when in the same cell). */
  private static stepToward(
    w: WraithEntity,
    world: HunterWorld,
    goalCell: { col: number; row: number },
    goalPos: Vec2,
    speed: number,
    dt: number,
    now: number
  ): 'moving' | 'arrived' | 'blocked' {
    const nav = world.nav;
    const here = cellOf(nav, w.pos.x, w.pos.y);
    const centre = (c: { col: number; row: number }): Vec2 => ({ x: (c.col + 0.5) * nav.cellW, y: (c.row + 0.5) * nav.cellH });
    if (now >= w.repathAt || !w.path.length) {
      w.path = Pathfinding.aStar(nav.grid, here, goalCell);
      w.repathAt = now + GAME_CONFIG.HUNTER_REPATH_MS;
    }
    let target: Vec2;
    if (here.col === goalCell.col && here.row === goalCell.row) {
      target = goalPos;
    } else {
      const idx = w.path.findIndex((c) => c.col === here.col && c.row === here.row);
      const next = idx >= 0 && idx + 1 < w.path.length ? w.path[idx + 1] : null;
      if (!next) {
        w.repathAt = 0;
        return 'blocked';
      }
      // line up with the corridor first, so it never cuts a corner into a wall or hazard
      const c = centre(here);
      const alignX = next.col !== here.col && Math.abs(w.pos.y - c.y) > 2.5;
      const alignY = next.row !== here.row && Math.abs(w.pos.x - c.x) > 2.5;
      target = alignX || alignY ? c : centre(next);
    }
    const dx = target.x - w.pos.x;
    const dy = target.y - w.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.8) {
      w.velocity = { x: 0, y: 0 };
      return here.col === goalCell.col && here.row === goalCell.row ? 'arrived' : 'moving';
    }
    const step = Math.min(d, speed * dt);
    const before = { x: w.pos.x, y: w.pos.y };
    const res = CollisionSystem.resolvePlayerMovement(
      w.pos,
      { x: (dx / d) * step, y: (dy / d) * step },
      GAME_CONFIG.HUNTER_BODY_RADIUS,
      world.walls,
      world.objects,
      world.worldW,
      world.worldH
    );
    w.pos = res.newPos;
    w.velocity = dt > 0 ? { x: (w.pos.x - before.x) / dt, y: (w.pos.y - before.y) / dt } : { x: 0, y: 0 };
    w.facing = Math.atan2(dy, dx);
    return 'moving';
  }

  /** Picks a random reachable cell within HUNTER_PATROL_RADIUS steps of the enemy's post. */
  private static pickPatrolCell(w: WraithEntity, nav: NavGrid): { col: number; row: number } | null {
    const R = GAME_CONFIG.HUNTER_PATROL_RADIUS;
    if (R <= 0) return null;
    const post = cellOf(nav, w.patrolAnchor.x, w.patrolAnchor.y);
    const here = cellOf(nav, w.pos.x, w.pos.y);
    const dist = Pathfinding.bfsDistances(nav.grid, post);
    const options: { col: number; row: number }[] = [];
    dist.forEach((d, k) => {
      if (d > R) return;
      const [col, row] = k.split(',').map(Number);
      if (col === here.col && row === here.row) return;
      options.push({ col, row });
    });
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  /** Advances one enemy. Returns `spotted: true` on the frame it first sees the bat. */
  static update(w: WraithEntity, world: HunterWorld, dt: number, now: number): { spotted: boolean } {
    const nav = world.nav;
    if (w.state !== 'HUNTING') {
      w.state = 'DORMANT';
      if (this.senses(w, world.playerPos) || this.canSee(w, world.playerPos, world.playerRadius, world.walls)) {
        w.state = 'HUNTING';
        w.repathAt = 0;
        w.lastSeenAt = now;
        w.patrolTarget = null;
        return { spotted: true };
      }
      // idle patrol: drift slowly between nearby cells, pausing at each to sweep the cone
      if (w.patrolTarget) {
        const tgt = w.patrolTarget;
        const res = this.stepToward(w, world, tgt, { x: (tgt.col + 0.5) * nav.cellW, y: (tgt.row + 0.5) * nav.cellH }, w.speed * GAME_CONFIG.HUNTER_PATROL_SPEED, dt, now);
        if (res !== 'moving') {
          w.patrolTarget = null;
          w.pauseUntil = now + 1400 + Math.random() * 1600;
          w.baseFacing = w.facing;
          w.sweepSeed = -now * 0.0012;
          w.velocity = { x: 0, y: 0 };
        }
        return { spotted: false };
      }
      w.velocity = { x: 0, y: 0 };
      w.facing = w.baseFacing + Math.sin(now * 0.0012 + w.sweepSeed) * GAME_CONFIG.HUNTER_SWEEP_DEG * DEG;
      if (now >= (w.pauseUntil ?? 0)) {
        w.patrolTarget = this.pickPatrolCell(w, nav);
        w.repathAt = 0;
        if (!w.patrolTarget) w.pauseUntil = now + 3000;
      }
      return { spotted: false };
    }

    // hunting: keep track of contact (sight toward the bat, or sensing it close by)
    const dist = Math.hypot(world.playerPos.x - w.pos.x, world.playerPos.y - w.pos.y);
    const chaseView = { ...w, facing: Math.atan2(world.playerPos.y - w.pos.y, world.playerPos.x - w.pos.x) };
    if (this.senses(w, world.playerPos) || this.canSee(chaseView, world.playerPos, world.playerRadius, world.walls)) {
      w.lastSeenAt = now;
    }
    const forgot = now - (w.lastSeenAt ?? now) > GAME_CONFIG.HUNTER_FORGET_MS;
    if (dist > GAME_CONFIG.HUNTER_LOSE_DISTANCE || forgot) {
      // give up and stay around where it is now
      w.state = 'DORMANT';
      w.patrolAnchor = { x: w.pos.x, y: w.pos.y };
      w.baseFacing = w.facing;
      w.sweepSeed = -now * 0.0012;
      w.velocity = { x: 0, y: 0 };
      w.path = [];
      w.patrolTarget = null;
      w.pauseUntil = now + 2500;
      return { spotted: false };
    }

    const there = cellOf(nav, world.playerPos.x, world.playerPos.y);
    const res = this.stepToward(w, world, there, world.playerPos, w.speed, dt, now);
    if (res === 'blocked') {
      // no route (e.g. the bat is across water or behind a locked barrier): wait, watching
      w.velocity = { x: 0, y: 0 };
      w.facing = Math.atan2(world.playerPos.y - w.pos.y, world.playerPos.x - w.pos.x);
    }
    return { spotted: false };
  }

  /**
   * Calculate edge screen red distortion position and intensity
   * so the player feels the threat without seeing the Wraith directly.
   */
  static getDistortionInfo(
    wraith: WraithEntity,
    playerPos: Vec2,
    screenWidth: number,
    screenHeight: number
  ): {
    active: boolean;
    intensity: number;
    angleRad: number;
    edgeX: number;
    edgeY: number;
  } {
    const dist = Math.hypot(wraith.pos.x - playerPos.x, wraith.pos.y - playerPos.y);
    const maxDist = 320;

    if (dist > maxDist) {
      return { active: false, intensity: 0, angleRad: 0, edgeX: 0, edgeY: 0 };
    }

    const intensity = Math.pow(1.0 - dist / maxDist, 1.5) * (wraith.state === 'FRENZY' ? 1.4 : 1.0);
    const angleRad = Math.atan2(wraith.pos.y - playerPos.y, wraith.pos.x - playerPos.x);

    // Compute edge screen coordinate for directional red flare
    const cx = screenWidth / 2;
    const cy = screenHeight / 2;
    const edgeX = cx + Math.cos(angleRad) * (cx - 16);
    const edgeY = cy + Math.sin(angleRad) * (cy - 24);

    return {
      active: true,
      intensity: Math.min(1.0, intensity),
      angleRad,
      edgeX,
      edgeY,
    };
  }
}
