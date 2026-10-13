export type Vec2 = {
  x: number;
  y: number;
};

/** Saved progress for one level. */
export interface LevelRecord {
  levelId: number;
  unlocked: boolean;
  completed: boolean;
  stars: number; // 0 to 3
  bestTime: number | null; // seconds
  /** Highest momentum multiplier ever reached on this level. */
  bestMomentum: number | null;
  /** Completed with zero enemy alerts and within the pulse limit (Phase 3). */
  ghostRun: boolean;
  /** Best clear time per character id (leaderboards are per character, or Rookie-only). */
  bestTimes?: Record<string, number>;
}

export type GameScreenState = 'SPLASH' | 'HOME' | 'LEVEL_SELECT' | 'GAME' | 'SETTINGS' | 'SHOP';
