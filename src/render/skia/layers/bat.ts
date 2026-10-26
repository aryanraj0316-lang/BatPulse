import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { THEME, HQ } from '../theme';
import { fill, stroke, shaded, svgPath, svgPathOnce, mix, linearNow, radialAt, radial, additive, rect, linear } from '../sk';

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
}
const rigs = new WeakMap<object, Rig>();
const namedRigs = new Map<string, Rig>();
function rigFor(key: object | string, t: number): Rig {
  const make = (): Rig => ({ last: t, ear: 0, earV: 0, tail: 0, tailV: 0, head: 0, headV: 0, trailL: [], trailR: [] });
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

const linearFixed = (variant: 'player' | 'wraith') => {
  const pal = variant === 'wraith' ? PAL.wraith : PAL.player;
  return linear(`tail|${variant}`, 0, 6, 0, 15, [
    [0, pal.mid, 1],
    [1, pal.lit, 0.9],
  ]);
};

// ─── Performance: pre-recorded pictures ─────────────────────
// Wings are recorded once per quantised pose (32 steps per wingbeat × bank × glide × amp)
// and replayed with a single drawPicture call. Body, head and ears are static pictures.
interface WingPic {
  wings: SkPicture;
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

function wingPicture(variant: 'player' | 'wraith', phase: number, amp: number, glide: number, bank: number): WingPic {
  const PH = 32;
  const p01 = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const pq = Math.round(p01 * PH) % PH;
  const aq = Math.round(amp * 10) / 10;
  const gq = Math.round(glide * 4) / 4;
  const bq = Math.round(bank * 4) / 4;
  const key = `${variant}|${pq}|${aq}|${gq}|${bq}`;
  const hit = wingCache.get(key);
  if (hit) return hit;

  const isW = variant === 'wraith';
  const pal = isW ? PAL.wraith : PAL.player;
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
      c.drawPath(outline, additive(fill(THEME.batAura, Math.min(0.16, -Math.sin(B.theta * DEG) * 0.2))));
    }
    if (outline) c.drawPath(outline, stroke(isW ? THEME.enemyRim : '#CFE9FF', isW ? 0.9 : 0.45, isW ? 0.85 : 0.28, true));
  });

  // soft-ish floor shadow without a blur: solid core + faint wider edge
  const shadowPath = svgPathOnce(wR.outline + wL.outline + BODY_D + HEAD_D);
  const shadow = record((c) => {
    if (!shadowPath) return;
    c.drawPath(shadowPath, stroke('#000000', 2.2, 0.12, true));
    c.drawPath(shadowPath, fill('#000000', 0.34));
  });

  const entry: WingPic = { wings, shadow, tipR: gR.D[1], tipL: [-gL.D[1][0], gL.D[1][1]], lift: B.lift };
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

function bodyPicture(variant: 'player' | 'wraith') {
  const isW = variant === 'wraith';
  const pal = isW ? PAL.wraith : PAL.player;
  return staticPic(`body|${variant}`, (c) => {
    const body = svgPath(BODY_D)!;
    c.drawPath(body, shaded(radialAt(isW ? 'wBody3' : 'pBody3', -1, 0.2, 8, [[0, pal.furHi, 1], [0.55, pal.fur, 1], [1, pal.body, 1]])));
    c.drawLine(0, -2.4, 0, 8, stroke('#000000', 1.6, 0.2, true));
    const fur = svgPath(FUR_D)!;
    c.drawPath(fur, stroke(isW ? '#1A0206' : '#2A1C18', 0.5, 0.55, true));
    c.save();
    c.translate(-0.25, -0.25);
    c.drawPath(fur, stroke(pal.furHi, 0.32, 0.55, true));
    c.restore();
    c.drawOval(rect(-3.9, -3.8, 3.2, 2.4), fill(pal.furHi, 0.28));
    c.drawOval(rect(0.7, -3.8, 3.2, 2.4), fill(pal.furHi, 0.28));
    c.drawPath(body, stroke(isW ? THEME.enemyRim : pal.rim, isW ? 0.6 : 0.4, isW ? 0.75 : 0.25));
  });
}

function headPicture(variant: 'player' | 'wraith') {
  const isW = variant === 'wraith';
  const pal = isW ? PAL.wraith : PAL.player;
  return staticPic(`head|${variant}`, (c) => {
    const head = svgPath(HEAD_D)!;
    c.drawPath(head, shaded(radialAt(isW ? 'wHead' : 'pHead', -0.8, -7.8, 5, [[0, pal.furHi, 1], [1, pal.head, 1]])));
    c.drawPath(svgPath(FUR_HEAD_D)!, stroke(isW ? '#1A0206' : '#2A1C18', 0.35, 0.5, true));
    c.drawPath(head, stroke(isW ? THEME.enemyRim : '#22160F', 0.4, isW ? 0.8 : 0.55));
    c.drawPath(svgPath(MUZZLE_D)!, fill(isW ? '#2A0509' : '#6A4E40'));
    c.drawCircle(-0.5, -10.4, 0.28, fill('#140C0A'));
    c.drawCircle(0.5, -10.4, 0.28, fill('#140C0A'));
  });
}

