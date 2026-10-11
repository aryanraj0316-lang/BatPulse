import testLevelJson from '../levels/data/echo_test.json';
import { validateLevel, isValidLevel } from '../levels/validate';
import {
  loadAuthoredLevel,
  LevelLoadError,
  authoredLevelIds,
  __setRawLevelForTest,
} from '../levels/loader';
import { toRuntimeLevel } from '../levels/adapter';
import { LevelFactory } from '../levels/generated';
import { ECHO_CONFIG, GAME_CONFIG } from '../constants/gameConfig';
import { LevelDef } from '../levels/schema';

const clone = (): any => JSON.parse(JSON.stringify(testLevelJson));

describe('level validation', () => {
  it('accepts the shipped test level', () => {
    expect(validateLevel(testLevelJson)).toEqual([]);
    expect(isValidLevel(testLevelJson)).toBe(true);
  });

  it('every registered authored level is valid', () => {
    for (const id of authoredLevelIds()) {
      expect(() => loadAuthoredLevel(id, true)).not.toThrow();
    }
  });

  const mutations: [string, (l: any) => void, RegExp][] = [
    ['not an object', () => {}, /not an object/],
    ['missing name', (l) => delete l.name, /name/],
    ['bad chapter', (l) => (l.chapter = 0), /chapter/],
    ['zero width', (l) => (l.width = 0), /width/],
    ['start outside bounds', (l) => (l.start = { x: -5, y: 10 }), /start/],
    ['finish missing', (l) => delete l.finish, /finish/],
    ['walls not array', (l) => (l.walls = 'x'), /walls must be an array/],
    ['unknown wall type', (l) => (l.walls[0].type = 'lava'), /walls\[0\]\.type/],
    ['wall zero size', (l) => (l.walls[1].width = 0), /walls\[1\]/],
    ['spike invalid', (l) => (l.spikes = [{ x: 1 }]), /spikes\[0\]/],
    ['hazard bad kind', (l) => (l.movingHazards = [{ x: 1, y: 1, width: 5, height: 5, kind: 'x', loopSec: 2 }]), /kind/],
    ['hazard bad loop', (l) => (l.movingHazards = [{ x: 1, y: 1, width: 5, height: 5, kind: 'slider', loopSec: 0 }]), /loopSec/],
    ['door without switch', (l) => (l.doors = [{ id: 'd', x: 1, y: 1, width: 5, height: 5, switchId: 'nope' }]), /matches no switch/],
    ['duplicate switch id', (l) => (l.switches = [{ id: 's', x: 1, y: 1, radius: 4 }, { id: 's', x: 2, y: 2, radius: 4 }]), /duplicated/],
    ['bad pickup', (l) => (l.pickups = [{ type: 'bomb', x: 1, y: 1 }]), /pickups\[0\]/],
    ['enemy no waypoints', (l) => (l.enemies = [{ type: 'hunter', waypoints: [], speed: 'slow' }]), /waypoints/],
    ['enemy bad speed', (l) => (l.enemies = [{ type: 'hunter', waypoints: [{ x: 1, y: 1 }], speed: 'warp' }]), /speed/],
    ['bad sonar mode', (l) => (l.sonar.mode = 'infinite'), /sonar\.mode/],
    ['recharge without time', (l) => (l.sonar.rechargeSec = 0), /rechargeSec/],
    ['zero charges', (l) => (l.sonar.charges = 0), /charges/],
    ['negative ghost limit', (l) => (l.ghostPulseLimit = -1), /ghostPulseLimit/],
    ['bad par', (l) => (l.parTime = 0), /parTime/],
    ['thresholds reversed', (l) => (l.starThresholds = { two: 10, three: 20 }), /starThresholds/],
    ['escape malformed', (l) => (l.escape = { enabled: 'yes' }), /escape/],
    ['start inside wall', (l) => (l.start = { x: 150, y: 222 }), /inside a wall/],
  ];

  it.each(mutations)('rejects: %s', (name, mutate, expected) => {
    const lvl = name === 'not an object' ? 42 : clone();
    if (name !== 'not an object') mutate(lvl);
    const errs = validateLevel(lvl);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join('\n')).toMatch(expected);
  });

  it('reports every problem, not just the first', () => {
    const l = clone();
    l.name = '';
    l.parTime = -1;
    l.chapter = 0;
    expect(validateLevel(l).length).toBeGreaterThanOrEqual(3);
  });

  it('never throws on garbage', () => {
    for (const g of [null, undefined, 'x', [], { walls: 5 }, { id: NaN }]) {
      expect(() => validateLevel(g)).not.toThrow();
      expect(validateLevel(g).length).toBeGreaterThan(0);
    }
  });
});

