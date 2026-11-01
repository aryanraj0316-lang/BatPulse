import { ClipOp, type SkCanvas, type SkPath } from '@shopify/react-native-skia';
import { THEME, HQ } from '../theme';
import { LevelDecor, LanternDecor } from '../../art/decor';
import { makeRng, circleD, f, clamp } from '../../art/kit';
import { fill, stroke, shaded, radial, radialAt, linear, additive, blurred, svgPathOnce, svgPath, rect, rrect, glow } from '../sk';
import type { Biome, LightKind, AtmosKind } from '../../themes/biomes';

/**
 * BIOME ART — everything that makes each chapter look like its own place.
 *  - baked floor + wall details (puddles, lava cracks, frost, roots, gold runes …)
 *  - animated light fixtures (jellyfish, braziers, ice lamps, glow-caps, star orbs)
 *  - live glows under the darkness (lava flowing in cracks, breathing fungi, turning runes)
 *  - atmosphere above the darkness (bubbles, embers, snow, spores, stars) + screen-edge ambience
 * Visual only: nothing here touches gameplay.
 */

type Layer = { d: string; color: string; a: number; w?: number; blur?: number; mode?: 'stroke' | 'fill'; add?: boolean };

export interface BiomeDecor {
  biome: Biome;
  floor: Layer[];
  wall: Layer[];
  /** soft pulsing light spots (algae, hot cracks, fungi …) */
  glows: { x: number; y: number; r: number; ph: number; color: string }[];
  /** glowing lines with light travelling along them (lava cracks, molten seams) */
  flow: string;
  /** glowing lines that breathe as a whole (astral wall runes) */
  pulse: string;
  sparkles: { x: number; y: number; ph: number; s: number }[];
  runes: { x: number; y: number; r: number; ph: number; dir: number }[];
  shrooms: { x: number; y: number; s: number; color: string; ph: number }[];
  corals: { x: number; y: number; ph: number }[];
}

export interface BiomePaths {
  flow: SkPath | null;
  pulse: SkPath | null;
  ring: Map<number, SkPath | null>;
}

// ─── builders ────────────────────────────────────────────────

