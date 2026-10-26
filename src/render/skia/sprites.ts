import { Skia, type SkCanvas, type SkImage, type SkPath } from '@shopify/react-native-skia';
import { ART, f, makeRng, blobD, circleD } from '../art/kit';
import type { BushDecor, VineDecor } from '../art/decor';
import { fill, stroke, shaded, strokeShaded, glow, linear, radialAt, svgPath, svgPathOnce, rect, rrect, G, beginAlpha } from './sk';

/**
 * Procedural, time-animated game assets drawn straight onto a Skia canvas.
 * `t` is the game clock in ms. All sizes are in screen points.
 */

// ═════════════════════════════════════════════════════════════
// Bats
// ═════════════════════════════════════════════════════════════

// ─── Bat anatomy (local units: 14px-radius bat facing up, body centre at 0,0) ───
type P2 = [number, number];

/** Wing pose for one point in the wingbeat. */
export interface WingPose {
  /** spread: 1 = fully open, ~0.4 = folded at the wrist */
  e: number;
  /** sweep in degrees around the shoulder: + = swept back, − = reaching forward */
  sweep: number;
  /** 0..1 how much the top (lit) side of the membrane faces the viewer */
  lit: number;
  /** 0..1 how much the underside (shadowed) faces the viewer */
  shade: number;
  /** body altitude −1..1 (higher on the downstroke) */
  lift: number;
}

/**
 * Wingbeat pose. Downstroke (fast, 40% of the cycle): wings reach forward and spread.
 * Upstroke (slow): wrists fold in and the wings sweep back.
 * `amp` scales the stroke (0 = held still), `glide` blends toward wings-out gliding.
 */
export function wingPose(phase: number, amp: number, glide: number, t: number): WingPose {
  const p = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  let e: number, sweep: number, lit: number, shade: number;
  if (p < 0.4) {
    const k = Math.sin((p / 0.4) * Math.PI);
    e = 0.8 + 0.2 * k;
    sweep = -14 * k + 4 * (1 - k);
    lit = k;
    shade = 0;
  } else {
    const k = Math.sin(((p - 0.4) / 0.6) * Math.PI);
    e = 0.8 - 0.38 * k;
    sweep = 4 + 20 * k;
    lit = 0;
    shade = k;
  }
  const lift = Math.sin((p - 0.05) * Math.PI * 2);
  // amplitude: blend toward a relaxed neutral pose
  e = 0.92 + (e - 0.92) * amp;
  sweep *= amp;
  lit *= amp;
  shade *= amp;
  // gliding: wings stretched out with a slight tremble
  const tremble = Math.sin(t * 0.045) * 0.02;
  e = e + (1 + tremble - e) * glide;
  sweep = sweep + (2 - sweep) * glide;
  return { e, sweep, lit: lit * (1 - glide) + 0.25 * glide, shade: shade * (1 - glide), lift: lift * amp * (1 - glide) };
}

const rot = ([x, y]: P2, [ox, oy]: P2, deg: number): P2 => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c];
};

/** Key points of the right wing for a pose (mirror x for the left). `span` foreshortens for banking. */
function wingPoints(pose: WingPose, span: number) {
  const S: P2 = [2.4, -3.4]; // shoulder
  const e = pose.e;
  const fold = 1 - e;
  // forearm shortens as the wrist folds in
  let W: P2 = [S[0] + (11 - S[0]) * (0.55 + 0.45 * e), S[1] + (-9.4 - S[1]) * (0.55 + 0.45 * e) + fold * 3.5];
  // fingers from the wrist: length shrinks and they rotate back as the wing folds
  const finger = (tip: P2, back: number): P2 => {
    const L = 0.4 + 0.6 * e;
    const raw: P2 = [W[0] + (tip[0] - 11) * L, W[1] + (tip[1] + 9.4) * L];
    return rot(raw, W, back * fold);
  };
  let D2 = finger([24, -7.6], 40);
  let D3 = finger([25, -0.6], 46);
  let D4 = finger([21, 5.6], 50);
  let D5 = finger([14, 8.6], 40);
  let H: P2 = [3.2, 5.6]; // membrane meets the leg
  const thumb: P2 = [W[0] + 0.8, W[1] - 2.2];
  // sweep the whole wing around the shoulder
  [W, D2, D3, D4, D5] = [W, D2, D3, D4, D5].map((pt) => rot(pt, S, pose.sweep)) as [P2, P2, P2, P2, P2];
  const th = rot(thumb, S, pose.sweep);
  // banking foreshortens the span
  const fx = (pt: P2): P2 => [S[0] + (pt[0] - S[0]) * span, pt[1]];
  return { S, W: fx(W), D2: fx(D2), D3: fx(D3), D4: fx(D4), D5: fx(D5), H, thumb: fx(th) };
}

function wingPaths(pose: WingPose, span: number, side: 1 | -1) {
  const k = wingPoints(pose, span);
  const X = (pt: P2) => `${f(pt[0] * side)},${f(pt[1])}`;
  // scallop: control point pulled toward the body so the membrane sags between fingers
  const sag = (a: P2, b: P2, amt: number): P2 => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    return [mx + (3 - mx) * amt, my + (1.5 - my) * amt];
  };
  const lead: P2 = [(k.S[0] + k.W[0]) / 2, (k.S[1] + k.W[1]) / 2 - 2.4];
  const membrane =
    `M${X(k.S)}Q${X(lead)} ${X(k.W)}L${X(k.D2)}` +
    `Q${X(sag(k.D2, k.D3, 0.22))} ${X(k.D3)}` +
    `Q${X(sag(k.D3, k.D4, 0.26))} ${X(k.D4)}` +
    `Q${X(sag(k.D4, k.D5, 0.28))} ${X(k.D5)}` +
    `Q${X(sag(k.D5, k.H, 0.24))} ${X(k.H)}Z`;
  // inner panel (between the last fingers) — slightly darker skin
  const inner =
    `M${X(k.W)}L${X(k.D4)}Q${X(sag(k.D4, k.D5, 0.28))} ${X(k.D5)}Q${X(sag(k.D5, k.H, 0.24))} ${X(k.H)}L${X(k.S)}Z`;
  const arm = `M${X(k.S)}L${X(k.W)}`;
  const fingers = `M${X(k.W)}L${X(k.D2)}M${X(k.W)}L${X(k.D3)}M${X(k.W)}L${X(k.D4)}M${X(k.W)}L${X(k.D5)}`;
  const thumb = `M${X(k.W)}L${X(k.thumb)}`;
  return { membrane, inner, arm, fingers, thumb };
}

