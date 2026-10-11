import { SOUND_KEYS, VISUAL_KEYS, WALL_KEYS } from '../assets/keys';
import { AssetRegistry } from '../assets/AssetRegistry';
import { SAMPLE_RATE, SOUND_SPECS, synthDataUri, synthesize, toBase64, toWav } from '../assets/sound/synth';

jest.mock('react-native-svg', () => {
  const stub = () => null;
  return new Proxy({ __esModule: true }, { get: (t: any, k: string) => (k in t ? t[k] : stub) });
});

// eslint-disable-next-line import/first
import { registerPlaceholderAssets } from '../assets/placeholders/visuals';

describe('AssetRegistry placeholders', () => {
  beforeEach(() => AssetRegistry.clear());

  it('reports every key as missing before setup', () => {
    expect(AssetRegistry.missing()).toHaveLength(VISUAL_KEYS.length + SOUND_KEYS.length);
  });

  it('registers a placeholder for every visual and sound key', () => {
    registerPlaceholderAssets();
    expect(AssetRegistry.missing()).toEqual([]);
    WALL_KEYS.forEach((k) => expect(AssetRegistry.getWallStyle(k).fresh.stroke).toBeTruthy());
  });

  it('every visual renders for every state without throwing', () => {
    registerPlaceholderAssets();
    for (const key of VISUAL_KEYS) {
      const C = AssetRegistry.getVisual(key) as any;
      for (const state of ['idle', 'flap', 'hit', 'preview'] as const) {
        for (const frame of [0, 1] as const) {
          const el = C({ x: 50, y: 50, width: 40, height: 40, state, frame, glow: 0.7, active: true, progress: 0.5, time: 1.2 });
          expect(el).not.toBeNull();
        }
      }
    }
  });

  it('final art replaces a placeholder by key with no other change', () => {
    registerPlaceholderAssets();
    const Custom = () => null;
    AssetRegistry.registerVisual('bat_rookie', Custom as any);
    expect(AssetRegistry.getVisual('bat_rookie')).toBe(Custom);
    expect(AssetRegistry.getVisual('bat_vesper')).not.toBe(Custom);
    AssetRegistry.registerSound('sfx_ping', { kind: 'file', source: 7 });
    expect(AssetRegistry.getSound('sfx_ping')).toEqual({ kind: 'file', source: 7 });
  });

  it('unknown keys fail loudly', () => {
    expect(() => AssetRegistry.getVisual('bat_rookie')).toThrow(/no visual registered/);
    expect(() => AssetRegistry.getSound('sfx_ping')).toThrow(/no sound registered/);
  });
});

describe('placeholder sound synthesis', () => {
  it.each(SOUND_KEYS.map((k) => [k]))('%s is audible, bounded and finite', (key) => {
    const s = synthesize(SOUND_SPECS[key]);
    expect(s.length).toBe(Math.floor(SOUND_SPECS[key].durationSec * SAMPLE_RATE));
    let peak = 0;
    for (const v of s) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    expect(Array.from(synthesize(SOUND_SPECS.sfx_hit))).toEqual(Array.from(synthesize(SOUND_SPECS.sfx_hit)));
  });

  it('writes a valid 16-bit mono WAV', () => {
    const wav = toWav(synthesize(SOUND_SPECS.sfx_switch));
    const text = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(text(36, 40)).toBe('data');
    const dv = new DataView(wav.buffer);
    expect(dv.getUint32(40, true)).toBe(wav.length - 44);
    expect(dv.getUint16(34, true)).toBe(16);
  });

  it('base64 matches Node reference', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('builds a cached data URI', () => {
    const a = synthDataUri('sfx_switch', SOUND_SPECS.sfx_switch);
    expect(a.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
    expect(synthDataUri('sfx_switch', SOUND_SPECS.sfx_switch)).toBe(a);
  });
});
