import { Analytics } from '../analytics/Analytics';
import { SLOW_MO_FACTOR, debugTimeScale } from '../debug/debugFlags';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { BAT_KEYS } from '../assets/keys';

describe('analytics', () => {
  beforeEach(() => Analytics.reset());

  it('buffers typed events with timestamps', () => {
    Analytics.track({ name: 'level_start', levelId: 3 });
    Analytics.track({ name: 'level_fail', levelId: 3, cause: 'spike' });
    const r = Analytics.recent();
    expect(r.map((e) => e.event.name)).toEqual(['level_start', 'level_fail']);
    expect(typeof r[0].timestamp).toBe('number');
  });

  it('forwards to sinks and survives a throwing sink', () => {
    const seen: string[] = [];
    Analytics.addSink(() => {
      throw new Error('boom');
    });
    const remove = Analytics.addSink((e) => seen.push(e.name));
    expect(() => Analytics.track({ name: 'ghost_run', levelId: 1 })).not.toThrow();
    expect(seen).toEqual(['ghost_run']);
    remove();
    Analytics.track({ name: 'ghost_run', levelId: 1 });
    expect(seen).toHaveLength(1);
  });

  it('keeps the buffer bounded', () => {
    for (let i = 0; i < 500; i++) Analytics.track({ name: 'shard_earned', amount: 1, source: 't' });
    expect(Analytics.recent().length).toBeLessThanOrEqual(200);
  });
});

describe('debug flags', () => {
  it('slow motion only applies in debug builds', () => {
    expect(debugTimeScale({ slowMotion: true }, true)).toBe(SLOW_MO_FACTOR);
    expect(debugTimeScale({ slowMotion: true }, false)).toBe(1);
    expect(debugTimeScale({ slowMotion: false }, true)).toBe(1);
  });
});

describe('config sanity', () => {
  it('matches the spec defaults', () => {
    const c = ECHO_CONFIG;
    expect(c.sonar.defaultCharges).toBe(3);
    expect(c.sonar.defaultRechargeSec).toBe(4);
    expect(c.sonar.tutorialRechargeSec).toBe(2);
    expect(c.momentum).toMatchObject({ start: 1.0, step: 0.1, intervalSec: 2, max: 2.0, idleResetSec: 1.5 });
    expect(c.enemy.hearingRadiusMult).toBe(1.2);
    expect(c.door.openSec).toBe(8);
    expect(c.perf.targetFps).toBe(60);
  });

  it('has complete stats for every bat', () => {
    for (const key of BAT_KEYS) {
      const s = ECHO_CONFIG.characters[key];
      expect(s).toBeDefined();
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.price).toBeGreaterThanOrEqual(0);
    }
    expect(ECHO_CONFIG.characters.bat_rookie.price).toBe(0);
    expect(ECHO_CONFIG.characters.bat_sonarbot.radiusMult).toBe(1.5);
    expect(ECHO_CONFIG.characters.bat_phantom.hearingMult).toBe(0.5);
    expect(ECHO_CONFIG.characters.bat_turbo.momentumCap).toBe(4.0);
  });
});
