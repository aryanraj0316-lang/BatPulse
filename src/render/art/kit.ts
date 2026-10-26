/**
 * Art kit: colours + tiny geometry helpers shared by every procedural asset.
 * All assets are vector paths, so they stay crisp on any phone size.
 */

export const ART = {
  // Floor
  floorMortar: '#07080A',
  floorA: '#14171B',
  floorB: '#111418',
  floorC: '#181B20',
  floorD: '#0F1215',

  // Stone walls
  stoneA: '#5E5C4C',
  stoneB: '#4D4C3F',
  stoneC: '#6B6853',
  stoneD: '#56554A',
  stoneMortar: '#22231B',
  stoneSide: '#26271F',
  stoneSideDark: '#16170F',
  stoneHighlight: '#A9A585',

  // Vegetation
  mossDeep: '#14280F',
  mossDark: '#1F3A17',
  moss: '#2E5A21',
  mossLight: '#4C8A32',
  leafTip: '#86BF4E',
  twig: '#4A3523',
  twigLight: '#6E5136',

  // Wood + iron props
  wood: '#7A4E2B',
  woodDark: '#3E2614',
  woodLight: '#A8743F',
  iron: '#23272C',
  ironMid: '#3A4148',
  ironLight: '#6B757F',

  // Light
  amber: '#FFB547',
  amberCore: '#FFF1C2',
  flame: '#FF8A1F',

  // Water
  waterDeep: '#031A21',
  water: '#073845',
  waterMid: '#0E5866',
  waterLight: '#3FD3E6',

  // Rocks
  rock: '#2A2E34',
  rockLight: '#48505A',
  rockDark: '#171A1E',

  // Player bat
  batBody: '#3B2A24',
  batFur: '#6A4E40',
  batWing: '#4B3630',
  batWingDark: '#24181A',
  batBone: '#8A6A57',
  batEye: '#FFE9C4',

  // Wraith bat
  wraithBody: '#2B060B',
  wraithWing: '#5C0E19',
  wraithWingDark: '#22040A',
  wraithBone: '#A1202F',
  wraithRed: '#FF3B4E',
  wraithHot: '#FF8A94',

  // Goal / exit
  exitDeep: '#03142A',
  exitBlue: '#2E8BFF',
  exitCyan: '#61D9FF',

  // Gold (key, energy orb)
  gold: '#FFC24A',
  goldLight: '#FFE9A8',
  goldDark: '#A86F16',

  // Sonar
  cyan: '#4DF0FF',
  cyanSoft: '#9AF6FF',
  violet: '#B47DFF',
};

/** Deterministic RNG (mulberry32) so decor is identical every time a level loads. */
export function makeRng(seed: number) {
  let s = (Math.abs(seed) || 1) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a: number, b: number) => a + next() * (b - a),
    int: (a: number, b: number) => Math.floor(a + next() * (b - a + 1)),
    pick: <T,>(arr: T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof makeRng>;

/** Round to 1 decimal to keep SVG path strings short. */
export const f = (n: number) => Math.round(n * 10) / 10;

export const circleD = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(r * 2)},0a${f(r)},${f(r)} 0 1,0 ${f(-r * 2)},0Z`;

export const rectD = (x: number, y: number, w: number, h: number) =>
  `M${f(x)},${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;

/** A pointed leaf whose base sits at (x,y), pointing along `angle` (radians). */
export function leafD(x: number, y: number, len: number, width: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = x + c * len;
  const ty = y + s * len;
  const mx = x + c * len * 0.5;
  const my = y + s * len * 0.5;
  const nx = -s * width;
  const ny = c * width;
  return `M${f(x)},${f(y)}Q${f(mx + nx)},${f(my + ny)} ${f(tx)},${f(ty)}Q${f(mx - nx)},${f(my - ny)} ${f(x)},${f(y)}Z`;
}

/** Irregular polygon (rock / pebble). */
export function blobD(rng: Rng, cx: number, cy: number, r: number, points = 7) {
  let d = '';
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * rng.range(0.72, 1.08);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.86;
    d += `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`;
  }
  return d + 'Z';
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
