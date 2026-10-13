import * as fs from 'fs';
import * as path from 'path';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { CHAPTERS } from '../levels/chapters';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { LevelDef } from '../levels/schema';
import { distanceToBox } from '../sim/collision';
import { GameSim } from '../sim/game';
import { buildWorld } from '../sim/world';
import { flyLevel } from './helpers/levelBot';
import { flyTimed, LoudVariant } from './helpers/timedBot';

jest.setTimeout(600000);

const ids = authoredLevelIds().filter((i) => i >= 36 && i <= 50).sort((a, b) => a - b);
const multi = ids.filter((i) => i <= 45);
const escape = ids.filter((i) => i >= 46);
const lvl = (id: number) => loadAuthoredLevel(id, true) as LevelDef;
const loud: Record<string, LoudVariant> = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'loud_solutions.json'), 'utf8'));

describe('Chapter 3 (Echo 36-50)', () => {
  it('is registered as "The Silent Abyss" in Level Select with all 15 levels', () => {
    expect(CHAPTERS[2]).toMatchObject({ id: 3, name: 'The Silent Abyss', first: 36, last: 50 });
    expect(ids).toEqual(Array.from({ length: 15 }, (_, i) => i + 36));
    for (const id of ids) expect(lvl(id).chapter).toBe(3);
  });

  it('echo 36-45 are multi-room levels (2-3 rooms) with a checkpoint at every room entrance; 46-50 are escape levels', () => {
    for (const id of multi) {
      const d = lvl(id);
      expect(d.checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(d.checkpoints.length).toBeLessThanOrEqual(2); // 2 or 3 rooms
      expect(d.escape.enabled).toBe(false);
      expect(d.height).toBeGreaterThan(1000); // taller than one screen: the camera scrolls
    }
    for (const id of escape) {
      const d = lvl(id);
      expect(d.escape.enabled).toBe(true);
      expect(d.escape.wallSpeed).toBeGreaterThan(0);
      expect(d.checkpoints.length).toBeGreaterThanOrEqual(1); // fair checkpoints
    }
  });

  describe.each(ids.map((i) => [i]))('level %i', (id) => {
    it('is completable by The Rookie (stealth route): no deaths, no alerts, checkpoints touched, inside the 3-star time', () => {
      const d = lvl(id);
      const r = flyTimed(d, {}, 'stealth');
      expect(r.failedAt).toBeUndefined();
      expect(r.finished).toBe(true);
      expect(r.deaths).toBe(0);
      expect(r.alerts).toBe(0);
      expect(r.timeSec).toBeLessThanOrEqual(d.starThresholds.three);
      if (d.sonar.mode === 'fixed') expect(d.sonar.charges - r.pulses).toBeGreaterThanOrEqual(2);
    });

    it('survives a death at the checkpoint: respawn restores a world that can still be finished', () => {
      const r = flyTimed(lvl(id), {}, 'stealth', undefined, { respawnAtCheckpoint: true });
      expect(r.failedAt).toBeUndefined();
      expect(r.finished).toBe(true);
    });

    it('thresholds are tied to the measured clean time', () => {
      const d = lvl(id);
      const r = flyTimed(d, {}, 'stealth');
      const three = d.starThresholds.three / r.timeSec;
      const two = d.starThresholds.two / r.timeSec;
      if (d.escape.enabled) {
        expect(three).toBeGreaterThanOrEqual(1.4);
        expect(three).toBeLessThanOrEqual(1.7);
        expect(two).toBeGreaterThanOrEqual(2);
        expect(two).toBeLessThanOrEqual(2.5);
      } else {
        expect(three).toBeGreaterThanOrEqual(2.5);
        expect(three).toBeLessThanOrEqual(3.6);
        expect(two).toBeGreaterThanOrEqual(5);
        expect(two).toBeLessThanOrEqual(7.2);
      }
      expect(d.parTime).toBe(d.starThresholds.three);
    });
  });

  it('levels with hunters have a recorded LOUD solution that still works', () => {
    for (const id of ids.filter((i) => lvl(i).enemies.length > 0)) {
      const v = loud[String(id)];
      expect({ id, recorded: !!v }).toEqual({ id, recorded: true });
      const r = flyTimed(lvl(id), {}, 'loud', v);
      expect({ id, ok: r.finished && r.deaths === 0 && r.alerts > 0 }).toEqual({ id, ok: true });
    }
  });

  it('nothing is trivial: a bot that ignores moving hazards and doors cannot clear a level', () => {
    // (hunters alone do not block a naive route: slipping through while being chased is a legitimate loud solution)
    for (const id of ids.filter((i) => i <= 45)) {
      const d = lvl(id);
      const hard = d.movingHazards.length > 0 || d.doors.length > 0;
      if (!hard) continue;
      const naive = flyLevel(d, {}, { limitSec: 60 });
      expect({ id, cleared: naive.finished && naive.deaths === 0 }).toEqual({ id, cleared: false });
    }
  });

  describe('escape levels', () => {
    it('the wall is a real constraint: a bot that dawdles is caught, the stealth route is not', () => {
      for (const id of escape) {
        const d = lvl(id);
        const sim = new GameSim(buildWorld(d, 60), { pulseRadius: 150 });
        sim.setInput(0, 0);
        let t = 0;
        while (sim.status === 'playing' && t < 60) {
          sim.step(1 / 60);
          t += 1 / 60;
        }
        expect({ id, caught: sim.status !== 'playing', cause: sim.failCause }).toEqual({ id, caught: true, cause: 'escape_wall' });
      }
    });
    it('gives the clean route comfortable slack, but not unlimited time', () => {
      for (const id of escape) {
        const d = lvl(id);
        const r = flyTimed(d, {}, 'stealth');
        const wallReachesFinish = (d.start.y + (d.escape.startGap ?? ECHO_CONFIG.escape.defaultStartGap) - d.finish.y) / d.escape.wallSpeed;
        const slack = wallReachesFinish / r.timeSec;
        expect({ id, ok: slack >= 1.3 && slack <= 2.2, slack: Math.round(slack * 100) / 100 }).toMatchObject({ id, ok: true });
      }
    });
    it('after a checkpoint respawn the wall is at least respawnGap behind the bat on every escape level', () => {
      for (const id of escape) {
        const d = lvl(id);
        const sim = new GameSim(buildWorld(d, 60), { pulseRadius: 150 });
        const cp = d.checkpoints[0];
        // reach the checkpoint late (the wall has crept up), then die
        sim.body.x = cp.x;
        sim.body.y = cp.y;
        sim.setInput(0, 0);
        sim.step(1 / 60);
        for (let i = 0; i < 60 * 10 && sim.status === 'playing'; i++) {
          sim.body.y = Math.min(sim.body.y, cp.y);
          sim.step(1 / 60);
        }
        sim.respawn();
        expect({ id, gap: sim.escapeWallY - (sim.body.y + sim.body.r) >= ECHO_CONFIG.escape.respawnGap - 1e-6 }).toEqual({ id, gap: true });
      }
    });
  });

  it('is fair: starts and checkpoints are clear of hazards, hunters and spikes at every moment', () => {
    for (const id of ids) {
      const d = lvl(id);
      const points = [d.start, ...d.checkpoints];
      for (const p of points) {
        for (const s of d.spikes) expect(distanceToBox(p.x, p.y, s)).toBeGreaterThan(60);
        for (const h of d.movingHazards) {
          const box = { x: h.x, y: h.y, width: h.width + Math.abs(h.travel?.x ?? 0), height: h.height + Math.abs(h.travel?.y ?? 0) };
          expect({ id, near: distanceToBox(p.x, p.y, box) < 60 }).toEqual({ id, near: false });
        }
        for (const e of d.enemies) for (const w of e.waypoints) expect(Math.hypot(w.x - p.x, w.y - p.y)).toBeGreaterThan(ECHO_CONFIG.enemy.senseRadius + 45);
      }
    }
  });

  it('every checkpoint, switch and pickup is on open floor', () => {
    for (const id of ids) {
      const d = lvl(id);
      const w = buildWorld(d, 60);
      for (const p of [...d.checkpoints, ...d.switches, ...d.pickups]) {
        const nearest = Math.min(...w.solids.map((b) => distanceToBox(p.x, p.y, b)));
        expect({ id, ok: nearest >= ECHO_CONFIG.player.radius }).toEqual({ id, ok: true });
      }
    }
  });

  it('chapter 3 is built from ideas taught before: every element appeared in chapters 1-2', () => {
    const taught = (pred: (d: LevelDef) => boolean) => authoredLevelIds().filter((i) => i < 36).some((i) => pred(lvl(i)));
    for (const id of ids) {
      const d = lvl(id);
      if (d.movingHazards.some((h) => h.kind === 'slider')) expect(taught((x) => x.movingHazards.some((h) => h.kind === 'slider'))).toBe(true);
      if (d.movingHazards.some((h) => h.kind === 'blade')) expect(taught((x) => x.movingHazards.some((h) => h.kind === 'blade'))).toBe(true);
      if (d.enemies.some((e) => e.speed === 'fast')) expect(taught((x) => x.enemies.some((e) => e.speed === 'fast'))).toBe(true);
      if (d.doors.length) expect(taught((x) => x.doors.length > 0)).toBe(true);
      if (d.walls.some((w) => w.type === 'crystal')) expect(taught((x) => x.walls.some((w) => w.type === 'crystal'))).toBe(true);
    }
  });
});
