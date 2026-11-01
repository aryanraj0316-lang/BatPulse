/**
 * Painted-in-code scenes for menus: chapter banners (one corridor per biome) and the
 * moonlit castle behind the Level Complete card. All animated, all from code.
 */
import { Skia, type SkCanvas } from '@shopify/react-native-skia';
import { fill, stroke, glow, radial, additive, shaded, linear } from './skia/sk';
import type { Biome } from './themes/biomes';

const frac = (v: number) => v - Math.floor(v);
function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Arch opening (rectangle with a round top), centred at x, floor at y. */
function archPath(x: number, y: number, hw: number, hgt: number) {
  const p = Skia.PathBuilder.Make();
  p.moveTo(x - hw, y);
  p.lineTo(x - hw, y - hgt + hw);
  p.arcToOval(Skia.XYWHRect(x - hw, y - hgt, hw * 2, hw * 2), 180, 180, false);
  p.lineTo(x + hw, y);
  p.close();
  return p.build();
}

function drawFixture(c: SkCanvas, kind: Biome['light'], x: number, y: number, s: number, t: number, accent: string, soft: string, seed: number) {
  const flick = 0.75 + 0.25 * Math.sin(t * 0.011 + seed * 3) * Math.sin(t * 0.007 + seed);
  glow(c, radial(`fx${accent}${soft}`, [[0, soft, 0.85], [0.25, accent, 0.45], [1, accent, 0]]), x, y, s * 5.5, kind === 'lantern' || kind === 'brazier' ? flick : 0.85);
  switch (kind) {
    case 'lantern': {
      c.drawRect(Skia.XYWHRect(x - s * 0.45, y - s * 0.7, s * 0.9, s * 1.3), fill(soft, 0.5 + 0.4 * flick));
      c.drawRect(Skia.XYWHRect(x - s * 0.55, y - s * 0.8, s * 1.1, s * 1.5), stroke('#1A140C', s * 0.25));
      c.drawCircle(x, y - s * 1.1, s * 0.2, fill('#1A140C'));
      break;
    }
    case 'brazier': {
      const bowl = Skia.PathBuilder.Make();
      bowl.moveTo(x - s, y);
      bowl.quadTo(x, y + s * 1.1, x + s, y);
      bowl.close();
      c.drawPath(bowl.build(), fill('#1A0C06'));
      for (let i = 0; i < 3; i++) {
        const fh = s * (1.2 + 0.5 * Math.sin(t * 0.013 + i * 2 + seed));
        const fx = x + (i - 1) * s * 0.45;
        const f = Skia.PathBuilder.Make();
        f.moveTo(fx - s * 0.3, y);
        f.quadTo(fx - s * 0.2, y - fh * 0.6, fx + Math.sin(t * 0.01 + i) * s * 0.2, y - fh);
        f.quadTo(fx + s * 0.25, y - fh * 0.5, fx + s * 0.3, y);
        f.close();
        c.drawPath(f.build(), additive(fill(i === 1 ? soft : accent, 0.85)));
      }
      break;
    }
    case 'jelly': {
      const yy = y + Math.sin(t * 0.002 + seed) * s * 0.5;
      const dome = Skia.PathBuilder.Make();
      dome.addArc(Skia.XYWHRect(x - s, yy - s, s * 2, s * 1.6), 180, 180);
      dome.close();
      c.drawPath(dome.build(), additive(fill(accent, 0.55)));
      const tent = Skia.PathBuilder.Make();
      for (let i = 0; i < 4; i++) {
        const tx = x - s * 0.7 + i * s * 0.46;
        tent.moveTo(tx, yy - s * 0.2);
        tent.quadTo(tx + Math.sin(t * 0.004 + i + seed) * s * 0.4, yy + s * 0.8, tx + Math.sin(t * 0.003 + i) * s * 0.3, yy + s * 1.6);
      }
      c.drawPath(tent.build(), additive(stroke(soft, s * 0.12, 0.6, true)));
      break;
    }
    case 'icelamp': {
      const d = Skia.PathBuilder.Make();
      d.moveTo(x, y - s * 1.4);
      d.lineTo(x + s * 0.6, y);
      d.lineTo(x, y + s * 1.1);
      d.lineTo(x - s * 0.6, y);
      d.close();
      const dp = d.build();
      c.drawPath(dp, additive(fill(soft, 0.75 + 0.2 * Math.sin(t * 0.003 + seed))));
      c.drawPath(dp, stroke('#FFFFFF', s * 0.08, 0.8));
      break;
    }
    case 'shroom': {
      c.drawRect(Skia.XYWHRect(x - s * 0.15, y - s * 0.2, s * 0.3, s * 1.2), fill('#2A1A30'));
      const cap = Skia.PathBuilder.Make();
      cap.addArc(Skia.XYWHRect(x - s, y - s * 0.9, s * 2, s * 1.6), 180, 180);
      cap.close();
      c.drawPath(cap.build(), additive(fill(accent, 0.7 + 0.25 * Math.sin(t * 0.0025 + seed))));
      c.drawCircle(x - s * 0.4, y - s * 0.4, s * 0.12, fill(soft, 0.9));
      c.drawCircle(x + s * 0.35, y - s * 0.5, s * 0.1, fill(soft, 0.9));
      break;
    }
    case 'orb': {
      const yy = y + Math.sin(t * 0.0018 + seed) * s * 0.6;
      c.drawCircle(x, yy, s * 0.6, additive(fill(soft, 0.9)));
      c.save();
      c.translate(x, yy);
      c.scale(1, 0.35);
      c.drawCircle(0, 0, s * 1.1, additive(stroke(accent, s * 0.12, 0.8)));
      c.restore();
      break;
    }
  }
}

