import {
  Skia,
  SkPath,
  SkImage,
  SkCanvas,
  SkPaint,
  SkPoint,
  SkShader,
  TileMode,
  FilterMode,
  MipmapMode,
  VertexMode,
  BlendMode,
  BlurStyle,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  ClipOp,
} from '@shopify/react-native-skia';

/**
 * Animated layer of the home screen, drawn over the painted background plate.
 * Everything here is in "art pixels" — the coordinate space of the 941×1671 artwork —
 * and the caller maps that onto the screen.
 *
 *  - Hero bat: the painted bat, warped through a triangle mesh so each wing bends
 *    and whips from the shoulder. Flaps once or twice at random intervals.
 *  - Eyes: repainted live so they can look around and blink.
 *  - Two red enemy bats: articulated silhouettes that wander, flap and sweep red cones.
 *  - Ambient light: lantern flicker, pulsing orb, drifting dust.
 */

export const ART_W = 941;
export const ART_H = 1671;

// Where the bat sprite sits in the artwork (sprite file is 2× this size).
const SPR = { x: 222, y: 609, w: 573, h: 384, k: 2 };

type V = { x: number; y: number };

const BODY = { x: 606, y: 800 }; // body rotation centre
const WINGS = [
  // painted pose: left wing up-left, right wing down-right
  { pivot: { x: 548, y: 748 }, tip: { x: 238, y: 645 }, dir: 1, up: 0.5, down: 0.46 },
  { pivot: { x: 658, y: 795 }, tip: { x: 782, y: 975 }, dir: -1, up: 0.56, down: 0.4 },
].map((w) => {
  const dx = w.tip.x - w.pivot.x;
  const dy = w.tip.y - w.pivot.y;
  const len = Math.hypot(dx, dy);
  return { ...w, len, ax: dx / len, ay: dy / len };
});

const EYES = [
  { x: 595.6, y: 800.6, rx: 6.4, ry: 7.0, rot: -0.26, lid: 0.16, lidTilt: 0.35 },
  { x: 632.6, y: 812.6, rx: 6.6, ry: 4.7, rot: 0.17, lid: 0.36, lidTilt: -0.32 },
];

const LANTERN = { x: 121, y: 512 };
const ORB = { x: 858, y: 1040 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wing angle over one flap (0..1): lift, pause at the top, strong downstroke, recover. 1 = fully up. */
function flapCurve(u: number) {
  if (u <= 0 || u >= 1) return 0;
  const keys: [number, number][] = [
    [0, 0],
    [0.34, 1],
    [0.74, -1],
    [1, 0],
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i];
    const [u1, v1] = keys[i + 1];
    if (u <= u1) return lerp(v0, v1, ease((u - u0) / (u1 - u0)));
  }
  return 0;
}

const FLAP_DUR = 0.56;

// ─── Hero bat ────────────────────────────────────────────────
class HeroBat {
  private cols = 30;
  private rows = 21;
  private rest: V[] = [];
  private tex: SkPoint[] = [];
  private idx: number[] = [];
  // per vertex: [wing index or -1, weight, s along wing, perpendicular coordinate]
  private bind: { wing: number; w: number; s: number; px: number; py: number }[] = [];

  private flapStart = -10;
  private flapsLeft = 0;
  private nextFlapAt = 1.2;
  private lastFlapEnd = -10;

  private blinkStart = -10;
  private doubleBlink = false;
  private nextBlinkAt = 2.2;
  private gaze = { x: 0, y: 0 };
  private gazeTarget = { x: 0.2, y: 0.1 };
  private nextGazeAt = 1.0;