export function buildBiomeDecor(biome: Biome, decor: LevelDecor, w: number, h: number, seed: number): BiomeDecor {
  const rng = makeRng(seed * 13 + biome.index * 101 + 7);
  const bd: BiomeDecor = { biome, floor: [], wall: [], glows: [], flow: '', pulse: '', sparkles: [], runes: [], shrooms: [], corals: [] };
  const area = (w * h) / (80 * 80);
  const cm = decor.cellMin;
  const pad = decor.wallPad;
  const inner = decor.walls.filter((x) => !x.id.startsWith('w_border'));
  const rx = () => rng.range(6, w - 6);
  const ry = () => rng.range(6, h - 6);
  const add = (list: Layer[], l: Layer) => l.d && list.push(l);

  const crack = (x: number, y: number, len: number, ang: number, depth: number): string => {
    let d = `M${f(x)},${f(y)}`;
    let cx = x;
    let cy = y;
    const segs = rng.int(4, 7);
    for (let i = 0; i < segs; i++) {
      ang += rng.range(-0.6, 0.6);
      const l = (len / segs) * rng.range(0.6, 1.4);
      cx += Math.cos(ang) * l;
      cy += Math.sin(ang) * l;
      d += `L${f(cx)},${f(cy)}`;
      if (depth > 0 && rng.chance(0.3)) d += crack(cx, cy, len * 0.45, ang + (rng.chance(0.5) ? 1 : -1) * rng.range(0.6, 1.2), depth - 1) + `M${f(cx)},${f(cy)}`;
    }
    return d;
  };

  switch (biome.id) {
    case 'grotto': {
      let puddles = '';
      let puddleRim = '';
      let puddleHi = '';
      for (let i = 0; i < Math.round(area * 0.12); i++) {
        const x = rx();
        const y = ry();
        const r = rng.range(5, 11);
        puddles += ellipseD(x, y, r * 1.4, r * 0.8);
        puddleRim += ellipseD(x, y, r * 1.4, r * 0.8);
        puddleHi += ellipseD(x - r * 0.4, y - r * 0.25, r * 0.5, r * 0.18);
      }
      add(bd.floor, { d: puddles, color: '#031416', a: 0.85 });
      add(bd.floor, { d: puddleRim, color: '#7FE0D0', a: 0.22, w: 0.6, mode: 'stroke' });
      add(bd.floor, { d: puddleHi, color: '#B8FFF0', a: 0.18 });
      let algae = '';
      for (let i = 0; i < Math.round(area * 0.2); i++) {
        const x = rx();
        const y = ry();
        for (let k = 0; k < rng.int(4, 8); k++) algae += circleD(x + rng.range(-5, 5), y + rng.range(-4, 4), rng.range(0.5, 1.3));
        bd.glows.push({ x, y, r: rng.range(7, 12), ph: rng.range(0, 6.3), color: '#2FE6C0' });
      }
      add(bd.floor, { d: algae, color: '#3FF0C8', a: 0.55 });
      let shells = '';
      for (let i = 0; i < Math.round(area * 0.12); i++) shells += fanD(rx(), ry(), rng.range(1.6, 2.6), rng.range(0, 6.3));
      add(bd.floor, { d: shells, color: '#E8C8B0', a: 0.55 });
      // walls: barnacles + coral fans at some wall ends
      let barn = '';
      let barnDot = '';
      let coralA = '';
      let coralB = '';
      for (const wr of inner) {
        const hor = wr.width >= wr.height;
        const len = hor ? wr.width : wr.height;
        const n = rng.chance(0.6) ? Math.floor(len / 12) : 0;
        for (let i = 0; i < n; i++) {
          const t = rng.range(0, len);
          const ac = rng.range(-pad, (hor ? wr.height : wr.width) + pad);
          const bx = hor ? wr.x + t : wr.x + ac;
          const by = hor ? wr.y + ac : wr.y + t;
          const r = rng.range(0.8, 1.5);
          barn += circleD(bx, by, r);
          barnDot += circleD(bx, by, r * 0.4);
        }
        if (rng.chance(0.22)) {
          const atStart = rng.chance(0.5);
          const ex = hor ? (atStart ? wr.x + 2 : wr.x + wr.width - 2) : wr.x + wr.width / 2;
          const ey = hor ? wr.y + wr.height / 2 : atStart ? wr.y + 2 : wr.y + wr.height - 2;
          const branches = coralD(rng, ex, ey, rng.range(5, 8));
          if (rng.chance(0.5)) coralA += branches;
          else coralB += branches;
          bd.corals.push({ x: ex, y: ey, ph: rng.range(0, 6.3) });
          bd.glows.push({ x: ex, y: ey, r: 9, ph: rng.range(0, 6.3), color: '#FF6FB0' });
        }
      }
      add(bd.wall, { d: barn, color: '#A8C8C0', a: 0.9 });
      add(bd.wall, { d: barnDot, color: '#0E2A28', a: 0.9 });
      add(bd.wall, { d: coralA, color: '#FF7A9A', a: 0.95, w: 1.1, mode: 'stroke' });
      add(bd.wall, { d: coralB, color: '#FFB070', a: 0.95, w: 1.1, mode: 'stroke' });
      break;
    }
    case 'forge': {
      let cracks = '';
      for (let i = 0; i < Math.round(area * 0.1); i++) {
        const x = rx();
        const y = ry();
        cracks += crack(x, y, cm * rng.range(0.7, 1.5), rng.range(0, 6.3), 1);
        bd.glows.push({ x, y, r: rng.range(10, 16), ph: rng.range(0, 6.3), color: '#FF5A0A' });
      }
      add(bd.floor, { d: cracks, color: '#000000', a: 0.85, w: 2.4, mode: 'stroke' });
      add(bd.floor, { d: cracks, color: '#C83A08', a: 0.9, w: 1, mode: 'stroke' });
      let scorch = '';
      for (let i = 0; i < Math.round(area * 0.14); i++) scorch += circleD(rx(), ry(), rng.range(5, 12));
      add(bd.floor, { d: scorch, color: '#000000', a: 0.32, blur: 5 });
      let cinders = '';
      for (let i = 0; i < Math.round(area * 0.4); i++) cinders += circleD(rx(), ry(), rng.range(0.4, 0.9));
      add(bd.floor, { d: cinders, color: '#FFA040', a: 0.55 });
      // walls: molten seams down the middle of long walls + rivets
      let seams = '';
      let rivets = '';
      for (const wr of inner) {
        const hor = wr.width >= wr.height;
        const len = hor ? wr.width : wr.height;
        if (len < cm * 0.85 || !rng.chance(0.65)) continue;
        const a0 = len * rng.range(0.12, 0.3);
        const a1 = len * rng.range(0.7, 0.88);
        const mid = (hor ? wr.y + wr.height / 2 : wr.x + wr.width / 2);
        let d = '';
        const steps = Math.max(3, Math.round((a1 - a0) / 6));
        for (let i = 0; i <= steps; i++) {
          const t = a0 + ((a1 - a0) * i) / steps;
          const j = (i % 2 ? 1 : -1) * rng.range(0.2, 0.9);
          d += `${i === 0 ? 'M' : 'L'}${f(hor ? wr.x + t : mid + j)},${f(hor ? mid + j : wr.y + t)}`;
        }
        seams += d;
        for (let t = 4; t < len - 2; t += 11) rivets += circleD(hor ? wr.x + t : wr.x - pad + 1.2, hor ? wr.y - pad + 1.2 : wr.y + t, 0.55);
      }
      add(bd.wall, { d: seams, color: '#120604', a: 0.95, w: 1.8, mode: 'stroke' });
      add(bd.wall, { d: seams, color: '#E0500A', a: 1, w: 0.75, mode: 'stroke' });
      add(bd.wall, { d: rivets, color: '#8A6A5A', a: 0.9 });
      bd.flow = cracks + seams;
      break;
    }
    case 'frost': {
      let frostD = '';
      for (let i = 0; i < Math.round(area * 0.13); i++) {
        const x = rx();
        const y = ry();
        frostD += crystalD(rng, x, y, rng.range(4, 9));
        bd.sparkles.push({ x, y, ph: rng.range(0, 6.3), s: rng.range(1.4, 2.4) });
      }
      add(bd.floor, { d: frostD, color: '#EAF6FF', a: 0.38, w: 0.5, mode: 'stroke' });
      let iceCr = '';
      for (let i = 0; i < Math.round(area * 0.06); i++) iceCr += crack(rx(), ry(), cm * rng.range(0.5, 1), rng.range(0, 6.3), 1);
      add(bd.floor, { d: iceCr, color: '#9FD8FF', a: 0.35, w: 0.55, mode: 'stroke' });
      let drift = '';
      let icicles = '';
      let icHi = '';
      for (const wr of inner) {
        const hor = wr.width >= wr.height;
        if (hor) {
          const by = wr.y + wr.height + pad + decor.facet;
          for (let x = wr.x + rng.range(2, 8); x < wr.x + wr.width - 2; x += rng.range(5, 11)) {
            const L = rng.range(2.5, 7);
            const half = rng.range(0.8, 1.5);
            icicles += `M${f(x - half)},${f(by - 0.5)}L${f(x + half)},${f(by - 0.5)}L${f(x + rng.range(-0.3, 0.3))},${f(by + L)}Z`;
            icHi += `M${f(x - half * 0.4)},${f(by)}L${f(x - 0.1)},${f(by + L * 0.7)}`;
          }
          if (rng.chance(0.5)) drift += ellipseD(wr.x + rng.range(0.2, 0.8) * wr.width, by + 3, rng.range(6, 12), rng.range(2, 3.4));
        } else if (rng.chance(0.5)) {
          drift += ellipseD(wr.x + (rng.chance(0.5) ? -pad - 2 : wr.width + pad + 2), wr.y + rng.range(0.2, 0.8) * wr.height, rng.range(2, 3.2), rng.range(5, 10));
        }
      }
      add(bd.floor, { d: drift, color: '#E6F4FF', a: 0.28, blur: 2.5 });
      add(bd.wall, { d: icicles, color: '#D8F0FF', a: 0.85 });
      add(bd.wall, { d: icicles, color: '#7FC8F0', a: 0.6, w: 0.4, mode: 'stroke' });
      add(bd.wall, { d: icHi, color: '#FFFFFF', a: 0.8, w: 0.45, mode: 'stroke' });
      break;
    }
    case 'fungal': {
      let roots = '';
      for (let i = 0; i < Math.round(area * 0.13); i++) {
        const x = rx();
        const y = ry();
        const a = rng.range(0, 6.3);
        const L = cm * rng.range(0.4, 0.9);
        const ex = x + Math.cos(a) * L;
        const ey = y + Math.sin(a) * L;
        roots += `M${f(x)},${f(y)}C${f(x + rng.range(-12, 12))},${f(y + rng.range(-12, 12))} ${f(ex + rng.range(-12, 12))},${f(ey + rng.range(-12, 12))} ${f(ex)},${f(ey)}`;
      }
      add(bd.floor, { d: roots, color: '#120A08', a: 0.9, w: 2, mode: 'stroke' });
      add(bd.floor, { d: roots, color: '#4A3022', a: 0.9, w: 0.8, mode: 'stroke' });
      let lichen = '';
      for (let i = 0; i < Math.round(area * 0.18); i++) {
        const x = rx();
        const y = ry();
        for (let k = 0; k < rng.int(3, 7); k++) lichen += circleD(x + rng.range(-4, 4), y + rng.range(-3, 3), rng.range(0.5, 1.4));
      }
      add(bd.floor, { d: lichen, color: '#8ABF3A', a: 0.35 });
      const caps = ['#FF4FD8', '#3AE0FF', '#C8FF4A', '#B07CFF'];
      for (let i = 0; i < Math.round(area * 0.05); i++) {
        const color = rng.pick(caps);
        const x = rx();
        const y = ry();
        bd.shrooms.push({ x, y, s: rng.range(1.8, 2.6), color, ph: rng.range(0, 6.3) });
        bd.glows.push({ x, y, r: 9, ph: rng.range(0, 6.3), color });
      }
      for (const wr of inner) {
        if (!rng.chance(0.3)) continue;
        const hor = wr.width >= wr.height;
        const atStart = rng.chance(0.5);
        const ex = hor ? (atStart ? wr.x + 3 : wr.x + wr.width - 3) : wr.x + wr.width / 2;
        const ey = hor ? wr.y + wr.height / 2 : atStart ? wr.y + 3 : wr.y + wr.height - 3;
        const color = rng.pick(caps);
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) bd.shrooms.push({ x: ex + rng.range(-3.5, 3.5), y: ey + rng.range(-3, 3), s: rng.range(2.4, 4.2), color, ph: rng.range(0, 6.3) });
        bd.glows.push({ x: ex, y: ey, r: 14, ph: rng.range(0, 6.3), color });
      }
      bd.shrooms.sort((a, b) => a.y - b.y);
      break;
    }
    case 'astral': {
      const runeCount = clamp(Math.round(area * 0.05), 2, 6);
      for (let i = 0; i < runeCount; i++) {
        const c = Math.floor(rng.range(0, w / decor.cellW));
        const r = Math.floor(rng.range(1, h / decor.cellH));
        bd.runes.push({ x: (c + 0.5) * decor.cellW, y: (r + 0.5) * decor.cellH, r: cm * 0.3, ph: rng.range(0, 6.3), dir: rng.chance(0.5) ? 1 : -1 });
      }
      let circles = '';
      for (const ru of bd.runes) circles += circleD(ru.x, ru.y, ru.r) + circleD(ru.x, ru.y, ru.r * 0.72) + hexagramD(ru.x, ru.y, ru.r * 0.68);
      add(bd.floor, { d: circles, color: '#C9A04A', a: 0.42, w: 0.7, mode: 'stroke' });
      let dust = '';
      let gold = '';
      for (let i = 0; i < Math.round(area * 0.7); i++) dust += circleD(rx(), ry(), rng.range(0.3, 0.75));
      for (let i = 0; i < Math.round(area * 0.2); i++) gold += circleD(rx(), ry(), rng.range(0.4, 0.8));
      add(bd.floor, { d: dust, color: '#FFFFFF', a: 0.4 });
      add(bd.floor, { d: gold, color: '#FFD86B', a: 0.5 });
      // wall glyphs on long walls (breathing glow)
      let glyphs = '';
      for (const wr of inner) {
        const hor = wr.width >= wr.height;
        const len = hor ? wr.width : wr.height;
        if (len < cm * 0.8 || !rng.chance(0.55)) continue;
        for (let t = 7; t < len - 5; t += rng.range(9, 14)) {
          const gx = hor ? wr.x + t : wr.x + wr.width / 2;
          const gy = hor ? wr.y + wr.height / 2 : wr.y + t;
          glyphs += glyphD(rng, gx, gy, Math.min(2.4, Math.max(1.4, (hor ? wr.height : wr.width) * 0.32 + pad * 0.3)));
        }
      }
      add(bd.wall, { d: glyphs, color: '#8A6A2A', a: 0.9, w: 0.6, mode: 'stroke' });
      bd.pulse = glyphs;
      break;
    }
    default:
      break;
  }
  return bd;
}