const BAT_BODY_D =
  'M0,-2.8C2.8,-2.8 4,-0.2 3.8,2.6C3.6,5.6 2,8.2 0,8.8C-2,8.2 -3.6,5.6 -3.8,2.6C-4,-0.2 -2.8,-2.8 0,-2.8Z';
const BAT_HEAD_D = 'M0,-10.2C2.3,-10.2 3.5,-8.5 3.5,-6.6C3.5,-4.5 2.1,-3 0,-3C-2.1,-3 -3.5,-4.5 -3.5,-6.6C-3.5,-8.5 -2.3,-10.2 0,-10.2Z';
const BAT_SNOUT_D = 'M-1.3,-9.6Q0,-11.6 1.3,-9.6Q0,-9 -1.3,-9.6Z';
const BAT_EAR_R = 'M1.4,-9.2Q3.4,-14.2 4.6,-13.6Q4.8,-10.6 3.2,-8.2Z';
const BAT_EAR_R_IN = 'M2,-9.4Q3.5,-12.7 4.1,-12.6Q4.1,-10.6 3,-8.9Z';
const BAT_FUR_D =
  'M-1.8,0l0.5,1.7M0,-0.6v1.9M1.8,0l-0.5,1.7M-2.2,3.2l0.7,1.5M2.2,3.2l-0.7,1.5M0,2.8v1.7M-1,5.8l0.3,1.3M1,5.8l-0.3,1.3M-2.6,-1.6l0.6,1M2.6,-1.6l-0.6,1';

export interface BatMotion {
  /** −1..1: banking into a turn (+ = turning right) */
  bank?: number;
  /** 0..1 wingbeat amplitude */
  amp?: number;
  /** 0..1 blend toward gliding */
  glide?: number;
}

/**
 * Bat sprite. `deg` = heading (0 = up), `k` = scale (1 ≈ 14px bat), `phase` = wingbeat phase (radians).
 */
