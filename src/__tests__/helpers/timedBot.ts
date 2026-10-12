import { ECHO_CONFIG } from '../../constants/gameConfig';
import { LevelDef } from '../../levels/schema';
import { distanceToBox } from '../../sim/collision';
import { enemyChaseSpeed, patrolInfo, PatrolInfo } from '../../sim/enemy';
import { GameSim, SimParams } from '../../sim/game';
import { circleHitsHazard, hazardPose, HazardPose, segmentHitsBox } from '../../sim/hazards';
import { buildWorld, World } from '../../sim/world';
import { Pt } from './levelBot';

/**
 * Test tooling for levels with moving hazards, switches and timed doors.
 * Plans a route through SPACE AND TIME (when is it safe to cross?), pulses at switches, respects how long
 * each door really stays open, then flies the plan in the real GameSim and reports what happened.
 */

const CELL = 10;
const DT = 0.1; // planning time step (s)
const PLAYER_R = ECHO_CONFIG.player.radius;
/** Clearance the planner keeps from walls; hazards get a little more because they move. */
const WALL_R = PLAYER_R + 6;
const HAZ_R = PLAYER_R + 8;
const PULSE_REACH = 110; // plan to pulse from this close to a switch

/**
 * stealth: stay out of every hunter's reach and never be heard (no pulses near them).
 * loud: fly the same safe route but pulse freely every second, so the hunters hear it, leave their patrol and
 * chase; the bot must still reach the finish (the hunters are slower and the route is open).
 */
export type EnemyMode = 'stealth' | 'loud';

interface Segment {
  goal: (c: number, r: number, k: number) => boolean;
  /** Longest plan, in steps. */
  maxSteps: number;
}

export interface TimedRun {
  finished: boolean;
  timeSec: number;
  deaths: number;
  pulses: number;
  failedAt?: string;
  /** Where the bat was about every 1.5 s, and when it pulsed (the documented solution). */
  trace: { t: number; x: number; y: number }[];
  pulseTimes: number[];
  alerts: number;
  ghost: boolean;
}

function doorBlocksAt(world: World, doorTimer: Float32Array, di: number, tPlan: number): boolean {
  return tPlan >= doorTimer[di];
}

/** Plans one segment starting from the sim's current position, time and door state. Returns positions per step. */
function plan(world: World, sim: GameSim, seg: Segment, mode: EnemyMode = 'stealth'): Pt[] | null {
  const def = world.def;
  const cols = Math.ceil(def.width / CELL);
  const rows = Math.ceil(def.height / CELL);
  const poses: HazardPose[] = world.hazards.map(() => ({ x: 0, y: 0, angle: 0 }));
  const info: PatrolInfo = { x: 0, y: 0, wp: 0, dwell: 0 };
  const patrolSpeeds = world.enemies.map((e) => enemyChaseSpeed(e) * ECHO_CONFIG.enemy.patrolSpeedFactor);
  const avoid = ECHO_CONFIG.enemy.senseRadius + 45; // keep well outside the hunters' sensing zones
  const t0 = sim.elapsed;
  const doorTimer = sim.doorTimer;

  const staticFree = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      let ok = x >= WALL_R && y >= WALL_R && x <= def.width - WALL_R && y <= def.height - WALL_R;
      for (let i = 0; ok && i < world.solids.length; i++) if (distanceToBox(x, y, world.solids[i]) < WALL_R) ok = false;
      for (let i = 0; ok && i < world.spikes.length; i++) if (distanceToBox(x, y, world.spikes[i]) < WALL_R + 4) ok = false;
      staticFree[r * cols + c] = ok ? 1 : 0;
    }
  }

  const freeAt = (c: number, r: number, k: number): boolean => {
    if (!staticFree[r * cols + c]) return false;
    const x = c * CELL + CELL / 2;
    const y = r * CELL + CELL / 2;
    const tp = k * DT;
    for (let di = 0; di < world.doors.length; di++) {
      if (doorBlocksAt(world, doorTimer, di, tp) && distanceToBox(x, y, world.doors[di]) < WALL_R) return false;
    }
    {
      for (let ei = 0; ei < world.enemies.length; ei++) {
        for (const dt of [0, -DT / 2, DT / 2]) {
          patrolInfo(world.enemies[ei], t0 + tp + dt, patrolSpeeds[ei], info);
          if (Math.hypot(info.x - x, info.y - y) < avoid) return false;
        }
      }
    }
    // moving hazards: check this step and the half step before, so nothing is swept through
    for (let h = 0; h < world.hazards.length; h++) {
      for (const dt of [0, -DT / 2, DT / 2]) {
        const p = hazardPose(world.hazards[h], t0 + tp + dt, poses[h]);
        if (circleHitsHazard(world.hazards[h], p, x, y, HAZ_R, 0)) return false;
      }
    }
    return true;
  };

  const sc = Math.min(cols - 1, Math.floor(sim.body.x / CELL));
  const sr = Math.min(rows - 1, Math.floor(sim.body.y / CELL));
  const steps = seg.maxSteps;
  const idx = (c: number, r: number, k: number) => (k * rows + r) * cols + c;
  const prev = new Int32Array((steps + 1) * rows * cols).fill(-2);
  const queue = new Int32Array((steps + 1) * rows * cols);
  let head = 0;
  let tail = 0;
  prev[idx(sc, sr, 0)] = -1;
  queue[tail++] = idx(sc, sr, 0);
  const moves = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = -1;
  while (head < tail) {
    const cur = queue[head++];
    const c = cur % cols;
    const r = Math.floor(cur / cols) % rows;
    const k = Math.floor(cur / (cols * rows));
    if (seg.goal(c, r, k)) {
      found = cur;
      break;
    }
    if (k >= steps) continue;
    for (const [dc, dr] of moves) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = idx(nc, nr, k + 1);
      if (prev[ni] !== -2) continue;
      if (dc && dr && (!staticFree[r * cols + nc] || !staticFree[nr * cols + c])) continue;
      if (!freeAt(nc, nr, k + 1)) continue;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  if (found < 0) return null;
  const out: Pt[] = [];
  for (let at = found; at !== -1; at = prev[at]) {
    out.push({ x: (at % cols) * CELL + CELL / 2, y: (Math.floor(at / cols) % rows) * CELL + CELL / 2 });
  }
  return out.reverse();
}

