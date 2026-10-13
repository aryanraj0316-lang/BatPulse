import { LevelRecord, ScoreSubmission } from '../types/game';
import { GRAPHICS_SETTINGS, GraphicsSetting } from '../render/quality';
import { balanceOf, emptyLedger, Ledger, ledgerFromBalance, normalizeLedger } from './ledger';

export const SAVE_VERSION = 3;

export interface SettingsSave {
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  brightness: number; // 0.5..1.5, multiplies reveal glow
  hapticsEnabled: boolean;
  floatingJoystick: boolean;
  /** Cave echo on pulses. */
  reverb: boolean;
  graphics: GraphicsSetting;
}

export interface SaveData {
  saveVersion: number;
  /** Spendable balance. Derived from `ledger` and the owned bats; kept here so the file is readable. */
  shards: number;
  /** Shards earned per device: what makes saves from two devices mergeable (see ledger.ts). */
  ledger: Ledger;
  /** When this save last changed (ms since epoch). The newer save wins for settings and the equipped bat. */
  updatedAt: number;
  selectedCharacter: string;
  unlockedCharacters: string[];
  /** Per-level progress, keyed by level id. */
  records: Record<number, LevelRecord>;
  hasSeenHeadphonePrompt: boolean;
  /** Chapter mastery bonuses already paid, as "chapter:percent" (e.g. "1:50"). */
  claimedMilestones: string[];
  /** Best times not yet sent to the leaderboard (at most one per board). */
  scoreQueue: ScoreSubmission[];
  /** Rewarded ads watched today (soft daily cap). */
  ads: { day: number | null; count: number };
  settings: SettingsSave;
  daily: { lastClaimDay: number | null; streak: number };
}

export const defaultSave = (): SaveData => ({
  saveVersion: SAVE_VERSION,
  shards: 0,
  ledger: emptyLedger(),
  updatedAt: 0,
  selectedCharacter: 'bat_rookie',
  unlockedCharacters: ['bat_rookie'],
  records: {
    1: { levelId: 1, unlocked: true, completed: false, stars: 0, bestTime: null, bestMomentum: null, ghostRun: false },
  },
  hasSeenHeadphonePrompt: false,
  claimedMilestones: [],
  scoreQueue: [],
  ads: { day: null, count: 0 },
  settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true, reverb: true, graphics: 'auto' },
  daily: { lastClaimDay: null, streak: 0 },
});

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNegInt = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const strArr = (v: unknown, fb: string[]) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fb);
const clamp01 = (v: unknown, fb: number, lo = 0, hi = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
const finiteOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalizeBestTimes(v: unknown): Record<string, number> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(v)) if (typeof t === 'number' && Number.isFinite(t) && t > 0) out[k] = t;
  return Object.keys(out).length ? out : undefined;
}

function normalizeScoreQueue(v: unknown): ScoreSubmission[] {
  if (!Array.isArray(v)) return [];
  const best = new Map<string, ScoreSubmission>();
  for (const e of v) {
    if (!isObj(e) || !Number.isInteger(e.levelId) || e.levelId <= 0 || typeof e.character !== 'string') continue;
    if (typeof e.timeSec !== 'number' || !Number.isFinite(e.timeSec) || e.timeSec <= 0) continue;
    const key = `${e.levelId}:${e.character}`;
    const prev = best.get(key);
    if (!prev || e.timeSec < prev.timeSec) best.set(key, { levelId: e.levelId, character: e.character, timeSec: e.timeSec });
  }
  return [...best.values()].slice(-50);
}

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
      bestMomentum: finiteOrNull(r.bestMomentum),
      ghostRun: bool(r.ghostRun, false),
      bestTimes: normalizeBestTimes(r.bestTimes),
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
  // saves before v3 only knew a balance: everything earned = balance + what was bought
  const ledger = normalizeLedger(raw.ledger) ?? ledgerFromBalance(nonNegInt(raw.shards, d.shards), unlockedCharacters);
  return {
    saveVersion: SAVE_VERSION,
    shards: balanceOf(ledger, unlockedCharacters),
    ledger,
    updatedAt: nonNegInt(raw.updatedAt, 0),
    selectedCharacter: selected,
    unlockedCharacters,
    records: normalizeRecords(raw.records, d.records),
    hasSeenHeadphonePrompt: bool(raw.hasSeenHeadphonePrompt, false),
    claimedMilestones: Array.isArray(raw.claimedMilestones) ? [...new Set(raw.claimedMilestones.filter((x: unknown): x is string => typeof x === 'string'))] : [],
    scoreQueue: normalizeScoreQueue(raw.scoreQueue),
    ads: { day: isObj(raw.ads) && typeof raw.ads.day === 'number' && Number.isFinite(raw.ads.day) ? Math.floor(raw.ads.day) : null, count: isObj(raw.ads) ? nonNegInt(raw.ads.count, 0) : 0 },
    settings: {
      // legacy builds stored a single on/off switch: off maps to zero volume
      sfxVolume: clamp01(settings.sfxVolume, settings.soundEnabled === false ? 0 : d.settings.sfxVolume),
      musicVolume: clamp01(settings.musicVolume, settings.soundEnabled === false ? 0 : d.settings.musicVolume),
      brightness: clamp01(settings.brightness, d.settings.brightness, 0.5, 1.5),
      hapticsEnabled: bool(settings.hapticsEnabled, d.settings.hapticsEnabled),
      floatingJoystick: bool(settings.floatingJoystick, d.settings.floatingJoystick),
      reverb: bool(settings.reverb, d.settings.reverb),
      graphics: GRAPHICS_SETTINGS.includes(settings.graphics as GraphicsSetting) ? (settings.graphics as GraphicsSetting) : d.settings.graphics,
    },
    daily: {
      lastClaimDay: typeof daily.lastClaimDay === 'number' ? daily.lastClaimDay : null,
      streak: nonNegInt(daily.streak, 0),
    },
  };
}
