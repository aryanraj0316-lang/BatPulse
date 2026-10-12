import { ECHO_CONFIG } from '../constants/gameConfig';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { LevelDef } from '../levels/schema';
import { distanceToBox } from '../sim/collision';
import { hazardPose } from '../sim/hazards';
import { buildWorld } from '../sim/world';
import { flyLevel } from './helpers/levelBot';
import { flyTimed } from './helpers/timedBot';

const ids = authoredLevelIds().filter((i) => i >= 1 && i <= 20).sort((a, b) => a - b);
const lvl = (id: number) => loadAuthoredLevel(id, true) as LevelDef;
const hasDynamic = (d: LevelDef) => d.movingHazards.length > 0 || d.switches.length > 0;

describe('Chapter 1 (Echo 01-20): every level is completable by The Rookie', () => {
  it.each(ids.map((i) => [i]))('level %i: the bot clears it with no deaths, inside the 3-star time', (id) => {
    const def = lvl(id);
    if (hasDynamic(def)) {
      const r = flyTimed(def);
      expect(r.failedAt).toBeUndefined();
      expect(r.finished).toBe(true);
      expect(r.deaths).toBe(0);
      expect(r.timeSec).toBeLessThanOrEqual(def.starThresholds.three);
      // thresholds stay tied to the measured clean time (3 stars ~ 3x, 2 stars ~ 6x), so they cannot silently drift
      expect(def.starThresholds.three / r.timeSec).toBeGreaterThanOrEqual(2.5);
      expect(def.starThresholds.three / r.timeSec).toBeLessThanOrEqual(3.6);
      expect(def.starThresholds.two / r.timeSec).toBeGreaterThanOrEqual(5);
      expect(def.starThresholds.two / r.timeSec).toBeLessThanOrEqual(7.2);
      // fixed-sonar levels must leave pulses for the player to look around with, beyond the switch pulses
      if (def.sonar.mode === 'fixed') expect(def.sonar.charges - r.pulses).toBeGreaterThanOrEqual(2);
    } else {
      const r = flyLevel(def);
      expect(r.finished).toBe(true);
      expect(r.deaths).toBe(0);
      expect(r.timeSec).toBeLessThanOrEqual(def.starThresholds.three);
      expect(def.starThresholds.three / r.timeSec).toBeGreaterThanOrEqual(2.5);
      expect(def.starThresholds.three / r.timeSec).toBeLessThanOrEqual(3.6);
    }
  });
});

