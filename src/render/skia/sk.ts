import {
  Skia,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  TileMode,
  BlendMode,
  type SkCanvas,
  type SkPaint,
  type SkShader,
  type SkPath,
  type SkColor,
  type SkMaskFilter,
  BlurStyle,
} from '@shopify/react-native-skia';
import { ART } from '../art/kit';

/**
 * Tiny Skia toolkit for the renderer. Everything here is cached so a frame
 * allocates almost nothing: colours, paints and unit-sized gradient shaders
 * (drawn with translate/scale) are created once and reused.
 */

// ── Colours ───────────────────────────────────────────────────
const colorCache = new Map<string, SkColor>();
export function col(hex: string, a = 1): SkColor {
  const key = a === 1 ? hex : `${hex}@${a}`;
  let v = colorCache.get(key);
  if (!v) {
    const base = Skia.Color(hex);
    v = a === 1 ? base : new Float32Array([base[0], base[1], base[2], base[3] * a]);
    colorCache.set(key, v);
  }
  return v;
}

// ── Reusable paints ───────────────────────────────────────────
let _fill: SkPaint | null = null;
let _stroke: SkPaint | null = null;
let _layer: SkPaint | null = null;

function fillPaint() {
  if (!_fill) {
    _fill = Skia.Paint();
    _fill.setAntiAlias(true);
  }
  return _fill;
}
function strokePaint() {
  if (!_stroke) {
    _stroke = Skia.Paint();
    _stroke.setAntiAlias(true);
    _stroke.setStyle(PaintStyle.Stroke);
  }
  return _stroke;
}

/** Solid fill paint (shared — use immediately). */
export function fill(hex: string, a = 1): SkPaint {
  const p = fillPaint();
  p.setShader(null);
  p.setMaskFilter(null);
  p.setBlendMode(BlendMode.SrcOver);
  p.setColor(col(hex));
  p.setAlphaf(Math.max(0, Math.min(1, a)));
  return p;
}

/** Fill paint using a shader (shared — use immediately). */
export function shaded(shader: SkShader, a = 1): SkPaint {
  const p = fillPaint();
  p.setMaskFilter(null);
  p.setBlendMode(BlendMode.SrcOver);
  p.setColor(col('#FFFFFF'));
  p.setAlphaf(Math.max(0, Math.min(1, a)));
  p.setShader(shader);
  return p;
}

/** Stroke paint (shared — use immediately). */
export function stroke(hex: string, w: number, a = 1, round = false, dash: number[] | null = null, phase = 0): SkPaint {
  const p = strokePaint();
  p.setShader(null);
  p.setMaskFilter(null);
  p.setBlendMode(BlendMode.SrcOver);
  p.setColor(col(hex));
  p.setAlphaf(Math.max(0, Math.min(1, a)));
  p.setStrokeWidth(w);
  p.setStrokeCap(round ? StrokeCap.Round : StrokeCap.Butt);
  p.setStrokeJoin(round ? StrokeJoin.Round : StrokeJoin.Miter);
  p.setPathEffect(dash ? Skia.PathEffect.MakeDash(dash, phase) : null);
  return p;
}

export function strokeShaded(shader: SkShader, w: number, a = 1, round = true): SkPaint {
  const p = strokePaint();
  p.setMaskFilter(null);
  p.setBlendMode(BlendMode.SrcOver);
  p.setColor(col('#FFFFFF'));
  p.setAlphaf(a);
  p.setShader(shader);
  p.setStrokeWidth(w);
  p.setStrokeCap(round ? StrokeCap.Round : StrokeCap.Butt);
  p.setStrokeJoin(round ? StrokeJoin.Round : StrokeJoin.Miter);
  p.setPathEffect(null);
  return p;
}

/** Begin an opacity group. Pair with canvas.restore(). */
export function beginAlpha(c: SkCanvas, a: number) {
  if (!_layer) _layer = Skia.Paint();
  _layer.setAlphaf(Math.max(0, Math.min(1, a)));
  c.saveLayer(_layer);
}

// ── Gradients ─────────────────────────────────────────────────
type Stop = [offset: number, hex: string, alpha: number];
const shaderCache = new Map<string, SkShader>();

/** Unit radial gradient centred at (0,0), radius 1. Draw with translate+scale. */
export function radial(key: string, stops: Stop[]): SkShader {
  let s = shaderCache.get(key);
  if (!s) {
    s = Skia.Shader.MakeRadialGradient(
      { x: 0, y: 0 },
      1,
      stops.map((st) => col(st[1], st[2])),
      stops.map((st) => st[0]),
      TileMode.Clamp
    );
    shaderCache.set(key, s);
  }
  return s;
}

/** Radial gradient in local coordinates (cached by key). */
export function radialAt(key: string, cx: number, cy: number, r: number, stops: Stop[]): SkShader {
  let s = shaderCache.get(key);
  if (!s) {
    s = Skia.Shader.MakeRadialGradient(
      { x: cx, y: cy },
      r,
      stops.map((st) => col(st[1], st[2])),
      stops.map((st) => st[0]),
      TileMode.Clamp
    );
    shaderCache.set(key, s);
  }
  return s;
}

/** Linear gradient in local coordinates (cached by key). */
export function linear(key: string, x0: number, y0: number, x1: number, y1: number, stops: Stop[]): SkShader {
  let s = shaderCache.get(key);
  if (!s) {
    s = Skia.Shader.MakeLinearGradient(
      { x: x0, y: y0 },
      { x: x1, y: y1 },
      stops.map((st) => col(st[1], st[2])),
      stops.map((st) => st[0]),
      TileMode.Clamp
    );
    shaderCache.set(key, s);
  }
  return s;
}