describe('level loader', () => {
  afterEach(() => __setRawLevelForTest(901, undefined));

  it('loads the data-file test level', () => {
    const lvl = loadAuthoredLevel(0, true) as LevelDef;
    expect(lvl.id).toBe(0);
    expect(lvl.name).toBe('Test Chamber');
    expect(lvl.walls.length).toBeGreaterThan(0);
  });

  it('returns null for unknown ids', () => {
    expect(loadAuthoredLevel(12345, true)).toBeNull();
  });

  it('malformed level fails loudly in strict (debug) mode', () => {
    const bad = clone();
    bad.id = 901;
    bad.sonar.mode = 'nope';
    __setRawLevelForTest(901, bad);
    expect(() => loadAuthoredLevel(901, true)).toThrow(LevelLoadError);
    expect(() => loadAuthoredLevel(901, true)).toThrow(/sonar\.mode/);
  });

  it('malformed level never crashes in release mode', () => {
    const bad = clone();
    bad.id = 901;
    bad.walls = null;
    __setRawLevelForTest(901, bad);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadAuthoredLevel(901, false)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('loads well inside the 1 s level-load budget', () => {
    const t0 = Date.now();
    for (let i = 0; i < 50; i++) LevelFactory.createLevel(0, undefined, 390, 800);
    expect((Date.now() - t0) / 50).toBeLessThan(ECHO_CONFIG.level.loadBudgetMs);
  });
});

describe('data file -> runtime level', () => {
  it('LevelFactory serves the authored level instead of generating one', () => {
    const rt = LevelFactory.createLevel(0, undefined, 380, 660);
    expect(rt.name).toBe('Test Chamber');
    expect(rt.walls).toHaveLength((testLevelJson as any).walls.length);
    expect(rt.spawn).toEqual({ x: 190, y: 560 });
  });

  it('scales coordinates to the screen', () => {
    const rt = toRuntimeLevel(testLevelJson as unknown as LevelDef, 760, 1320);
    expect(rt.spawn).toEqual({ x: 380, y: 1120 });
    expect(rt.goal.x).toBe(640);
    expect(rt.walls[0].width).toBe(760);
  });

  it('editing level data changes the result (fixed sonar charges)', () => {
    const def = clone() as LevelDef;
    expect(toRuntimeLevel(def, 380, 660).sonar.allowance).toBe(999);
    def.sonar = { mode: 'fixed', charges: 4, rechargeSec: 0 };
    expect(toRuntimeLevel(def, 380, 660).sonar.allowance).toBe(4);
  });

  it('changing a config value changes behaviour', () => {
    const def = clone() as LevelDef;
    def.enemies = [{ type: 'hunter', waypoints: [{ x: 100, y: 100 }], speed: 'slow' }];
    const before = toRuntimeLevel(def, 380, 660).hunters[0].speedMultiplier;
    const oldMult = ECHO_CONFIG.enemy.slowHunterSpeedMult;
    const oldRadius = GAME_CONFIG.SONAR_RADIUS;
    try {
      ECHO_CONFIG.enemy.slowHunterSpeedMult = 0.5;
      GAME_CONFIG.SONAR_RADIUS = 111;
      const after = toRuntimeLevel(def, 380, 660);
      expect(before).toBe(oldMult);
      expect(after.hunters[0].speedMultiplier).toBe(0.5);
      expect(after.sonar.radius).toBe(111);
    } finally {
      ECHO_CONFIG.enemy.slowHunterSpeedMult = oldMult;
      GAME_CONFIG.SONAR_RADIUS = oldRadius;
    }
  });
});
