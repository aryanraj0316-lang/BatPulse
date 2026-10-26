import { LevelData, Rect } from '../../types/game';
import { THEME } from '../skia/theme';
import { makeRng, Rng, f, circleD, leafD, blobD, clamp } from './kit';

/**
 * Seeded, level-specific decoration data (visual only — never touches gameplay).
 * Same level → same decoration every time.
 */

export interface LanternDecor {
  x: number;
  y: number;
  seed: number;
}

export type PropKind = 'crate' | 'crates' | 'barrel' | 'rocks' | 'bones' | 'grate';

export interface PropDecor {
  kind: PropKind;
  x: number;
  y: number;
  s: number;
  rot: number;
  seed: number;
}

/** A swaying clump of leaves. Paths are local to (x, y). */
export interface BushDecor {
  x: number;
  y: number;
  r: number;
  phase: number;
  shadow: string;
  deep: string;
  dark: string;
  mid: string;
  light: string;
  tips: string;
  berries: string;
}

export interface VineDecor {
  x: number;
  y: number;
  phase: number;
  stem: string;
  leaves: string;
  leavesLight: string;
}

/** Decorative spike bed (dead ends only — purely visual). */
export interface SpikeBedDecor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelDecor {
  cellW: number;
  cellH: number;
  cellMin: number;
  /** visual wall thickening on each side of the collision rect */
  wallPad: number;
  /** height of the south facet */
  facet: number;
  walls: Rect[];
  // floor clutter
  cracks: string;
  pebbles: string;
  pebblesLight: string;
  twigs: string;
  twigsLight: string;
  litterDark: string;
  litter: string;
  // wall-top vegetation (drawn clipped to the wall caps)
  mossDark: string;
  moss: string;
  ivy: [string, string, string, string];
  ivyBerries: string;
  // placed things
  lanterns: LanternDecor[];
  props: PropDecor[];
  spikeBeds: SpikeBedDecor[];
  bushes: BushDecor[];
  vines: VineDecor[];
  // outer border framing (rocks + broad leaves, kept on the border strip)
  borderRocks: { d: string; hl: string }[];
  borderLeaves: [string, string, string, string];
}

export function makeBush(rng: Rng, x: number, y: number, r: number): BushDecor {
  let shadow = '';
  let deep = '';
  let dark = '';
  let mid = '';
  let light = '';
  let tips = '';
  let berries = '';
  shadow += circleD(2, 3, r * 0.95);
  const n = Math.round(10 + r * 1.5);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * r * 0.62;
    const bx = Math.cos(a) * d;
    const by = Math.sin(a) * d;
    const len = r * rng.range(0.42, 0.66);
    const ang = a + rng.range(-0.6, 0.6);
    const leaf = leafD(bx, by, len, len * 0.36, ang);
    const outer = d / (r * 0.62);
    const lit = -Math.cos(a) * 0.5 - Math.sin(a) * 0.5;
    if (i < n * 0.22) deep += leaf;
    else if (outer < 0.45) dark += leaf;
    else if (lit > 0.25) light += leaf;
    else mid += leaf;
    if (lit > 0.35 && rng.chance(0.4)) {
      const tx = bx + Math.cos(ang) * len * 0.75;
      const ty = by + Math.sin(ang) * len * 0.75;
      tips += leafD(tx, ty, len * 0.35, len * 0.13, ang);
    }
  }
  if (r > 12 && rng.chance(0.35)) {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(r * 0.2, r * 0.6);
      berries += circleD(Math.cos(a) * d, Math.sin(a) * d, rng.range(0.9, 1.5));
    }
  }
  return { x, y, r, phase: rng.range(0, Math.PI * 2), shadow, deep, dark, mid, light, tips, berries };
}

export function makeVine(rng: Rng, x: number, y: number, len: number): VineDecor {
  let stem = `M0,0`;
  let leaves = '';
  let leavesLight = '';
  const bend = rng.range(-4, 4);
  const steps = 6;
  let px = 0;
  let py = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = Math.sin(t * Math.PI * 1.2) * bend;
    const ny = t * len;
    stem += `L${f(nx)},${f(ny)}`;
    if (i > 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const ang = Math.PI / 2 + side * rng.range(0.6, 1.1);
      const ll = rng.range(3.2, 5);
      const leaf = leafD(nx, ny, ll, ll * 0.42, ang);
      if (rng.chance(0.45)) leavesLight += leaf;
      else leaves += leaf;
    }
    px = nx;
    py = ny;
  }
  leaves += leafD(px, py, 4.5, 2, Math.PI / 2 + rng.range(-0.3, 0.3));
  return { x, y, phase: rng.range(0, Math.PI * 2), stem, leaves, leavesLight };
}

