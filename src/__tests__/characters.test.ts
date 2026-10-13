import { ECHO_CONFIG } from '../constants/gameConfig';
import { LevelDef } from '../levels/schema';
import { GameSim } from '../sim/game';
import { buildWorld } from '../sim/world';
import { CHARACTER_IDS, characterStats, isCharacterId, momentumText, simParamsFor, statBars, visualKeyOf } from '../game/characters';
import { BAT_KEYS } from '../assets/keys';

const BASE_RADIUS = 200;

const def = (): LevelDef => ({
  id: 97,
  name: 'Ability lab',
  chapter: 1,
  width: 400,
  height: 400,
  start: { x: 60, y: 200 },
  finish: { x: 360, y: 40, radius: 18 },
  walls: [{ x: 120, y: 150, width: 20, height: 100, type: 'normal' }],
  spikes: [{ x: 140, y: 280, width: 20, height: 20 }],
  movingHazards: [],
  switches: [],
  doors: [],
  pickups: [{ type: 'charge', x: 110, y: 320 }],
  enemies: [{ type: 'hunter', waypoints: [{ x: 300, y: 300 }, { x: 340, y: 300 }], speed: 'slow' }],
  checkpoints: [],
  sonar: { mode: 'fixed', charges: 5, rechargeSec: 0 },
  ghostPulseLimit: 5,
  parTime: 20,
  starThresholds: { two: 30, three: 20 },
  escape: { enabled: false, wallSpeed: 0 },
});

const make = (id: string) => {
  const world = buildWorld(def(), 60);
  return { sim: new GameSim(world, simParamsFor(id, BASE_RADIUS)), world };
};
const run = (sim: GameSim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60);
};

/** Seconds a revealable stays lit after one pulse (counted until it is dark again). */
function litSeconds(id: string, kind: 'wall' | 'spike' | 'pickup'): number {
  const { sim, world } = make(id);
  const idx = world.revealables.findIndex((r) => r.kind === kind);
  expect(idx).toBeGreaterThanOrEqual(0);
  sim.firePulse();
  let lit = 0;
  for (let i = 0; i < 60 * 20; i++) {
    sim.step(1 / 60);
    if (sim.reveal.glow[idx] > 0.001) lit += 1 / 60;
    else if (lit > 0) break;
  }
  return lit;
}

describe('roster data', () => {
  it('has the five bats with the spec prices, in shop order', () => {
    expect(CHARACTER_IDS.map((i) => characterStats(i).name)).toEqual(['The Rookie', 'Vesper', 'Sonar-Bot', 'Phantom', 'Turbo Moth']);
    expect(CHARACTER_IDS.map((i) => characterStats(i).price)).toEqual([0, 1500, 3500, 6000, 10000]);
  });
  it('every bat has a registry visual key', () => {
    expect([...CHARACTER_IDS].map(visualKeyOf)).toEqual(BAT_KEYS);
    expect(visualKeyOf('nonsense')).toBe('bat_rookie');
  });
  it('unknown ids fall back to the Rookie instead of crashing', () => {
    expect(isCharacterId('bat_vesper')).toBe(true);
    expect(isCharacterId('x')).toBe(false);
    expect(characterStats('x').name).toBe('The Rookie');
    expect(simParamsFor('x', 100)).toEqual(simParamsFor('bat_rookie', 100));
  });
});

