/**
 * Animated Skia artwork for menu screens: the Descent well, the daily moon dial and the
 * ability sigils. Everything is drawn from code (no image assets) and loops seamlessly.
 */
import { Skia, type SkCanvas } from '@shopify/react-native-skia';
import { fill, stroke, glow, radial, additive, shaded, linear, blurred } from './skia/sk';
import type { AbilityId } from '../types/game';
import type { SkinDef } from '../skins/skins';

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);

/** Stable pseudo-random 0..1 from an integer. */
function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ─── The Descent: a stone well falling away forever ─────────────────────────
export function drawAbyss(c: SkCanvas, t: number, w: number, h: number, accent = '#4DF0FF') {
  const cx = w / 2;
  const cy = h * 0.5;
  const R = Math.max(w, h) * 0.78;
  // deep backdrop
  c.drawRect(Skia.XYWHRect(0, 0, w, h), fill('#03060A'));
  glow(c, radial(`abyssFog${accent}`, [[0, accent, 0.22], [0.45, '#0A2A3A', 0.18], [1, '#000000', 0]]), cx, cy, R * 0.55, 1);

  // stone rings: each one shrinks toward the centre and is replaced at the rim (endless zoom)
  const speed = t * 0.00011;
  const N = 9;
  for (let k = N - 1; k >= 0; k--) {
    const z = frac(k / N + speed); // 0 = far (centre) → 1 = near (rim)
    const s = Math.pow(z, 2.2);
    const rx = R * s;
    const ry = rx * 0.58;
    if (rx < 3) continue;
    const near = z;
    const rot = k * 0.7 + t * 0.00004 * (k % 2 ? 1 : -1);
    c.save();
    c.translate(cx, cy);
    c.scale(1, ry / rx);
    // ring body
    c.drawCircle(0, 0, rx, stroke('#2A323C', Math.max(1, rx * 0.11), 0.25 + near * 0.6));
    c.drawCircle(0, 0, rx * 1.05, stroke('#0B0F14', Math.max(1, rx * 0.025), 0.9 * near));
    // bricks: short dark ticks around the ring
    const bricks = 22;
    const p = Skia.PathBuilder.Make();
    for (let b = 0; b < bricks; b++) {
      const a = rot + (b / bricks) * TAU;
      p.moveTo(Math.cos(a) * rx * 0.95, Math.sin(a) * rx * 0.95);
      p.lineTo(Math.cos(a) * rx * 1.05, Math.sin(a) * rx * 1.05);
    }
    c.drawPath(p.build(), stroke('#06080B', Math.max(0.6, rx * 0.012), 0.8 * near));
    // upper rim catches lantern light
    const lit = Skia.PathBuilder.Make();
    lit.addArc(Skia.XYWHRect(-rx, -rx, rx * 2, rx * 2), 200, 140);
    c.drawPath(lit.build(), stroke('#8E9AA8', Math.max(0.8, rx * 0.012), 0.35 * near));
    c.restore();
  }

  // sonar rings sinking into the dark
  for (let i = 0; i < 3; i++) {
    const z = 1 - frac(t * 0.00028 + i / 3);
    const rx = R * 0.62 * Math.pow(z, 1.6);
    if (rx < 2) continue;
    c.save();
    c.translate(cx, cy);
    c.scale(1, 0.58);
    c.drawCircle(0, 0, rx, additive(stroke(accent, 1.6, 0.55 * z)));
    c.drawCircle(0, 0, rx, additive(blurred(stroke(accent, 5, 0.18 * z), 4)));
    c.restore();
  }

  // the bottom: a faint pulsing light very far down
  const beat = 0.6 + 0.4 * Math.sin(t * 0.002);
  glow(c, radial(`abyssCore${accent}`, [[0, '#E8FDFF', 0.9], [0.2, accent, 0.5], [1, accent, 0]]), cx, cy, 16 + 4 * beat, 0.8);

  // dust falling past
  const motes = Skia.PathBuilder.Make();
  for (let i = 0; i < 26; i++) {
    const life = frac(t * 0.00006 * (0.6 + hash(i)) + hash(i + 50));
    const a = hash(i + 9) * TAU;
    const r = R * 0.65 * (1 - life);
    motes.addCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.58, 0.5 + (1 - life) * 1.4);
  }
  c.drawPath(motes.build(), additive(fill('#CFE6F2', 0.35)));

  // vignette
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`abyssV${h}`, 0, 0, 0, h, [[0, '#03060A', 0.85], [0.25, '#03060A', 0], [0.75, '#03060A', 0], [1, '#03060A', 0.95]])));
}

