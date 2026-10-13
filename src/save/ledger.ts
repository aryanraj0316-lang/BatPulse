import { ECHO_CONFIG } from '../constants/gameConfig';

/**
 * Shard accounting that merges safely between devices.
 *
 *   balance = (shards earned on every device) - (price of every bat owned)
 *
 * Each device only ever increases its own `earned` counter, so merging two saves (per-device maximum, union of
 * owned bats) can never lose an earning and can never let the same shards be spent twice.
 */
export interface Ledger {
  /** Random id of this install. Empty only for a moment, until the save manager assigns one on load. */
  deviceId: string;
  /** Shards earned, per device id. */
  earned: Record<string, number>;
}

export const emptyLedger = (): Ledger => ({ deviceId: '', earned: {} });

/** Placeholder device key used while migrating an old save, before this install has an id. */
export const PENDING_DEVICE = '';

export const priceOf = (id: string): number => ECHO_CONFIG.characters[id]?.price ?? 0;
export const spentOn = (unlocked: readonly string[]): number => unlocked.reduce((n, id) => n + priceOf(id), 0);

export const totalEarned = (l: Ledger): number => Object.values(l.earned).reduce((n, v) => n + v, 0);

/** What the player can spend right now. Never negative. */
export const balanceOf = (l: Ledger, unlocked: readonly string[]): number => Math.max(0, Math.floor(totalEarned(l) - spentOn(unlocked)));

/** Records shards earned on this device (whole shards, ignores zero/negative/non-finite). */
export function credit(l: Ledger, amount: number): Ledger {
  if (!Number.isFinite(amount) || amount <= 0) return l;
  const key = l.deviceId;
  return { ...l, earned: { ...l.earned, [key]: (l.earned[key] ?? 0) + Math.floor(amount) } };
}

/** Ledger of an old save that only knew a balance: everything it ever earned is balance + what it bought. */
export function ledgerFromBalance(shards: number, unlocked: readonly string[]): Ledger {
  const total = Math.max(0, Math.floor(Number.isFinite(shards) ? shards : 0)) + spentOn(unlocked);
  return { deviceId: PENDING_DEVICE, earned: total > 0 ? { [PENDING_DEVICE]: total } : {} };
}

/** Gives a loaded save its device id (moves the pending counter onto it). */
export function assignDevice(l: Ledger, makeId: () => string): Ledger {
  if (l.deviceId) return l;
  const id = makeId();
  const earned = { ...l.earned };
  const pending = earned[PENDING_DEVICE] ?? 0;
  delete earned[PENDING_DEVICE];
  if (pending > 0) earned[id] = (earned[id] ?? 0) + pending;
  return { deviceId: id, earned };
}

/** Per-device maximum of two ledgers. Keeps this device's id. */
export function mergeLedgers(local: Ledger, remote: Ledger): Ledger {
  const merged: Record<string, number> = { ...local.earned };
  for (const [k, v] of Object.entries(remote.earned)) merged[k] = Math.max(merged[k] ?? 0, v);
  // sorted keys: merging in either order gives byte-identical data
  const earned: Record<string, number> = {};
  for (const k of Object.keys(merged).sort()) earned[k] = merged[k];
  return { deviceId: local.deviceId, earned };
}

export function normalizeLedger(v: unknown): Ledger | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = v as { deviceId?: unknown; earned?: unknown };
  const earned: Record<string, number> = {};
  if (raw.earned && typeof raw.earned === 'object' && !Array.isArray(raw.earned)) {
    for (const [k, n] of Object.entries(raw.earned as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) earned[k] = Math.floor(n);
    }
  }
  return { deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '', earned };
}
