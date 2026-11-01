import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { THEME, HQ } from '../theme';
import { fill, stroke, shaded, svgPath, svgPathOnce, mix, linearNow, radialAt, radial, additive, rect, linear, beginAlpha, glow } from '../sk';
import { SkinDef, skinOf } from '../../../skins/skins';
import { circleD } from '../../art/kit';

/**
 * Animated bat rig (player + wraith).
 *
 * Each wing is a real skeleton — shoulder, elbow, wrist, four fingers + thumb — that
 * rotates around the body's long axis and is projected in perspective, so a raised wing
 * reads larger and a lowered one smaller. The downstroke is fast and reaching, the
 * upstroke slow with the elbow flexing, fingers folding and the wing sweeping back.
 * Membrane panels are shaded individually from their angle to the light; ears, head,
 * tail and feet ride on springs for natural overshoot.
 */

type P2 = [number, number];
const DEG = Math.PI / 180;
const F = 46; // perspective distance (local units)

export interface BatReactions {
  /** 0..1, 1 = sonar just fired */
  pingK: number;
  /** 0..1, 1 = just bumped a wall */
  bumpK: number;
  /** 0..1, 1 = just picked something up */
  pickupK: number;
  /** 0..1 how close/active the nearest threat is */
  fear: number;
}

export interface BatInput {
  key: object | string;
  x: number;
  y: number;
  /** heading in degrees, 0 = up the screen */
  deg: number;
  /** overall scale (1 ≈ 14px-radius bat) */
  k: number;
  /** wingbeat phase (radians) */
  phase: number;
  t: number;
  variant: 'player' | 'wraith';
  frenzy?: boolean;
  bank?: number;
  amp?: number;
  glide?: number;
  /** 0..1 travel speed */
  speed?: number;
  react?: BatReactions;
  /** player skin (ignored for wraiths) */
  skin?: SkinDef;
}

// ─── per-bat spring + trail state ───────────────────────────
interface Rig {
  last: number;
  ear: number;
  earV: number;
  tail: number;
  tailV: number;
  head: number;
  headV: number;
  trailL: P2[];
  trailR: P2[];
  parts: Particle[];
  emit: number;
  arcAt: number;
  arc: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
  k: number;
}
const rigs = new WeakMap<object, Rig>();
const namedRigs = new Map<string, Rig>();
function rigFor(key: object | string, t: number): Rig {
  const make = (): Rig => ({ last: t, ear: 0, earV: 0, tail: 0, tailV: 0, head: 0, headV: 0, trailL: [], trailR: [], parts: [], emit: 0, arcAt: 0, arc: '' });
  if (typeof key === 'string') {
    let r = namedRigs.get(key);
    if (!r) namedRigs.set(key, (r = make()));
    return r;
  }
  let r = rigs.get(key);
  if (!r) rigs.set(key, (r = make()));
  return r;
}
const spring = (pos: number, vel: number, target: number, k: number, d: number, dt: number): [number, number] => {
  const v = vel + ((target - pos) * k - vel * d) * dt;
  return [pos + v * dt, v];
};

// ─── wingbeat kinematics ────────────────────────────────────
interface Beat {
  /** elevation of the wing above horizontal (deg): + up toward the camera */
  theta: number;
  fold: number;
  sweep: number;
  /** 0..1 how deep into the upstroke (wing turned edge-on) */
  up: number;
  /** -1..1 body lift (higher on the downstroke) */
  lift: number;
}

function beat(phase: number, amp: number, glide: number, t: number): Beat {
  const p = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const DOWN = 0.4; // downstroke takes 40% of the cycle
  const down = p < DOWN;
  const w = down ? 0.5 * (p / DOWN) : 0.5 + 0.5 * ((p - DOWN) / (1 - DOWN));
  // ease so the wing lingers at the top and snaps through the bottom
  let theta = 8 + 60 * Math.cos(Math.PI * 2 * w);
  const upK = down ? 0 : Math.sin(Math.PI * ((p - DOWN) / (1 - DOWN)));
  let fold = down ? 0.04 : 0.62 * upK;
  let sweep = down ? -11 * Math.sin(Math.PI * (p / DOWN)) : 22 * upK;
  const lift = -Math.sin(Math.PI * 2 * (p - 0.08));
  theta = 8 + (theta - 8) * amp;
  fold *= amp;
  sweep *= amp;
  // gliding: wings held out flat with a slight tremble
  const g = glide;
  theta += (3 + 2.5 * Math.sin(t * 0.005) - theta) * g;
  fold *= 1 - g;
  sweep += (5 - sweep) * g;
  return { theta, fold, sweep, up: upK * amp * (1 - g), lift: lift * amp * (1 - g) };
}

// ─── wing geometry ──────────────────────────────────────────
const S: P2 = [2.4, -3.0]; // shoulder (body frame)
const E0: P2 = [4.6, 0.8]; // elbow (u = outward, v = rearward) relative to shoulder
const W0: P2 = [12.0, -2.4]; // wrist
const TIPS: P2[] = [
  [9.0, -1.6], // digit 2 — leading edge
  [12.6, 2.2], // digit 3 — wingtip
  [9.0, 7.8], // digit 4
  [3.8, 10.2], // digit 5
];
const FOLD_BACK = [24, 34, 40, 32];
const ANKLE: P2 = [2.2, 7.0]; // membrane meets the leg (body frame, not on the wing plane)

