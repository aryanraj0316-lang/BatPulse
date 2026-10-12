import * as fs from 'fs';
import * as path from 'path';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { CHAPTERS } from '../levels/chapters';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { LevelDef } from '../levels/schema';
import { distanceToBox } from '../sim/collision';
import { enemyChaseSpeed, patrolInfo } from '../sim/enemy';
import { NavGrid } from '../sim/nav';
import { buildWorld } from '../sim/world';
import { flyTimed, LoudVariant } from './helpers/timedBot';

jest.setTimeout(240000);

const E = ECHO_CONFIG.enemy;
const ids = authoredLevelIds().filter((i) => i >= 21 && i <= 35).sort((a, b) => a - b);
const lvl = (id: number) => loadAuthoredLevel(id, true) as LevelDef;
const loud: Record<string, LoudVariant> = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'loud_solutions.json'), 'utf8'));

describe('Chapter 2 (Echo 21-35)', () => {
  it('is registered as a chapter in Level Select and has all 15 levels', () => {
    expect(CHAPTERS[1]).toMatchObject({ id: 2, first: 21, last: 35 });
    expect(ids).toEqual(Array.from({ length: 15 }, (_, i) => i + 21));
    for (const id of ids) expect(lvl(id).chapter).toBe(2);
  });

  describe.each(ids.map((i) => [i]))('level %i', (id) => {
    it('has a STEALTH solution: zero alerts, ghost run, no deaths, within the 3-star time', () => {
      const def = lvl(id);
      const r = flyTimed(def, {}, 'stealth');
      expect(r.failedAt).toBeUndefined();
      expect(r.finished).toBe(true);
      expect(r.deaths).toBe(0);
      expect(r.alerts).toBe(0);
      expect(r.ghost).toBe(true);
      expect(r.pulses).toBeLessThanOrEqual(def.ghostPulseLimit);
      expect(r.timeSec).toBeLessThanOrEqual(def.starThresholds.three);
      expect(def.starThresholds.three / r.timeSec).toBeGreaterThanOrEqual(2.5);
      expect(def.starThresholds.three / r.timeSec).toBeLessThanOrEqual(3.6);
    });

    it('has a LOUD solution: hunters alerted, bat still reaches the finish', () => {
      const v = loud[String(id)];
      expect(v).toBeDefined();
      const r = flyTimed(lvl(id), {}, 'loud', v);
      expect(r.finished).toBe(true);
      expect(r.deaths).toBe(0);
      expect(r.alerts).toBeGreaterThan(0);
    });

    it('is fair: hunters stay outside sensing range of the spawn point for the whole 3 s safe window', () => {
      const def = lvl(id);
      expect(def.enemies.length).toBeGreaterThanOrEqual(1);
      expect(def.enemies.length).toBeLessThanOrEqual(2);
      for (const e of def.enemies) {
        const v = enemyChaseSpeed(e) * E.patrolSpeedFactor;
        const info = { x: 0, y: 0, wp: 0, dwell: 0 };
        for (let t = 0; t <= E.spawnSafeSec + 1; t += 0.1) {
          patrolInfo(e, t, v, info);
          expect(Math.hypot(info.x - def.start.x, info.y - def.start.y)).toBeGreaterThan(E.senseRadius + 45);
        }
      }
    });

    it('has valid patrol routes: waypoints on open floor, each leg a clear straight walk', () => {
      const def = lvl(id);
      const world = buildWorld(def, 60);
      const nav = new NavGrid(world, E.radius + 2);
      for (const e of def.enemies) {
        e.waypoints.forEach((w, i) => {
          const n = e.waypoints[(i + 1) % e.waypoints.length];
          for (const s of world.solids) expect(distanceToBox(w.x, w.y, s)).toBeGreaterThanOrEqual(E.radius);
          if (e.waypoints.length > 1) expect(nav.lineWalkable(w.x, w.y, n.x, n.y)).toBe(true);
        });
      }
    });
  });

  it('echo 21-28 use slow hunters only (introduced alone); echo 29-35 each include a fast hunter', () => {
    for (const id of ids) {
      const speeds = lvl(id).enemies.map((e) => e.speed);
      if (id <= 28) expect(speeds.every((s) => s === 'slow')).toBe(true);
      else expect(speeds).toContain('fast');
    }
  });

  it('slow hunters are 15% slower than the player, fast hunters about equal (from the level data)', () => {
    for (const id of ids)
      for (const e of lvl(id).enemies) {
        const ratio = enemyChaseSpeed(e) / ECHO_CONFIG.player.speed;
        expect(ratio).toBeCloseTo(e.speed === 'slow' ? 0.85 : 1.0, 5);
      }
  });

  it('moving obstacles and doors appear with hunters in the late levels (echo 29-35 mix them in)', () => {
    const lateWithObstacles = ids.filter((i) => i >= 29 && lvl(i).movingHazards.length > 0);
    expect(lateWithObstacles.length).toBeGreaterThanOrEqual(3);
    expect(ids.some((i) => lvl(i).switches.length > 0 && lvl(i).enemies.length > 0)).toBe(true);
  });

  it('echo 29-35 are narrow: the hunter corridor is 60 units wide (30 each side of its centre line)', () => {
    for (const id of ids.filter((i) => i >= 29)) {
      const def = lvl(id);
      const world = buildWorld(def, 60);
      const e = def.enemies[0];
      const cx = e.waypoints[0].x;
      const y = (e.waypoints[0].y + e.waypoints[e.waypoints.length - 1].y) / 2;
      // sample the corridor away from crossings: take the narrowest clearance along its length
      let narrowest = Infinity;
      for (let yy = e.waypoints[0].y; yy <= e.waypoints[e.waypoints.length - 1].y; yy += 10) {
        const d = Math.min(...world.solids.map((b) => distanceToBox(cx, yy, b)));
        if (d < narrowest) narrowest = d;
      }
      expect(narrowest).toBeGreaterThanOrEqual(29);
      expect(narrowest).toBeLessThanOrEqual(31);
      expect(y).toBeGreaterThan(0);
    }
  });

  it('the stealth routes need few pulses, so fixed-sonar levels leave charges for looking around', () => {
    for (const id of ids) {
      const def = lvl(id);
      if (def.sonar.mode === 'fixed') {
        const r = flyTimed(def, {}, 'stealth');
        expect(def.sonar.charges - r.pulses).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
