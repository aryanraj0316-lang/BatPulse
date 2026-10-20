import { ECHO_CONFIG } from '../constants/gameConfig';
import { LevelDef } from '../levels/schema';
import { validateLevel } from '../levels/validate';
import { GameSim, SimEvent } from '../sim/game';
import { SonarEnergy } from '../sim/sonarEnergy';
import { buildWorld } from '../sim/world';

const ZONE = ECHO_CONFIG.safeZone;

const base = (over: Partial<LevelDef> = {}): LevelDef => ({
  id: 96,
  name: 'Keys and refuges lab',
  chapter: 3,
  width: 600,
  height: 400,
  start: { x: 60, y: 200 },
  finish: { x: 560, y: 200, radius: 18 },
  walls: [
    { x: 0, y: 0, width: 600, height: 8, type: 'normal' },
    { x: 0, y: 392, width: 600, height: 8, type: 'normal' },
    { x: 0, y: 0, width: 8, height: 400, type: 'normal' },
    { x: 592, y: 0, width: 8, height: 400, type: 'normal' },
  ],
  spikes: [],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [],
  enemies: [],
  checkpoints: [],
  sonar: { mode: 'fixed', charges: 5, rechargeSec: 0 },
  ghostPulseLimit: 5,
  parTime: 30,
  starThresholds: { two: 60, three: 30 },
  escape: { enabled: false, wallSpeed: 0 },
  ...over,
});

/** A locked door across the whole corridor at x = 300, its key off the straight path at (150, 330). */
const keyed = (over: Partial<LevelDef> = {}): LevelDef =>
  base({
    keys: [{ id: 'k1', x: 150, y: 330 }],
    doors: [{ id: 'dL', x: 300, y: 8, width: 20, height: 384, keyId: 'k1' }],
    ...over,
  });

const mk = (def: LevelDef) => {
  const events: SimEvent[] = [];
  const sim = new GameSim(buildWorld(def, 60), { pulseRadius: 200 });
  sim.onEvent = (e) => events.push(e);
  return { sim, events };
};
const run = (sim: GameSim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60);
};
/** Holds the stick towards (x, y) for up to `sec` seconds, stopping when it gets within 6 units. */
const flyTo = (sim: GameSim, x: number, y: number, sec = 6) => {
  for (let i = 0; i < Math.round(sec * 60) && sim.status === 'playing'; i++) {
    const dx = x - sim.body.x;
    const dy = y - sim.body.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) break;
    sim.setInput(dx / d, dy / d);
    sim.step(1 / 60);
  }
  sim.setInput(0, 0);
};
const teleport = (sim: GameSim, x: number, y: number) => {
  sim.body.x = x;
  sim.body.y = y;
  sim.body.vx = 0;
  sim.body.vy = 0;
};
const count = (events: SimEvent[], e: SimEvent) => events.filter((x) => x === e).length;

