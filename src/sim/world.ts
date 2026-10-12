import { DoorDef, LevelDef, MovingHazardDef, PickupDef, SwitchDef, WallType } from '../levels/schema';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { Box } from './collision';

export type RevealKind = 'wall' | 'spike' | 'finish' | 'hazard' | 'switch' | 'door' | 'pickup';

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
  pickups: PickupDef[];
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
  const finish = { x: def.finish.x, y: def.finish.y, radius: def.finish.radius ?? 18 };
  revealables.push({
    x: finish.x - finish.radius,
    y: finish.y - finish.radius,
    width: finish.radius * 2,
    height: finish.radius * 2,
    kind: 'finish',
    variant: 'normal',
  });
  const doorSwitch = def.doors.map((d) => def.switches.findIndex((sw) => sw.id === d.switchId));
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
    pickups: def.pickups,
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