// ─── Daily: a carved moon-phase dial that turns slowly ─────────────────────
export function drawMoonDial(c: SkCanvas, t: number, size: number, accent = '#FFC24A') {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  glow(c, radial(`dialGlow${accent}`, [[0, accent, 0.25], [1, accent, 0]]), cx, cy, R * 1.1, 0.8 + 0.2 * Math.sin(t * 0.0015));
  // stone disc
  c.drawCircle(cx, cy, R, shaded(linear(`dial${size}`, 0, cy - R, 0, cy + R, [[0, '#3A424D', 1], [1, '#0D1116', 1]])));
  c.drawCircle(cx, cy, R, stroke('#8C96A4', 2));
  c.drawCircle(cx, cy, R * 0.92, stroke('#000000', 1.4, 0.7));
  // turning ring of 8 moon phases
  c.save();
  c.translate(cx, cy);
  c.rotate(t * 0.004, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const x = Math.cos(a) * R * 0.74;
    const y = Math.sin(a) * R * 0.74;
    const r = R * 0.1;
    c.drawCircle(x, y, r, fill('#0A0D12'));
    c.drawCircle(x, y, r, stroke('#5A6470', 0.8));
    // lit part: offset dark disc carves a crescent
    const ph = i / 8;
    c.save();
    const clip = Skia.PathBuilder.Make();
    clip.addCircle(x, y, r * 0.86);
    c.clipPath(clip.build(), 1, true);
    c.drawCircle(x, y, r * 0.86, fill('#E8E2CC', 0.9));
    c.drawCircle(x + Math.cos(ph * TAU) * r * 1.7, y, r * 0.95, fill('#0A0D12'));
    c.restore();
  }
  c.restore();
  // ticks
  const ticks = Skia.PathBuilder.Make();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    const l = i % 6 === 0 ? 0.08 : 0.04;
    ticks.moveTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
    ticks.lineTo(cx + Math.cos(a) * R * (0.92 - l), cy + Math.sin(a) * R * (0.92 - l));
  }
  c.drawPath(ticks.build(), stroke('#6E7884', 1, 0.8));
  // centre: today's full moon, glowing
  const m = R * 0.38;
  glow(c, radial(`dialMoon${accent}`, [[0, '#FFF6DA', 0.9], [0.5, accent, 0.35], [1, accent, 0]]), cx, cy, m * 1.7, 0.9);
  c.drawCircle(cx, cy, m, shaded(linear(`moonFace${size}`, cx - m, cy - m, cx + m, cy + m, [[0, '#FFF8E6', 1], [1, '#C8B890', 1]])));
  c.drawCircle(cx - m * 0.3, cy - m * 0.15, m * 0.18, fill('#B8A880', 0.5));
  c.drawCircle(cx + m * 0.25, cy + m * 0.3, m * 0.12, fill('#B8A880', 0.45));
  c.drawCircle(cx + m * 0.35, cy - m * 0.35, m * 0.08, fill('#B8A880', 0.4));
}

// ─── Ability sigils ──────────────────────────────────────────────────────────
export type SigilState = 'equipped' | 'owned' | 'locked';

