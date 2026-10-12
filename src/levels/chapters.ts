import { LevelRecord } from '../types/game';

export interface Chapter {
  id: number;
  name: string;
  /** First and last level id of the chapter (inclusive). */
  first: number;
  last: number;
}

/** Chapter grouping for Level Select. Chapter 3 is added with its levels in Phase 4. */
export const CHAPTERS: readonly Chapter[] = [
  { id: 1, name: 'The Dark Cavern', first: 1, last: 20 },
  { id: 2, name: 'The Listening Deep', first: 21, last: 35 },
];

export function chapterLevelIds(c: Chapter): number[] {
  return Array.from({ length: c.last - c.first + 1 }, (_, i) => c.first + i);
}

export interface ChapterProgress {
  stars: number;
  maxStars: number;
  completed: number;
  total: number;
}

/** Star and completion totals for a chapter (mastery bar in Level Select). */
export function chapterProgress(c: Chapter, records: Record<number, LevelRecord>): ChapterProgress {
  const ids = chapterLevelIds(c);
  let stars = 0;
  let completed = 0;
  for (const id of ids) {
    const r = records[id];
    if (!r) continue;
    stars += Math.min(3, r.stars);
    if (r.completed) completed++;
  }
  return { stars, maxStars: ids.length * 3, completed, total: ids.length };
}

/** A level can be opened when its record says unlocked (progress unlocks the next level in order). */
export function isLevelUnlocked(id: number, records: Record<number, LevelRecord>): boolean {
  return id === 1 || !!records[id]?.unlocked;
}