  constructor() {
    const { cols, rows } = this;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = SPR.x + (SPR.w * c) / cols;
        const y = SPR.y + (SPR.h * r) / rows;
        this.rest.push({ x, y });
        this.tex.push(Skia.Point((x - SPR.x) * SPR.k, (y - SPR.y) * SPR.k));
        let best = { wing: -1, w: 0, s: 0, px: 0, py: 0 };
        WINGS.forEach((wg, i) => {
          const vx = x - wg.pivot.x;
          const vy = y - wg.pivot.y;
          const along = vx * wg.ax + vy * wg.ay;
          const s = along / wg.len;
          const w = smooth(0.08, 0.5, s) * (0.6 + 0.4 * Math.min(1.2, s));
          if (w > best.w) best = { wing: i, w, s, px: vx, py: vy };
        });
        this.bind.push(best);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        this.idx.push(a, b, d, b, e, d);
      }
    }
  }

  /** Start a flap right now (e.g. when a menu button is pressed). */
  flapNow(t: number, count = 1) {
    if (t - this.flapStart < FLAP_DUR * this.flapsLeft) return;
    this.flapStart = t;
    this.flapsLeft = count;
  }

  private update(t: number) {
    // flap scheduling: 1 or 2 flaps, then rest 2–3 s or 5–6 s
    const flapping = t - this.flapStart < FLAP_DUR * this.flapsLeft;
    if (!flapping && this.flapsLeft > 0) {
      this.flapsLeft = 0;
      this.lastFlapEnd = t;
      this.nextFlapAt = t + (Math.random() < 0.5 ? rand(2, 3) : rand(5, 6));
    }
    if (!flapping && t >= this.nextFlapAt) {
      this.flapStart = t;
      this.flapsLeft = Math.random() < 0.5 ? 1 : 2;
    }
    // blinking
    if (t >= this.nextBlinkAt) {
      this.blinkStart = t;
      this.doubleBlink = Math.random() < 0.22;
      this.nextBlinkAt = t + rand(2.4, 5.5);
    }
    // gaze: quick saccades between points of interest
    if (t >= this.nextGazeAt) {
      const spots = [
        { x: 0.15, y: 0.15 }, // at the player
        { x: 0.9, y: -0.55 }, // towards the enemies
        { x: -0.25, y: 0.85 }, // down at the menu
        { x: -0.8, y: -0.2 }, // the lantern
        { x: 0.6, y: 0.4 }, // the orb
        { x: rand(-0.6, 0.6), y: rand(-0.4, 0.5) },
      ];
      this.gazeTarget = spots[Math.floor(Math.random() * spots.length)];
      this.nextGazeAt = t + rand(1.1, 3.4);
    }
    const k = 0.32; // per-frame catch-up → fast saccade, slight settle
    this.gaze.x += (this.gazeTarget.x - this.gaze.x) * k;
    this.gaze.y += (this.gazeTarget.y - this.gaze.y) * k;
  }

  /** wing angle (−1 down … 1 up) for a point `lag` seconds behind the shoulder */
  private wingAt(t: number, lag: number) {
    const ft = t - lag - this.flapStart;
    const total = FLAP_DUR * Math.max(1, this.flapsLeft);
    if (ft <= 0 || ft >= total || this.flapsLeft === 0) {
      // small gliding adjustments between flaps
      return Math.sin(t * 2.1) * 0.035 + Math.sin(t * 3.7 + 1) * 0.015;
    }
    return flapCurve((ft % FLAP_DUR) / FLAP_DUR);
  }

  draw(canvas: SkCanvas, t: number, shader: SkShader, paint: SkPaint) {
    this.update(t);
    const body = this.wingAt(t, 0.09);
    // hover: gentle bob + drift; flapping lifts the body on the downstroke
    const by = Math.sin(t * 1.55) * 3.2 + Math.sin(t * 0.63 + 2) * 2.2 + body * 5.5;
    const bx = Math.sin(t * 0.81) * 2.4 + Math.sin(t * 0.37 + 1) * 1.6;
    const rot = Math.sin(t * 1.05) * 0.014 + body * 0.018;

    canvas.save();
    canvas.translate(BODY.x + bx, BODY.y + by);
    canvas.rotate((rot * 180) / Math.PI, 0, 0);
    canvas.translate(-BODY.x, -BODY.y);

    // deform the mesh
    const pos: SkPoint[] = new Array(this.rest.length);
    for (let i = 0; i < this.rest.length; i++) {
      const p = this.rest[i];
      const b = this.bind[i];
      if (b.wing < 0 || b.w <= 0.0005) {
        pos[i] = Skia.Point(p.x, p.y);
        continue;
      }
      const wg = WINGS[b.wing];
      const s = Math.max(0, Math.min(1.25, b.s));
      const a = this.wingAt(t, 0.075 * s); // tip lags the shoulder → whip
      const amp = a >= 0 ? wg.up : wg.down;
      const phi = a * amp * b.w * wg.dir;
      // decompose into along-wing / across-wing, fold + foreshorten, then rotate
      const along = b.px * wg.ax + b.py * wg.ay;
      const across = -b.px * wg.ay + b.py * wg.ax;
      const fore = 1 - 0.13 * Math.abs(a) * b.w;
      const fold = 1 - 0.22 * Math.max(0, a) * b.w;
      const lx = along * fore;
      const ly = across * fold;
      const ux = lx * wg.ax - ly * wg.ay;
      const uy = lx * wg.ay + ly * wg.ax;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      pos[i] = Skia.Point(wg.pivot.x + ux * c - uy * sn, wg.pivot.y + ux * sn + uy * c);
    }
    const verts = Skia.MakeVertices(VertexMode.Triangles, pos, this.tex, undefined, this.idx);
    paint.setShader(shader);
    canvas.drawVertices(verts, BlendMode.Modulate, paint);
    paint.setShader(null);

    this.drawEyes(canvas, t, body);
    canvas.restore();
  }

  private drawEyes(canvas: SkCanvas, t: number, wing: number) {
    // blink: close 70 ms, hold 30 ms, open 90 ms (optionally twice)
    const bt = t - this.blinkStart;
    const one = (x: number) => (x < 0 ? 0 : x < 0.07 ? ease(x / 0.07) : x < 0.1 ? 1 : x < 0.19 ? 1 - ease((x - 0.1) / 0.09) : 0);
    let blink = one(bt);
    if (this.doubleBlink) blink = Math.max(blink, one(bt - 0.26));
    const squint = Math.max(0, -wing) * 0.12; // narrows a touch on the power stroke

    const fur = Skia.Paint();
    fur.setAntiAlias(true);
    const p = Skia.Paint();
    p.setAntiAlias(true);

    for (const e of EYES) {
      canvas.save();
      canvas.translate(e.x, e.y);
      canvas.rotate((e.rot * 180) / Math.PI, 0, 0);

      // soft amber glow around the eye
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      glow.setBlendMode(BlendMode.Plus);
      glow.setShader(
        Skia.Shader.MakeRadialGradient({ x: 0, y: 0 }, e.rx * 2.6, [Skia.Color('rgba(255,170,60,0.22)'), Skia.Color('rgba(255,140,40,0)')], null, TileMode.Clamp)
      );
      canvas.drawCircle(0, 0, e.rx * 2.6, glow);

      // cover the painted eye with fur
      fur.setColor(Skia.Color('#21150F'));
      fur.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.1, true));
      canvas.drawOval(Skia.XYWHRect(-e.rx - 1.6, -e.ry - 1.6, (e.rx + 1.6) * 2, (e.ry + 1.6) * 2), fur);
      fur.setMaskFilter(null);

      const eyeRect = Skia.XYWHRect(-e.rx, -e.ry, e.rx * 2, e.ry * 2);
      const clip = Skia.Path.Oval(eyeRect);
      canvas.save();
      canvas.clipPath(clip, ClipOp.Intersect, true);

      // iris
      const gx = this.gaze.x * e.rx * 0.34;
      const gy = this.gaze.y * e.ry * 0.3;
      p.setShader(
        Skia.Shader.MakeRadialGradient(
          { x: gx, y: gy },
          Math.max(e.rx, e.ry) * 1.15,
          [Skia.Color('#FFE59A'), Skia.Color('#FFB02E'), Skia.Color('#C25E0C'), Skia.Color('#5A2405')],
          [0, 0.32, 0.72, 1],
          TileMode.Clamp
        )
      );
      canvas.drawRect(eyeRect, p);
      p.setShader(null);
      // pupil (slightly vertical)
      p.setColor(Skia.Color('#120703'));
      canvas.drawOval(Skia.XYWHRect(gx - e.rx * 0.36, gy - e.ry * 0.5, e.rx * 0.72, e.ry * 1.0), p);
      // speculars (fixed to the light, not to the gaze)
      p.setColor(Skia.Color('rgba(255,250,235,0.95)'));
      canvas.drawCircle(-e.rx * 0.32, -e.ry * 0.36, Math.min(e.rx, e.ry) * 0.2, p);
      p.setColor(Skia.Color('rgba(255,240,210,0.5)'));
      canvas.drawCircle(e.rx * 0.3, e.ry * 0.28, Math.min(e.rx, e.ry) * 0.1, p);

      // upper lid: angled (a little menacing), drops fully on blink
      const close = Math.min(1, e.lid + squint + blink * (1.05 - e.lid));
      const edge = -e.ry + close * e.ry * 2.1;
      const lid = Skia.PathBuilder.Make();
      const tilt = e.lidTilt * e.ry * (1 - blink);
      lid.moveTo(-e.rx - 2, -e.ry - 3);
      lid.lineTo(e.rx + 2, -e.ry - 3);
      lid.lineTo(e.rx + 2, edge - tilt);
      lid.quadTo(0, edge + e.ry * 0.12, -e.rx - 2, edge + tilt);
      lid.close();
      p.setColor(Skia.Color('#2A1A11'));
      canvas.drawPath(lid.build(), p);
      // lid shadow line
      const lash = Skia.PathBuilder.Make();
      lash.moveTo(e.rx + 2, edge - tilt);
      lash.quadTo(0, edge + e.ry * 0.12, -e.rx - 2, edge + tilt);
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(0.9);
      p.setColor(Skia.Color('rgba(8,3,1,0.9)'));
      canvas.drawPath(lash.build(), p);
      p.setStyle(PaintStyle.Fill);
      canvas.restore();

      // dark rim to seat the eye in the fur
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeWidth(0.8);
      p.setColor(Skia.Color('rgba(10,5,2,0.85)'));
      canvas.drawOval(eyeRect, p);
      p.setStyle(PaintStyle.Fill);
      canvas.restore();
    }
  }
}