export function drawBat(
  c: SkCanvas,
  x: number,
  y: number,
  deg: number,
  k: number,
  phase: number,
  variant: 'player' | 'wraith',
  t: number,
  frenzy = false,
  motion: BatMotion = {}
) {
  const isW = variant === 'wraith';
  const bank = Math.max(-1, Math.min(1, motion.bank ?? 0));
  const pose = wingPose(phase, motion.amp ?? 1, motion.glide ?? 0, t);
  // banking: the inside wing dips (foreshortened), the outside wing spreads
  const R = wingPaths(pose, 1 - 0.32 * Math.max(0, bank) + 0.08 * Math.max(0, -bank), 1);
  const L = wingPaths(pose, 1 - 0.32 * Math.max(0, -bank) + 0.08 * Math.max(0, bank), -1);
  const wingsD = R.membrane + L.membrane;
  const wings = svgPathOnce(wingsD);
  const inner = svgPathOnce(R.inner + L.inner);
  const arms = svgPathOnce(R.arm + L.arm);
  const fingers = svgPathOnce(R.fingers + L.fingers);
  const thumbs = svgPathOnce(R.thumb + L.thumb);
  if (!wings || !inner || !arms || !fingers || !thumbs) return;
  const body = svgPath(BAT_BODY_D)!;
  const head = svgPath(BAT_HEAD_D)!;
  const snout = svgPath(BAT_SNOUT_D)!;
  const fur = svgPath(BAT_FUR_D)!;
  const pulse = 0.75 + 0.25 * Math.sin(t * (frenzy ? 0.03 : 0.008));

  // ear twitch + blink
  const twitch = Math.max(0, Math.sin(t * 0.0021 + (isW ? 2 : 0))) > 0.97 ? 8 : 0;
  const blinking = t % 3400 < 110;

  // tail membrane flutters a little behind the body
  const tailSway = Math.sin(t * 0.012) * 0.6 + bank * -1.2;
  const tail = svgPathOnce(
    `M-3,5.4Q-2.6,9.4 -2.2,10.4Q${f(tailSway)},13.4 ${f(tailSway)},13.8Q${f(tailSway)},13.4 2.2,10.4Q2.6,9.4 3,5.4Z`
  );
  const legs = svgPathOnce('M-2.4,7.4L-2.4,10.6M2.4,7.4L2.4,10.6M-2.4,10.6l-0.7,0.8M-2.4,10.6l0.3,1M2.4,10.6l0.7,0.8M2.4,10.6l-0.3,1');

  // altitude: higher on the downstroke → shadow drifts further away and softer
  const alt = pose.lift;
  const shOff = 1 + 0.12 * alt;
  const bodyShift = bank * 0.9;
  const squash = 1 + 0.035 * alt;

  // ── shadow on the floor ──
  c.save();
  c.translate(x + 5 * k * shOff, y + 9 * k * shOff);
  c.rotate(deg, 0, 0);
  c.scale(k * (0.9 - 0.04 * alt), k * (0.9 - 0.04 * alt));
  const sh = fill('#000000', 0.34 - 0.06 * alt);
  c.drawPath(wings, sh);
  c.drawPath(body, sh);
  c.drawPath(head, sh);
  c.restore();

  c.save();
  c.translate(x, y - 0.8 * k * alt);
  c.rotate(deg, 0, 0);
  c.scale(k / squash, k * squash);

  // ── wings ──
  if (isW) {
    c.drawPath(wings, stroke(ART.wraithRed, 4.5, 0.16 * pulse, true));
    c.drawPath(wings, stroke(ART.wraithRed, 2.4, 0.32 * pulse, true));
  }
  const wingShader = isW
    ? radialAt('wraithWing2', 0, -1, 24, [[0, ART.wraithWing, 1], [1, ART.wraithWingDark, 1]])
    : radialAt('batWing2', 0, -1, 24, [[0, '#5A4038', 1], [0.6, ART.batWing, 1], [1, ART.batWingDark, 1]]);
  c.drawPath(wings, shaded(wingShader));
  c.drawPath(inner, fill(isW ? '#1A0307' : '#20140F', 0.45));
  // light catches the top of the membrane on the downstroke; underside is darker on the upstroke
  if (pose.lit > 0.02) c.drawPath(wings, fill(isW ? ART.wraithHot : '#8C6A58', 0.22 * pose.lit));
  if (pose.shade > 0.02) c.drawPath(wings, fill('#000000', 0.28 * pose.shade));
  // bones: thick forearm, thin fingers, thumb claw
  const bone = isW ? ART.wraithBone : ART.batBone;
  c.drawPath(arms, stroke(bone, 1.15, 0.95, true));
  c.drawPath(fingers, stroke(bone, 0.6, 0.85, true));
  c.drawPath(thumbs, stroke(isW ? ART.wraithHot : '#C8B4A4', 0.75, 0.9, true));
  // rim light on the wing edge
  c.drawPath(wings, stroke(isW ? ART.wraithRed : ART.cyan, isW ? 1.1 : 0.55, isW ? 0.95 * pulse : 0.32, true));

  // ── body ──
  c.save();
  c.translate(bodyShift, 0);
  if (tail) c.drawPath(tail, fill(isW ? '#3A0710' : '#3E2B25', 0.95));
  if (tail) c.drawPath(tail, stroke(bone, 0.4, 0.6));
  if (legs) c.drawPath(legs, stroke(isW ? '#5A0D18' : '#2A1C18', 0.7, 1, true));
  if (isW) c.drawPath(body, fill(ART.wraithBody));
  else c.drawPath(body, shaded(radialAt('batBody2', -0.6, 0.2, 7, [[0, '#7A5A4A', 1], [0.55, ART.batFur, 1], [1, ART.batBody, 1]])));
  c.drawPath(fur, stroke(isW ? '#4A0B14' : '#9A7A66', 0.42, 0.75, true));

  // ears (twitch occasionally), inner ear, head, snout
  for (const sgn of [1, -1]) {
    c.save();
    c.scale(sgn, 1);
    c.rotate(twitch * (sgn > 0 ? 1 : 0.5), 1.4, -8.6);
    const ear = svgPath(BAT_EAR_R)!;
    const earIn = svgPath(BAT_EAR_R_IN)!;
    c.drawPath(ear, fill(isW ? '#3D0810' : '#4A3530'));
    c.drawPath(earIn, fill(isW ? ART.wraithRed : '#B07A70', isW ? 0.55 : 0.8));
    c.drawPath(ear, stroke(isW ? ART.wraithRed : '#6A4E40', 0.4, 0.9));
    c.restore();
  }
  c.drawPath(head, fill(isW ? '#3A0910' : '#4E3A31'));
  c.drawPath(head, stroke(isW ? ART.wraithRed : '#2A1C18', 0.4, isW ? 0.8 : 0.6));
  c.drawPath(snout, fill(isW ? '#2A0509' : '#6A4E40'));
  c.drawCircle(-0.45, -10.1, 0.25, fill('#140C0A'));
  c.drawCircle(0.45, -10.1, 0.25, fill('#140C0A'));
  if (isW) c.drawPath(body, stroke(ART.wraithRed, 0.6, 0.8));

  // eyes (glow + pupil + highlight, with blinks)
  const er = isW ? 1.9 : 1.5;
  const eg = fill(isW ? ART.wraithRed : ART.amber, isW ? 0.55 * pulse : 0.32);
  c.drawCircle(-1.35, -7.2, er, eg);
  c.drawCircle(1.35, -7.2, er, eg);
  if (blinking) {
    const lid = stroke(isW ? '#2A0509' : '#2A1C18', 0.5, 1, true);
    c.drawLine(-2, -7.2, -0.7, -7.2, lid);
    c.drawLine(0.7, -7.2, 2, -7.2, lid);
  } else {
    const ec = fill(isW ? '#FFD6DA' : ART.batEye);
    c.drawCircle(-1.35, -7.2, 0.8, ec);
    c.drawCircle(1.35, -7.2, 0.8, ec);
    const pupil = fill(isW ? '#7A0010' : '#1A0F0A');
    c.drawCircle(-1.3, -7.3, 0.4, pupil);
    c.drawCircle(1.4, -7.3, 0.4, pupil);
    const hl = fill('#FFFFFF', 0.9);
    c.drawCircle(-1.55, -7.55, 0.18, hl);
    c.drawCircle(1.15, -7.55, 0.18, hl);
  }
  c.restore(); // body shift
  c.restore();
}

/** Red vision cone of a wraith. */
export function drawCone(c: SkCanvas, x: number, y: number, deg: number, len: number, half: number, a: number) {
  const sx = Math.sin(half) * len;
  const cy = -Math.cos(half) * len;
  const p = svgPath(`M0,0L${f(-sx)},${f(cy)}A${f(len)},${f(len)} 0 0 1 ${f(sx)},${f(cy)}Z`);
  const edges = svgPath(`M0,0L${f(-sx)},${f(cy)}M0,0L${f(sx)},${f(cy)}`);
  if (!p || !edges) return;
  const sh = radialAt(`cone${len}`, 0, 0, len, [[0, ART.wraithRed, 0.55], [0.6, ART.wraithRed, 0.18], [1, ART.wraithRed, 0]]);
  c.save();
  c.translate(x, y);
  c.rotate(deg, 0, 0);
  c.drawPath(p, shaded(sh, a));
  c.drawPath(edges, stroke(ART.wraithRed, 0.8, 0.35 * a));
  c.restore();
}

