import { Skia, ClipOp, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { EnvObject, Vec2 } from '../../../types/game';
import { THEME, HQ } from '../theme';
import { LevelDecor } from '../../art/decor';
import { clamp } from '../../art/kit';
import {
  fill,
  stroke,
  shaded,
  rect,
  rrect,
  glow,
  radial,
  radialAt,
  linear,
  linearNow,
  svgPath,
  svgPathOnce,
  blurred,
  additive,
  rgba,
} from '../sk';
import { drawPortcullis, drawPressurePlate, drawSpikeBlock, drawKey, drawExitPad } from '../sprites';
import { ART } from '../../art/kit';
import { G } from '../sk';

/**
 * HAZARDS & PICKUPS (animated, drawn every frame).
 * Water pits, laser barriers (glass walls), energy cores (sonar shards), echo crystals,
 * floor grates, the exit pad, plus the rarely used gate / plate / moving-wall objects.
 */

const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h / 6553.5;
};

// ═════════════════════════════════════════════════════════════
// Performance: static parts recorded once as pictures, only the moving bits drawn live
// ═════════════════════════════════════════════════════════════
const picCache = new Map<string, SkPicture>();
function pic(key: string, half: number, draw: (c: SkCanvas) => void): SkPicture {
  let p = picCache.get(key);
  if (!p) {
    const rec = Skia.PictureRecorder();
    draw(rec.beginRecording(rect(-half, -half, half * 2, half * 2)));
    p = rec.finishRecordingAsPicture();
    if (picCache.size > 200) picCache.clear();
    picCache.set(key, p);
  }
  return p;
}

/** Exit pad: frame/inner/rivets cached; glow, breathing border and climbing chevrons live. */
export function drawExitPadFast(c: SkCanvas, x: number, y: number, size: number, t: number) {
  const h = size / 2;
  const inner = size * 0.72;
  const ih = inner / 2;
  const base = pic(`exit|${Math.round(size)}`, h + 4, (pc) => {
    pc.drawRRect(rrect(-h + 2, -h + 3, size, size, 2), fill('#000000', 0.5));
    pc.drawRRect(rrect(-h, -h, size, size, 2), fill(ART.stoneB));
    pc.drawRRect(rrect(-h, -h, size, size, 2), stroke(ART.stoneHighlight, 0.6));
    const mortar = stroke(ART.stoneMortar, 0.7);
    for (const yy of [-h + size * 0.33, h - size * 0.33]) {
      pc.drawLine(-h + 2, yy, -ih, yy, mortar);
      pc.drawLine(ih, yy, h - 2, yy, mortar);
    }
    pc.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), shaded(radialAt(`exitPadF${Math.round(inner)}`, 0, 0, ih * 1.2, [[0, '#0E5AB8', 1], [1, ART.exitDeep, 1]])));
    pc.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), stroke(ART.exitCyan, 1.1, 0.9));
    const rivet = fill(ART.ironLight);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) pc.drawCircle(sx * (h - 2.5), sy * (h - 2.5), 1, rivet);
  });
  const breathe = 0.7 + 0.3 * Math.sin(t * 0.004);
  c.save();
  c.translate(x, y);
  glow(c, G.blue(), 0, 0, size * 1.05 * breathe);
  c.drawPicture(base);
  c.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), stroke(ART.exitBlue, 3.5, 0.3 * breathe));
  for (let i = 0; i < 3; i++) {
    const cy = ih * 0.55 - i * ih * 0.5;
    const w = ih * 0.55;
    const p = svgPath(`M${(-w).toFixed(1)},${(cy + w * 0.5).toFixed(1)}L0,${(cy - w * 0.15).toFixed(1)}L${w.toFixed(1)},${(cy + w * 0.5).toFixed(1)}`);
    if (!p) continue;
    const wave = 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * 0.006 - i * 0.9)), 2);
    c.drawPath(p, stroke(ART.exitBlue, 4.2, wave * 0.35, true));
    c.drawPath(p, stroke(ART.exitCyan, 2, 0.35 + wave * 0.65, true));
  }
  c.restore();
}

