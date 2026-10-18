import { ECHO_CONFIG } from '../constants/gameConfig';
import { clampKnob, stickFromDrag } from '../sim/joystick';
import { Momentum } from '../sim/momentum';
import { SonarEnergy } from '../sim/sonarEnergy';
import { circleOverlapsBox, distanceToBox, resolveCircleBoxes } from '../sim/collision';
import { scoreFor, shardsFor, starsForTime } from '../sim/scoring';
import { HintTracker } from '../sim/hints';
import { applyWaves, edgeFalloff, glowCurve, RevealState, WaveField } from '../sim/reveal';
import { buildWorld, fitView, pulseRadiusWorld } from '../sim/world';
import { GameSim, SimEvent } from '../sim/game';
import { LevelDef } from '../levels/schema';
import { loadAuthoredLevel } from '../levels/loader';

const M = ECHO_CONFIG.momentum;

describe('joystick', () => {
  const out = { x: 0, y: 0, mag: 0 };
  it('is exactly zero inside the 10% dead zone', () => {
    stickFromDrag(4, 0, 50, 0.1, out);
    expect(out).toEqual({ x: 0, y: 0, mag: 0 });
    stickFromDrag(5, 0, 50, 0.1, out); // exactly at the edge
    expect(out.mag).toBe(0);
  });
  it('re-maps the range so the response starts at 0 and reaches 1', () => {
    stickFromDrag(5.5, 0, 50, 0.1, out);
    expect(out.mag).toBeGreaterThan(0);
    expect(out.mag).toBeLessThan(0.02);
    stickFromDrag(50, 0, 50, 0.1, out);
    expect(out.mag).toBeCloseTo(1);
    stickFromDrag(500, 0, 50, 0.1, out); // dragging past the rim stays at 1
    expect(out.mag).toBeCloseTo(1);
  });
  it('keeps the direction', () => {
    stickFromDrag(30, -30, 50, 0.1, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeLessThan(0);
    expect(out.x).toBeCloseTo(-out.y);
    expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(1.0000001);
  });
  it('clamps the visual knob to the rim', () => {
    const k = clampKnob(300, 400, 50);
    expect(Math.hypot(k.x, k.y)).toBeCloseTo(50);
    expect(clampKnob(10, 10, 50)).toEqual({ x: 10, y: 10 });
  });
});

describe('momentum (spec: x1.0 start, +0.1 / 2 s moving, max x2.0, reset on hit or 1.5 s idle)', () => {
  const mk = (rateMult?: number, max = M.max) => new Momentum({ ...M, max, rateMult });
  const run = (m: Momentum, sec: number, moving: boolean) => {
    for (let i = 0; i < Math.round(sec * 100); i++) m.update(0.01, moving);
  };

  it('starts at x1.0', () => expect(mk().value).toBe(1));
  it('adds exactly 0.1 per 2 s of movement', () => {
    const m = mk();
    run(m, 1.99, true);
    expect(m.value).toBe(1);
    run(m, 0.02, true);
    expect(m.value).toBe(1.1);
    run(m, 4, true);
    expect(m.value).toBe(1.3);
  });
  it('never drifts into float noise', () => {
    const m = mk();
    run(m, 14, true);
    expect(m.value).toBe(1.7);
  });
  it('caps at x2.0', () => {
    const m = mk();
    run(m, 100, true);
    expect(m.value).toBe(2);
    expect(m.best).toBe(2);
  });
  it('resets to x1.0 on a wall hit', () => {
    const m = mk();
    run(m, 10, true);
    expect(m.value).toBe(1.5);
    m.onWallHit();
    expect(m.value).toBe(1);
  });
  it('resets after 1.5 s standing still, but not before', () => {
    const m = mk();
    run(m, 10, true);
    run(m, 1.4, false);
    expect(m.value).toBe(1.5);
    run(m, 0.2, false);
    expect(m.value).toBe(1);
  });
  it('a short stop does not lose accumulated progress towards the next step', () => {
    const m = mk();
    run(m, 1.5, true);
    run(m, 1, false);
    run(m, 0.5, true);
    expect(m.value).toBe(1.1);
  });
  it('remembers the best value for the result screen', () => {
    const m = mk();
    run(m, 10, true);
    m.onWallHit();
    expect(m.value).toBe(1);
    expect(m.best).toBe(1.5);
    m.reset();
    expect(m.best).toBe(1);
  });
  it('Turbo Moth: grows 2x faster with cap x4.0', () => {
    const m = mk(2, 4);
    run(m, 1, true);
    expect(m.value).toBe(1.1);
    run(m, 200, true);
    expect(m.value).toBe(4);
  });
});

describe('sonar energy', () => {
  it('recharge mode: 3 charges, one returns every rechargeSec', () => {
    const e = new SonarEnergy({ mode: 'recharge', charges: 3, rechargeSec: 4 });
    expect(e.charges).toBe(3);
    expect(e.tryUse()).toBe(true);
    expect(e.tryUse()).toBe(true);
    expect(e.charges).toBe(1);
    e.update(2);
    expect(e.charges).toBe(1);
    expect(e.rechargeFill).toBeCloseTo(0.5);
    e.update(2);
    expect(e.charges).toBe(2);
    e.update(4);
    expect(e.charges).toBe(3);
    expect(e.rechargeFill).toBe(0);
    e.update(100);
    expect(e.charges).toBe(3);
  });
  it('the recharge timer does not run while full (no free head start)', () => {
    const e = new SonarEnergy({ mode: 'recharge', charges: 3, rechargeSec: 4 });
    e.update(3.9);
    e.tryUse();
    e.update(3.9);
    expect(e.charges).toBe(2);
  });
  it('tutorial speed: 2 s per charge', () => {
    const e = new SonarEnergy({ mode: 'recharge', charges: 3, rechargeSec: ECHO_CONFIG.sonar.tutorialRechargeSec });
    e.tryUse();
    e.update(2);
    expect(e.charges).toBe(3);
  });
  it('cannot spend what it does not have', () => {
    const e = new SonarEnergy({ mode: 'recharge', charges: 1, rechargeSec: 4 });
    expect(e.tryUse()).toBe(true);
    expect(e.tryUse()).toBe(false);
    expect(e.charges).toBe(0);
  });
  it('fixed mode never recharges; pickups add, capped at max', () => {
    const e = new SonarEnergy({ mode: 'fixed', charges: 4, rechargeSec: 0 });
    e.tryUse();
    e.tryUse();
    e.update(1000);
    expect(e.charges).toBe(2);
    expect(e.rechargeFill).toBe(0);
    expect(e.add(1)).toBe(1);
    expect(e.add(5)).toBe(1); // only one slot was free
    expect(e.charges).toBe(4);
  });
  it('reset refills', () => {
    const e = new SonarEnergy({ mode: 'fixed', charges: 3, rechargeSec: 0 });
    e.tryUse();
    e.reset();
    expect(e.charges).toBe(3);
  });
});

describe('collision', () => {
  const wall = { x: 100, y: 0, width: 8, height: 200 };
  it('slides along a wall without sticking and reports impact speed', () => {
    const b = { x: 90, y: 100, vx: 200, vy: 100, r: 14 };
    const impact = resolveCircleBoxes(b, [wall]);
    expect(impact).toBeCloseTo(200);
    expect(b.x).toBeCloseTo(100 - 14); // pushed flush
    expect(b.vx).toBeCloseTo(0);
    expect(b.vy).toBe(100); // tangential speed kept: slides
  });
  it('touching without moving into the wall is not an impact', () => {
    const b = { x: 86, y: 100, vx: -50, vy: 0, r: 14 };
    expect(resolveCircleBoxes(b, [wall])).toBe(0);
    expect(b.vx).toBe(-50);
  });
  it('rounds corners smoothly', () => {
    const b = { x: 95, y: 205, vx: 100, vy: -100, r: 14 };
    resolveCircleBoxes(b, [wall]);
    expect(Math.hypot(b.x - 100, b.y - 200)).toBeGreaterThanOrEqual(14 - 1e-6);
  });
  it('a centre stuck inside a wall is ejected', () => {
    const b = { x: 103, y: 100, vx: 0, vy: 0, r: 14 };
    resolveCircleBoxes(b, [wall]);
    expect(distanceToBox(b.x, b.y, wall)).toBeGreaterThanOrEqual(14 - 1e-6);
  });
  it('overlap test with forgiveness inset', () => {
    const spike = { x: 0, y: 0, width: 20, height: 20 };
    expect(circleOverlapsBox(25, 10, 14, spike)).toBe(true);
    expect(circleOverlapsBox(25, 10, 14, spike, 2)).toBe(true);
    expect(circleOverlapsBox(33, 10, 14, spike, 2)).toBe(false); // 33-18 = 15 > 14
    expect(circleOverlapsBox(31.5, 10, 14, spike, 2)).toBe(true); // 31.5-18 = 13.5 < 14
  });
  it('distanceToBox', () => {
    expect(distanceToBox(50, 50, { x: 0, y: 0, width: 100, height: 100 })).toBe(0);
    expect(distanceToBox(103, 104, { x: 0, y: 0, width: 100, height: 100 })).toBe(5);
  });
});

describe('scoring', () => {
  const t = { two: 40, three: 25 };
  it('time-based stars', () => {
    expect(starsForTime(10, t)).toBe(3);
    expect(starsForTime(25, t)).toBe(3);
    expect(starsForTime(25.01, t)).toBe(2);
    expect(starsForTime(40, t)).toBe(2);
    expect(starsForTime(40.01, t)).toBe(1);
    expect(starsForTime(9999, t)).toBe(1);
  });
  it('momentum multiplies the score', () => {
    const base = scoreFor(10, 20, 1);
    expect(scoreFor(10, 20, 2)).toBe(base * 2);
    expect(base).toBe(500 + (40 - 10) * 50);
    expect(scoreFor(1000, 20, 1)).toBe(500); // no negative time bonus
  });
  it('momentum multiplies the shard reward; 20/35/50 per star', () => {
    expect(shardsFor({ stars: 1, momentum: 1, firstClear: true })).toBe(20);
    expect(shardsFor({ stars: 2, momentum: 1, firstClear: true })).toBe(35);
    expect(shardsFor({ stars: 3, momentum: 1, firstClear: true })).toBe(50);
    expect(shardsFor({ stars: 3, momentum: 1.5, firstClear: true })).toBe(75);
    expect(shardsFor({ stars: 3, momentum: 2, firstClear: true })).toBe(100);
  });
  it('replays pay less than first clears', () => {
    const first = shardsFor({ stars: 3, momentum: 1.4, firstClear: true });
    const replay = shardsFor({ stars: 3, momentum: 1.4, firstClear: false });
    expect(replay).toBeLessThan(first);
    expect(replay).toBeGreaterThanOrEqual(1);
  });
});

describe('hints', () => {
  const hints = [
    { text: 'move', until: 'move' as const },
    { text: 'pulse', until: 'pulse' as const },
    { text: 'ring', until: 'seconds' as const, seconds: 2 },
  ];
  it('advances move -> pulse -> timed -> none', () => {
    const h = new HintTracker(hints);
    expect(h.current).toBe('move');
    h.onPulse(); // wrong action does nothing
    expect(h.current).toBe('move');
    h.onMoved();
    expect(h.current).toBe('pulse');
    h.onPulse();
    expect(h.current).toBe('ring');
    h.update(1.9);
    expect(h.current).toBe('ring');
    h.update(0.2);
    expect(h.current).toBeNull();
  });
  it('reset starts over; empty list is fine', () => {
    const h = new HintTracker(hints);
    h.onMoved();
    h.reset();
    expect(h.current).toBe('move');
    expect(new HintTracker([]).current).toBeNull();
  });
});

describe('wave radius, falloff and reveal timing', () => {
  it('pulse radius is 40% of the screen width whatever the level scale', () => {
    expect(pulseRadiusWorld(400, 1, 0.4)).toBeCloseTo(160);
    const v = fitView(400, 800, 380, 660);
    // on screen the pulse is 160 px wide radius regardless of scale
    expect(pulseRadiusWorld(400, v.scale, 0.4) * v.scale).toBeCloseTo(160);
    expect(pulseRadiusWorld(400, 1, 0.4, 1.5)).toBeCloseTo(240); // Sonar-Bot x1.5
  });
  it('fitView centres without distortion', () => {
    const v = fitView(400, 900, 380, 660);
    expect(v.scale).toBeCloseTo(400 / 380);
    expect(v.offsetX).toBeCloseTo(0);
    expect(v.offsetY).toBeCloseTo((900 - 660 * v.scale) / 2);
  });
  it('distance falloff: brightest next to the bat, steadily dimmer with distance, faint at the rim, zero beyond', () => {
    expect(edgeFalloff(0, 100)).toBe(1);
    expect(edgeFalloff(50, 100)).toBeCloseTo(0.1 + 0.9 * 0.5, 6); // linear: min + (1 - min) * (1 - d/r)
    expect(edgeFalloff(99.9, 100)).toBeGreaterThan(0.1); // faint but visible at the edge of the reach
    expect(edgeFalloff(99.9, 100)).toBeLessThan(0.11);
    expect(edgeFalloff(100, 100)).toBe(0); // beyond the reach
    expect(edgeFalloff(120, 100)).toBe(0);
    expect(edgeFalloff(10, 0)).toBe(0);
    expect(edgeFalloff(-5, 100)).toBe(1); // never above 1
    let last = 2;
    for (let d = 0; d < 100; d += 1) {
      const f = edgeFalloff(d, 100);
      expect(f).toBeLessThan(last); // strictly decreasing over the whole range, no flat plateau
      expect(f).toBeGreaterThanOrEqual(0.1);
      expect(f).toBeLessThanOrEqual(1);
      last = f;
    }
  });
  it('the falloff exponent and the edge floor are tunable', () => {
    expect(edgeFalloff(50, 100, 2, 0)).toBeCloseTo(0.25, 6); // (1 - 0.5) ^ 2
    expect(edgeFalloff(50, 100, 0.5, 0)).toBeCloseTo(Math.sqrt(0.5), 6);
    expect(edgeFalloff(99.99, 100, 1, 0.3)).toBeCloseTo(0.3, 2);
  });
  it('glow holds then fades to zero', () => {
    expect(glowCurve(0)).toBe(1);
    expect(glowCurve(ECHO_CONFIG.sonar.glowHoldFraction)).toBe(1);
    expect(glowCurve(1)).toBe(0);
    expect(glowCurve(0.7)).toBeLessThan(1);
    expect(glowCurve(0.7)).toBeGreaterThan(0);
  });

  const box = (x: number) => ({ x, y: 0, width: 10, height: 10, kind: 'wall' as const, variant: 'normal' as const });
  const lightUp = (items: ReturnType<typeof box>[], maxR: number, steps: number, dt: number, extra = 0) => {
    const waves = new WaveField();
    const rs = new RevealState(items.length);
    waves.spawn(0, 5, maxR);
    for (let i = 0; i < steps; i++) {
      waves.update(dt);
      applyWaves(waves, items, rs, extra);
      rs.update(dt);
    }
    return { waves, rs };
  };

  it('reveals only what the wave front reaches; things beyond the max radius stay dark', () => {
    const items = [box(0), box(50), box(99), box(300)];
    const { rs } = lightUp(items, 100, 40, 0.01);
    expect(rs.glow[0]).toBeGreaterThan(0.9);
    expect(rs.glow[1]).toBeGreaterThan(0.5);
    expect(rs.glow[3]).toBe(0);
  });
  it('items at the very rim are barely lit (smooth edge)', () => {
    const near = lightUp([box(50)], 100, 35, 0.01).rs.glow[0];
    const rim = lightUp([box(98)], 100, 35, 0.01).rs.glow[0];
    expect(rim).toBeLessThan(near);
  });
  it('the closer a wall is to the bat, the brighter it lights (whole range, not just the rim)', () => {
    const peak = (x: number) => lightUp([box(x)], 100, 35, 0.01).rs.glow[0];
    const glows = [5, 25, 45, 65, 85, 97].map(peak);
    for (let i = 1; i < glows.length; i++) expect(glows[i]).toBeLessThan(glows[i - 1]);
    expect(glows[0]).toBeGreaterThan(0.9); // closest: full
    expect(glows[5]).toBeGreaterThan(0); // at the rim: faint but there
    expect(glows[5]).toBeLessThan(0.2);
  });
  it('revealed objects glow ~1.5 s, then are gone', () => {
    const items = [box(20)];
    const waves = new WaveField();
    const rs = new RevealState(1);
    waves.spawn(0, 5, 100);
    let litAt = -1;
    let darkAt = -1;
    for (let i = 0; i < 400; i++) {
      waves.update(0.01);
      applyWaves(waves, items, rs);
      rs.update(0.01);
      if (litAt < 0 && rs.glow[0] > 0) litAt = i * 0.01;
      if (litAt >= 0 && darkAt < 0 && rs.glow[0] === 0) darkAt = i * 0.01;
    }
    expect(litAt).toBeGreaterThanOrEqual(0);
    expect(darkAt - litAt).toBeGreaterThan(1.4);
    expect(darkAt - litAt).toBeLessThan(1.7);
  });
  it('extra glow time lengthens walls (Vesper +2 s)', () => {
    const items = [box(20)];
    const waves = new WaveField();
    const rs = new RevealState(1);
    waves.spawn(0, 5, 100);
    for (let i = 0; i < 300; i++) {
      waves.update(0.01);
      applyWaves(waves, items, rs, 2);
      rs.update(0.01);
    }
    expect(rs.glow[0]).toBeGreaterThan(0); // 3 s after the pulse, still lit
  });
  it('crystal glows brighter and longer, mossy flashes ~0.3 s', () => {
    const mk = (variant: 'normal' | 'crystal' | 'mossy') => [{ ...box(20), variant }];
    const duration = (variant: 'normal' | 'crystal' | 'mossy') => {
      const items = mk(variant);
      const waves = new WaveField();
      const rs = new RevealState(1);
      waves.spawn(0, 5, 100);
      let peak = 0;
      let lit = 0;
      for (let i = 0; i < 800; i++) {
        waves.update(0.01);
        applyWaves(waves, items, rs);
        rs.update(0.01);
        peak = Math.max(peak, rs.glow[0]);
        if (rs.glow[0] > 0) lit += 0.01;
      }
      return { peak, lit };
    };
    const n = duration('normal');
    const c = duration('crystal');
    const m = duration('mossy');
    expect(c.peak).toBeCloseTo(n.peak * 2, 1);
    expect(c.lit).toBeGreaterThan(n.lit * 1.8);
    expect(m.lit).toBeLessThan(0.45);
    expect(m.peak).toBeLessThan(n.peak);
  });
  it('wave pool recycles the oldest slot and never grows', () => {
    const w = new WaveField(3);
    for (let i = 0; i < 10; i++) {
      w.spawn(i, 0, 100);
      w.update(0.01);
    }
    expect(w.activeCount).toBe(3);
  });
  it('waves expire after expansion', () => {
    const w = new WaveField();
    w.spawn(0, 0, 100);
    for (let i = 0; i < 100; i++) w.update(0.01);
    expect(w.activeCount).toBe(0);
  });
});

/* ───────────────────────── Full game simulation ───────────────────────── */

const tiny = (over: Partial<LevelDef> = {}): LevelDef => ({
  id: 99,
  name: 'T',
  chapter: 1,
  width: 380,
  height: 1500,
  start: { x: 190, y: 1000 },
  finish: { x: 190, y: 60, radius: 18 },
  walls: [
    { x: 0, y: 0, width: 380, height: 8, type: 'normal' },
    { x: 0, y: 1492, width: 380, height: 8, type: 'normal' },
    { x: 0, y: 0, width: 8, height: 1500, type: 'normal' },
    { x: 372, y: 0, width: 8, height: 1500, type: 'normal' },
  ],
  spikes: [],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [],
  enemies: [],
  checkpoints: [],
  sonar: { mode: 'recharge', charges: 3, rechargeSec: 4 },
  ghostPulseLimit: 3,
  parTime: 20,
  starThresholds: { two: 30, three: 20 },
  escape: { enabled: false, wallSpeed: 0 },
  ...over,
});

const mkSim = (def: LevelDef = tiny()) => {
  const events: SimEvent[] = [];
  const sim = new GameSim(buildWorld(def, 60), { pulseRadius: 150 });
  sim.onEvent = (e) => events.push(e);
  return { sim, events };
};
const run = (sim: GameSim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60);
};

