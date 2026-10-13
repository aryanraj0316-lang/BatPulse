import { ECHO_CONFIG } from '../constants/gameConfig';
import { EnemyDef, LevelDef, MovingHazardDef } from '../levels/schema';
import { validateLevel } from '../levels/validate';
import { GameSim, SimEvent } from '../sim/game';
import { patrolInfo } from '../sim/enemy';
import { hazardPose } from '../sim/hazards';
import { buildWorld, fitViewport, viewOffsetY } from '../sim/world';

const base = (over: Partial<LevelDef> = {}): LevelDef => ({
  id: 96,
  name: 'C',
  chapter: 3,
  width: 380,
  height: 1400,
  start: { x: 190, y: 1300 },
  finish: { x: 190, y: 60, radius: 18 },
  walls: [
    { x: 0, y: 0, width: 380, height: 8, type: 'normal' },
    { x: 0, y: 1392, width: 380, height: 8, type: 'normal' },
    { x: 0, y: 0, width: 8, height: 1400, type: 'normal' },
    { x: 372, y: 0, width: 8, height: 1400, type: 'normal' },
  ],
  spikes: [],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [],
  enemies: [],
  checkpoints: [{ x: 190, y: 900 }, { x: 190, y: 500 }],
  sonar: { mode: 'fixed', charges: 5, rechargeSec: 0 },
  ghostPulseLimit: 3,
  parTime: 30,
  starThresholds: { two: 60, three: 30 },
  escape: { enabled: false, wallSpeed: 0 },
  ...over,
});

const mk = (def: LevelDef) => {
  const events: SimEvent[] = [];
  const sim = new GameSim(buildWorld(def, 60), { pulseRadius: 150 });
  sim.onEvent = (e) => events.push(e);
  return { sim, events };
};
const run = (sim: GameSim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60);
};
const goTo = (sim: GameSim, x: number, y: number) => {
  sim.body.x = x;
  sim.body.y = y;
  sim.body.vx = 0;
  sim.body.vy = 0;
  sim.step(1 / 60);
};

describe('checkpoints', () => {
  it('touching one saves it (event + index); passing by without touching does not', () => {
    const { sim, events } = mk(base());
    goTo(sim, 190, 1000);
    expect(sim.lastCheckpoint).toBe(-1);
    goTo(sim, 190, 905);
    expect(sim.lastCheckpoint).toBe(0);
    expect(events.filter((e) => e === 'checkpoint')).toHaveLength(1);
    goTo(sim, 190, 905); // standing on it does not re-trigger
    expect(events.filter((e) => e === 'checkpoint')).toHaveLength(1);
    goTo(sim, 190, 505);
    expect(sim.lastCheckpoint).toBe(1);
  });

  it('death returns the bat to the last checkpoint, not the start', () => {
    const def = base({ spikes: [{ x: 150, y: 600, width: 80, height: 20 }] });
    const { sim, events } = mk(def);
    goTo(sim, 190, 905);
    sim.body.y = 640;
    sim.setInput(0, -1);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.status).toBe('dying');
    sim.setInput(0, 0);
    run(sim, 1.2);
    expect(sim.status).toBe('playing');
    expect(sim.body.x).toBe(190);
    expect(sim.body.y).toBe(900);
    expect(events).toContain('respawn');
  });

  it('with no checkpoint reached a death restarts at the start', () => {
    const def = base({ spikes: [{ x: 150, y: 1200, width: 80, height: 20 }] });
    const { sim } = mk(def);
    sim.setInput(0, -1);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.status).toBe('dying');
    sim.setInput(0, 0);
    run(sim, 1.2);
    expect(sim.body.y).toBe(1300);
    expect(sim.elapsed).toBeLessThan(0.2); // a true restart: the timer starts over
  });

  it('the run timer keeps counting through respawns, so stars are about the whole run', () => {
    const def = base({ spikes: [{ x: 150, y: 600, width: 80, height: 20 }] });
    const { sim } = mk(def);
    goTo(sim, 190, 905);
    run(sim, 5);
    const before = sim.elapsed;
    sim.body.y = 640;
    sim.setInput(0, -1);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    const atDeath = sim.elapsed;
    sim.setInput(0, 0);
    run(sim, 1.2);
    expect(sim.status).toBe('playing');
    expect(atDeath).toBeGreaterThan(before); // counted up to the death
    expect(sim.elapsed).toBeGreaterThanOrEqual(atDeath); // and carried on from there, never reset
  });

  it('a full restart forgets the checkpoints', () => {
    const { sim } = mk(base());
    goTo(sim, 190, 905);
    sim.restart();
    expect(sim.lastCheckpoint).toBe(-1);
    sim.respawn();
    expect(sim.body.y).toBe(1300);
  });

  it('works from the caught-by-a-hunter fail screen too (respawn = Retry Cleaner)', () => {
    const def = base({ enemies: [{ type: 'hunter', speed: 'slow', waypoints: [{ x: 190, y: 700 }] }] });
    const { sim } = mk(def);
    goTo(sim, 190, 905);
    run(sim, 3.2);
    sim.body.x = 190;
    sim.body.y = 700;
    run(sim, 0.2);
    expect(sim.status).toBe('dying');
    expect(sim.failCause).toBe('enemy');
    sim.respawn();
    expect(sim.status).toBe('playing');
    expect(sim.body.y).toBe(900);
  });
});