const ellipseD = (x: number, y: number, rx: number, ry: number) =>
  `M${f(x - rx)},${f(y)}a${f(rx)},${f(ry)} 0 1,0 ${f(rx * 2)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-rx * 2)},0Z`;

/** Tiny scallop shell. */
function fanD(x: number, y: number, r: number, a: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = a - 1.1 + (i / 6) * 2.2;
    pts.push(`${f(x + Math.cos(t) * r)},${f(y + Math.sin(t) * r)}`);
  }
  return `M${f(x)},${f(y)}L${pts.join('L')}Z`;
}

/** Branching coral fan. */
function coralD(rng: ReturnType<typeof makeRng>, x: number, y: number, len: number) {
  let d = '';
  const grow = (sx: number, sy: number, a: number, L: number, depth: number) => {
    const ex = sx + Math.cos(a) * L;
    const ey = sy + Math.sin(a) * L;
    d += `M${f(sx)},${f(sy)}Q${f((sx + ex) / 2 + rng.range(-1, 1))},${f((sy + ey) / 2 + rng.range(-1, 1))} ${f(ex)},${f(ey)}`;
    if (depth > 0) {
      grow(ex, ey, a - rng.range(0.3, 0.7), L * 0.62, depth - 1);
      grow(ex, ey, a + rng.range(0.3, 0.7), L * 0.62, depth - 1);
    }
  };
  const base = rng.range(0, Math.PI * 2);
  for (let i = 0; i < 3; i++) grow(x, y, base + (i - 1) * 0.7, len * rng.range(0.55, 0.8), 2);
  return d;
}

/** Six-armed frost crystal. */
function crystalD(rng: ReturnType<typeof makeRng>, x: number, y: number, r: number) {
  let d = '';
  const rot = rng.range(0, 1);
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    const ex = x + Math.cos(a) * r;
    const ey = y + Math.sin(a) * r;
    d += `M${f(x)},${f(y)}L${f(ex)},${f(ey)}`;
    for (const k of [0.45, 0.72]) {
      const bx = x + Math.cos(a) * r * k;
      const by = y + Math.sin(a) * r * k;
      const bl = r * 0.28 * (1.2 - k);
      d += `M${f(bx)},${f(by)}L${f(bx + Math.cos(a + 0.7) * bl)},${f(by + Math.sin(a + 0.7) * bl)}`;
      d += `M${f(bx)},${f(by)}L${f(bx + Math.cos(a - 0.7) * bl)},${f(by + Math.sin(a - 0.7) * bl)}`;
    }
  }
  return d;
}

