import { LevelData, EnvObject, HunterSpawn, Vec2 } from '../types/game';
import { SeededRNG, MazeGenerator, GridCell } from '../maze/generator';
import { MazeBraider } from '../maze/braider';
import { RoomCarver } from '../maze/roomCarver';
import { MazeMesher } from '../maze/mesher';
import { Pathfinding, NodeCoord } from '../maze/pathfinding';
import { LEVEL_PRESETS, LevelPreset } from './params';
import { GAME_CONFIG } from '../constants/gameConfig';

export class LevelFactory {
  /**
   * Generates a complete LevelData structure from a seed and level index.
   */
  static createLevel(levelId: number, customSeed?: number, worldW?: number, worldH?: number): LevelData {
    const preset =
      LEVEL_PRESETS.find((p) => p.id === levelId) || this.createProceduralPreset(levelId);

    const seed = customSeed !== undefined ? customSeed : levelId * 1337 + 42;
    const rng = new SeededRNG(seed);

    const arenaW = worldW || GAME_CONFIG.WORLD_WIDTH;
    const arenaH = worldH || GAME_CONFIG.WORLD_HEIGHT;

    // Never let corridors get narrower than the bat can fly through: cap the grid so every
    // cell is at least (bat diameter + wall + clearance). Levels that already fit are unchanged.
    const minCell = GAME_CONFIG.PLAYER_RADIUS * 2 + 8 + GAME_CONFIG.CORRIDOR_CLEARANCE;
    // Also never exceed MAX_GRID_COLS × MAX_GRID_ROWS so later levels stay clean, not cluttered.
    const cols = Math.max(3, Math.min(preset.cols, GAME_CONFIG.MAX_GRID_COLS, Math.floor((worldW || GAME_CONFIG.WORLD_WIDTH) / minCell)));
    const rows = Math.max(3, Math.min(preset.rows, GAME_CONFIG.MAX_GRID_ROWS, Math.floor((worldH || GAME_CONFIG.WORLD_HEIGHT) / minCell)));
    const cellW = arenaW / cols;
    const cellH = arenaH / rows;

    // 1. Carve DFS Maze
    const grid = MazeGenerator.carveDFS(cols, rows, rng);

    // 2. Braid dead-ends into escape loops
    MazeBraider.braid(grid, preset.braidFactor, rng);

    // 3. Carve open rooms
    if (preset.roomCount > 0) {
      RoomCarver.carveRooms(grid, preset.roomCount, rng);
    }

    // 4. Determine Spawn & Goal at maximum BFS distance
    const startCoord: NodeCoord = { col: 0, row: rows - 1 };
    const farthest = Pathfinding.findFarthestCell(grid, startCoord);
    const goalCoord = farthest.cell;

    const spawn: Vec2 = {
      x: startCoord.col * cellW + cellW / 2,
      y: startCoord.row * cellH + cellH / 2,
    };

    const goal: Vec2 & { radius: number; revealedAt: number; revealStrength: number } = {
      x: goalCoord.col * cellW + cellW / 2,
      y: goalCoord.row * cellH + cellH / 2,
      radius: 18,
      revealedAt: 0,
      revealStrength: 0,
    };

    // 5. Mesh Wall Rectangles
    const walls = MazeMesher.generateWallRects(grid, cellW, cellH, 8, 0, 0);

    // 6. Scatter Environment Objects (Chasms, Glass Walls, Echo Crystals, Shards, Pressure Plates)
    const objects: EnvObject[] = [];
    let objId = 1;

    // Level-specific environment objects
    if (preset.id >= 5) {
      // Add 1-2 Chasms (deadly silent gaps)
      let chasmR = rng.rangeInt(2, rows - 3);
      let chasmC = rng.rangeInt(1, cols - 2);
      // A water pit must never cut the exit off from the spawn (that made some levels
      // unwinnable). If it would, move it to the nearest cell that keeps a route open.
      const keepsRoute = (c: number, r: number) => {
        if ((c === startCoord.col && r === startCoord.row) || (c === goalCoord.col && r === goalCoord.row)) return false;
        const seen = new Set<string>([`${startCoord.col},${startCoord.row}`]);
        const q = [startCoord];
        while (q.length) {
          const cur = q.shift()!;
          if (cur.col === goalCoord.col && cur.row === goalCoord.row) return true;
          const w = grid[cur.row][cur.col].walls;
          const steps: [boolean, number, number][] = [[!w.top, 0, -1], [!w.right, 1, 0], [!w.bottom, 0, 1], [!w.left, -1, 0]];
          for (const [open, dc, dr] of steps) {
            const nc = cur.col + dc;
            const nr = cur.row + dr;
            const k = `${nc},${nr}`;
            if (!open || seen.has(k) || (nc === c && nr === r)) continue;
            seen.add(k);
            q.push({ col: nc, row: nr });
          }
        }
        return false;
      };
      if (!keepsRoute(chasmC, chasmR)) {
        let best: { c: number; r: number; d: number } | null = null;
        for (let r = 2; r <= rows - 3; r++)
          for (let c = 1; c <= cols - 2; c++) {
            const d = Math.abs(c - chasmC) + Math.abs(r - chasmR);
            if ((!best || d < best.d) && keepsRoute(c, r)) best = { c, r, d };
          }
        if (best) {
          chasmC = best.c;
          chasmR = best.r;
        }
      }
      objects.push({
        id: `chasm_${objId++}`,
        type: 'chasm',
        x: chasmC * cellW + 4,
        y: chasmR * cellH + 4,
        width: cellW - 8,
        height: cellH - 8,
        revealedAt: 0,
        revealStrength: 0,
        lastPingDistance: 0,
      });
    }

    if (preset.id >= 7) {
      // (Random laser barriers you could simply fly around were removed: lasers now only seal
      // the exit until the key is found. The same random numbers are drawn so every other
      // object keeps its position.)
      rng.rangeInt(1, cols - 2);
      rng.rangeInt(1, rows - 2);
      objId++;
    }

    if (preset.id >= 8) {
      // Add Echo Crystal in an open chamber
      const crystalC = rng.rangeInt(1, cols - 2);
      const crystalR = rng.rangeInt(1, rows - 2);
      objects.push({
        id: `crystal_${objId++}`,
        type: 'echo_crystal',
        x: crystalC * cellW + cellW / 2 - 10,
        y: crystalR * cellH + cellH / 2 - 10,
        width: 20,
        height: 20,
        revealedAt: 0,
        revealStrength: 0,
        lastPingDistance: 0,
      });
    }

    // Add 1-2 Sonar Shards (+1 pulse reward)
    if (preset.sonarAllowance < 999) {
      const shardC = rng.rangeInt(1, cols - 2);
      const shardR = rng.rangeInt(1, rows - 2);
      objects.push({
        id: `shard_${objId++}`,
        type: 'sonar_shard',
        x: shardC * cellW + cellW / 2 - 8,
        y: shardR * cellH + cellH / 2 - 8,
        width: 16,
        height: 16,
        collected: false,
        revealedAt: 0,
        revealStrength: 0,
        lastPingDistance: 0,
      });
    }

    // 6b. Lock & key: laser barriers on every open side of the exit cell; a key hidden far away
    if (GAME_CONFIG.LOCK_AND_KEY && preset.id >= GAME_CONFIG.LOCK_FIRST_LEVEL) {
      const g = goalCoord;
      const cell = grid[g.row][g.col];
      const T = 8; // same thickness as the walls, centred on the cell edge
      const gx = g.col * cellW;
      const gy = g.row * cellH;
      const barrier = (x: number, y: number, w: number, h: number) =>
        objects.push({
          id: `lock_${objId++}`,
          type: 'glass_wall',
          x,
          y,
          width: w,
          height: h,
          state: 'closed',
          locked: true,
          revealedAt: 0,
          revealStrength: 0,
          lastPingDistance: 0,
        });
      if (!cell.walls.top && g.row > 0) barrier(gx, gy - T / 2, cellW, T);
      if (!cell.walls.bottom && g.row < rows - 1) barrier(gx, gy + cellH - T / 2, cellW, T);
      if (!cell.walls.left && g.col > 0) barrier(gx - T / 2, gy, T, cellH);
      if (!cell.walls.right && g.col < cols - 1) barrier(gx + cellW - T / 2, gy, T, cellH);

      const keyCell = this.pickKeyCell(grid, startCoord, goalCoord, objects, cellW, cellH, new SeededRNG(seed ^ 0x6b6579));
      if (keyCell) {
        objects.push({
          id: `key_${objId++}`,
          type: 'key',
          x: keyCell.col * cellW + cellW / 2 - 8,
          y: keyCell.row * cellH + cellH / 2 - 8,
          width: 16,
          height: 16,
          collected: false,
          revealedAt: 0,
          revealStrength: 0,
          lastPingDistance: 0,
        });
      }
    }

    // 7. Place Wraith hunters spread evenly over the map: each one as far as possible from
    //    the spawn, the exit and the other hunters (farthest-point placement). Cells holding
    //    another object (water, lasers, crystals, orbs) are skipped. Uses its own RNG so every
    //    other object keeps its position.
    const hunters: HunterSpawn[] = [];
    if (preset.hunterCount > 0) {
      const hrng = new SeededRNG(seed ^ 0x51a7);
      const taken = new Set(
        objects.map((o) => `${Math.floor((o.x + o.width / 2) / cellW)},${Math.floor((o.y + o.height / 2) / cellH)}`)
      );
      taken.add(`${startCoord.col},${startCoord.row}`);
      taken.add(`${goalCoord.col},${goalCoord.row}`);
      const centre = (c: number, r: number) => ({ x: c * cellW + cellW / 2, y: r * cellH + cellH / 2 });
      // points the hunters keep away from: spawn + exit, then each placed hunter
      const keepAway: Vec2[] = [spawn, { x: goal.x, y: goal.y }];
      const speeds = [1.0, 0.9, 0.9, 0.9];
      for (let n = 0; n < preset.hunterCount; n++) {
        let best: Vec2 | null = null;
        let bestScore = -1;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (taken.has(`${c},${r}`)) continue;
            const p = centre(c, r);
            // stay off the outermost ring so cones have room to sweep
            if (cols > 4 && rows > 4 && (c === 0 || r === 0 || c === cols - 1 || r === rows - 1)) continue;
            let d = Infinity;
            for (const k of keepAway) d = Math.min(d, Math.hypot(p.x - k.x, p.y - k.y));
            const score = d + hrng.next() * cellW * 0.25; // tiny seeded jitter breaks ties
            if (score > bestScore) {
              bestScore = score;
              best = p;
            }
          }
        }
        if (!best) break;
        hunters.push({ anchor: best, speedMultiplier: speeds[Math.min(n, speeds.length - 1)] });
        keepAway.push(best);
        taken.add(`${Math.floor(best.x / cellW)},${Math.floor(best.y / cellH)}`);
      }
    }

    return {
      id: preset.id,
      name: preset.name,
      subtitle: preset.subtitle,
      seed,
      grid: { cols, rows, cellSize: cellW },
      generation: { braidFactor: preset.braidFactor, roomCount: preset.roomCount, corridorWidth: 1 },
      spawn,
      goal,
      walls,
      objects,
      hunters,
      sonar: {
        allowance: preset.sonarAllowance,
        radius: GAME_CONFIG.SONAR_RADIUS,
        revealDuration: GAME_CONFIG.REVEAL_FULL_DURATION,
      },
      player: { speed: GAME_CONFIG.PLAYER_SPEED },
      par: { time: preset.parTime, sonarUsed: preset.parSonar },
      difficulty: preset.difficulty,
      hint: preset.hint,
    };
  }

  /**
   * Key cell: reachable from spawn without crossing water or entering the sealed exit,
   * as far as possible (in maze steps) from both the spawn and the exit.
   */
  private static pickKeyCell(
    grid: GridCell[][],
    start: NodeCoord,
    goal: NodeCoord,
    objects: EnvObject[],
    cellW: number,
    cellH: number,
    rng: SeededRNG
  ): NodeCoord | null {
    const rows = grid.length;
    const cols = grid[0].length;
    const cellKey = (c: number, r: number) => `${c},${r}`;
    const taken = new Set<string>();
    const blocked = new Set<string>([cellKey(goal.col, goal.row)]);
    for (const o of objects) {
      const k = cellKey(Math.floor((o.x + o.width / 2) / cellW), Math.floor((o.y + o.height / 2) / cellH));
      taken.add(k);
      if (o.type === 'chasm') blocked.add(k);
    }
    const bfs = (from: NodeCoord, block: Set<string>) => {
      const dist = new Map<string, number>([[cellKey(from.col, from.row), 0]]);
      const q: NodeCoord[] = [from];
      while (q.length) {
        const cur = q.shift()!;
        const d = dist.get(cellKey(cur.col, cur.row))!;
        const w = grid[cur.row][cur.col].walls;
        const steps: [boolean, number, number][] = [[!w.top, 0, -1], [!w.right, 1, 0], [!w.bottom, 0, 1], [!w.left, -1, 0]];
        for (const [open, dc, dr] of steps) {
          const nc = cur.col + dc;
          const nr = cur.row + dr;
          if (!open || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const k = cellKey(nc, nr);
          if (dist.has(k) || block.has(k)) continue;
          dist.set(k, d + 1);
          q.push({ col: nc, row: nr });
        }
      }
      return dist;
    };
    const fromStart = bfs(start, blocked);
    const fromGoal = bfs(goal, new Set([...blocked].filter((k) => k !== cellKey(goal.col, goal.row))));
    let best: NodeCoord | null = null;
    let bestScore = -1;
    fromStart.forEach((ds, k) => {
      if (taken.has(k) || k === cellKey(start.col, start.row)) return;
      // never under the HUD bar at the top of the screen (it would be impossible to see)
      const rowOf = Number(k.split(',')[1]);
      if ((rowOf + 0.5) * cellH < GAME_CONFIG.HUD_SAFE_TOP) return;
      const dg = fromGoal.get(k) ?? 0;
      const score = Math.min(ds, dg) + rng.next() * 1.5;
      if (score > bestScore) {
        bestScore = score;
        const [col, row] = k.split(',').map(Number);
        best = { col, row };
      }
    });
    return best;
  }

  private static createProceduralPreset(levelId: number): LevelPreset {
    const tier = Math.min(5, Math.floor(levelId / 5) + 1) as 1 | 2 | 3 | 4 | 5;
    // Gentle growth, capped by MAX_GRID_COLS/ROWS in createLevel
    const cols = Math.min(GAME_CONFIG.MAX_GRID_COLS, 7 + Math.floor(levelId / 12));
    const rows = Math.min(GAME_CONFIG.MAX_GRID_ROWS, 10 + Math.floor(levelId / 8));
    const hunterCount = levelId > 20 ? 2 : 1;

    return {
      id: levelId,
      name: `Echo Chamber ${levelId.toString().padStart(2, '0')}`,
      subtitle: `Abyssal Depth ${levelId * 40}m`,
      cols,
      rows,
      braidFactor: 0.55, // more loops, fewer dead ends: cleaner and easier
      roomCount: 2,
      sonarAllowance: Math.max(7, 9 - Math.floor(levelId / 12)),
      parTime: 35 + levelId * 2,
      parSonar: Math.max(3, 5 - Math.floor(levelId / 10)),
      hunterCount,
      difficulty: tier,
      hint: 'Plan several moves ahead. The Wraith is listening.',
    };
  }
}
