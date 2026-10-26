import { Skia, PathOp, ClipOp, TileMode, FilterMode, MipmapMode, type SkCanvas, type SkPath, type SkShader } from '@shopify/react-native-skia';
import { THEME, HQ } from '../theme';
import { LevelDecor } from '../../art/decor';
import { makeRng } from '../../art/kit';
import { fill, stroke, shaded, rect, svgPathOnce, mix, blurred } from '../sk';
import { drawCrate, drawBarrel, drawRocks, drawBones } from '../sprites';

/**
 * WALLS — raised 2.5D masonry. All wall rects (padded symmetrically around the
 * collision rects) are merged into ONE path so corners and T-junctions join cleanly.
 * Then: soft drop shadow → contact shadow → south facet → stone cap → bevels →
 * moss (clipped to the cap) → ivy → raised props. Baked once per level.
 */

/** Union of all padded wall rects (balanced pairwise merge keeps it fast). */
export function wallUnion(decor: LevelDecor): SkPath | null {
  const pad = decor.wallPad;
  let paths: SkPath[] = [];
  for (const w of decor.walls) {
    const p = svgPathOnce(`M${w.x - pad},${w.y - pad}h${w.width + pad * 2}v${w.height + pad * 2}h${-(w.width + pad * 2)}Z`);
    if (p) paths.push(p);
  }
  while (paths.length > 1) {
    const next: SkPath[] = [];
    for (let i = 0; i < paths.length; i += 2) {
      if (i + 1 >= paths.length) {
        next.push(paths[i]);
        continue;
      }
      next.push(Skia.Path.MakeFromOp(paths[i], paths[i + 1], PathOp.Union) ?? paths[i]);
    }
    paths = next;
  }
  return paths[0] ?? null;
}

/** Repeating masonry texture for the wall caps: staggered blocks with per-block tone. */
function masonryShader(scale: number, seed: number): SkShader | null {
  const TW = 54;
  const TH = 15;
  const surface = Skia.Surface.Make(Math.ceil(TW * scale), Math.ceil(TH * scale));
  if (!surface) return null;
  const c = surface.getCanvas();
  c.scale(scale, scale);
  const rng = makeRng(seed);
  c.drawRect(rect(0, 0, TW, TH), fill(THEME.wallCapMortar));
  const rowH = TH / 3;
  for (let r = 0; r < 3; r++) {
    let x = r === 1 ? -rng.range(3, 6) : 0;
    while (x < TW) {
      let bw = rng.range(6.5, 11);
      if (x + bw > TW - 4 && x + bw < TW + 4) bw = TW - x; // keep the tile seamless
      const y = r * rowH;
      const tone = rng.next();
      const blk = Skia.RRectXY(rect(x + 0.6, y + 0.6, bw - 1.2, rowH - 1.2), 1, 1);
      const p = fill('#000000');
      p.setColor(mix(THEME.wallCapAlt, THEME.wallCap, tone, 0.92 + rng.range(0, 0.16)));
      c.drawRRect(blk, p);
      if (x + bw > TW) {
        const wrap = Skia.RRectXY(rect(x - TW + 0.6, y + 0.6, bw - 1.2, rowH - 1.2), 1, 1);
        c.drawRRect(wrap, p);
      }
      // weathered top-left highlight on each block
      const hl = svgPathOnce(`M${x + 1},${y + rowH - 1.2}V${y + 1}H${x + bw - 1.2}`);
      if (hl) c.drawPath(hl, stroke('#8C98A8', 0.5, 0.45));
      if (rng.chance(0.3)) c.drawCircle(x + rng.range(2, bw - 2), y + rng.range(1.5, rowH - 1.5), rng.range(0.3, 0.7), fill('#000000', 0.45));
      x += bw;
    }
  }
  surface.flush();
  const img = surface.makeImageSnapshot();
  const m = Skia.Matrix();
  m.scale(1 / scale, 1 / scale);
  return img.makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.None, m);
}