/* ------------------------------------------------------------------ level data */
describe('level data: keys, locked doors, safe zones', () => {
  it('a level with a key, its locked door and a safe zone is valid', () => {
    expect(validateLevel(keyed({ safeZones: [{ x: 400, y: 100, width: 60, height: 60 }] }))).toEqual([]);
  });
  it('levels without these lists are still valid (they are optional)', () => {
    expect(validateLevel(base())).toEqual([]);
  });
  it('rejects broken keys and doors', () => {
    const cases: [string, Partial<LevelDef>, RegExp][] = [
      ['a key that opens nothing', { keys: [{ id: 'k1', x: 150, y: 200 }] }, /opens no door/],
      ['a door with an unknown key', { doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384, keyId: 'nope' }] }, /matches no key/],
      ['a key outside the level', { keys: [{ id: 'k1', x: 900, y: 200 }], doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384, keyId: 'k1' }] }, /outside the level/],
      ['a door with no switch and no key', { doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384 }] }, /matches no switch/],
      ['two keys with the same id', { keys: [{ id: 'k1', x: 100, y: 200 }, { id: 'k1', x: 120, y: 200 }], doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384, keyId: 'k1' }] }, /duplicated/],
      ['two doors for one key', { keys: [{ id: 'k1', x: 100, y: 200 }], doors: [{ id: 'a', x: 300, y: 8, width: 20, height: 100, keyId: 'k1' }, { id: 'b', x: 300, y: 200, width: 20, height: 100, keyId: 'k1' }] }, /already opens/],
      ['keys that is not a list', { keys: 'x' as never }, /keys must be an array/],
    ];
    for (const [name, over, re] of cases) expect({ name, errs: validateLevel(base(over)).join(' | ') }).toEqual({ name, errs: expect.stringMatching(re) });
  });
  it('a door cannot have both a switch and a key', () => {
    const l = keyed({ switches: [{ id: 's1', x: 100, y: 100, radius: 14 }], doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384, keyId: 'k1', switchId: 's1' }] });
    expect(validateLevel(l).join()).toMatch(/both a switchId and a keyId/);
  });
  it('rejects safe zones that are broken, off the level, or too small for the bat', () => {
    expect(validateLevel(base({ safeZones: [{ x: 10, y: 10, width: 0, height: 50 }] })).join()).toMatch(/not a valid rect/);
    expect(validateLevel(base({ safeZones: [{ x: 580, y: 10, width: 60, height: 60 }] })).join()).toMatch(/outside the level/);
    expect(validateLevel(base({ safeZones: [{ x: 100, y: 100, width: 30, height: 60 }] })).join()).toMatch(/too small/);
  });
  it('the world links each door to its key and lists keys and zones', () => {
    const w = buildWorld(keyed({ safeZones: [{ x: 400, y: 100, width: 60, height: 60 }] }), 60);
    expect(w.doorKey).toEqual([0]);
    expect(w.doorSwitch).toEqual([-1]);
    expect(w.keys).toHaveLength(1);
    expect(w.safeZones).toHaveLength(1);
    expect(w.revealables.filter((r) => r.kind === 'key')).toHaveLength(1);
    const plain = buildWorld(base(), 60);
    expect(plain.keys).toEqual([]);
    expect(plain.safeZones).toEqual([]);
    expect(plain.doorKey).toEqual([]);
  });
});

