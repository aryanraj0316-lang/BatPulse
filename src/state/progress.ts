import { ECHO_CONFIG } from '../constants/gameConfig';
import { LevelRecord } from '../types/game';
import { shardsFor } from '../sim/scoring';
import { Milestone, newMilestones } from './mastery';

export interface VictoryRun {
  timeSec: number;
  stars: 1 | 2 | 3;
  /** Momentum multiplier at the moment of finishing (multiplies the reward). */
  momentum: number;
  /** Highest multiplier reached during the run (shown and recorded). */
  bestMomentum: number;
  /** No hunter was ever alerted and pulses stayed within the level's ghost limit. */
  ghostRun?: boolean;
  /** Which bat flew the run (best times are kept per character). */
  characterId?: string;
}

export interface VictoryResult {
  firstClear: boolean;
  /** Everything paid for this run: stars x momentum + ghost bonus + mastery milestones. */
  shardsEarned: number;
  isNewBestTime: boolean;
  newBestStars: boolean;
  /** Shards from the first-time Ghost Run bonus (included in shardsEarned). */
  ghostBonus: number;
  /** Chapter mastery milestones reached by this run (included in shardsEarned). */
  milestones: Milestone[];
  masteryBonus: number;
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
 * Pure progress update for a finished level: best time/stars/momentum (overall and per character), unlocks the
 * next level, pays shards (first clear > replay), the first-time Ghost Run bonus and any chapter mastery milestone
 * newly reached. Returns new objects; inputs are never mutated.
 */
export function applyVictory(
  records: Record<number, LevelRecord>,
  shards: number,
  levelId: number,
  run: VictoryRun,
  claimedMilestones: readonly string[] = [],
): { records: Record<number, LevelRecord>; shards: number; claimedMilestones: string[]; result: VictoryResult } {
  const existing = records[levelId] ?? emptyRecord(levelId, true);
  const firstClear = !existing.completed;
  // the Ghost Run bonus is paid once per level, the first time it is achieved
  const ghostBonus = run.ghostRun && !existing.ghostRun ? ECHO_CONFIG.rewards.ghostRunBonus : 0;
  const base = shardsFor({ stars: run.stars, momentum: run.momentum, firstClear });

  const bestTimes = { ...(existing.bestTimes ?? {}) };
  if (run.characterId) {
    const prev = bestTimes[run.characterId];
    bestTimes[run.characterId] = prev === undefined ? run.timeSec : Math.min(prev, run.timeSec);
  }

  const updated: LevelRecord = {
    ...existing,
    unlocked: true,
    completed: true,
    stars: Math.max(existing.stars, run.stars),
    bestTime: existing.bestTime === null ? run.timeSec : Math.min(existing.bestTime, run.timeSec),
    bestMomentum: existing.bestMomentum === null ? run.bestMomentum : Math.max(existing.bestMomentum, run.bestMomentum),
    ghostRun: existing.ghostRun || !!run.ghostRun,
    ...(Object.keys(bestTimes).length ? { bestTimes } : {}),
  };
  const next = records[levelId + 1] ?? emptyRecord(levelId + 1);
  const nextRecords = {
    ...records,
    [levelId]: updated,
    [levelId + 1]: { ...next, unlocked: true },
  };

  // chapter mastery: each milestone pays once, ever
  const milestones = newMilestones(nextRecords, claimedMilestones);
  const masteryBonus = milestones.reduce((n, m) => n + m.bonus, 0);
  const shardsEarned = base + ghostBonus + masteryBonus;

  return {
    records: nextRecords,
    shards: shards + shardsEarned,
    claimedMilestones: [...claimedMilestones, ...milestones.map((m) => m.key)],
    result: {
      firstClear,
      shardsEarned,
      isNewBestTime: existing.bestTime === null || run.timeSec < existing.bestTime,
      newBestStars: run.stars > existing.stars,
      ghostBonus,
      milestones,
      masteryBonus,
    },
  };
}
