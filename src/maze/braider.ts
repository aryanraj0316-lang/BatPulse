import { GridCell, SeededRNG } from './generator';

export class MazeBraider {
  /**
   * Identifies dead-ends (cells with 3 walls) and removes an extra wall
   * according to braidFactor (0.25 to 0.40 sweet spot).
   */
  static braid(grid: GridCell[][], braidFactor: number, rng: SeededRNG): void {
    if (braidFactor <= 0) return;

    const rows = grid.length;
    const cols = grid[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const wallCount =
          (cell.walls.top ? 1 : 0) +
          (cell.walls.right ? 1 : 0) +
          (cell.walls.bottom ? 1 : 0) +
          (cell.walls.left ? 1 : 0);

        // Dead-end has 3 walls
        if (wallCount === 3) {
          if (rng.next() < braidFactor) {
            const availableNeighbors: { dir: 'top' | 'right' | 'bottom' | 'left'; target: GridCell }[] = [];

            if (cell.walls.top && r > 0) availableNeighbors.push({ dir: 'top', target: grid[r - 1][c] });
            if (cell.walls.right && c < cols - 1) availableNeighbors.push({ dir: 'right', target: grid[r][c + 1] });
            if (cell.walls.bottom && r < rows - 1) availableNeighbors.push({ dir: 'bottom', target: grid[r + 1][c] });
            if (cell.walls.left && c > 0) availableNeighbors.push({ dir: 'left', target: grid[r][c - 1] });

            if (availableNeighbors.length > 0) {
              const chosen = rng.choice(availableNeighbors);
              if (chosen.dir === 'top') {
                cell.walls.top = false;
                chosen.target.walls.bottom = false;
              } else if (chosen.dir === 'right') {
                cell.walls.right = false;
                chosen.target.walls.left = false;
              } else if (chosen.dir === 'bottom') {
                cell.walls.bottom = false;
                chosen.target.walls.top = false;
              } else if (chosen.dir === 'left') {
                cell.walls.left = false;
                chosen.target.walls.right = false;
              }
            }
          }
        }
      }
    }
  }
}