// ═════════════════════════════════════════════════════════════
// Lantern
// ═════════════════════════════════════════════════════════════

export function flick(t: number, seed: number) {
  const a = Math.sin(t * 0.0113 + seed * 1.7);
  const b = Math.sin(t * 0.0271 + seed * 3.1);
  const cc = Math.sin(t * 0.0057 + seed * 0.37);
  const pop = Math.max(0, Math.sin(t * 0.0021 + seed)) > 0.985 ? -0.12 : 0;
  return 0.87 + a * 0.05 + b * 0.04 + cc * 0.04 + pop;
}

/** Iron lantern body + warm pool of light on the floor (under the darkness). */
export function drawLantern(c: SkCanvas, x: number, y: number, t: number, seed: number, light: number) {
  const fl = flick(t, seed);
  const s = 9;
  glow(c, G.amberPool(), x, y + 4, light * fl);
  c.save();
  c.translate(x, y);
  c.drawRRect(rrect(-s / 2 + 1.5, -s / 2 + 3, s, s, 1.6), fill('#000000', 0.5));
  c.drawRRect(
    rrect(-s / 2, -s / 2, s, s, 1.6),
    shaded(linear('lanternIron', -4.5, -4.5, 4.5, 4.5, [[0, ART.ironLight, 1], [0.45, ART.ironMid, 1], [1, ART.iron, 1]]))
  );
  c.drawRRect(rrect(-s / 2 + 1.6, -s / 2 + 1.6, s - 3.2, s - 3.2, 0.8), fill(ART.amber, 0.7 * fl));
  c.drawRRect(rrect(-s / 2 + 2.4, -s / 2 + 2.4, s - 4.8, s - 4.8, 0.6), fill(ART.amberCore, 0.95 * fl));
  const bars = stroke(ART.iron, 0.9);
  c.drawLine(0, -s / 2, 0, s / 2, bars);
  c.drawLine(-s / 2, 0, s / 2, 0, bars);
  c.drawCircle(0, 0, 1.5, fill(ART.ironMid));
  c.drawCircle(0, 0, 1.5, stroke(ART.ironLight, 0.4));
  c.restore();
}

/** Flame glow that pierces the darkness (above the darkness). */
export function drawLanternGlow(c: SkCanvas, x: number, y: number, t: number, seed: number) {
  const fl = flick(t, seed);
  glow(c, G.amberHalo(), x, y, 18 * fl, 0.42 * fl);
  glow(c, G.amberHalo(), x, y, 7 * fl, 0.9);
  c.drawCircle(x + Math.sin(t * 0.013 + seed) * 0.4, y, 1.6, fill(ART.amberCore, 0.95));
}

// ═════════════════════════════════════════════════════════════
// Static props (painted once per level)
// ═════════════════════════════════════════════════════════════

export function drawCrate(c: SkCanvas, x: number, y: number, s: number, rot: number) {
  const h = s / 2;
  const fw = s * 0.15;
  c.save();
  c.translate(x, y);
  c.rotate((rot * 180) / Math.PI, 0, 0);
  c.drawRRect(rrect(-h + 2, -h + 3, s, s, 1), fill('#000000', 0.5));
  c.drawRRect(
    rrect(-h, -h, s, s, 0.8),
    shaded(linear(`wood${f(s)}`, -h, -h, h, h, [[0, ART.woodLight, 1], [0.5, ART.wood, 1], [1, ART.woodDark, 1]]))
  );
  const plank = stroke(ART.woodDark, 0.5, 0.7);
  c.drawLine(-h + fw, -s / 6, h - fw, -s / 6, plank);
  c.drawLine(-h + fw, s / 6, h - fw, s / 6, plank);
  c.drawLine(-h + fw, -h + fw, h - fw, h - fw, stroke(ART.woodDark, s * 0.16));
  c.drawLine(-h + fw, -h + fw, h - fw, h - fw, stroke(ART.wood, s * 0.08));
  c.drawRect(rect(-h + fw / 2, -h + fw / 2, s - fw, s - fw), stroke(ART.woodDark, fw));
  const hl = svgPath(`M${f(-h)},${f(h)}V${f(-h)}H${f(h)}`);
  if (hl) c.drawPath(hl, stroke(ART.woodLight, 0.7, 0.75));
  const nail = fill(ART.ironLight);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) c.drawCircle(sx * (h - fw / 2), sy * (h - fw / 2), 0.6, nail);
  c.restore();
}

export function drawBarrel(c: SkCanvas, x: number, y: number, r: number) {
  c.save();
  c.translate(x, y);
  c.drawCircle(2, 3, r, fill('#000000', 0.5));
  c.drawCircle(0, 0, r, shaded(radialAt(`barrel${f(r)}`, -r * 0.2, -r * 0.24, r * 1.3, [[0, ART.woodLight, 1], [0.55, ART.wood, 1], [1, ART.woodDark, 1]])));
  const stave = stroke(ART.woodDark, 0.5, 0.75);
  for (let i = -2; i <= 2; i++) {
    const sx = (i / 2.6) * r * 0.85;
    const hc = Math.sqrt(Math.max(0, (r * 0.85) ** 2 - sx * sx));
    c.drawLine(sx, -hc, sx, hc, stave);
  }
  c.drawCircle(0, 0, r * 0.92, stroke(ART.ironMid, r * 0.15));
  c.drawCircle(0, 0, r * 0.6, stroke(ART.iron, r * 0.09, 0.9));
  const arc = svgPath(`M${f(-r * 0.75)},${f(-r * 0.45)}A${f(r * 0.88)},${f(r * 0.88)} 0 0 1 ${f(r * 0.1)},${f(-r * 0.86)}`);
  if (arc) c.drawPath(arc, stroke(ART.woodLight, 0.8, 0.6));
  c.drawCircle(r * 0.28, r * 0.2, r * 0.12, fill(ART.woodDark));
  c.restore();
}