const rotUV = (p: P2, a: number): P2 => {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const scl = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

interface WingGeo {
  S: P2;
  E: P2;
  W: P2;
  D: P2[];
  TH: P2;
  H: P2;
  lead: P2;
  /** u-depth of the wingtip toward the camera (for shading) */
  z: number;
}

/** Projects the right wing (mirror x for the left) for one pose. */
function wingGeo(theta: number, fold: number, sweep: number, span: number): WingGeo {
  const Wf = add(E0, rotUV(sub(W0, E0), 40 * fold));
  const tips = TIPS.map((tp, i) => add(Wf, scl(rotUV(tp, FOLD_BACK[i] * fold), 1 - 0.32 * fold)));
  const thumb = add(Wf, [1.0, -2.2]);
  const lead: P2 = [Wf[0] * 0.5, Wf[1] * 0.5 - 2.2];
  const swept = (p: P2) => rotUV(p, sweep);
  const th = theta * DEG;
  const proj = (uv: P2): [number, number, number] => {
    const u = uv[0] * span;
    const X = S[0] + u * Math.cos(th);
    const Z = u * Math.sin(th);
    const Y = S[1] + uv[1];
    const k = F / (F - Z);
    return [X * k, Y * k, Z];
  };
  const p2 = (uv: P2): P2 => {
    const r = proj(swept(uv));
    return [r[0], r[1]];
  };
  const tip = proj(swept(tips[1]));
  return {
    S,
    E: p2(E0),
    W: p2(Wf),
    D: tips.map(p2),
    TH: p2(thumb),
    H: ANKLE,
    lead: p2(lead),
    z: tip[2],
  };
}

const n1 = (v: number) => v.toFixed(1);

function wingPaths(g: WingGeo, side: 1 | -1, sag: number) {
  const X = (p: P2) => `${n1(p[0] * side)},${n1(p[1])}`;
  const scallop = (a: P2, b: P2, toward: P2, amt: number): P2 => {
    const m = lerp2(a, b, 0.5);
    return lerp2(m, toward, amt);
  };
  const [D2, D3, D4, D5] = g.D;
  const c23 = scallop(D2, D3, g.W, sag * 0.8);
  const c34 = scallop(D3, D4, g.W, sag);
  const c45 = scallop(D4, D5, g.W, sag * 1.05);
  const c5H = scallop(D5, g.H, [0, 2], sag * 1.1);
  const panels = [
    `M${X(g.S)}Q${X(g.lead)} ${X(g.W)}L${X(g.E)}Z`, // leading-edge membrane
    `M${X(g.W)}L${X(D2)}Q${X(c23)} ${X(D3)}Z`,
    `M${X(g.W)}L${X(D3)}Q${X(c34)} ${X(D4)}Z`,
    `M${X(g.W)}L${X(D4)}Q${X(c45)} ${X(D5)}Z`,
    `M${X(g.S)}L${X(g.E)}L${X(g.W)}L${X(D5)}Q${X(c5H)} ${X(g.H)}L${X([g.S[0] - 0.4, g.S[1] + 5])}Z`, // arm wing
  ];
  const outline = `M${X(g.S)}Q${X(g.lead)} ${X(g.W)}L${X(D2)}Q${X(c23)} ${X(D3)}Q${X(c34)} ${X(D4)}Q${X(c45)} ${X(D5)}Q${X(c5H)} ${X(g.H)}L${X([g.S[0] - 0.4, g.S[1] + 5])}Z`;
  // veins: from along each finger toward the sagging edge, and fanning from the forearm
  let veins = '';
  const vein = (a: P2, b: P2) => (veins += `M${X(a)}L${X(b)}`);
  vein(lerp2(g.W, D2, 0.55), lerp2(c23, g.W, 0.35));
  vein(lerp2(g.W, D3, 0.5), lerp2(c34, g.W, 0.3));
  vein(lerp2(g.W, D4, 0.5), lerp2(c45, g.W, 0.3));
  for (const k of [0.3, 0.6, 0.9]) vein(lerp2(g.E, g.W, k), lerp2(lerp2(D5, g.H, k * 0.9), g.W, 0.22));
  const arm = `M${X(g.S)}L${X(g.E)}L${X(g.W)}`;
  const fingers = g.D.map((d) => `M${X(g.W)}L${X(d)}`).join('');
  const thumb = `M${X(g.W)}L${X(g.TH)}q${n1(0.7 * side)},-0.5 ${n1(1.1 * side)},0.5`;
  const knuckles = g.D.map((d) => lerp2(g.W, d, 0.55));
  return { panels, outline, veins, arm, fingers, thumb, knuckles, edgeMids: [c23, c34, c45, c5H] };
}

// ─── static body art ────────────────────────────────────────
const BODY_D = 'M0,-3C3,-3 4.2,-0.4 4,2.6C3.8,5.8 2.1,8.4 0,9C-2.1,8.4 -3.8,5.8 -4,2.6C-4.2,-0.4 -3,-3 0,-3Z';
const HEAD_D = 'M0,-10.6C2.5,-10.6 3.7,-8.8 3.7,-6.8C3.7,-4.6 2.2,-3.1 0,-3.1C-2.2,-3.1 -3.7,-4.6 -3.7,-6.8C-3.7,-8.8 -2.5,-10.6 0,-10.6Z';
const MUZZLE_D = 'M-1.6,-9.6Q0,-12.2 1.6,-9.6Q0,-8.8 -1.6,-9.6Z';
const EAR_D = 'M0,0Q1.4,-3.8 3.1,-5.9Q4.4,-4.7 3.1,-0.5Z'; // local to ear base, right side
const EAR_IN_D = 'M0.7,-0.6Q1.7,-3.4 2.8,-4.7Q3.5,-3.7 2.6,-1Z';
const EAR_RIDGES_D = 'M1.2,-1.4L2.5,-3.6M1.6,-0.9L3,-2.6';

const FUR_D = (() => {
  // short fur strokes over the back, flowing tail-ward
  let d = '';
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) {
    const y = -2.4 + r() * 10.6;
    const halfW = 3.9 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y + 3) / 12)));
    const x = (r() * 2 - 1) * halfW * 0.92;
    const len = 0.9 + r() * 0.9;
    const ang = Math.PI / 2 + x * 0.12 + (r() - 0.5) * 0.5;
    d += `M${n1(x)},${n1(y)}l${n1(Math.cos(ang) * len)},${n1(Math.sin(ang) * len)}`;
  }
  return d;
})();
const FUR_HEAD_D = 'M-1.6,-8.8l0.2,1.2M0,-9.2v1.2M1.6,-8.8l-0.2,1.2M-2.4,-7l0.5,1M2.4,-7l-0.5,1M-0.9,-6.2l0.1,1M0.9,-6.2l-0.1,1';

// ─── palettes ────────────────────────────────────────────────
const PAL = {
  player: {
    earOuter: '#4A3530',
    muzzle: '#6A4E40',
    legs: '#2A1C18',
    furLine: '#2A1C18',
    pupil: '#1A0F0A',
    dark: '#1E130E',
    mid: '#563A2F',
    lit: '#B07E66',
    edge: '#E0A07A',
    bone: '#9A7A66',
    fur: '#6E5040',
    furHi: '#A8846C',
    body: '#3B2A24',
    head: '#4E3A31',
    earIn: '#C08478',
    rim: THEME.sonarInner,
    eye: '#FFE9C4',
    eyeGlow: '#FFB547',
  },
  wraith: {
    earOuter: '#3D0810',
    muzzle: '#2A0509',
    legs: '#5A0D18',
    furLine: '#1A0206',
    pupil: '#7A0010',
    dark: '#140106',
    mid: '#3E0812',
    lit: '#A3203A',
    edge: '#FF4D6A',
    bone: '#B3263A',
    fur: '#3A0710',
    furHi: '#6A1220',
    body: '#22040A',
    head: '#300810',
    earIn: '#FF1744',
    rim: THEME.enemyRim,
    eye: '#FFD6DA',
    eyeGlow: '#FF1744',
  },
};

type Pal = typeof PAL.player;
const DEFAULT_SKIN = skinOf('dusk');
/** Palette for one bat: wraiths are always crimson, the player wears its skin. */
function palOf(variant: 'player' | 'wraith', skin: SkinDef): Pal {
  return variant === 'wraith' ? PAL.wraith : { ...skin.pal };
}
/** Cache key for everything recorded per look. */
const lookKey = (variant: 'player' | 'wraith', skin: SkinDef) => (variant === 'wraith' ? 'wraith' : `p:${skin.id}`);