// ─── Enemy bats (red sentinels in the background) ───────────
interface EnemyCfg {
  zone: { x0: number; y0: number; x1: number; y1: number };
  scale: number;
  blur: number;
  alpha: number;
  start: V;
}

class Enemy {
  pos: V;
  vel: V = { x: 0, y: 0 };
  target: V;
  nextMoveAt = 0;
  phase = Math.random() * 6;
  beat = 0;
  rate = 3;
  glideUntil = 0;
  nextGlideAt = rand(1, 3);
  coneSeed = Math.random() * 10;
  lastT = 0;

  constructor(private cfg: EnemyCfg) {
    this.pos = { ...cfg.start };
    this.target = { ...cfg.start };
    this.nextMoveAt = rand(1.5, 3.5);
  }

  private update(t: number) {
    const dt = Math.min(0.05, Math.max(0, t - this.lastT));
    this.lastT = t;
    const z = this.cfg.zone;
    if (t >= this.nextMoveAt) {
      this.target = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
      this.nextMoveAt = t + rand(2.2, 6);
    }
    // springy drift towards the target + a little hover noise
    const ax = (this.target.x - this.pos.x) * 1.6 - this.vel.x * 1.9;
    const ay = (this.target.y - this.pos.y) * 1.6 - this.vel.y * 1.9;
    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // wing beat: mostly flapping, with random short glides
    if (t >= this.nextGlideAt && t > this.glideUntil) {
      this.glideUntil = t + rand(0.5, 1.3);
      this.nextGlideAt = this.glideUntil + rand(1.5, 4);
    }
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const gliding = t < this.glideUntil;
    this.rate = lerp(this.rate, gliding ? 0 : 2.7 + Math.min(2, speed / 40), 0.08);
    this.phase += dt * this.rate * Math.PI * 2;
    const flap = Math.sin(this.phase);
    this.beat = gliding ? lerp(this.beat, 0.25, 0.08) : lerp(this.beat, flap, 0.5);
  }