function hexagramD(x: number, y: number, r: number) {
  const tri = (off: number) => {
    let d = '';
    for (let i = 0; i < 3; i++) {
      const a = off + (i * Math.PI * 2) / 3;
      d += `${i === 0 ? 'M' : 'L'}${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`;
    }
    return d + 'Z';
  };
  return tri(-Math.PI / 2) + tri(Math.PI / 2);
}

/** A small angular rune glyph. */
function glyphD(rng: ReturnType<typeof makeRng>, x: number, y: number, s: number) {
  const shapes = [
    `M${f(x)},${f(y - s)}V${f(y + s)}M${f(x - s * 0.7)},${f(y - s * 0.3)}L${f(x)},${f(y)}L${f(x + s * 0.7)},${f(y - s * 0.3)}`,
    `M${f(x - s * 0.7)},${f(y + s)}L${f(x)},${f(y - s)}L${f(x + s * 0.7)},${f(y + s)}M${f(x - s * 0.4)},${f(y + s * 0.2)}H${f(x + s * 0.4)}`,
    `M${f(x - s * 0.6)},${f(y - s)}L${f(x + s * 0.6)},${f(y + s)}M${f(x + s * 0.6)},${f(y - s)}L${f(x - s * 0.6)},${f(y + s)}`,
    `M${f(x)},${f(y - s)}L${f(x + s * 0.7)},${f(y)}L${f(x)},${f(y + s)}L${f(x - s * 0.7)},${f(y)}Z`,
    `M${f(x - s * 0.6)},${f(y - s)}H${f(x + s * 0.6)}M${f(x)},${f(y - s)}V${f(y + s)}M${f(x - s * 0.6)},${f(y + s)}H${f(x + s * 0.6)}`,
  ];
  return rng.pick(shapes);
}

export function prepareBiomePaths(bd: BiomeDecor): BiomePaths {
  return { flow: svgPathOnce(bd.flow), pulse: svgPathOnce(bd.pulse), ring: new Map() };
}

// ─── baked layers ────────────────────────────────────────────

function paintLayers(c: SkCanvas, layers: Layer[]) {
  for (const l of layers) {
    const p = svgPathOnce(l.d);
    if (!p) continue;
    const paint = l.mode === 'stroke' ? stroke(l.color, l.w ?? 1, l.a, true) : fill(l.color, l.a);
    if (l.blur) blurred(paint, l.blur, HQ);
    if (l.add) additive(paint);
    c.drawPath(p, paint);
  }
}

export function bakeBiomeFloor(c: SkCanvas, bd: BiomeDecor) {
  paintLayers(c, bd.floor);
  // small floor mushrooms (fungal) — caps drawn now, their glow breathes live
  for (const s of bd.shrooms) if (s.s < 2.7) drawShroomCap(c, s.x, s.y, s.s, s.color);
}

export function bakeBiomeWalls(c: SkCanvas, bd: BiomeDecor, union: SkPath | null) {
  const id = bd.biome.id;
  if (union && id === 'frost') {
    // fresh snow on the wall tops: bright upper rim + soft frost wash
    c.save();
    c.clipPath(union, ClipOp.Intersect, true);
    c.save();
    c.translate(0, 1.4);
    c.drawPath(union, stroke('#FFFFFF', 2.6, 0.75));
    c.restore();
    c.drawPath(union, fill('#E6F4FF', 0.12));
    c.restore();
  }
  if (union && id === 'astral') {
    // gold trim inlaid just inside the cap edge
    c.save();
    c.clipPath(union, ClipOp.Intersect, true);
    c.drawPath(union, stroke('#3A2A08', 3.4, 0.9));
    c.drawPath(union, stroke('#E8C060', 1.6, 0.85));
    c.restore();
  }
  if (union && id === 'forge') {
    // heat bleeding up the wall bases
    c.save();
    c.translate(0, 1);
    c.drawPath(union, blurred(stroke('#FF5A0A', 1.4, 0.25), 2, HQ));
    c.restore();
  }
  paintLayers(c, bd.wall);
  for (const s of bd.shrooms) if (s.s >= 2.7) drawShroomCap(c, s.x, s.y, s.s, s.color);
}

function drawShroomCap(c: SkCanvas, x: number, y: number, s: number, color: string) {
  const q = Math.round(s * 4) / 4; // quantised size → cached paths + shaders
  c.save();
  c.translate(x, y);
  c.drawOval(rect(-q * 0.9 + 0.8, -q * 0.2 + 1.2, q * 1.8, q * 0.9), fill('#000000', 0.45));
  c.drawRect(rect(-q * 0.18, -q * 0.1, q * 0.36, q * 0.9), fill('#E8DCC8', 0.9));
  const cap = svgPath(`M${f(-q)},0Q${f(-q)},${f(-q * 1.1)} 0,${f(-q * 1.1)}Q${f(q)},${f(-q * 1.1)} ${f(q)},0Q0,${f(-q * 0.3)} ${f(-q)},0Z`);
  if (cap) {
    c.drawPath(cap, shaded(radialAt(`cap${color}${q}`, -q * 0.3, -q * 0.8, q * 1.5, [[0, '#FFFFFF', 1], [0.35, color, 1], [1, '#1A0A20', 1]])));
    c.drawCircle(-q * 0.35, -q * 0.65, q * 0.16, fill('#FFFFFF', 0.85));
    c.drawCircle(q * 0.3, -q * 0.5, q * 0.12, fill('#FFFFFF', 0.7));
    c.drawPath(cap, stroke('#12060F', 0.4, 0.8));
  }
  c.restore();
}

// ─── light fixtures ──────────────────────────────────────────

