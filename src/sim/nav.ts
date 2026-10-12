import { Box, distanceToBox } from './collision';
import { segmentHitsBox } from './hazards';
import { World } from './world';

/** Nav cells match the 20-unit grid levels are built on, so each cell is wholly wall or wholly floor. */
const CELL = 20;
const MAX_OUT = 255;

/**
 * Walkable-cell grid for enemy path finding.
 * A cell is walkable when a circle of the enemy's radius centred on it touches no wall. Closed doors are
 * stamped in on request (`setClosedDoors`). All buffers are allocated once; `findPath` allocates nothing.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly base: Uint8Array;
  private readonly doorBlock: Uint8Array;
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Int32Array;
  private readonly closed: Int32Array;
  private readonly heap: Int32Array;
  private heapSize = 0;
  private stamp = 0;
  private readonly raw: Int32Array;

  constructor(
    private readonly world: World,
    private readonly radius: number,
  ) {
    const def = world.def;
    this.cols = Math.ceil(def.width / CELL);
    this.rows = Math.ceil(def.height / CELL);
    const n = this.cols * this.rows;
    this.base = new Uint8Array(n);
    this.doorBlock = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);
    this.heap = new Int32Array(n + 1);
    this.raw = new Int32Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        let ok = x >= radius && y >= radius && x <= def.width - radius && y <= def.height - radius;
        for (let i = 0; ok && i < world.solids.length; i++) if (distanceToBox(x, y, world.solids[i]) < radius) ok = false;
        this.base[r * this.cols + c] = ok ? 1 : 0;
      }
    }
  }

  /** Marks the cells covered by closed doors as blocked (call before path requests). */
  setClosedDoors(doors: readonly Box[]): void {
    this.doorBlock.fill(0);
    for (const d of doors) {
      const c0 = Math.max(0, Math.floor((d.x - this.radius) / CELL));
      const c1 = Math.min(this.cols - 1, Math.floor((d.x + d.width + this.radius) / CELL));
      const r0 = Math.max(0, Math.floor((d.y - this.radius) / CELL));
      const r1 = Math.min(this.rows - 1, Math.floor((d.y + d.height + this.radius) / CELL));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const x = c * CELL + CELL / 2;
          const y = r * CELL + CELL / 2;
          if (distanceToBox(x, y, d) < this.radius) this.doorBlock[r * this.cols + c] = 1;
        }
    }
  }

  private walkable(i: number): boolean {
    return this.base[i] === 1 && this.doorBlock[i] === 0;
  }

  cellIndex(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return r * this.cols + c;
  }

  /** Nearest walkable cell to a world point (itself when walkable), or -1 when the level has none nearby. */
  nearestWalkable(x: number, y: number): number {
    const start = this.cellIndex(x, y);
    if (this.walkable(start)) return start;
    const c0 = start % this.cols;
    const r0 = Math.floor(start / this.cols);
    for (let ring = 1; ring <= 8; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          const i = r * this.cols + c;
          if (!this.walkable(i)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** True when a straight walk between two points keeps the full clearance. */
  lineWalkable(ax: number, ay: number, bx: number, by: number): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / (CELL / 2)));
    for (let k = 0; k <= n; k++) {
      const i = this.cellIndex(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
      if (!this.walkable(i)) return false;
    }
    return true;
  }

  /**
   * A* from (sx,sy) to (gx,gy). Writes the route as x,y pairs into `out` (start excluded, goal included, with
   * straight stretches merged) and returns the number of points, or 0 when there is no route.
   */
  findPath(sx: number, sy: number, gx: number, gy: number, out: Float32Array): number {
    const s = this.nearestWalkable(sx, sy);
    const t = this.nearestWalkable(gx, gy);
    if (s < 0 || t < 0) return 0;
    if (s === t) {
      out[0] = gx;
      out[1] = gy;
      return 1;
    }
    this.stamp++;
    const stamp = this.stamp;
    const cols = this.cols;
    const tc = t % cols;
    const tr = Math.floor(t / cols);
    const h = (i: number) => {
      const dx = Math.abs((i % cols) - tc);
      const dy = Math.abs(Math.floor(i / cols) - tr);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    this.heapSize = 0;
    this.g[s] = 0;
    this.f[s] = h(s);
    this.parent[s] = -1;
    this.seen[s] = stamp;
    this.push(s);
    let found = false;
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closed[cur] === stamp) continue;
      this.closed[cur] = stamp;
      if (cur === t) {
        found = true;
        break;
      }
      const cc = cur % cols;
      const cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const ni = nr * cols + nc;
          if (!this.walkable(ni) || this.closed[ni] === stamp) continue;
          if (dc !== 0 && dr !== 0 && (!this.walkable(cr * cols + nc) || !this.walkable(nr * cols + cc))) continue;
          const ng = this.g[cur] + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
          if (this.seen[ni] !== stamp || ng < this.g[ni]) {
            this.seen[ni] = stamp;
            this.g[ni] = ng;
            this.f[ni] = ng + h(ni);
            this.parent[ni] = cur;
            this.push(ni);
          }
        }
      }
    }
    if (!found) return 0;

    // collect the cell route start -> goal, then merge straight stretches (greedy string pulling)
    let m = 0;
    for (let at = t; at !== -1; at = this.parent[at]) this.raw[m++] = at;
    // raw[0] = goal ... raw[m-1] = start  ->  index k from the start side is raw[m - 1 - k]
    const px = (i: number) => (i % cols) * CELL + CELL / 2;
    const py = (i: number) => Math.floor(i / cols) * CELL + CELL / 2;
    const node = (k: number) => this.raw[m - 1 - k];
    let count = 0;
    let ax = sx;
    let ay = sy;
    let anchor = 0; // route index of the node we have already reached (the start cell)
    while (anchor < m - 1) {
      let j = anchor + 1;
      while (j + 1 < m && this.lineWalkable(ax, ay, px(node(j + 1)), py(node(j + 1)))) j++;
      if (j === m - 1) {
        // the last stretch ends at the exact goal when it is walkable, otherwise at the cell centre
        const exact = this.walkable(this.cellIndex(gx, gy));
        out[count * 2] = exact ? gx : px(node(j));
        out[count * 2 + 1] = exact ? gy : py(node(j));
      } else {
        out[count * 2] = px(node(j));
        out[count * 2 + 1] = py(node(j));
      }
      ax = out[count * 2];
      ay = out[count * 2 + 1];
      count++;
      anchor = j;
      if (count >= MAX_OUT) break;
    }
    return count;
  }

  /** Straight line of sight between two points through walls (no clearance needed): used for senses. */
  static sightBlocked(solids: readonly Box[], closedDoors: readonly Box[], ax: number, ay: number, bx: number, by: number): boolean {
    for (let i = 0; i < solids.length; i++) if (segmentHitsBox(ax, ay, bx, by, solids[i])) return true;
    for (let i = 0; i < closedDoors.length; i++) if (segmentHitsBox(ax, ay, bx, by, closedDoors[i])) return true;
    return false;
  }

  private push(i: number) {
    let k = ++this.heapSize;
    this.heap[k] = i;
    while (k > 1 && this.f[this.heap[k >> 1]] > this.f[this.heap[k]]) {
      const t = this.heap[k >> 1];
      this.heap[k >> 1] = this.heap[k];
      this.heap[k] = t;
      k >>= 1;
    }
  }

  private pop(): number {
    const top = this.heap[1];
    this.heap[1] = this.heap[this.heapSize--];
    let k = 1;
    for (;;) {
      let m = k;
      const l = k * 2;
      const r = l + 1;
      if (l <= this.heapSize && this.f[this.heap[l]] < this.f[this.heap[m]]) m = l;
      if (r <= this.heapSize && this.f[this.heap[r]] < this.f[this.heap[m]]) m = r;
      if (m === k) break;
      const t = this.heap[m];
      this.heap[m] = this.heap[k];
      this.heap[k] = t;
      k = m;
    }
    return top;
  }
}
