import { LevelData, EnvObject, HunterSpawn, Vec2 } from '../types/game';
import { SeededRNG, MazeGenerator, GridCell } from '../maze/generator';
import { MazeBraider } from '../maze/braider';
import { RoomCarver } from '../maze/roomCarver';
import { MazeMesher } from '../maze/mesher';
import { Pathfinding, NodeCoord } from '../maze/pathfinding';
import { LEVEL_PRESETS, LevelPreset, LEVEL_NAMES, CHAPTER_HINTS } from './params';
import { biomeForLevel, CAMPAIGN_LEVELS } from '../render/themes/biomes';
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

    // 4. Spawn & exit. The bat starts somewhere new in every level (seeded, so a level always
    //    plays the same) and the exit sits far away along the maze, never under the HUD.
    const lrng = new SeededRNG(seed ^ 0x5ba7);
    const safeRow = (r: number) => (r + 0.5) * cellH >= GAME_CONFIG.HUD_SAFE_TOP;
    const { startCoord, goalCoord } = this.pickStartAndGoal(grid, cellW, cellH, safeRow, lrng);
    const key = (c: number, r: number) => `${c},${r}`;
    const cellOf = (o: EnvObject) => key(Math.floor((o.x + o.width / 2) / cellW), Math.floor((o.y + o.height / 2) / cellH));

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
      // Strategic pit: drop it on the direct route (middle stretch) when a detour exists,
      // so the obvious path is a trap and the player has to find the loop around it.
      const direct = this.route(grid, startCoord, goalCoord, new Set());
      const middle = lrng.shuffle(direct.slice(Math.floor(direct.length * 0.3), Math.ceil(direct.length * 0.7)));
      const onRoute = middle.find((n) => safeRow(n.row) && keepsRoute(n.col, n.row));
      if (onRoute) {
        chasmC = onRoute.col;
        chasmR = onRoute.row;
      } else if (!keepsRoute(chasmC, chasmR)) {
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
      let crystalC = rng.rangeInt(1, cols - 2);
      let crystalR = rng.rangeInt(1, rows - 2);
      // Midway between spawn and exit, off the direct route: a ping into it lights the far half
      const pick = this.pickCell(grid, startCoord, goalCoord, objects.map(cellOf), lrng, (c) =>
        c.fromStart >= c.total * 0.35 && c.fromStart <= c.total * 0.65 && c.offRoute >= 1 && safeRow(c.row)
      );
      if (pick) {
        crystalC = pick.col;
        crystalR = pick.row;
      }
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
      let shardC = rng.rangeInt(1, cols - 2);
      let shardR = rng.rangeInt(1, rows - 2);
      // Reward for a short detour: tucked 2-3 steps off the route, not right next to the spawn
      const taken = [...objects.map(cellOf), key(startCoord.col, startCoord.row), key(goalCoord.col, goalCoord.row)];
      const pick =
        this.pickCell(grid, startCoord, goalCoord, taken, lrng, (c) => c.offRoute >= 2 && c.offRoute <= 3 && c.fromStart >= 3 && safeRow(c.row)) ??
        this.pickCell(grid, startCoord, goalCoord, taken, lrng, (c) => c.offRoute >= 1 && c.fromStart >= 2 && safeRow(c.row));
      if (pick) {
        shardC = pick.col;
        shardR = pick.row;
      }
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

    // 6c. Late-game twists (few, and only high up): crushers from 41, rifts from 51
    if (preset.id >= GAME_CONFIG.CRUSHER_FIRST_LEVEL) {
      const blocked = new Set(objects.filter((o) => o.type === 'chasm').map(cellOf));
      const route = this.route(grid, startCoord, goalCoord, blocked);
      const want = preset.id >= GAME_CONFIG.RIFT_FIRST_LEVEL ? 2 : 1;
      const takenNow = new Set([...objects.map(cellOf), key(startCoord.col, startCoord.row), key(goalCoord.col, goalCoord.row)]);
      const picks = lrng.shuffle(route.slice(Math.max(3, Math.floor(route.length * 0.25)), Math.ceil(route.length * 0.8)));
      const used: NodeCoord[] = [];
      for (const n of picks) {
        if (used.length >= want) break;
        const k = key(n.col, n.row);
        if (takenNow.has(k) || used.some((u) => Math.abs(u.col - n.col) + Math.abs(u.row - n.row) < 3)) continue;
        const w = grid[n.row][n.col].walls;
        const horizontal = !w.left && !w.right && w.top && w.bottom; // corridor runs left↔right
        const vertical = !w.top && !w.bottom && w.left && w.right; // corridor runs up↕down
        if ((!horizontal && !vertical) || !safeRow(n.row)) continue;
        // a strip across the corridor; its two jaws hide in the walls and slam shut in the middle
        const span = (horizontal ? cellH : cellW) - 8;
        const thick = Math.min((horizontal ? cellW : cellH) * 0.3, 13);
        const x0 = n.col * cellW;
        const y0 = n.row * cellH;
        const x = horizontal ? x0 + cellW / 2 - thick / 2 : x0 + 4;
        const y = horizontal ? y0 + 4 : y0 + cellH / 2 - thick / 2;
        objects.push({
          id: `crusher_${objId++}`,
          type: 'moving_wall',
          x,
          y,
          width: horizontal ? thick : span,
          height: horizontal ? span : thick,
          axis: horizontal ? 'vertical' : 'horizontal',
          cycleDuration: Math.round(lrng.range(2800, 3600)),
          phaseOffset: Math.round(lrng.range(0, 3000)),
          revealedAt: 0,
          revealStrength: 0,
          lastPingDistance: 0,
        });
        used.push(n);
        takenNow.add(k);
      }
    }
    if (preset.id >= GAME_CONFIG.RIFT_FIRST_LEVEL) {
      const taken = [...objects.map(cellOf), key(startCoord.col, startCoord.row), key(goalCoord.col, goalCoord.row)];
      const { dist: fromGoal } = this.bfs(grid, [goalCoord], new Set());
      // entrance: a short detour near the start · exit: deep in the maze, off the main route
      const a = this.pickCell(grid, startCoord, goalCoord, taken, lrng, (c) => c.fromStart >= 2 && c.fromStart <= Math.max(4, c.total * 0.3) && c.offRoute >= 1 && c.offRoute <= 2 && safeRow(c.row));
      if (a) {
        const minFar = Math.min(cols * cellW, rows * cellH) * 0.4;
        const b = this.pickCell(grid, startCoord, goalCoord, [...taken, key(a.col, a.row)], lrng, (c) =>
          c.fromStart >= c.total * 0.6 && (fromGoal.get(key(c.col, c.row)) ?? 0) >= 2 && c.offRoute >= 1 && safeRow(c.row) &&
          Math.hypot((c.col - a.col) * cellW, (c.row - a.row) * cellH) >= minFar
        );
        if (b) {
          const size = Math.min(cellW, cellH) * 0.62;
          const n = objId++;
          for (const [end, twin, sfx] of [[a, 'b', 'a'], [b, 'a', 'b']] as const) {
            objects.push({
              id: `rift_${n}_${sfx}`,
              type: 'rift',
              pairId: `rift_${n}_${twin}`,
              x: end.col * cellW + cellW / 2 - size / 2,
              y: end.row * cellH + cellH / 2 - size / 2,
              width: size,
              height: size,
              revealedAt: 0,
              revealStrength: 0,
              lastPingDistance: 0,
            });
          }
        }
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
      // The first hunter lurks beside the route, part-way along it: you have to sneak past
      // (or route around) it instead of it sitting in a far corner you never visit.
      const lurk = this.pickCell(grid, startCoord, goalCoord, [...taken], hrng, (c) =>
        c.offRoute >= 1 && c.offRoute <= 2 &&
        c.fromStart >= Math.max(4, c.total * 0.35) && c.fromStart <= c.total * 0.8 &&
        !(cols > 4 && rows > 4 && (c.col === 0 || c.row === 0 || c.col === cols - 1 || c.row === rows - 1)) &&
        Math.hypot((c.col - startCoord.col) * cellW, (c.row - startCoord.row) * cellH) > Math.max(cellW, cellH) * 2.5
      );
      if (lurk) {
        const p = centre(lurk.col, lurk.row);
        hunters.push({ anchor: p, speedMultiplier: speeds[0] });
        keepAway.push(p);
        taken.add(key(lurk.col, lurk.row));
      }
      for (let n = hunters.length; n < preset.hunterCount; n++) {
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

  /** BFS over open cell sides, skipping `blocked` cells. Returns distances and parents. */
  private static bfs(grid: GridCell[][], from: NodeCoord[], blocked: Set<string>) {
    const rows = grid.length;
    const cols = grid[0].length;
    const dist = new Map<string, number>();
    const parent = new Map<string, NodeCoord>();
    const q: NodeCoord[] = [];
    for (const f of from) {
      dist.set(`${f.col},${f.row}`, 0);
      q.push(f);
    }
    while (q.length) {
      const cur = q.shift()!;
      const d = dist.get(`${cur.col},${cur.row}`)!;
      const w = grid[cur.row][cur.col].walls;
      const steps: [boolean, number, number][] = [[!w.top, 0, -1], [!w.right, 1, 0], [!w.bottom, 0, 1], [!w.left, -1, 0]];
      for (const [open, dc, dr] of steps) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (!open || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const k = `${nc},${nr}`;
        if (dist.has(k) || blocked.has(k)) continue;
        dist.set(k, d + 1);
        parent.set(k, cur);
        q.push({ col: nc, row: nr });
      }
    }
    return { dist, parent };
  }

  /** Shortest route of cells from `a` to `b` (inclusive), or [] if unreachable. */
  private static route(grid: GridCell[][], a: NodeCoord, b: NodeCoord, blocked: Set<string>): NodeCoord[] {
    const { parent, dist } = this.bfs(grid, [a], blocked);
    if (!dist.has(`${b.col},${b.row}`)) return [];
    const path: NodeCoord[] = [b];
    let cur = b;
    while (cur.col !== a.col || cur.row !== a.row) {
      cur = parent.get(`${cur.col},${cur.row}`)!;
      path.push(cur);
    }
    return path.reverse();
  }

  /**
   * Spawn: a few seeded random candidates (below the HUD); keep the ones with the longest
   * journeys and choose among them. Exit: a random cell in the far 15% of that journey.
   */
  private static pickStartAndGoal(
    grid: GridCell[][],
    cellW: number,
    cellH: number,
    safeRow: (r: number) => boolean,
    rng: SeededRNG
  ): { startCoord: NodeCoord; goalCoord: NodeCoord } {
    const rows = grid.length;
    const cols = grid[0].length;
    const cells: NodeCoord[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (safeRow(r)) cells.push({ col: c, row: r });
    if (!cells.length) cells.push({ col: 0, row: rows - 1 });

    const tries = rng.shuffle(cells).slice(0, 14).map((start) => {
      const { dist } = this.bfs(grid, [start], new Set());
      let max = 0;
      dist.forEach((d, k) => {
        if (safeRow(Number(k.split(',')[1]))) max = Math.max(max, d);
      });
      return { start, dist, max };
    });
    tries.sort((a, b) => b.max - a.max);
    const pick = tries[Math.floor(rng.next() * Math.min(3, tries.length))];

    const minFar = Math.min(cols * cellW, rows * cellH) * 0.45; // also far apart on screen
    const goals: NodeCoord[] = [];
    pick.dist.forEach((d, k) => {
      const [col, row] = k.split(',').map(Number);
      if (!safeRow(row) || d < pick.max * 0.85) return;
      if (Math.hypot((col - pick.start.col) * cellW, (row - pick.start.row) * cellH) < minFar) return;
      goals.push({ col, row });
    });
    let goalCoord: NodeCoord | null = goals.length ? rng.choice(goals) : null;
    if (!goalCoord) {
      // fall back to the single farthest safe cell
      let best = -1;
      pick.dist.forEach((d, k) => {
        const [col, row] = k.split(',').map(Number);
        if (safeRow(row) && d > best && (col !== pick.start.col || row !== pick.start.row)) {
          best = d;
          goalCoord = { col, row };
        }
      });
    }
    return { startCoord: pick.start, goalCoord: goalCoord ?? Pathfinding.findFarthestCell(grid, pick.start).cell };
  }

  /**
   * Random cell (seeded) matching `ok`. Each candidate knows its maze distance from the spawn,
   * the spawn->exit route length, and how many steps it is off that route.
   */
  private static pickCell(
    grid: GridCell[][],
    start: NodeCoord,
    goal: NodeCoord,
    taken: string[],
    rng: SeededRNG,
    ok: (c: { col: number; row: number; fromStart: number; total: number; offRoute: number }) => boolean
  ): NodeCoord | null {
    const takenSet = new Set(taken);
    const { dist: fromStart } = this.bfs(grid, [start], new Set());
    const total = fromStart.get(`${goal.col},${goal.row}`) ?? 0;
    const path = this.route(grid, start, goal, new Set());
    const { dist: offRoute } = this.bfs(grid, path.length ? path : [start], new Set());
    const out: NodeCoord[] = [];
    fromStart.forEach((d, k) => {
      if (takenSet.has(k)) return;
      const [col, row] = k.split(',').map(Number);
      if (ok({ col, row, fromStart: d, total, offRoute: offRoute.get(k) ?? 0 })) out.push({ col, row });
    });
    return out.length ? rng.choice(out) : null;
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
    const biome = biomeForLevel(levelId);
    const chapter = Math.floor((levelId - 1) / 10);
    const named = LEVEL_NAMES[levelId - 9];
    const beyond = levelId > CAMPAIGN_LEVELS;

    return {
      id: levelId,
      name: named ?? `${beyond ? 'Beyond' : 'Echo'} · ${biome.name.replace('The ', '')} ${levelId}`,
      subtitle: beyond ? `${biome.name} · Abyssal Depth ${levelId * 40}m` : biome.name,
      cols,
      rows,
      braidFactor: 0.55, // more loops, fewer dead ends: cleaner and easier
      roomCount: 2,
      sonarAllowance: Math.max(7, 9 - Math.floor(levelId / 12)),
      parTime: 35 + levelId * 2,
      parSonar: Math.max(3, 5 - Math.floor(levelId / 10)),
      hunterCount,
      difficulty: tier,
      hint: CHAPTER_HINTS[Math.min(chapter, CHAPTER_HINTS.length - 1)] ?? CHAPTER_HINTS[0],
    };
  }
}