/**
 * Wide animated banner for a chapter card. The left part stays dark for the text;
 * the corridor, its lights and the biome's particles sit on the right.
 */
export function drawChapterBanner(c: SkCanvas, t: number, w: number, h: number, b: Biome, locked = false) {
  const { accent, soft, deep, ink } = b.ui;
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`cb${b.id}${h}`, 0, 0, 0, h, [[0, ink, 1], [0.6, deep, 1], [1, ink, 1]])));
  const vx = w * 0.5;
  const vy = h * 0.8;
  glow(c, radial(`cbEnd${accent}${soft}`, [[0, soft, 0.7], [0.3, accent, 0.35], [1, accent, 0]]), vx, vy - h * 0.25, h * 0.9, 0.7 + 0.15 * Math.sin(t * 0.0015));
  if (b.atmos === 'stars') {
    const st = Skia.PathBuilder.Make();
    for (let i = 0; i < 50; i++) st.addCircle(hash(i) * w, hash(i + 7) * h * 0.8, 0.5 + hash(i + 3) * (0.8 + 0.6 * Math.sin(t * 0.003 + i)));
    c.drawPath(st.build(), additive(fill('#FFFFFF', 0.7)));
  }
  // receding arches, far (small) to near (big)
  const N = 5;
  for (let k = N - 1; k >= 0; k--) {
    const z = Math.pow(0.62, k); // 1 = nearest
    const fy = h * 0.6 + h * 0.4 * z;
    const hw = h * 0.42 * z;
    const ah = h * 1.0 * z;
    const fog = 1 - z;
    const stone = mixHex('#0E1116', deep, 0.35 + fog * 0.45);
    const open = archPath(vx, fy, hw, ah);
    c.save();
    c.clipPath(open, 0, true); // wall everywhere except the opening
    c.drawRect(Skia.XYWHRect(vx - hw * 3.2, fy - ah * 1.6, hw * 6.4, ah * 1.6 + 1), fill(stone, 0.95));
    c.restore();
    c.drawPath(open, stroke(accent, Math.max(0.6, 2 * z), 0.12 + 0.3 * z));
    if (b.id === 'frost') {
      const ic = Skia.PathBuilder.Make();
      for (let i = 0; i < 6; i++) {
        const ix = vx - hw * 0.8 + (i / 5) * hw * 1.6;
        const iy = fy - ah + hw * (1 - Math.sqrt(Math.max(0, 1 - Math.pow((ix - vx) / hw, 2))));
        const L = hw * (0.15 + 0.2 * hash(i + k * 9));
        ic.moveTo(ix - hw * 0.05, iy);
        ic.lineTo(ix, iy + L);
        ic.lineTo(ix + hw * 0.05, iy);
        ic.close();
      }
      c.drawPath(ic.build(), fill(soft, 0.35 + 0.4 * z));
    }
    if (b.id === 'crypt' || b.id === 'fungal') {
      const ivy = Skia.PathBuilder.Make();
      for (let i = 0; i < 3; i++) {
        const ix = vx - hw * (0.9 - i * 0.14);
        const y0 = fy - ah + hw * 0.5;
        const len = ah * (0.2 + 0.2 * hash(i + k));
        ivy.moveTo(ix, y0);
        ivy.quadTo(ix + Math.sin(t * 0.001 + i) * hw * 0.1, y0 + len * 0.5, ix, y0 + len);
      }
      c.drawPath(ivy.build(), stroke(b.id === 'crypt' ? '#3A6A32' : '#6A2A7A', 1.6 * z + 0.6, 0.9, true));
    }
    if (k <= 2) {
      const s = h * 0.055 * Math.sqrt(z) + 2;
      drawFixture(c, b.light, vx - hw * 1.35, fy - ah * 0.55, s, t, accent, soft, k * 2);
      drawFixture(c, b.light, vx + hw * 1.35, fy - ah * 0.55, s, t, accent, soft, k * 2 + 1);
    }
  }
  // biome floor details
  if (b.id === 'forge') {
    const lava = Skia.PathBuilder.Make();
    for (let i = 0; i < 3; i++) {
      const y0 = h * (0.9 + 0.035 * i);
      lava.moveTo(0, y0);
      for (let x = 0; x <= w; x += 12) lava.lineTo(x, y0 + Math.sin(x * 0.08 + i * 2) * 2);
    }
    c.drawPath(lava.build(), additive(stroke(accent, 1.4, 0.5 + 0.25 * Math.sin(t * 0.003))));
  } else if (b.id === 'grotto') {
    const water = Skia.PathBuilder.Make();
    for (let i = 0; i < 3; i++) {
      const y0 = h * (0.88 + i * 0.04);
      water.moveTo(0, y0);
      for (let x = 0; x <= w; x += 10) water.lineTo(x, y0 + Math.sin(x * 0.05 + t * 0.002 + i) * 1.6);
    }
    c.drawPath(water.build(), additive(stroke(soft, 1, 0.35)));
  } else if (b.id === 'astral') {
    c.save();
    c.translate(vx, h * 0.95);
    c.scale(1, 0.2);
    c.rotate(t * 0.01, 0, 0);
    c.drawCircle(0, 0, h * 0.9, additive(stroke(accent, 2.5, 0.4, false, [6, 8])));
    c.restore();
  } else if (b.id === 'fungal') {
    for (let i = 0; i < 5; i++) drawFixture(c, 'shroom', w * (0.08 + i * 0.21), h * 0.95, 2.5 + hash(i) * 3, t, accent, soft, i + 9);
  }
  // atmosphere particles
  const motes = Skia.PathBuilder.Make();
  let any = false;
  for (let i = 0; i < 26 && b.atmos !== 'stars'; i++) {
    const r0 = hash(i + 31);
    const r1 = hash(i + 61);
    let x = w * r0;
    let y: number;
    let s = 0.7 + hash(i + 91) * 1.3;
    if (b.atmos === 'snow') {
      y = frac(t * 0.00006 * (0.7 + r1) + r1) * h;
      x += Math.sin(t * 0.001 + i) * 6;
    } else if (b.atmos === 'bubbles' || b.atmos === 'embers') {
      y = h - frac(t * 0.00008 * (0.7 + r1) + r1) * h;
      x += Math.sin(t * 0.002 + i) * 4;
      if (b.atmos === 'bubbles') s *= 1.5;
    } else {
      y = frac(r1 + Math.sin(t * 0.0003 + i) * 0.04) * h;
      x += Math.sin(t * 0.0005 + i) * 8;
    }
    motes.addCircle(x, y, s);
    any = true;
  }
  if (any) {
    const mp = motes.build();
    if (b.atmos === 'bubbles') c.drawPath(mp, stroke(soft, 0.8, 0.55));
    else c.drawPath(mp, additive(fill(b.atmos === 'embers' ? accent : soft, 0.6)));
  }
  // soft side vignette + bottom fade into the card
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`cbL${b.id}${w}`, 0, 0, w, 0, [[0, ink, 0.85], [0.2, ink, 0], [0.8, ink, 0], [1, ink, 0.85]])));
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`cbB${b.id}${h}`, 0, 0, 0, h, [[0, ink, 0], [0.75, ink, 0], [1, ink, 1]])));
  if (locked) c.drawRect(Skia.XYWHRect(0, 0, w, h), fill('#05070A', 0.5));
}

