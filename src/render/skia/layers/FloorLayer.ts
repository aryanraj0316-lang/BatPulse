import { Skia, TileMode, FilterMode, MipmapMode, type SkCanvas, type SkShader } from '@shopify/react-native-skia';
import { THEME, HQ } from '../theme';
import { LevelDecor, SpikeBedDecor } from '../../art/decor';
import { ART, makeRng } from '../../art/kit';
import { fill, stroke, shaded, rect, svgPathOnce, mix, radial, blurred, linear, radialAt } from '../sk';

/**
 * FLOOR — irregular slate cobblestones, broad tonal patches, sparse debris,
 * cool ambient tint and flat decorative spike beds. Baked once per level.
 */

const TILE_W = 132;
const TILE_H = 96;

/** Bakes one seamless tile of irregular cobblestones and returns it as a repeating shader. */
function cobbleShader(scale: number, seed: number): SkShader | null {
  const surface = Skia.Surface.Make(Math.ceil(TILE_W * scale), Math.ceil(TILE_H * scale));
  if (!surface) return null;
  const c = surface.getCanvas();
  c.scale(scale, scale);
  const rng = makeRng(seed);
  c.drawRect(rect(0, 0, TILE_W, TILE_H), fill(THEME.floorMortar));
  let y = 0;
  let row = 0;
  while (y < TILE_H - 0.5) {
    let h = rng.range(6.5, 9.5);
    if (TILE_H - y - h < 6.5) h = TILE_H - y; // last row fills the tile exactly
    // stones in this row: random widths that sum to the tile width (wraps horizontally)
    const widths: number[] = [];
    let x = 0;
    while (x < TILE_W - 0.5) {
      let w = rng.range(7, 13);
      if (TILE_W - x - w < 7) w = TILE_W - x;
      widths.push(w);
      x += w;
    }
    const shift = row % 2 ? rng.range(4, 9) : 0;
    x = -shift;
    for (const w of widths) {
      for (const ox of [0, TILE_W]) {
        const sx = x + ox + 0.9;
        if (sx > TILE_W || sx + w < 0) continue;
        const g = 0.75;
        const tone = rng.next();
        const jx = rng.range(-0.6, 0.6);
        const jy = rng.range(-0.8, 0.8);
        const shrinkX = rng.range(0, 1.2);
        const shrinkY = rng.range(0, 1.0);
        const r = rng.range(2.4, 3.6);
        const stone = Skia.RRectXY(rect(sx + jx + shrinkX / 2, y + g + jy + shrinkY / 2, w - g * 2 - shrinkX, h - g * 2 - shrinkY), r, r * rng.range(0.8, 1.2));
        const sp = fill('#000000');
        sp.setColor(mix(THEME.floorStoneDark, THEME.floorStoneLight, tone * 0.6));
        c.drawRRect(stone, sp);
        // top-left highlight edge + bottom-right dark edge
        const hl = svgPathOnce(`M${sx + jx + 1},${y + h - g - 1.5 + jy}V${y + g + 1.2 + jy}H${sx + jx + w - g * 2 - 1.2}`);
        if (hl) c.drawPath(hl, stroke(THEME.floorStoneHighlight, 0.6, 0.3));
        const dk = svgPathOnce(`M${sx + jx + w - g * 2 - 0.8},${y + g + 1.5 + jy}V${y + h - g - 0.8 + jy}H${sx + jx + 1.5}`);
        if (dk) c.drawPath(dk, stroke('#000000', 0.7, 0.45));
        // rare chip / speck
        if (rng.chance(0.25)) c.drawCircle(sx + rng.range(2, w - 4), y + rng.range(2, h - 3), rng.range(0.4, 0.9), fill('#000000', 0.5));
      }
      x += w;
    }
    y += h;
    row++;
  }
  surface.flush();
  const img = surface.makeImageSnapshot();
  const m = Skia.Matrix();
  m.scale(1 / scale, 1 / scale);
  return img.makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.None, m);
}

export function bakeFloor(c: SkCanvas, decor: LevelDecor, w: number, h: number, scale: number, seed: number) {
  // 1. Cobblestones
  const cob = cobbleShader(scale, seed);
  if (cob) c.drawRect(rect(0, 0, w, h), shaded(cob));
  else c.drawRect(rect(0, 0, w, h), fill(THEME.floorStoneDark));

  // 2. Broad light/dark patches so the tiling never reads as repetitive
  const rng = makeRng(seed * 3 + 1);
  const patches = Math.round((w * h) / 9000);
  const patchLight = radial('floorPatchL', [[0, '#3A4A5E', 1], [1, '#3A4A5E', 0]]);
  const patchDark = radial('floorPatchD', [[0, '#000000', 1], [1, '#000000', 0]]);
  for (let i = 0; i < patches; i++) {
    const r = rng.range(40, 120);
    c.save();
    c.translate(rng.range(0, w), rng.range(0, h));
    c.scale(r, r * rng.range(0.6, 1));
    c.drawCircle(0, 0, 1, shaded(rng.chance(0.45) ? patchLight : patchDark, rng.range(0.4, 1) * THEME.floorPatchStrength));
    c.restore();
  }

  // 3. Sparse debris
  const draw = (d: string, paint: ReturnType<typeof fill>) => {
    const p = svgPathOnce(d);
    if (p) c.drawPath(p, paint);
  };
  draw(decor.cracks, stroke('#000000', 0.7, 0.65));
  draw(decor.pebbles, fill(ART.rock));
  draw(decor.pebblesLight, fill(ART.rockLight, 0.6));
  draw(decor.twigs, stroke(ART.twig, 0.9, 0.9, true));
  draw(decor.twigsLight, stroke(ART.twigLight, 0.8, 0.9, true));
  draw(decor.litterDark, fill('#2B2416', 0.8));
  draw(decor.litter, fill('#2E3F1C', 0.75));

  // 4. Flat decorative spike beds (dead ends only)
  for (const sb of decor.spikeBeds) drawSpikeBed(c, sb);

  // 5. Cool ambient wash over the whole floor
  c.drawRect(rect(0, 0, w, h), fill('#28466E', 0.1));
}

