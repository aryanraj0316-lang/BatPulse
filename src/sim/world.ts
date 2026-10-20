import { DoorDef, EnemyDef, KeyDef, LevelDef, MovingHazardDef, PickupDef, SafeZoneDef, SwitchDef, WallType } from '../levels/schema';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { Box } from './collision';

export type RevealKind = 'wall' | 'spike' | 'finish' | 'hazard' | 'switch' | 'door' | 'pickup' | 'key' | 'enemy';

/** Something a pulse can light up. Static: built once per level load. */
export interface Revealable extends Box {
  kind: RevealKind;
  variant: WallType; // wall surface; 'normal' for non-walls
  /** Index into the matching world list (hazards / switches / doors / pickups). */
  ref?: number;
}

export interface World {
  def: LevelDef;
  /** Solid boxes the bat cannot enter. */
  solids: Box[];
  /** Boxes that kill on touch. */
  spikes: Box[];
  /** Everything revealable (long walls are split into short pieces so a pulse only lights what it reaches). */
  revealables: Revealable[];
  finish: { x: number; y: number; radius: number };
  hazards: MovingHazardDef[];
  switches: SwitchDef[];
  /** Index of the switch each door listens to (parallel to doors). */
  doors: DoorDef[];
  doorSwitch: number[];
  /** Index of the key that unlocks each door (parallel to doors), -1 for doors a switch opens. */
  doorKey: number[];
  pickups: PickupDef[];
  keys: KeyDef[];
  safeZones: SafeZoneDef[];
  enemies: EnemyDef[];
}

/** Splits a box along its longer axis into pieces no longer than maxLen. */
function segments(b: Box, maxLen: number): Box[] {
  const horizontal = b.width >= b.height;
  const len = horizontal ? b.width : b.height;
  const n = Math.max(1, Math.ceil(len / maxLen));
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    const a = (len * i) / n;
    const c = (len * (i + 1)) / n;
    out.push(
      horizontal
        ? { x: b.x + a, y: b.y, width: c - a, height: b.height }
        : { x: b.x, y: b.y + a, width: b.width, height: c - a },
    );
  }
  return out;
}

/**
 * The pieces of a wall that can light up.
 * Thin walls are cut along their length. Thick solid blocks only glow along their outline (the look is
 * thin neon edges, the inside stays dark), so only the four edge strips become revealable, each cut short.
 */
export function wallPieces(b: Box, maxLen: number, edge: number): Box[] {
  if (Math.min(b.width, b.height) <= edge * 2) return segments(b, maxLen);
  const strips: Box[] = [
    { x: b.x, y: b.y, width: b.width, height: edge }, // top
    { x: b.x, y: b.y + b.height - edge, width: b.width, height: edge }, // bottom
    { x: b.x, y: b.y + edge, width: edge, height: b.height - edge * 2 }, // left
    { x: b.x + b.width - edge, y: b.y + edge, width: edge, height: b.height - edge * 2 }, // right
  ];
  return strips.flatMap((s) => segments(s, maxLen));
}

/** Finish ring radius when a level does not set one. */
export const DEFAULT_FINISH_RADIUS = 18;