/** A steel medallion with a turning rune ring and the ability's animated symbol. */
export function drawSigil(c: SkCanvas, t: number, size: number, id: AbilityId, state: SigilState, color = '#4DF0FF') {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.44;
  const on = state !== 'locked';
  const hot = state === 'equipped';
  const ink = on ? color : '#5A6470';
  if (hot) glow(c, radial(`sigilHalo${color}`, [[0, color, 0.45], [1, color, 0]]), cx, cy, R * 1.25, 0.75 + 0.25 * Math.sin(t * 0.003));
  // medallion
  c.drawCircle(cx, cy, R, shaded(linear(`sigilBody${size}`, 0, cy - R, 0, cy + R, [[0, '#2C333D', 1], [1, '#07090C', 1]])));
  c.drawCircle(cx, cy, R, stroke('#A8B2BE', 1.8, on ? 0.95 : 0.5));
  c.drawCircle(cx, cy, R * 0.9, stroke('#000000', 1.2, 0.7));
  // rune ring (turns while equipped)
  c.save();
  c.translate(cx, cy);
  c.rotate(hot ? t * 0.02 : 0, 0, 0);
  c.drawCircle(0, 0, R * 0.8, stroke(ink, 1, on ? 0.55 : 0.3, false, [3, 4]));
  c.restore();

  const k = R * 0.55; // symbol scale
  const a = on ? 1 : 0.45;
  c.save();
  c.translate(cx, cy);
  const line = (w = 1.8, alpha = 1) => additive(stroke(ink, w, a * alpha, true));
  const soft = (w = 5, alpha = 0.25) => additive(blurred(stroke(ink, w, a * alpha, true), 3));
  switch (id) {
    case 'WIDE_PULSE': {
      c.drawCircle(0, 0, k * 0.14, fill(ink, a));
      for (let i = 0; i < 3; i++) {
        const z = on ? frac(t * 0.0007 + i / 3) : (i + 1) / 3.2;
        const r = k * (0.25 + z * 0.8);
        const p = Skia.PathBuilder.Make();
        p.addArc(Skia.XYWHRect(-r, -r, r * 2, r * 2), -60, 120);
        p.addArc(Skia.XYWHRect(-r, -r, r * 2, r * 2), 120, 120);
        c.drawPath(p.build(), line(1.8, 1 - z * 0.8));
        c.drawPath(p.build(), soft(5, 0.25 * (1 - z)));
      }
      break;
    }
    case 'PIERCING_PING': {
      // cracked wall in the middle, a wave passing through it
      c.drawRect(Skia.XYWHRect(-k * 0.12, -k * 0.7, k * 0.24, k * 1.4), fill('#4A535E', a));
      const crack = Skia.PathBuilder.Make();
      crack.moveTo(-k * 0.05, -k * 0.5);
      crack.lineTo(k * 0.06, -k * 0.15);
      crack.lineTo(-k * 0.04, k * 0.15);
      crack.lineTo(k * 0.05, k * 0.5);
      c.drawPath(crack.build(), line(1.2, 0.9));
      const z = on ? frac(t * 0.0006) : 0.6;
      const x = -k * 0.9 + z * k * 1.8;
      const p = Skia.PathBuilder.Make();
      p.addArc(Skia.XYWHRect(x - k * 0.5, -k * 0.5, k, k), -50, 100);
      c.drawPath(p.build(), line(2, Math.sin(z * Math.PI)));
      c.drawPath(p.build(), soft(6, 0.3 * Math.sin(z * Math.PI)));
      c.drawCircle(-k * 0.85, 0, k * 0.1, fill(ink, a));
      break;
    }
    case 'RICOCHET': {
      // path: from lower-left up to a corner, bouncing off to the right
      const pts: [number, number][] = [
        [-k * 0.8, k * 0.7],
        [-k * 0.1, -k * 0.55],
        [k * 0.8, k * 0.15],
      ];
      const corner = Skia.PathBuilder.Make();
      corner.moveTo(-k * 0.55, -k * 0.75);
      corner.lineTo(k * 0.35, -k * 0.75);
      c.drawPath(corner.build(), stroke('#6E7884', 2.4, a));
      const p = Skia.PathBuilder.Make();
      p.moveTo(pts[0][0], pts[0][1]);
      p.lineTo(pts[1][0], pts[1][1]);
      p.lineTo(pts[2][0], pts[2][1]);
      c.drawPath(p.build(), stroke(ink, 1.2, a * 0.5, true, [3, 3]));
      // a travelling spark
      const z = on ? frac(t * 0.0005) : 0.5;
      const seg = z < 0.5 ? 0 : 1;
      const u = z < 0.5 ? z * 2 : (z - 0.5) * 2;
      const sx = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * u;
      const sy = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * u;
      glow(c, radial(`spark${ink}`, [[0, '#FFFFFF', 1], [0.3, ink, 0.6], [1, ink, 0]]), sx, sy, k * 0.3, a);
      if (on && Math.abs(z - 0.5) < 0.08) glow(c, radial(`bounce${ink}`, [[0, ink, 0.7], [1, ink, 0]]), pts[1][0], pts[1][1], k * 0.5, 1 - Math.abs(z - 0.5) / 0.08);
      break;
    }
    case 'WHISPER_STEP': {
      // folded wing + "hush" waves fading inward
      const wing = Skia.PathBuilder.Make();
      wing.moveTo(-k * 0.1, -k * 0.65);
      wing.cubicTo(-k * 0.8, -k * 0.5, -k * 0.95, k * 0.2, -k * 0.55, k * 0.65);
      wing.cubicTo(-k * 0.45, k * 0.35, -k * 0.3, k * 0.4, -k * 0.2, k * 0.6);
      wing.cubicTo(-k * 0.12, k * 0.3, -k * 0.02, k * 0.35, k * 0.05, k * 0.5);
      wing.close();
      c.drawPath(wing.build(), fill(ink, a * 0.85));
      for (let i = 0; i < 3; i++) {
        const z = on ? frac(-t * 0.0005 + i / 3) : (i + 1) / 3.5;
        const r = k * (0.3 + z * 0.6);
        const p = Skia.PathBuilder.Make();
        p.addArc(Skia.XYWHRect(k * 0.05 - r, -r, r * 2, r * 2), -45, 90);
        c.drawPath(p.build(), line(1.4, z * 0.9));
      }
      break;
    }
    case 'SIXTH_SENSE': {
      // an eye; the pupil is a compass needle hunting for the exit
      const eye = Skia.PathBuilder.Make();
      eye.moveTo(-k * 0.95, 0);
      eye.quadTo(0, -k * 0.95, k * 0.95, 0);
      eye.quadTo(0, k * 0.95, -k * 0.95, 0);
      eye.close();
      c.drawPath(eye.build(), line(1.8));
      c.drawPath(eye.build(), soft(6, 0.25));
      const open = on ? 0.75 + 0.25 * Math.sin(t * 0.0025) : 0.6;
      c.drawCircle(0, 0, k * 0.36 * open, stroke(ink, 1.4, a));
      c.save();
      c.rotate(on ? Math.sin(t * 0.0012) * 50 + Math.sin(t * 0.0031) * 15 : 30, 0, 0);
      const needle = Skia.PathBuilder.Make();
      needle.moveTo(0, -k * 0.3);
      needle.lineTo(k * 0.08, 0);
      needle.lineTo(0, k * 0.3);
      needle.lineTo(-k * 0.08, 0);
      needle.close();
      c.drawPath(needle.build(), fill(ink, a));
      c.drawCircle(0, -k * 0.3, k * 0.05, fill('#FFFFFF', a));
      c.restore();
      break;
    }
  }
  c.restore();
  if (state === 'locked') c.drawCircle(cx, cy, R, fill('#05070A', 0.35));
}