describe('GameSim: movement', () => {
  it('accelerates smoothly, never exceeds max speed, decelerates smoothly', () => {
    const { sim } = mkSim();
    sim.setInput(1, 0);
    sim.step(1 / 60);
    const v1 = sim.body.vx;
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(ECHO_CONFIG.player.speed * 0.5); // not an instant jump
    run(sim, 0.5);
    expect(sim.body.vx).toBeLessThanOrEqual(ECHO_CONFIG.player.speed + 1e-6);
    expect(sim.body.vx).toBeGreaterThan(ECHO_CONFIG.player.speed * 0.97);
    sim.setInput(0, 0);
    sim.step(1 / 60);
    expect(sim.body.vx).toBeGreaterThan(ECHO_CONFIG.player.speed * 0.5); // still gliding
    run(sim, 1);
    expect(Math.abs(sim.body.vx)).toBeLessThan(1);
  });
  it('partial stick = proportionally slower', () => {
    const { sim } = mkSim();
    sim.setInput(0.5, 0);
    run(sim, 0.8);
    expect(sim.body.vx).toBeCloseTo(ECHO_CONFIG.player.speed * 0.5, 0);
  });
  it('turns on an arc: reversing does not flip velocity instantly', () => {
    const { sim } = mkSim();
    sim.setInput(1, 0);
    run(sim, 0.5);
    sim.setInput(0, -1);
    sim.step(1 / 60);
    expect(sim.body.vx).toBeGreaterThan(100);
    expect(sim.body.vy).toBeLessThan(0);
  });
  it('heading follows the direction of travel', () => {
    const { sim } = mkSim();
    sim.setInput(1, 0);
    run(sim, 0.5);
    expect(sim.rotation).toBeCloseTo(0, 1);
  });
  it('walls stop the bat without sticking: it slides along', () => {
    const { sim } = mkSim();
    sim.body.x = 40;
    sim.setInput(-1, 0.5);
    run(sim, 2);
    expect(sim.body.x).toBeGreaterThanOrEqual(8 + sim.body.r - 1e-6);
    expect(sim.body.y).toBeGreaterThan(1000 + 50); // slid down along the left wall
  });
  it('can never leave the level, even at full speed for a long time', () => {
    const { sim } = mkSim(tiny({ walls: [] }));
    sim.setInput(1, 1);
    run(sim, 20);
    expect(sim.body.x).toBeLessThanOrEqual(380 - sim.body.r);
    expect(sim.body.y).toBeLessThanOrEqual(1500 - sim.body.r);
  });
  it('does not tunnel through a thin wall in a big time step', () => {
    const def = tiny({ walls: [{ x: 250, y: 0, width: 4, height: 1500, type: 'normal' }] });
    const { sim } = mkSim(def);
    sim.body.x = 200;
    sim.setInput(1, 0);
    for (let i = 0; i < 100; i++) sim.step(0.05); // longest allowed step
    expect(sim.body.x).toBeLessThan(250);
  });
  it('slow frames are clamped (no huge teleports after a hitch)', () => {
    const { sim } = mkSim();
    sim.setInput(1, 0);
    sim.step(5);
    expect(sim.elapsed).toBeCloseTo(ECHO_CONFIG.world.maxDt);
    expect(sim.body.x - 190).toBeLessThan(10);
  });
});

