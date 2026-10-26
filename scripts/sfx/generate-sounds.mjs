// Bat Pulse sound design — offline synthesizer.
// Renders every game sound to assets/sounds/*.wav (16-bit PCM).
// Run:  node scripts/sfx/generate-sounds.mjs
//
// Techniques: layered oscillators with pitch envelopes, FM bells, filtered noise,
// biquad filters, soft saturation, discrete cave slap-echoes and a stereo
// Freeverb-style reverb. Loops are crossfaded end-into-start so they repeat seamlessly.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'sounds');
mkdirSync(OUT, { recursive: true });

// ─── Basics ──────────────────────────────────────────────────
const TAU = Math.PI * 2;
let seed = 1234567;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const white = () => rand() * 2 - 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const db = (d) => Math.pow(10, d / 20);

function buf(seconds, sr) {
  const n = Math.ceil(seconds * sr);
  return { sr, L: new Float32Array(n), R: new Float32Array(n), n };
}

/** Add a mono signal fn(t, i) into a stereo buffer with constant-power pan (-1..1). */
function add(b, start, dur, fn, gain = 1, pan = 0) {
  const a = (pan + 1) * Math.PI / 4;
  const gl = Math.cos(a) * gain * Math.SQRT2;
  const gr = Math.sin(a) * gain * Math.SQRT2;
  const i0 = Math.floor(start * b.sr);
  const n = Math.floor(dur * b.sr);
  for (let i = 0; i < n && i0 + i < b.n; i++) {
    const v = fn(i / b.sr, i);
    b.L[i0 + i] += v * gl;
    b.R[i0 + i] += v * gr;
  }
}

// Envelopes
const expDecay = (t, tau) => Math.exp(-t / tau);
const attackDecay = (t, att, tau) => (t < att ? t / att : Math.exp(-(t - att) / tau));
const adsr = (t, dur, a, d, s, r) => {
  if (t < a) return t / a;
  if (t < a + d) return lerp(1, s, (t - a) / d);
  if (t < dur - r) return s;
  return Math.max(0, s * (1 - (t - (dur - r)) / r));
};

// Oscillators with running phase (pitch can glide smoothly)
function sweepOsc(f0, f1, glide, shape = 'sin') {
  let ph = 0;
  let last = 0;
  return (t) => {
    const k = clamp(t / glide, 0, 1);
    const f = f0 * Math.pow(f1 / f0, k); // exponential glide
    const dt = t - last;
    last = t;
    ph += TAU * f * dt;
    if (shape === 'sin') return Math.sin(ph);
    if (shape === 'tri') return (2 / Math.PI) * Math.asin(Math.sin(ph));
    if (shape === 'saw') {
      const x = (ph / TAU) % 1;
      return 2 * x - 1;
    }
    return Math.sin(ph);
  };
}

/** FM bell: carrier f, modulator f*ratio, index decaying. */
function fmBell(f, ratio = 3.5, index = 4, tau = 0.6, sr = 44100) {
  return (t) => {
    const env = Math.exp(-t / tau);
    const mod = Math.sin(TAU * f * ratio * t) * index * Math.exp(-t / (tau * 0.4));
    return Math.sin(TAU * f * t + mod) * env;
  };
}