/** Baked part of a non-lantern light fixture (the bit that never moves). */
export function drawFixtureBase(c: SkCanvas, l: LanternDecor, kind: LightKind) {
  c.save();
  c.translate(l.x, l.y);
  switch (kind) {
    case 'jelly':
      // small coral anchor the jellyfish is tethered to
      c.drawCircle(0, 1.5, 2.6, fill('#0A2422'));
      c.drawCircle(0, 1.5, 2.6, stroke('#5FA89C', 0.6, 0.8));
      break;
    case 'brazier': {
      c.drawOval(rect(-5.2 + 1.2, 2.8, 10.4, 3.6), blurred(fill('#000000', 0.6), 1.5, HQ));
      // tripod legs
      const legs = stroke('#2A2420', 1.1, 1, true);
      c.drawLine(-3.2, 1.2, -4.6, 5.2, legs);
      c.drawLine(3.2, 1.2, 4.6, 5.2, legs);
      c.drawLine(0, 1.6, 0, 5.4, legs);
      // iron bowl
      const bowl = svgPathOnce('M-5.4,-1.6Q-5,2.6 0,2.8Q5,2.6 5.4,-1.6Z');
      if (bowl) {
        c.drawPath(bowl, shaded(linear('brazierBowl', 0, -2, 0, 3, [[0, '#6B5A50', 1], [1, '#1A1210', 1]])));
        c.drawPath(bowl, stroke('#0A0605', 0.6));
      }
      c.drawOval(rect(-5.4, -2.6, 10.8, 2), fill('#1A0805'));
      // glowing coals
      for (const [cx, cy, r] of [[-2.4, -1.6, 1.1], [0.2, -1.9, 1.3], [2.5, -1.5, 1]] as const) c.drawCircle(cx, cy, r, fill('#FF6A10', 0.95));
      break;
    }
    case 'icelamp': {
      c.drawOval(rect(-4, 3.2, 8, 2.4), blurred(fill('#000000', 0.5), 1.4, HQ));
      c.drawRRect(rrect(-3.4, 2.4, 6.8, 2.2, 0.8), fill('#4A6680'));
      c.drawRRect(rrect(-3.4, 2.4, 6.8, 2.2, 0.8), stroke('#C8E6FF', 0.5, 0.7));
      const prism = svgPathOnce('M0,-8L3,-5L3,1.4L0,3L-3,1.4L-3,-5Z');
      if (prism) {
        c.drawPath(prism, shaded(linear('icePrism', -3, -8, 3, 3, [[0, '#FFFFFF', 0.95], [0.45, '#A8ECFF', 0.85], [1, '#2A78B8', 0.9]])));
        c.drawPath(prism, stroke('#FFFFFF', 0.55, 0.9));
      }
      const facet = svgPathOnce('M0,-8L0,3M-3,-5L0,-3.2L3,-5');
      if (facet) c.drawPath(facet, stroke('#FFFFFF', 0.4, 0.55));
      break;
    }
    case 'shroom': {
      c.drawOval(rect(-5, 2.6, 10, 3), blurred(fill('#000000', 0.55), 1.4, HQ));
      c.drawRRect(rrect(-1.2, -1, 2.4, 5, 1), shaded(linear('shroomStem', -1.2, 0, 1.2, 0, [[0, '#E8DCC8', 1], [1, '#9A8A78', 1]])));
      const cap = svgPathOnce('M-6,-0.6Q-6,-7.4 0,-7.6Q6,-7.4 6,-0.6Q3,-2 0,-1.6Q-3,-2 -6,-0.6Z');
      if (cap) {
        c.drawPath(cap, shaded(radialAt('shroomCap', -1.6, -5.6, 8, [[0, THEME.lanternCore, 1], [0.4, THEME.lanternGlass, 1], [1, '#3A0A4A', 1]])));
        c.drawPath(cap, stroke('#1A0620', 0.5, 0.9));
      }
      for (const [sx, sy, r] of [[-3, -4.4, 0.8], [1.6, -5.6, 0.7], [3.6, -3, 0.6], [-0.6, -3, 0.5]] as const) c.drawCircle(sx, sy, r, fill('#FFFFFF', 0.85));
      // gills
      const gills = svgPathOnce('M-4,-1.2L-2.4,-1.8M-1.2,-1.7L0,-1.9M1.2,-1.7L2.4,-1.8M4,-1.2L2.8,-1.6');
      if (gills) c.drawPath(gills, stroke('#5A1A6A', 0.4, 0.8));
      break;
    }
    case 'orb':
      // gilded pedestal plate the orb floats above
      c.drawOval(rect(-4.6, 2.4, 9.2, 3.2), fill('#140E28'));
      c.drawOval(rect(-4.6, 2.4, 9.2, 3.2), stroke('#E8C060', 0.7, 0.9));
      c.drawOval(rect(-2.6, 3.1, 5.2, 1.8), stroke('#E8C060', 0.4, 0.6));
      break;
    default:
      break;
  }
  c.restore();
}