/** Draws a soft round glow using a cached unit radial shader. */
export function glow(c: SkCanvas, shader: SkShader, x: number, y: number, r: number, a = 1) {
  if (r <= 0.1 || a <= 0.005) return;
  c.save();
  c.translate(x, y);
  c.scale(r, r);
  c.drawCircle(0, 0, 1, shaded(shader, a));
  c.restore();
}

// ── Paths ─────────────────────────────────────────────────────
const pathCache = new Map<string, SkPath>();
/** Parses (and caches) an SVG path string. Returns null for empty input. */
export function svgPath(d: string): SkPath | null {
  if (!d) return null;
  let p = pathCache.get(d);
  if (!p) {
    const made = Skia.Path.MakeFromSVGString(d);
    if (!made) return null;
    p = made;
    if (pathCache.size > 4000) pathCache.clear();
    pathCache.set(d, p);
  }
  return p;
}

/** Parses an SVG path without caching (for per-level data held elsewhere). */
export function svgPathOnce(d: string): SkPath | null {
  if (!d) return null;
  return Skia.Path.MakeFromSVGString(d);
}

export function rect(x: number, y: number, w: number, h: number) {
  return Skia.XYWHRect(x, y, w, h);
}

export function rrect(x: number, y: number, w: number, h: number, r: number) {
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

// ── Common glow shaders ───────────────────────────────────────

export const G = {
  amberPool: () => radial('amberPool', [[0, ART.amber, 0.5], [0.45, ART.flame, 0.18], [1, ART.flame, 0]]),
  amberHalo: () => radial('amberHalo', [[0, ART.amberCore, 1], [0.25, ART.amber, 0.6], [1, ART.flame, 0]]),
  cyan: () => radial('cyanGlow', [[0, ART.cyan, 0.75], [0.4, ART.cyan, 0.22], [1, ART.cyan, 0]]),
  red: () => radial('redGlow', [[0, ART.wraithRed, 0.7], [0.45, ART.wraithRed, 0.2], [1, ART.wraithRed, 0]]),
  gold: () => radial('goldGlow', [[0, ART.gold, 0.65], [0.4, ART.amber, 0.22], [1, ART.amber, 0]]),
  blue: () => radial('blueGlow', [[0, ART.exitCyan, 0.7], [0.45, ART.exitBlue, 0.22], [1, ART.exitBlue, 0]]),
  violet: () => radial('violetGlow', [[0, ART.violet, 0.6], [1, ART.violet, 0]]),
  wave: () =>
    radial('waveFill2', [
      [0, ART.cyan, 0],
      [0.45, ART.cyan, 0.02],
      [0.72, ART.cyan, 0.09],
      [0.86, ART.cyanSoft, 0.2],
      [0.94, ART.cyan, 0.07],
      [1, ART.cyan, 0],
    ]),
  waveEcho: () =>
    radial('waveEcho', [
      [0, ART.cyan, 0],
      [0.7, ART.cyan, 0.03],
      [0.88, ART.cyan, 0.1],
      [1, ART.cyan, 0],
    ]),
  vignette: () => radial('vignette', [[0, '#000000', 0], [0.55, '#000000', 0], [1, '#000000', 0.6]]),
  hole: () =>
    radial('hole2', [
      [0, '#000000', 1],
      [0.35, '#000000', 0.95],
      [0.6, '#000000', 0.72],
      [0.82, '#000000', 0.3],
      [1, '#000000', 0],
    ]),
};

export { BlendMode };

// ── Effects helpers ───────────────────────────────────────────
const blurCache = new Map<number, SkMaskFilter>();
/** Cached Gaussian blur mask filter. */
export function blurMask(sigma: number): SkMaskFilter {
  const key = Math.round(sigma * 10) / 10;
  let m = blurCache.get(key);
  if (!m) {
    m = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, key, true);
    blurCache.set(key, m);
  }
  return m;
}

/** Apply a soft blur to a paint returned by fill()/stroke()/shaded(). */
export function blurred<T extends SkPaint>(p: T, sigma: number, enabled = true): T {
  if (enabled && sigma > 0) p.setMaskFilter(blurMask(sigma));
  return p;
}

/** Make a paint additive (light adds onto what is below). */
export function additive<T extends SkPaint>(p: T, mode: 'plus' | 'screen' = 'plus'): T {
  p.setBlendMode(mode === 'plus' ? BlendMode.Plus : BlendMode.Screen);
  return p;
}

/** RGB(A) colour straight from numbers (0..255 / alpha 0..1) — no parsing. */
export function rgba(r: number, g: number, b: number, a = 1): SkColor {
  return new Float32Array([r / 255, g / 255, b / 255, a]);
}

const hexCache = new Map<string, [number, number, number]>();
export function hexRgb(hex: string): [number, number, number] {
  let v = hexCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(hex, v);
  }
  return v;
}

/** Mix two hex colours (t = 0..1) with an optional brightness multiplier. */
export function mix(a: string, b: string, t: number, bright = 1, alpha = 1): SkColor {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgba(
    Math.min(255, (A[0] + (B[0] - A[0]) * k) * bright),
    Math.min(255, (A[1] + (B[1] - A[1]) * k) * bright),
    Math.min(255, (A[2] + (B[2] - A[2]) * k) * bright),
    alpha
  );
}

/** Linear gradient that is NOT cached (for per-frame geometry). */
export function linearNow(x0: number, y0: number, x1: number, y1: number, colors: SkColor[], pos: number[] | null = null): SkShader {
  return Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, colors, pos, TileMode.Clamp);
}