const linearFixed = (variant: 'player' | 'wraith', skin: SkinDef) => {
  const pal = palOf(variant, skin);
  return linear(`tail|${lookKey(variant, skin)}`, 0, 6, 0, 15, [
    [0, pal.mid, 1],
    [1, pal.lit, 0.9],
  ]);
};

// ─── Performance: pre-recorded pictures ─────────────────────
// Wings are recorded once per quantised pose (32 steps per wingbeat × bank × glide × amp)
// and replayed with a single drawPicture call. Body, head and ears are static pictures.
interface WingPic {
  wings: SkPicture;
  /** additive skin pattern drawn live with a pulsing alpha (null = none) */
  glow: SkPicture | null;
  shadow: SkPicture;
  tipR: P2;
  tipL: P2;
  lift: number;
}
const wingCache = new Map<string, WingPic>();
const staticCache = new Map<string, SkPicture>();
const PIC_BOUNDS = () => rect(-40, -40, 80, 80);

function record(draw: (c: SkCanvas) => void): SkPicture {
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(PIC_BOUNDS());
  draw(c);
  return rec.finishRecordingAsPicture();
}

function wingPicture(variant: 'player' | 'wraith', skin: SkinDef, phase: number, amp: number, glide: number, bank: number): WingPic {
  const PH = 32;
  const p01 = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const pq = Math.round(p01 * PH) % PH;
  const aq = Math.round(amp * 10) / 10;
  const gq = Math.round(glide * 4) / 4;
  const bq = Math.round(bank * 4) / 4;
  const key = `${lookKey(variant, skin)}|${pq}|${aq}|${gq}|${bq}`;
  const hit = wingCache.get(key);
  if (hit) return hit;

  const isW = variant === 'wraith';
  const pal = palOf(variant, skin);
  const fx = skin.fx;
  const B = beat((pq / PH) * Math.PI * 2, aq, gq, 0);
  const sag = 0.18 + 0.1 * B.up;
  const spanR = 1 - 0.3 * Math.max(0, bq) + 0.06 * Math.max(0, -bq);
  const spanL = 1 - 0.3 * Math.max(0, -bq) + 0.06 * Math.max(0, bq);
  const thR = B.theta - bq * 16;
  const thL = B.theta + bq * 16;
  const gR = wingGeo(thR, B.fold, B.sweep, spanR);
  const gL = wingGeo(thL, B.fold, B.sweep, spanL);
  const wR = wingPaths(gR, 1, sag);
  const wL = wingPaths(gL, -1, sag);
  const outline = svgPathOnce(wR.outline + wL.outline);

  const wings = record((c) => {
    if (isW && outline) {
      // crimson rim glow without a blur: wide faint + narrow brighter additive strokes
      c.drawPath(outline, additive(stroke(THEME.enemyRim, 4.2, 0.18, true)));
      c.drawPath(outline, additive(stroke(THEME.enemyRim, 2.2, 0.35, true)));
    }
    const drawWing = (wp: ReturnType<typeof wingPaths>, g: WingGeo, theta: number, side: 1 | -1) => {
      const th = theta * DEG;
      const facing = Math.max(0, side * 0.45 * Math.sin(th) + 0.74 * Math.cos(th)); // n·L
      const base = facing * (1 - 0.38 * B.up);
      wp.panels.forEach((d, i) => {
        const p = svgPathOnce(d);
        if (!p) return;
        const L = Math.min(1.1, base + (i >= 1 && i <= 3 ? 0.05 * i : 0));
        const from = i === 4 ? g.S : g.W;
        const to = i === 0 ? g.lead : i === 4 ? lerp2(g.D[3], g.H, 0.5) : wp.edgeMids[i - 1];
        c.drawPath(
          p,
          shaded(
            linearNow(from[0] * side, from[1], to[0] * side, to[1], [
              mix(pal.dark, pal.mid, L * 0.85),
              mix(pal.mid, pal.lit, L * 0.9),
              mix(pal.lit, pal.edge, 0.55, 0.55 + 0.6 * L),
            ], [0, 0.7, 1]),
            0.96
          )
        );
      });
      const veins = svgPathOnce(wp.veins);
      if (veins) c.drawPath(veins, stroke(pal.bone, 0.28, 0.32 + 0.2 * base, true));
      const arm = svgPathOnce(wp.arm);
      if (arm) {
        c.drawPath(arm, stroke('#000000', 1.9, 0.35, true));
        c.drawPath(arm, stroke(pal.bone, 1.25, 0.95, true));
        c.drawPath(arm, stroke('#FFFFFF', 0.4, 0.18 + 0.25 * base, true));
      }
      const fingers = svgPathOnce(wp.fingers);
      if (fingers) c.drawPath(fingers, stroke(pal.bone, 0.62, 0.9, true));
      const thumb = svgPathOnce(wp.thumb);
      if (thumb) c.drawPath(thumb, stroke(isW ? '#FFB3BF' : '#D9C4B2', 0.7, 0.95, true));
      c.drawCircle(g.E[0] * side, g.E[1], 0.75, fill(pal.bone));
      c.drawCircle(g.W[0] * side, g.W[1], 0.85, fill(pal.bone));
      for (const kn of wp.knuckles) c.drawCircle(kn[0] * side, kn[1], 0.42, fill(pal.bone, 0.9));
    };
    drawWing(wR, gR, thR, 1);
    drawWing(wL, gL, thL, -1);
    if (!isW && outline && B.theta < 0) {
      c.drawPath(outline, additive(fill(fx.aura, Math.min(0.16, -Math.sin(B.theta * DEG) * 0.2))));
    }
    if (!isW && fx.pattern !== 'none') {
      wingPattern(c, skin, wR, gR, 1, 0.38, false);
      wingPattern(c, skin, wL, gL, -1, 0.38, false);
    }
    const plain = skin.id === 'dusk';
    if (outline) c.drawPath(outline, stroke(isW ? THEME.enemyRim : plain ? '#CFE9FF' : pal.edge, isW ? 0.9 : 0.45, isW ? 0.85 : plain ? 0.28 : 0.5, true));
  });
  const glowPic =
    !isW && fx.pattern !== 'none'
      ? record((c) => {
          if (outline && (fx.pattern === 'umbra' || fx.pattern === 'ember' || fx.pattern === 'royal')) c.drawPath(outline, additive(stroke(fx.glow, 1.6, 0.35, true)));
          wingPattern(c, skin, wR, gR, 1, 1, true);
          wingPattern(c, skin, wL, gL, -1, 1, true);
        })
      : null;

  // soft-ish floor shadow without a blur: solid core + faint wider edge
  const shadowPath = svgPathOnce(wR.outline + wL.outline + BODY_D + HEAD_D);
  const shadow = record((c) => {
    if (!shadowPath) return;
    c.drawPath(shadowPath, stroke('#000000', 2.2, 0.12, true));
    c.drawPath(shadowPath, fill('#000000', 0.34));
  });

  const entry: WingPic = { wings, glow: glowPic, shadow, tipR: gR.D[1], tipL: [-gL.D[1][0], gL.D[1][1]], lift: B.lift };
  if (wingCache.size > 500) {
    const first = wingCache.keys().next().value;
    if (first !== undefined) wingCache.delete(first);
  }
  wingCache.set(key, entry);
  return entry;
}

