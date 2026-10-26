import { LevelData, EnvObject } from '../types/game';
import { GridCell } from '../maze/generator';

/**
 * Navigation grid for enemies, rebuilt from the level's real wall rectangles.
 * Cells holding a hazard the bat can't cross (water pit, laser barrier) are sealed
 * off completely, so enemies obey the same obstacle rules as the player.
 */
export interface NavGrid {
  grid: GridCell[][];
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

const BLOCKING: EnvObject['type'][] = ['chasm', 'glass_wall'];

export function buildNavGrid(level: LevelData, worldW: number, worldH: number, objects: EnvObject[]): NavGrid {
  const cols = level.grid.cols;
  const rows = level.grid.rows;
  const cellW = worldW / cols;
  const cellH = worldH / rows;

  const grid: GridCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      col: c,
      row: r,
      walls: { top: r === 0, right: c === cols - 1, bottom: r === rows - 1, left: c === 0 },
      visited: true,
    }))
  );

  // Interior walls (same layout the mesher produced: one rect per cell side)
  for (const w of level.walls) {
    if (w.id.startsWith('w_border')) continue;
    if (w.height > w.width) {
      const c = Math.round((w.x + w.width / 2) / cellW) - 1;
      const r = Math.round(w.y / cellH);
      if (c >= 0 && c < cols - 1 && r >= 0 && r < rows) {
        grid[r][c].walls.right = true;
        grid[r][c + 1].walls.left = true;
      }
    } else {
      const c = Math.round(w.x / cellW);
      const r = Math.round((w.y + w.height / 2) / cellH) - 1;
      if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) {
        grid[r][c].walls.bottom = true;
        grid[r + 1][c].walls.top = true;
      }
    }
  }

  // Seal hazard cells on every side
  for (const o of objects) {
    // locked laser barriers sit ON a cell edge: treat them as a wall there
    if (o.type === 'glass_wall' && o.locked) {
      if (o.state === 'open') continue;
      if (o.height > o.width) {
        const c = Math.round((o.x + o.width / 2) / cellW) - 1;
        const r = Math.floor((o.y + o.height / 2) / cellH);
        if (c >= 0 && c < cols - 1 && r >= 0 && r < rows) {
          grid[r][c].walls.right = true;
          grid[r][c + 1].walls.left = true;
        }
      } else {
        const c = Math.floor((o.x + o.width / 2) / cellW);
        const r = Math.round((o.y + o.height / 2) / cellH) - 1;
        if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) {
          grid[r][c].walls.bottom = true;
          grid[r + 1][c].walls.top = true;
        }
      }
      continue;
    }
    if (!BLOCKING.includes(o.type)) continue;
    const c = Math.floor((o.x + o.width / 2) / cellW);
    const r = Math.floor((o.y + o.height / 2) / cellH);
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    const cell = grid[r][c];
    cell.walls = { top: true, right: true, bottom: true, left: true };
    if (r > 0) grid[r - 1][c].walls.bottom = true;
    if (r < rows - 1) grid[r + 1][c].walls.top = true;
    if (c > 0) grid[r][c - 1].walls.right = true;
    if (c < cols - 1) grid[r][c + 1].walls.left = true;
  }

  return { grid, cols, rows, cellW, cellH };
}

export function cellOf(nav: NavGrid, x: number, y: number) {
  return {
    col: Math.max(0, Math.min(nav.cols - 1, Math.floor(x / nav.cellW))),
    row: Math.max(0, Math.min(nav.rows - 1, Math.floor(y / nav.cellH))),
  };
}
