import { ECHO_CONFIG } from '../constants/gameConfig';
import { CHARACTER_IDS, isCharacterId } from '../game/characters';

export type PurchaseFailure = 'unknown_character' | 'already_owned' | 'not_enough_shards';

export type PurchaseResult =
  | { ok: true; shards: number; unlocked: string[] }
  | { ok: false; reason: PurchaseFailure; missing?: number };

/** Pure purchase: never mutates, never goes below zero, never charges twice. */
export function purchaseCharacter(shards: number, unlocked: readonly string[], id: string): PurchaseResult {
  if (!isCharacterId(id)) return { ok: false, reason: 'unknown_character' };
  if (unlocked.includes(id)) return { ok: false, reason: 'already_owned' };
  const price = ECHO_CONFIG.characters[id].price;
  if (!Number.isFinite(shards) || shards < price) return { ok: false, reason: 'not_enough_shards', missing: price - Math.max(0, shards || 0) };
  return { ok: true, shards: shards - price, unlocked: [...unlocked, id] };
}

/** Selecting is only allowed for owned bats; anything else keeps the current one. */
export function selectCharacter(current: string, unlocked: readonly string[], id: string): string {
  return isCharacterId(id) && unlocked.includes(id) ? id : current;
}

export const shopOrder = (): readonly string[] => CHARACTER_IDS;

// ---------------------------------------------------------------- daily reward

export interface DailyState {
  /** UTC day number (ms / 86 400 000, floored) of the last claim. */
  lastClaimDay: number | null;
  streak: number;
}

export const MS_PER_DAY = 86_400_000;
export const utcDay = (utcMs: number): number => Math.floor(utcMs / MS_PER_DAY);

/** Reward for day `n` (1-based) of a streak: ramps min -> max over the cycle, plus the streak bonus on the last day. */
export function dailyRewardFor(day: number): number {
  const { dailyLoginMin: lo, dailyLoginMax: hi, dailyStreakDays: days, dailyStreakBonus } = ECHO_CONFIG.rewards;
  const d = Math.min(Math.max(1, Math.floor(day)), days);
  const base = Math.round(lo + ((hi - lo) * (d - 1)) / Math.max(1, days - 1));
  return d === days ? base + dailyStreakBonus : base;
}

export type DailyStatus =
  | { canClaim: true; day: number; reward: number; streakBroken: boolean }
  | { canClaim: false; day: number; msUntilNext: number };

/** What would happen if the player claimed now, given trusted UTC time. */
export function dailyStatus(daily: DailyState, utcMs: number): DailyStatus {
  const today = utcDay(utcMs);
  const last = daily.lastClaimDay;
  if (last !== null && today <= last) {
    // same day (or the clock is behind a past claim): not claimable
    return { canClaim: false, day: Math.max(1, daily.streak), msUntilNext: (Math.max(last, today) + 1) * MS_PER_DAY - utcMs };
  }
  const consecutive = last !== null && today === last + 1;
  const prev = consecutive ? daily.streak : 0;
  const day = (prev % ECHO_CONFIG.rewards.dailyStreakDays) + 1;
  return { canClaim: true, day, reward: dailyRewardFor(day), streakBroken: last !== null && !consecutive };
}

export function claimDaily(daily: DailyState, utcMs: number): { daily: DailyState; reward: number; day: number } | null {
  const s = dailyStatus(daily, utcMs);
  if (!s.canClaim) return null;
  return { daily: { lastClaimDay: utcDay(utcMs), streak: s.day }, reward: s.reward, day: s.day };
}
