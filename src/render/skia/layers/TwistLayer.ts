import { type SkCanvas } from '@shopify/react-native-skia';
import { EnvObject } from '../../../types/game';
import { crusherClosure, crusherJaws } from '../../../engine/crusher';
import { f, circleD } from '../../art/kit';
import { fill, stroke, shaded, linear, radial, additive, svgPath, svgPathOnce, rrect, glow, blurred } from '../sk';
import { HQ } from '../theme';

/**
 * LATE-GAME TWISTS
 *  - Crusher (levels 41+): two rune-carved jaws that slam shut across a corridor. Deadly.
 *  - Rift (levels 51+): a pair of linked portals; fly into one, come out of the other.
 * Both keep a faint beacon above the darkness so they can be timed / found.
 */

/** One rune-carved jaw block. `side` −1/1 = which wall it comes from (teeth face the other jaw). */
function drawJaw(c: SkCanvas, x: number, y: number, w: number, h: number, vertical: boolean, side: number, accent: string, heat: number) {
  if (w < 0.6 || h < 0.6) return;
  c.drawRRect(rrect(x + 1.2, y + 2, w, h, 1.5), blurred(fill('#000000', 0.55), 1.6, HQ));
  c.drawRRect(rrect(x, y, w, h, 1.5), shaded(linear(`jaw${vertical ? 'v' : 'h'}`, 0, 0, vertical ? 14 : 0, vertical ? 0 : 14, [[0, '#55505E', 1], [0.5, '#2A2730', 1], [1, '#141217', 1]])));
  c.drawRRect(rrect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, 1), stroke('#76707E', 0.6, 0.7));
  // iron teeth along the leading edge
  const across = vertical ? w : h;
  const n = Math.max(2, Math.round(across / 3.6));
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * across;
    const a1 = ((i + 1) / n) * across;
    const am = (a0 + a1) / 2;
    if (vertical) {
      const ey = side < 0 ? y + h : y;
      const dir = side < 0 ? 1 : -1;
      d += `M${f(x + a0)},${f(ey)}L${f(x + am)},${f(ey + dir * 2.6)}L${f(x + a1)},${f(ey)}Z`;
    } else {
      const ex = side < 0 ? x + w : x;
      const dir = side < 0 ? 1 : -1;
      d += `M${f(ex)},${f(y + a0)}L${f(ex + dir * 2.6)},${f(y + am)}L${f(ex)},${f(y + a1)}Z`;
    }
  }
  const tp = svgPathOnce(d);
  if (tp) {
    c.drawPath(tp, fill('#C4C8D2'));
    c.drawPath(tp, stroke('#2A2830', 0.35));
  }
  // glowing rune channel, hotter while slamming
  const cx = x + w / 2;
  const cy = y + h / 2;
  const L = Math.max(0, (vertical ? h : w) / 2 - 2.5);
  if (L > 0.5) {
    const p = vertical ? `M${f(cx)},${f(cy - L)}V${f(cy + L)}` : `M${f(cx - L)},${f(cy)}H${f(cx + L)}`;
    const ch = svgPathOnce(p);
    if (ch) {
      c.drawPath(ch, stroke('#08070A', 2.2, 0.9, true));
      c.drawPath(ch, additive(stroke(accent, 1.1, 0.45 + 0.55 * heat, true)));
    }
  }
}

export function drawCrusher(c: SkCanvas, o: EnvObject, t: number, accent: string) {
  const vertical = o.axis === 'vertical';
  const { closed, warn } = crusherClosure(o, t);
  // slot plates in the walls the jaws hide in
  const slot = stroke('#0A090C', 1.6, 0.9);
  if (vertical) {
    c.drawLine(o.x, o.y, o.x + o.width, o.y, slot);
    c.drawLine(o.x, o.y + o.height, o.x + o.width, o.y + o.height, slot);
  } else {
    c.drawLine(o.x, o.y, o.x, o.y + o.height, slot);
    c.drawLine(o.x + o.width, o.y, o.x + o.width, o.y + o.height, slot);
  }
  const [ja, jb] = crusherJaws(o, t);
  // a sliver of each jaw always shows at the wall so the crusher reads when open
  const lip = 2.2;
  const grow = (r: { x: number; y: number; width: number; height: number }, first: boolean) => {
    if (vertical) return first ? { ...r, height: Math.max(lip, r.height) } : { ...r, y: Math.min(r.y, o.y + o.height - lip), height: Math.max(lip, r.height) };
    return first ? { ...r, width: Math.max(lip, r.width) } : { ...r, x: Math.min(r.x, o.x + o.width - lip), width: Math.max(lip, r.width) };
  };
  const A = grow(ja, true);
  const B = grow(jb, false);
  drawJaw(c, A.x, A.y, A.width, A.height, vertical, -1, accent, Math.max(warn, closed));
  drawJaw(c, B.x, B.y, B.width, B.height, vertical, 1, accent, Math.max(warn, closed));
  // impact flash + dust when the jaws meet
  if (closed > 0.97) {
    const cx = o.x + o.width / 2;
    const cy = o.y + o.height / 2;
    glow(c, radial(`slam${accent}`, [[0, '#FFFFFF', 0.6], [0.3, accent, 0.3], [1, accent, 0]]), cx, cy, Math.max(o.width, o.height) * 0.55, 0.8);
  }
}