  draw(canvas: SkCanvas, t: number) {
    this.update(t);
    const { scale: k, blur, alpha } = this.cfg;
    const bob = Math.sin(t * 2.3 + this.coneSeed) * 2.5 * k - this.beat * 3 * k;
    const x = this.pos.x;
    const y = this.pos.y + bob;
    const bank = Math.max(-0.35, Math.min(0.35, this.vel.x * 0.006));

    // red search cone under the head
    const sweep = Math.sin(t * 0.55 + this.coneSeed) * 0.32 + bank * 0.8;
    const dir = Math.PI / 2 + sweep;
    const len = 240 * k;
    const half = 0.2;
    const apex = { x, y: y - 4 * k };
    const cone = Skia.PathBuilder.Make();
    cone.moveTo(apex.x, apex.y);
    cone.lineTo(apex.x + Math.cos(dir - half) * len, apex.y + Math.sin(dir - half) * len);
    cone.lineTo(apex.x + Math.cos(dir + half) * len, apex.y + Math.sin(dir + half) * len);
    cone.close();
    const cp = Skia.Paint();
    cp.setAntiAlias(true);
    cp.setBlendMode(BlendMode.Plus);
    cp.setShader(
      Skia.Shader.MakeLinearGradient(
        apex,
        { x: apex.x + Math.cos(dir) * len, y: apex.y + Math.sin(dir) * len },
        [Skia.Color(`rgba(255,40,55,${0.34 * alpha})`), Skia.Color(`rgba(255,30,45,${0.12 * alpha})`), Skia.Color('rgba(255,30,45,0)')],
        [0, 0.45, 1],
        TileMode.Clamp
      )
    );
    cp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5 * k + 2, true));
    canvas.drawPath(cone.build(), cp);

    canvas.save();
    canvas.translate(x, y);
    canvas.rotate((bank * 180) / Math.PI, 0, 0);
    canvas.scale(k, k);

    const bodyBuilder = Skia.PathBuilder.Make();
    // wings
    const wingPaths: SkPath[] = [];
    const bones: SkPath[] = [];
    for (const sgn of [-1, 1]) {
      const { path, bone } = wingPath(sgn, this.beat);
      wingPaths.push(path);
      bones.push(bone);
    }
    // head + ears + body
    bodyBuilder.addOval(Skia.XYWHRect(-12, -6, 24, 34));
    bodyBuilder.addCircle(0, -10, 11);
    bodyBuilder.moveTo(-9, -15);
    bodyBuilder.lineTo(-12, -33);
    bodyBuilder.lineTo(-2, -19);
    bodyBuilder.close();
    bodyBuilder.moveTo(9, -15);
    bodyBuilder.lineTo(12, -33);
    bodyBuilder.lineTo(2, -19);
    bodyBuilder.close();
    const body = bodyBuilder.build();

    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setColor(Skia.Color(`rgba(22,8,11,${0.96 * alpha})`));
    if (blur > 0) fill.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur / k, true));
    const rim = Skia.Paint();
    rim.setAntiAlias(true);
    rim.setStyle(PaintStyle.Stroke);
    rim.setStrokeJoin(StrokeJoin.Round);
    rim.setBlendMode(BlendMode.Plus);
    const glowRim = rim.copy();
    glowRim.setStrokeWidth(5 / k);
    glowRim.setColor(Skia.Color(`rgba(255,30,50,${0.38 * alpha})`));
    glowRim.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, (3 + blur) / k, true));
    rim.setStrokeWidth(1.4 / k);
    rim.setColor(Skia.Color(`rgba(255,70,80,${0.55 * alpha})`));
    if (blur > 0.5) rim.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur / k, true));

    for (const w of wingPaths) {
      canvas.drawPath(w, glowRim);
      canvas.drawPath(w, fill);
    }
    const bp = rim.copy();
    bp.setStrokeWidth(1 / k);
    bp.setStrokeCap(StrokeCap.Round);
    bp.setColor(Skia.Color(`rgba(255,60,70,${0.32 * alpha})`));
    for (const b of bones) canvas.drawPath(b, bp);
    for (const w of wingPaths) canvas.drawPath(w, rim);
    canvas.drawPath(body, glowRim);
    canvas.drawPath(body, fill);

    // eyes with bloom
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.1 + this.coneSeed);
    const eye = Skia.Paint();
    eye.setAntiAlias(true);
    eye.setBlendMode(BlendMode.Plus);
    eye.setColor(Skia.Color(`rgba(255,40,40,${0.55 * alpha * pulse})`));
    eye.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 4, true));
    canvas.drawCircle(-4.6, -10, 5, eye);
    canvas.drawCircle(4.6, -10, 5, eye);
    eye.setMaskFilter(null);
    eye.setColor(Skia.Color(`rgba(255,${Math.round(120 * pulse)},90,${alpha})`));
    canvas.drawCircle(-4.4, -10, 2.1, eye);
    canvas.drawCircle(4.4, -10, 2.1, eye);
    canvas.restore();
  }
}

