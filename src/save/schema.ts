import { AbilityId, LevelRecord } from '../types/game';

export const SAVE_VERSION = 2;

export interface SettingsSave {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  floatingJoystick: boolean;
  devModeUnlocked: boolean;
}

export interface SaveData {
  saveVersion: number;
  shards: number;
  selectedCharacter: string;
  unlockedCharacters: string[];
  /** Per-level progress, keyed by level id. */
  records: Record<number, LevelRecord>;
  // Legacy ability system; replaced by characters in Phase 5.
  equippedAbilities: AbilityId[];
  unlockedAbilities: AbilityId[];
  endlessHighScore: number;
  dailyBestDepth: number;
  hasSeenHeadphonePrompt: boolean;
  settings: SettingsSave;
  daily: { lastClaimDay: number | null; streak: number };
}

export const defaultSave = (): SaveData => ({
  saveVersion: SAVE_VERSION,
  shards: 0,
  selectedCharacter: 'bat_rookie',
  unlockedCharacters: ['bat_rookie'],
  records: {
    1: { levelId: 1, unlocked: true, completed: false, stars: 0, bestTime: null, bestSonarUsed: null, ghostRun: false, perfectEcho: false },
  },
  equippedAbilities: [],
  unlockedAbilities: [],
  endlessHighScore: 0,
  dailyBestDepth: 0,
  hasSeenHeadphonePrompt: false,
  settings: { soundEnabled: true, hapticsEnabled: true, floatingJoystick: true, devModeUnlocked: false },
  daily: { lastClaimDay: null, streak: 0 },
});

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNegInt = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const strArr = (v: unknown, fb: string[]) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fb);
const finiteOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalizeRecords(v: unknown, fb: SaveData['records']): SaveData['records'] {
  if (!isObj(v)) return fb;
  const out: SaveData['records'] = {};
  for (const [k, r] of Object.entries(v)) {
    const id = Number(k);
    if (!Number.isInteger(id) || id < 0 || !isObj(r)) continue;
    out[id] = {
      levelId: id,
      unlocked: bool(r.unlocked, false),
      completed: bool(r.completed, false),
      stars: Math.min(3, nonNegInt(r.stars, 0)),
      bestTime: finiteOrNull(r.bestTime),
      bestSonarUsed: finiteOrNull(r.bestSonarUsed),
      ghostRun: bool(r.ghostRun, false),
      perfectEcho: bool(r.perfectEcho, false),
      ghostTrack: Array.isArray(r.ghostTrack) ? r.ghostTrack : undefined,
    };
  }
  return Object.keys(out).length > 0 ? out : fb;
}

/**
 * Coerces any parsed JSON into a valid current-version SaveData, keeping every field that is
 * still usable. Also performs the migration from the legacy (unversioned, flat) progress format,
 * whose field names are a subset of the current ones. Never throws.
 */
export function migrateSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const settings = isObj(raw.settings) ? raw.settings : {};
  const daily = isObj(raw.daily) ? raw.daily : {};
  const unlockedCharacters = [...strArr(raw.unlockedCharacters, d.unlockedCharacters)];
  if (!unlockedCharacters.includes('bat_rookie')) unlockedCharacters.unshift('bat_rookie');
  const selected =
    typeof raw.selectedCharacter === 'string' && unlockedCharacters.includes(raw.selectedCharacter)
      ? raw.selectedCharacter
      : 'bat_rookie';
  return {
    saveVersion: SAVE_VERSION,
    shards: nonNegInt(raw.shards, d.shards),
    selectedCharacter: selected,
    unlockedCharacters,
    records: normalizeRecords(raw.records, d.records),
    equippedAbilities: strArr(raw.equippedAbilities, []) as AbilityId[],
    unlockedAbilities: strArr(raw.unlockedAbilities, []) as AbilityId[],
    endlessHighScore: nonNegInt(raw.endlessHighScore, 0),
    dailyBestDepth: nonNegInt(raw.dailyBestDepth, 0),
    hasSeenHeadphonePrompt: bool(raw.hasSeenHeadphonePrompt, false),
    settings: {
      soundEnabled: bool(settings.soundEnabled, d.settings.soundEnabled),
      hapticsEnabled: bool(settings.hapticsEnabled, d.settings.hapticsEnabled),
      floatingJoystick: bool(settings.floatingJoystick, d.settings.floatingJoystick),
      devModeUnlocked: bool(settings.devModeUnlocked, d.settings.devModeUnlocked),
    },
    daily: {
      lastClaimDay: typeof daily.lastClaimDay === 'number' ? daily.lastClaimDay : null,
      streak: nonNegInt(daily.streak, 0),
    },
  };
}