/* ------------------------------------------------------------------ keys and locked doors */
describe('locked door: find the key, then open the door', () => {
  it('without the key the door is a wall', () => {
    const { sim, events } = mk(keyed());
    flyTo(sim, 400, 200, 6);
    expect(sim.body.x).toBeLessThan(300);
    expect(sim.isDoorOpen(0)).toBe(false);
    expect(count(events, 'unlock')).toBe(0);
    expect(sim.hasKey).toBe(false);
  });

  it('a pulse does not open it (it is not a switch door)', () => {
    const { sim } = mk(keyed());
    teleport(sim, 250, 200);
    sim.firePulse();
    run(sim, 1);
    expect(sim.isDoorOpen(0)).toBe(false);
  });

  it('flying over the key picks it up (once) and shows the key in the HUD state', () => {
    const { sim, events } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    expect(sim.keyTaken[0]).toBe(1);
    expect(sim.hasKey).toBe(true);
    expect(count(events, 'key')).toBe(1);
    run(sim, 1);
    expect(count(events, 'key')).toBe(1);
  });

  it('the key is hidden until a pulse lights it', () => {
    const { sim } = mk(keyed());
    const idx = sim.world.revealables.findIndex((r) => r.kind === 'key');
    run(sim, 0.5);
    expect(sim.reveal.glow[idx]).toBe(0);
    sim.firePulse();
    run(sim, 0.4);
    expect(sim.reveal.glow[idx]).toBeGreaterThan(0);
  });

  it('with the key, reaching the door unlocks it for good and the bat flies through', () => {
    const { sim, events } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 450, 200, 6);
    expect(count(events, 'unlock')).toBe(1);
    expect(sim.body.x).toBeGreaterThan(330);
    expect(sim.isDoorOpen(0)).toBe(true);
    expect(sim.hasKey).toBe(false); // the key is used up
  });

  it('the bat is not bumped back by the door it unlocks (no wall hit)', () => {
    const { sim, events } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 450, 200, 6);
    expect(count(events, 'wall_hit')).toBe(0);
  });

  it('an unlocked door never closes again, however long the level runs', () => {
    const { sim, events } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 450, 200, 6);
    run(sim, 120);
    expect(sim.isDoorOpen(0)).toBe(true);
    expect(count(events, 'door_close')).toBe(0);
    flyTo(sim, 200, 200, 6); // and back again
    flyTo(sim, 450, 200, 6);
    expect(sim.body.x).toBeGreaterThan(330);
  });

  it('the level can be finished only through the door', () => {
    const { sim } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 560, 200, 12);
    expect(sim.status).toBe('won');
    const { sim: locked } = mk(keyed());
    flyTo(locked, 560, 200, 12);
    expect(locked.status).toBe('playing');
  });

  it('a restart puts the key back and locks the door again', () => {
    const { sim } = mk(keyed());
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 450, 200, 6);
    sim.restart();
    expect(sim.keyTaken[0]).toBe(0);
    expect(sim.isDoorOpen(0)).toBe(false);
    expect(sim.hasKey).toBe(false);
  });

  it('a checkpoint remembers the key and the unlocked door: a death returns the bat with them', () => {
    const def = keyed({ checkpoints: [{ x: 450, y: 300 }], spikes: [{ x: 500, y: 100, width: 40, height: 20 }] });
    const { sim } = mk(def);
    flyTo(sim, 150, 330, 4);
    flyTo(sim, 450, 200, 6); // key taken, door unlocked
    flyTo(sim, 450, 300, 3); // checkpoint reached
    expect(sim.lastCheckpoint).toBe(0);
    teleport(sim, 520, 110); // into the spikes
    run(sim, 0.1);
    expect(sim.status).toBe('dying');
    run(sim, 2);
    expect(sim.status).toBe('playing');
    expect(sim.isDoorOpen(0)).toBe(true);
    expect(sim.keyTaken[0]).toBe(1);
  });

  it('a checkpoint reached BEFORE the key does not give the key', () => {
    const def = keyed({ checkpoints: [{ x: 100, y: 300 }], spikes: [{ x: 200, y: 100, width: 40, height: 20 }] });
    const { sim } = mk(def);
    flyTo(sim, 100, 300, 4);
    expect(sim.lastCheckpoint).toBe(0);
    flyTo(sim, 150, 330, 4);
    expect(sim.keyTaken[0]).toBe(1);
    teleport(sim, 220, 110);
    run(sim, 0.1);
    run(sim, 2);
    expect(sim.keyTaken[0]).toBe(0); // back as it was at the checkpoint: the key must be found again
    expect(sim.isDoorOpen(0)).toBe(false);
  });

  it('a hunter cannot walk through a locked door', () => {
    const def = keyed({ enemies: [{ type: 'hunter', waypoints: [{ x: 450, y: 200 }, { x: 450, y: 250 }], speed: 'slow' }] });
    const { sim } = mk(def);
    teleport(sim, 250, 200);
    sim.firePulse(); // loud: the hunter hears it, heads for the sound and is stopped by the door
    run(sim, 8);
    const h = sim.enemies.enemies[0];
    expect(h.body.x).toBeGreaterThan(300);
  });
});

/* ------------------------------------------------------------------ safe zones */
const ZONE_BOX = { x: 400, y: 150, width: 60, height: 60 }; // centre (430, 180)
const withZone = (over: Partial<LevelDef> = {}) => base({ safeZones: [ZONE_BOX], ...over });
const inZone = { x: 430, y: 180 };