/** Level Complete backdrop: the bat escaped to a moonlit castle. */
export function drawNightCastle(c: SkCanvas, t: number, w: number, h: number) {
  c.drawRect(Skia.XYWHRect(0, 0, w, h), shaded(linear(`ncSky${h}`, 0, 0, 0, h, [[0, '#02040A', 1], [0.5, '#071426', 1], [0.86, '#15404F', 1], [1, '#08141C', 1]])));
  const st = Skia.PathBuilder.Make();
  for (let i = 0; i < 70; i++) st.addCircle(hash(i) * w, hash(i + 5) * h * 0.6, 0.4 + hash(i + 9) * (0.7 + 0.5 * Math.sin(t * 0.002 + i * 1.3)));
  c.drawPath(st.build(), additive(fill('#DDEBFF', 0.7)));
  // moon + sonar rings
  const mx = w * 0.64;
  const my = h * 0.09;
  const mr = Math.min(w, h) * 0.12;
  glow(c, radial('ncMoonHalo', [[0, '#E8F2FF', 0.5], [0.3, '#8FB4E0', 0.18], [1, '#8FB4E0', 0]]), mx, my, mr * 5, 1);
  c.drawCircle(mx, my, mr, shaded(linear(`ncMoon${Math.round(mr)}`, mx - mr, my - mr, mx + mr, my + mr, [[0, '#FFFFFF', 1], [1, '#B8C4D4', 1]])));
  c.drawCircle(mx - mr * 0.3, my - mr * 0.2, mr * 0.2, fill('#9AA8BC', 0.35));
  c.drawCircle(mx + mr * 0.3, my + mr * 0.25, mr * 0.14, fill('#9AA8BC', 0.3));
  c.drawCircle(mx + mr * 0.15, my - mr * 0.45, mr * 0.09, fill('#9AA8BC', 0.3));
  for (let i = 0; i < 3; i++) {
    const k = frac(t * 0.00025 + i / 3);
    c.drawCircle(mx, my, mr * (1.2 + k * 3.5), additive(stroke('#4DF0FF', 1.4, 0.4 * (1 - k))));
  }
  // castle on a cliff
  const base = h * 0.985;
  const towers: [number, number, number][] = [
    [0.2, 0.06, 0.05],
    [0.31, 0.09, 0.04],
    [0.43, 0.13, 0.06],
    [0.56, 0.08, 0.045],
    [0.68, 0.11, 0.05],
    [0.8, 0.05, 0.04],
  ];
  const castle = Skia.PathBuilder.Make();
  castle.addRect(Skia.XYWHRect(w * 0.17, base - h * 0.04, w * 0.66, h * 0.05));
  for (const [fx, th, tw] of towers) {
    const x = w * fx;
    const top = base - h * th;
    castle.addRect(Skia.XYWHRect(x - w * tw * 0.5, top, w * tw, base - top));
    castle.moveTo(x - w * tw * 0.65, top);
    castle.lineTo(x, top - h * 0.03);
    castle.lineTo(x + w * tw * 0.65, top);
    castle.close();
  }
  c.drawPath(castle.build(), fill('#060A12'));
  const cliff = Skia.PathBuilder.Make();
  cliff.moveTo(0, h);
  cliff.lineTo(0, base + h * 0.05);
  cliff.quadTo(w * 0.25, base - h * 0.01, w * 0.45, base);
  cliff.quadTo(w * 0.7, base + h * 0.02, w, base + h * 0.07);
  cliff.lineTo(w, h);
  cliff.close();
  c.drawPath(cliff.build(), fill('#04060A'));
  const win = Skia.PathBuilder.Make();
  towers.forEach(([fx, th], i) => {
    for (let j = 0; j < 2; j++) {
      if (Math.sin(t * 0.0013 * (1 + hash(i * 3 + j)) + i * 4 + j) < -0.6) continue;
      win.addRect(Skia.XYWHRect(w * fx - 1.5, base - h * th * (0.5 + j * 0.25), 3, 5));
    }
  });
  c.drawPath(win.build(), additive(fill('#FFB547', 0.85)));
  // bats flying toward the moon
  for (let i = 0; i < 6; i++) {
    const k = frac(t * 0.00005 * (0.8 + hash(i)) + hash(i + 20));
    const bx = w * (0.08 + 0.55 * k) + hash(i + 4) * w * 0.2;
    const by = h * (0.6 - 0.45 * k) + Math.sin(t * 0.003 + i) * 4;
    const s = 3 + 5 * (1 - k);
    const flap = Math.sin(t * 0.02 + i * 2) * s * 0.6;
    const bat = Skia.PathBuilder.Make();
    bat.moveTo(bx - s * 1.6, by - flap);
    bat.quadTo(bx - s * 0.6, by - s * 0.2, bx, by + s * 0.25);
    bat.quadTo(bx + s * 0.6, by - s * 0.2, bx + s * 1.6, by - flap);
    bat.quadTo(bx + s * 0.6, by + s * 0.35, bx, by + s * 0.55);
    bat.quadTo(bx - s * 0.6, by + s * 0.35, bx - s * 1.6, by - flap);
    bat.close();
    c.drawPath(bat.build(), fill('#010205', 0.95));
  }
  // drifting mist
  for (let i = 0; i < 3; i++) {
    const mxv = frac(t * 0.00002 * (i + 1) + i * 0.3) * w * 1.6 - w * 0.3;
    glow(c, radial('ncMist', [[0, '#5A7A90', 0.2], [1, '#5A7A90', 0]]), mxv, h * (0.9 + i * 0.04), w * 0.5, 1);
  }
  // ivy archway framing the sides
  const arch = Skia.PathBuilder.Make();
  arch.moveTo(0, 0);
  arch.lineTo(w * 0.12, 0);
  arch.quadTo(w * 0.03, h * 0.3, w * 0.07, h);
  arch.lineTo(0, h);
  arch.close();
  arch.moveTo(w, 0);
  arch.lineTo(w * 0.88, 0);
  arch.quadTo(w * 0.97, h * 0.3, w * 0.93, h);
  arch.lineTo(w, h);
  arch.close();
  c.drawPath(arch.build(), fill('#020306'));
  // hanging vines with small leaves down both sides
  const vines = Skia.PathBuilder.Make();
  const leaves = Skia.PathBuilder.Make();
  for (let v = 0; v < 6; v++) {
    const side = v % 2;
    const x0 = side ? w * (0.9 + 0.05 * hash(v)) : w * (0.03 + 0.06 * hash(v));
    const len = h * (0.25 + 0.35 * hash(v + 11));
    const sway = Math.sin(t * 0.0009 + v) * 4;
    vines.moveTo(x0, 0);
    vines.quadTo(x0 + sway * 2, len * 0.5, x0 + sway, len);
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      const lx = x0 + sway * 2 * u * (2 - u) * 0.5 + sway * u * u * 0.5;
      const ly = len * u;
      const dir = k % 2 ? 1 : -1;
      leaves.moveTo(lx, ly);
      leaves.quadTo(lx + dir * 7, ly - 5, lx + dir * 11, ly + 1);
      leaves.quadTo(lx + dir * 6, ly + 4, lx, ly);
      leaves.close();
    }
  }
  c.drawPath(vines.build(), stroke('#0E1E12', 1.6, 1, true));
  c.drawPath(leaves.build(), fill('#173A1E', 0.95));
  for (const lx of [w * 0.1, w * 0.9]) {
    const ly = h * 0.9;
    const f = 0.75 + 0.25 * Math.sin(t * 0.011 + lx) * Math.sin(t * 0.007);
    glow(c, radial('ncLamp', [[0, '#FFE2A8', 0.8], [0.3, '#FFB547', 0.35], [1, '#FFB547', 0]]), lx, ly, 60, f);
    c.drawRect(Skia.XYWHRect(lx - 5, ly - 7, 10, 14), fill('#FFD58A', 0.8 * f));
    c.drawRect(Skia.XYWHRect(lx - 6, ly - 8, 12, 16), stroke('#140E06', 2));
  }
}