function staticPic(key: string, draw: (c: SkCanvas) => void): SkPicture {
  let p = staticCache.get(key);
  if (!p) {
    p = record(draw);
    staticCache.set(key, p);
  }
  return p;
}

function bodyPicture(variant: 'player' | 'wraith', skin: SkinDef) {
  const isW = variant === 'wraith';
  const pal = palOf(variant, skin);
  const lk = lookKey(variant, skin);
  return staticPic(`body|${lk}`, (c) => {
    const body = svgPath(BODY_D)!;
    c.drawPath(body, shaded(radialAt(`body3|${lk}`, -1, 0.2, 8, [[0, pal.furHi, 1], [0.55, pal.fur, 1], [1, pal.body, 1]])));
    c.drawLine(0, -2.4, 0, 8, stroke('#000000', 1.6, 0.2, true));
    const fur = svgPath(FUR_D)!;
    c.drawPath(fur, stroke(pal.furLine, 0.5, 0.55, true));
    c.save();
    c.translate(-0.25, -0.25);
    c.drawPath(fur, stroke(pal.furHi, 0.32, 0.55, true));
    c.restore();
    c.drawOval(rect(-3.9, -3.8, 3.2, 2.4), fill(pal.furHi, 0.28));
    c.drawOval(rect(0.7, -3.8, 3.2, 2.4), fill(pal.furHi, 0.28));
    c.drawPath(body, stroke(isW ? THEME.enemyRim : pal.rim, isW ? 0.6 : 0.4, isW ? 0.75 : 0.25));
  });
}

function headPicture(variant: 'player' | 'wraith', skin: SkinDef) {
  const isW = variant === 'wraith';
  const pal = palOf(variant, skin);
  const lk = lookKey(variant, skin);
  return staticPic(`head|${lk}`, (c) => {
    const head = svgPath(HEAD_D)!;
    if (!isW) drawCrest(c, skin, true);
    c.drawPath(head, shaded(radialAt(`head|${lk}`, -0.8, -7.8, 5, [[0, pal.furHi, 1], [1, pal.head, 1]])));
    c.drawPath(svgPath(FUR_HEAD_D)!, stroke(pal.furLine, 0.35, 0.5, true));
    c.drawPath(head, stroke(isW ? THEME.enemyRim : skin.id === 'dusk' ? '#22160F' : pal.furLine, 0.4, isW ? 0.8 : 0.55));
    c.drawPath(svgPath(MUZZLE_D)!, fill(pal.muzzle));
    c.drawCircle(-0.5, -10.4, 0.28, fill('#140C0A'));
    c.drawCircle(0.5, -10.4, 0.28, fill('#140C0A'));
    if (!isW) drawCrest(c, skin, false);
  });
}

function earPicture(variant: 'player' | 'wraith', skin: SkinDef) {
  const isW = variant === 'wraith';
  const pal = palOf(variant, skin);
  return staticPic(`ear|${lookKey(variant, skin)}`, (c) => {
    const ear = svgPath(EAR_D)!;
    c.drawPath(ear, fill(pal.earOuter));
    c.drawPath(svgPath(EAR_IN_D)!, fill(pal.earIn, isW ? 0.6 : 0.85));
    c.drawPath(svgPath(EAR_RIDGES_D)!, stroke(pal.furLine, 0.3, 0.6, true));
    c.drawPath(ear, stroke(isW ? THEME.enemyRim : pal.muzzle, 0.4, 0.9));
    if (!isW && skin.fx.crest === 'icicles') {
      // frosted ear tips
      const tip = svgPath('M2.4,-4.6L3.1,-5.9L3.8,-4.8Z');
      if (tip) c.drawPath(tip, fill('#FFFFFF', 0.95));
    }
    if (!isW && skin.fx.pattern === 'ember') c.drawPath(ear, additive(stroke(skin.fx.glow, 0.5, 0.6)));
  });
}