export function drawRocks(c: SkCanvas, x: number, y: number, s: number, seed: number) {
  const rng = makeRng(Math.round(seed * 1000));
  const n = rng.int(2, 3);
  c.save();
  c.translate(x, y);
  for (let i = 0; i < n; i++) {
    const r = s * rng.range(0.22, 0.42);
    const cx = rng.range(-s * 0.3, s * 0.3);
    const cy = rng.range(-s * 0.3, s * 0.3);
    const p = svgPathOnce(blobD(rng, cx, cy, r, 7));
    if (!p) continue;
    c.save();
    c.translate(1.5, 2);
    c.drawPath(p, fill('#000000', 0.45));
    c.restore();
    c.drawPath(p, shaded(radialAt(`rock${i}${f(r)}${f(cx)}`, cx - r * 0.25, cy - r * 0.3, r * 1.4, [[0, ART.rockLight, 1], [1, ART.rockDark, 1]])));
    c.drawCircle(cx - r * 0.3, cy - r * 0.35, r * 0.25, fill(ART.rockLight, 0.5));
  }
  c.restore();
}

export function drawBones(c: SkCanvas, x: number, y: number, s: number, rot: number) {
  const bone = (len: number, color: string) => {
    c.drawLine(-len / 2, 0, len / 2, 0, stroke(color, 1.1, 0.85));
    const p = fill(color, 0.85);
    c.drawCircle(-len / 2, -0.8, 0.9, p);
    c.drawCircle(-len / 2, 0.8, 0.9, p);
    c.drawCircle(len / 2, -0.8, 0.9, p);
    c.drawCircle(len / 2, 0.8, 0.9, p);
  };
  c.save();
  c.translate(x, y);
  c.rotate((rot * 180) / Math.PI, 0, 0);
  c.save();
  c.rotate(35, 0, 0);
  bone(s * 0.85, '#CFC6AE');
  c.restore();
  c.save();
  c.rotate(-30, 0, 0);
  bone(s * 0.75, '#B9AF96');
  c.restore();
  c.translate(s * 0.35, -s * 0.25);
  c.drawOval(rect(-2.6, -2.9, 5.2, 5.8), fill('#D8D0B8', 0.9));
  c.drawCircle(-0.9, -0.2, 0.75, fill('#141414'));
  c.drawCircle(0.9, -0.2, 0.75, fill('#141414'));
  c.drawLine(-0.8, 1.6, 0.8, 1.6, stroke('#141414', 0.5));
  c.restore();
}

// ═════════════════════════════════════════════════════════════
// Vegetation (pre-rendered to images, then swayed every frame)
// ═════════════════════════════════════════════════════════════

export interface Sprite {
  image: SkImage;
  /** draw size in points */
  size: number;
}

/** Paints `draw` (centred on 0,0 within ±half) into a small image at device resolution. */
export function bake(half: number, scale: number, draw: (c: SkCanvas) => void): Sprite | null {
  const px = Math.ceil(half * 2 * scale);
  const surface = Skia.Surface.Make(px, px);
  if (!surface) return null;
  const c = surface.getCanvas();
  c.scale(scale, scale);
  c.translate(half, half);
  draw(c);
  surface.flush();
  const image = surface.makeImageSnapshot();
  return { image, size: half * 2 };
}

export function paintBush(c: SkCanvas, b: BushDecor) {
  const P = (d: string) => svgPathOnce(d);
  const shadow = P(b.shadow);
  if (shadow) c.drawPath(shadow, fill('#000000', 0.4));
  const layers: [string, string, number][] = [
    [b.deep, ART.mossDeep, 1],
    [b.dark, ART.mossDark, 1],
    [b.mid, ART.moss, 1],
    [b.light, ART.mossLight, 1],
    [b.tips, ART.leafTip, 0.75],
    [b.berries, '#B3263A', 0.9],
  ];
  for (const [d, color, a] of layers) {
    const p = P(d);
    if (p) c.drawPath(p, fill(color, a));
  }
}

export function paintVine(c: SkCanvas, v: VineDecor) {
  const stem = svgPathOnce(v.stem);
  if (stem) c.drawPath(stem, stroke('#2A4A1B', 0.9, 1, true));
  const l = svgPathOnce(v.leaves);
  if (l) c.drawPath(l, fill(ART.moss));
  const ll = svgPathOnce(v.leavesLight);
  if (ll) c.drawPath(ll, fill(ART.mossLight));
}

/** Draws a baked sprite centred at (x,y), rotated by `deg` around (x + px, y + py). */
export function drawSprite(c: SkCanvas, s: Sprite, x: number, y: number, deg = 0, pivotX = 0, pivotY = 0) {
  c.save();
  c.translate(x, y);
  if (deg) c.rotate(deg, pivotX, pivotY);
  c.drawImageRect(s.image, rect(0, 0, s.image.width(), s.image.height()), rect(-s.size / 2, -s.size / 2, s.size, s.size), fill('#FFFFFF'));
  c.restore();
}

// ═════════════════════════════════════════════════════════════
// Interactive objects
// ═════════════════════════════════════════════════════════════

export function drawGrate(c: SkCanvas, x: number, y: number, s: number, t: number, seed: number) {
  const h = s / 2;
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.0016 + seed);
  c.save();
  c.translate(x, y);
  c.drawRRect(rrect(-h - 1.5, -h - 1.5, s + 3, s + 3, 1), fill(ART.stoneB));
  c.drawRect(rect(-h, -h, s, s), fill('#020304'));
  glow(c, G.cyan(), 0, 0, h * 1.1, 0.12 + 0.12 * breathe);
  const n = 5;
  const dark = stroke(ART.iron, 1.6);
  const lite = stroke(ART.ironLight, 0.4, 0.6);
  for (let i = 1; i < n; i++) {
    const o = -h + (s / n) * i;
    c.drawLine(o, -h, o, h, dark);
    c.drawLine(-h, o, h, o, dark);
    c.drawLine(o, -h, o, h, lite);
    c.drawLine(-h, o, h, o, lite);
  }
  c.drawRect(rect(-h, -h, s, s), stroke(ART.ironMid, 1.6));
  c.restore();
}