/** Always-on faint outline + warning flash so the slam can be timed in the dark. */
export function drawCrusherBeacon(c: SkCanvas, o: EnvObject, t: number, accent: string) {
  const { closed, warn } = crusherClosure(o, t);
  const a = 0.18 + 0.5 * Math.max(warn, closed);
  c.drawRRect(rrect(o.x - 1, o.y - 1, o.width + 2, o.height + 2, 2.5), additive(stroke(accent, 1.2, a, true)));
  glow(c, radial(`crushB${accent}`, [[0, accent, 0.45], [1, accent, 0]]), o.x + o.width / 2, o.y + o.height / 2, Math.max(o.width, o.height) * 0.75, a * 0.7);
}

const RIFT_COLORS = [
  ['#B47DFF', '#4DF0FF'],
  ['#4DF0FF', '#B47DFF'],
];

/** Swirling linked portal. `side` 0/1 picks the colour pair so the two ends read as a pair. */
export function drawRift(c: SkCanvas, o: EnvObject, t: number, side: number, beacon: boolean) {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const R = Math.min(o.width, o.height) * 0.5;
  const [c1, c2] = RIFT_COLORS[side % 2];
  const sec = t / 1000;
  const arrive = o.lastHitTime ? Math.max(0, 1 - (t - o.lastHitTime) / 600) : 0;
  const a = beacon ? 0.5 : 1;
  glow(c, radial(`riftHalo${c1}`, [[0, c1, 0.5], [0.5, c2, 0.15], [1, c2, 0]]), cx, cy, R * (2.2 + arrive * 1.5), a * (0.75 + 0.25 * Math.sin(sec * 2.4)));
  if (!beacon) c.drawCircle(cx, cy, R * 0.9, fill('#040210', 0.92));
  c.save();
  c.translate(cx, cy);
  // spiral arms turning inward
  for (let arm = 0; arm < 3; arm++) {
    let d = '';
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const ang = sec * 2.6 * (side ? -1 : 1) + arm * ((Math.PI * 2) / 3) + u * 4.2 * (side ? -1 : 1);
      const r = R * (1.05 - u * 0.9);
      d += `${i === 0 ? 'M' : 'L'}${f(Math.cos(ang) * r)},${f(Math.sin(ang) * r)}`;
    }
    const p = svgPathOnce(d);
    if (p) {
      c.drawPath(p, additive(stroke(c1, 2.2, 0.35 * a, true)));
      c.drawPath(p, additive(stroke(c2, 0.8, 0.85 * a, true)));
    }
  }
  // motes spiralling in
  let motes = '';
  for (let i = 0; i < 8; i++) {
    const life = ((sec * 0.6 + i / 8) % 1 + 1) % 1;
    const ang = i * 2.4 + life * 5 * (side ? -1 : 1);
    const r = R * (1.6 - life * 1.5);
    motes += circleD(Math.cos(ang) * r, Math.sin(ang) * r, 0.5 + life * 0.7);
  }
  const mp = svgPathOnce(motes);
  if (mp) c.drawPath(mp, additive(fill('#FFFFFF', 0.75 * a)));
  // bright rim + core
  c.drawCircle(0, 0, R, additive(stroke(c2, 1.2, (0.55 + 0.3 * Math.sin(sec * 3)) * a)));
  glow(c, radial(`riftCore${c2}`, [[0, '#FFFFFF', 0.9], [0.3, c2, 0.5], [1, c2, 0]]), 0, 0, R * (0.45 + 0.1 * Math.sin(sec * 5)) * (1 + arrive), a);
  c.restore();
}
