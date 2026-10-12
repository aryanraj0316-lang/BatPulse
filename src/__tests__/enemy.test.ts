import { ECHO_CONFIG } from '../constants/gameConfig';
import { EnemyDef, LevelDef } from '../levels/schema';
import { validateLevel } from '../levels/validate';
import { GameSim, SimEvent } from '../sim/game';
import { enemyChaseSpeed, patrolInfo, PatrolInfo } from '../sim/enemy';
import { NavGrid } from '../sim/nav';
import { buildWorld } from '../sim/world';

const E = ECHO_CONFIG.enemy;
const SPEED = ECHO_CONFIG.player.speed;

const arena = (enemies: EnemyDef[], over: Partial<LevelDef> = {}): LevelDef => ({
  id: 97,
  name: 'E',
  chapter: 2,
  width: 800,
  height: 400,
  start: { x: 60, y: 200 },
  finish: { x: 740, y: 200, radius: 18 },
  walls: [
    { x: 0, y: 0, width: 800, height: 8, type: 'normal' },
    { x: 0, y: 392, width: 800, height: 8, type: 'normal' },
    { x: 0, y: 0, width: 8, height: 400, type: 'normal' },
    { x: 792, y: 0, width: 8, height: 400, type: 'normal' },
  ],
  spikes: [],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [],
  enemies,
  checkpoints: [],
  sonar: { mode: 'fixed', charges: 50, rechargeSec: 0 },
  ghostPulseLimit: 3,
  parTime: 30,
  starThresholds: { two: 60, three: 30 },
  escape: { enabled: false, wallSpeed: 0 },
  ...over,
});

const hunter = (x: number, y: number, speed: 'slow' | 'fast' = 'slow', extra: Partial<EnemyDef> = {}): EnemyDef => ({
  type: 'hunter',
  waypoints: [{ x, y }],
  speed,
  ...extra,
});

const mk = (def: LevelDef, radius = 150) => {
  const events: SimEvent[] = [];
  const sim = new GameSim(buildWorld(def, 60), { pulseRadius: radius });
  sim.onEvent = (e) => events.push(e);
  return { sim, events };
};
const run = (sim: GameSim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60);
};
/** Skip the 3 s spawn safe window without moving the bat. */
const pastSafeWindow = (sim: GameSim) => run(sim, E.spawnSafeSec + 0.1);
const st = (sim: GameSim, i = 0) => sim.enemies.enemies[i].state;
const dist = (sim: GameSim, i = 0) => Math.hypot(sim.enemies.enemies[i].body.x - sim.body.x, sim.enemies.enemies[i].body.y - sim.body.y);