const KEY_D = 'M0,-11.5a4.6,4.6 0 1,0 0.01,0Z' + 'M0,-2.4V9.5M0,5.6H3.6M0,8.6H4.4M0,2.8H2.4';
const KEY_HL = 'M-2.6,-9.4A3.2,3.2 0 0,1 1.2,-10.6M-0.5,0V6';

function sparkle(c: SkCanvas, cx: number, cy: number, r: number, color: string, a: number) {
  if (r < 0.15) return;
  const p = svgPathOnce(
    `M${f(cx)},${f(cy - r * 3)}L${f(cx + r * 0.6)},${f(cy - r * 0.6)}L${f(cx + r * 3)},${f(cy)}L${f(cx + r * 0.6)},${f(cy + r * 0.6)}L${f(cx)},${f(cy + r * 3)}L${f(cx - r * 0.6)},${f(cy + r * 0.6)}L${f(cx - r * 3)},${f(cy)}L${f(cx - r * 0.6)},${f(cy - r * 0.6)}Z`
  );
  if (p) c.drawPath(p, fill(color, a));
}

/** Golden key: bobbing, swaying, sparkling. */
export function drawKey(c: SkCanvas, x: number, y: number, t: number) {
  const bob = Math.sin(t * 0.0032) * 1.6;
  const sway = -32 + Math.sin(t * 0.0021) * 9;
  const g = 0.75 + 0.25 * Math.sin(t * 0.004);
  const key = svgPath(KEY_D)!;
  const hl = svgPath(KEY_HL)!;
  c.save();
  c.translate(x, y);
  c.drawOval(rect(-5, 6.4, 14, 5.2), fill('#000000', 0.45));
  glow(c, G.gold(), 0, bob, 20 * g);
  c.save();
  c.translate(0, bob);
  c.rotate(sway, 0, 0);
  c.scale(1.3, 1.3);
  c.drawPath(key, stroke(ART.goldDark, 3.4, 1, true));
  c.drawPath(key, strokeShaded(linear('keyGold', -5, -12, 5, 10, [[0, ART.goldLight, 1], [0.45, ART.gold, 1], [1, ART.goldDark, 1]]), 2.3));
  c.drawPath(hl, stroke(ART.goldLight, 0.7, 0.9, true));
  c.restore();
  const sp = (ph: number, ox: number, oy: number, sz: number) => {
    const k = Math.max(0, Math.sin(t * 0.0045 + ph));
    sparkle(c, ox, oy, sz * k * k, '#FFFFFF', 0.9);
  };
  sp(0, 7, -10 + bob, 1.1);
  sp(2.1, -8, 2 + bob, 0.9);
  sp(4.2, 5, 9 + bob, 0.7);
  c.restore();
}

/** Tiny gold twinkle above the darkness hinting where the key is. */
export function drawKeyGlint(c: SkCanvas, x: number, y: number, t: number) {
  const k = Math.max(0, Math.sin(t * 0.0024));
  if (k < 0.6) return;
  sparkle(c, x + 5, y - 6, (k - 0.6) * 6, ART.goldLight, 0.8);
}

const BOLT_D = 'M1.1,-4.6L-2.6,0.6H0L-1.1,4.6L2.6,-0.6H0Z';

/** Gold energy orb on a stone pedestal (sonar shard: +1 pulse). */
export function drawEnergyOrb(c: SkCanvas, x: number, y: number, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 0.005);
  c.save();
  c.translate(x, y);
  glow(c, G.gold(), 0, 0, 22 * pulse);
  c.drawCircle(1.5, 2.5, 11.5, fill('#000000', 0.5));
  c.drawCircle(0, 0, 11.5, fill(ART.stoneB));
  c.drawCircle(0, 0, 11.5, stroke(ART.stoneHighlight, 0.6));
  c.drawCircle(0, 0, 9.6, fill(ART.iron));
  c.save();
  c.rotate((t * 0.06) % 360, 0, 0);
  c.drawCircle(0, 0, 8.6, stroke(ART.gold, 0.9, 0.8, false, [3, 2.4]));
  c.restore();
  c.drawCircle(0, 0, 6.6, shaded(radialAt('orb', -1.1, -1.3, 8, [[0, '#FFF8DD', 1], [0.35, ART.gold, 1], [1, ART.goldDark, 1]]), 0.85 + 0.15 * pulse));
  const bolt = svgPath(BOLT_D)!;
  c.drawPath(bolt, fill('#FFFFFF'));
  c.drawPath(bolt, stroke(ART.goldDark, 0.4));
  c.restore();
}