/** One wing as a membrane between three fingers. sgn −1 = left, 1 = right. beat −1 down … 1 up. */
function wingPath(sgn: number, beat: number) {
  const ang = -0.12 - beat * 0.62; // whole-wing rotation (up = negative y)
  const fore = 0.72 + 0.28 * Math.cos(beat * 1.15); // foreshortening at the extremes
  const curl = beat * 0.22; // fingers lag the arm
  const pt = (lx: number, ly: number, bend = 0) => {
    const a = ang + bend * curl;
    const x = lx * fore;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: sgn * (8 + x * c - ly * s), y: -6 + x * s + ly * c };
  };
  const sh = pt(0, 0);
  const wr = pt(46, -16, 0.4);
  const f1 = pt(128, -26, 1);
  const f2 = pt(116, 16, 1);
  const f3 = pt(82, 40, 0.8);
  const tail = pt(10, 26, 0.1);
  const mid = (a: V, b: V, pull: number) => ({
    x: (a.x + b.x) / 2 + (wr.x - (a.x + b.x) / 2) * pull,
    y: (a.y + b.y) / 2 + (wr.y - (a.y + b.y) / 2) * pull,
  });
  const pb = Skia.PathBuilder.Make();
  pb.moveTo(sh.x, sh.y);
  pb.quadTo((sh.x + wr.x) / 2, (sh.y + wr.y) / 2 - 4, wr.x, wr.y);
  pb.lineTo(f1.x, f1.y);
  const m1 = mid(f1, f2, 0.32);
  pb.quadTo(m1.x, m1.y, f2.x, f2.y);
  const m2 = mid(f2, f3, 0.3);
  pb.quadTo(m2.x, m2.y, f3.x, f3.y);
  const m3 = mid(f3, tail, 0.28);
  pb.quadTo(m3.x, m3.y, tail.x, tail.y);
  pb.close();
  const boneBuilder = Skia.PathBuilder.Make();
  boneBuilder.moveTo(sh.x, sh.y);
  boneBuilder.lineTo(wr.x, wr.y);
  for (const f of [f1, f2, f3]) {
    boneBuilder.moveTo(wr.x, wr.y);
    boneBuilder.lineTo(f.x, f.y);
  }
  return { path: pb.build(), bone: boneBuilder.build() };
}

