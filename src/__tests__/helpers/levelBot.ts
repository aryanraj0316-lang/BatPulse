import { ECHO_CONFIG } from '../../constants/gameConfig';
import { LevelDef } from '../../levels/schema';
import { distanceToBox } from '../../sim/collision';
import { GameSim, SimParams } from '../../sim/game';
import { buildWorld, World } from '../../sim/world';

/**
 * Test tooling: finds a safe route through a level and flies it through the REAL simulation.
 * This is how every level is proven completable, with its solution path and best-case time on record.
 */

export interface Pt {
  x: number;
  y: number;
}

const CELL = 5;
/** Extra clearance beyond the bat's radius, so the route is comfortable and not a pixel-perfect squeeze. */
const MARGIN = 6;

function clearanceOk(world: World, x: number, y: number, r: number): boolean {
  const def = world.def;
  if (x < r || y < r || x > def.width - r || y > def.height - r) return false;
  for (const b of world.solids) if (distanceToBox(x, y, b) < r) return false;
  for (const b of world.spikes) if (distanceToBox(x, y, b) < r + 4) return false;
  return true;
}

/** Shortest safe route from start to finish as a list of waypoints, or null when none exists. */
export function findRoute(world: World, margin: number = MARGIN): Pt[] | null {
  const def = world.def;
  const r = ECHO_CONFIG.player.radius + margin;
  const cols = Math.ceil(def.width / CELL);
  const rows = Math.ceil(def.height / CELL);
  const idx = (c: number, rr: number) => rr * cols + c;
  const free = new Uint8Array(cols * rows);
  for (let rr = 0; rr < rows; rr++)
    for (let c = 0; c < cols; c++) free[idx(c, rr)] = clearanceOk(world, c * CELL + CELL / 2, rr * CELL + CELL / 2, r) ? 1 : 0;

  const cell = (p: Pt) => ({ c: Math.min(cols - 1, Math.floor(p.x / CELL)), r: Math.min(rows - 1, Math.floor(p.y / CELL)) });
  const s = cell(def.start);
  // aim for the middle of the ring, which is always inside the finish radius
  const f = cell(world.finish);
  const prev = new Int32Array(cols * rows).fill(-1);
  const dist = new Float32Array(cols * rows).fill(Infinity);
  // Dijkstra with a simple binary heap would be faster, but levels are tiny; a bucketed queue is plenty.
  const open: number[] = [idx(s.c, s.r)];
  dist[idx(s.c, s.r)] = 0;
  const nb = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === idx(f.c, f.r)) break;
    const cc = cur % cols;
    const cr = Math.floor(cur / cols);
    for (const [dc, dr, w] of nb) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = idx(nc, nr);
      if (!free[ni]) continue;
      // no cutting corners diagonally
      if (dc !== 0 && dr !== 0 && (!free[idx(cc + dc, cr)] || !free[idx(cc, cr + dr)])) continue;
      const nd = dist[cur] + w;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        open.push(ni);
      }
    }
  }
  const goal = idx(f.c, f.r);
  if (!isFinite(dist[goal])) return null;

  const raw: Pt[] = [];
  for (let at = goal; at !== -1; at = prev[at]) raw.push({ x: (at % cols) * CELL + CELL / 2, y: Math.floor(at / cols) * CELL + CELL / 2 });
  raw.reverse();
  raw[0] = { x: def.start.x, y: def.start.y };
  raw[raw.length - 1] = { x: world.finish.x, y: world.finish.y };
  return smooth(world, raw, r);
}

/** String-pulling: drop waypoints whenever a straight line with full clearance exists. */
function smooth(world: World, pts: Pt[], r: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineClear(world, pts[i], pts[j], r)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function lineClear(world: World, a: Pt, b: Pt, r: number): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / 2));
  for (let k = 0; k <= n; k++) {
    if (!clearanceOk(world, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, r)) return false;
  }
  return true;
}

export interface RunResult {
  finished: boolean;
  timeSec: number;
  deaths: number;
  wallHits: number;
  pulses: number;
  maxMomentum: number;
  route: Pt[];
}

/**
 * Flies the route in the real GameSim at 60 Hz with pure-pursuit steering.
 * `pulseEverySec` > 0 makes the bot fire pulses as a player would.
 */
export function flyLevel(def: LevelDef, params: Partial<SimParams> = {}, opts: { limitSec?: number; pulseEverySec?: number } = {}): RunResult {
  const world = buildWorld(def, ECHO_CONFIG.world.wallSegmentLen);
  const route = findRoute(world);
  if (!route) return { finished: false, timeSec: 0, deaths: 0, wallHits: 0, pulses: 0, maxMomentum: 1, route: [] };

  const sim = new GameSim(world, { pulseRadius: 150, ...params });
  let deaths = 0;
  let wallHits = 0;
  sim.onEvent = (e) => {
    if (e === 'death') deaths++;
    if (e === 'wall_hit') wallHits++;
  };

  const limit = opts.limitSec ?? 240;
  const dt = 1 / 60;
  let leg = 1;
  let nextPulse = 0;
  let t = 0;
  while (sim.status !== 'won' && t < limit) {
    const b = sim.body;
    while (leg < route.length - 1 && Math.hypot(route[leg].x - b.x, route[leg].y - b.y) < 24) leg++;
    const target = route[leg];
    const dx = target.x - b.x;
    const dy = target.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    sim.setInput(dx / d, dy / d);
    if (opts.pulseEverySec && t >= nextPulse) {
      sim.firePulse();
      nextPulse = t + opts.pulseEverySec;
    }
    sim.step(dt);
    t += dt;
  }
  return { finished: sim.status === 'won', timeSec: sim.elapsed, deaths, wallHits, pulses: sim.pulsesUsed, maxMomentum: sim.momentum.best, route };
}