/** Draws one bat. All state (springs, trails) is keyed by `input.key`. */
export function drawBatRig(c: SkCanvas, input: BatInput) {
  const { x, y, deg, k, phase, t, variant } = input;
  const isW = variant === 'wraith';
  const skin = isW ? DEFAULT_SKIN : input.skin ?? DEFAULT_SKIN;
  const pal = palOf(variant, skin);
  const fancy = !isW && skin.id !== 'dusk';
  const R = input.react ?? { pingK: 0, bumpK: 0, pickupK: 0, fear: 0 };
  const bank = Math.max(-1, Math.min(1, input.bank ?? 0));
  const speed = input.speed ?? 0;
  const rig = rigFor(input.key, t);
  const dt = Math.min(0.05, Math.max(0, (t - rig.last) / 1000));
  rig.last = t;

  // springs: ears (perk on ping, pin back on fear), tail (lags turns), head (looks into turns / idles)
  const earTarget = -4 - 18 * R.pingK + 28 * R.fear;
  [rig.ear, rig.earV] = spring(rig.ear, rig.earV, earTarget, 140, 12, dt);
  [rig.tail, rig.tailV] = spring(rig.tail, rig.tailV, -bank * 3 + Math.sin(phase) * 0.5, 90, 9, dt);
  const idleLook = speed < 0.08 ? Math.sin(t * 0.0013) * 16 + Math.sin(t * 0.0031) * 5 : 0;
  [rig.head, rig.headV] = spring(rig.head, rig.headV, bank * 14 + idleLook, 70, 12, dt);

  const amp = Math.min(1.3, (input.amp ?? 1) * (1 + 0.45 * R.pingK));
  const W = wingPicture(variant, skin, phase, amp, input.glide ?? 0, bank);
  const alt = W.lift;

  const squashX = 1 + 0.16 * R.bumpK;
  const squashY = 1 - 0.13 * R.bumpK;
  const shake = R.bumpK > 0 ? Math.sin(t * 0.09) * 0.8 * R.bumpK : 0;

  // ── wingtip trails (fast flight / frenzy) ──
  const rad = deg * DEG;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);
  const toWorld = (p: P2): P2 => [x + (p[0] * cs - p[1] * sn) * k, y + (p[0] * sn + p[1] * cs) * k];
  const trailing = speed > 0.45 || !!input.frenzy;
  const pushTrail = (arr: P2[], p: P2) => {
    if (trailing) arr.push(p);
    if (arr.length > (trailing ? 7 : 0) || (!trailing && arr.length)) arr.shift();
  };
  pushTrail(rig.trailR, toWorld(W.tipR));
  pushTrail(rig.trailL, toWorld(W.tipL));
  if (HQ && trailing) {
    const col = isW ? '#FF4D6A' : skin.fx.trail;
    for (const tr of [rig.trailL, rig.trailR]) {
      for (let i = 1; i < tr.length; i++) {
        if (Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]) > 9 * k) continue;
        c.drawLine(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1], additive(stroke(col, 0.4 + (i / tr.length) * 1.4, (i / tr.length) * 0.28, true)));
      }
    }
  }

  // ── floor shadow (one picture) ──
  c.save();
  c.translate(x + 5 * k * (1 + 0.12 * alt), y + 9 * k * (1 + 0.12 * alt));
  c.rotate(deg, 0, 0);
  c.scale(k * (0.88 - 0.04 * alt), k * (0.88 - 0.04 * alt));
  c.drawPicture(W.shadow);
  c.restore();

  // ── skin halo behind the bat ──
  if (fancy && skin.fx.halo !== 'none') drawHalo(c, skin, x, y - 0.9 * k * alt, k, t);

  c.save();
  c.translate(x + shake, y - 0.9 * k * alt);
  c.rotate(deg, 0, 0);
  c.scale(k, k);

  // ── wings (one picture) + the skin's glowing pattern, pulsing live ──
  c.drawPicture(W.wings);
  if (W.glow) {
    beginAlpha(c, patternPulse(skin, t));
    c.drawPicture(W.glow);
    c.restore();
  }

  // ── body: tail + legs live (they lag on a spring), torso is a picture ──
  c.save();
  c.scale(squashX, squashY);
  const tx = Math.round(rig.tail * 5) / 5; // quantised → cached paths
  const tail = svgPath(`M-2.6,6Q-2.6,10.4 -2.2,11.2Q${n1(tx)},14.2 ${n1(tx)},14.9Q${n1(tx)},14.2 2.2,11.2Q2.6,10.4 2.6,6Z`);
  if (tail) {
    c.drawPath(tail, shaded(linearFixed(variant, skin)));
    c.drawPath(tail, stroke(pal.bone, 0.35, 0.6));
  }
  c.drawLine(0, 7, tx, 14.6, stroke(pal.bone, 0.45, 0.8, true));
  const legs = svgPath(`M-2.2,6.2L-3,8.4L${n1(-2.6 + tx * 0.3)},11l-0.7,0.8M${n1(-2.6 + tx * 0.3)},11l0.3,1M2.2,6.2L3,8.4L${n1(2.6 + tx * 0.3)},11l0.7,0.8M${n1(2.6 + tx * 0.3)},11l-0.3,1`);
  if (legs) c.drawPath(legs, stroke(pal.legs, 0.7, 1, true));
  c.drawPicture(bodyPicture(variant, skin));
  c.restore();

  // ── head (jolts forward on a ping, turns on a spring) ──
  c.save();
  c.translate(0, -1.1 * R.pingK);
  c.rotate(rig.head, 0, -3.2);
  const ear = earPicture(variant, skin);
  for (const side of [1, -1] as const) {
    c.save();
    c.translate(1.5 * side, -8.6);
    c.scale(side, 1);
    c.rotate(rig.ear + bank * 6 * side, 0, 0);
    c.drawPicture(ear);
    c.restore();
  }
  c.drawPicture(headPicture(variant, skin));
  if (R.pingK > 0.05) {
    c.drawOval(rect(-1.3 * R.pingK, -11.6, 2.6 * R.pingK, 1.8 * R.pingK), fill('#0A0406'));
    c.drawCircle(-0.6 * R.pingK, -11.3, 0.22, fill('#FFFFFF', R.pingK));
    c.drawCircle(0.6 * R.pingK, -11.3, 0.22, fill('#FFFFFF', R.pingK));
  }
  // eyes: widen with fear, squint on a bump, blink now and then, glint gold on pickup
  const pulse = 0.75 + 0.25 * Math.sin(t * (input.frenzy ? 0.03 : 0.008));
  const blink = t % 3400 < 110;
  const eyeR = (isW ? 1.25 : 1.05) * (1 + 0.35 * R.fear);
  const squint = 1 - 0.75 * R.bumpK;
  for (const side of [-1, 1]) {
    const ex = 1.4 * side;
    const ey = -7.4;
    c.drawCircle(ex, ey, eyeR * 1.7, fill(pal.eyeGlow, isW ? 0.5 * pulse : 0.25 + 0.4 * R.pickupK));
    if (blink || squint < 0.3) {
      c.drawLine(ex - eyeR, ey, ex + eyeR, ey, stroke('#1A0F0A', 0.5, 1, true));
    } else {
      c.drawCircle(ex, ey, eyeR, fill(R.pickupK > 0.3 ? '#FFE08A' : pal.eye));
      c.drawCircle(ex + 0.1, ey - 0.1 * squint, eyeR * 0.5, fill(pal.pupil));
      c.drawCircle(ex - 0.35, ey - 0.4 * squint, eyeR * 0.22, fill('#FFFFFF', 0.95));
    }
  }
  if (R.pingK > 0.02) {
    for (let i = 0; i < 3; i++) {
      const r = Math.round((2 + i * 2.2 + (1 - R.pingK) * 7) * 2) / 2;
      const arc = svgPath(`M${n1(-r * 0.7)},${n1(-11.8 - r * 0.7)}Q0,${n1(-11.8 - r * 1.15)} ${n1(r * 0.7)},${n1(-11.8 - r * 0.7)}`);
      if (arc) c.drawPath(arc, additive(stroke(isW ? THEME.sonarInner : skin.fx.glow, 0.9, R.pingK * (1 - i * 0.25), true)));
    }
  }
  c.restore(); // head
  c.restore(); // bat

  // ── skin particles + crackling arcs (world space) ──
  if (fancy) {
    const tipR = toWorld(W.tipR);
    const tipL = toWorld(W.tipL);
    skinParticles(c, rig, skin, [tipR, tipL, [x, y]], k, dt, speed, t);
    if (skin.fx.arcs) drawArcs(c, rig, skin, tipL, tipR, [x, y - 0.9 * k * alt], k, t);
  }

  // ── pickup sparkles orbiting the bat ──
  if (R.pickupK > 0.02) {
    const rr = (12 + (1 - R.pickupK) * 14) * k;
    for (let i = 0; i < 8; i++) {
      const a = t * 0.004 + (i / 8) * Math.PI * 2;
      const sx = x + Math.cos(a) * rr;
      const sy = y + Math.sin(a) * rr;
      const s = 1.6 * R.pickupK;
      const star = svgPathOnce(`M${n1(sx)},${n1(sy - s * 2.4)}L${n1(sx + s * 0.5)},${n1(sy - s * 0.5)}L${n1(sx + s * 2.4)},${n1(sy)}L${n1(sx + s * 0.5)},${n1(sy + s * 0.5)}L${n1(sx)},${n1(sy + s * 2.4)}L${n1(sx - s * 0.5)},${n1(sy + s * 0.5)}L${n1(sx - s * 2.4)},${n1(sy)}L${n1(sx - s * 0.5)},${n1(sy - s * 0.5)}Z`);
      if (star) c.drawPath(star, additive(fill('#FFD54F', R.pickupK)));
    }
    c.save();
    c.translate(x, y);
    c.scale(rr * 1.2, rr * 1.2);
    c.drawCircle(0, 0, 1, additive(shaded(radial('pickupFlash', [[0, '#FFD54F', 0.4], [1, '#FFD54F', 0]]), R.pickupK)));
    c.restore();
  }
}