/** Animated part of every light fixture (flames, jellyfish, orbiting rings …). */
export function drawFixturesLive(c: SkCanvas, lanterns: LanternDecor[], kind: LightKind, t: number) {
  if (kind === 'lantern') return;
  for (const l of lanterns) {
    const s = l.seed;
    c.save();
    c.translate(l.x, l.y);
    switch (kind) {
      case 'jelly': {
        const bob = Math.sin(t * 0.0016 + s) * 2.2;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.004 + s * 2);
        c.translate(0, -6 + bob);
        // tentacles trail down and sway
        let d = '';
        for (let i = 0; i < 5; i++) {
          const x0 = -3.2 + i * 1.6;
          d += `M${f(x0)},0`;
          for (let k = 1; k <= 4; k++) d += `L${f(x0 + Math.sin(t * 0.004 + i + k * 0.9 + s) * (0.6 + k * 0.35))},${f(k * 2.2)}`;
        }
        const tent = svgPathOnce(d);
        if (tent) c.drawPath(tent, additive(stroke(THEME.lanternGlass, 0.5, 0.55, true)));
        const squash = 1 + 0.08 * pulse;
        c.scale(squash, 2 - squash);
        const bell = svgPath('M-5,0Q-5.4,-6.4 0,-6.8Q5.4,-6.4 5,0Q2.6,-1.4 0,-0.6Q-2.6,-1.4 -5,0Z');
        if (bell) {
          c.drawPath(bell, additive(shaded(radialAt('jellyBell', 0, -3, 7, [[0, THEME.lanternCore, 0.9], [0.6, THEME.lanternGlass, 0.55], [1, THEME.lanternGlowMid, 0.25]]))));
          c.drawPath(bell, stroke('#E6FFF8', 0.5, 0.75));
        }
        c.drawCircle(-1.6, -4, 0.9, fill('#FFFFFF', 0.7));
        glow(c, radial('jellyCore', [[0, THEME.lanternCore, 0.7], [1, THEME.lanternGlass, 0]]), 0, -3, 6 + pulse * 2, 0.6);
        break;
      }
      case 'brazier': {
        const n1 = Math.sin(t * 0.017 + s) * 0.5 + Math.sin(t * 0.031 + s * 2) * 0.5;
        const n2 = Math.sin(t * 0.023 + s * 3);
        const flame = (sx: number, sy: number, h: number, wd: number, color: string, a: number, lean: number) => {
          const p = svgPathOnce(`M${f(-wd)},0C${f(-wd * 1.1)},${f(-h * 0.45)} ${f(-wd * 0.3 + lean * 0.5)},${f(-h * 0.7)} ${f(lean)},${f(-h)}C${f(wd * 0.3 + lean * 0.5)},${f(-h * 0.7)} ${f(wd * 1.1)},${f(-h * 0.45)} ${f(wd)},0Z`);
          if (!p) return;
          c.save();
          c.translate(sx, sy);
          c.drawPath(p, additive(fill(color, a)));
          c.restore();
        };
        flame(0, -2, 10 + n1 * 2, 4.2, '#FF4A0A', 0.85, n2 * 1.5);
        flame(-1.5, -2, 6.5 + n2 * 1.5, 2.4, '#FF8A1A', 0.8, n1);
        flame(1.6, -2, 7 + n1 * 1.4, 2.2, '#FF9A2A', 0.8, -n2);
        flame(0, -2, 5 + n1, 1.6, '#FFF0B0', 0.95, n2 * 0.6);
        // sparks rising from the fire
        let sp = '';
        for (let i = 0; i < 4; i++) {
          const life = ((t * 0.0012 + i * 0.25 + s) % 1 + 1) % 1;
          sp += circleD(Math.sin(life * 9 + i * 2 + s) * 3, -4 - life * 16, 0.5 * (1 - life) + 0.2);
        }
        const spp = svgPathOnce(sp);
        if (spp) c.drawPath(spp, additive(fill('#FFC060', 0.85)));
        break;
      }
      case 'icelamp': {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.003 + s);
        glow(c, radial('iceCore', [[0, '#FFFFFF', 0.8], [0.5, THEME.lanternGlass, 0.3], [1, THEME.lanternGlass, 0]]), 0, -2.6, 5 + pulse * 2.5, 0.75);
        // glint sweeping across the prism
        const k = ((t * 0.0006 + s) % 1 + 1) % 1;
        if (k < 0.3) {
          const gy = -8 + (k / 0.3) * 11;
          c.drawLine(-3, gy + 1.2, 3, gy - 1.2, additive(stroke('#FFFFFF', 0.9, Math.sin((k / 0.3) * Math.PI) * 0.9, true)));
        }
        star4(c, 2.6, -7.2, 1.6 + pulse * 1.4, '#FFFFFF', 0.4 + pulse * 0.5);
        break;
      }
      case 'shroom': {
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.0022 + s);
        glow(c, radial('shroomGlow', [[0, THEME.lanternCore, 0.6], [0.5, THEME.lanternGlass, 0.25], [1, THEME.lanternGlass, 0]]), 0, -4, 9 + breathe * 3, 0.5 + breathe * 0.3);
        let sp = '';
        for (let i = 0; i < 3; i++) {
          const life = ((t * 0.0004 + i / 3 + s) % 1 + 1) % 1;
          sp += circleD(Math.sin(life * 6 + i * 2.1) * 4, -7 - life * 14, 0.7 * (1 - life) + 0.2);
        }
        const spp = svgPathOnce(sp);
        if (spp) c.drawPath(spp, additive(fill(THEME.lanternGlass, 0.8)));
        break;
      }
      case 'orb': {
        const bob = Math.sin(t * 0.0018 + s) * 1.6;
        c.translate(0, -5 + bob);
        glow(c, radial('orbHalo', [[0, THEME.lanternGlass, 0.55], [1, THEME.lanternGlowMid, 0]]), 0, 0, 11, 0.7);
        // tilted gold ring orbiting the orb (back half, orb, front half)
        const a = t * 0.0025 + s;
        const ring = (front: boolean) => {
          c.save();
          c.rotate(-18, 0, 0);
          c.scale(1, 0.32);
          const arc = svgPath(front ? 'M-6.4,0A6.4,6.4 0 0 0 6.4,0' : 'M-6.4,0A6.4,6.4 0 0 1 6.4,0');
          if (arc) c.drawPath(arc, stroke('#E8C060', 1.1, front ? 0.95 : 0.5, true));
          c.restore();
        };
        ring(false);
        c.drawCircle(0, 0, 3.6, shaded(radialAt('orbBody', -1.2, -1.2, 4.8, [[0, '#FFFFFF', 1], [0.4, THEME.lanternGlass, 1], [1, THEME.lanternGlowMid, 1]])));
        c.drawCircle(-1.1, -1.3, 0.9, fill('#FFFFFF', 0.9));
        ring(true);
        // two tiny moons on the ring
        for (let i = 0; i < 2; i++) {
          const ang = a + i * Math.PI;
          const mx = Math.cos(ang) * 6.4;
          const my = Math.sin(ang) * 6.4 * 0.32;
          const rot = (-18 * Math.PI) / 180;
          c.drawCircle(mx * Math.cos(rot) - my * Math.sin(rot), mx * Math.sin(rot) + my * Math.cos(rot), 0.8, additive(fill('#FFF2C4', 0.95)));
        }
        break;
      }
    }
    c.restore();
  }
}

function star4(c: SkCanvas, x: number, y: number, s: number, color: string, a: number) {
  if (a <= 0.02 || s <= 0.1) return;
  const p = svgPathOnce(`M${f(x)},${f(y - s)}L${f(x + s * 0.22)},${f(y - s * 0.22)}L${f(x + s)},${f(y)}L${f(x + s * 0.22)},${f(y + s * 0.22)}L${f(x)},${f(y + s)}L${f(x - s * 0.22)},${f(y + s * 0.22)}L${f(x - s)},${f(y)}L${f(x - s * 0.22)},${f(y - s * 0.22)}Z`);
  if (p) c.drawPath(p, additive(fill(color, a)));
}

// ─── live world details (under the darkness) ─────────────────