export function buildDecor(level: LevelData, worldW: number, worldH: number): LevelDecor {
  const rng = makeRng(level.seed * 7 + 13);
  const cols = level.grid.cols;
  const rows = level.grid.rows;
  const cellW = worldW / cols;
  const cellH = worldH / rows;
  const cellMin = Math.min(cellW, cellH);
  // Walls look thicker in roomy mazes, stay slim in tight ones so art matches collision.
  const wallPad = clamp((cellMin - 26) * 0.2, 1.5, THEME.wallMaxPad);
  const facet = clamp(wallPad + 2.5, 3, THEME.wallFacetHeight);
  const walls: Rect[] = level.walls;

  const cellKey = (x: number, y: number) =>
    `${clamp(Math.floor(x / cellW), 0, cols - 1)},${clamp(Math.floor(y / cellH), 0, rows - 1)}`;

  const occupied = new Set<string>();
  occupied.add(cellKey(level.spawn.x, level.spawn.y));
  occupied.add(cellKey(level.goal.x, level.goal.y));
  for (const o of level.objects) occupied.add(cellKey(o.x + o.width / 2, o.y + o.height / 2));
  for (const h of level.hunters) occupied.add(cellKey(h.anchor.x, h.anchor.y));

  // ─── Which cell sides have walls (read back from the meshed wall rects) ───
  const vWalls = new Set<string>(); // wall between (c,r) and (c+1,r)
  const hWalls = new Set<string>(); // wall between (c,r) and (c,r+1)
  for (const w of walls) {
    if (w.id.startsWith('w_border')) continue;
    if (w.height > w.width) vWalls.add(`${Math.round((w.x + w.width / 2) / cellW) - 1},${Math.round(w.y / cellH)}`);
    else hWalls.add(`${Math.round(w.x / cellW)},${Math.round((w.y + w.height / 2) / cellH) - 1}`);
  }
  const wallOn = (c: number, r: number, side: 'l' | 'r' | 't' | 'b') => {
    if (side === 'l') return c === 0 || vWalls.has(`${c - 1},${r}`);
    if (side === 'r') return c === cols - 1 || vWalls.has(`${c},${r}`);
    if (side === 't') return r === 0 || hWalls.has(`${c},${r - 1}`);
    return r === rows - 1 || hWalls.has(`${c},${r}`);
  };
  const deadEnds: { c: number; r: number; open: 'l' | 'r' | 't' | 'b'; k: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied.has(`${c},${r}`)) continue;
      const sides = (['l', 'r', 't', 'b'] as const).filter((s) => !wallOn(c, r, s));
      if (sides.length === 1) deadEnds.push({ c, r, open: sides[0], k: rng.next() });
    }
  }
  deadEnds.sort((a, b) => a.k - b.k);

  // ─── Floor clutter (sparse) ─────────────────────────────────
  const area = (worldW * worldH) / (80 * 80);
  let cracks = '';
  let twigs = '';
  let twigsLight = '';
  let pebbles = '';
  let pebblesLight = '';
  let litterDark = '';
  let litter = '';
  for (let i = 0; i < Math.round(area * 0.18); i++) {
    let cx = rng.range(0, worldW);
    let cy = rng.range(0, worldH);
    cracks += `M${f(cx)},${f(cy)}`;
    let ang = rng.range(0, Math.PI * 2);
    const segs = rng.int(2, 4);
    for (let s = 0; s < segs; s++) {
      ang += rng.range(-0.9, 0.9);
      const l = rng.range(3, 7);
      cx += Math.cos(ang) * l;
      cy += Math.sin(ang) * l;
      cracks += `L${f(cx)},${f(cy)}`;
    }
  }
  for (let i = 0; i < Math.round(area * 0.2); i++) {
    const cx = rng.range(0, worldW);
    const cy = rng.range(0, worldH);
    const ang = rng.range(0, Math.PI * 2);
    const l = rng.range(4, 9);
    const d = `M${f(cx)},${f(cy)}l${f(Math.cos(ang) * l)},${f(Math.sin(ang) * l)}M${f(cx + Math.cos(ang) * l * 0.5)},${f(cy + Math.sin(ang) * l * 0.5)}l${f(Math.cos(ang + 0.7) * l * 0.35)},${f(Math.sin(ang + 0.7) * l * 0.35)}`;
    if (rng.chance(0.4)) twigsLight += d;
    else twigs += d;
  }
  for (let i = 0; i < Math.round(area * 0.35); i++) {
    const cx = rng.range(0, worldW);
    const cy = rng.range(0, worldH);
    const r = rng.range(0.7, 1.8);
    pebbles += blobD(rng, cx, cy, r, 6);
    if (rng.chance(0.6)) pebblesLight += circleD(cx - r * 0.3, cy - r * 0.3, r * 0.35);
  }
  for (let i = 0; i < Math.round(area * 0.4); i++) {
    const edge = rng.int(0, 3);
    const depth = Math.pow(rng.next(), 2.2) * cellMin * 1.2;
    const along = rng.next();
    const cx = edge === 0 ? along * worldW : edge === 1 ? worldW - depth : edge === 2 ? along * worldW : depth;
    const cy = edge === 0 ? depth : edge === 1 ? along * worldH : edge === 2 ? worldH - depth : along * worldH;
    const leaf = leafD(cx, cy, rng.range(2.5, 4), 1.2, rng.range(0, Math.PI * 2));
    if (rng.chance(0.5)) litterDark += leaf;
    else litter += leaf;
  }

  // ─── Moss + ivy on wall tops (clipped to the caps when drawn) ───
  let mossDark = '';
  let moss = '';
  const ivy: [string, string, string, string] = ['', '', '', ''];
  let ivyBerries = '';
  for (const w of walls) {
    const horizontal = w.width >= w.height;
    const len = horizontal ? w.width : w.height;
    const thick = horizontal ? w.height : w.width;
    // moss creeping along the cap (some walls mossy, most barely)
    const density = rng.chance(0.55) ? rng.range(0.7, 1.4) : rng.range(0.1, 0.4);
    const blobs = Math.floor((len / 7) * density);
    for (let i = 0; i < blobs; i++) {
      const t = rng.range(0, len);
      const across = rng.range(-wallPad, thick + wallPad);
      const bx = horizontal ? w.x + t : w.x + across;
      const by = horizontal ? w.y + across : w.y + t;
      const r = rng.range(1.8, 4.4);
      if (rng.chance(0.5)) mossDark += circleD(bx, by, r);
      else moss += circleD(bx + rng.range(-1, 1), by + rng.range(-1, 1), r * 0.8);
    }
    // ivy clusters at some wall ends (leaves spill only slightly past the cap)
    if (rng.chance(0.28)) {
      const atStart = rng.chance(0.5);
      const ex = horizontal ? (atStart ? w.x + 3 : w.x + w.width - 3) : w.x + w.width / 2;
      const ey = horizontal ? w.y + w.height / 2 : atStart ? w.y + 3 : w.y + w.height - 3;
      const leaves = rng.int(6, 11);
      for (let i = 0; i < leaves; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, 3.5);
        const ll = rng.range(2.4, 4.4);
        const leaf = leafD(ex + Math.cos(a) * d, ey + Math.sin(a) * d, ll, ll * 0.42, a + rng.range(-0.5, 0.5));
        ivy[Math.min(3, Math.floor(rng.next() * 4))] += leaf;
      }
      if (rng.chance(0.35)) {
        const nb = rng.int(1, 3);
        for (let b = 0; b < nb; b++) ivyBerries += circleD(ex + rng.range(-3, 3), ey + rng.range(-3, 3), rng.range(0.6, 1));
      }
    }
  }

  // ─── Lanterns (on wall tops, spaced out, clear of the HUD) ───
  const lanterns: LanternDecor[] = [];
  const lanternTarget = clamp(Math.round(area / 7), 3, 7);
  const candidates = walls
    .filter((w) => !w.id.startsWith('w_border') && Math.max(w.width, w.height) >= cellMin * 0.8)
    .map((w) => ({ w, k: rng.next() }))
    .sort((a, b) => a.k - b.k)
    .map((c) => c.w);
  for (const w of candidates) {
    if (lanterns.length >= lanternTarget) break;
    const lx = w.x + w.width / 2;
    const ly = w.y + w.height / 2;
    if (ly < cellH * 1.2) continue;
    if (lanterns.some((l) => Math.hypot(l.x - lx, l.y - ly) < cellMin * 2.4)) continue;
    lanterns.push({ x: lx, y: ly, seed: rng.range(0, 100) });
  }

  // ─── Props + spike beds: only in dead ends (purely decorative) ───
  const props: PropDecor[] = [];
  const spikeBeds: SpikeBedDecor[] = [];
  const inset = 4 + wallPad + 2;
  let spikesLeft = cellMin >= 40 ? 2 : 0;
  let grates = 0;
  for (const de of deadEnds) {
    const x0 = de.c * cellW;
    const y0 = de.r * cellH;
    // the closed end is opposite the opening
    const closedSide = ({ l: 'r', r: 'l', t: 'b', b: 't' } as const)[de.open];
    if (spikesLeft > 0 && rng.chance(0.5)) {
      spikesLeft--;
      const depth = Math.min(cellW, cellH) * 0.42;
      const across = (closedSide === 'l' || closedSide === 'r' ? cellH : cellW) - inset * 2;
      if (closedSide === 'b') spikeBeds.push({ x: x0 + inset, y: y0 + cellH - inset - depth, w: across, h: depth });
      else if (closedSide === 't') spikeBeds.push({ x: x0 + inset, y: y0 + inset, w: across, h: depth });
      else if (closedSide === 'l') spikeBeds.push({ x: x0 + inset, y: y0 + inset, w: depth, h: across });
      else spikeBeds.push({ x: x0 + cellW - inset - depth, y: y0 + inset, w: depth, h: across });
      continue;
    }
    if (cellMin < 40) continue;
    const s = clamp(cellMin * 0.26, 9, 16);
    const roll = rng.next();
    let kind: PropKind = roll < 0.3 ? 'crate' : roll < 0.42 ? 'crates' : roll < 0.65 ? 'barrel' : roll < 0.82 ? 'rocks' : roll < 0.92 ? 'bones' : 'grate';
    if (kind === 'grate' && grates >= 2) kind = 'barrel';
    if (kind === 'grate') grates++;
    // tuck it into the closed end of the dead end
    const cx = x0 + cellW / 2;
    const cy = y0 + cellH / 2;
    const off = (closedSide === 'l' || closedSide === 'r' ? cellW : cellH) / 2 - inset - s * 0.6;
    const px = closedSide === 'l' ? cx - off : closedSide === 'r' ? cx + off : cx + rng.range(-cellW * 0.15, cellW * 0.15);
    const py = closedSide === 't' ? cy - off : closedSide === 'b' ? cy + off : cy + rng.range(-cellH * 0.15, cellH * 0.15);
    props.push({
      kind,
      x: px,
      y: py,
      s: kind === 'grate' ? clamp(cellMin * 0.38, 14, 24) : s,
      rot: rng.range(-0.35, 0.35),
      seed: rng.range(0, 100),
    });
  }

  // ─── Outer border framing: rocks + broad leaves on the border strip only ───
  const strip = 4 + wallPad + 2; // never reach past the border wall art
  const borderRocks: { d: string; hl: string }[] = [];
  const borderLeaves: [string, string, string, string] = ['', '', '', ''];
  const walkEdge = (len: number, place: (t: number, inward: number) => { x: number; y: number; ang: number }) => {
    let t = rng.range(0, 14);
    while (t < len) {
      if (rng.chance(0.45)) {
        const r = rng.range(strip * 0.7, strip * 1.25);
        const p = place(t, rng.range(-r * 0.5, Math.max(-r * 0.5, strip - r * 0.6)));
        borderRocks.push({ d: blobD(rng, p.x, p.y, r, 8), hl: circleD(p.x - r * 0.3, p.y - r * 0.3, r * 0.35) });
        t += r * rng.range(1.2, 2);
      } else {
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          const p = place(t + rng.range(-5, 5), rng.range(-3, 1));
          const ll = rng.range(strip * 0.9, strip * 1.5);
          const leaf = leafD(p.x, p.y, ll, ll * 0.42, p.ang + rng.range(-0.9, 0.9));
          borderLeaves[Math.min(3, Math.floor(rng.next() * 4))] += leaf;
        }
        t += rng.range(8, 16);
      }
    }
  };
  walkEdge(worldH, (t, i) => ({ x: i, y: t, ang: 0 }));
  walkEdge(worldH, (t, i) => ({ x: worldW - i, y: t, ang: Math.PI }));
  walkEdge(worldW, (t, i) => ({ x: t, y: worldH - i, ang: -Math.PI / 2 }));

  // swaying shrubs tucked into the two bottom corners (off the playfield)
  const bushes: BushDecor[] = [];
  const shrubR = clamp(strip * 1.4, 7, 12);
  bushes.push(makeBush(rng, -shrubR * 0.3, worldH + shrubR * 0.3, shrubR));
  bushes.push(makeBush(rng, worldW + shrubR * 0.3, worldH + shrubR * 0.3, shrubR));

  // vines hanging off the top border wall
  const vines: VineDecor[] = [];
  for (const w of walls) {
    if (w.id !== 'w_border_t') continue;
    const count = Math.round(w.width / 70);
    for (let i = 0; i < count; i++) {
      const vx = w.x + rng.range(0.1, 0.9) * w.width;
      const vy = w.y + w.height + wallPad;
      if (vy < cellH * 1.2) continue;
      vines.push(makeVine(rng, vx, vy, rng.range(cellH * 0.12, cellH * 0.2)));
    }
  }

  return {
    cellW,
    cellH,
    cellMin,
    wallPad,
    facet,
    walls,
    cracks,
    pebbles,
    pebblesLight,
    twigs,
    twigsLight,
    litterDark,
    litter,
    mossDark,
    moss,
    ivy,
    ivyBerries,
    lanterns,
    props,
    spikeBeds,
    bushes,
    vines,
    borderRocks,
    borderLeaves,
  };
}
