import { Vec2 } from '../types/game';
import { GridCell } from './generator';

export type NodeCoord = { col: number; row: number };

export class Pathfinding {
  /**
   * Calculates BFS distances from a starting cell to all reachable cells.
   */
  static bfsDistances(grid: GridCell[][], start: NodeCoord): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: NodeCoord[] = [start];
    distances.set(`${start.col},${start.row}`, 0);

    const rows = grid.length;
    const cols = grid[0].length;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currDist = distances.get(`${curr.col},${curr.row}`)!;
      const cell = grid[curr.row][curr.col];

      // Top
      if (!cell.walls.top && curr.row > 0) {
        const key = `${curr.col},${curr.row - 1}`;
        if (!distances.has(key)) {
          distances.set(key, currDist + 1);
          queue.push({ col: curr.col, row: curr.row - 1 });
        }
      }
      // Right
      if (!cell.walls.right && curr.col < cols - 1) {
        const key = `${curr.col + 1},${curr.row}`;
        if (!distances.has(key)) {
          distances.set(key, currDist + 1);
          queue.push({ col: curr.col + 1, row: curr.row });
        }
      }
      // Bottom
      if (!cell.walls.bottom && curr.row < rows - 1) {
        const key = `${curr.col},${curr.row + 1}`;
        if (!distances.has(key)) {
          distances.set(key, currDist + 1);
          queue.push({ col: curr.col, row: curr.row + 1 });
        }
      }
      // Left
      if (!cell.walls.left && curr.col > 0) {
        const key = `${curr.col - 1},${curr.row}`;
        if (!distances.has(key)) {
          distances.set(key, currDist + 1);
          queue.push({ col: curr.col - 1, row: curr.row });
        }
      }
    }

    return distances;
  }

  /**
   * Finds the cell with maximum BFS distance from start.
   */
  static findFarthestCell(grid: GridCell[][], start: NodeCoord): { cell: NodeCoord; distance: number } {
    const distances = this.bfsDistances(grid, start);
    let maxDist = -1;
    let farthest: NodeCoord = start;

    distances.forEach((dist, key) => {
      if (dist > maxDist) {
        maxDist = dist;
        const [c, r] = key.split(',').map(Number);
        farthest = { col: c, row: r };
      }
    });

    return { cell: farthest, distance: maxDist };
  }

  /**
   * A* Pathfinding from start to target on the maze grid for Wraith AI navigation.
   */
  static aStar(grid: GridCell[][], start: NodeCoord, target: NodeCoord): NodeCoord[] {
    const rows = grid.length;
    const cols = grid[0].length;

    const startKey = `${start.col},${start.row}`;
    const targetKey = `${target.col},${target.row}`;

    if (startKey === targetKey) return [start];

    const openSet: NodeCoord[] = [start];
    const cameFrom = new Map<string, NodeCoord>();

    const gScore = new Map<string, number>();
    gScore.set(startKey, 0);

    const fScore = new Map<string, number>();
    const h = (a: NodeCoord, b: NodeCoord) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    fScore.set(startKey, h(start, target));

    while (openSet.length > 0) {
      // Find node with lowest fScore
      let currentIdx = 0;
      let lowestF = fScore.get(`${openSet[0].col},${openSet[0].row}`) ?? Infinity;
      for (let i = 1; i < openSet.length; i++) {
        const score = fScore.get(`${openSet[i].col},${openSet[i].row}`) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          currentIdx = i;
        }
      }

      const current = openSet.splice(currentIdx, 1)[0];
      const currentKey = `${current.col},${current.row}`;

      if (current.col === target.col && current.row === target.row) {
        // Reconstruct path
        const path: NodeCoord[] = [current];
        let curr = current;
        while (cameFrom.has(`${curr.col},${curr.row}`)) {
          curr = cameFrom.get(`${curr.col},${curr.row}`)!;
          path.unshift(curr);
        }
        return path;
      }

      const cell = grid[current.row][current.col];
      const neighbors: NodeCoord[] = [];

      if (!cell.walls.top && current.row > 0) neighbors.push({ col: current.col, row: current.row - 1 });
      if (!cell.walls.right && current.col < cols - 1) neighbors.push({ col: current.col + 1, row: current.row });
      if (!cell.walls.bottom && current.row < rows - 1) neighbors.push({ col: current.col, row: current.row + 1 });
      if (!cell.walls.left && current.col > 0) neighbors.push({ col: current.col - 1, row: current.row });

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.col},${neighbor.row}`;
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + h(neighbor, target));

          if (!openSet.some((n) => n.col === neighbor.col && n.row === neighbor.row)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return [];
  }
}