describe('GameSim: wall hits and momentum', () => {
  it('a wall impact resets momentum and emits one event, not a spam', () => {
    const { sim, events } = mkSim();
    sim.body.x = 100;
    sim.setInput(0, -1);
    run(sim, 3); // build some momentum going up (free space)
    expect(sim.momentum.value).toBeGreaterThan(1);
    sim.body.x = 100; // away from the finish ring at x=190
    sim.body.y = 150;
    sim.setInput(0, -1);
    run(sim, 3);
    expect(sim.momentum.value).toBe(1);
    expect(events.filter((e) => e === 'wall_hit').length).toBeLessThanOrEqual(12);
    expect(events).toContain('wall_hit');
  });
  it('grazing along a wall does not reset momentum', () => {
    const { sim } = mkSim();
    sim.body.x = 190;
    sim.body.y = 1400;
    sim.setInput(0, -1);
    run(sim, 3);
    const before = sim.momentum.value;
    expect(before).toBeGreaterThan(1);
    sim.body.x = 8 + sim.body.r; // hugging the left wall, moving along it
    sim.setInput(-0.02, -1);
    run(sim, 0.2);
    expect(sim.momentum.value).toBe(before);
  });
  it('standing still for 1.5 s resets momentum', () => {
    const { sim } = mkSim();
    sim.body.x = 100;
    sim.setInput(0, -1);
    run(sim, 3);
    expect(sim.momentum.value).toBeGreaterThan(1);
    sim.setInput(0, 0);
    run(sim, 3);
    expect(sim.momentum.value).toBe(1);
  });
});

