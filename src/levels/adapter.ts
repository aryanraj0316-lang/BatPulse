import { LevelData, HunterSpawn } from '../types/game';
import { GAME_CONFIG, ECHO_CONFIG } from '../constants/gameConfig';
import { LevelDef } from './schema';

/**
 * Bridges the data-file format to the engine's runtime LevelData.
 * Coordinates are scaled from the level's own width/height to the screen's world size.
 * (Phase 1 replaces the legacy runtime shape; until then this keeps authored levels playable.)
 */
export function toRuntimeLevel(def: LevelDef, worldW: number, worldH: number): LevelData {
  const sx = worldW / def.width;
  const sy = worldH / def.height;
  const s = Math.min(sx, sy);

  const hunters: HunterSpawn[] = def.enemies.map((e) => ({
    anchor: { x: e.waypoints[0].x * sx, y: e.waypoints[0].y * sy },
    speedMultiplier: e.speed === 'slow' ? ECHO_CONFIG.enemy.slowHunterSpeedMult : ECHO_CONFIG.enemy.fastHunterSpeedMult,
  }));

  return {
    id: def.id,
    name: def.name,
    subtitle: `Chapter ${def.chapter}`,
    seed: 0,
    grid: { cols: 1, rows: 1, cellSize: worldW },
    generation: { braidFactor: 0, roomCount: 0, corridorWidth: 1 },
    spawn: { x: def.start.x * sx, y: def.start.y * sy },
    goal: { x: def.finish.x * sx, y: def.finish.y * sy, radius: (def.finish.radius ?? 18) * s },
    walls: def.walls.map((w, i) => ({
      id: `w${i}`,
      x: w.x * sx,
      y: w.y * sy,
      width: w.width * sx,
      height: w.height * sy,
    })),
    objects: [],
    hunters,
    sonar: {
      // Legacy loop only understands a fixed allowance; 999 = unlimited. Phase 1 adds recharge.
      allowance: def.sonar.mode === 'fixed' ? def.sonar.charges : 999,
      radius: GAME_CONFIG.SONAR_RADIUS,
      revealDuration: GAME_CONFIG.REVEAL_FULL_DURATION,
    },
    player: { speed: ECHO_CONFIG.player.speed },
    par: { time: def.parTime, sonarUsed: def.ghostPulseLimit },
    difficulty: 1,
    hint: def.hint,
  };
}
