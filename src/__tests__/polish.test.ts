// the error boundary only needs these names; the real module is native-only
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: (s: unknown) => s } }));

import * as fs from 'fs';
import * as path from 'path';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { SOUND_KEYS, SoundKey } from '../assets/keys';
import { AudioBackend, AudioService, PlayerHandle, Scheduler } from '../audio/AudioService';
import { reverbTaps, roomScale } from '../audio/reverb';
import { Analytics } from '../analytics/Analytics';
import { __resetCrashHandlersForTests, clearCrashes, installGlobalHandlers, recentCrashes, recordCrash } from '../diagnostics/crash';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FEEDBACK, feedbackFor, playFeedback } from '../game/feedback';
import { effectiveQuality, isRowVisible, lodFor, QualityGovernor } from '../render/quality';
import { defaultSave, migrateSave } from '../save/schema';

/* ------------------------------------------------------------------ crash safety */
describe('crash handling', () => {
  beforeEach(() => {
    clearCrashes();
    __resetCrashHandlersForTests();
  });

  it('records a crash, tells analytics and flushes the save', () => {
    const spy = jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    const flush = jest.fn().mockResolvedValue(undefined);
    const rec = recordCrash(new Error('boom'), 'render', flush);
    expect(rec).toMatchObject({ source: 'render', message: 'boom' });
    expect(recentCrashes()).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith({ name: 'crash', source: 'render', message: 'boom' });
    expect(flush).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('survives odd error values and a broken flush; messages are capped', () => {
    jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    expect(() => recordCrash(undefined, 'js')).not.toThrow();
    expect(() => recordCrash({ a: 1 }, 'js', () => { throw new Error('flush failed'); })).not.toThrow();
    expect(() => recordCrash('x'.repeat(1000), 'js', () => Promise.reject(new Error('async fail')))).not.toThrow();
    expect(recentCrashes().at(-1)!.message.length).toBeLessThanOrEqual(200);
    const circular: any = {};
    circular.self = circular;
    expect(() => recordCrash(circular, 'js')).not.toThrow();
  });

  it('keeps only the latest records', () => {
    jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    for (let i = 0; i < 50; i++) recordCrash(new Error(`e${i}`), 'js');
    expect(recentCrashes().length).toBe(20);
    expect(recentCrashes().at(-1)!.message).toBe('e49');
  });

  it('hooks the native global handler and still calls the previous one', () => {
    jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    const previous = jest.fn();
    let handler: (e: unknown, fatal?: boolean) => void = previous;
    const fake = { ErrorUtils: { getGlobalHandler: () => handler, setGlobalHandler: (h: typeof handler) => (handler = h) } };
    installGlobalHandlers(fake);
    handler(new Error('native crash'), true);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(recentCrashes().at(-1)).toMatchObject({ source: 'js', message: 'native crash' });
  });

  it('hooks web error and unhandled-rejection events, once', () => {
    jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    const listeners: Record<string, (ev: any) => void> = {};
    const fake = { addEventListener: jest.fn((t: string, fn: (ev: any) => void) => (listeners[t] = fn)) };
    installGlobalHandlers(fake);
    installGlobalHandlers(fake); // second call is ignored
    expect(fake.addEventListener).toHaveBeenCalledTimes(2);
    listeners.error({ error: new Error('web error') });
    listeners.unhandledrejection({ reason: 'nope' });
    expect(recentCrashes().map((c) => [c.source, c.message])).toEqual([['js', 'web error'], ['promise', 'nope']]);
  });

  it('the error boundary switches to its recovery screen and reports the crash', () => {
    jest.spyOn(Analytics, 'track').mockImplementation(() => {});
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const flush = jest.fn().mockResolvedValue(undefined);
    const b = new ErrorBoundary({ children: null, flush });
    b.componentDidCatch(new Error('render failed'));
    expect(recentCrashes().at(-1)).toMatchObject({ source: 'render', message: 'render failed' });
    expect(flush).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ audio reverb */
class FakePlayer implements PlayerHandle {
  static log: { player: FakePlayer; volume: number }[] = [];
  plays: number[] = [];
  volume = 1;
  setVolume(v: number) { this.volume = v; }
  setLoop() {}
  restart() { this.plays.push(this.volume); FakePlayer.log.push({ player: this, volume: this.volume }); }
  pause() {}
  resume() {}
  stop() {}
  release() {}
}

function rig(vol: { sfx: number; music: number; reverb?: boolean } = { sfx: 1, music: 0.5, reverb: true }) {
  const players = new Map<SoundKey, FakePlayer[]>();
  FakePlayer.log = [];
  const backend: AudioBackend = {
    async load(key, copies) {
      const list = Array.from({ length: copies }, () => new FakePlayer());
      players.set(key, list);
      return list;
    },
  };
  let now = 1000;
  const timers: { id: number; at: number; fn: () => void; live: boolean }[] = [];
  const scheduler: Scheduler = {
    set: (fn, ms) => {
      const t = { id: timers.length, at: now + ms, fn, live: true };
      timers.push(t);
      return t;
    },
    clear: (h) => {
      (h as { live: boolean }).live = false;
    },
  };
  const svc = new AudioService(backend, () => vol, () => now, scheduler);
  /** Advance the clock and run due timers. */
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => x.live && x.at <= now)) {
      t.live = false;
      t.fn();
    }
  };
  const pings = () => FakePlayer.log.filter((l) => (players.get('sfx_ping') ?? []).includes(l.player)).map((l) => l.volume);
  const pingPlayers = () => FakePlayer.log.filter((l) => (players.get('sfx_ping') ?? []).includes(l.player)).map((l) => l.player);
  return { svc, vol, advance, pings, pingPlayers, players };
}

describe('cave reverb', () => {
  const cfg = ECHO_CONFIG.audio.reverb;

  it('taps are later, quieter and decaying', () => {
    const taps = reverbTaps(1);
    expect(taps).toHaveLength(cfg.taps);
    for (let i = 1; i < taps.length; i++) {
      expect(taps[i].delaySec).toBeGreaterThan(taps[i - 1].delaySec);
      expect(taps[i].gain).toBeLessThan(taps[i - 1].gain);
    }
    expect(taps[0].delaySec).toBeCloseTo(cfg.firstDelaySec, 6);
    expect(taps[0].gain).toBeCloseTo(cfg.gain, 6);
    expect(taps[0].gain).toBeLessThan(1);
  });

  it('bigger caves echo later; the scale is clamped', () => {
    expect(reverbTaps(1.5)[0].delaySec).toBeGreaterThan(reverbTaps(1)[0].delaySec);
    expect(reverbTaps(999)).toEqual(reverbTaps(cfg.maxScale));
    expect(reverbTaps(-5)).toEqual(reverbTaps(cfg.minScale));
    expect(reverbTaps(NaN)).toEqual(reverbTaps(1));
  });

  it('room scale follows the level area and stays in range', () => {
    expect(roomScale(400, 800)).toBeCloseTo(1, 6);
    expect(roomScale(400, 3200)).toBeGreaterThan(1);
    expect(roomScale(40, 40)).toBe(cfg.minScale);
    expect(roomScale(1e6, 1e6)).toBe(cfg.maxScale);
    expect(roomScale(0, 100)).toBe(1);
    expect(roomScale(NaN, 100)).toBe(1);
  });

  it('a pulse plays the dry ping now and the echoes later, quieter', async () => {
    const r = rig();
    await r.svc.preload(['sfx_ping']);
    expect(r.svc.playWithEcho('sfx_ping', 1)).toBe(true);
    expect(r.pings()).toEqual([1]);
    r.advance(1000);
    const all = r.pings();
    expect(all).toHaveLength(1 + cfg.taps);
    expect(all.slice(1)).toEqual(reverbTaps(1).map((t) => t.gain));
  });

  it('the dry ping and each echo use different players, so no echo cuts the ping off', async () => {
    const r = rig();
    await r.svc.preload(['sfx_ping']);
    r.svc.playWithEcho('sfx_ping', 1);
    r.advance(2000);
    const used = r.pingPlayers();
    expect(new Set(used).size).toBe(used.length);
    expect(r.players.get('sfx_ping')!.length).toBeGreaterThanOrEqual(cfg.taps + 1);
  });

  it('respects the reverb setting', async () => {
    const r = rig({ sfx: 1, music: 0.5, reverb: false });
    await r.svc.preload(['sfx_ping']);
    r.svc.playWithEcho('sfx_ping', 1);
    r.advance(2000);
    expect(r.pings()).toEqual([1]);
  });

  it('echoes follow the sfx volume and a muted game stays silent', async () => {
    const r = rig({ sfx: 0.5, music: 0.5, reverb: true });
    await r.svc.preload(['sfx_ping']);
    r.svc.playWithEcho('sfx_ping', 1);
    r.advance(1000);
    expect(r.pings()[1]).toBeCloseTo(0.5 * cfg.gain, 6);
    const m = rig({ sfx: 0, music: 0.5, reverb: true });
    await m.svc.preload(['sfx_ping']);
    expect(m.svc.playWithEcho('sfx_ping', 1)).toBe(false);
    m.advance(2000);
    expect(m.pings()).toEqual([]);
  });

  it('pausing cancels echoes that have not played yet (nothing sounds while paused)', async () => {
    const r = rig();
    await r.svc.preload(['sfx_ping']);
    r.svc.playWithEcho('sfx_ping', 1);
    r.svc.pauseAll();
    r.svc.resumeAll();
    r.advance(2000);
    expect(r.pings()).toEqual([1]); // only the dry ping
  });

  it('stopAll and release cancel pending echoes too, and an unloaded key does nothing', async () => {
    const r = rig();
    await r.svc.preload(['sfx_ping']);
    r.svc.playWithEcho('sfx_ping', 1);
    r.svc.stopAll();
    r.advance(2000);
    expect(r.pings()).toEqual([1]);
    expect(r.svc.playWithEcho('sfx_door', 1)).toBe(false);
  });
});

/* ------------------------------------------------------------------ feedback table */
describe('sound and haptic wiring', () => {
  const EVENTS = ['restart', 'respawn', 'pulse', 'no_charge', 'wall_hit', 'death', 'enemy_alert', 'heartbeat', 'switch', 'checkpoint', 'door_open', 'door_close', 'pickup', 'finish'];

  it('lists exactly the simulation events', () => {
    expect(Object.keys(FEEDBACK).sort()).toEqual([...EVENTS].sort());
    const src = fs.readFileSync(path.join(__dirname, '..', 'sim', 'game.ts'), 'utf8');
    const decl = src.slice(src.indexOf('export type SimEvent'), src.indexOf(';', src.indexOf('export type SimEvent')));
    const declared = [...decl.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...EVENTS].sort());
  });

  it('every sound it uses is a registered sound key, with a sensible gain', () => {
    for (const fb of Object.values(FEEDBACK)) {
      if (!fb?.sound) continue;
      expect(SOUND_KEYS).toContain(fb.sound.key);
      expect(fb.sound.gain).toBeGreaterThan(0);
      expect(fb.sound.gain).toBeLessThanOrEqual(1);
    }
  });

  it('the important events are never silent: pulse, death, alert, finish all sound AND vibrate', () => {
    for (const e of ['pulse', 'death', 'enemy_alert', 'finish'] as const) {
      expect(FEEDBACK[e]?.sound).toBeTruthy();
      expect(FEEDBACK[e]?.haptic).toBeTruthy();
    }
    expect(FEEDBACK.restart).toBeNull();
  });

  it('the heartbeat grows louder with the threat, within 0.35..1', () => {
    expect(feedbackFor('heartbeat', 0)!.sound!.gain).toBeCloseTo(0.35, 6);
    expect(feedbackFor('heartbeat', 1)!.sound!.gain).toBeCloseTo(1, 6);
    expect(feedbackFor('heartbeat', 5)!.sound!.gain).toBeCloseTo(1, 6);
    expect(feedbackFor('heartbeat', -1)!.sound!.gain).toBeCloseTo(0.35, 6);
  });

  it('only the pulse gets the cave echo, scaled to the level', () => {
    const played: [string, number, number | undefined][] = [];
    const haptics: string[] = [];
    const sinks = { playSound: (k: SoundKey, g: number, e?: number) => played.push([k, g, e]), haptic: (h: string) => haptics.push(h) };
    playFeedback('pulse', 0, { width: 400, height: 800 }, sinks);
    playFeedback('wall_hit', 0, { width: 400, height: 800 }, sinks);
    playFeedback('restart', 0, { width: 400, height: 800 }, sinks);
    expect(played).toEqual([['sfx_ping', 1, 1], ['sfx_hit', 0.6, undefined]]);
    expect(haptics).toEqual(['ping', 'bump']);
  });

  it('the game screen no longer plays sounds or vibrations by hand', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'GameScreen.tsx'), 'utf8');
    const handler = src.slice(src.indexOf('sim.onEvent'), src.indexOf("case 'finish'"));
    expect(handler).not.toMatch(/audio\.play\('/);
    expect(handler).not.toMatch(/HapticEngine\.\w+\(haptics\)/);
    expect(handler).toMatch(/playFeedback\(/);
  });
});

/* ------------------------------------------------------------------ level of detail */
describe('render quality (LOD)', () => {
  const cfg = ECHO_CONFIG.perf.autoQuality;
  /** Feeds the governor `n` frames of `ms` each; returns the first quality change. */
  const feed = (g: QualityGovernor, n: number, ms: number) => {
    for (let i = 0; i < n; i++) {
      const r = g.sample(ms);
      if (r) return r;
    }
    return null;
  };

  it('stays high on a healthy device (60 FPS)', () => {
    const g = new QualityGovernor();
    expect(feed(g, 2000, 16.7)).toBeNull();
    expect(g.current).toBe('high');
  });

  it('drops to low once, when the average frame is too slow, and never flaps back', () => {
    const g = new QualityGovernor();
    expect(feed(g, cfg.warmupFrames + cfg.windowFrames + 5, 30)).toBe('low');
    expect(g.current).toBe('low');
    expect(feed(g, 1000, 8)).toBeNull();
    expect(g.current).toBe('low');
  });

  it('ignores the warm-up hitch and one-off long frames (pause/background)', () => {
    const g = new QualityGovernor();
    expect(feed(g, cfg.warmupFrames, 200)).toBeNull(); // level-start hitch
    for (let i = 0; i < 5; i++) expect(g.sample(cfg.ignoreFrameMs + 500)).toBeNull();
    expect(feed(g, 600, 16)).toBeNull();
    expect(g.current).toBe('high');
  });

  it('does not downgrade for a short slow burst inside an otherwise fine window', () => {
    const g = new QualityGovernor();
    feed(g, cfg.warmupFrames, 16);
    for (let i = 0; i < 6; i++) g.sample(60); // a few slow frames (e.g. a big pulse)
    expect(feed(g, cfg.windowFrames, 16)).toBeNull();
  });

  it('threshold: just under passes, just over downgrades', () => {
    const under = new QualityGovernor();
    expect(feed(under, cfg.warmupFrames + cfg.windowFrames * 3, cfg.downgradeFrameMs - 0.5)).toBeNull();
    const over = new QualityGovernor();
    expect(feed(over, cfg.warmupFrames + cfg.windowFrames * 3, cfg.downgradeFrameMs + 0.5)).toBe('low');
  });

  it('bad numbers are ignored; a new level restarts the window but keeps a downgrade', () => {
    const g = new QualityGovernor();
    expect(g.sample(NaN)).toBeNull();
    expect(g.sample(-3)).toBeNull();
    expect(g.sample(0)).toBeNull();
    feed(g, cfg.warmupFrames + cfg.windowFrames + 5, 40);
    g.restartWindow();
    expect(g.current).toBe('low');
  });

  it('the setting overrides auto; auto follows the governor', () => {
    expect(effectiveQuality('auto', 'low')).toBe('low');
    expect(effectiveQuality('auto', 'high')).toBe('high');
    expect(effectiveQuality('high', 'low')).toBe('high');
    expect(effectiveQuality('low', 'high')).toBe('low');
  });

  it('low quality draws less: fewer glow steps, a higher cutoff, no sound markers', () => {
    const hi = lodFor('high');
    const lo = lodFor('low');
    expect(lo.glowSteps).toBeLessThan(hi.glowSteps);
    expect(lo.minGlow).toBeGreaterThan(hi.minGlow);
    expect(hi.showSoundMarkers).toBe(true);
    expect(lo.showSoundMarkers).toBe(false);
  });

  it('culling keeps what is on screen (with a margin) and drops what is far outside', () => {
    const m = ECHO_CONFIG.perf.cullMarginWorld;
    expect(isRowVisible(500, 20, 400, 900)).toBe(true);
    expect(isRowVisible(390, 20, 400, 900)).toBe(true); // straddles the top edge
    expect(isRowVisible(400 - m - 25, 20, 400, 900)).toBe(false); // above the margin
    expect(isRowVisible(400 - m - 10, 20, 400, 900)).toBe(true); // inside the margin: no pop-in
    expect(isRowVisible(900 + m + 1, 20, 400, 900)).toBe(false);
    expect(isRowVisible(900 + m, 20, 400, 900)).toBe(true);
    expect(isRowVisible(0, 1800, 400, 900)).toBe(true); // a tall wall spanning the view
  });
});

/* ------------------------------------------------------------------ new settings in the save */
describe('settings: reverb and graphics', () => {
  it('defaults: echo on, graphics auto', () => {
    expect(defaultSave().settings).toMatchObject({ reverb: true, graphics: 'auto' });
  });
  it('old saves without them get the defaults', () => {
    const old = JSON.parse(JSON.stringify(defaultSave()));
    delete old.settings.reverb;
    delete old.settings.graphics;
    expect(migrateSave(old).settings).toMatchObject({ reverb: true, graphics: 'auto' });
  });
  it('valid values are kept, junk falls back', () => {
    const s = JSON.parse(JSON.stringify(defaultSave()));
    s.settings.reverb = false;
    s.settings.graphics = 'low';
    expect(migrateSave(s).settings).toMatchObject({ reverb: false, graphics: 'low' });
    s.settings.graphics = 'ultra';
    s.settings.reverb = 'yes';
    expect(migrateSave(s).settings).toMatchObject({ reverb: true, graphics: 'auto' });
  });
});