describe('GameSim: pulses', () => {
  it('uses a charge, recharges, and refuses when empty', () => {
    const { sim, events } = mkSim();
    expect(sim.firePulse()).toBe(true);
    run(sim, 0.2);
    expect(sim.firePulse()).toBe(true);
    run(sim, 0.2);
    expect(sim.firePulse()).toBe(true);
    run(sim, 0.2);
    expect(sim.firePulse()).toBe(false);
    expect(events.filter((e) => e === 'pulse')).toHaveLength(3);
    expect(events).toContain('no_charge');
    expect(sim.pulsesUsed).toBe(3);
    run(sim, 3.6);
    expect(sim.energy.charges).toBe(1); // 4 s per charge, ~4.2 s elapsed
  });
  it('very fast taps are debounced and do not burn charges', () => {
    const { sim } = mkSim();
    expect(sim.firePulse()).toBe(true);
    for (let i = 0; i < 5; i++) {
      sim.step(0.005);
      expect(sim.firePulse()).toBe(false);
    }
    expect(sim.energy.charges).toBe(2);
  });
  it('a pulse lights nearby walls and leaves distant ones dark', () => {
    const { sim } = mkSim();
    sim.body.x = 40;
    sim.firePulse();
    run(sim, 0.5);
    const items = sim.world.revealables;
    const lit = items.map((_, i) => sim.reveal.glow[i] > 0);
    expect(lit.some(Boolean)).toBe(true);
    expect(lit.every(Boolean)).toBe(false);
  });
  it('cannot pulse while dead or finished', () => {
    const { sim } = mkSim(tiny({ spikes: [{ x: 180, y: 990, width: 20, height: 20 }] }));
    run(sim, 0.1);
    expect(sim.status).toBe('dying');
    expect(sim.firePulse()).toBe(false);
  });
  it('restart during a pulse clears waves and glow', () => {
    const { sim } = mkSim();
    sim.firePulse();
    run(sim, 0.1);
    expect(sim.waves.activeCount).toBe(1);
    sim.restart();
    expect(sim.waves.activeCount).toBe(0);
    expect(Array.from(sim.reveal.glow).every((g) => g === 0)).toBe(true);
    expect(sim.energy.charges).toBe(3);
  });
});

