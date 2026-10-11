import { GridCell, SeededRNG } from './generator';

export class RoomCarver {
  /**
   * Carves rectangular rooms into the maze, clearing internal walls
   * to create open vantage points and breathing areas.
   */
  static carveRooms(grid: GridCell[][], roomCount: number, rng: SeededRNG): void {
    const rows = grid.length;
    const cols = grid[0].length;

    for (let i = 0; i < roomCount; i++) {
      const roomW = rng.rangeInt(2, Math.min(3, cols - 1));
      const roomH = rng.rangeInt(2, Math.min(3, rows - 1));

      const startC = rng.rangeInt(0, cols - roomW);
      const startR = rng.rangeInt(0, rows - roomH);

      for (let r = startR; r < startR + roomH; r++) {
        for (let c = startC; c < startC + roomW; c++) {
          const cell = grid[r][c];
          cell.isRoom = true;

          // Clear internal walls between room cells
          if (r < startR + roomH - 1) {
            cell.walls.bottom = false;
            grid[r + 1][c].walls.top = false;
          }
          if (c < startC + roomW - 1) {
            cell.walls.right = false;
            grid[r][c + 1].walls.left = false;
          }
        }
      }
    }
  }
}