describe('checkpoint respawn restores a CONSISTENT world', () => {
  const door = { id: 'a', x: 160, y: 700, width: 60, height: 20, switchId: 's1' };
  const sw = { id: 's1', x: 190, y: 800, radius: 14 };
  const pk = [{ type: 'charge' as const, x: 100, y: 1100 }, { type: 'charge' as const, x: 100, y: 400 }];
  const slider: MovingHazardDef = { kind: 'slider', x: 40, y: 300, width: 40, height: 20, travel: { x: 200, y: 0 }, loopSec: 4 };
  const hunter: EnemyDef = { type: 'hunter', speed: 'slow', waypoints: [{ x: 100, y: 600 }, { x: 300, y: 600 }] };
  const lvl = () => base({ switches: [sw], doors: [door], pickups: pk, movingHazards: [slider], enemies: [hunter] });

  it('doors: the state at the checkpoint comes back (opened later = closed again)', () => {
    const { sim } = mk(lvl());
    goTo(sim, 190, 905); // checkpoint 0 with the door closed
    expect(sim.isDoorOpen(0)).toBe(false);
    sim.body.y = 860;
    sim.firePulse(); // opens the door
    run(sim, 0.4);
    expect(sim.isDoorOpen(0)).toBe(true);
    sim.respawn();
    expect(sim.isDoorOpen(0)).toBe(false);
    expect(sim.doorProgress(0)).toBe(0);
  });
  it('doors: one that was open at the checkpoint is open again with the same time left', () => {
    const { sim } = mk(lvl());
    goTo(sim, 190, 860);
    sim.firePulse();
    run(sim, 0.4);
    sim.body.y = 905;
    sim.step(1 / 60); // checkpoint reached while the door is open
    const left = sim.doorTimer[0];
    expect(left).toBeGreaterThan(7);
    run(sim, 3);
    sim.respawn();
    expect(sim.doorTimer[0]).toBeCloseTo(left, 5);
  });
  it('pickups: taken before the checkpoint stay taken, taken after come back; charges are restored', () => {
    const { sim } = mk(lvl());
    sim.firePulse(); // spend one so a pickup is useful
    run(sim, 0.3);
    goTo(sim, 100, 1100); // collect pickup 0 (before the checkpoint)
    expect(sim.pickupTaken[0]).toBe(1);
    goTo(sim, 190, 905); // checkpoint
    const chargesAtCp = sim.energy.charges;
    run(sim, 0.2);
    sim.firePulse();
    run(sim, 0.2);
    sim.firePulse();
    run(sim, 0.2);
    goTo(sim, 100, 400); // collect pickup 1 (after the checkpoint)
    expect(sim.pickupTaken[1]).toBe(1);
    sim.respawn();
    expect(sim.pickupTaken[0]).toBe(1);
    expect(sim.pickupTaken[1]).toBe(0);
    expect(sim.energy.charges).toBe(chargesAtCp);
  });
  it('moving hazards rewind to where they were when the checkpoint was reached', () => {
    const { sim } = mk(lvl());
    run(sim, 1.3);
    goTo(sim, 190, 905);
    const t0 = sim.worldTime;
    const expected = hazardPose(slider, t0, { x: 0, y: 0, angle: 0 }).x;
    run(sim, 2.2);
    expect(Math.abs(sim.poses[0].x - expected)).toBeGreaterThan(5);
    sim.respawn();
    expect(sim.worldTime).toBeCloseTo(t0, 5);
    expect(sim.poses[0].x).toBeCloseTo(expected, 3);
  });
  it('hunters go back on patrol exactly where the loop puts them at that moment, with a fresh 3 s safe window', () => {
    const { sim } = mk(lvl());
    run(sim, 1.7);
    goTo(sim, 190, 905);
    const t0 = sim.worldTime;
    run(sim, 6);
    sim.respawn();
    const info = patrolInfo(hunter, t0, sim.enemies.enemies[0].patrolSpeed, { x: 0, y: 0, wp: 0, dwell: 0 });
    expect(sim.enemies.enemies[0].body.x).toBeCloseTo(info.x, 3);
    expect(sim.enemies.enemies[0].body.y).toBeCloseTo(info.y, 3);
    expect(sim.enemies.enemies[0].state).toBe('patrol');
    expect(sim.armedAt).toBeCloseTo(t0 + ECHO_CONFIG.enemy.spawnSafeSec, 5);
    // standing on top of a hunter right after a respawn is safe for the 3 s window
    sim.body.x = sim.enemies.enemies[0].body.x;
    sim.body.y = sim.enemies.enemies[0].body.y;
    run(sim, 2.5);
    expect(sim.status).toBe('playing');
  });
  it('hunter alerts from before the death still count toward ghost-run (no free forgiveness)', () => {
    const { sim } = mk(lvl());
    goTo(sim, 190, 905);
    run(sim, 3.2);
    const h = sim.enemies.enemies[0].body;
    sim.body.x = h.x;
    sim.body.y = h.y + 110; // well inside hearing range, outside capture
    sim.firePulse();
    expect(sim.alertCount).toBe(1);
    sim.respawn();
    expect(sim.alertCount).toBe(1);
    expect(sim.isGhostRun).toBe(false);
  });
  it('50 deaths and respawns leave the state clean', () => {
    const def = base({ spikes: [{ x: 150, y: 700, width: 80, height: 20 }] });
    const { sim } = mk(def);
    goTo(sim, 190, 905);
    for (let i = 0; i < 50; i++) {
      sim.body.y = 740;
      sim.setInput(0, -1);
      for (let k = 0; k < 120 && sim.status === 'playing'; k++) sim.step(1 / 60);
      expect(sim.status).toBe('dying');
      sim.respawn();
      expect(sim.body.y).toBe(900);
      expect(sim.energy.charges).toBe(5);
    }
  });
});

