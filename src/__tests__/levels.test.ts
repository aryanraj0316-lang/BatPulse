import testLevelJson from '../levels/data/echo_test.json';
import { validateLevel, isValidLevel } from '../levels/validate';
import {
  loadAuthoredLevel,
  LevelLoadError,
  authoredLevelIds,
  __setRawLevelForTest,
} from '../levels/loader';
import { buildWorld } from '../sim/world';
import { ECHO_CONFIG } from '../constants/gameConfig';
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
    for (let i = 0; i < 50; i++) buildWorld(loadAuthoredLevel(5, true)!, ECHO_CONFIG.world.wallSegmentLen);
    expect((Date.now() - t0) / 50).toBeLessThan(ECHO_CONFIG.level.loadBudgetMs);
  });
});

describe('data file -> world', () => {
  it('long walls are split so a pulse only lights the part it reaches', () => {
    const def = loadAuthoredLevel(1, true) as LevelDef;
    const world = buildWorld(def, ECHO_CONFIG.world.wallSegmentLen);
    expect(world.solids).toHaveLength(def.walls.length); // collision uses the original boxes
    expect(world.revealables.length).toBeGreaterThan(def.walls.length);
    for (const r of world.revealables) {
      if (r.kind === 'wall') expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(ECHO_CONFIG.world.wallSegmentLen + 1e-6);
    }
    // every wall's outline is covered by pieces (sample points along each perimeter)
    const walls = world.revealables.filter((r) => r.kind === 'wall');
    const covered = (x: number, y: number) => walls.some((r) => x >= r.x - 1e-6 && x <= r.x + r.width + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.height + 1e-6);
    for (const w of def.walls) {
      for (let t = 0; t <= 1; t += 0.05) {
        expect(covered(w.x + w.width * t, w.y + 1)).toBe(true);
        expect(covered(w.x + w.width * t, w.y + w.height - 1)).toBe(true);
        expect(covered(w.x + 1, w.y + w.height * t)).toBe(true);
        expect(covered(w.x + w.width - 1, w.y + w.height * t)).toBe(true);
      }
    }
  });
  it('spikes and the finish ring are revealable too', () => {
    const def = loadAuthoredLevel(3, true) as LevelDef;
    const world = buildWorld(def, 60);
    expect(world.spikes.length).toBeGreaterThan(0);
    expect(world.revealables.some((r) => r.kind === 'spike')).toBe(true);
    expect(world.revealables.filter((r) => r.kind === 'finish')).toHaveLength(1);
  });
  it('editing level data changes the sonar behaviour (fixed vs recharge)', () => {
    const { SonarEnergy } = require('../sim/sonarEnergy');
    const def = clone() as LevelDef;
    const e1 = new SonarEnergy(def.sonar);
    def.sonar = { mode: 'fixed', charges: 4, rechargeSec: 0 };
    const e2 = new SonarEnergy(def.sonar);
    e1.tryUse();
    e2.tryUse();
    e1.update(2);
    e2.update(2);
    expect(e1.charges).toBe(3); // recharged (2 s per charge in the data file)
    expect(e2.charges).toBe(3); // 4 - 1, never recharges
    expect(e2.max).toBe(4);
  });
  it('changing a config value changes behaviour', () => {
    const { pulseRadiusWorld } = require('../sim/world');
    const old = ECHO_CONFIG.sonar.maxRadiusScreenFraction;
    try {
      const before = pulseRadiusWorld(400, 1, ECHO_CONFIG.sonar.maxRadiusScreenFraction);
      ECHO_CONFIG.sonar.maxRadiusScreenFraction = 0.2;
      expect(pulseRadiusWorld(400, 1, ECHO_CONFIG.sonar.maxRadiusScreenFraction)).toBe(before / 2);
    } finally {
      ECHO_CONFIG.sonar.maxRadiusScreenFraction = old;
    }
  });
});

describe('level data matches its ASCII sources', () => {
  it('npm run levels is up to date (no stale JSON)', () => {
    const { spawnSync } = require('child_process');
    const root = require('path').join(__dirname, '..', '..'); // independent of where jest was started
    const r = spawnSync(process.execPath, [require('path').join(root, 'tools', 'buildLevels.js'), '--check'], { cwd: root, encoding: 'utf8' });
    expect(r.stderr + r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