/** Iron plate with a dense grid of lit metal pyramid spikes (decorative). */
export function drawSpikeBed(c: SkCanvas, sb: SpikeBedDecor) {
  const { x, y, w, h } = sb;
  c.drawRRect(Skia.RRectXY(rect(x + 1.5, y + 2.5, w, h), 2, 2), blurred(fill('#000000', 0.6), 2, HQ));
  c.drawRRect(Skia.RRectXY(rect(x, y, w, h), 2, 2), fill('#15191E'));
  c.drawRRect(Skia.RRectXY(rect(x, y, w, h), 2, 2), stroke('#3A424C', 0.8));
  const step = 5.2;
  const cols = Math.max(1, Math.floor((w - 2) / step));
  const rows = Math.max(1, Math.floor((h - 2) / step));
  const ox = x + (w - cols * step) / 2 + step / 2;
  const oy = y + (h - rows * step) / 2 + step / 2;
  const s = step * 0.46;
  // pyramids: lit face (top-left), dark face (bottom-right), bright tip
  let lit = '';
  let dark = '';
  let mid = '';
  let shadow = '';
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      const px = ox + cc * step;
      const py = oy + r * step;
      shadow += `M${px - s + 1},${py - s + 1.6}h${s * 2}v${s * 2}h${-s * 2}Z`;
      lit += `M${px - s},${py - s}L${px + s},${py - s}L${px},${py}ZM${px - s},${py - s}L${px - s},${py + s}L${px},${py}Z`;
      dark += `M${px + s},${py - s}L${px + s},${py + s}L${px},${py}Z`;
      mid += `M${px - s},${py + s}L${px + s},${py + s}L${px},${py}Z`;
    }
  }
  const P = (d: string) => svgPathOnce(d);
  const ps = P(shadow);
  if (ps) c.drawPath(ps, fill('#000000', 0.45));
  const pl = P(lit);
  if (pl) c.drawPath(pl, fill('#9AA3AD'));
  const pm = P(mid);
  if (pm) c.drawPath(pm, fill('#5A626C'));
  const pd = P(dark);
  if (pd) c.drawPath(pd, fill('#2A3038'));
  for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) c.drawCircle(ox + cc * step - 0.3, oy + r * step - 0.3, 0.55, fill('#FFFFFF', 0.85));
}

/** Rocky / leafy framing on the outer border strip, fading into near-black at the edge. */
export function bakeBorder(c: SkCanvas, decor: LevelDecor, w: number, h: number) {
  // edge darkness fades inward
  const fade = 26;
  const edge = (key: string, x0: number, y0: number, x1: number, y1: number, r: [number, number, number, number]) =>
    c.drawRect(rect(...r), shaded(linear(key, x0, y0, x1, y1, [[0, '#020305', 0.9], [1, '#020305', 0]])));
  edge('bfL', 0, 0, fade, 0, [0, 0, fade, h]);
  edge(`bfR${w}`, w, 0, w - fade, 0, [w - fade, 0, fade, h]);
  edge(`bfB${h}`, 0, h, 0, h - fade, [0, h - fade, w, fade]);

  for (const rk of decor.borderRocks) {
    const p = svgPathOnce(rk.d);
    if (!p) continue;
    c.save();
    c.translate(1.5, 2.5);
    c.drawPath(p, blurred(fill('#000000', 0.6), 2, HQ));
    c.restore();
    c.drawPath(p, fill(THEME.rock));
    const b = p.computeTightBounds();
    c.drawPath(p, shaded(radialAt(`rk${Math.round(b.x)}_${Math.round(b.y)}`, b.x + b.width * 0.35, b.y + b.height * 0.3, Math.max(b.width, b.height) * 0.8, [
      [0, THEME.rockLight, 0.9],
      [1, THEME.rockDark, 0.2],
    ])));
    const hl = svgPathOnce(rk.hl);
    if (hl) c.drawPath(hl, fill('#5A6676', 0.35));
  }
  const tones = ['#14260F', '#1E3A17', '#2C5224', '#3F6E2E'];
  decor.borderLeaves.forEach((d, i) => {
    const p = svgPathOnce(d);
    if (!p) return;
    if (i === 0) {
      c.save();
      c.translate(1.2, 2);
      c.drawPath(p, blurred(fill('#000000', 0.5), 1.5, HQ));
      c.restore();
    }
    c.drawPath(p, fill(tones[i]));
  });
  // glossy sheen on the lightest leaves
  const top = svgPathOnce(decor.borderLeaves[3]);
  if (top) c.drawPath(top, stroke('#9CCB6A', 0.5, 0.35));
}