describe('escape levels: the wall of darkness', () => {
  const esc = (speed = 100, extra: Partial<LevelDef> = {}) => base({ escape: { enabled: true, wallSpeed: speed }, checkpoints: [{ x: 190, y: 700 }], ...extra });

  it('starts behind the start point and rises at the speed from the level data', () => {
    const { sim } = mk(esc(100));
    const y0 = sim.escapeWallY;
    expect(y0).toBeCloseTo(1300 + ECHO_CONFIG.escape.defaultStartGap);
    sim.body.y = 200; // out of the way
    run(sim, 2);
    expect(y0 - sim.escapeWallY).toBeCloseTo(200, 0);
  });
  it('a level without escape has no wall', () => {
    expect(mk(base()).sim.escapeWallY).toBe(Infinity);
  });
  it('catching the bat kills it (cause escape_wall)', () => {
    const { sim, events } = mk(esc(150));
    sim.setInput(0, 0);
    for (let i = 0; i < 60 * 6 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.status).toBe('dying');
    expect(sim.failCause).toBe('escape_wall');
    expect(events).toContain('death');
  });
  it('a bat running away faster than the wall is never caught', () => {
    const { sim } = mk(esc(120));
    sim.setInput(0, -1);
    for (let i = 0; i < 60 * 5; i++) sim.step(1 / 60);
    expect(sim.status).toBe('playing');
    expect(sim.body.y).toBeLessThan(900);
  });
  it('warns before it arrives: heartbeat and a threat level inside the warning range', () => {
    const { sim, events } = mk(esc(60));
    sim.body.y = 1300;
    run(sim, 0.2);
    expect(sim.threat).toBeGreaterThan(0); // the wall starts 140 behind: inside the 180 warning range
    run(sim, 1);
    expect(events).toContain('heartbeat');
    sim.body.y = 200;
    run(sim, 0.2);
    expect(sim.threat).toBe(0);
  });
  it('fair checkpoints: after a respawn the wall is at least respawnGap behind the bat, and it keeps rising', () => {
    const { sim } = mk(esc(100));
    sim.setInput(0, -1);
    for (let i = 0; i < 60 * 5; i++) sim.step(1 / 60);
    goTo(sim, 190, 700); // reach the checkpoint, then die later
    sim.setInput(0, 0);
    run(sim, 1);
    for (let i = 0; i < 60 * 8 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.failCause).toBe('escape_wall');
    sim.respawn();
    expect(sim.escapeWallY - (sim.body.y + sim.body.r)).toBeGreaterThanOrEqual(ECHO_CONFIG.escape.respawnGap - 1e-6);
    const y1 = sim.escapeWallY;
    run(sim, 1);
    expect(y1 - sim.escapeWallY).toBeCloseTo(100, 0);
  });
  it('the death flow of an escape death auto-respawns at the checkpoint within about a second', () => {
    const { sim } = mk(esc(200));
    goTo(sim, 190, 700);
    sim.setInput(0, 0);
    for (let i = 0; i < 60 * 8 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(sim.status).toBe('dying');
    run(sim, 1.2);
    expect(sim.status).toBe('playing');
    expect(sim.body.y).toBe(700);
  });
  it('the validator needs a positive speed when escape is on', () => {
    expect(validateLevel(esc(100))).toEqual([]);
    expect(validateLevel(esc(0)).join()).toMatch(/wallSpeed/);
    expect(validateLevel(esc(100, { escape: { enabled: true, wallSpeed: 100, startGap: -5 } })).join()).toMatch(/startGap/);
  });
});

describe('scrolling camera for tall levels', () => {
  it('a level that fits is centred and does not scroll', () => {
    const v = fitViewport(400, 120, 700, 380, 660);
    expect(v.scrolls).toBe(false);
    expect(viewOffsetY(v, 0)).toBe(v.baseOffsetY);
    expect(viewOffsetY(v, 600)).toBe(v.baseOffsetY);
  });
  it('a tall level is scaled to the screen width and follows the bat', () => {
    const v = fitViewport(400, 120, 700, 380, 1400);
    expect(v.scrolls).toBe(true);
    expect(v.scale).toBeCloseTo(400 / 380);
    const bottom = viewOffsetY(v, 1390);
    const top = viewOffsetY(v, 10);
    expect(top).toBe(120); // top of the level at the top of the view area
    expect(bottom).toBeCloseTo(120 - (1400 - 700 / v.scale) * v.scale); // bottom of the level at the bottom
    const mid = viewOffsetY(v, 700);
    expect(mid).toBeLessThan(top);
    expect(mid).toBeGreaterThan(bottom);
  });
  it('keeps the bat at the middle of the view when it can', () => {
    const v = fitViewport(400, 120, 700, 380, 1400);
    const y = 700;
    const screenY = viewOffsetY(v, y) + y * v.scale;
    expect(screenY).toBeCloseTo(120 + 700 / 2);
  });
  it('never shows beyond the level', () => {
    const v = fitViewport(400, 120, 700, 380, 1400);
    for (let y = 0; y <= 1400; y += 50) {
      const off = viewOffsetY(v, y);
      expect(off).toBeLessThanOrEqual(120 + 1e-9);
      expect(off + 1400 * v.scale).toBeGreaterThanOrEqual(120 + 700 - 1e-6);
    }
  });
});
