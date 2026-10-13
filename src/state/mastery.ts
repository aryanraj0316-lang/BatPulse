import { ECHO_CONFIG } from '../constants/gameConfig';
import { CHAPTERS, Chapter, chapterProgress } from '../levels/chapters';
import { LevelRecord } from '../types/game';

export interface Milestone {
  chapterId: number;
  /** Share of the chapter's stars, 0..1. */
  pct: number;
  bonus: number;
  /** Saved as "chapter:percent", e.g. "1:50". */
  key: string;
}

export const milestoneKey = (chapterId: number, pct: number): string => `${chapterId}:${Math.round(pct * 100)}`;

/** Every milestone of one chapter whose star share has been reached. */
export function reachedMilestones(chapter: Chapter, records: Record<number, LevelRecord>): Milestone[] {
  const p = chapterProgress(chapter, records);
  const share = p.maxStars > 0 ? p.stars / p.maxStars : 0;
  return ECHO_CONFIG.rewards.masteryMilestones
    .filter((m) => share + 1e-9 >= m.pct)
    .map((m) => ({ chapterId: chapter.id, pct: m.pct, bonus: m.bonus, key: milestoneKey(chapter.id, m.pct) }));
}

/** Milestones reached across all chapters that have not been paid yet. */
export function newMilestones(records: Record<number, LevelRecord>, claimed: readonly string[]): Milestone[] {
  const done = new Set(claimed);
  return CHAPTERS.flatMap((c) => reachedMilestones(c, records)).filter((m) => !done.has(m.key));
}

/** All milestones of a chapter with their reached/claimed state (for the progress bar markers). */
export function chapterMilestoneStates(chapter: Chapter, records: Record<number, LevelRecord>, claimed: readonly string[]) {
  const reached = new Set(reachedMilestones(chapter, records).map((m) => m.key));
  const done = new Set(claimed);
  return ECHO_CONFIG.rewards.masteryMilestones.map((m) => {
    const key = milestoneKey(chapter.id, m.pct);
    return { pct: m.pct, bonus: m.bonus, key, reached: reached.has(key), claimed: done.has(key) };
  });
}