export function drawBiomeLive(c: SkCanvas, bd: BiomeDecor, bp: BiomePaths, t: number, w: number, h: number) {
  const id = bd.biome.id;
  // pulsing light spots
  for (const g of bd.glows) {
    const a = 0.32 + 0.22 * Math.sin(t * 0.0021 + g.ph);
    glow(c, radial(`bglow${g.color}`, [[0, g.color, 0.55], [0.5, g.color, 0.16], [1, g.color, 0]]), g.x, g.y, g.r, a);
  }
  // light flowing along lava cracks / molten seams
  if (bp.flow) {
    c.drawPath(bp.flow, additive(stroke('#FF6A10', 2.6, 0.16 + 0.08 * Math.sin(t * 0.002), true)));
    c.drawPath(bp.flow, additive(stroke('#FFB040', 1, 0.75, true, [4, 11], -t * 0.012)));
  }
  // breathing runes on the walls
  if (bp.pulse) {
    const k = 0.5 + 0.5 * Math.sin(t * 0.0016);
    c.drawPath(bp.pulse, additive(stroke('#FFD86B', 1.6, 0.12 + 0.18 * k, true)));
    c.drawPath(bp.pulse, additive(stroke('#FFF2C4', 0.6, 0.35 + 0.45 * k, true)));
  }
  // frost twinkles
  for (const sp of bd.sparkles) {
    const a = Math.pow(Math.max(0, Math.sin(t * 0.0021 + sp.ph * 3.1)), 10);
    if (a > 0.03) star4(c, sp.x, sp.y, sp.s * (0.6 + a * 0.6), '#FFFFFF', a * 0.9);
  }
  // slowly turning star-circles
  for (const ru of bd.runes) {
    let ring = bp.ring.get(Math.round(ru.r));
    if (ring === undefined) {
      let d = '';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = ru.r * 0.86;
        const r1 = ru.r * (i % 3 === 0 ? 1.12 : 0.98);
        d += `M${f(Math.cos(a) * r0)},${f(Math.sin(a) * r0)}L${f(Math.cos(a) * r1)},${f(Math.sin(a) * r1)}`;
      }
      d += circleD(0, 0, ru.r * 0.86);
      ring = svgPathOnce(d);
      bp.ring.set(Math.round(ru.r), ring);
    }
    if (!ring) continue;
    const k = 0.5 + 0.5 * Math.sin(t * 0.0013 + ru.ph);
    c.save();
    c.translate(ru.x, ru.y);
    c.rotate(t * 0.006 * ru.dir, 0, 0);
    c.drawPath(ring, additive(stroke('#B89AFF', 1.4, 0.18 + 0.2 * k)));
    c.drawPath(ring, additive(stroke('#FFE8A8', 0.5, 0.35 + 0.3 * k)));
    c.restore();
    glow(c, radial('runeGlow', [[0, '#9A6AFF', 0.35], [1, '#9A6AFF', 0]]), ru.x, ru.y, ru.r * 1.4, 0.4 + 0.3 * k);
  }
  // underwater: soft caustic light drifting across the floor
  if (id === 'grotto' && HQ) {
    for (let i = 0; i < 4; i++) {
      const x = w * (0.5 + 0.42 * Math.sin(t * 0.00011 * (i + 1) + i * 1.9));
      const y = h * (0.5 + 0.42 * Math.cos(t * 0.00009 * (i + 2) + i * 2.7));
      glow(c, radial('causticBlob', [[0, '#5FFFD8', 0.12], [1, '#5FFFD8', 0]]), x, y, 80 + 20 * Math.sin(t * 0.001 + i), 1);
    }
  }
  // coral fans sway a little light
  for (const co of bd.corals) {
    const a = 0.5 + 0.5 * Math.sin(t * 0.003 + co.ph);
    c.drawCircle(co.x, co.y, 1.2 + a * 0.6, additive(fill('#FFB0C8', 0.3 + a * 0.4)));
  }
}

// ─── atmosphere (above the darkness) ─────────────────────────

interface Mote {
  x: number;
  y: number;
  sp: number;
  ph: number;
  s: number;
}

/** Stateless particle field: every position is a pure function of time, so it never drifts or leaks. */
export class Atmosphere {
  private motes: Mote[] = [];
  private flies: Mote[] = [];
  constructor(private kind: AtmosKind, private w: number, private h: number, seed: number) {
    const rng = makeRng(seed * 31 + 5);
    const n = { motes: 0, bubbles: 24, embers: 34, snow: 46, spores: 26, stars: 42 }[kind];
    for (let i = 0; i < n; i++) this.motes.push({ x: rng.range(0, w), y: rng.range(0, h), sp: rng.range(0.6, 1.4), ph: rng.range(0, 6.3), s: rng.next() });
    if (kind === 'spores') for (let i = 0; i < 7; i++) this.flies.push({ x: rng.range(0.1, 0.9) * w, y: rng.range(0.15, 0.9) * h, sp: rng.range(0.6, 1.2), ph: rng.range(0, 6.3), s: rng.next() });
  }