/** Flies a planned segment in real time, steering to where the plan says the bat should be. */
function follow(sim: GameSim, path: Pt[], limitSteps: number, noisyEverySec = 0, noiseFrom = 0): void {
  const t0 = sim.elapsed;
  let nextNoise = 0;
  for (let i = 0; i < limitSteps; i++) {
    if (sim.status !== 'playing') return;
    const k = (sim.elapsed - t0) / DT;
    const target = path[Math.min(path.length - 1, Math.floor(k) + 2)];
    const dx = target.x - sim.body.x;
    const dy = target.y - sim.body.y;
    const d = Math.hypot(dx, dy);
    const gain = Math.min(1, d / 18);
    sim.setInput(d > 0.5 ? (dx / d) * gain : 0, d > 0.5 ? (dy / d) * gain : 0);
    // loud mode: keep pulsing once the spawn safe window is over, so every hunter in range hears it
    if (noisyEverySec > 0 && sim.elapsed >= Math.max(noiseFrom, ECHO_CONFIG.enemy.spawnSafeSec + 0.1) && sim.elapsed >= nextNoise) {
      sim.firePulse();
      nextNoise = sim.elapsed + noisyEverySec;
    }
    sim.step(1 / 60);
    if (k >= path.length + 1) break;
  }
}

const losClear = (world: World, ax: number, ay: number, bx: number, by: number) =>
  !world.solids.some((s) => segmentHitsBox(ax, ay, bx, by, s));

export interface LoudVariant {
  /** Seconds to wait at the start before moving. */
  startDelay: number;
  /** Seconds between pulses once the noise begins. */
  noiseEvery: number;
  /** Attempt time at which the noise begins. */
  noiseFrom: number;
}