export function buildWorld(def: LevelDef, segmentLen: number, edge: number = ECHO_CONFIG.world.edgeThickness): World {
  const solids: Box[] = def.walls.map((w) => ({ x: w.x, y: w.y, width: w.width, height: w.height }));
  const spikes: Box[] = def.spikes.map((s) => ({ ...s }));
  const revealables: Revealable[] = [];

  for (const w of def.walls) {
    for (const seg of wallPieces(w, segmentLen, edge)) revealables.push({ ...seg, kind: 'wall', variant: w.type });
  }
  for (const s of def.spikes) {
    // spikes are drawn whole (filled triangles), so they are only cut along their length
    for (const seg of segments(s, segmentLen)) revealables.push({ ...seg, kind: 'spike', variant: 'normal' });
  }
  // doors, switches, pickups and moving hazards are revealable too (hazards are re-positioned every step)
  def.movingHazards.forEach((h, i) => revealables.push({ x: h.x, y: h.y, width: h.width, height: h.height, kind: 'hazard', variant: 'normal', ref: i }));
  const sr = ECHO_CONFIG.switch.radius;
  def.switches.forEach((sw, i) => revealables.push({ x: sw.x - sr, y: sw.y - sr, width: sr * 2, height: sr * 2, kind: 'switch', variant: 'normal', ref: i }));
  def.doors.forEach((d, i) => revealables.push({ x: d.x, y: d.y, width: d.width, height: d.height, kind: 'door', variant: 'normal', ref: i }));
  const pr = ECHO_CONFIG.pickup.radius;
  def.pickups.forEach((p, i) => revealables.push({ x: p.x - pr, y: p.y - pr, width: pr * 2, height: pr * 2, kind: 'pickup', variant: 'normal', ref: i }));
  // keys are hidden until a pulse reaches them
  const kr = ECHO_CONFIG.key.radius;
  (def.keys ?? []).forEach((k, i) => revealables.push({ x: k.x - kr, y: k.y - kr, width: kr * 2, height: kr * 2, kind: 'key', variant: 'normal', ref: i }));
  const er = ECHO_CONFIG.enemy.radius;
  def.enemies.forEach((e, i) =>
    revealables.push({ x: e.waypoints[0].x - er, y: e.waypoints[0].y - er, width: er * 2, height: er * 2, kind: 'enemy', variant: 'normal', ref: i }),
  );
  const finish = { x: def.finish.x, y: def.finish.y, radius: def.finish.radius ?? DEFAULT_FINISH_RADIUS };
  revealables.push({
    x: finish.x - finish.radius,
    y: finish.y - finish.radius,
    width: finish.radius * 2,
    height: finish.radius * 2,
    kind: 'finish',
    variant: 'normal',
  });
  const doorSwitch = def.doors.map((d) => (d.switchId === undefined ? -1 : def.switches.findIndex((sw) => sw.id === d.switchId)));
  const keys = def.keys ?? [];
  const doorKey = def.doors.map((d) => (d.keyId === undefined ? -1 : keys.findIndex((k) => k.id === d.keyId)));
  return {
    def,
    solids,
    spikes,
    revealables,
    finish,
    hazards: def.movingHazards,
    switches: def.switches,
    doors: def.doors,
    doorSwitch,
    doorKey,
    pickups: def.pickups,
    keys,
    safeZones: def.safeZones ?? [],
    enemies: def.enemies,
  };
}

/**
 * Uniform scale + centring that fits a level into the screen without distortion.
 * World units are the level's own coordinates.
 */
export function fitView(screenW: number, screenH: number, levelW: number, levelH: number) {
  const scale = Math.min(screenW / levelW, screenH / levelH);
  return {
    scale,
    offsetX: (screenW - levelW * scale) / 2,
    offsetY: (screenH - levelH * scale) / 2,
  };
}

/** Pulse radius in world units: a fraction of the SCREEN width, whatever the level's size. */
export function pulseRadiusWorld(screenW: number, scale: number, fraction: number, mult: number = 1): number {
  return ((screenW * fraction) / scale) * mult;
}

export interface Viewport {
  /** Pixels per world unit. */
  scale: number;
  offsetX: number;
  /** True when the level is taller than the screen and the camera follows the bat. */
  scrolls: boolean;
  /** Where the view area starts and how tall it is (below the HUD), in screen px. */
  viewTop: number;
  viewH: number;
  levelH: number;
  /** Vertical offset used when the level does not scroll (it is centred in the view area). */
  baseOffsetY: number;
}

/**
 * Fits a level into the screen. A level that fits is centred; a taller one (multi-room and escape levels) is scaled to
 * the screen WIDTH and scrolled vertically to follow the bat.
 */
export function fitViewport(screenW: number, viewTop: number, viewH: number, levelW: number, levelH: number): Viewport {
  const fit = Math.min(screenW / levelW, viewH / levelH);
  const widthScale = screenW / levelW;
  const scrolls = levelH * widthScale > viewH + 0.5;
  const scale = scrolls ? widthScale : fit;
  return {
    scale,
    offsetX: (screenW - levelW * scale) / 2,
    scrolls,
    viewTop,
    viewH,
    levelH,
    baseOffsetY: viewTop + (viewH - levelH * scale) / 2,
  };
}

/** Screen y offset for the world, given where the bat is. The camera keeps the bat centred but never shows past the level. */
export function viewOffsetY(v: Viewport, batY: number): number {
  if (!v.scrolls) return v.baseOffsetY;
  const visibleWorld = v.viewH / v.scale;
  const top = Math.min(Math.max(0, batY - visibleWorld / 2), v.levelH - visibleWorld);
  return v.viewTop - top * v.scale;
}