/** Exit pad with climbing chevrons. Locked = dim + red padlock until the key is collected. */
export function drawExitPad(c: SkCanvas, x: number, y: number, size: number, t: number, locked: boolean) {
  const h = size / 2;
  const inner = size * 0.72;
  const ih = inner / 2;
  const breathe = 0.7 + 0.3 * Math.sin(t * 0.004);
  c.save();
  c.translate(x, y);
  if (!locked) glow(c, G.blue(), 0, 0, size * 1.05 * breathe);
  c.drawRRect(rrect(-h + 2, -h + 3, size, size, 2), fill('#000000', 0.5));
  c.drawRRect(rrect(-h, -h, size, size, 2), fill(ART.stoneB));
  c.drawRRect(rrect(-h, -h, size, size, 2), stroke(ART.stoneHighlight, 0.6));
  const mortar = stroke(ART.stoneMortar, 0.7);
  for (const yy of [-h + size * 0.33, h - size * 0.33]) {
    c.drawLine(-h + 2, yy, -ih, yy, mortar);
    c.drawLine(ih, yy, h - 2, yy, mortar);
  }
  if (locked) c.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), fill('#0A0F18'));
  else {
    c.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), shaded(radialAt(`exitPad${f(inner)}`, 0, 0, ih * 1.2, [[0, '#0E5AB8', 1], [1, ART.exitDeep, 1]])));
    c.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), stroke(ART.exitBlue, 3.5, 0.3 * breathe));
  }
  c.drawRRect(rrect(-ih, -ih, inner, inner, 1.5), stroke(locked ? '#7A2A35' : ART.exitCyan, 1.1, locked ? 0.8 : 0.9));
  for (let i = 0; i < 3; i++) {
    const cy = ih * 0.55 - i * ih * 0.5;
    const w = ih * 0.55;
    const p = svgPath(`M${f(-w)},${f(cy + w * 0.5)}L0,${f(cy - w * 0.15)}L${f(w)},${f(cy + w * 0.5)}`);
    if (!p) continue;
    const wave = locked ? 0.25 : 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * 0.006 - i * 0.9)), 2);
    if (!locked) c.drawPath(p, stroke(ART.exitBlue, 4.2, wave * 0.35, true));
    c.drawPath(p, stroke(locked ? '#3A4A5E' : ART.exitCyan, 2, locked ? 0.7 : 0.35 + wave * 0.65, true));
  }
  const rivet = fill(ART.ironLight);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) c.drawCircle(sx * (h - 2.5), sy * (h - 2.5), 1, rivet);
  if (locked) {
    const a = 0.75 + 0.25 * Math.sin(t * 0.005);
    const shackle = svgPath('M-2.4,-1V-3.2A2.4,2.4 0 0,1 2.4,-3.2V-1');
    if (shackle) c.drawPath(shackle, stroke(ART.wraithRed, 1.1, a));
    c.drawRRect(rrect(-3.4, -1.2, 6.8, 5.4, 1), fill(ART.wraithRed, a));
    c.drawCircle(0, 1.4, 0.9, fill('#2A0509', a));
  }
  c.restore();
}

/** Echo crystal cluster. Flares when struck by a pulse. */
export function drawCrystal(c: SkCanvas, x: number, y: number, t: number, hitAge: number) {
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.0035);
  const flare = hitAge >= 0 && hitAge < 700 ? 1 - hitAge / 700 : 0;
  c.save();
  c.translate(x, y);
  glow(c, G.cyan(), 0, 0, 18 * pulse + flare * 22);
  if (flare > 0) c.drawCircle(0, 0, 10 + (1 - flare) * 26, stroke(ART.cyan, 1.4, flare));
  c.drawOval(rect(-6, 2, 16, 6), fill('#000000', 0.45));
  const shard = (cx: number, cy: number, w: number, hgt: number, rot: number) => {
    c.save();
    c.translate(cx, cy);
    c.rotate(rot, 0, 0);
    const full = svgPath(`M0,${-hgt}L${w},0L0,${hgt * 0.55}L${-w},0Z`);
    const half = svgPath(`M0,${-hgt}L${w},0L0,${hgt * 0.55}Z`);
    if (full) c.drawPath(full, shaded(linear(`crys${w}${hgt}`, -w, -hgt, w, hgt * 0.55, [[0, '#FFFFFF', 1], [0.35, ART.cyan, 1], [1, '#14606B', 1]])));
    if (half) c.drawPath(half, fill('#062E35', 0.45));
    c.drawLine(0, -hgt, 0, hgt * 0.55, stroke('#FFFFFF', 0.4, 0.8));
    c.restore();
  };
  shard(-4.5, 2, 2.8, 7, -25);
  shard(4.6, 2.5, 2.6, 6, 22);
  shard(0, 0, 3.6, 10, 0);
  c.restore();
}

/** Cyan energy barrier (glass wall): sonar passes through, the bat does not. */
export function drawForceField(c: SkCanvas, x: number, y: number, w: number, h: number, t: number) {
  const vertical = h >= w;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const [x0, y0, x1, y1] = vertical ? [cx, y + 3, cx, y + h - 3] : [x + 3, cy, x + w - 3, cy];
  const fl = 0.8 + 0.2 * Math.sin(t * 0.02) * Math.sin(t * 0.0071);
  c.drawLine(x0, y0, x1, y1, stroke(ART.cyan, 10, 0.08 * fl, true));
  c.drawLine(x0, y0, x1, y1, stroke(ART.cyan, 5, 0.22 * fl, true));
  c.drawLine(x0, y0, x1, y1, stroke(ART.cyanSoft, 2.2, 0.95 * fl, true));
  c.drawLine(x0, y0, x1, y1, stroke('#FFFFFF', 1.2, 0.8, true, [5, 11], (t * 0.05) % 16));
  const caps = vertical ? [[cx, y + 2], [cx, y + h - 2]] : [[x + 2, cy], [x + w - 2, cy]];
  for (const [px, py] of caps) {
    c.drawRRect(rrect(px - 4, py - 4, 8, 8, 1.5), fill(ART.iron));
    c.drawRRect(rrect(px - 4, py - 4, 8, 8, 1.5), stroke(ART.ironLight, 0.6));
    c.drawCircle(px, py, 1.8, fill(ART.cyan, fl));
  }
}

/** Iron portcullis (resonance gate). Open = bars retracted. */
export function drawPortcullis(c: SkCanvas, x: number, y: number, w: number, h: number, open: boolean, t: number) {
  if (open) {
    c.drawRect(rect(x, y, w, h), stroke(ART.violet, 0.8, 0.5, false, [3, 3]));
    return;
  }
  const vertical = h >= w;
  const n = Math.max(3, Math.round((vertical ? h : w) / 6));
  const rune = 0.55 + 0.45 * Math.sin(t * 0.004);
  glow(c, G.violet(), x + w / 2, y + h / 2, Math.max(w, h) * 0.7, 0.5 * rune);
  c.drawRect(rect(x, y, w, h), fill('#0B0912'));
  const dark = stroke(ART.iron, 2);
  const lite = stroke(ART.ironLight, 0.5);
  for (let i = 0; i <= n; i++) {
    const o = i / n;
    if (vertical) {
      c.drawLine(x, y + o * h, x + w, y + o * h, dark);
      c.drawLine(x, y + o * h, x + w, y + o * h, lite);
    } else {
      c.drawLine(x + o * w, y, x + o * w, y + h, dark);
      c.drawLine(x + o * w, y, x + o * w, y + h, lite);
    }
  }
  c.drawRect(rect(x, y, w, h), stroke(ART.violet, 1.2, rune));
}