// ─── Water ───────────────────────────────────────────────────
export function drawWater(c: SkCanvas, x: number, y: number, w: number, h: number, t: number, seed: number) {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  const half = Math.max(w, h) / 2 + 8;
  // static: bank, wet rocks, deep teal -> navy body (recorded around the pool centre)
  const under = pic(`waterU|${key}`, half, (pc) => {
    pc.translate(-w / 2, -h / 2);
    pc.drawRRect(rrect(-3.5, -3.5, w + 7, h + 7, 4), fill('#151A20'));
    pc.drawRRect(rrect(-3.5, -3.5, w + 7, h + 7, 4), stroke(THEME.waterSpecular, 0.8, 0.22));
    pc.drawRRect(rrect(0, 0, w, h, 2.5), shaded(linear(`waterF${key}`, 0, 0, 0, h, [
      [0, THEME.waterTop, 1],
      [1, THEME.waterBottom, 1],
    ])));
    for (let k = 0; k < 2; k++) {
      const rx = k === 0 ? -1 : w + 1;
      const ry = k === 0 ? h * 0.3 : h * 0.72;
      pc.drawOval(rect(rx - 3.2, ry - 2.4, 6.4, 4.8), fill('#20262E'));
      pc.drawOval(rect(rx - 3.2, ry - 2.4, 6.4, 4.8), stroke(THEME.waterSpecular, 0.6, 0.35));
    }
  });
  // static: inner shadow along the banks so the water reads as sunken
  const over = pic(`waterO|${key}`, half, (pc) => {
    pc.translate(-w / 2, -h / 2);
    pc.drawRRect(rrect(0, 0, w, h, 2.5), stroke('#000000', 5, 0.55));
    pc.drawRRect(rrect(1.5, 1.5, w - 3, h - 3, 2), stroke('#000000', 2, 0.35));
  });
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.drawPicture(under);
  c.restore();
  c.save();
  c.clipRRect(rrect(x, y, w, h, 2.5), ClipOp.Intersect, true);
  // live: slow soft ripples
  const lines = Math.max(3, Math.round(h / 10));
  for (let i = 0; i < lines; i++) {
    const base = y + ((i + 0.5) / lines) * h;
    let d = '';
    for (let s2 = 0; s2 <= 8; s2++) {
      const px = x + (s2 / 8) * w;
      const py = base + Math.sin(px * 0.2 + t * 0.0018 + i * 1.7 + seed) * 1.5 + Math.sin(px * 0.07 - t * 0.0011 + i) * 1.1;
      d += `${s2 === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    }
    const p = svgPathOnce(d);
    if (p) c.drawPath(p, additive(stroke(THEME.waterCaustic, 0.9, 0.2 + 0.12 * Math.sin(t * 0.0017 + i * 2.1))));
  }
  // live: caustic shimmer (high quality only)
  if (HQ) {
    let d = '';
    for (let k = 0; k < 6; k++) {
      const cx = x + ((k * 0.37 + seed * 0.13) % 1) * w;
      const cy = y + ((k * 0.61 + seed * 0.29) % 1) * h;
      const r = 4 + 3 * Math.sin(t * 0.002 + k);
      d += `M${(cx - r).toFixed(1)},${cy.toFixed(1)}Q${cx.toFixed(1)},${(cy - r * 0.8).toFixed(1)} ${(cx + r).toFixed(1)},${cy.toFixed(1)}Q${cx.toFixed(1)},${(cy + r * 0.8).toFixed(1)} ${(cx - r).toFixed(1)},${cy.toFixed(1)}`;
    }
    const p = svgPathOnce(d);
    if (p) c.drawPath(p, additive(stroke(THEME.waterCaustic, 1.1, 0.35 + 0.15 * Math.sin(t * 0.003))));
  }
  c.restore();
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.drawPicture(over);
  c.restore();
  // live: specular glints drifting near the shoreline
  for (let k = 0; k < 4; k++) {
    const ph = t * 0.0006 + k * 1.6 + seed;
    const along = (Math.sin(ph) + 1) / 2;
    const side = k % 4;
    const gx = side < 2 ? x + along * w : side === 2 ? x + 2.5 : x + w - 2.5;
    const gy = side === 0 ? y + 2.5 : side === 1 ? y + h - 2.5 : y + along * h;
    const a = Math.max(0, Math.sin(t * 0.004 + k * 2));
    if (a > 0.05) c.drawCircle(gx, gy, 0.6 + a * 0.9, additive(fill(THEME.waterSpecular, a * 0.8)));
  }
}

// ─── Laser barrier (glass wall) ──────────────────────────────
export function drawLaser(c: SkCanvas, x: number, y: number, w: number, h: number, t: number) {
  const vertical = h >= w;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const [x0, y0, x1, y1] = vertical ? [cx, y + 4, cx, y + h - 4] : [x + 4, cy, x + w - 4, cy];
  const hum = 0.86 + 0.08 * Math.sin(t * 0.031) + 0.06 * Math.sin(t * 0.0137);
  const flick = HQ && Math.sin(t * 0.0023) > 0.995 ? 0.55 : 1;
  const a = hum * flick;
  // light spill on floor + walls
  c.save();
  c.translate(cx, cy);
  c.scale(vertical ? 18 : Math.max(w, 20) * 0.6, vertical ? Math.max(h, 20) * 0.6 : 18);
  c.drawCircle(0, 0, 1, additive(shaded(radial('laserSpill', [[0, THEME.laserColor, 0.28], [1, THEME.laserColor, 0]]), a)));
  c.restore();
  // bloom (wide faint + tighter bright), then beam + white-hot core
  c.drawLine(x0, y0, x1, y1, additive(stroke(THEME.laserColor, 12, 0.1 * a, true)));
  c.drawLine(x0, y0, x1, y1, additive(blurred(stroke(THEME.laserColor, 6, 0.6 * a, true), THEME.laserBloomBlur, HQ)));
  c.drawLine(x0, y0, x1, y1, stroke(THEME.laserColor, 3.2, 0.95 * a, true));
  c.drawLine(x0, y0, x1, y1, stroke(THEME.laserCore, 1.4, a, true));
  // energy flowing along the beam
  c.drawLine(x0, y0, x1, y1, stroke('#FFFFFF', 1.1, 0.7, true, [4, 12], (t * 0.06) % 16));
  // emitter caps
  const caps: Vec2[] = vertical ? [{ x: cx, y: y + 2 }, { x: cx, y: y + h - 2 }] : [{ x: x + 2, y: cy }, { x: x + w - 2, y: cy }];
  const cap = pic('laserCap', 8, (pc) => {
    pc.drawRRect(rrect(-4, -3.5, 10, 10, 2), fill('#000000', 0.45));
    pc.drawRRect(rrect(-5, -5, 10, 10, 2), shaded(linear('capIron', -5, -5, 5, 5, [[0, '#5C646E', 1], [1, '#1C2026', 1]])));
    pc.drawRRect(rrect(-5, -5, 10, 10, 2), stroke('#0B0E12', 0.8));
    pc.drawCircle(0, 0, 2.2, fill('#0B1418'));
  });
  for (const p of caps) {
    c.save();
    c.translate(p.x, p.y);
    c.drawPicture(cap);
    c.restore();
    c.drawCircle(p.x, p.y, 1.5, additive(fill(THEME.laserColor, a)));
    glow(c, radial('capNode', [[0, THEME.laserColor, 0.8], [1, THEME.laserColor, 0]]), p.x, p.y, 6, a);
  }
}

// ─── Energy core (sonar shard) ───────────────────────────────
const BOLT_D = 'M1.3,-5.2L-3,0.7H0L-1.3,5.2L3,-0.7H0Z';
export function drawEnergyCore(c: SkCanvas, x: number, y: number, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 0.005);
  const body = pic('energyCore', 16, (pc) => {
    pc.drawCircle(1.5, 3, 12, fill('#000000', 0.5));
    pc.drawCircle(0, 0, 12, shaded(radialAt('pedestal', -3, -3, 16, [[0, '#5A6270', 1], [1, '#1A1E24', 1]])));
    pc.drawCircle(0, 0, 12, stroke('#0B0E12', 0.8));
    pc.drawCircle(0, 0, 9.4, fill('#14110A'));
    pc.drawCircle(0, 0, 8.6, stroke('#FFE082', 1, 0.95));
    pc.drawCircle(0, 0, 7, shaded(radialAt('coreOrb', -2, -2.5, 9, [[0, '#FFF8E1', 1], [0.35, '#FFC107', 1], [1, '#E65100', 1]])));
    pc.drawCircle(-2.2, -2.6, 1.6, fill('#FFFFFF', 0.7));
    const bolt = svgPath(BOLT_D)!;
    pc.drawPath(bolt, fill('#FFFFFF'));
    pc.drawPath(bolt, stroke('#BF360C', 0.4));
  });
  c.save();
  c.translate(x, y);
  glow(c, radial('coreHalo', [[0, THEME.orbGlow, 0.7], [0.45, '#FF8F00', 0.25], [1, '#FF6F00', 0]]), 0, 0, 24 * pulse, 1);
  c.drawPicture(body);
  c.drawCircle(0, 0, 8.6, additive(stroke(THEME.orbGlow, 3, 0.5 * pulse)));
  c.restore();
}

// ─── Echo crystal ────────────────────────────────────────────
export function drawCrystalHQ(c: SkCanvas, x: number, y: number, t: number, hitAge: number) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.0035);
  const flare = hitAge >= 0 && hitAge < 700 ? 1 - hitAge / 700 : 0;
  const body = pic('crystal', 16, (pc) => {
    pc.drawOval(rect(-7, 2.5, 16, 6), fill('#000000', 0.4));
    const shard = (cx: number, cy: number, w: number, hgt: number, rot: number) => {
      pc.save();
      pc.translate(cx, cy);
      pc.rotate(rot, 0, 0);
      const full = svgPath(`M0,${-hgt}L${w},0L0,${hgt * 0.55}L${-w},0Z`);
      const right = svgPath(`M0,${-hgt}L${w},0L0,${hgt * 0.55}Z`);
      const top = svgPath(`M0,${-hgt}L${w},0L0,${-hgt * 0.1}L${-w},0Z`);
      if (full) pc.drawPath(full, shaded(linear(`cr${w}${hgt}`, -w, -hgt, w, hgt * 0.55, [[0, '#E0FFFF', 1], [0.4, '#4DF0FF', 1], [1, '#0B4F5A', 1]])));
      if (right) pc.drawPath(right, fill('#032F38', 0.5));
      if (top) pc.drawPath(top, fill('#FFFFFF', 0.18));
      if (full) pc.drawPath(full, stroke('#B2FFFF', 0.4, 0.8));
      pc.restore();
    };
    shard(-4.8, 2, 2.8, 7, -25);
    shard(4.8, 2.5, 2.6, 6, 22);
    shard(0, 0, 3.8, 11, 0);
  });
  c.save();
  c.translate(x, y);
  glow(c, radial('crysHalo', [[0, THEME.crystalGlow, 0.7], [0.4, THEME.crystalGlow, 0.2], [1, THEME.crystalGlow, 0]]), 0, 0, 20 * pulse + flare * 24, 1);
  if (flare > 0) c.drawCircle(0, 0, 10 + (1 - flare) * 26, additive(stroke(THEME.crystalGlow, 1.6, flare)));
  c.drawPicture(body);
  c.drawCircle(-0.8, -6, 0.9, additive(fill('#FFFFFF', 0.7 + 0.3 * pulse)));
  c.restore();
}

// ─── Sewer grate ─────────────────────────────────────────────
export function drawGrateHQ(c: SkCanvas, x: number, y: number, s: number, t: number, seed: number) {
  const h = s / 2;
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.0016 + seed);
  c.save();
  c.translate(x, y);
  c.drawRRect(rrect(-h - 2, -h - 2, s + 4, s + 4, 1.5), fill('#2A2F36'));
  c.drawRRect(rrect(-h - 2, -h - 2, s + 4, s + 4, 1.5), stroke('#4A5260', 0.6));
  c.drawRect(rect(-h, -h, s, s), shaded(radial('grateDepth', [[0, '#0A1A1E', 1], [1, '#010203', 1]])));
  glow(c, radial('grateGlow', [[0, '#1B7A85', 0.6], [1, '#1B7A85', 0]]), 0, 0, h, 0.25 + 0.2 * breathe);
  const n = 5;
  for (let i = 1; i < n; i++) {
    const o = -h + (s / n) * i;
    c.drawLine(o, -h, o, h, stroke('#1C2026', 1.8));
    c.drawLine(-h, o, h, o, stroke('#1C2026', 1.8));
    c.drawLine(o - 0.4, -h, o - 0.4, h, stroke('#6B757F', 0.4, 0.6));
    c.drawLine(-h, o - 0.4, h, o - 0.4, stroke('#6B757F', 0.4, 0.6));
  }
  c.drawRect(rect(-h, -h, s, s), stroke('#3A414A', 1.6));
  c.restore();
}

/** All hazards/pickups that sit on the floor below the walls (water, grates, exit pad). */
export function drawFlatHazards(c: SkCanvas, decor: LevelDecor, objects: EnvObject[], goal: Vec2 & { radius: number }, t: number) {
  for (const o of objects) {
    if (o.collected) continue;
    if (o.type === 'chasm') drawWater(c, o.x, o.y, o.width, o.height, t, hashId(o.id));
    else if (o.type === 'pressure_plate') drawPressurePlate(c, o.x, o.y, o.width, o.height, t, o.lastHitTime ? t - o.lastHitTime : -1);
  }
  // exit pad with a cyan underglow
  const size = clamp(decor.cellMin * 0.72, 28, 50);
  glow(c, radial('exitUnder', [[0, '#2E8BFF', 0.45], [1, '#2E8BFF', 0]]), goal.x, goal.y, size * 1.1, 0.8 + 0.2 * Math.sin(t * 0.004));
  const locked = objects.some((o) => o.type === 'key' && !o.collected);
  if (locked) drawExitPad(c, goal.x, goal.y, size, t, true);
  else drawExitPadFast(c, goal.x, goal.y, size, t);
}

/** Pickups + barriers that stand up above the walls' bases. */
export function drawRaisedHazards(c: SkCanvas, objects: EnvObject[], t: number) {
  for (const o of objects) {
    if (o.collected) continue;
    const cx = o.x + o.width / 2;
    const cy = o.y + o.height / 2;
    switch (o.type) {
      case 'glass_wall':
        if (o.state === 'open') break;
        drawLaser(c, o.x, o.y, o.width, o.height, t);
        break;
      case 'key':
        drawKey(c, cx, cy, t);
        break;
      case 'sonar_shard':
        drawEnergyCore(c, cx, cy, t);
        break;
      case 'echo_crystal':
        drawCrystalHQ(c, cx, cy, t, o.lastHitTime ? t - o.lastHitTime : -1);
        break;
      case 'resonance_gate':
        drawPortcullis(c, o.x, o.y, o.width, o.height, o.state === 'open', t);
        break;
      case 'moving_wall':
        drawSpikeBlock(c, o.x, o.y, o.width, o.height);
        break;
    }
  }
}

export { rgba, Skia, linearNow };
