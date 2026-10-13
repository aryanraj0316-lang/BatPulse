import { ECHO_CONFIG } from '../constants/gameConfig';
import { isCharacterId, CHARACTER_IDS } from '../game/characters';
import { LevelDef } from '../levels/schema';
import { LevelRecord, ScoreSubmission } from '../types/game';
import { DEFAULT_FINISH_RADIUS } from '../sim/world';

/** Slowest a run can plausibly be for the board (an hour); anything longer is not a speed run. */
export const MAX_BOARD_TIME_SEC = 3600;

/** Boards are per level AND per bat, so a Turbo Moth time never competes with a Rookie time. */
export const boardKey = (levelId: number, character: string): string => `${levelId}:${character}`;

export type Submission = ScoreSubmission;

/**
 * The fastest a level can possibly be cleared: a straight line from the start to the finish ring at top speed.
 * (Speed is constant: momentum raises rewards, not speed.) Real clears are longer; this only rejects the impossible.
 */
export function minPossibleTimeSec(def: LevelDef): number {
  const reach = Math.hypot(def.finish.x - def.start.x, def.finish.y - def.start.y) - (def.finish.radius ?? DEFAULT_FINISH_RADIUS) - ECHO_CONFIG.player.radius;
  return Math.max(0, reach) / ECHO_CONFIG.player.speed;
}

export type SubmissionProblem = 'unknown_level' | 'unknown_character' | 'bad_time' | 'too_fast' | 'too_slow';

/** Checks a time before it is queued or sent. The server must check again: this only protects honest players and the queue. */
export function validateSubmission(s: Submission, def: LevelDef | null): SubmissionProblem | null {
  if (!def || def.id !== s.levelId || s.levelId <= 0) return 'unknown_level';
  if (!isCharacterId(s.character)) return 'unknown_character';
  if (typeof s.timeSec !== 'number' || !Number.isFinite(s.timeSec) || s.timeSec <= 0) return 'bad_time';
  if (s.timeSec > MAX_BOARD_TIME_SEC) return 'too_slow';
  // 2 % slack for the frame the finish was detected in
  if (s.timeSec < minPossibleTimeSec(def) * 0.98) return 'too_fast';
  return null;
}

/** A readable, anonymous name that stays the same for an install: "Bat-4F2A". */
export const displayNameFor = (deviceId: string): string => `Bat-${(deviceId.replace(/[^0-9a-f]/gi, '').slice(-4) || '0000').toUpperCase().padStart(4, '0')}`;

export interface BoardRow {
  rank: number;
  name: string;
  timeSec: number;
  isYou: boolean;
}

/** The player's own best time per bat on a level (the always-available board). */
export function personalBoard(record: LevelRecord | undefined, you: string): BoardRow[] {
  const times = record?.bestTimes ?? {};
  return CHARACTER_IDS.filter((id) => times[id] !== undefined)
    .map((id) => ({ id, t: times[id] }))
    .sort((a, b) => a.t - b.t)
    .map((r, i) => ({ rank: i + 1, name: `${ECHO_CONFIG.characters[r.id].name} · ${you}`, timeSec: r.t, isYou: true }));
}

/** Keeps the fastest time per board; stable and bounded so the offline queue can never grow without limit. */
export const MAX_QUEUE = 50;
export function enqueueScore(queue: readonly Submission[], s: Submission): Submission[] {
  const key = boardKey(s.levelId, s.character);
  const existing = queue.find((q) => boardKey(q.levelId, q.character) === key);
  if (existing && existing.timeSec <= s.timeSec) return [...queue];
  const rest = queue.filter((q) => boardKey(q.levelId, q.character) !== key);
  return [...rest, s].slice(-MAX_QUEUE);
}