export function bakeWalls(c: SkCanvas, decor: LevelDecor, scale: number, seed: number) {
  const union = wallUnion(decor);
  if (!union) return;
  const facet = decor.facet;
  const at = (dx: number, dy: number, paint: ReturnType<typeof fill>) => {
    c.save();
    c.translate(dx, dy);
    c.drawPath(union, paint);
    c.restore();
  };

  // 1. Soft directional drop shadow + tight contact shadow at the base
  at(THEME.wallShadowOffset.x, THEME.wallShadowOffset.y + facet, blurred(fill('#000000', 0.8), THEME.wallShadowBlur, HQ));
  at(0.5, facet + 1.2, blurred(fill('#000000', 0.65), 1.6, HQ));

  // 2. South facet (gives the block height): the same stone, in shade, darkening downward
  const mason = masonryShader(scale, seed);
  for (let i = facet; i >= 1; i -= 1) {
    c.save();
    c.translate(0, i);
    c.drawPath(union, mason ? shaded(mason) : fill(THEME.wallFacet));
    c.drawPath(union, fill(THEME.wallFacetDark, 0.55 + 0.35 * (i / facet)));
    c.restore();
  }
  c.save();
  c.translate(0, facet);
  c.drawPath(union, stroke('#06080B', 1.2, 0.9));
  c.restore();

  // 3. Cap: masonry texture
  c.drawPath(union, mason ? shaded(mason) : fill(THEME.wallCap));

  c.save();
  c.clipPath(union, ClipOp.Intersect, true);
  // weathering: broad darker/lighter patches across the stone
  const rng = makeRng(seed * 5 + 3);
  for (const w of decor.walls) {
    if (!rng.chance(0.5)) continue;
    const horizontal = w.width >= w.height;
    const n = Math.max(1, Math.round((horizontal ? w.width : w.height) / 30));
    for (let i = 0; i < n; i++) {
      const px = horizontal ? w.x + rng.range(0, w.width) : w.x + w.width / 2;
      const py = horizontal ? w.y + w.height / 2 : w.y + rng.range(0, w.height);
      c.drawCircle(px, py, rng.range(4, 9), blurred(fill(rng.chance(0.6) ? '#000000' : '#A0AEC0', rng.range(0.08, 0.18)), 3, HQ));
    }
  }
  // 4. Bevels: light inner edge on top/left, dark inner edge on bottom/right
  c.save();
  c.translate(1.1, 1.1);
  c.drawPath(union, stroke(THEME.wallBevelLight, 1.8, 0.85));
  c.restore();
  c.save();
  c.translate(-1.1, -1.1);
  c.drawPath(union, stroke(THEME.wallBevelDark, 1.8, 0.85));
  c.restore();
  // 5. Moss creeping over the caps (clipped, so it never spills onto the floor)
  const mossDark = svgPathOnce(decor.mossDark);
  if (mossDark) c.drawPath(mossDark, blurred(fill(THEME.mossDark, 0.85), 0.8, HQ));
  const moss = svgPathOnce(decor.moss);
  if (moss) c.drawPath(moss, blurred(fill(THEME.moss, 0.8), 0.6, HQ));
  c.restore(); // clip

  c.drawPath(union, stroke('#0A0D12', 0.8, 0.9));

  // 6. Ivy clusters at wall ends (a little spill past the cap is fine; never across a corridor)
  const tones = THEME.ivy;
  decor.ivy.forEach((d, i) => {
    const p = svgPathOnce(d);
    if (!p) return;
    if (i === 0) {
      c.save();
      c.translate(0.8, 1.4);
      c.drawPath(p, blurred(fill('#000000', 0.5), 1, HQ));
      c.restore();
    }
    c.drawPath(p, fill(tones[i]));
  });
  const ivyTop = svgPathOnce(decor.ivy[3]);
  if (ivyTop) c.drawPath(ivyTop, stroke('#A8D36E', 0.4, 0.35));
  const berries = svgPathOnce(decor.ivyBerries);
  if (berries) c.drawPath(berries, fill(THEME.berry));

  // 7. Raised props (dead ends only) — each draws its own soft shadow
  for (const pr of decor.props) {
    switch (pr.kind) {
      case 'crate':
        drawCrate(c, pr.x, pr.y, pr.s, pr.rot);
        break;
      case 'crates':
        drawCrate(c, pr.x, pr.y, pr.s, pr.rot);
        drawCrate(c, pr.x + pr.s * 0.3, pr.y - pr.s * 0.35, pr.s * 0.72, -pr.rot * 1.5);
        break;
      case 'barrel':
        drawBarrel(c, pr.x, pr.y, pr.s * 0.55);
        break;
      case 'rocks':
        drawRocks(c, pr.x, pr.y, pr.s * 1.2, pr.seed);
        break;
      case 'bones':
        drawBones(c, pr.x, pr.y, pr.s, pr.rot);
        break;
    }
  }
}