function earPicture(variant: 'player' | 'wraith') {
  const isW = variant === 'wraith';
  const pal = isW ? PAL.wraith : PAL.player;
  return staticPic(`ear|${variant}`, (c) => {
    const ear = svgPath(EAR_D)!;
    c.drawPath(ear, fill(isW ? '#3D0810' : '#4A3530'));
    c.drawPath(svgPath(EAR_IN_D)!, fill(pal.earIn, isW ? 0.6 : 0.85));
    c.drawPath(svgPath(EAR_RIDGES_D)!, stroke('#2A1C18', 0.3, 0.6, true));
    c.drawPath(ear, stroke(isW ? THEME.enemyRim : '#6A4E40', 0.4, 0.9));
  });
}

/** Draws one bat. All state (springs, trails) is keyed by `input.key`. */
export function drawBatRig(c: SkCanvas, input: BatInput) {
  const { x, y, deg, k, phase, t, variant } = input;
  const isW = variant === 'wraith';
  const pal = isW ? PAL.wraith : PAL.player;
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
  const W = wingPicture(variant, phase, amp, input.glide ?? 0, bank);
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
    const col = isW ? '#FF4D6A' : '#9AF6FF';
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

  c.save();
  c.translate(x + shake, y - 0.9 * k * alt);
  c.rotate(deg, 0, 0);
  c.scale(k, k);

  // ── wings (one picture) ──
  c.drawPicture(W.wings);

  // ── body: tail + legs live (they lag on a spring), torso is a picture ──
  c.save();
  c.scale(squashX, squashY);
  const tx = Math.round(rig.tail * 5) / 5; // quantised → cached paths
  const tail = svgPath(`M-2.6,6Q-2.6,10.4 -2.2,11.2Q${n1(tx)},14.2 ${n1(tx)},14.9Q${n1(tx)},14.2 2.2,11.2Q2.6,10.4 2.6,6Z`);
  if (tail) {
    c.drawPath(tail, shaded(linearFixed(variant)));
    c.drawPath(tail, stroke(pal.bone, 0.35, 0.6));
  }
  c.drawLine(0, 7, tx, 14.6, stroke(pal.bone, 0.45, 0.8, true));
  const legs = svgPath(`M-2.2,6.2L-3,8.4L${n1(-2.6 + tx * 0.3)},11l-0.7,0.8M${n1(-2.6 + tx * 0.3)},11l0.3,1M2.2,6.2L3,8.4L${n1(2.6 + tx * 0.3)},11l0.7,0.8M${n1(2.6 + tx * 0.3)},11l-0.3,1`);
  if (legs) c.drawPath(legs, stroke(isW ? '#5A0D18' : '#2A1C18', 0.7, 1, true));
  c.drawPicture(bodyPicture(variant));
  c.restore();

  // ── head (jolts forward on a ping, turns on a spring) ──
  c.save();
  c.translate(0, -1.1 * R.pingK);
  c.rotate(rig.head, 0, -3.2);
  const ear = earPicture(variant);
  for (const side of [1, -1] as const) {
    c.save();
    c.translate(1.5 * side, -8.6);
    c.scale(side, 1);
    c.rotate(rig.ear + bank * 6 * side, 0, 0);
    c.drawPicture(ear);
    c.restore();
  }
  c.drawPicture(headPicture(variant));
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
      c.drawCircle(ex + 0.1, ey - 0.1 * squint, eyeR * 0.5, fill(isW ? '#7A0010' : '#1A0F0A'));
      c.drawCircle(ex - 0.35, ey - 0.4 * squint, eyeR * 0.22, fill('#FFFFFF', 0.95));
    }
  }
  if (R.pingK > 0.02) {
    for (let i = 0; i < 3; i++) {
      const r = Math.round((2 + i * 2.2 + (1 - R.pingK) * 7) * 2) / 2;
      const arc = svgPath(`M${n1(-r * 0.7)},${n1(-11.8 - r * 0.7)}Q0,${n1(-11.8 - r * 1.15)} ${n1(r * 0.7)},${n1(-11.8 - r * 0.7)}`);
      if (arc) c.drawPath(arc, additive(stroke(THEME.sonarInner, 0.9, R.pingK * (1 - i * 0.25), true)));
    }
  }
  c.restore(); // head
  c.restore(); // bat

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
