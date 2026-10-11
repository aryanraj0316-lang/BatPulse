import { LevelData, EnvObject, HunterSpawn, Vec2 } from '../types/game';
import { SeededRNG, MazeGenerator } from '../maze/generator';
import { MazeBraider } from '../maze/braider';
import { RoomCarver } from '../maze/roomCarver';
import { MazeMesher } from '../maze/mesher';
import { Pathfinding, NodeCoord } from '../maze/pathfinding';
import { LEVEL_PRESETS, LevelPreset } from './params';
import { GAME_CONFIG } from '../constants/gameConfig';
import { loadAuthoredLevel } from './loader';
import { toRuntimeLevel } from './adapter';

export class LevelFactory {
  /**
   * Generates a complete LevelData structure from a seed and level index.
   */
  static createLevel(levelId: number, customSeed?: number, worldW?: number, worldH?: number): LevelData {
    // Authored data files take priority over procedural generation.
    const authored = loadAuthoredLevel(levelId);
    if (authored) {
      return toRuntimeLevel(authored, worldW || GAME_CONFIG.WORLD_WIDTH, worldH || GAME_CONFIG.WORLD_HEIGHT);
    }
    const preset =
      LEVEL_PRESETS.find((p) => p.id === levelId) || this.createProceduralPreset(levelId);

    const seed = customSeed !== undefined ? customSeed : levelId * 1337 + 42;
    const rng = new SeededRNG(seed);

    const arenaW = worldW || GAME_CONFIG.WORLD_WIDTH;
    const arenaH = worldH || GAME_CONFIG.WORLD_HEIGHT;

    const cols = preset.cols;
    const rows = preset.rows;
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
      const chasmR = rng.rangeInt(2, rows - 3);
      const chasmC = rng.rangeInt(1, cols - 2);
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
      // Add a Glass Wall
      const glassC = rng.rangeInt(1, cols - 2);
      const glassR = rng.rangeInt(1, rows - 2);
      objects.push({
        id: `glass_${objId++}`,
        type: 'glass_wall',
        x: glassC * cellW + cellW / 2 - 4,
        y: glassR * cellH,
        width: 8,
        height: cellH,
        revealedAt: 0,
        revealStrength: 0,
        lastPingDistance: 0,
      });
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

    // 7. Place Wraith hunters at chokepoint junctions
    const hunters: HunterSpawn[] = [];
    if (preset.hunterCount > 0) {
      const midR = Math.floor(rows / 2);
      const midC = Math.floor(cols / 2);
      hunters.push({
        anchor: {
          x: midC * cellW + cellW / 2,
          y: midR * cellH + cellH / 2,
        },
        speedMultiplier: 1.0,
      });

      if (preset.hunterCount > 1) {
        hunters.push({
          anchor: {
            x: (cols - 1 - midC) * cellW + cellW / 2,
            y: (rows - 1 - midR) * cellH + cellH / 2,
          },
          speedMultiplier: 0.9,
        });
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

  private static createProceduralPreset(levelId: number): LevelPreset {
    const tier = Math.min(5, Math.floor(levelId / 5) + 1) as 1 | 2 | 3 | 4 | 5;
    const cols = Math.min(13, 8 + Math.floor(levelId / 4));
    const rows = Math.min(19, 12 + Math.floor(levelId / 3));
    const hunterCount = levelId > 15 ? 2 : 1;

    return {
      id: levelId,
      name: `Echo Chamber ${levelId.toString().padStart(2, '0')}`,
      subtitle: `Abyssal Depth ${levelId * 40}m`,
      cols,
      rows,
      braidFactor: 0.3,
      roomCount: 2,
      sonarAllowance: Math.max(5, 8 - Math.floor(levelId / 8)),
      parTime: 35 + levelId * 2,
      parSonar: Math.max(3, 5 - Math.floor(levelId / 10)),
      hunterCount,
      difficulty: tier,
      hint: 'Plan several moves ahead. The Wraith is listening.',
    };
  }
}
