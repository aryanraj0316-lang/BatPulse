import { Pathfinding, NodeCoord } from './pathfinding';
import { GridCell } from './generator';

export class MazeValidator {
  /**
   * Validates that the goal is reachable from spawn, and that the path length
   * is within a reasonable budget of sonar pulses.
   */
  static validate(
    grid: GridCell[][],
    spawn: NodeCoord,
    goal: NodeCoord,
    sonarAllowance: number
  ): { valid: boolean; pathLength: number } {
    const path = Pathfinding.aStar(grid, spawn, goal);
    if (path.length === 0) {
      return { valid: false, pathLength: 0 };
    }

    // Every level must be solvable by a player who can cover ~4-6 cells per pulse
    const estimatedPulsesNeeded = Math.ceil(path.length / 5);
    const valid = estimatedPulsesNeeded <= sonarAllowance;

    return { valid, pathLength: path.length };
  }
}