// ─── Filters (RBJ biquads) ───────────────────────────────────
function biquad(type, freq, q, sr) {
  let b0, b1, b2, a1, a2;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (fq) => {
    const w = TAU * clamp(fq, 10, sr * 0.45) / sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let B0, B1, B2, A0, A1, A2;
    if (type === 'lp') { B0 = (1 - cs) / 2; B1 = 1 - cs; B2 = (1 - cs) / 2; }
    else if (type === 'hp') { B0 = (1 + cs) / 2; B1 = -(1 + cs); B2 = (1 + cs) / 2; }
    else { B0 = al; B1 = 0; B2 = -al; } // band-pass (0 dB peak)
    A0 = 1 + al; A1 = -2 * cs; A2 = 1 - al;
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
  };
  set(freq);
  const f = (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  f.set = set;
  return f;
}

/** Filter a whole stereo buffer in place. freqFn(t) lets the cutoff move. */
function filterBuf(b, type, freqFn, q = 0.707) {
  const fl = biquad(type, typeof freqFn === 'number' ? freqFn : freqFn(0), q, b.sr);
  const fr = biquad(type, typeof freqFn === 'number' ? freqFn : freqFn(0), q, b.sr);
  for (let i = 0; i < b.n; i++) {
    if (typeof freqFn === 'function' && i % 32 === 0) {
      const fq = freqFn(i / b.sr);
      fl.set(fq);
      fr.set(fq);
    }
    b.L[i] = fl(b.L[i]);
    b.R[i] = fr(b.R[i]);
  }
}

const softClip = (x, drive = 1) => Math.tanh(x * drive) / Math.tanh(drive);

// ─── Stereo reverb (Freeverb topology) ───────────────────────
function reverb(b, { room = 0.84, damp = 0.3, wet = 0.35, dry = 1, width = 1, predelay = 0.012 } = {}) {
  const scale = b.sr / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  const spread = 23;
  const mk = (len) => ({ buf: new Float32Array(Math.max(1, Math.round(len * scale))), i: 0, store: 0 });
  const combsL = combT.map((t) => mk(t));
  const combsR = combT.map((t) => mk(t + spread));
  const apsL = apT.map((t) => mk(t));
  const apsR = apT.map((t) => mk(t + spread));
  const comb = (c, x) => {
    const y = c.buf[c.i];
    c.store = y * (1 - damp) + c.store * damp;
    c.buf[c.i] = x + c.store * room;
    c.i = (c.i + 1) % c.buf.length;
    return y;
  };
  const ap = (a, x) => {
    const bo = a.buf[a.i];
    const y = -x + bo;
    a.buf[a.i] = x + bo * 0.5;
    a.i = (a.i + 1) % a.buf.length;
    return y;
  };
  const pd = Math.round(predelay * b.sr);
  const pdL = new Float32Array(pd + 1);
  const pdR = new Float32Array(pd + 1);
  let pdi = 0;
  const wet1 = wet * (width / 2 + 0.5);
  const wet2 = wet * ((1 - width) / 2);
  for (let i = 0; i < b.n; i++) {
    const inL = b.L[i];
    const inR = b.R[i];
    const dL = pd ? pdL[pdi] : inL;
    const dR = pd ? pdR[pdi] : inR;
    if (pd) {
      pdL[pdi] = inL;
      pdR[pdi] = inR;
      pdi = (pdi + 1) % pdL.length;
    }
    const input = (dL + dR) * 0.015;
    let oL = 0, oR = 0;
    for (let c = 0; c < 8; c++) {
      oL += comb(combsL[c], input);
      oR += comb(combsR[c], input);
    }
    for (let a = 0; a < 4; a++) {
      oL = ap(apsL[a], oL);
      oR = ap(apsR[a], oR);
    }
    b.L[i] = inL * dry + oL * wet1 + oR * wet2;
    b.R[i] = inR * dry + oR * wet1 + oL * wet2;
  }
}

/** Discrete cave reflections: delayed, darker copies. */
function slapEchoes(b, taps) {
  const srcL = Float32Array.from(b.L);
  const srcR = Float32Array.from(b.R);
  for (const { time, gain, pan = 0, lp = 2500 } of taps) {
    const d = Math.round(time * b.sr);
    const f = biquad('lp', lp, 0.707, b.sr);
    const a = (pan + 1) * Math.PI / 4;
    for (let i = 0; i + d < b.n; i++) {
      const v = f((srcL[i] + srcR[i]) * 0.5) * gain;
      b.L[i + d] += v * Math.cos(a) * Math.SQRT2;
      b.R[i + d] += v * Math.sin(a) * Math.SQRT2;
    }
  }
}

// ─── Mastering + WAV ─────────────────────────────────────────
function master(b, { peakDb = -1, fadeIn = 0.002, fadeOut = 0.05, saturate = 1.2 } = {}) {
  // gentle saturation glues layers, then normalise to target peak
  for (let i = 0; i < b.n; i++) {
    b.L[i] = softClip(b.L[i], saturate);
    b.R[i] = softClip(b.R[i], saturate);
  }
  let peak = 1e-9;
  for (let i = 0; i < b.n; i++) peak = Math.max(peak, Math.abs(b.L[i]), Math.abs(b.R[i]));
  const g = db(peakDb) / peak;
  const fi = Math.floor(fadeIn * b.sr);
  const fo = Math.floor(fadeOut * b.sr);
  for (let i = 0; i < b.n; i++) {
    let e = g;
    if (i < fi) e *= i / fi;
    if (i > b.n - fo) e *= (b.n - i) / fo;
    b.L[i] *= e;
    b.R[i] *= e;
  }
}

/** Make a loop seamless: crossfade the last `xf` seconds into the start, then trim. */
function makeLoop(b, xf) {
  const x = Math.floor(xf * b.sr);
  const len = b.n - x;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    L[i] = b.L[i];
    R[i] = b.R[i];
  }
  for (let i = 0; i < x; i++) {
    const t = i / x;
    const gIn = Math.sin((t * Math.PI) / 2);
    const gOut = Math.cos((t * Math.PI) / 2);
    L[i] = b.L[i] * gIn + b.L[len + i] * gOut;
    R[i] = b.R[i] * gIn + b.R[len + i] * gOut;
  }
  return { sr: b.sr, L, R, n: len };
}