describe('ability numbers', () => {
  it('Rookie is the unmodified baseline', () => {
    expect(simParamsFor('bat_rookie', BASE_RADIUS)).toEqual({ pulseRadius: 200, glowBonusSec: 0, momentumRateMult: 1, momentumMax: 2, hearingMult: 1 });
  });

  it('Vesper: walls and spikes glow exactly 2 s longer; other things do not change', () => {
    const base = ECHO_CONFIG.sonar.revealGlowSec;
    const wallRookie = litSeconds('bat_rookie', 'wall');
    const wallVesper = litSeconds('bat_vesper', 'wall');
    expect(wallVesper - wallRookie).toBeGreaterThan(1.8);
    expect(wallVesper - wallRookie).toBeLessThan(2.1);
    // the glow curve fades out, so the visible time is a little under the nominal one: compare against the nominal
    expect(wallRookie).toBeLessThanOrEqual(base + 0.05);
    expect(wallVesper).toBeLessThanOrEqual(base + 2 + 0.05);
    const spikeDiff = litSeconds('bat_vesper', 'spike') - litSeconds('bat_rookie', 'spike');
    expect(spikeDiff).toBeGreaterThan(1.8);
    expect(spikeDiff).toBeLessThan(2.1);
    // a pickup is not a wall or a spike: no change
    expect(litSeconds('bat_vesper', 'pickup')).toBeCloseTo(litSeconds('bat_rookie', 'pickup'), 2);
  });

  it('Sonar-Bot: the pulse reaches 1.5x as far', () => {
    const a = make('bat_rookie').sim;
    const b = make('bat_sonarbot').sim;
    a.firePulse();
    b.firePulse();
    expect(b.waves.maxRadius[0] / a.waves.maxRadius[0]).toBeCloseTo(1.5, 5);
    expect(a.waves.maxRadius[0]).toBeCloseTo(BASE_RADIUS, 5);
  });

  it('Sonar-Bot lights a wall the Rookie cannot reach', () => {
    // the pickup is ~120 away from the start: put it beyond a Rookie radius of 110 but inside Sonar-Bot x1.5
    const far = (id: string) => {
      const d = def();
      d.pickups = [{ type: 'charge', x: 60 + 150, y: 200 }];
      const world = buildWorld(d, 60);
      const sim = new GameSim(world, simParamsFor(id, 110));
      const idx = world.revealables.findIndex((r) => r.kind === 'pickup');
      sim.firePulse();
      let max = 0;
      for (let i = 0; i < 120; i++) {
        sim.step(1 / 60);
        max = Math.max(max, sim.reveal.glow[idx]);
      }
      return max;
    };
    expect(far('bat_rookie')).toBe(0);
    expect(far('bat_sonarbot')).toBeGreaterThan(0);
  });

  it('Phantom: hunters hear it at half the range (and Rookie at 1.2x the pulse radius)', () => {
    const rookie = make('bat_rookie').sim.hearingRadius;
    const phantom = make('bat_phantom').sim.hearingRadius;
    expect(rookie).toBeCloseTo(BASE_RADIUS * ECHO_CONFIG.enemy.hearingRadiusMult, 5);
    expect(phantom / rookie).toBeCloseTo(0.5, 5);
  });

  it('Phantom does not shrink its own pulse, only what hunters hear', () => {
    const a = make('bat_rookie').sim;
    const p = make('bat_phantom').sim;
    a.firePulse();
    p.firePulse();
    expect(p.waves.maxRadius[0]).toBeCloseTo(a.waves.maxRadius[0], 5);
  });

  it('Turbo Moth: momentum climbs twice as fast and caps at x4.0 (Rookie caps at x2.0)', () => {
    const climb = (id: string, sec: number) => {
      const { sim } = make(id);
      sim.setInput(0, -1); // fly up/down inside the empty column; position does not matter for the number
      let value = 1;
      for (let i = 0; i < Math.round(sec * 60); i++) {
        sim.step(1 / 60);
        value = sim.momentum.value;
        if (sim.status !== 'playing') break;
        // keep the bat away from walls by steering back and forth
        if (sim.body.y < 120) sim.setInput(0, 1);
        if (sim.body.y > 380) sim.setInput(0, -1);
      }
      return value;
    };
    const interval = ECHO_CONFIG.momentum.intervalSec;
    const step = ECHO_CONFIG.momentum.step;
    // Turbo gains +step every interval/2, Rookie every interval
    expect(climb('bat_turbo', interval * 2 + 0.1)).toBeCloseTo(1 + 4 * step, 5);
    expect(climb('bat_rookie', interval * 2 + 0.1)).toBeCloseTo(1 + 2 * step, 5);
    // caps
    expect(climb('bat_rookie', 60)).toBe(2);
    expect(climb('bat_turbo', 60)).toBe(4);
  });
});

describe('shop stat bars', () => {
  it('Rookie shows the baseline; the strongest bat of a stat fills its bar', () => {
    expect(statBars('bat_sonarbot').find((b) => b.key === 'range')?.value).toBe(1);
    expect(statBars('bat_vesper').find((b) => b.key === 'duration')?.value).toBe(1);
    expect(statBars('bat_rookie').find((b) => b.key === 'range')?.value).toBeCloseTo(1 / 1.5, 5);
  });
  it('all bars stay inside 0..1 and each bat has the three bars', () => {
    for (const id of CHARACTER_IDS) {
      const bars = statBars(id);
      expect(bars.map((b) => b.key)).toEqual(['range', 'duration', 'noise']);
      for (const b of bars) {
        expect(b.value).toBeGreaterThan(0);
        expect(b.value).toBeLessThanOrEqual(1);
      }
    }
  });
  it('Phantom is the quiet one and says so', () => {
    const noise = statBars('bat_phantom').find((b) => b.key === 'noise')!;
    expect(noise.value).toBeCloseTo(0.5, 5);
    expect(noise.text).toMatch(/quiet/);
    expect(momentumText('bat_turbo')).toBe('Momentum: x2 rate, cap x4.0');
  });
});
