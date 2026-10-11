import { SoundKey } from '../keys';

/**
 * Placeholder sound synthesis. Everything is generated from tiny specs so no audio files are
 * needed until real assets arrive. Pure functions: easy to test, deterministic.
 */
export type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';

export interface ToneLayer {
  wave: Wave;
  freqStart: number;
  freqEnd: number;
  gain: number;
  /** seconds from sound start */
  startSec?: number;
  /** defaults to the remaining time */
  lengthSec?: number;
  /** exponential decay rate; higher = shorter tail */
  decay: number;
  /** optional amplitude wobble for ambient pads */
  tremoloHz?: number;
}
export interface ToneSpec {
  durationSec: number;
  layers: ToneLayer[];
  loop?: boolean;
}

export const SAMPLE_RATE = 22050;

export const SOUND_SPECS: Record<SoundKey, ToneSpec> = {
  sfx_ping: {
    durationSec: 0.7,
    layers: [
      { wave: 'sine', freqStart: 820, freqEnd: 240, gain: 0.5, lengthSec: 0.35, decay: 3 },
      { wave: 'sine', freqStart: 820, freqEnd: 240, gain: 0.25, startSec: 0.08, decay: 5 },
    ],
  },
  sfx_hit: {
    durationSec: 0.18,
    layers: [
      { wave: 'noise', freqStart: 0, freqEnd: 0, gain: 0.4, decay: 18 },
      { wave: 'sine', freqStart: 140, freqEnd: 70, gain: 0.5, decay: 16 },
    ],
  },
  sfx_death: {
    durationSec: 0.6,
    layers: [
      { wave: 'saw', freqStart: 420, freqEnd: 50, gain: 0.35, decay: 4 },
      { wave: 'noise', freqStart: 0, freqEnd: 0, gain: 0.3, lengthSec: 0.25, decay: 9 },
    ],
  },
  sfx_finish: {
    durationSec: 0.9,
    layers: [
      { wave: 'triangle', freqStart: 523, freqEnd: 523, gain: 0.4, startSec: 0, lengthSec: 0.25, decay: 6 },
      { wave: 'triangle', freqStart: 659, freqEnd: 659, gain: 0.4, startSec: 0.14, lengthSec: 0.25, decay: 6 },
      { wave: 'triangle', freqStart: 784, freqEnd: 784, gain: 0.45, startSec: 0.28, lengthSec: 0.55, decay: 4 },
    ],
  },
  sfx_switch: {
    durationSec: 0.15,
    layers: [
      { wave: 'square', freqStart: 600, freqEnd: 600, gain: 0.25, lengthSec: 0.05, decay: 8 },
      { wave: 'square', freqStart: 900, freqEnd: 900, gain: 0.25, startSec: 0.06, decay: 14 },
    ],
  },
  sfx_door: {
    durationSec: 0.45,
    layers: [{ wave: 'triangle', freqStart: 200, freqEnd: 110, gain: 0.45, decay: 5 }],
  },
  sfx_enemy_alert: {
    durationSec: 0.4,
    layers: [
      { wave: 'square', freqStart: 300, freqEnd: 300, gain: 0.25, lengthSec: 0.15, decay: 4 },
      { wave: 'square', freqStart: 480, freqEnd: 480, gain: 0.25, startSec: 0.18, decay: 5 },
    ],
  },
  sfx_heartbeat: {
    durationSec: 0.6,
    layers: [
      { wave: 'sine', freqStart: 62, freqEnd: 45, gain: 0.7, lengthSec: 0.2, decay: 14 },
      { wave: 'sine', freqStart: 58, freqEnd: 42, gain: 0.55, startSec: 0.2, decay: 14 },
    ],
  },
  music_ambient: {
    durationSec: 8,
    loop: true,
    layers: [
      { wave: 'sine', freqStart: 55, freqEnd: 55, gain: 0.2, decay: 0, tremoloHz: 0.25 },
      { wave: 'sine', freqStart: 82.4, freqEnd: 82.4, gain: 0.12, decay: 0, tremoloHz: 0.125 },
      { wave: 'triangle', freqStart: 110, freqEnd: 110, gain: 0.05, decay: 0, tremoloHz: 0.5 },
    ],
  },
};

/** Deterministic noise so tests and builds always produce identical audio. */
function makeNoise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

export function synthesize(spec: ToneSpec, sampleRate: number = SAMPLE_RATE): Float32Array {
  const total = Math.max(1, Math.floor(spec.durationSec * sampleRate));
  const out = new Float32Array(total);
  const noise = makeNoise(0x1234abcd);

  for (const layer of spec.layers) {
    const start = Math.floor((layer.startSec ?? 0) * sampleRate);
    const length = Math.min(total - start, Math.floor((layer.lengthSec ?? spec.durationSec - (layer.startSec ?? 0)) * sampleRate));
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const u = length > 1 ? i / (length - 1) : 0;
      const freq = layer.freqStart + (layer.freqEnd - layer.freqStart) * u;
      phase += (2 * Math.PI * freq) / sampleRate;
      let v: number;
      switch (layer.wave) {
        case 'sine':
          v = Math.sin(phase);
          break;
        case 'square':
          v = Math.sin(phase) >= 0 ? 1 : -1;
          break;
        case 'saw':
          v = ((phase / (2 * Math.PI)) % 1) * 2 - 1;
          break;
        case 'triangle':
          v = (2 / Math.PI) * Math.asin(Math.sin(phase));
          break;
        default:
          v = noise();
      }
      let amp = layer.gain * Math.exp(-layer.decay * t);
      if (layer.tremoloHz) amp *= 0.6 + 0.4 * Math.sin(2 * Math.PI * layer.tremoloHz * t);
      // 3 ms fade in/out removes clicks at layer edges
      const edge = Math.min(i, length - 1 - i) / (sampleRate * 0.003);
      if (edge < 1) amp *= Math.max(0, edge);
      out[start + i] += v * amp;
    }
  }
  // Soft clip so layered sounds can never exceed full scale.
  for (let i = 0; i < total; i++) out[i] = Math.tanh(out[i]);
  return out;
}

/** 16-bit mono PCM WAV file bytes. */
export function toWav(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

const uriCache = new Map<string, string>();
/** Playable data: URI for a synthesized sound (cached). */
export function synthDataUri(key: string, spec: ToneSpec): string {
  const hit = uriCache.get(key);
  if (hit) return hit;
  const uri = `data:audio/wav;base64,${toBase64(toWav(synthesize(spec)))}`;
  uriCache.set(key, uri);
  return uri;
}