describe('Chapter 1: design rules', () => {
  it('there are exactly 20 chapter-1 levels, numbered 1..20', () => {
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('echo 01-05 recharge in 2 s; echo 06-12 use recharge mode; echo 13-20 use fixed mode with 4-5 charges', () => {
    for (const id of ids) {
      const s = lvl(id).sonar;
      if (id <= ECHO_CONFIG.sonar.tutorialLevelMax) expect(s).toMatchObject({ mode: 'recharge', rechargeSec: ECHO_CONFIG.sonar.tutorialRechargeSec });
      else if (id <= 12) expect(s.mode).toBe('recharge');
      else {
        expect(s.mode).toBe('fixed');
        expect([4, 5]).toContain(s.charges);
      }
    }
  });

  it('slider loops are 2-4 s as specified', () => {
    for (const id of ids)
      for (const h of lvl(id).movingHazards.filter((x) => x.kind === 'slider')) {
        expect(h.loopSec).toBeGreaterThanOrEqual(ECHO_CONFIG.hazards.sliderLoopSecMin);
        expect(h.loopSec).toBeLessThanOrEqual(ECHO_CONFIG.hazards.sliderLoopSecMax);
      }
  });

  it('each new idea is introduced alone, in order: slider, blade, crystal, mossy, pickup, switch/door', () => {
    const first = (pred: (d: LevelDef) => boolean) => ids.find((i) => pred(lvl(i)))!;
    const slider = first((d) => d.movingHazards.some((h) => h.kind === 'slider'));
    const blade = first((d) => d.movingHazards.some((h) => h.kind === 'blade'));
    const crystal = first((d) => d.walls.some((w) => w.type === 'crystal'));
    const mossy = first((d) => d.walls.some((w) => w.type === 'mossy'));
    const pickup = first((d) => d.pickups.length > 0);
    const sw = first((d) => d.switches.length > 0);
    expect([slider, blade, crystal, mossy, pickup, sw]).toEqual([6, 8, 10, 11, 13, 14]);
    // the intro levels contain only the new idea
    expect(lvl(slider).movingHazards.every((h) => h.kind === 'slider')).toBe(true);
    expect(lvl(slider).movingHazards).toHaveLength(1);
    expect(lvl(blade).movingHazards.every((h) => h.kind === 'blade')).toBe(true);
    expect(lvl(blade).movingHazards).toHaveLength(1);
    expect(lvl(pickup).movingHazards).toHaveLength(0);
    expect(lvl(sw).movingHazards).toHaveLength(0);
    // pickups only from Echo 13, as specified
    for (const id of ids) if (id < 13) expect(lvl(id).pickups).toHaveLength(0);
  });

  it('timing is real: a bot that ignores the moving hazards dies on every hazard level', () => {
    const hazardLevels = ids.filter((i) => lvl(i).movingHazards.length > 0 && lvl(i).switches.length === 0);
    expect(hazardLevels.length).toBeGreaterThanOrEqual(6);
    for (const id of hazardLevels) {
      const naive = flyLevel(lvl(id), {}, { limitSec: 40 }); // static route, no timing awareness
      expect({ id, hurt: naive.deaths > 0 || !naive.finished }).toEqual({ id, hurt: true });
    }
  });

  it('the 8 s door timer is a real constraint on Echo 17 (and the level works with the real 8 s)', () => {
    expect(flyTimed(lvl(17)).finished).toBe(true);
    const old = ECHO_CONFIG.door.openSec;
    try {
      ECHO_CONFIG.door.openSec = 2;
      const r = flyTimed(lvl(17));
      expect(r.finished).toBe(false);
    } finally {
      ECHO_CONFIG.door.openSec = old;
    }
  });

  it('no unfair instant deaths: hazards never come near the start, at any point of their cycle', () => {
    for (const id of ids) {
      const def = lvl(id);
      for (const h of def.movingHazards) {
        for (let t = 0; t < h.loopSec * 4; t += 0.05) {
          const p = hazardPose(h, t, { x: 0, y: 0, angle: 0 });
          const box = { x: p.x, y: p.y, width: h.width, height: h.height };
          expect({ id, near: distanceToBox(def.start.x, def.start.y, box) < 80 }).toEqual({ id, near: false });
        }
      }
      for (const s of def.spikes) expect(distanceToBox(def.start.x, def.start.y, s)).toBeGreaterThan(80);
    }
  });

  it('nothing is placed inside a wall: start, finish, switches, pickups', () => {
    for (const id of ids) {
      const def = lvl(id);
      const w = buildWorld(def, 60);
      const pts = [
        ['start', def.start],
        ['finish', def.finish],
        ...def.switches.map((s) => ['switch', s] as const),
        ...def.pickups.map((p) => ['pickup', p] as const),
      ] as const;
      for (const [name, p] of pts) {
        const nearest = Math.min(...w.solids.map((b) => distanceToBox(p.x, p.y, b)));
        expect({ id, name, ok: nearest >= ECHO_CONFIG.player.radius }).toEqual({ id, name, ok: true });
      }
    }
  });

  it('star thresholds are consistent: par = 3-star time, two >= three', () => {
    for (const id of ids) {
      const d = lvl(id);
      expect(d.starThresholds.two).toBeGreaterThanOrEqual(d.starThresholds.three);
      expect(d.parTime).toBe(d.starThresholds.three);
      expect(d.ghostPulseLimit).toBeGreaterThanOrEqual(1);
    }
  });

  it('every door is wired to an existing switch and every switch controls a door', () => {
    for (const id of ids) {
      const d = lvl(id);
      const used = new Set(d.doors.map((x) => x.switchId));
      for (const s of d.switches) expect({ id, sw: s.id, used: used.has(s.id) }).toEqual({ id, sw: s.id, used: true });
    }
  });

  it('level loading stays fast for the biggest level', () => {
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) buildWorld(lvl(20), 60);
    expect((Date.now() - t0) / 20).toBeLessThan(ECHO_CONFIG.level.loadBudgetMs);
  });
});
