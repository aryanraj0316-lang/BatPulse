import { ECHO_CONFIG } from '../constants/gameConfig';
import { MovingHazardDef } from '../levels/schema';
import { Box, circleOverlapsBox } from './collision';

/** Where a moving hazard is at a given time. Mutated in place (no allocation). */
export interface HazardPose {
  /** Top-left of the hazard's bounding box. */
  x: number;
  y: number;
  /** Rotation in radians (blades only). */
  angle: number;
}

/** Smooth out-and-back 0..1..0 over one cycle (eased, so sliders slow down at the ends and give a readable window). */
export function pingPong(t: number, loopSec: number, phase: number = 0): number {
  return (1 - Math.cos(2 * Math.PI * (t / loopSec + phase))) / 2;
}

export function hazardPose(h: MovingHazardDef, t: number, out: HazardPose): HazardPose {
  const phase = h.phase ?? 0;
  if (h.kind === 'slider') {
    const k = pingPong(t, h.loopSec, phase);
    out.x = h.x + (h.travel?.x ?? 0) * k;
    out.y = h.y + (h.travel?.y ?? 0) * k;
    out.angle = 0;
  } else {
    out.x = h.x;
    out.y = h.y;
    out.angle = 2 * Math.PI * (t / h.loopSec + phase);
  }
  return out;
}

/** Axis-aligned box that always contains the hazard (used for revealing and as a cheap pre-check). */
export function hazardBounds(h: MovingHazardDef, pose: HazardPose, out: Box): Box {
  out.x = pose.x;
  out.y = pose.y;
  out.width = h.width;
  out.height = h.height;
  return out;
}

const local: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * True when a circle touches the hazard at the given pose.
 * Sliders are plain boxes. Blades are a rotating cross: the circle is moved into the blade's own
 * (unrotated) frame, where the two arms are ordinary boxes.
 */
export function circleHitsHazard(
  h: MovingHazardDef,
  pose: HazardPose,
  cx: number,
  cy: number,
  r: number,
  forgiveness: number = ECHO_CONFIG.hazards.spikeForgiveness,
): boolean {
  if (h.kind === 'slider') {
    local.x = pose.x;
    local.y = pose.y;
    local.width = h.width;
    local.height = h.height;
    return circleOverlapsBox(cx, cy, r, local, forgiveness);
  }
  const mx = pose.x + h.width / 2;
  const my = pose.y + h.height / 2;
  const cos = Math.cos(-pose.angle);
  const sin = Math.sin(-pose.angle);
  const dx = cx - mx;
  const dy = cy - my;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const len = Math.max(h.width, h.height);
  const t = ECHO_CONFIG.hazards.bladeThickness;
  local.x = -len / 2;
  local.y = -t / 2;
  local.width = len;
  local.height = t;
  if (circleOverlapsBox(lx, ly, r, local, forgiveness)) return true;
  local.x = -t / 2;
  local.y = -len / 2;
  local.width = t;
  local.height = len;
  return circleOverlapsBox(lx, ly, r, local, forgiveness);
}

/** True when the straight segment (ax,ay)-(bx,by) crosses the box (slab test). */
export function segmentHitsBox(ax: number, ay: number, bx: number, by: number, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const axes: [number, number, number, number][] = [
    [dx, ax, b.x, b.x + b.width],
    [dy, ay, b.y, b.y + b.height],
  ];
  for (const [d, a, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (a < lo || a > hi) return false;
    } else {
      let ta = (lo - a) / d;
      let tb = (hi - a) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}