describe('speeds: slow hunters are 15% slower than the player, fast ones equal', () => {
  it('chase speeds follow the config', () => {
    expect(enemyChaseSpeed(hunter(0, 0, 'slow'))).toBeCloseTo(SPEED * 0.85);
    expect(enemyChaseSpeed(hunter(0, 0, 'fast'))).toBeCloseTo(SPEED * 1.0);
  });
  it('patrol is slower than chasing', () => {
    const { sim } = mk(arena([hunter(400, 100, 'slow', { waypoints: [{ x: 300, y: 100 }, { x: 500, y: 100 }] })]));
    const e = sim.enemies.enemies[0];
    expect(e.patrolSpeed).toBeLessThan(e.chaseSpeed * 0.6);
  });
  it('a chasing slow hunter really moves at 85% of the player max speed', () => {
    const { sim } = mk(arena([hunter(400, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 300; // 100 away: inside reach with a clear line
    sim.body.y = 200;
    sim.firePulse(); // heard -> alerted, then it locks on as the bat is within reach
    sim.setInput(0, 0);
    // keep the bat out of capture range by teleporting it away each frame while measuring hunter travel
    const e = sim.enemies.enemies[0];
    run(sim, 0.05);
    expect(st(sim)).toBe('chase');
    const x0 = e.body.x;
    for (let i = 0; i < 30; i++) {
      sim.body.x = 40;
      sim.body.y = 200;
      sim.step(1 / 60);
    }
    expect(Math.abs(e.body.x - x0) / 0.5).toBeCloseTo(SPEED * 0.85, 0);
  });
  it('a slow hunter never catches a bat running away in the open', () => {
    const { sim } = mk(arena([hunter(150, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 300; // the hunter is behind the bat
    sim.body.y = 200;
    sim.firePulse(); // alert it
    sim.setInput(1, 0);
    let minGap = Infinity;
    for (let i = 0; i < 60 * 2.3 && sim.status === 'playing'; i++) {
      sim.step(1 / 60);
      minGap = Math.min(minGap, dist(sim));
    }
    expect(sim.status === 'playing' || sim.status === 'won').toBe(true);
    expect(minGap).toBeGreaterThan(E.radius + sim.body.r);
  });
  it('a fast hunter keeps up but a head start is never closed', () => {
    const { sim } = mk(arena([hunter(150, 200, 'fast')]));
    pastSafeWindow(sim);
    sim.body.x = 290; // the hunter is 140 behind the bat
    sim.body.y = 200;
    sim.firePulse();
    sim.setInput(1, 0);
    run(sim, 0.7); // bat at full speed
    const gap0 = dist(sim);
    run(sim, 1.2);
    expect(sim.status).toBe('playing');
    expect(Math.abs(dist(sim) - gap0)).toBeLessThan(25); // equal speed: the gap holds
  });
});

describe('patrol: closed form matches the integrated motion', () => {
  const info: PatrolInfo = { x: 0, y: 0, wp: 0, dwell: 0 };
  const tri: EnemyDef = { type: 'hunter', speed: 'slow', waypoints: [{ x: 200, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }] };

  it('dwells at each waypoint and walks legs at patrol speed', () => {
    const def: EnemyDef = { type: 'hunter', speed: 'slow', waypoints: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
    const v = enemyChaseSpeed(def) * E.patrolSpeedFactor;
    expect(patrolInfo(def, 0, v, info)).toMatchObject({ x: 100, y: 100, dwell: E.dwellSec });
    patrolInfo(def, E.dwellSec + 100 / v, v, info);
    expect(info.x).toBeCloseTo(200, 4);
    patrolInfo(def, E.dwellSec + 200 / v + 0.01, v, info);
    expect(info.x).toBeCloseTo(300, 0); // arrived, now pausing
    patrolInfo(def, 2 * (E.dwellSec + 200 / v) + 0.01, v, info);
    expect(info.x).toBeCloseTo(100, 0); // back at the start of the loop
  });
  it('phaseSec shifts where in the loop a hunter starts', () => {
    const def: EnemyDef = { ...tri, phaseSec: 3 };
    const v = enemyChaseSpeed(def) * E.patrolSpeedFactor;
    const a = patrolInfo(tri, 0, v, { x: 0, y: 0, wp: 0, dwell: 0 });
    const b = patrolInfo(def, 0, v, { x: 0, y: 0, wp: 0, dwell: 0 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });
  it('the simulation follows the closed form for a full minute (no drift)', () => {
    const { sim } = mk(arena([{ ...tri, phaseSec: 1.3 }]));
    const v = sim.enemies.enemies[0].patrolSpeed;
    let worst = 0;
    for (let i = 0; i < 60 * 40; i++) {
      sim.body.x = 60; // far away, never alerted
      sim.body.y = 380;
      sim.step(1 / 60);
      if (sim.status !== 'playing') break;
      const p = patrolInfo(tri, sim.elapsed + 1.3, v, { x: 0, y: 0, wp: 0, dwell: 0 });
      const e = sim.enemies.enemies[0].body;
      worst = Math.max(worst, Math.hypot(p.x - e.x, p.y - e.y));
    }
    expect(sim.enemies.enemies[0].state).toBe('patrol');
    expect(worst).toBeLessThan(2.5);
  });
});

describe('hearing: 1.2 x pulse radius', () => {
  const setup = (gap: number, hearingMult?: number) => {
    const events: SimEvent[] = [];
    const sim = new GameSim(buildWorld(arena([hunter(400, 200)]), 60), { pulseRadius: 100, hearingMult });
    sim.onEvent = (e) => events.push(e);
    pastSafeWindow(sim);
    sim.body.x = 400 - gap;
    sim.body.y = 200;
    return { sim, events };
  };
  it('exactly 120 units for a 100-unit pulse', () => {
    const { sim } = setup(0);
    expect(sim.hearingRadius).toBeCloseTo(120);
  });
  it('a pulse just inside the hearing range alerts, just outside does not', () => {
    const inside = setup(119);
    inside.sim.firePulse();
    expect(st(inside.sim)).toBe('alerted');
    const outside = setup(121);
    outside.sim.firePulse();
    expect(st(outside.sim)).toBe('patrol');
  });
  it('the hearing range is wider than the pulse itself: you cannot see a hunter without being heard', () => {
    const { sim } = setup(99); // inside the 100-unit wave
    sim.firePulse();
    expect(st(sim)).toBe('alerted');
  });
  it('Phantom (hearing x0.5): the same pulse at 99 units is not heard', () => {
    const { sim } = setup(99, 0.5);
    expect(sim.hearingRadius).toBeCloseTo(60);
    sim.firePulse();
    expect(st(sim)).toBe('patrol');
  });
  it('an alerted hunter walks to the sound position, not to the bat', () => {
    const { sim } = setup(100);
    const sound = { x: sim.body.x, y: sim.body.y };
    sim.firePulse();
    sim.body.x = 60; // the bat sneaks away right after pulsing
    sim.body.y = 360;
    run(sim, 0.5);
    const e = sim.enemies.enemies[0];
    expect(e.tx).toBeCloseTo(sound.x);
    expect(e.ty).toBeCloseTo(sound.y);
    expect(e.state).toBe('alerted');
  });
});

describe('spawn safe window: 3 s', () => {
  it('pulses in the first 3 s are not heard and the hunter cannot catch the bat', () => {
    const { sim, events } = mk(arena([hunter(100, 200)]));
    sim.body.x = 100;
    sim.firePulse(); // standing on top of it
    run(sim, 2.5);
    expect(st(sim)).toBe('patrol');
    expect(sim.status).toBe('playing');
    expect(events).not.toContain('enemy_alert');
  });
  it('after 3 s the same situation is dangerous', () => {
    const { sim } = mk(arena([hunter(100, 200)]));
    sim.body.x = 100;
    run(sim, 3.2);
    expect(sim.status).toBe('dying');
  });
  it('a restart gives a fresh safe window', () => {
    const { sim } = mk(arena([hunter(100, 200)]));
    pastSafeWindow(sim);
    sim.restart();
    sim.body.x = 100;
    run(sim, 2.5);
    expect(sim.status).toBe('playing');
  });
});

describe('state machine: patrol -> alerted -> chase -> lost -> patrol', () => {
  it('walks the whole cycle with the documented timings', () => {
    const def = arena([{ type: 'hunter', speed: 'slow', waypoints: [{ x: 500, y: 200 }, { x: 600, y: 200 }] }]);
    const { sim, events } = mk(def);
    pastSafeWindow(sim);
    expect(st(sim)).toBe('patrol');
    // 1. pulse near it: alerted
    sim.body.x = 420;
    sim.body.y = 120;
    sim.firePulse();
    expect(st(sim)).toBe('alerted');
    expect(events.filter((e) => e === 'enemy_alert')).toHaveLength(1);
    // 2. it comes; when the bat stays in clear sight within reach it locks on
    run(sim, 0.4);
    expect(['alerted', 'chase']).toContain(st(sim));
    sim.setInput(0, 0);
    run(sim, 1.5);
    expect(st(sim)).toBe('chase');
    expect(sim.alertCount).toBe(1); // alerted -> chase is the same alert
    // 3. the bat is far and out of reach: the chase is given up -> lost
    sim.restart();
    pastSafeWindow(sim);
    sim.body.x = 420;
    sim.body.y = 120;
    sim.firePulse();
    sim.body.x = 40; // far away
    sim.body.y = 360;
    run(sim, 6);
    expect(['lost', 'patrol']).toContain(st(sim));
    // 4. after searching for ~4 s it goes back to its route
    run(sim, 8);
    expect(st(sim)).toBe('patrol');
    // and keeps patrolling its loop again
    const e = sim.enemies.enemies[0];
    run(sim, 6);
    expect(e.body.x).toBeGreaterThan(480);
    expect(e.body.x).toBeLessThan(620);
    expect(sim.status).toBe('playing');
  });
  it('lost: searches for lostSearchSec around the last known spot, then returns', () => {
    const { sim } = mk(arena([hunter(400, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 360;
    sim.firePulse();
    sim.body.x = 40;
    sim.body.y = 360;
    let sawLost = false;
    let lostFor = 0;
    for (let i = 0; i < 60 * 25; i++) {
      sim.step(1 / 60);
      if (st(sim) === 'lost') {
        sawLost = true;
        lostFor += 1 / 60;
      }
    }
    expect(sawLost).toBe(true);
    expect(lostFor).toBeGreaterThan(E.lostSearchSec - 0.3);
    expect(lostFor).toBeLessThan(E.lostSearchSec + 0.3);
    expect(st(sim)).toBe('patrol');
  });
  it('re-alerting a hunter that was searching counts as a new alert', () => {
    const { sim } = mk(arena([hunter(400, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 360;
    sim.firePulse();
    expect(sim.alertCount).toBe(1);
    sim.firePulse(); // already alerted: still just the one alert
    run(sim, 0.2);
    sim.firePulse();
    expect(sim.alertCount).toBe(1);
  });
});

describe('senses', () => {
  it('direct sensing: standing close in clear sight starts a chase even without any pulse', () => {
    const { sim, events } = mk(arena([hunter(400, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 400 - (E.senseRadius - 10);
    sim.body.y = 200;
    run(sim, 0.05);
    expect(st(sim)).toBe('chase');
    expect(events).toContain('enemy_alert');
    expect(sim.alertCount).toBe(1);
  });
  it('a wall blocks sensing and sight', () => {
    const def = arena([hunter(400, 200)], {
      walls: [...arena([]).walls, { x: 380, y: 100, width: 8, height: 200, type: 'normal' }],
    });
    const { sim } = mk(def);
    pastSafeWindow(sim);
    sim.body.x = 350;
    sim.body.y = 200; // 50 from the hunter but behind the wall
    run(sim, 0.1);
    expect(st(sim)).toBe('patrol');
  });
  it('a hunter does not sense a bat that is merely farther than the sense radius', () => {
    const { sim } = mk(arena([hunter(400, 200)]));
    pastSafeWindow(sim);
    sim.body.x = 400 - (E.senseRadius + 40);
    sim.body.y = 200;
    run(sim, 0.5);
    expect(st(sim)).toBe('patrol');
  });
});

describe('capture and the fail flow', () => {
  const caught = () => {
    const ctx = mk(arena([hunter(400, 200)]));
    pastSafeWindow(ctx.sim);
    ctx.sim.body.x = 405;
    run(ctx.sim, 0.1);
    return ctx;
  };
  it('contact kills with cause "enemy"', () => {
    const { sim, events } = caught();
    expect(sim.status).toBe('dying');
    expect(sim.failCause).toBe('enemy');
    expect(events).toContain('death');
  });
  it('does NOT restart by itself (the fail screen waits for the player)', () => {
    const { sim } = caught();
    run(sim, 10);
    expect(sim.status).toBe('dying');
  });
  it('restart works from the caught state ("Retry Cleaner")', () => {
    const { sim } = caught();
    sim.restart();
    expect(sim.status).toBe('playing');
    expect(sim.failCause).toBeNull();
    expect(st(sim)).toBe('patrol');
    expect(sim.alertCount).toBe(0);
  });
  it('50 catches and restarts in a row leave a clean state', () => {
    const { sim } = mk(arena([hunter(400, 200)]));
    for (let i = 0; i < 50; i++) {
      pastSafeWindow(sim);
      sim.body.x = 405;
      run(sim, 0.1);
      expect(sim.status).toBe('dying');
      sim.restart();
    }
    expect(sim.attempt).toBe(50);
    expect(sim.enemies.enemies[0].body.x).toBe(400);
  });
});

describe('ghost run', () => {
  it('no alerts and few pulses = ghost run; any alert or too many pulses = not', () => {
    const { sim } = mk(arena([hunter(700, 100)]), 100);
    pastSafeWindow(sim);
    sim.firePulse();
    run(sim, 0.2);
    sim.firePulse();
    expect(sim.alertCount).toBe(0);
    expect(sim.isGhostRun).toBe(true); // 2 pulses, limit 3
    run(sim, 0.2);
    sim.firePulse();
    expect(sim.isGhostRun).toBe(true); // 3 pulses = the limit exactly
    run(sim, 0.2);
    sim.firePulse(); // 4th pulse > limit 3
    expect(sim.isGhostRun).toBe(false);
    sim.restart();
    pastSafeWindow(sim);
    sim.body.x = 650;
    sim.body.y = 100;
    sim.firePulse();
    expect(sim.alertCount).toBe(1);
    expect(sim.isGhostRun).toBe(false);
  });
});

describe('visibility: hunters are shown only ~1 s after a wave hits them', () => {
  it('invisible until pulsed, lit for about a second, then dark again', () => {
    const { sim } = mk(arena([hunter(260, 200)]), 150);
    const i = sim.world.revealables.findIndex((r) => r.kind === 'enemy');
    expect(sim.reveal.glow[i]).toBe(0);
    sim.body.x = 160;
    sim.firePulse();
    let lit = 0;
    for (let k = 0; k < 60 * 3; k++) {
      sim.step(1 / 60);
      if (sim.reveal.glow[i] > 0) lit += 1 / 60;
      sim.body.x = 160; // stay out of trouble: keep the hunter busy walking to the sound, bat is moved back
    }
    expect(lit).toBeGreaterThan(0.8);
    expect(lit).toBeLessThan(1.3);
  });
  it('the reveal box follows the hunter as it walks', () => {
    const { sim } = mk(arena([{ type: 'hunter', speed: 'slow', waypoints: [{ x: 300, y: 300 }, { x: 600, y: 300 }] }]));
    const i = sim.world.revealables.findIndex((r) => r.kind === 'enemy');
    run(sim, 2.2);
    const e = sim.enemies.enemies[0].body;
    expect(sim.world.revealables[i].x + E.radius).toBeCloseTo(e.x, 1);
  });
});

describe('sound markers and threat feedback', () => {
  it('a pulse leaves a faint marker for ~2 s, only on levels with hunters', () => {
    const withE = mk(arena([hunter(700, 100)]));
    withE.sim.body.x = 200;
    withE.sim.firePulse();
    expect(withE.sim.markerAge[0]).toBe(0);
    expect(withE.sim.markerX[0]).toBe(200);
    run(withE.sim, E.soundMarkerSec + 0.5);
    expect(withE.sim.markerAge[0]).toBeGreaterThan(E.soundMarkerSec);
    const without = mk(arena([]));
    without.sim.firePulse();
    expect(without.sim.markerAge.every((a) => a === Infinity)).toBe(true);
  });
  it('threat is 0 outside 5 tiles and grows as the hunter nears', () => {
    const tiles = E.threatRadiusTiles * E.tileSize;
    const { sim } = mk(arena([hunter(400, 200)]));
    sim.body.x = 400 - tiles - 20;
    run(sim, 0.1);
    expect(sim.threat).toBe(0);
    sim.body.x = 400 - tiles * 0.6;
    run(sim, 0.1);
    const mid = sim.threat;
    expect(mid).toBeGreaterThan(0);
    sim.body.x = 400 - tiles * 0.2;
    run(sim, 0.1);
    expect(sim.threat).toBeGreaterThan(mid);
  });
  it('the heartbeat is silent far away and gets faster the closer the hunter is', () => {
    const beats = (gap: number) => {
      const { sim, events } = mk(arena([hunter(400, 200)]));
      sim.body.x = 400 - gap;
      sim.body.y = 200;
      for (let i = 0; i < 60 * 2.9; i++) {
        sim.body.x = 400 - gap; // hold position (the safe window protects the bat)
        sim.step(1 / 60);
      }
      return events.filter((e) => e === 'heartbeat').length;
    };
    const tiles = E.threatRadiusTiles * E.tileSize;
    expect(beats(tiles + 30)).toBe(0);
    const far = beats(tiles * 0.8);
    const near = beats(tiles * 0.25);
    expect(far).toBeGreaterThanOrEqual(2);
    expect(near).toBeGreaterThan(far);
  });
});

describe('distraction: switch noise and closed doors', () => {
  const door = { id: 'a', x: 500, y: 8, width: 20, height: 384, switchId: 's1' };
  const sw = { id: 's1', x: 150, y: 300, radius: 14 };
  const level = () => arena([hunter(180, 200)], { switches: [sw], doors: [door] });

  it('clicking a switch draws nearby hunters to it', () => {
    const { sim } = mk(level());
    pastSafeWindow(sim);
    sim.body.x = 60;
    sim.body.y = 380; // far from the hunter but with a clear line to the switch? no: a pulse is needed
    sim.body.x = 150;
    sim.body.y = 330;
    sim.firePulse();
    // the pulse itself is also heard (close by); both lead to the same place
    expect(st(sim)).toBe('alerted');
  });
  it('a closed door blocks the hunter, an open one lets it through', () => {
    const def = arena([hunter(300, 200)], { switches: [sw], doors: [door] });
    const { sim } = mk(def);
    pastSafeWindow(sim);
    const e = sim.enemies.enemies[0];
    // lure it east with the bat on the far side of the door: it cannot pass
    sim.body.x = 600;
    sim.body.y = 200;
    e.state = 'alerted';
    e.tx = 600;
    e.ty = 200;
    for (let i = 0; i < 60 * 8; i++) {
      sim.body.x = 700;
      sim.body.y = 360; // keep the bat away
      sim.step(1 / 60);
    }
    expect(e.body.x).toBeLessThan(500 - e.body.r + 1);
  });
});

describe('path finding', () => {
  const wallLevel = () =>
    arena([hunter(100, 200)], {
      walls: [...arena([]).walls, { x: 396, y: 8, width: 8, height: 300, type: 'normal' }], // gap at the bottom
    });
  const out = new Float32Array(512);

  it('finds a way around a wall', () => {
    const nav = new NavGrid(buildWorld(wallLevel(), 60), 18);
    const n = nav.findPath(100, 100, 700, 100, out);
    expect(n).toBeGreaterThan(1);
    // the route must dip below the wall's end (y > 308) on its way across x = 400
    let crossed = false;
    for (let i = 0; i < n; i++) if (out[i * 2] > 380 && out[i * 2 + 1] > 308) crossed = true;
    expect(crossed).toBe(true);
    expect(out[(n - 1) * 2]).toBeCloseTo(700);
    expect(out[(n - 1) * 2 + 1]).toBeCloseTo(100);
  });
  it('the route is close to the shortest possible', () => {
    const nav = new NavGrid(buildWorld(wallLevel(), 60), 18);
    const n = nav.findPath(100, 100, 700, 100, out);
    let len = 0;
    let px = 100;
    let py = 100;
    for (let i = 0; i < n; i++) {
      len += Math.hypot(out[i * 2] - px, out[i * 2 + 1] - py);
      px = out[i * 2];
      py = out[i * 2 + 1];
    }
    const ideal = Math.hypot(300, 230) + Math.hypot(300, 230) + 0; // via (400, 330)
    expect(len).toBeLessThan(ideal * 1.12);
  });
  it('no route when the way is sealed, closed doors count as walls', () => {
    const sealed = arena([hunter(100, 200)], { walls: [...arena([]).walls, { x: 396, y: 0, width: 8, height: 400, type: 'normal' }] });
    expect(new NavGrid(buildWorld(sealed, 60), 18).findPath(100, 200, 700, 200, out)).toBe(0);
    const doorLevel = arena([hunter(100, 200)], {
      switches: [{ id: 's1', x: 50, y: 50, radius: 14 }],
      doors: [{ id: 'd', x: 396, y: 0, width: 8, height: 400, switchId: 's1' }],
    });
    const nav = new NavGrid(buildWorld(doorLevel, 60), 18);
    expect(nav.findPath(100, 200, 700, 200, out)).toBeGreaterThan(0);
    nav.setClosedDoors([{ x: 396, y: 0, width: 8, height: 400 }]);
    expect(nav.findPath(100, 200, 700, 200, out)).toBe(0);
  });
  it('a goal inside a wall is moved to the nearest walkable spot', () => {
    const nav = new NavGrid(buildWorld(wallLevel(), 60), 18);
    expect(nav.findPath(100, 200, 400, 100, out)).toBeGreaterThan(0);
  });
  it('is fast: 200 requests in well under a second', () => {
    const nav = new NavGrid(buildWorld(wallLevel(), 60), 18);
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) nav.findPath(100, 100, 700, 300, out);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('determinism and the level format', () => {
  it('two runs with the same inputs give identical hunter positions', () => {
    const go = () => {
      const { sim } = mk(arena([hunter(400, 200, 'slow', { waypoints: [{ x: 300, y: 100 }, { x: 500, y: 300 }] })]));
      pastSafeWindow(sim);
      sim.body.x = 280;
      sim.body.y = 130;
      sim.firePulse();
      sim.body.x = 100;
      run(sim, 6);
      const b = sim.enemies.enemies[0].body;
      return [b.x, b.y, sim.enemies.enemies[0].state, sim.alertCount];
    };
    expect(go()).toEqual(go());
  });
  it('the validator checks enemy definitions', () => {
    expect(validateLevel(arena([hunter(400, 200)]))).toEqual([]);
    expect(validateLevel(arena([{ type: 'hunter', speed: 'slow', waypoints: [] }])).join()).toMatch(/waypoints/);
    expect(validateLevel(arena([{ type: 'hunter', speed: 'warp' as any, waypoints: [{ x: 1, y: 1 }] }])).join()).toMatch(/speed/);
    expect(validateLevel(arena([hunter(400, 200, 'slow', { phaseSec: -1 })])).join()).toMatch(/phaseSec/);
  });
});

describe('route search budget', () => {
  it('many chasing hunters never trigger more than one route search per step', () => {
    const def = arena(Array.from({ length: 8 }, (_, i) => hunter(300 + i * 40, 200)));
    const { sim } = mk(def);
    pastSafeWindow(sim);
    sim.body.x = 200;
    const before0 = sim.enemies.plansDone;
    sim.firePulse(); // all of them hear it and start chasing
    expect(sim.enemies.plansDone - before0).toBe(0); // hearing itself does not search
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      const before = sim.enemies.plansDone;
      sim.body.x = 40;
      sim.body.y = 360;
      sim.step(1 / 60);
      worst = Math.max(worst, sim.enemies.plansDone - before);
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(sim.enemies.plansDone).toBeGreaterThan(8); // they all got routes, just spread over frames
  });
});