export function drawPressurePlate(c: SkCanvas, x: number, y: number, w: number, h: number, t: number, hitAge: number) {
  const pressed = hitAge >= 0 && hitAge < 600;
  const inset = pressed ? 2 : 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.3;
  c.drawRRect(rrect(x, y, w, h, 1.5), fill(ART.stoneSideDark));
  c.drawRRect(rrect(x + 1 + inset, y + 1 + inset, w - 2 - inset * 2, h - 2 - inset * 2, 1.5), fill(ART.stoneB));
  c.drawRRect(rrect(x + 1 + inset, y + 1 + inset, w - 2 - inset * 2, h - 2 - inset * 2, 1.5), stroke(ART.stoneHighlight, 0.5));
  c.drawCircle(cx, cy, r, stroke(pressed ? ART.wraithRed : '#8C8770', 0.9, pressed ? 1 : 0.6 + 0.2 * Math.sin(t * 0.003)));
  const cross = stroke('#8C8770', 0.6, 0.6);
  c.drawLine(cx, cy - r, cx, cy + r, cross);
  c.drawLine(cx - r, cy, cx + r, cy, cross);
}

/** Spiked crusher block (moving wall). */
export function drawSpikeBlock(c: SkCanvas, x: number, y: number, w: number, h: number) {
  const step = 7;
  const cols = Math.max(1, Math.floor((w - 2) / step));
  const rows = Math.max(1, Math.floor((h - 2) / step));
  const ox = x + (w - cols * step) / 2 + step / 2;
  const oy = y + (h - rows * step) / 2 + step / 2;
  c.drawRRect(rrect(x + 2, y + 3, w, h, 1.5), fill('#000000', 0.5));
  c.drawRRect(rrect(x, y, w, h, 1.5), fill(ART.woodDark));
  c.drawRRect(rrect(x, y, w, h, 1.5), stroke(ART.wraithRed, 0.8, 0.5));
  const spike = radialAt('spike', -0.6, -0.6, 3.6, [[0, '#E3E7EA', 1], [0.45, '#7B848D', 1], [1, '#1C1F23', 1]]);
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      const sx = ox + cc * step;
      const sy = oy + r * step;
      c.drawCircle(sx + 0.8, sy + 1.2, 2.9, fill('#000000', 0.55));
      c.save();
      c.translate(sx, sy);
      c.drawCircle(0, 0, 2.9, shaded(spike));
      c.restore();
      c.drawCircle(sx - 0.5, sy - 0.6, 0.55, fill('#FFFFFF', 0.9));
    }
  }
}

/** Dark water pit (chasm): caustics, ripples and glints. */
export function drawWaterPool(c: SkCanvas, x: number, y: number, w: number, h: number, t: number, seed: number) {
  c.drawRRect(rrect(x - 3, y - 3, w + 6, h + 6, 3), fill(ART.stoneSide));
  c.drawRRect(rrect(x - 2, y - 2, w + 4, h + 4, 2.5), stroke(ART.stoneA, 1.4));
  c.drawRRect(
    rrect(x, y, w, h, 2),
    shaded(radialAt(`water${f(x)}${f(y)}`, x + w / 2, y + h * 0.45, Math.max(w, h) * 0.75, [[0, ART.waterDeep, 1], [0.55, ART.water, 1], [1, ART.waterMid, 1]]))
  );
  c.drawRRect(rrect(x, y, w, 5, 2), fill('#000000', 0.35));
  const nLines = Math.max(3, Math.round(h / 7));
  for (let i = 0; i < nLines; i++) {
    const baseY = y + 3 + ((i + 0.5) / nLines) * (h - 6);
    let d = '';
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      const px = x + 3 + (s / steps) * (w - 6);
      const py = baseY + Math.sin(px * 0.22 + t * 0.0024 + i * 1.7 + seed) * 1.4 + Math.sin(px * 0.09 - t * 0.0016 + i) * 1.0;
      d += `${s === 0 ? 'M' : 'L'}${f(px)},${f(py)}`;
    }
    const wave = svgPathOnce(d);
    if (wave) c.drawPath(wave, stroke(ART.waterLight, 0.8, 0.12 + 0.12 * Math.sin(t * 0.002 + i * 2.1)));
  }
  const ripple = (ph: number, rx: number, ry: number) => {
    const k = (((t * 0.00045 + ph) % 1) + 1) % 1;
    const r = 2 + k * Math.min(w, h) * 0.32;
    c.drawOval(rect(x + rx * w - r, y + ry * h - r * 0.75, r * 2, r * 1.5), stroke(ART.waterLight, 0.7, (1 - k) * 0.5));
  };
  ripple(seed % 1, 0.3, 0.35);
  ripple((seed + 0.5) % 1, 0.68, 0.66);
  const glint = (ph: number, gx: number, gy: number) => {
    const k = Math.max(0, Math.sin(t * 0.003 + ph));
    if (k > 0.02) c.drawCircle(x + gx * w, y + gy * h, 0.4 + k * 0.9, fill('#FFFFFF', k * 0.8));
  };
  glint(seed, 0.22, 0.7);
  glint(seed + 2, 0.75, 0.28);
  glint(seed + 4, 0.5, 0.5);
  c.drawRRect(rrect(x + 0.5, y + 0.5, w - 1, h - 1, 2), stroke(ART.waterLight, 0.6, 0.3 + 0.1 * Math.sin(t * 0.003)));
}

export { circleD, beginAlpha };
export type { SkPath };
