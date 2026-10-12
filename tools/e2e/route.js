/** Safe-route finder for end-to-end autopilot (JS twin of the test bot in src/__tests__/helpers/levelBot.ts). */
const CELL = 5;
const PLAYER_R = 14;

function distToBox(px, py, b) {
  const cx = Math.min(Math.max(px, b.x), b.x + b.width);
  const cy = Math.min(Math.max(py, b.y), b.y + b.height);
  return Math.hypot(px - cx, py - cy);
}

/** Returns a dense list of {x,y} points from start to finish keeping clear of walls and spikes. */
function findRoute(def, margin = 6) {
  const r = PLAYER_R + margin;
  const cols = Math.ceil(def.width / CELL);
  const rows = Math.ceil(def.height / CELL);
  const free = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * CELL + CELL / 2;
      const py = y * CELL + CELL / 2;
      let ok = px >= r && py >= r && px <= def.width - r && py <= def.height - r;
      for (const w of def.walls) if (ok && distToBox(px, py, w) < r) ok = false;
      for (const s of def.spikes) if (ok && distToBox(px, py, s) < r + 4) ok = false;
      free[y * cols + x] = ok ? 1 : 0;
    }
  }
  const at = (p) => ({ c: Math.floor(p.x / CELL), r: Math.floor(p.y / CELL) });
  const s = at(def.start);
  const f = at(def.finish);
  const prev = new Int32Array(cols * rows).fill(-1);
  const dist = new Float32Array(cols * rows).fill(Infinity);
  const open = [s.r * cols + s.c];
  dist[open[0]] = 0;
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const goal = f.r * cols + f.c;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cc = cur % cols;
    const cr = Math.floor(cur / cols);
    for (const [dc, dr, w] of nb) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (!free[ni]) continue;
      if (dc && dr && (!free[cr * cols + cc + dc] || !free[(cr + dr) * cols + cc])) continue;
      const nd = dist[cur] + w;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        prev[ni] = cur;
        open.push(ni);
      }
    }
  }
  if (!isFinite(dist[goal])) return null;
  const out = [];
  for (let a = goal; a !== -1; a = prev[a]) out.push({ x: (a % cols) * CELL + CELL / 2, y: Math.floor(a / cols) * CELL + CELL / 2 });
  return out.reverse();
}

module.exports = { findRoute };