// ═════════════════════════════════════════════════════════════
// Skins: wing patterns, crests, halos, particles, arcs
// ═════════════════════════════════════════════════════════════

/** Live brightness of a skin's glowing wing pattern. */
function patternPulse(skin: SkinDef, t: number) {
  switch (skin.fx.pattern) {
    case 'ember':
      return 0.55 + 0.45 * Math.sin(t * 0.006) * Math.sin(t * 0.0023 + 1);
    case 'storm': {
      const spike = Math.sin(t * 0.05) * Math.sin(t * 0.031) > 0.55 ? 1 : 0.3 + 0.15 * Math.sin(t * 0.02);
      return spike;
    }
    case 'frost':
      return 0.6 + 0.3 * Math.sin(t * 0.002);
    case 'lunar':
      return 0.5 + 0.4 * Math.sin(t * 0.0015);
    case 'jade':
      return 0.45 + 0.45 * Math.sin(t * 0.0035);
    case 'umbra':
      return 0.5 + 0.35 * Math.sin(t * 0.0025);
    case 'royal':
      return 0.55 + 0.35 * Math.sin(t * 0.003);
    default:
      return 0;
  }
}

/** Paints a skin's pattern onto one wing (inside the cached wing picture). */
function wingPattern(c: SkCanvas, skin: SkinDef, wp: ReturnType<typeof wingPaths>, g: WingGeo, side: 1 | -1, a: number, bright: boolean) {
  const fx = skin.fx;
  const M = (p: P2): string => `${n1(p[0] * side)},${n1(p[1])}`;
  const line = (d: string, color: string, w: number, alpha: number) => {
    const p = svgPathOnce(d);
    if (!p) return;
    const paint = stroke(color, w, alpha * a, true);
    c.drawPath(p, bright ? additive(paint) : paint);
  };
  const dots = (d: string, color: string, alpha: number) => {
    const p = svgPathOnce(d);
    if (!p) return;
    const paint = fill(color, alpha * a);
    c.drawPath(p, bright ? additive(paint) : paint);
  };
  switch (fx.pattern) {
    case 'ember':
      line(wp.veins + wp.fingers, fx.glow, bright ? 0.9 : 0.6, 0.95);
      line(wp.arm, fx.accent, bright ? 0.7 : 0.4, 0.8);
      break;
    case 'frost': {
      let d = '';
      const pts = [...wp.knuckles, ...wp.edgeMids.slice(0, 3).map((m) => lerp2(m, g.W, 0.45))];
      for (const q of pts) {
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI) / 3 + 0.3;
          const dx = Math.cos(ang) * 1.1;
          const dy = Math.sin(ang) * 1.1;
          d += `M${M([q[0] - dx, q[1] - dy])}L${M([q[0] + dx, q[1] + dy])}`;
        }
      }
      line(d, '#FFFFFF', 0.32, 0.95);
      line(wp.veins, fx.glow, 0.35, 0.8);
      break;
    }
    case 'lunar': {
      let d = '';
      const spots: [P2, number][] = [
        [lerp2(g.W, g.D[1], 0.6), 1.5],
        [lerp2(g.W, g.D[2], 0.55), 1.2],
        [lerp2(g.E, g.D[3], 0.5), 1.3],
      ];
      for (const [q, r] of spots) {
        const cx = q[0] * side;
        const cy = q[1];
        d += `M${n1(cx - r)},${n1(cy)}A${n1(r)},${n1(r)} 0 1,0 ${n1(cx + r)},${n1(cy)}A${n1(r * 0.78)},${n1(r * 0.78)} 0 1,1 ${n1(cx - r)},${n1(cy)}Z`;
      }
      dots(d, fx.glow, 0.9);
      line(wp.veins, fx.accent, 0.3, 0.6);
      break;
    }
    case 'jade': {
      let d = '';
      for (let i = 0; i < 3; i++) {
        const cx = (g.W[0] + g.D[i][0] + g.D[i + 1][0] + wp.edgeMids[i][0]) / 4;
        const cy = (g.W[1] + g.D[i][1] + g.D[i + 1][1] + wp.edgeMids[i][1]) / 4;
        d += circleD(cx * side, cy, 1.25 - i * 0.12);
        const q = lerp2([cx, cy], g.W, 0.45);
        d += circleD(q[0] * side, q[1], 0.6);
      }
      const am = lerp2(g.E, g.W, 0.5);
      d += circleD(am[0] * side, am[1] + 1.4, 0.8);
      dots(d, fx.accent, 0.95);
      line(wp.fingers, fx.glow, 0.45, 0.8);
      break;
    }
    case 'storm': {
      let d = '';
      g.D.forEach((tip, i) => {
        const dx = tip[0] - g.W[0];
        const dy = tip[1] - g.W[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        d += `M${M(g.W)}`;
        for (let k = 1; k <= 4; k++) {
          const u = k / 5;
          const off = (k % 2 ? 1 : -1) * (0.55 + ((i + k) % 3) * 0.2);
          d += `L${M([g.W[0] + dx * u + nx * off, g.W[1] + dy * u + ny * off])}`;
        }
        d += `L${M(lerp2(g.W, tip, 0.92))}`;
      });
      line(d, fx.glow, bright ? 0.75 : 0.5, 0.95);
      if (bright) line(d, '#FFFFFF', 0.25, 0.9);
      break;
    }
    case 'umbra':
      line(wp.veins, fx.glow, 0.4, 0.6);
      break;
    case 'royal': {
      line(wp.arm + wp.fingers, fx.glow, bright ? 0.7 : 0.55, 0.9);
      if (bright) line(wp.arm + wp.fingers, '#FFFFFF', 0.2, 0.8);
      let d = '';
      for (const q of wp.knuckles) {
        const cx = q[0] * side;
        const cy = q[1];
        d += `M${n1(cx)},${n1(cy - 0.9)}L${n1(cx + 0.6)},${n1(cy)}L${n1(cx)},${n1(cy + 0.9)}L${n1(cx - 0.6)},${n1(cy)}Z`;
      }
      dots(d, fx.accent, 0.95);
      let curls = '';
      for (const m of wp.edgeMids) {
        const q = lerp2(m, g.W, 0.18);
        curls += circleD(q[0] * side, q[1], 0.45);
      }
      dots(curls, fx.glow, 0.9);
      break;
    }
  }
}

