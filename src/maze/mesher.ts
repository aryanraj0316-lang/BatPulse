import { Rect, Vec2 } from '../types/game';
import { GridCell } from './generator';

export class SpatialHashGrid {
  private cellSize: number;
  private buckets = new Map<string, Rect[]>();

  constructor(cellSize: number = 60) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  insert(rect: Rect): void {
    const startX = Math.floor(rect.x / this.cellSize);
    const endX = Math.floor((rect.x + rect.width) / this.cellSize);
    const startY = Math.floor(rect.y / this.cellSize);
    const endY = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const key = `${cx},${cy}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(rect);
      }
    }
  }

  queryRadius(center: Vec2, radius: number): Rect[] {
    const startX = Math.floor((center.x - radius) / this.cellSize);
    const endX = Math.floor((center.x + radius) / this.cellSize);
    const startY = Math.floor((center.y - radius) / this.cellSize);
    const endY = Math.floor((center.y + radius) / this.cellSize);

    const results: Rect[] = [];
    const seen = new Set<string>();

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const bucket = this.buckets.get(`${cx},${cy}`);
        if (bucket) {
          for (const rect of bucket) {
            if (!seen.has(rect.id)) {
              seen.add(rect.id);
              results.push(rect);
            }
          }
        }
      }
    }
    return results;
  }
}

export class MazeMesher {
  /**
   * Converts a 2D GridCell array into wall segment rectangles
   * with proper world thickness and dimensions.
   */
  static generateWallRects(
    grid: GridCell[][],
    cellW: number,
    cellH: number,
    wallThickness: number = 8,
    offsetX: number = 0,
    offsetY: number = 0
  ): Rect[] {
    const rects: Rect[] = [];
    const rows = grid.length;
    const cols = grid[0].length;
    let idCounter = 1;

    // Outer border walls
    rects.push({
      id: `w_border_t`,
      x: offsetX,
      y: offsetY,
      width: cols * cellW,
      height: wallThickness,
    });
    rects.push({
      id: `w_border_b`,
      x: offsetX,
      y: offsetY + rows * cellH - wallThickness,
      width: cols * cellW,
      height: wallThickness,
    });
    rects.push({
      id: `w_border_l`,
      x: offsetX,
      y: offsetY,
      width: wallThickness,
      height: rows * cellH,
    });
    rects.push({
      id: `w_border_r`,
      x: offsetX + cols * cellW - wallThickness,
      y: offsetY,
      width: wallThickness,
      height: rows * cellH,
    });

    // Internal walls
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const cellX = offsetX + c * cellW;
        const cellY = offsetY + r * cellH;

        // Vertical internal wall (Right)
        if (cell.walls.right && c < cols - 1) {
          rects.push({
            id: `w_${idCounter++}`,
            x: cellX + cellW - wallThickness / 2,
            y: cellY,
            width: wallThickness,
            height: cellH,
          });
        }

        // Horizontal internal wall (Bottom)
        if (cell.walls.bottom && r < rows - 1) {
          rects.push({
            id: `w_${idCounter++}`,
            x: cellX,
            y: cellY + cellH - wallThickness / 2,
            width: cellW,
            height: wallThickness,
          });
        }
      }
    }

    return rects;
  }
}