describe('GameSim: death and finish', () => {
  const spiky = () => tiny({ spikes: [{ x: 230, y: 960, width: 40, height: 80 }] });
  it('spikes kill; the death flow shakes ~0.3 s and auto-restarts within ~1 s', () => {
    const { sim, events } = mkSim(spiky());
    sim.setInput(1, 0);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(events).toContain('death');
    expect(sim.status).toBe('dying');
    expect(sim.failCause).toBe('spike');
    expect(sim.shake).toBeGreaterThan(0.25);
    const attempt = sim.attempt;
    run(sim, 0.4);
    expect(sim.shake).toBe(0); // 0.3 s shake is over
    expect(sim.status).toBe('dying');
    sim.setInput(0, 0);
    run(sim, 0.7); // 1.1 s after the death: auto-restarted
    expect(sim.status).toBe('playing');
    expect(sim.attempt).toBe(attempt + 1);
    expect(sim.body.x).toBe(190);
    expect(sim.body.y).toBe(1000);
    expect(sim.elapsed).toBeLessThan(0.1);
  });
  it('input is ignored while dying', () => {
    const { sim } = mkSim(spiky());
    sim.setInput(1, 0);
    run(sim, 1);
    expect(sim.status).toBe('dying');
    const x = sim.body.x;
    run(sim, 0.2);
    expect(sim.body.x).toBe(x);
  });
  it('restart is allowed in every state', () => {
    const { sim } = mkSim(spiky());
    sim.setInput(1, 0);
    run(sim, 1);
    expect(sim.status).toBe('dying');
    sim.restart();
    expect(sim.status).toBe('playing');
    sim.setInput(0, -1);
    run(sim, 15);
    expect(sim.status).toBe('won');
    sim.restart();
    expect(sim.status).toBe('playing');
    expect(sim.elapsed).toBe(0);
  });
  it('reaching the ring wins and freezes the run', () => {
    const { sim, events } = mkSim();
    sim.setInput(0, -1);
    run(sim, 10);
    expect(sim.status).toBe('won');
    expect(events).toContain('finish');
    const t = sim.elapsed;
    run(sim, 1);
    expect(sim.elapsed).toBe(t);
  });
  it('50 consecutive deaths and restarts never corrupt state', () => {
    const { sim } = mkSim(spiky());
    for (let n = 0; n < 50; n++) {
      sim.setInput(1, 0);
      run(sim, 1.1);
      expect(sim.status === 'dying' || sim.status === 'playing').toBe(true);
      sim.restart();
      expect(sim.body.x).toBe(190);
      expect(sim.momentum.value).toBe(1);
      expect(sim.energy.charges).toBe(3);
    }
    expect(sim.attempt).toBe(50);
  });
  it('is deterministic: the same inputs give the same run', () => {
    const go = () => {
      const { sim } = mkSim(loadAuthoredLevel(3, true)!);
      sim.setInput(0.7, -0.7);
      run(sim, 3);
      sim.firePulse();
      sim.setInput(-1, 0);
      run(sim, 2);
      return [sim.body.x, sim.body.y, sim.elapsed, sim.momentum.value];
    };
    expect(go()).toEqual(go());
  });
  it('onboarding hints advance with real actions', () => {
    const def = tiny({ hints: [{ text: 'a', until: 'move' }, { text: 'b', until: 'pulse' }] });
    const { sim } = mkSim(def);
    expect(sim.hints.current).toBe('a');
    sim.setInput(1, 0);
    run(sim, 0.3);
    expect(sim.hints.current).toBe('b');
    sim.firePulse();
    expect(sim.hints.current).toBeNull();
  });
});