function normalizeLoop(b, peakDb) {
  let peak = 1e-9;
  for (let i = 0; i < b.n; i++) peak = Math.max(peak, Math.abs(b.L[i]), Math.abs(b.R[i]));
  const g = db(peakDb) / peak;
  for (let i = 0; i < b.n; i++) {
    b.L[i] = softClip(b.L[i] * g, 1.05);
    b.R[i] = softClip(b.R[i] * g, 1.05);
  }
}

function writeWav(name, b, mono = false) {
  const ch = mono ? 1 : 2;
  const data = Buffer.alloc(b.n * ch * 2);
  for (let i = 0; i < b.n; i++) {
    if (mono) {
      data.writeInt16LE(Math.round(clamp((b.L[i] + b.R[i]) * 0.5, -1, 1) * 32767), i * 2);
    } else {
      data.writeInt16LE(Math.round(clamp(b.L[i], -1, 1) * 32767), i * 4);
      data.writeInt16LE(Math.round(clamp(b.R[i], -1, 1) * 32767), i * 4 + 2);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(b.sr, 24);
  h.writeUInt32LE(b.sr * ch * 2, 28);
  h.writeUInt16LE(ch * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(join(OUT, name), Buffer.concat([h, data]));
  console.log(`  ${name.padEnd(24)} ${(b.n / b.sr).toFixed(2)}s  ${((44 + data.length) / 1024).toFixed(0)} KB`);
}

const SR = 44100;

// ═════════════════════════════════════════════════════════════
// 1. Sonar ping — the signature sound: click + bright chirp + body, in a cave
// ═════════════════════════════════════════════════════════════
function sonarPing() {
  seed = 11;
  const b = buf(2.2, SR);
  // transient click
  const hp = biquad('hp', 3500, 0.7, SR);
  add(b, 0, 0.006, (t) => hp(white()) * (1 - t / 0.006), 0.55);
  // bright echolocation chirp (with 2nd harmonic)
  const c1 = sweepOsc(2600, 760, 0.13);
  const c2 = sweepOsc(5200, 1520, 0.13);
  add(b, 0.002, 0.3, (t) => (c1(t) + 0.22 * c2(t)) * attackDecay(t, 0.003, 0.07), 0.55);
  // warm body "bwoom"
  const body = sweepOsc(560, 230, 0.42);
  add(b, 0.004, 0.9, (t) => body(t) * attackDecay(t, 0.008, 0.22), 0.42);
  // airy shimmer
  add(b, 0.01, 1.0, fmBell(1975, 2.01, 1.2, 0.28), 0.1);
  // cave
  slapEchoes(b, [
    { time: 0.14, gain: db(-11), pan: -0.5, lp: 3000 },
    { time: 0.29, gain: db(-16), pan: 0.55, lp: 2000 },
    { time: 0.47, gain: db(-22), pan: -0.2, lp: 1400 },
  ]);
  reverb(b, { room: 0.88, damp: 0.32, wet: 0.5, width: 1, predelay: 0.02 });
  filterBuf(b, 'hp', 70);
  master(b, { peakDb: -1.5, fadeOut: 0.4 });
  writeWav('sonar_ping.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 2. Return echoes — tiny pings off objects (3 pitches × left/centre/right)
// ═════════════════════════════════════════════════════════════
function echoes() {
  const pitches = { a: 1500, b: 1780, c: 2120 };
  const pans = { l: -0.75, c: 0, r: 0.75 };
  for (const [pk, f] of Object.entries(pitches)) {
    for (const [sk, pan] of Object.entries(pans)) {
      seed = 100 + f;
      const b = buf(0.6, SR);
      const o = sweepOsc(f, f * 0.82, 0.06, 'tri');
      add(b, 0, 0.2, (t) => o(t) * attackDecay(t, 0.002, 0.03), 0.5, pan);
      const bp = biquad('bp', f * 1.6, 3, SR);
      add(b, 0, 0.02, (t) => bp(white()) * (1 - t / 0.02), 0.25, pan);
      reverb(b, { room: 0.7, damp: 0.45, wet: 0.28, width: 0.6, predelay: 0.008 });
      master(b, { peakDb: -6, fadeOut: 0.15 });
      writeWav(`echo_${pk}_${sk}.wav`, b);
    }
  }
}

// ═════════════════════════════════════════════════════════════
// 3. Wall bump — soft leathery thud against stone
// ═════════════════════════════════════════════════════════════
function wallBump() {
  seed = 33;
  const b = buf(0.5, SR);
  const s = sweepOsc(105, 42, 0.14);
  add(b, 0, 0.3, (t) => s(t) * attackDecay(t, 0.002, 0.07), 0.8);
  const lp = biquad('lp', 500, 0.8, SR);
  add(b, 0, 0.06, (t) => lp(white()) * expDecay(t, 0.015), 0.7);
  const tok = biquad('bp', 950, 4, SR);
  add(b, 0, 0.05, (t) => tok(white()) * expDecay(t, 0.01), 0.35);
  reverb(b, { room: 0.55, damp: 0.6, wet: 0.14, predelay: 0.004 });
  master(b, { peakDb: -3, fadeOut: 0.1, saturate: 1.6 });
  writeWav('wall_bump.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 4. Orb pickup — rising shimmer into an FM bell arpeggio
// ═════════════════════════════════════════════════════════════
function orbPickup() {
  seed = 44;
  const b = buf(2.0, SR);
  // whoosh up
  add(b, 0, 0.18, (t) => white() * Math.sin((t / 0.18) * Math.PI) * 0.5, 0.35);
  filterBuf(b, 'bp', (t) => lerp(1200, 9000, clamp(t / 0.18, 0, 1)), 1.2);
  const notes = [1318.5, 1975.5, 2637]; // E6 B6 E7
  notes.forEach((f, i) => {
    add(b, 0.12 + i * 0.065, 1.6, fmBell(f, 3.5, 2.6, 0.45), 0.42, (i - 1) * 0.45);
    add(b, 0.12 + i * 0.065, 1.6, (t) => Math.sin(TAU * f * 2.01 * t) * expDecay(t, 0.18), 0.08, (i - 1) * 0.45);
  });
  // sparkle
  const sp = biquad('hp', 7000, 0.7, SR);
  add(b, 0.12, 0.5, (t) => sp(white()) * expDecay(t, 0.09) * (0.5 + 0.5 * Math.sin(TAU * 40 * t)), 0.18);
  reverb(b, { room: 0.82, damp: 0.25, wet: 0.42, predelay: 0.015 });
  master(b, { peakDb: -2, fadeOut: 0.4 });
  writeWav('orb_pickup.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 5. Wraith alert — horror sting: sub drop + detuned screech through a sweeping filter
// ═════════════════════════════════════════════════════════════
function wraithAlert() {
  seed = 55;
  const b = buf(2.4, SR);
  const sub = sweepOsc(78, 30, 0.9);
  add(b, 0, 1.4, (t) => softClip(sub(t) * 2.2, 2) * attackDecay(t, 0.01, 0.45), 0.7);
  // screech: detuned saw cluster, vibrato, ring-modulated for grit
  const voices = [430, 437, 452, 466, 481].map((f) => {
    let ph = 0;
    let last = 0;
    return (t) => {
      const vib = 1 + 0.025 * Math.sin(TAU * 6.5 * t) + 0.04 * Math.sin(TAU * 1.3 * t);
      const glide = 1 - 0.3 * clamp(t / 1.2, 0, 1);
      ph += TAU * f * vib * glide * (t - last);
      last = t;
      return 2 * ((ph / TAU) % 1) - 1;
    };
  });
  const scr = buf(2.4, SR);
  add(scr, 0.02, 1.6, (t) => voices.reduce((s, v) => s + v(t), 0) * 0.2 * Math.sin(TAU * 37 * t) * attackDecay(t, 0.035, 0.42), 0.6);
  filterBuf(scr, 'bp', (t) => lerp(2800, 650, clamp(t / 1.1, 0, 1)), 2.2);
  for (let i = 0; i < b.n; i++) {
    b.L[i] += scr.L[i] * 1.6;
    b.R[i] += scr.R[i] * 1.6;
  }
  // breathy hiss
  const hiss = biquad('bp', 3200, 1.5, SR);
  add(b, 0.03, 0.9, (t) => hiss(white()) * attackDecay(t, 0.05, 0.25), 0.25);
  reverb(b, { room: 0.9, damp: 0.35, wet: 0.45, predelay: 0.025 });
  filterBuf(b, 'hp', 28);
  master(b, { peakDb: -1, fadeOut: 0.5, saturate: 1.5 });
  writeWav('wraith_alert.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 6. Death — impact, falling whine, rumble
// ═════════════════════════════════════════════════════════════
function death() {
  seed = 66;
  const b = buf(2.2, SR);
  const lp = biquad('lp', 900, 0.7, SR);
  add(b, 0, 0.5, (t) => lp(white()) * expDecay(t, 0.09), 0.9);
  const boom = sweepOsc(120, 35, 0.5);
  add(b, 0, 1.2, (t) => softClip(boom(t) * 2, 2) * attackDecay(t, 0.003, 0.35), 0.8);
  const whine = sweepOsc(1100, 70, 0.9);
  add(b, 0.03, 1.1, (t) => whine(t) * (0.6 + 0.4 * Math.sin(TAU * 18 * t)) * attackDecay(t, 0.01, 0.4), 0.28);
  reverb(b, { room: 0.88, damp: 0.4, wet: 0.4, predelay: 0.02 });
  filterBuf(b, 'hp', 30);
  master(b, { peakDb: -1, fadeOut: 0.5, saturate: 1.8 });
  writeWav('death.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 7. Level complete — warm chord swell + ascending bells
// ═════════════════════════════════════════════════════════════
function levelComplete() {
  seed = 77;
  const b = buf(3.6, SR);
  const chord = [220, 277.18, 329.63, 440, 659.25]; // A3 C#4 E4 A4 E5
  chord.forEach((f, i) => {
    const pan = (i / (chord.length - 1)) * 1.2 - 0.6;
    for (const det of [-0.0025, 0.0025]) {
      add(b, 0, 3.0, (t) => (Math.sin(TAU * f * (1 + det) * t) + 0.18 * Math.sin(TAU * 2 * f * (1 + det) * t)) * adsr(t, 3.0, 0.09, 0.6, 0.5, 1.6), 0.12, pan);
    }
  });
  const bells = [880, 1108.73, 1318.51, 1760];
  bells.forEach((f, i) => add(b, 0.1 + i * 0.12, 2.4, fmBell(f, 3.01, 1.8, 0.7), 0.3, (i - 1.5) * 0.35));
  reverb(b, { room: 0.9, damp: 0.25, wet: 0.55, predelay: 0.03 });
  master(b, { peakDb: -1.5, fadeOut: 0.8 });
  writeWav('level_complete.wav', b);
}

// ═════════════════════════════════════════════════════════════
// 8. Wing flutter loop — soft leathery flaps, volume follows bat speed
// ═════════════════════════════════════════════════════════════
function flutterLoop() {
  seed = 88;
  const flaps = 10;
  const len = 2.0;
  const b = buf(len + 0.25, SR);
  for (let k = 0; k <= flaps; k++) {
    const t0 = (k / flaps) * len + (rand() - 0.5) * 0.012;
    const bp = biquad('bp', 700 + rand() * 250, 1.1, SR);
    const lp = biquad('lp', 1800, 0.7, SR);
    const g = 0.75 + rand() * 0.25;
    add(b, Math.max(0, t0), 0.16, (t) => lp(bp(white())) * Math.sin(clamp(t / 0.12, 0, 1) * Math.PI) ** 1.5, g, (rand() - 0.5) * 0.3);
    const th = sweepOsc(160, 90, 0.08);
    add(b, Math.max(0, t0 + 0.02), 0.1, (t) => th(t) * expDecay(t, 0.025), 0.25 * g);
  }
  const loop = makeLoop(b, 0.25);
  normalizeLoop(loop, -5);
  writeWav('flutter_loop.wav', loop);
}

// ═════════════════════════════════════════════════════════════
// 9. Cave ambience loop — rumble, wind, distant drips
// ═════════════════════════════════════════════════════════════
function caveAmbience() {
  seed = 99;
  const sr = 32000;
  const len = 16;
  const xf = 2.5;
  const b = buf(len + xf, sr);
  // brown-noise rumble with a slow swell
  let brownL = 0, brownR = 0;
  const lpL = biquad('lp', 160, 0.7, sr);
  const lpR = biquad('lp', 160, 0.7, sr);
  for (let i = 0; i < b.n; i++) {
    const t = i / sr;
    brownL = clamp(brownL + white() * 0.02, -1, 1) * 0.998;
    brownR = clamp(brownR + white() * 0.02, -1, 1) * 0.998;
    const swell = 0.7 + 0.3 * Math.sin(TAU * t / 9);
    b.L[i] += lpL(brownL) * 1.6 * swell;
    b.R[i] += lpR(brownR) * 1.6 * swell;
  }
  // wind through tunnels: band-passed noise with a wandering centre
  const wind = buf(len + xf, sr);
  add(wind, 0, len + xf, () => white(), 0.12, -0.3);
  add(wind, 0, len + xf, () => white(), 0.12, 0.3);
  filterBuf(wind, 'bp', (t) => 380 + 160 * Math.sin(TAU * t / 7) + 80 * Math.sin(TAU * t / 3.1), 2.5);
  for (let i = 0; i < b.n; i++) {
    b.L[i] += wind.L[i];
    b.R[i] += wind.R[i];
  }
  // faint deep tones beating against each other
  add(b, 0, len + xf, (t) => Math.sin(TAU * 55 * t) + 0.6 * Math.sin(TAU * 55.35 * t) + 0.3 * Math.sin(TAU * 82.4 * t), 0.018);
  // water drips (wet, panned)
  const drips = buf(len + xf, sr);
  const times = [1.1, 3.4, 4.0, 6.8, 9.2, 11.5, 12.1, 14.6];
  for (const t0 of times) {
    const f = 700 + rand() * 900;
    const s = sweepOsc(f, f * 2.4, 0.035);
    add(drips, t0, 0.12, (t) => s(t) * attackDecay(t, 0.001, 0.018), 0.22 + rand() * 0.15, (rand() - 0.5) * 1.6);
  }
  reverb(drips, { room: 0.92, damp: 0.3, wet: 0.7, dry: 0.5, predelay: 0.03 });
  for (let i = 0; i < b.n; i++) {
    b.L[i] += drips.L[i];
    b.R[i] += drips.R[i];
  }
  filterBuf(b, 'hp', 25);
  const loop = makeLoop(b, xf);
  normalizeLoop(loop, -6);
  writeWav('cave_ambience.wav', loop);
}

// ═════════════════════════════════════════════════════════════
// 10. Wraith growl loop — low purring growl + breath (left / right copies for direction)
// ═════════════════════════════════════════════════════════════
function wraithGrowl() {
  for (const [name, pan] of [['wraith_growl_l.wav', -0.85], ['wraith_growl_r.wav', 0.85]]) {
    seed = 1010;
    const len = 4;
    const xf = 0.6;
    const b = buf(len + xf, SR);
    const saws = [47, 49.5, 94.3].map((f) => {
      let ph = 0;
      return (t, i) => {
        ph += (TAU * f * (1 + 0.01 * Math.sin(TAU * 0.5 * t))) / SR;
        return 2 * ((ph / TAU) % 1) - 1;
      };
    });
    add(b, 0, len + xf, (t, i) => {
      const purr = 0.55 + 0.45 * Math.sin(TAU * 3 * t) ** 2;
      return saws.reduce((s, v) => s + v(t, i), 0) * 0.33 * purr;
    }, 0.7, pan);
    filterBuf(b, 'lp', (t) => 260 + 120 * Math.sin(TAU * t / 2), 1.4);
    const breath = buf(len + xf, SR);
    add(breath, 0, len + xf, (t) => white() * (Math.max(0, Math.sin(TAU * t / 2)) ** 2), 0.4, pan);
    filterBuf(breath, 'bp', 320, 1.3);
    for (let i = 0; i < b.n; i++) {
      b.L[i] = softClip(b.L[i] * 1.8, 1.6) + breath.L[i];
      b.R[i] = softClip(b.R[i] * 1.8, 1.6) + breath.R[i];
    }
    reverb(b, { room: 0.75, damp: 0.45, wet: 0.25, predelay: 0.01 });
    const loop = makeLoop(b, xf);
    normalizeLoop(loop, -3);
    writeWav(name, loop);
  }
}

console.log('Rendering Bat Pulse sounds →', OUT);
sonarPing();
echoes();
wallBump();
orbPickup();
wraithAlert();
death();
levelComplete();
flutterLoop();
caveAmbience();
wraithGrowl();
console.log('Done.');