export function flyTimed(def: LevelDef, params: Partial<SimParams> = {}, mode: EnemyMode = 'stealth', variant: LoudVariant = { startDelay: 0, noiseEvery: 1, noiseFrom: 0 }): TimedRun {
  const world = buildWorld(def, ECHO_CONFIG.world.wallSegmentLen);
  const sim = new GameSim(world, { pulseRadius: 150, ...params });
  let deaths = 0;
  const trace: TimedRun['trace'] = [];
  const pulseTimes: number[] = [];
  let nextSample = 0;
  sim.onEvent = (e) => {
    if (e === 'death') deaths++;
    if (e === 'pulse') pulseTimes.push(Math.round(sim.elapsed * 10) / 10);
  };
  // sample the bat's position as the run goes on, whoever steps the sim
  const rawStep = sim.step.bind(sim);
  sim.step = (dt: number) => {
    rawStep(dt);
    if (sim.elapsed >= nextSample) {
      trace.push({ t: Math.round(sim.elapsed * 10) / 10, x: Math.round(sim.body.x), y: Math.round(sim.body.y) });
      nextSample = sim.elapsed + 1.5;
    }
  };
  const cols = Math.ceil(def.width / CELL);
  const infoScratch: PatrolInfo = { x: 0, y: 0, wp: 0, dwell: 0 };
  const patrolSpeeds = world.enemies.map((e) => enemyChaseSpeed(e) * ECHO_CONFIG.enemy.patrolSpeedFactor);
  const noisy = mode === 'loud' ? variant.noiseEvery : 0;
  const noiseFrom = variant.noiseFrom;
  // optional wait before leaving (hunters keep patrolling meanwhile)
  for (let i = 0; i < Math.round(variant.startDelay * 60); i++) sim.step(1 / 60);
  const result = (finished: boolean, failedAt?: string): TimedRun => ({
    finished,
    timeSec: sim.elapsed,
    deaths,
    pulses: sim.pulsesUsed,
    failedAt,
    trace,
    pulseTimes,
    alerts: sim.alertCount,
    ghost: finished && sim.isGhostRun,
  });

  // 1. every switch in turn: go to a spot with a clear view of it, pulse
  const order = [...world.switches].sort((a, b) => a.id.localeCompare(b.id));
  for (const sw of order) {
    const alreadyOpen = world.doorSwitch.some((s, di) => world.switches[s] === sw && sim.doorTimer[di] > 0.5);
    if (alreadyOpen) continue;
    const quietRange = Math.max(sim.hearingRadius, ECHO_CONFIG.enemy.switchNoiseRadius) + 25;
    const goal = (c: number, r: number, k: number) => {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      if (Math.hypot(x - sw.x, y - sw.y) > PULSE_REACH || !losClear(world, x, y, sw.x, sw.y)) return false;
      if (mode === 'stealth') {
        // the pulse and the switch click must not be heard by any hunter at that moment
        for (let ei = 0; ei < world.enemies.length; ei++) {
          patrolInfo(world.enemies[ei], sim.elapsed + k * DT, patrolSpeeds[ei], infoScratch);
          if (Math.hypot(infoScratch.x - x, infoScratch.y - y) < quietRange) return false;
        }
      }
      return true;
    };
    const path = plan(world, sim, { goal, maxSteps: 240 }, mode);
    if (!path) return result(false, `no safe route to switch ${sw.id}`);
    follow(sim, path, (path.length + 4) * 6, noisy, noiseFrom);
    if (sim.status !== 'playing') return result(false, `died on the way to switch ${sw.id}`);
    sim.setInput(0, 0);
    // let the bat settle, then pulse
    for (let i = 0; i < 12; i++) sim.step(1 / 60);
    if (!sim.firePulse()) return result(false, 'no charge left for a switch pulse');
    for (let i = 0; i < 24; i++) sim.step(1 / 60);
    // the pulse must really have opened a door (otherwise the level is not solvable the way it is built)
    if (!world.doorSwitch.some((s, di) => world.switches[s] === sw && sim.doorTimer[di] > 0)) return result(false, `pulse did not trigger switch ${sw.id}`);
  }

  // 2. the finish
  const fc = Math.min(cols - 1, Math.floor(world.finish.x / CELL));
  const fr = Math.floor(world.finish.y / CELL);
  const path = plan(world, sim, { goal: (c, r) => c === fc && r === fr, maxSteps: 300 }, mode);
  if (!path) return result(false, 'no safe route to the finish (door timers or hazards block every way)');
  follow(sim, path, (path.length + 8) * 6, noisy, noiseFrom);
  for (let i = 0; i < 120 && sim.status === 'playing'; i++) {
    sim.setInput((world.finish.x - sim.body.x) / 40, (world.finish.y - sim.body.y) / 40);
    sim.step(1 / 60);
  }
  return result(sim.status === 'won', sim.status === 'won' ? undefined : 'did not reach the finish');
}

export interface LoudSolution extends TimedRun {
  variant: LoudVariant;
  tried: number;
}

/**
 * Searches for a LOUD solution: a way to reach the finish after the hunters were alerted (at least one alert).
 * The simulation is deterministic, so trying departure delays and noise patterns is a valid existence proof.
 */
export function findLoudSolution(def: LevelDef, params: Partial<SimParams> = {}): LoudSolution | null {
  let tried = 0;
  for (const noiseEvery of [1, 2]) {
    for (const noiseFrom of [3.2, 5, 7, 9]) {
      for (const startDelay of [0, 1, 2, 3, 4, 5, 6, 8, 10]) {
        tried++;
        const variant = { startDelay, noiseEvery, noiseFrom };
        const r = flyTimed(def, params, 'loud', variant);
        if (r.finished && r.deaths === 0 && r.alerts > 0) return { ...r, variant, tried };
      }
    }
  }
  return null;
}
