export interface StickOut {
  x: number;
  y: number;
  /** Magnitude after dead-zone removal, 0..1 */
  mag: number;
}

/**
 * Converts a thumb drag (pixels from the stick centre) into a movement vector.
 * Inside the dead zone the output is exactly zero; outside it the range is re-mapped so the
 * response starts smoothly at 0 instead of jumping to `deadZone`.
 * Writes into `out` so it can be called every touch event without allocating.
 */
export function stickFromDrag(dx: number, dy: number, radius: number, deadZone: number, out: StickOut): StickOut {
  const dist = Math.hypot(dx, dy);
  const raw = radius > 0 ? Math.min(1, dist / radius) : 0;
  if (raw <= deadZone || dist === 0) {
    out.x = 0;
    out.y = 0;
    out.mag = 0;
    return out;
  }
  const mag = (raw - deadZone) / (1 - deadZone);
  out.x = (dx / dist) * mag;
  out.y = (dy / dist) * mag;
  out.mag = mag;
  return out;
}

/** Limits the visual knob offset to the stick radius. */
export function clampKnob(dx: number, dy: number, radius: number): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist <= radius || dist === 0) return { x: dx, y: dy };
  return { x: (dx / dist) * radius, y: (dy / dist) * radius };
}
