export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A moving circle. Mutated in place by the resolver (no allocation per frame). */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/**
 * Pushes the circle out of every box it overlaps and removes the velocity component that
 * pointed into the box, so the body slides along walls instead of sticking.
 * Corners work too (push-out is along the circle-to-closest-point vector).
 * Returns the highest speed (px/s) with which the body ran into something, 0 if nothing was hit.
 */
export function resolveCircleBoxes(body: Body, boxes: readonly Box[]): number {
  let impact = 0;
  // two passes settle tight corners where one push can move the circle into a neighbour
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const cx = clamp(body.x, b.x, b.x + b.width);
      const cy = clamp(body.y, b.y, b.y + b.height);
      let dx = body.x - cx;
      let dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= body.r * body.r) continue;

      let nx: number;
      let ny: number;
      let push: number;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        ny = dy / d;
        push = body.r - d;
      } else {
        // centre is inside the box: leave through the nearest edge
        const left = body.x - b.x;
        const right = b.x + b.width - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.height - body.y;
        const m = Math.min(left, right, top, bottom);
        nx = 0;
        ny = 0;
        if (m === left) nx = -1;
        else if (m === right) nx = 1;
        else if (m === top) ny = -1;
        else ny = 1;
        push = m + body.r;
      }
      body.x += nx * push;
      body.y += ny * push;
      const into = -(body.vx * nx + body.vy * ny);
      if (into > 0) {
        body.vx += nx * into;
        body.vy += ny * into;
        if (into > impact) impact = into;
      }
      dx = 0;
      dy = 0;
    }
  }
  return impact;
}

/** True when the circle overlaps the box shrunk by `inset` on every side. */
export function circleOverlapsBox(x: number, y: number, r: number, b: Box, inset: number = 0): boolean {
  const bx = b.x + inset;
  const by = b.y + inset;
  const bw = Math.max(0, b.width - inset * 2);
  const bh = Math.max(0, b.height - inset * 2);
  const cx = clamp(x, bx, bx + bw);
  const cy = clamp(y, by, by + bh);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** Shortest distance from a point to a box (0 when inside). */
export function distanceToBox(px: number, py: number, b: Box): number {
  const cx = clamp(px, b.x, b.x + b.width);
  const cy = clamp(py, b.y, b.y + b.height);
  return Math.hypot(px - cx, py - cy);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