// ─── Ambient light ───────────────────────────────────────────
interface Mote {
  x: number;
  y: number;
  r: number;
  sp: number;
  ph: number;
  warm: boolean;
}

function noise1(t: number, seed: number) {
  return (
    Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 13.1 + seed * 2.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2
  );
}

export class HomeScene {
  private bat = new HeroBat();
  private enemies = [
    new Enemy({ zone: { x0: 720, y0: 575, x1: 880, y1: 690 }, scale: 0.92, blur: 0.9, alpha: 1, start: { x: 800, y: 628 } }),
    new Enemy({ zone: { x0: 705, y0: 720, x1: 860, y1: 830 }, scale: 0.46, blur: 1.8, alpha: 0.78, start: { x: 772, y: 776 } }),
  ];
  private motes: Mote[] = [];
  private batShader: SkShader;
  private batPaint: SkPaint;

  constructor(batImage: SkImage) {
    this.batShader = batImage.makeShaderOptions(TileMode.Decal, TileMode.Decal, FilterMode.Linear, MipmapMode.Linear);
    this.batPaint = Skia.Paint();
    this.batPaint.setAntiAlias(true);
    for (let i = 0; i < 34; i++) {
      const warm = i < 12;
      this.motes.push({
        x: warm ? rand(ORB.x - 70, ORB.x + 40) : rand(40, 900),
        y: warm ? rand(ORB.y - 160, ORB.y) : rand(150, 1600),
        r: rand(0.8, 2.2),
        sp: rand(6, 18),
        ph: rand(0, 100),
        warm,
      });
    }
  }