describe('safe zone: hide, and wait for the sonar to refill', () => {
  it('entering a zone hides the bat (once), leaving ends it', () => {
    const { sim, events } = mk(withZone());
    expect(sim.hidden).toBe(false);
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    expect(sim.hidden).toBe(true);
    expect(sim.hiddenZone).toBe(0);
    expect(count(events, 'hide')).toBe(1);
    run(sim, 1);
    expect(count(events, 'hide')).toBe(1);
    teleport(sim, 200, 300);
    run(sim, 0.1);
    expect(sim.hidden).toBe(false);
    expect(sim.hiddenZone).toBe(-1);
  });

  it('the bat counts as inside by its centre, not its edge', () => {
    const { sim } = mk(withZone());
    teleport(sim, ZONE_BOX.x - 8, 180); // body overlaps the zone but the centre is outside
    run(sim, 0.2);
    expect(sim.hidden).toBe(false);
  });

  it('after leaving, the zone needs a short rest before it hides the bat again', () => {
    const { sim, events } = mk(withZone());
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.5);
    teleport(sim, 200, 300);
    run(sim, 0.1);
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.5);
    expect(sim.hidden).toBe(false); // too soon
    run(sim, ZONE.leaveCooldownSec);
    expect(sim.hidden).toBe(true);
    expect(count(events, 'hide')).toBe(2);
  });

  it('a stay lasts at most maxHideSec, then the bat is visible and the zone rests for a long time', () => {
    const { sim, events } = mk(withZone());
    teleport(sim, inZone.x, inZone.y);
    run(sim, ZONE.maxHideSec - 0.2);
    expect(sim.hidden).toBe(true);
    expect(count(events, 'expose')).toBe(0);
    run(sim, 0.4);
    expect(sim.hidden).toBe(false);
    expect(count(events, 'expose')).toBe(1);
    expect(sim.zoneCooldownLeft(0)).toBeGreaterThan(ZONE.expireCooldownSec - 1);
    run(sim, ZONE.expireCooldownSec - 2);
    expect(sim.hidden).toBe(false); // still resting
    run(sim, 2.5);
    expect(sim.hidden).toBe(true); // ready again and the bat is still inside
  });

  it('the time left counts down from 1 to 0', () => {
    const { sim } = mk(withZone());
    expect(sim.hideLeft).toBe(0);
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.1);
    expect(sim.hideLeft).toBeGreaterThan(0.95);
    run(sim, ZONE.maxHideSec / 2);
    expect(sim.hideLeft).toBeCloseTo(0.5, 1);
  });

  it('the sonar refills one charge per refillSecPerCharge while hiding, up to the maximum (fixed-charge level)', () => {
    const { sim } = mk(withZone({ sonar: { mode: 'fixed', charges: 5, rechargeSec: 0 } }));
    sim.energy.restore(1);
    teleport(sim, inZone.x, inZone.y);
    run(sim, ZONE.refillSecPerCharge * 1 + 0.2);
    expect(sim.energy.charges).toBe(2);
    run(sim, ZONE.refillSecPerCharge);
    expect(sim.energy.charges).toBe(3);
    // a full stay can never give more than floor(maxHideSec / refillSecPerCharge) charges
    sim.energy.restore(0);
    teleport(sim, 200, 300);
    run(sim, ZONE.leaveCooldownSec + 0.3);
    teleport(sim, inZone.x, inZone.y);
    run(sim, ZONE.maxHideSec + 1);
    expect(sim.energy.charges).toBeLessThanOrEqual(Math.floor(ZONE.maxHideSec / ZONE.refillSecPerCharge));
    expect(sim.energy.charges).toBeGreaterThan(0);
  });

  it('never refills past the maximum, and a full sonar stays full', () => {
    const { sim } = mk(withZone());
    teleport(sim, inZone.x, inZone.y);
    run(sim, 5);
    expect(sim.energy.charges).toBe(5);
  });

  it('progress towards the next charge is lost when you leave early (no banking)', () => {
    const e = new SonarEnergy({ mode: 'fixed', charges: 5, rechargeSec: 0 });
    e.restore(1);
    e.rest(ZONE.refillSecPerCharge - 0.1, ZONE.refillSecPerCharge);
    expect(e.charges).toBe(1);
    e.endRest();
    e.rest(0.2, ZONE.refillSecPerCharge);
    expect(e.charges).toBe(1); // the earlier 2.4 s did not carry over
  });

  it('resting is not available outside a zone: a fixed-charge sonar never comes back by itself', () => {
    const { sim } = mk(withZone());
    sim.energy.restore(1);
    run(sim, 20);
    expect(sim.energy.charges).toBe(1);
  });

  it('a recharging level keeps its normal recharge too', () => {
    const { sim } = mk(withZone({ sonar: { mode: 'recharge', charges: 5, rechargeSec: 4 } }));
    sim.energy.restore(1);
    run(sim, 4.2);
    expect(sim.energy.charges).toBe(2); // outside the zone: the usual 4 s
  });

  it('pulses still work while hiding and use charges', () => {
    const { sim } = mk(withZone());
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    const before = sim.energy.charges;
    expect(sim.firePulse()).toBe(true);
    expect(sim.energy.charges).toBe(before - 1);
  });

  it('a restart and a respawn put every zone back to ready', () => {
    const def = withZone({ checkpoints: [{ x: 100, y: 300 }], spikes: [{ x: 200, y: 100, width: 40, height: 20 }] });
    const { sim } = mk(def);
    flyTo(sim, 100, 300, 4);
    teleport(sim, inZone.x, inZone.y);
    run(sim, ZONE.maxHideSec + 0.5); // expired: resting
    expect(sim.zoneCooldownLeft(0)).toBeGreaterThan(0);
    teleport(sim, 220, 110);
    run(sim, 0.1);
    run(sim, 2); // respawn at the checkpoint
    expect(sim.zoneCooldownLeft(0)).toBe(0);
    expect(sim.hidden).toBe(false);
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.3);
    expect(sim.hidden).toBe(true);
    sim.restart();
    expect(sim.hidden).toBe(false);
    expect(sim.zoneCooldownLeft(0)).toBe(0);
    expect(sim.hideLeft).toBe(0);
  });
});