/** Head decorations (horns, crown …). `behind` = drawn before the head. */
function drawCrest(c: SkCanvas, skin: SkinDef, behind: boolean) {
  const fx = skin.fx;
  const both = (d: string, paint: () => ReturnType<typeof fill>, sw?: () => ReturnType<typeof stroke>) => {
    const p = svgPath(d);
    if (!p) return;
    for (const side of [1, -1]) {
      c.save();
      c.scale(side, 1);
      c.drawPath(p, paint());
      if (sw) c.drawPath(p, sw());
      c.restore();
    }
  };
  switch (fx.crest) {
    case 'horns':
      if (behind) both('M2,-5.8Q4.8,-5.6 5.4,-2.4Q4,-4 2.4,-4.4Z', () => fill('#140A08'), () => additive(stroke(fx.glow, 0.45, 0.85, true)));
      break;
    case 'icicles':
      if (!behind) {
        const p = svgPath('M-1.5,-5.2L-1,-2.4L-0.5,-5.2ZM-0.5,-5.4L0,-1.8L0.5,-5.4ZM0.5,-5.2L1,-2.4L1.5,-5.2Z');
        if (p) {
          c.drawPath(p, fill('#F2FAFF', 0.95));
          c.drawPath(p, stroke('#7FC8F0', 0.25, 0.9));
        }
      }
      break;
    case 'crescent':
      if (!behind) {
        const p = svgPath('M-1.3,-7.6A1.3,1.3 0 1,0 1.3,-7.6A1,1 0 1,1 -1.3,-7.6Z');
        if (p) c.drawPath(p, additive(fill(fx.glow, 0.95)));
      }
      break;
    case 'frills':
      if (behind) both('M3,-8L5.8,-9.2L4.8,-7.2L6,-6.2L3.4,-5.6Z', () => fill('#1E5A3A'), () => stroke(fx.accent, 0.35, 0.9, true));
      break;
    case 'antennae':
      if (!behind) {
        const p = svgPath('M-0.9,-9.8Q-1.6,-12.2 -2.8,-13.4M0.9,-9.8Q1.6,-12.2 2.8,-13.4');
        if (p) c.drawPath(p, stroke('#9AD8FF', 0.35, 0.9, true));
        c.drawCircle(-2.8, -13.4, 0.55, additive(fill('#FFFFFF', 0.95)));
        c.drawCircle(2.8, -13.4, 0.55, additive(fill('#FFFFFF', 0.95)));
      }
      break;
    case 'shadowhorns':
      if (behind) both('M1.8,-6C4.6,-6.8 6.6,-3.6 6.2,0.6C5.4,-2.6 3.9,-4.4 1.9,-4.8Z', () => fill('#05030A'), () => stroke(fx.glow, 0.4, 0.95, true));
      break;
    case 'crown':
      if (!behind) {
        let d = '';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + ((i - 2) / 5) * Math.PI * 0.9;
          const bx = Math.cos(a) * 2.4;
          const by = -6.9 + Math.sin(a) * 2.4;
          const tx = Math.cos(a) * 4;
          const ty = -6.9 + Math.sin(a) * 4;
          const px = -Math.sin(a) * 0.7;
          const py = Math.cos(a) * 0.7;
          d += `M${n1(bx - px)},${n1(by - py)}L${n1(tx)},${n1(ty)}L${n1(bx + px)},${n1(by + py)}Z`;
        }
        const pts = svgPath(d);
        if (pts) {
          c.drawPath(pts, shaded(linear('crownGold', 0, -11, 0, -5, [[0, '#FFF6C8', 1], [0.5, '#FFD24A', 1], [1, '#A86A10', 1]])));
          c.drawPath(pts, stroke('#5A3A00', 0.25, 0.9));
        }
        const band = svgPath('M-2.6,-6.9A2.6,2.6 0 0,1 2.6,-6.9');
        if (band) c.drawPath(band, stroke('#FFD24A', 1, 1, true));
        c.drawCircle(0, -9.4, 0.5, fill('#FF3A5A'));
        c.drawCircle(-1.6, -8.9, 0.38, fill('#4AA8FF'));
        c.drawCircle(1.6, -8.9, 0.38, fill('#4AFFB0'));
      }
      break;
  }
}

/** Moon ring / sun rays behind the bat. */
function drawHalo(c: SkCanvas, skin: SkinDef, x: number, y: number, k: number, t: number) {
  const fx = skin.fx;
  c.save();
  c.translate(x, y);
  if (fx.halo === 'moon') {
    glow(c, radial(`halo${fx.glow}`, [[0, fx.glow, 0.32], [0.6, fx.glow, 0.08], [1, fx.glow, 0]]), 0, 0, 24 * k, 0.8 + 0.2 * Math.sin(t * 0.002));
    c.drawCircle(0, 0, 17 * k, additive(stroke(fx.glow, 0.7 * k, 0.45, true, [3 * k, 4 * k], -t * 0.01)));
    c.drawCircle(0, 0, 19.5 * k, additive(stroke(fx.accent, 0.4 * k, 0.25)));
  } else if (fx.halo === 'sun') {
    glow(c, radial(`halo${fx.glow}`, [[0, fx.glow, 0.4], [0.5, fx.glow, 0.12], [1, fx.glow, 0]]), 0, 0, 28 * k, 0.85 + 0.15 * Math.sin(t * 0.003));
    c.save();
    c.rotate(t * 0.012, 0, 0);
    let d = '';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const L = (i % 2 ? 22 : 27) * k;
      const r0 = 14 * k;
      const wd = 0.11;
      d += `M${n1(Math.cos(a - wd) * r0)},${n1(Math.sin(a - wd) * r0)}L${n1(Math.cos(a) * L)},${n1(Math.sin(a) * L)}L${n1(Math.cos(a + wd) * r0)},${n1(Math.sin(a + wd) * r0)}Z`;
    }
    const rays = svgPathOnce(d);
    if (rays) c.drawPath(rays, additive(fill(fx.glow, 0.28 + 0.1 * Math.sin(t * 0.004))));
    c.restore();
    c.drawCircle(0, 0, 14 * k, additive(stroke('#FFF2C4', 0.5 * k, 0.4)));
  }
  c.restore();
}

const PCFG: Record<string, { rate: number; life: number; vy: number; spread: number; s0: number; s1: number }> = {
  embers: { rate: 14, life: 0.9, vy: -24, spread: 10, s0: 0.5, s1: 1.2 },
  snow: { rate: 10, life: 1.4, vy: 9, spread: 7, s0: 0.5, s1: 1.2 },
  moon: { rate: 6, life: 1.7, vy: -5, spread: 5, s0: 0.4, s1: 0.9 },
  spores: { rate: 8, life: 1.9, vy: -7, spread: 9, s0: 0.6, s1: 1.3 },
  sparks: { rate: 11, life: 0.32, vy: 0, spread: 70, s0: 0.4, s1: 0.8 },
  smoke: { rate: 16, life: 0.9, vy: 0, spread: 6, s0: 1.2, s1: 2.4 },
  gold: { rate: 10, life: 1.2, vy: -6, spread: 8, s0: 0.8, s1: 1.6 },
};