  /** Make the hero bat flap right away (menu feedback). */
  flap(t: number) {
    this.bat.flapNow(t, 1);
  }

  draw(canvas: SkCanvas, t: number) {
    const add = Skia.Paint();
    add.setAntiAlias(true);
    add.setBlendMode(BlendMode.Plus);

    // lantern: warm flicker spilling on the wall
    const fl = 0.78 + 0.22 * noise1(t, 1.7);
    add.setShader(
      Skia.Shader.MakeRadialGradient(LANTERN, 150, [Skia.Color(`rgba(255,170,70,${0.2 * fl})`), Skia.Color(`rgba(255,120,40,${0.07 * fl})`), Skia.Color('rgba(255,120,40,0)')], [0, 0.4, 1], TileMode.Clamp)
    );
    canvas.drawCircle(LANTERN.x, LANTERN.y, 150, add);
    add.setShader(
      Skia.Shader.MakeRadialGradient(LANTERN, 26, [Skia.Color(`rgba(255,220,150,${0.35 * fl})`), Skia.Color('rgba(255,200,120,0)')], null, TileMode.Clamp)
    );
    canvas.drawCircle(LANTERN.x, LANTERN.y, 26, add);

    // energy orb: slow breathing glow
    const op = 0.7 + 0.3 * Math.sin(t * 2.2) + 0.08 * noise1(t, 4.2);
    add.setShader(
      Skia.Shader.MakeRadialGradient(ORB, 95, [Skia.Color(`rgba(255,190,60,${0.26 * op})`), Skia.Color(`rgba(255,150,30,${0.08 * op})`), Skia.Color('rgba(255,150,30,0)')], [0, 0.35, 1], TileMode.Clamp)
    );
    canvas.drawCircle(ORB.x, ORB.y, 95, add);
    add.setShader(null);

    // enemies behind the hero
    for (const e of this.enemies) e.draw(canvas, t);

    // hero bat
    this.bat.draw(canvas, t, this.batShader, this.batPaint);

    // drifting dust / orb embers in front
    const mp = Skia.Paint();
    mp.setAntiAlias(true);
    mp.setBlendMode(BlendMode.Plus);
    mp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.4, true));
    for (const m of this.motes) {
      const life = ((t * m.sp + m.ph * 10) % 260) / 260; // 0..1 loop
      const y = m.warm ? m.y - life * 180 : m.y - life * 120;
      const x = m.x + Math.sin(t * 0.7 + m.ph) * 10;
      const a = Math.sin(Math.PI * life) * (m.warm ? 0.85 : 0.35);
      mp.setColor(Skia.Color(m.warm ? `rgba(255,190,90,${a})` : `rgba(170,220,255,${a})`));
      canvas.drawCircle(x, y, m.r, mp);
    }
  }
}
