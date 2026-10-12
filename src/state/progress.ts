import { LevelRecord } from '../types/game';
import { shardsFor } from '../sim/scoring';

export interface VictoryRun {
  timeSec: number;
  stars: 1 | 2 | 3;
  /** Momentum multiplier at the moment of finishing (multiplies the reward). */
  momentum: number;
  /** Highest multiplier reached during the run (shown and recorded). */
  bestMomentum: number;
}

export interface VictoryResult {
  firstClear: boolean;
  shardsEarned: number;
  isNewBestTime: boolean;
  newBestStars: boolean;
}

export const emptyRecord = (levelId: number, unlocked = false): LevelRecord => ({
  levelId,
  unlocked,
  completed: false,
  stars: 0,
  bestTime: null,
  bestMomentum: null,
  ghostRun: false,
});

/**
 * Pure progress update for a finished level: best time/stars/momentum, unlocks the next level,
 * pays shards (first clear > replay). Returns new objects; inputs are never mutated.
 */
export function applyVictory(
  records: Record<number, LevelRecord>,
  shards: number,
  levelId: number,
  run: VictoryRun,
): { records: Record<number, LevelRecord>; shards: number; result: VictoryResult } {
  const existing = records[levelId] ?? emptyRecord(levelId, true);
  const firstClear = !existing.completed;
  const shardsEarned = shardsFor({ stars: run.stars, momentum: run.momentum, firstClear });

  const updated: LevelRecord = {
    ...existing,
    unlocked: true,
    completed: true,
    stars: Math.max(existing.stars, run.stars),
    bestTime: existing.bestTime === null ? run.timeSec : Math.min(existing.bestTime, run.timeSec),
    bestMomentum: existing.bestMomentum === null ? run.bestMomentum : Math.max(existing.bestMomentum, run.bestMomentum),
  };
  const next = records[levelId + 1] ?? emptyRecord(levelId + 1);
  const nextRecords = {
    ...records,
    [levelId]: updated,
    [levelId + 1]: { ...next, unlocked: true },
  };
  return {
    records: nextRecords,
    shards: shards + shardsEarned,
    result: {
      firstClear,
      shardsEarned,
      isNewBestTime: existing.bestTime === null || run.timeSec < existing.bestTime,
      newBestStars: run.stars > existing.stars,
    },
  };
}