// ─── The Roost: full-screen atmosphere tinted by the selected skin ──────────

/**
 * Backdrop for the skin screen: deep gradient in the skin's colours, slowly turning light shafts,
 * a giant faint rune circle, and particles that match the skin (embers rise, snow falls…).
 * `focusY` = where the hero bat sits (rays and circle centre on it).
 */
export function drawRoostAtmosphere(c: SkCanvas, t: number, w: number, h: number, skin: SkinDef, rarityColor: string, focusY: number) {
  const aura = skin.fx.aura;
  const glowC = skin.fx.glow;
  const cx = w / 2;
  c.drawRect(Skia.XYWHRect(0, 0, w, h), fill('#04060A'));
  // coloured fog around the hero
  glow(c, radial(`roostFog${aura}`, [[0, aura, 0.3], [0.5, aura, 0.1], [1, aura, 0]]), cx, focusY, Math.max(w, h) * 0.75, 1);
  glow(c, radial(`roostFog2${rarityColor}`, [[0, rarityColor, 0.16], [1, rarityColor, 0]]), cx, h * 0.95, w * 0.9, 1);

  // light shafts fanning down from above, swaying
  c.save();
  c.translate(cx, -h * 0.08);
  const sway = Math.sin(t * 0.00025) * 6;
  for (let i = 0; i < 7; i++) {
    const a = -32 + i * 10.6 + sway + Math.sin(t * 0.0004 + i) * 2;
    const len = h * 1.05;
    const wid = 0.035 + 0.025 * hash(i);
    const alpha = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.0009 + i * 1.7));
    c.save();
    c.rotate(a, 0, 0);
    const p = Skia.PathBuilder.Make();
    p.moveTo(-len * wid * 0.2, 0);
    p.lineTo(len * wid * 0.2, 0);
    p.lineTo(len * wid, len);
    p.lineTo(-len * wid, len);
    p.close();
    c.drawPath(p.build(), additive(shaded(linear(`shaft${glowC}${Math.round(len)}`, 0, 0, 0, len, [[0, glowC, 0.9], [0.6, glowC, 0.25], [1, glowC, 0]]), alpha)));
    c.restore();
  }
  c.restore();

  // giant rune circle behind the hero, two rings turning opposite ways
  const R = Math.min(w * 0.62, h * 0.32);
  c.save();
  c.translate(cx, focusY);
  c.save();
  c.rotate(t * 0.004, 0, 0);
  c.drawCircle(0, 0, R, stroke(rarityColor, 1, 0.16, false, [2, 9]));
  const runes = Skia.PathBuilder.Make();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const x = Math.cos(a) * R * 0.9;
    const y = Math.sin(a) * R * 0.9;
    const s = R * 0.035;
    // little carved glyphs: a stroke + a tick, varied per slot
    runes.moveTo(x - s, y - s);
    runes.lineTo(x + s, y + s);
    if (i % 3 === 0) {
      runes.moveTo(x + s, y - s);
      runes.lineTo(x, y);
    } else if (i % 3 === 1) {
      runes.addCircle(x, y - s * 1.2, s * 0.4);
    }
  }
  c.drawPath(runes.build(), stroke(glowC, 1, 0.1, true));
  c.restore();
  c.save();
  c.rotate(-t * 0.007, 0, 0);
  c.drawCircle(0, 0, R * 0.78, stroke(glowC, 0.8, 0.14, false, [14, 6, 2, 6]));
  const tri = Skia.PathBuilder.Make();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    const b = ((i + 1) / 3) * TAU - Math.PI / 2;
    tri.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
    tri.lineTo(Math.cos(b) * R * 0.78, Math.sin(b) * R * 0.78);
  }
  c.drawPath(tri.build(), stroke(glowC, 0.8, 0.08));
  c.restore();
  c.restore();

  // skin particles across the whole screen
  const kind = skin.fx.particles;
  const n = kind === 'none' ? 18 : 42;
  const motes = Skia.PathBuilder.Make();
  const big = Skia.PathBuilder.Make();
  for (let i = 0; i < n; i++) {
    const r0 = hash(i);
    const r1 = hash(i + 100);
    const r2 = hash(i + 200);
    let x: number;
    let y: number;
    let s = 0.8 + r2 * 1.6;
    if (kind === 'snow') {
      const life = frac(t * 0.00005 * (0.6 + r1) + r0);
      y = life * (h + 20) - 10;
      x = r0 * w + Math.sin(t * 0.001 + i) * 14;
      s *= 1.3;
    } else if (kind === 'smoke') {
      const life = frac(t * 0.00003 * (0.6 + r1) + r0);
      y = h - life * h * 0.8;
      x = r0 * w + Math.sin(t * 0.0006 + i) * 30;
      big.addCircle(x, y, 10 + r2 * 18);
      continue;
    } else if (kind === 'spores' || kind === 'moon') {
      x = frac(r0 + Math.sin(t * 0.00012 + i) * 0.05) * w;
      y = frac(r1 + t * 0.000015 * (r2 - 0.5)) * h;
      s *= kind === 'moon' ? 0.9 : 1.2;
    } else if (kind === 'sparks') {
      const blink = frac(t * 0.0006 + r0);
      if (blink > 0.12) continue;
      x = r0 * w;
      y = r1 * h;
      s = 1.5 + r2 * 2;
      big.addCircle(x, y, s * 3);
    } else {
      // embers, gold, none: rise slowly with a wobble
      const life = frac(t * 0.00004 * (0.6 + r1) + r0);
      y = h + 10 - life * (h + 20);
      x = r0 * w + Math.sin(t * 0.0013 + i * 2) * 10;
    }
    motes.addCircle(x, y, s);
  }
  const moteColor = kind === 'none' ? '#9AB4C8' : skin.fx.accent;
  c.drawPath(motes.build(), additive(fill(moteColor, kind === 'none' ? 0.25 : 0.55)));
  if (kind === 'smoke') c.drawPath(big.build(), blurred(fill(skin.fx.glow, 0.05), 8));
  if (kind === 'sparks') c.drawPath(big.build(), additive(blurred(fill(skin.fx.glow, 0.35), 4)));

  // top/bottom fade so the UI stays readable
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`roostV${h}`, 0, 0, 0, h, [[0, '#04060A', 0.9], [0.14, '#04060A', 0], [0.5, '#04060A', 0], [1, '#04060A', 0.85]])));
}