/* ------------------------------------------------------------------ safe zones vs hunters */
describe('safe zone: hunters lose the bat', () => {
  /** A hunter that patrols near the zone, with the 3 s spawn safe window already over. */
  const hunted = (speed: 'slow' | 'fast' = 'fast') => {
    const def = withZone({ enemies: [{ type: 'hunter', waypoints: [{ x: 330, y: 180 }], speed }] });
    const r = mk(def);
    run(r.sim, ECHO_CONFIG.enemy.spawnSafeSec + 0.2);
    return r;
  };

  it('a hunter that is chasing gives up when the bat hides, and searches where it last saw it', () => {
    const { sim } = hunted();
    teleport(sim, 380, 180); // 50 from the hunter: inside its sense radius, but not yet in reach
    run(sim, 0.1);
    const h = sim.enemies.enemies[0];
    expect(h.state).toBe('chase');
    const alerts = sim.alertCount;
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    expect(sim.hidden).toBe(true);
    expect(h.state).toBe('lost');
    expect(sim.alertCount).toBe(alerts); // hiding is not a new alert
  });

  it('a hidden bat cannot be caught, even with a hunter touching it', () => {
    const { sim } = hunted();
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    const h = sim.enemies.enemies[0];
    h.body.x = inZone.x + 10; // the hunter is right on top of the bat
    h.body.y = inZone.y;
    run(sim, 2);
    expect(sim.status).toBe('playing');
    expect(sim.hidden).toBe(true);
  });

  it('hunters do not notice a hidden bat standing in plain sight', () => {
    const { sim } = hunted();
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    const h = sim.enemies.enemies[0];
    h.body.x = inZone.x - 40; // well inside the sense radius, with a clear line
    h.body.y = inZone.y;
    h.state = 'patrol';
    run(sim, 1);
    expect(h.state).not.toBe('chase');
    expect(sim.status).toBe('playing');
  });

  it('when the stay runs out the bat is visible again and a nearby hunter catches it', () => {
    const { sim } = hunted();
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    const h = sim.enemies.enemies[0];
    h.body.x = inZone.x - 30;
    h.body.y = inZone.y;
    run(sim, ZONE.maxHideSec - 0.6);
    expect(sim.hidden).toBe(true);
    expect(sim.status).toBe('playing'); // hiding protected it for the whole stay, hunter right next to it
    run(sim, 3.2); // the stay runs out: visible again, and the hunter next to it catches it
    expect(sim.hidden).toBe(false);
    expect(sim.status).toBe('dying');
    expect(sim.failCause).toBe('enemy');
  });

  it('a pulse made while hiding is not heard: no alert, no sound marker', () => {
    const { sim } = hunted('slow');
    teleport(sim, inZone.x, inZone.y);
    run(sim, 0.2);
    const h = sim.enemies.enemies[0];
    h.body.x = inZone.x - 60; // inside the hearing range of a pulse
    h.body.y = inZone.y;
    h.state = 'patrol';
    const alerts = sim.alertCount;
    sim.firePulse();
    run(sim, 0.3);
    expect(sim.alertCount).toBe(alerts);
    expect(h.state).toBe('patrol');
    expect(sim.markerAge.every((a) => a > 1)).toBe(true);
  });

  it('control: the same pulse made outside a zone IS heard', () => {
    const { sim } = hunted('slow');
    teleport(sim, 330, 300);
    run(sim, 0.2);
    const h = sim.enemies.enemies[0];
    h.body.x = 330;
    h.body.y = 250;
    h.state = 'patrol';
    sim.firePulse();
    run(sim, 0.1);
    expect(sim.alertCount).toBeGreaterThan(0);
  });

  it('a zone is a real refuge: chased across the level, hide, wait out the search, refill, leave', () => {
    const { sim } = hunted();
    sim.energy.restore(0); // out of sonar
    teleport(sim, 380, 180);
    run(sim, 0.1);
    expect(sim.enemies.enemies[0].state).toBe('chase');
    teleport(sim, inZone.x, inZone.y);
    run(sim, ZONE.maxHideSec - 0.5);
    expect(sim.status).toBe('playing');
    expect(sim.energy.charges).toBeGreaterThanOrEqual(2); // two charges came back while hiding
    expect(sim.enemies.enemies[0].state).not.toBe('chase');
  });
});

/* ------------------------------------------------------------------ the rest of the game is untouched */
describe('nothing else changed', () => {
  it('a level without keys or zones behaves exactly as before', () => {
    const { sim } = mk(base());
    flyTo(sim, 560, 200, 10);
    expect(sim.status).toBe('won');
    expect(sim.hidden).toBe(false);
    expect(sim.hasKey).toBe(false);
    expect(sim.keyTaken.length).toBe(0);
  });
  it('switch doors still open for a few seconds and close again', () => {
    const def = base({ switches: [{ id: 's1', x: 150, y: 100, radius: 14 }], doors: [{ id: 'd', x: 300, y: 8, width: 20, height: 384, switchId: 's1' }] });
    const { sim, events } = mk(def);
    teleport(sim, 150, 160);
    sim.firePulse();
    run(sim, 0.8);
    expect(sim.isDoorOpen(0)).toBe(true);
    run(sim, ECHO_CONFIG.door.openSec + 1);
    expect(sim.isDoorOpen(0)).toBe(false);
    expect(count(events, 'door_close')).toBe(1);
  });
});
