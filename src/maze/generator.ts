// Seeded pseudo-random number generator (Mulberry32)
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed ? Math.abs(seed) : 123456789;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export type GridCell = {
  col: number;
  row: number;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
  visited: boolean;
  isRoom?: boolean;
};

export class MazeGenerator {
  /**
   * Generates a 2D cell grid using Randomized DFS (Recursive Backtracker)
   */
  static carveDFS(cols: number, rows: number, rng: SeededRNG): GridCell[][] {
    const grid: GridCell[][] = [];

    // Initialize all cells with all 4 walls intact
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = {
          col: c,
          row: r,
          walls: { top: true, right: true, bottom: true, left: true },
          visited: false,
        };
      }
    }

    const stack: GridCell[] = [];
    const startCell = grid[0][0];
    startCell.visited = true;
    stack.push(startCell);

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const neighbors: { cell: GridCell; dir: 'top' | 'right' | 'bottom' | 'left' }[] = [];

      const { col, row } = current;

      // Top
      if (row > 0 && !grid[row - 1][col].visited) {
        neighbors.push({ cell: grid[row - 1][col], dir: 'top' });
      }
      // Right
      if (col < cols - 1 && !grid[row][col + 1].visited) {
        neighbors.push({ cell: grid[row][col + 1], dir: 'right' });
      }
      // Bottom
      if (row < rows - 1 && !grid[row + 1][col].visited) {
        neighbors.push({ cell: grid[row + 1][col], dir: 'bottom' });
      }
      // Left
      if (col > 0 && !grid[row][col - 1].visited) {
        neighbors.push({ cell: grid[row][col - 1], dir: 'left' });
      }

      if (neighbors.length > 0) {
        const chosen = rng.choice(neighbors);
        // Knock down wall between current and chosen
        if (chosen.dir === 'top') {
          current.walls.top = false;
          chosen.cell.walls.bottom = false;
        } else if (chosen.dir === 'right') {
          current.walls.right = false;
          chosen.cell.walls.left = false;
        } else if (chosen.dir === 'bottom') {
          current.walls.bottom = false;
          chosen.cell.walls.top = false;
        } else if (chosen.dir === 'left') {
          current.walls.left = false;
          chosen.cell.walls.right = false;
        }

        chosen.cell.visited = true;
        stack.push(chosen.cell);
      } else {
        stack.pop();
      }
    }

    return grid;
  }
}
