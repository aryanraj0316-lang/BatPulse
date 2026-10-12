import { ECHO_CONFIG } from '../constants/gameConfig';
import { LevelDef, MovingHazardDef } from '../levels/schema';
import { validateLevel } from '../levels/validate';
import { circleHitsHazard, hazardPose, pingPong, segmentHitsBox } from '../sim/hazards';
import { GameSim, SimEvent } from '../sim/game';
import { buildWorld } from '../sim/world';

const base = (over: Partial<LevelDef> = {}): LevelDef => ({
  id: 98,
  name: 'M',
  chapter: 1,
  width: 400,
  height: 400,
  start: { x: 60, y: 200 },
  finish: { x: 360, y: 40, radius: 18 },
  walls: [
    { x: 0, y: 0, width: 400, height: 8, type: 'normal' },
    { x: 0, y: 392, width: 400, height: 8, type: 'normal' },
    { x: 0, y: 0, width: 8, height: 400, type: 'normal' },
    { x: 392, y: 0, width: 8, height: 400, type: 'normal' },
  ],
  spikes: [],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [],
  enemies: [],
  checkpoints: [],
  sonar: { mode: 'fixed', charges: 3, rechargeSec: 0 },
  ghostPulseLimit: 3,
  parTime: 20,
  starThresholds: { two: 30, three: 20 },
  escape: { enabled: false, wallSpeed: 0 },
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

describe('moving hazards: motion', () => {
  const slider: MovingHazardDef = { kind: 'slider', x: 100, y: 100, width: 20, height: 40, travel: { x: 100, y: 0 }, loopSec: 4 };
  const pose = { x: 0, y: 0, angle: 0 };

  it('pingPong is a smooth 0 -> 1 -> 0 cycle', () => {
    expect(pingPong(0, 4)).toBeCloseTo(0);
    expect(pingPong(2, 4)).toBeCloseTo(1);
    expect(pingPong(4, 4)).toBeCloseTo(0);
    expect(pingPong(1, 4)).toBeCloseTo(0.5);
    expect(pingPong(0, 4, 0.5)).toBeCloseTo(1); // phase shifts the cycle
  });
  it('a slider travels out and back over exactly one loop', () => {
    expect(hazardPose(slider, 0, pose).x).toBeCloseTo(100);
    expect(hazardPose(slider, 2, pose).x).toBeCloseTo(200);
    expect(hazardPose(slider, 4, pose).x).toBeCloseTo(100);
    expect(hazardPose(slider, 1, pose).y).toBe(100);
  });
  it('loops of 2-4 s as the spec asks are accepted by the validator, bad data is not', () => {
    expect(validateLevel(base({ movingHazards: [slider] }))).toEqual([]);
    expect(validateLevel(base({ movingHazards: [{ ...slider, travel: undefined }] })).join()).toMatch(/travel/);
    expect(validateLevel(base({ movingHazards: [{ ...slider, phase: 2 }] })).join()).toMatch(/phase/);
  });
});

describe('moving hazards: hit tests', () => {
  const blade: MovingHazardDef = { kind: 'blade', x: 100, y: 100, width: 80, height: 80, loopSec: 4 };
  const pose = { x: 100, y: 100, angle: 0 };
  const r = ECHO_CONFIG.player.radius;

  it('a circle touching a slider dies, one clear of it does not', () => {
    const s: MovingHazardDef = { kind: 'slider', x: 100, y: 100, width: 20, height: 40, travel: { x: 0, y: 0 }, loopSec: 3 };
    const p = hazardPose(s, 0, { x: 0, y: 0, angle: 0 });
    expect(circleHitsHazard(s, p, 110, 120, r)).toBe(true);
    expect(circleHitsHazard(s, p, 160, 120, r)).toBe(false);
  });
  it('blade: the arms hurt, the gaps between them do not', () => {
    pose.angle = 0; // arms along the axes
    expect(circleHitsHazard(blade, pose, 140 + 30, 140, r)).toBe(true); // on the horizontal arm
    expect(circleHitsHazard(blade, pose, 140, 140 - 30, r)).toBe(true); // on the vertical arm
    expect(circleHitsHazard(blade, pose, 140 + 28, 140 + 28, r)).toBe(false); // diagonal gap
  });
  it('blade: the cross rotates, so the danger moves', () => {
    pose.angle = Math.PI / 4;
    expect(circleHitsHazard(blade, pose, 140 + 28, 140 + 28, r)).toBe(true); // now on an arm
    expect(circleHitsHazard(blade, pose, 140 + 30, 140, r)).toBe(false);
  });
  it('blade: the whole cross is within its box (nothing hurts outside it)', () => {
    for (let a = 0; a < Math.PI; a += 0.3) {
      pose.angle = a;
      expect(circleHitsHazard(blade, pose, 140 + 80, 140, r)).toBe(false);
    }
  });
  it('segmentHitsBox (line of sight)', () => {
    const wall = { x: 100, y: 0, width: 10, height: 100 };
    expect(segmentHitsBox(0, 50, 200, 50, wall)).toBe(true);
    expect(segmentHitsBox(0, 150, 200, 150, wall)).toBe(false);
    expect(segmentHitsBox(0, 50, 90, 50, wall)).toBe(false); // stops short
    expect(segmentHitsBox(105, 0, 105, 200, wall)).toBe(true); // vertical line
  });
});

describe('moving hazards in the simulation', () => {
  const hz: MovingHazardDef = { kind: 'slider', x: 200, y: 150, width: 20, height: 100, travel: { x: 0, y: 0 }, loopSec: 3 };

  it('touching a hazard kills with cause "hazard"', () => {
    const { sim, events } = mk(base({ movingHazards: [hz] }));
    sim.setInput(1, 0);
    for (let i = 0; i < 120 && sim.status === 'playing'; i++) sim.step(1 / 60);
    expect(events).toContain('death');
    expect(sim.failCause).toBe('hazard');
  });
  it('timing matters: a slider that has moved away leaves a safe window', () => {
    const moving: MovingHazardDef = { kind: 'slider', x: 200, y: 150, width: 20, height: 100, travel: { x: 0, y: 150 }, loopSec: 4 };
    const { sim } = mk(base({ movingHazards: [moving] }));
    // at t=2 s the slider is 150 units down: the lane y=200 is free
    run(sim, 1.9);
    sim.setInput(1, 0);
    sim.body.x = 140;
    sim.body.y = 200;
    run(sim, 1.3);
    expect(sim.status).toBe('playing');
    expect(sim.body.x).toBeGreaterThan(220);
  });
  it('the hazard keeps the same schedule after a restart (deterministic)', () => {
    const { sim } = mk(base({ movingHazards: [{ ...hz, travel: { x: 100, y: 0 } }] }));
    run(sim, 1.3);
    const x1 = sim.poses[0].x;
    sim.restart();
    run(sim, 1.3);
    expect(sim.poses[0].x).toBeCloseTo(x1, 4);
  });
  it('the reveal box follows the moving hazard', () => {
    const { sim } = mk(base({ movingHazards: [{ ...hz, travel: { x: 100, y: 0 } }] }));
    const i = sim.world.revealables.findIndex((r) => r.kind === 'hazard');
    run(sim, 2); // half a loop of 3 s = 1.5 s: at 2 s it is travelling back
    expect(sim.world.revealables[i].x).toBeCloseTo(sim.poses[0].x, 4);
    expect(sim.world.revealables[i].x).toBeGreaterThan(200);
  });
  it('a pulse reveals a hazard', () => {
    const { sim } = mk(base({ movingHazards: [{ ...hz, x: 120 }] }));
    sim.firePulse();
    run(sim, 0.4);
    const i = sim.world.revealables.findIndex((r) => r.kind === 'hazard');
    expect(sim.reveal.glow[i]).toBeGreaterThan(0);
  });
});

describe('switches and doors', () => {
  const door = { id: 'a', x: 200, y: 8, width: 20, height: 384, switchId: 's1' };
  const sw = { id: 's1', x: 120, y: 300, radius: 14 };
  const level = () => base({ switches: [sw], doors: [door], pickups: [] });

  it('a closed door blocks the bat', () => {
    const { sim } = mk(level());
    sim.setInput(1, 0);
    run(sim, 3);
    expect(sim.body.x).toBeLessThanOrEqual(200 - sim.body.r + 0.01);
  });
  it('a pulse that reaches the switch opens the door for 8 s with a countdown, then it closes', () => {
    const { sim, events } = mk(level());
    expect(sim.firePulse()).toBe(true);
    run(sim, 0.5);
    expect(events).toContain('switch');
    expect(events).toContain('door_open');
    expect(sim.isDoorOpen(0)).toBe(true);
    expect(sim.isSwitchLit(0)).toBe(true);
    expect(sim.doorProgress(0)).toBeGreaterThan(0.9);
    run(sim, 4);
    expect(sim.doorProgress(0)).toBeGreaterThan(0.35);
    expect(sim.doorProgress(0)).toBeLessThan(0.55); // about half way after ~4.5 s of 8
    run(sim, 4);
    expect(sim.isDoorOpen(0)).toBe(false);
    expect(sim.isSwitchLit(0)).toBe(false);
    expect(events).toContain('door_close');
  });
  it('the bat can pass while the door is open', () => {
    const { sim } = mk(level());
    sim.firePulse();
    run(sim, 0.3);
    sim.setInput(1, 0);
    run(sim, 1.6);
    expect(sim.body.x).toBeGreaterThan(230);
  });
  it('a pulse too far from the switch does nothing', () => {
    const { sim } = mk(level());
    sim.body.x = 20;
    sim.body.y = 40;
    sim.setInput(0, 0);
    // pulse radius 200: distance to the switch (120,300) from (20,40) is ~278
    sim.firePulse();
    run(sim, 0.5);
    expect(sim.isDoorOpen(0)).toBe(false);
  });
  it('a pulse does NOT trigger a switch hidden behind a wall (needs a direct hit)', () => {
    const def = level();
    def.walls.push({ x: 60, y: 240, width: 120, height: 8, type: 'normal' }); // wall between bat and switch
    const { sim } = mk(def);
    sim.body.x = 120;
    sim.body.y = 200;
    sim.firePulse();
    run(sim, 0.5);
    expect(sim.isDoorOpen(0)).toBe(false);
  });
  it('hitting the switch again restarts the 8 s countdown', () => {
    const { sim } = mk(level());
    sim.firePulse();
    run(sim, 5);
    expect(sim.doorProgress(0)).toBeLessThan(0.5);
    sim.firePulse();
    run(sim, 0.4);
    expect(sim.doorProgress(0)).toBeGreaterThan(0.9);
  });
  it('a door never closes on top of the bat: it waits until the bat is clear', () => {
    const { sim } = mk(level());
    sim.firePulse();
    run(sim, 0.3);
    sim.body.x = 210; // standing inside the doorway
    sim.body.y = 200;
    sim.setInput(0, 0);
    run(sim, 9);
    expect(sim.isDoorOpen(0)).toBe(true); // still held open
    expect(sim.status).toBe('playing');
    sim.setInput(1, 0);
    run(sim, 1);
    expect(sim.isDoorOpen(0)).toBe(false); // closes behind the bat
    expect(sim.body.x).toBeGreaterThan(220);
  });
  it('doors and switches are revealable, the countdown state resets on restart', () => {
    const { sim } = mk(level());
    expect(sim.world.revealables.some((r) => r.kind === 'door')).toBe(true);
    expect(sim.world.revealables.some((r) => r.kind === 'switch')).toBe(true);
    sim.firePulse();
    run(sim, 0.5);
    sim.restart();
    expect(sim.isDoorOpen(0)).toBe(false);
    sim.setInput(1, 0);
    run(sim, 3);
    expect(sim.body.x).toBeLessThanOrEqual(200 - sim.body.r + 0.01); // closed again, solid again
  });
  it('the validator rejects a door whose switch does not exist', () => {
    expect(validateLevel(base({ doors: [door] })).join()).toMatch(/matches no switch/);
  });
});

describe('charge pickups', () => {
  const pk = { type: 'charge' as const, x: 100, y: 200 };

  it('refills one charge and is used up', () => {
    const { sim, events } = mk(base({ pickups: [pk] }));
    sim.firePulse();
    run(sim, 0.3);
    expect(sim.energy.charges).toBe(2);
    sim.body.x = 100;
    run(sim, 0.1);
    expect(sim.energy.charges).toBe(3);
    expect(events).toContain('pickup');
    expect(sim.pickupTaken[0]).toBe(1);
  });
  it('is not wasted when the charges are already full', () => {
    const { sim } = mk(base({ pickups: [pk] }));
    sim.body.x = 100;
    run(sim, 0.5);
    expect(sim.pickupTaken[0]).toBe(0);
    sim.firePulse();
    run(sim, 0.3);
    expect(sim.pickupTaken[0]).toBe(1); // still there, taken once it is useful
  });
  it('is available again after a restart', () => {
    const { sim } = mk(base({ pickups: [pk] }));
    sim.firePulse();
    run(sim, 0.3);
    sim.body.x = 100;
    run(sim, 0.2);
    expect(sim.pickupTaken[0]).toBe(1);
    sim.restart();
    expect(sim.pickupTaken[0]).toBe(0);
    expect(sim.energy.charges).toBe(3);
  });
  it('fixed mode never recharges on its own, only pickups give charges back', () => {
    const { sim } = mk(base({ pickups: [pk] }));
    sim.firePulse();
    run(sim, 30);
    expect(sim.energy.charges).toBe(2);
  });
});

describe('moving walls on surfaces', () => {
  it('crystal and mossy wall pieces carry their variant into the world', () => {
    const def = base({
      walls: [
        ...base().walls,
        { x: 100, y: 100, width: 100, height: 8, type: 'crystal' },
        { x: 100, y: 300, width: 100, height: 8, type: 'mossy' },
      ],
    });
    const w = buildWorld(def, 60);
    expect(w.revealables.some((r) => r.variant === 'crystal')).toBe(true);
    expect(w.revealables.some((r) => r.variant === 'mossy')).toBe(true);
  });
});
