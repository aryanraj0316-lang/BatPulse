import { ECHO_CONFIG } from '../constants/gameConfig';

export interface StarThresholds {
  two: number;
  three: number;
}

/** Time-based stars: <= three s -> 3, <= two s -> 2, otherwise 1 (finishing always earns one). */
export function starsForTime(timeSec: number, t: StarThresholds): 1 | 2 | 3 {
  if (timeSec <= t.three) return 3;
  if (timeSec <= t.two) return 2;
  return 1;
}

/** Level score. Momentum multiplies the whole score (spec: "multiplies score and shard reward"). */
export function scoreFor(timeSec: number, parTime: number, momentum: number): number {
  const cfg = ECHO_CONFIG.score;
  const timeBonus = Math.max(0, Math.floor((parTime * 2 - timeSec) * cfg.timeBonusPerSec));
  return Math.round((cfg.base + timeBonus) * momentum);
}

export interface ShardInput {
  stars: 1 | 2 | 3;
  momentum: number;
  /** false when the level was already completed before: replays pay less. */
  firstClear: boolean;
}

/**
 * Shards for a finished run: starShards[stars] x momentum.
 * Replays pay `replayFactor` of that (at least 1), so farming one level is never the best use of time.
 */
export function shardsFor(input: ShardInput): number {
  const r = ECHO_CONFIG.rewards;
  const raw = r.starShards[input.stars] * input.momentum;
  return input.firstClear ? Math.round(raw) : Math.max(1, Math.round(raw * r.replayFactor));
}