/** Emits, moves and draws a skin's particles (state lives on the bat's rig). */
function skinParticles(c: SkCanvas, rig: Rig, skin: SkinDef, src: P2[], k: number, dt: number, speed: number, t: number) {
  const kind = skin.fx.particles;
  const cfg = PCFG[kind];
  if (!cfg) return;
  rig.emit = Math.min(3, rig.emit + dt * cfg.rate * (0.55 + speed * 1.5));
  while (rig.emit >= 1 && rig.parts.length < 46) {
    rig.emit -= 1;
    const p = src[Math.floor(Math.random() * src.length)];
    const a = Math.random() * Math.PI * 2;
    const v = cfg.spread * (0.3 + Math.random() * 0.7);
    rig.parts.push({
      x: p[0] + (Math.random() - 0.5) * 3 * k,
      y: p[1] + (Math.random() - 0.5) * 3 * k,
      vx: Math.cos(a) * v * k,
      vy: (Math.sin(a) * v + cfg.vy) * k,
      life: cfg.life * (0.7 + Math.random() * 0.3),
      max: cfg.life,
      s: (cfg.s0 + Math.random() * (cfg.s1 - cfg.s0)) * k,
      k: Math.random(),
    });
  }
  const live: Particle[] = [];
  for (const q of rig.parts) {
    q.life -= dt;
    if (q.life <= 0) continue;
    if (kind === 'sparks') {
      q.vx *= 1 - dt * 4;
      q.vy *= 1 - dt * 4;
    }
    if (kind === 'snow' || kind === 'spores' || kind === 'embers') q.vx += Math.sin(t * 0.004 + q.k * 9) * 12 * k * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    live.push(q);
  }
  rig.parts = live;
  if (!live.length) return;
  const fx = skin.fx;
  let a = '';
  let b = '';
  for (const q of live) {
    const u = q.life / q.max; // 1 → 0
    switch (kind) {
      case 'embers':
        a += circleD(q.x, q.y, q.s * 3 * u);
        b += circleD(q.x, q.y, q.s * (0.4 + 0.6 * u));
        break;
      case 'snow':
      case 'moon':
        b += circleD(q.x, q.y, q.s * (0.5 + 0.5 * u));
        if (q.k > 0.7) a += circleD(q.x, q.y, q.s * 2.6);
        break;
      case 'spores':
        a += circleD(q.x, q.y, q.s * 2.4 * (0.6 + 0.4 * Math.sin(t * 0.006 + q.k * 7)));
        b += circleD(q.x, q.y, q.s * 0.7);
        break;
      case 'sparks':
        a += `M${n1(q.x)},${n1(q.y)}L${n1(q.x - q.vx * 0.035)},${n1(q.y - q.vy * 0.035)}`;
        break;
      case 'smoke':
        a += circleD(q.x, q.y, q.s * (1 + (1 - u) * 2.2));
        break;
      case 'gold': {
        const s = q.s * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.01 + q.k * 9))) * (0.4 + 0.6 * u);
        b += `M${n1(q.x)},${n1(q.y - s * 2)}L${n1(q.x + s * 0.45)},${n1(q.y - s * 0.45)}L${n1(q.x + s * 2)},${n1(q.y)}L${n1(q.x + s * 0.45)},${n1(q.y + s * 0.45)}L${n1(q.x)},${n1(q.y + s * 2)}L${n1(q.x - s * 0.45)},${n1(q.y + s * 0.45)}L${n1(q.x - s * 2)},${n1(q.y)}L${n1(q.x - s * 0.45)},${n1(q.y - s * 0.45)}Z`;
        break;
      }
    }
  }
  const pa = svgPathOnce(a);
  const pb = svgPathOnce(b);
  switch (kind) {
    case 'embers':
      if (pa) c.drawPath(pa, additive(fill(fx.glow, 0.18)));
      if (pb) c.drawPath(pb, additive(fill(fx.accent, 0.95)));
      break;
    case 'snow':
      if (pa) c.drawPath(pa, additive(fill(fx.glow, 0.12)));
      if (pb) c.drawPath(pb, fill('#FFFFFF', 0.85));
      break;
    case 'moon':
      if (pa) c.drawPath(pa, additive(fill(fx.glow, 0.15)));
      if (pb) c.drawPath(pb, additive(fill('#FFFFFF', 0.8)));
      break;
    case 'spores':
      if (pa) c.drawPath(pa, additive(fill(fx.glow, 0.22)));
      if (pb) c.drawPath(pb, additive(fill(fx.accent, 0.9)));
      break;
    case 'sparks':
      if (pa) {
        c.drawPath(pa, additive(stroke(fx.glow, 1.2 * k, 0.6, true)));
        c.drawPath(pa, additive(stroke('#FFFFFF', 0.45 * k, 0.95, true)));
      }
      break;
    case 'smoke':
      if (pa) {
        c.drawPath(pa, fill('#0A0614', 0.32));
        c.drawPath(pa, additive(stroke(fx.glow, 0.35 * k, 0.22)));
      }
      break;
    case 'gold':
      if (pb) c.drawPath(pb, additive(fill(fx.glow, 0.9)));
      break;
  }
}

/** Crackling lightning between the wingtips and the body (regenerated ~14×/s). */
function drawArcs(c: SkCanvas, rig: Rig, skin: SkinDef, a: P2, b: P2, mid: P2, k: number, t: number) {
  if (t - rig.arcAt > 70 || !rig.arc) {
    rig.arcAt = t;
    const jag = (p: P2, q: P2) => {
      let d = `M${n1(p[0])},${n1(p[1])}`;
      const n = 5;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        d += `L${n1(p[0] + (q[0] - p[0]) * u + (Math.random() - 0.5) * 5 * k)},${n1(p[1] + (q[1] - p[1]) * u + (Math.random() - 0.5) * 5 * k)}`;
      }
      return d + `L${n1(q[0])},${n1(q[1])}`;
    };
    rig.arc = (Math.random() < 0.6 ? jag(a, mid) : '') + (Math.random() < 0.6 ? jag(mid, b) : '') + (Math.random() < 0.25 ? jag(a, b) : '');
  }
  const p = svgPathOnce(rig.arc);
  if (!p) return;
  const flick = 0.4 + 0.6 * Math.random();
  c.drawPath(p, additive(stroke(skin.fx.glow, 1.6 * k, 0.3 * flick, true)));
  c.drawPath(p, additive(stroke('#FFFFFF', 0.5 * k, 0.85 * flick, true)));
}