/** One-shot celebration burst (unlock / equip): `k` = 0..1 progress. */
export function drawBurst(c: SkCanvas, k: number, w: number, h: number, cx: number, cy: number, color: string) {
  if (k <= 0 || k >= 1) return;
  const e = 1 - Math.pow(1 - k, 3);
  const fade = 1 - k;
  glow(c, radial(`burst${color}`, [[0, '#FFFFFF', 0.9], [0.25, color, 0.6], [1, color, 0]]), cx, cy, 40 + e * Math.max(w, h) * 0.5, fade * 0.9);
  // expanding rings
  for (let i = 0; i < 3; i++) {
    const r = e * (120 + i * 70);
    c.drawCircle(cx, cy, r, additive(stroke(color, 3 - i * 0.7, fade * (0.8 - i * 0.2))));
  }
  // rays
  c.save();
  c.translate(cx, cy);
  c.rotate(k * 40, 0, 0);
  const rays = Skia.PathBuilder.Make();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const r1 = 30 + e * 60;
    const r2 = 60 + e * 260 * (0.7 + 0.3 * hash(i));
    rays.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    rays.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
  }
  c.drawPath(rays.build(), additive(stroke(color, 2, fade * 0.7, true)));
  c.restore();
  // sparks flung outwards
  const sp = Skia.PathBuilder.Make();
  for (let i = 0; i < 40; i++) {
    const a = hash(i) * TAU;
    const v = 120 + hash(i + 40) * 260;
    const r = e * v;
    sp.addCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r + k * k * 60, 1.2 + hash(i + 80) * 2.2);
  }
  c.drawPath(sp.build(), additive(fill('#FFFFFF', fade)));
}
