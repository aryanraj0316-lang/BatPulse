import { CHARACTER_IDS } from '../game/characters';
import { LevelRecord } from '../types/game';
import { balanceOf, mergeLedgers } from '../save/ledger';
import { SAVE_VERSION, SaveData } from '../save/schema';

const minNullable = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.min(a, b));
const maxNullable = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));

function mergeBestTimes(a?: Record<string, number>, b?: Record<string, number>): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, t] of Object.entries(b ?? {})) out[k] = k in out ? Math.min(out[k], t) : t;
  return out;
}

/** One level's progress from two devices: nothing earned on either device is ever taken away. */
export function mergeRecord(a: LevelRecord | undefined, b: LevelRecord | undefined): LevelRecord {
  if (!a) return b as LevelRecord;
  if (!b) return a;
  const bestTimes = mergeBestTimes(a.bestTimes, b.bestTimes);
  return {
    levelId: a.levelId,
    unlocked: a.unlocked || b.unlocked,
    completed: a.completed || b.completed,
    stars: Math.max(a.stars, b.stars),
    bestTime: minNullable(a.bestTime, b.bestTime),
    bestMomentum: maxNullable(a.bestMomentum, b.bestMomentum),
    ghostRun: a.ghostRun || b.ghostRun,
    ...(bestTimes ? { bestTimes } : {}),
  };
}

/**
 * Merges two saves of the same player (this device and the cloud copy) into one.
 *  - progress only improves: levels done, stars, best times, ghost runs, milestones, owned bats = union / best
 *  - shards: per-device earnings (max each) minus the price of every owned bat, so a purchase made on one device
 *    can never be "un-spent" by the other, and nothing earned is lost
 *  - settings and the equipped bat: from whichever save changed last
 *  - daily reward: the later claim wins (so a day cannot be claimed once per device)
 * Pure: neither input is modified. Merging a save with itself returns the same save.
 */
export function mergeSaves(local: SaveData, remote: SaveData): SaveData {
  const ledger = mergeLedgers(local.ledger, remote.ledger);
  const owned = new Set([...local.unlockedCharacters, ...remote.unlockedCharacters]);
  const unlockedCharacters = CHARACTER_IDS.filter((id) => owned.has(id));

  const records: SaveData['records'] = {};
  const ids = new Set([...Object.keys(local.records), ...Object.keys(remote.records)].map(Number));
  for (const id of [...ids].sort((x, y) => x - y)) records[id] = mergeRecord(local.records[id], remote.records[id]);

  const newer = local.updatedAt >= remote.updatedAt ? local : remote;
  const older = newer === local ? remote : local;
  const selectedCharacter = unlockedCharacters.includes(newer.selectedCharacter as (typeof CHARACTER_IDS)[number])
    ? newer.selectedCharacter
    : unlockedCharacters.includes(older.selectedCharacter as (typeof CHARACTER_IDS)[number])
      ? older.selectedCharacter
      : 'bat_rookie';

  const lc = local.daily.lastClaimDay;
  const rc = remote.daily.lastClaimDay;
  const daily =
    lc === null && rc === null
      ? { lastClaimDay: null, streak: Math.max(local.daily.streak, remote.daily.streak) }
      : lc === null
        ? remote.daily
        : rc === null
          ? local.daily
          : lc !== rc
            ? lc > rc ? local.daily : remote.daily
            : { lastClaimDay: lc, streak: Math.max(local.daily.streak, remote.daily.streak) };

  return {
    saveVersion: SAVE_VERSION,
    shards: balanceOf(ledger, unlockedCharacters),
    ledger,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    selectedCharacter,
    unlockedCharacters,
    records,
    hasSeenHeadphonePrompt: local.hasSeenHeadphonePrompt || remote.hasSeenHeadphonePrompt,
    claimedMilestones: [...new Set([...local.claimedMilestones, ...remote.claimedMilestones])].sort(),
    scoreQueue: [...local.scoreQueue], // pending sends belong to this device
    // the ad cap is per day, not per device: the later day wins, the larger count within a day
    ads:
      local.ads.day === remote.ads.day
        ? { day: local.ads.day, count: Math.max(local.ads.count, remote.ads.count) }
        : (local.ads.day ?? -1) > (remote.ads.day ?? -1)
          ? { ...local.ads }
          : { ...remote.ads },
    settings: { ...newer.settings },
    daily: { ...daily },
  };
}