  draw(c: SkCanvas, t: number) {
    const { w, h } = this;
    const sec = t / 1000;
    switch (this.kind) {
      case 'bubbles': {
        let rim = '';
        let hi = '';
        for (const m of this.motes) {
          const span = h + 40;
          const y = h + 20 - (((sec * 26 * m.sp + m.y) % span) + span) % span;
          const x = m.x + Math.sin(sec * 1.6 * m.sp + m.ph) * 5;
          const r = 0.9 + m.s * 2.2;
          rim += circleD(x, y, r);
          hi += circleD(x - r * 0.35, y - r * 0.35, r * 0.28);
        }
        const a = svgPathOnce(rim);
        const b = svgPathOnce(hi);
        if (a) c.drawPath(a, additive(stroke('#BFFFF0', 0.55, 0.38)));
        if (b) c.drawPath(b, additive(fill('#FFFFFF', 0.45)));
        break;
      }
      case 'embers': {
        let core = '';
        let halo = '';
        for (const m of this.motes) {
          const span = h + 30;
          const y = h + 10 - (((sec * 34 * m.sp + m.y) % span) + span) % span;
          const x = m.x + Math.sin(sec * 1.1 * m.sp + m.ph) * 9 + Math.sin(sec * 3.3 + m.ph * 2) * 2;
          const flick = 0.55 + 0.45 * Math.sin(sec * 9 * m.sp + m.ph);
          const r = (0.5 + m.s * 0.9) * (0.6 + 0.4 * flick) * Math.min(1, (y / h) * 1.6 + 0.2);
          core += circleD(x, y, r);
          halo += circleD(x, y, r * 3);
        }
        const a = svgPathOnce(halo);
        const b = svgPathOnce(core);
        if (a) c.drawPath(a, additive(fill('#FF6A10', 0.14)));
        if (b) c.drawPath(b, additive(fill('#FFC060', 0.8)));
        break;
      }
      case 'snow': {
        let flakes = '';
        let bokeh = '';
        for (const m of this.motes) {
          const span = h + 20;
          const y = (((sec * 22 * m.sp + m.y) % span) + span) % span - 10;
          const x = m.x + Math.sin(sec * 0.8 * m.sp + m.ph) * 12 + sec * 3;
          const xx = ((x % w) + w) % w;
          if (m.s > 0.9) bokeh += circleD(xx, y, 3 + m.s * 2);
          else flakes += circleD(xx, y, 0.5 + m.s * 1.3);
        }
        const a = svgPathOnce(flakes);
        const b = svgPathOnce(bokeh);
        if (a) c.drawPath(a, fill('#FFFFFF', 0.55));
        if (b) c.drawPath(b, blurred(fill('#E6F4FF', 0.1), 1.5, HQ));
        break;
      }
      case 'spores': {
        let violet = '';
        let lime = '';
        for (const m of this.motes) {
          const span = h + 20;
          const y = h + 10 - (((sec * 9 * m.sp + m.y) % span) + span) % span;
          const x = m.x + Math.sin(sec * 0.5 * m.sp + m.ph) * 14;
          const r = (0.6 + m.s * 1.2) * (0.7 + 0.3 * Math.sin(sec * 2 + m.ph));
          if (m.s > 0.5) violet += circleD(x, y, r);
          else lime += circleD(x, y, r);
        }
        const a = svgPathOnce(violet);
        const b = svgPathOnce(lime);
        if (a) c.drawPath(a, additive(fill('#D07CFF', 0.4)));
        if (b) c.drawPath(b, additive(fill('#C8FF4A', 0.35)));
        // fireflies: lazy figure-eights, blinking
        for (const fl of this.flies) {
          const x = fl.x + Math.sin(sec * 0.7 * fl.sp + fl.ph) * 30;
          const y = fl.y + Math.sin(sec * 1.4 * fl.sp + fl.ph * 2) * 16;
          const blink = Math.pow(Math.max(0, Math.sin(sec * 1.7 * fl.sp + fl.ph)), 3);
          if (blink < 0.04) continue;
          glow(c, radial('firefly', [[0, '#F2FF8A', 0.9], [0.4, '#C8FF4A', 0.25], [1, '#C8FF4A', 0]]), x, y, 7, blink * 0.8);
        }
        break;
      }
      case 'stars': {
        for (const m of this.motes) {
          const tw = Math.pow(0.5 + 0.5 * Math.sin(sec * (1 + m.sp * 1.5) + m.ph), 3);
          if (tw < 0.05) continue;
          if (m.s > 0.82) star4(c, m.x, m.y, 2 + m.s * 1.6, '#F0E6FF', tw * 0.55);
          else c.drawCircle(m.x, m.y, 0.5 + m.s * 0.6, additive(fill('#FFFFFF', tw * 0.5)));
        }
        // a shooting star every ~7s
        const cycle = 7;
        const k = (sec % cycle) / 0.9;
        if (k < 1) {
          const n = Math.floor(sec / cycle);
          const sx = ((n * 0.37) % 1) * w * 0.8 + w * 0.1;
          const sy = ((n * 0.61) % 1) * h * 0.4 + 60;
          const hx = sx + k * 120;
          const hy = sy + k * 50;
          const fade = Math.sin(k * Math.PI);
          c.drawLine(hx - 26, hy - 11, hx, hy, additive(stroke('#E8DCFF', 1.1, 0.55 * fade, true)));
          c.drawCircle(hx, hy, 1.2, additive(fill('#FFFFFF', 0.9 * fade)));
        }
        break;
      }
      default:
        break;
    }
  }
}

/** Faint, slow ambience at the screen edges (visible even in the dark). */
export function drawBiomeEdges(c: SkCanvas, biome: Biome, w: number, h: number, t: number) {
  const sec = t / 1000;
  switch (biome.id) {
    case 'grotto': {
      // god rays slanting down from the surface far above
      for (let i = 0; i < 4; i++) {
        const x = w * (0.15 + i * 0.24) + Math.sin(sec * 0.25 + i * 1.7) * 18;
        const wd = 26 + 10 * Math.sin(sec * 0.3 + i);
        const p = svgPathOnce(`M${f(x - wd * 0.3)},0L${f(x + wd * 0.3)},0L${f(x + wd + 60)},${f(h * 0.75)}L${f(x - wd + 60)},${f(h * 0.75)}Z`);
        if (p) c.drawPath(p, additive(shaded(linear(`ray${Math.round(h)}`, 0, 0, 0, h * 0.75, [[0, '#7FFFE0', 0.07], [1, '#7FFFE0', 0]]), 0.6 + 0.4 * Math.sin(sec * 0.6 + i * 2))));
      }
      break;
    }
    case 'forge': {
      const a = 0.65 + 0.35 * Math.sin(sec * 1.3) * Math.sin(sec * 0.7);
      c.drawRect(rect(0, h - 120, w, 120), additive(shaded(linear(`heat${Math.round(h)}`, 0, h, 0, h - 120, [[0, '#FF4A0A', 0.22], [1, '#FF4A0A', 0]]), a)));
      break;
    }
    case 'frost': {
      // aurora ribbons drifting along the top
      for (let band = 0; band < 2; band++) {
        let d = '';
        const base = 70 + band * 34;
        const amp = 14;
        const pts = 10;
        for (let i = 0; i <= pts; i++) {
          const x = (i / pts) * w;
          const y = base + Math.sin(x * 0.012 + sec * 0.5 + band * 2) * amp + Math.sin(x * 0.031 - sec * 0.3) * 6;
          d += `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`;
        }
        for (let i = pts; i >= 0; i--) {
          const x = (i / pts) * w;
          const y = base + 46 + Math.sin(x * 0.012 + sec * 0.5 + band * 2 + 0.6) * amp;
          d += `L${f(x)},${f(y)}`;
        }
        const p = svgPathOnce(d + 'Z');
        const col = band === 0 ? '#5AFFB0' : '#9A7AFF';
        if (p) c.drawPath(p, additive(blurred(shaded(linear(`aur${band}${Math.round(base)}`, 0, base - 14, 0, base + 60, [[0, col, 0], [0.4, col, 0.09], [1, col, 0]]), 0.8 + 0.2 * Math.sin(sec + band)), 6, HQ)));
      }
      break;
    }
    case 'fungal': {
      const a = 0.6 + 0.4 * Math.sin(sec * 0.9);
      c.drawRect(rect(0, h - 140, w, 140), additive(shaded(linear(`haze${Math.round(h)}`, 0, h, 0, h - 140, [[0, '#A04AFF', 0.16], [1, '#A04AFF', 0]]), a)));
      break;
    }
    case 'astral': {
      const clouds: [number, number, string][] = [
        [0.1, 0.25, '#7A4AFF'],
        [0.92, 0.7, '#FF5AD8'],
        [0.2, 0.92, '#4A8AFF'],
      ];
      clouds.forEach(([cx, cy, col], i) => {
        const x = w * cx + Math.sin(sec * 0.15 + i) * 20;
        const y = h * cy + Math.cos(sec * 0.12 + i * 2) * 20;
        glow(c, radial(`neb${col}`, [[0, col, 0.14], [0.5, col, 0.05], [1, col, 0]]), x, y, Math.min(w, h) * 0.55, 0.8 + 0.2 * Math.sin(sec * 0.4 + i));
      });
      break;
    }
    default:
      break;
  }
}
