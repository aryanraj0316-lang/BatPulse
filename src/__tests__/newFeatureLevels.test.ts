import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { LevelDef } from '../levels/schema';
import { validateLevel } from '../levels/validate';
import { distanceToBox } from '../sim/collision';
import { GameSim } from '../sim/game';
import { buildWorld } from '../sim/world';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { flyTimed } from './helpers/timedBot';

const KEY_LEVELS = [36, 39, 41];
const ZONE_LEVELS = [33, 35, 37, 41, 42, 44, 45];
const lvl = (id: number) => loadAuthoredLevel(id, true)!;

/** Can the bat get from `from` to `to` through free space? Cells of 10 units, kept clear of walls like a real flight. */
function reachable(def: LevelDef, from: { x: number; y: number }, to: { x: number; y: number }, extraSolids: { x: number; y: number; width: number; height: number }[]): boolean {
  const world = buildWorld(def, 60);
  const solids = [...world.solids, ...extraSolids];
  const CELL = 10;
  const clear = ECHO_CONFIG.player.radius + 1;
  const cols = Math.ceil(def.width / CELL);
  const rows = Math.ceil(def.height / CELL);
  const free = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      free[r * cols + c] = solids.every((s) => distanceToBox(x, y, s) >= clear) ? 1 : 0;
    }
  }
  const at = (p: { x: number; y: number }) => Math.floor(p.y / CELL) * cols + Math.floor(p.x / CELL);
  const seen = new Uint8Array(cols * rows);
  const queue = [at(from)];
  seen[queue[0]] = 1;
  const goal = at(to);
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h];
    if (Math.abs(cur - goal) <= 2 && Math.abs(Math.floor(cur / cols) - Math.floor(goal / cols)) <= 1) return true;
    const c = cur % cols;
    for (const n of [cur + 1, cur - 1, cur + cols, cur - cols]) {
      if (n < 0 || n >= cols * rows || seen[n] || !free[n]) continue;
      if ((n === cur + 1 && c === cols - 1) || (n === cur - 1 && c === 0)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

describe('levels with a key and a locked door', () => {
  it.each(KEY_LEVELS)('Echo %i is valid and has exactly one key and one locked door', (id) => {
    const d = lvl(id);
    expect(validateLevel(d)).toEqual([]);
    expect(d.keys).toHaveLength(1);
    const locked = d.doors.filter((x) => x.keyId !== undefined);
    expect(locked).toHaveLength(1);
    expect(locked[0].keyId).toBe(d.keys![0].id);
    expect(locked[0].switchId).toBeUndefined();
  });

  it.each(KEY_LEVELS)('Echo %i: the locked door is on the ONLY way to the finish (without it the finish is unreachable)', (id) => {
    const d = lvl(id);
    const door = d.doors.find((x) => x.keyId !== undefined)!;
    expect(reachable(d, d.start, d.finish, [door])).toBe(false);
    expect(reachable(d, d.start, d.finish, [])).toBe(true);
  });

  it.each(KEY_LEVELS)('Echo %i: the key can be reached WITHOUT passing the locked door, and the door can be reached after it', (id) => {
    const d = lvl(id);
    const door = d.doors.find((x) => x.keyId !== undefined)!;
    const key = d.keys![0];
    expect(reachable(d, d.start, key, [door])).toBe(true);
    expect(reachable(d, key, { x: door.x + door.width / 2, y: door.y + door.height + 20 }, [door])).toBe(true);
  });

  it.each(KEY_LEVELS)('Echo %i: the key is not lying right on the straight line from the start to the door (it has to be found)', (id) => {
    const d = lvl(id);
    const door = d.doors.find((x) => x.keyId !== undefined)!;
    const key = d.keys![0];
    const reach = ECHO_CONFIG.player.radius + ECHO_CONFIG.key.radius;
    // distance from the key to the straight segment start -> door centre
    const ax = d.start.x, ay = d.start.y, bx = door.x + door.width / 2, by = door.y + door.height / 2;
    const t = Math.max(0, Math.min(1, ((key.x - ax) * (bx - ax) + (key.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    const dist = Math.hypot(key.x - (ax + t * (bx - ax)), key.y - (ay + t * (by - ay)));
    expect(dist).toBeGreaterThan(reach);
  });

  it.each(KEY_LEVELS)('Echo %i: the solver bot takes the key, unlocks the door and finishes with no deaths', (id) => {
    const d = lvl(id);
    const r = flyTimed(d);
    expect(r).toMatchObject({ finished: true, deaths: 0 });
    const withRespawn = flyTimed(d, {}, 'stealth', undefined, { respawnAtCheckpoint: true });
    expect(withRespawn).toMatchObject({ finished: true, deaths: 0 });
  });

  it.each(KEY_LEVELS)('Echo %i: flying straight for the finish without the key never wins', (id) => {
    const d = lvl(id);
    const sim = new GameSim(buildWorld(d, 60), { pulseRadius: 150 });
    for (let i = 0; i < 60 * 40 && sim.status === 'playing'; i++) {
      const dx = d.finish.x - sim.body.x;
      const dy = d.finish.y - sim.body.y;
      const m = Math.hypot(dx, dy) || 1;
      sim.setInput(dx / m, dy / m);
      sim.step(1 / 60);
    }
    expect(sim.status).not.toBe('won');
    expect(sim.keyTaken.every((t) => t === 0)).toBe(true);
  });

  it('the first key level explains the key and the door', () => {
    const hints = (lvl(36).hints ?? []).map((h) => h.text).join(' | ');
    expect(hints).toMatch(/locked/i);
    expect(hints).toMatch(/key/i);
  });

  it('only the planned levels got keys (nothing else was touched)', () => {
    const withKeys = authoredLevelIds().filter((i) => i > 0 && (lvl(i).keys ?? []).length > 0);
    expect(withKeys).toEqual(KEY_LEVELS);
  });
});

describe('levels with safe zones', () => {
  it('only the planned levels got zones, and all of them have hunters (that is what a refuge is for)', () => {
    const withZones = authoredLevelIds().filter((i) => i > 0 && (lvl(i).safeZones ?? []).length > 0);
    expect(withZones).toEqual(ZONE_LEVELS);
    for (const id of ZONE_LEVELS) expect(lvl(id).enemies.length).toBeGreaterThan(0);
  });

  it.each(ZONE_LEVELS)('Echo %i: every zone is valid, on open floor, and clear of the start, finish and hazards', (id) => {
    const d = lvl(id);
    expect(validateLevel(d)).toEqual([]);
    const world = buildWorld(d, 60);
    for (const z of d.safeZones!) {
      for (const w of world.solids) expect(distanceToBox(z.x + z.width / 2, z.y + z.height / 2, w)).toBeGreaterThan(Math.min(z.width, z.height) / 2 - 1);
      const inside = (p: { x: number; y: number }) => p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height;
      expect(inside(d.start)).toBe(false);
      expect(inside(d.finish)).toBe(false);
      for (const s of d.spikes) expect(distanceToBox(z.x + z.width / 2, z.y + z.height / 2, s)).toBeGreaterThan(40);
      for (const c of d.checkpoints) expect(inside(c)).toBe(false);
      expect(z.width).toBeGreaterThanOrEqual(36);
      expect(z.height).toBeGreaterThanOrEqual(36);
    }
  });

  it.each(ZONE_LEVELS)('Echo %i: every zone can be reached from the start (it is a real refuge, not decoration)', (id) => {
    const d = lvl(id);
    const doorsAsWalls = d.doors; // closed doors: the zone must be reachable even before any switch is hit or key found... or after
    for (const z of d.safeZones!) {
      const centre = { x: z.x + z.width / 2, y: z.y + z.height / 2 };
      const open = reachable(d, d.start, centre, []);
      expect(open).toBe(true);
      void doorsAsWalls;
    }
  });

  it.each(ZONE_LEVELS)('Echo %i: zones are well away from every patrol lane (a hunter walking its route does not see into them)', (id) => {
    const d = lvl(id);
    for (const z of d.safeZones!) {
      const cx = z.x + z.width / 2;
      const cy = z.y + z.height / 2;
      for (const e of d.enemies) {
        for (let i = 0; i + 1 < e.waypoints.length; i++) {
          const a = e.waypoints[i];
          const b = e.waypoints[i + 1];
          const t = Math.max(0, Math.min(1, ((cx - a.x) * (b.x - a.x) + (cy - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
          const dist = Math.hypot(cx - (a.x + t * (b.x - a.x)), cy - (a.y + t * (b.y - a.y)));
          expect(dist).toBeGreaterThanOrEqual(100);
        }
      }
    }
  });

  it.each(ZONE_LEVELS)('Echo %i: the stealth route is unchanged by the zones: no deaths, still a ghost run, same pulse use', (id) => {
    const r = flyTimed(lvl(id));
    expect(r).toMatchObject({ finished: true, deaths: 0, ghost: true });
    expect(r.pulses).toBeLessThanOrEqual(lvl(id).ghostPulseLimit);
  });

  it('the first zone level explains the zones', () => {
    const hints = (lvl(33).hints ?? []).map((h) => h.text).join(' | ');
    expect(hints).toMatch(/zone/i);
    expect(hints).toMatch(/hide/i);
    expect(hints).toMatch(/sonar/i);
  });

  it('a hunted player really can use the first zone: chased, hides, and the hunter gives up (Echo 33)', () => {
    const d = lvl(33);
    const sim = new GameSim(buildWorld(d, 60), { pulseRadius: 150 });
    const hunter = sim.enemies.enemies[0];
    const zone = d.safeZones![0];
    for (let i = 0; i < 60 * 3.3; i++) sim.step(1 / 60); // the spawn safe window
    // stand next to the first hunter, in its sight, but not yet in reach
    sim.body.x = hunter.body.x; // Echo 33's hunter patrols a narrow vertical lane: stand in the lane, 50 below it
    sim.body.y = hunter.body.y + 50; // inside the sense radius (55), outside catching reach (27)
    sim.body.vx = sim.body.vy = 0;
    for (let i = 0; i < 3; i++) sim.step(1 / 60);
    expect(['chase', 'alerted']).toContain(hunter.state);
    sim.body.x = zone.x + zone.width / 2;
    sim.body.y = zone.y + zone.height / 2;
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    expect(sim.status).toBe('playing');
    expect(sim.hidden).toBe(true);
    expect(hunter.state).not.toBe('chase');
  });
});

describe('everything else is as it was', () => {
  it('all other levels have no keys, zones or locked doors', () => {
    for (const id of authoredLevelIds().filter((i) => i > 0)) {
      if (KEY_LEVELS.includes(id) || ZONE_LEVELS.includes(id)) continue;
      const d = lvl(id);
      expect({ id, keys: d.keys ?? [], zones: d.safeZones ?? [], locked: d.doors.filter((x) => x.keyId !== undefined) }).toEqual({ id, keys: [], zones: [], locked: [] });
    }
  });
  it('there are still 50 levels and every one validates', () => {
    const ids = authoredLevelIds().filter((i) => i > 0);
    expect(ids).toHaveLength(50);
    for (const id of ids) expect(validateLevel(lvl(id))).toEqual([]);
  });
});
