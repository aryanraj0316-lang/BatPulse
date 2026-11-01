import { create } from 'zustand';
import { LevelRecord, AbilityId, AbilityInfo, GhostPoint } from '../types/game';
import { loadJSON, saveJSON } from './storage';
import { SKIN_BY_ID, SkinId, skinStatus } from '../skins/skins';

export const ABILITIES: Record<AbilityId, AbilityInfo> = {
  WIDE_PULSE: {
    id: 'WIDE_PULSE',
    name: 'Wide Pulse',
    description: 'Your sonar rings reach 40% farther.',
    cost: 40,
    unlocked: false,
  },
  PIERCING_PING: {
    id: 'PIERCING_PING',
    name: 'Piercing Ping',
    description: 'Sonar passes through the first wall it hits.',
    cost: 75,
    unlocked: false,
  },
  RICOCHET: {
    id: 'RICOCHET',
    name: 'Ricochet',
    description: 'Each pulse echoes down the longest corridors, lighting what lies around the corner.',
    cost: 120,
    unlocked: false,
  },
  WHISPER_STEP: {
    id: 'WHISPER_STEP',
    name: 'Whisper Step',
    description: 'Fly faster before wraiths hear your wingbeats.',
    cost: 90,
    unlocked: false,
  },
  SIXTH_SENSE: {
    id: 'SIXTH_SENSE',
    name: 'Sixth Sense',
    description: 'The exit glows for a moment when each level begins.',
    cost: 150,
    unlocked: false,
  },
};

interface ProgressState {
  shards: number;
  records: Record<number, LevelRecord>;
  equippedAbilities: AbilityId[];
  unlockedAbilities: AbilityId[];
  endlessHighScore: number;
  dailyBestDepth: number;
  /** day number (days since epoch) dailyBestDepth belongs to */
  dailyDay: number;
  endlessRuns: number;
  hasSeenHeadphonePrompt: boolean;
  /** skins bought with shards (others unlock automatically from progress) */
  ownedSkins: SkinId[];
  equippedSkin: SkinId;

  // Actions
  addShards: (amount: number) => void;
  recordLevelVictory: (
    levelId: number,
    timeSeconds: number,
    sonarUsed: number,
    stars: number,
    ghostRun: boolean,
    perfectEcho: boolean,
    ghostTrack?: GhostPoint[],
    shardMult?: number
  ) => { isNewBest: boolean; shardsEarned: number };
  buySkin: (id: SkinId) => boolean;
  equipSkin: (id: SkinId) => boolean;
  unlockAbility: (id: AbilityId) => boolean;
  toggleEquipAbility: (id: AbilityId) => void;
  recordEndlessScore: (depth: number) => boolean;
  recordDailyScore: (day: number, depth: number) => boolean;
  setHeadphonePromptSeen: () => void;
}

const STORAGE_KEY = 'bats_view_v2_progress';

const loadSavedState = (): Partial<ProgressState> => loadJSON<Partial<ProgressState>>(STORAGE_KEY) ?? {};

const saveState = (state: ProgressState) => {
  saveJSON(STORAGE_KEY, {
    shards: state.shards,
    records: state.records,
    equippedAbilities: state.equippedAbilities,
    unlockedAbilities: state.unlockedAbilities,
    endlessHighScore: state.endlessHighScore,
    dailyBestDepth: state.dailyBestDepth,
    dailyDay: state.dailyDay,
    endlessRuns: state.endlessRuns,
    hasSeenHeadphonePrompt: state.hasSeenHeadphonePrompt,
    ownedSkins: state.ownedSkins,
    equippedSkin: state.equippedSkin,
  });
};

/** Inputs for skin unlock checks, derived from saved progress. */
export function skinProgress(state: Pick<ProgressState, 'records' | 'shards' | 'ownedSkins'>) {
  const recs = Object.values(state.records);
  return {
    owned: state.ownedSkins,
    shards: state.shards,
    highestCleared: recs.reduce((m, r) => (r.completed ? Math.max(m, r.levelId) : m), 0),
    stars: recs.reduce((sum, r) => sum + (r.stars || 0), 0),
    ghostRuns: recs.filter((r) => r.ghostRun).length,
  };
}

const initialSaved = loadSavedState();

export const useProgressStore = create<ProgressState>((set, get) => ({
  shards: initialSaved.shards ?? 0,
  records: initialSaved.records ?? {
    1: { levelId: 1, unlocked: true, completed: false, stars: 0, bestTime: null, bestSonarUsed: null, ghostRun: false, perfectEcho: false },
  },
  equippedAbilities: initialSaved.equippedAbilities ?? [],
  unlockedAbilities: initialSaved.unlockedAbilities ?? [],
  endlessHighScore: initialSaved.endlessHighScore ?? 0,
  dailyBestDepth: initialSaved.dailyBestDepth ?? 0,
  dailyDay: initialSaved.dailyDay ?? 0,
  endlessRuns: initialSaved.endlessRuns ?? 0,
  hasSeenHeadphonePrompt: initialSaved.hasSeenHeadphonePrompt ?? false,
  ownedSkins: initialSaved.ownedSkins ?? ['dusk'],
  equippedSkin: (initialSaved.equippedSkin && SKIN_BY_ID[initialSaved.equippedSkin] ? initialSaved.equippedSkin : 'dusk') as SkinId,

  addShards: (amount) => {
    set((state) => {
      const next = { ...state, shards: state.shards + amount };
      saveState(next);
      return next;
    });
  },

  recordLevelVictory: (levelId, timeSeconds, sonarUsed, stars, ghostRun, perfectEcho, ghostTrack, shardMult = 1) => {
    const state = get();
    const existing = state.records[levelId] || {
      levelId,
      unlocked: true,
      completed: false,
      stars: 0,
      bestTime: null,
      bestSonarUsed: null,
      ghostRun: false,
      perfectEcho: false,
    };

    let isNewBest = false;
    if (existing.bestTime === null || timeSeconds < existing.bestTime) {
      isNewBest = true;
    }

    // Shard reward: 15 per newly earned star + 25 first clear
    const newStars = Math.max(0, stars - existing.stars);
    const firstClear = !existing.completed;
    const shardsEarned = Math.round((newStars * 15 + (firstClear ? 25 : 0) + (ghostRun ? 10 : 0)) * shardMult);

    const updatedRecord: LevelRecord = {
      levelId,
      unlocked: true,
      completed: true,
      stars: Math.max(existing.stars, stars),
      bestTime: existing.bestTime === null ? timeSeconds : Math.min(existing.bestTime, timeSeconds),
      bestSonarUsed: existing.bestSonarUsed === null ? sonarUsed : Math.min(existing.bestSonarUsed, sonarUsed),
      ghostRun: existing.ghostRun || ghostRun,
      perfectEcho: existing.perfectEcho || perfectEcho,
      ghostTrack: isNewBest ? ghostTrack : (existing.ghostTrack || ghostTrack),
    };

    const nextRecords = { ...state.records, [levelId]: updatedRecord };

    // Unlock next level
    const nextLevelId = levelId + 1;
    if (!nextRecords[nextLevelId]) {
      nextRecords[nextLevelId] = {
        levelId: nextLevelId,
        unlocked: true,
        completed: false,
        stars: 0,
        bestTime: null,
        bestSonarUsed: null,
        ghostRun: false,
        perfectEcho: false,
      };
    } else {
      nextRecords[nextLevelId] = { ...nextRecords[nextLevelId], unlocked: true };
    }

    const nextState = {
      ...state,
      records: nextRecords,
      shards: state.shards + shardsEarned,
    };
    saveState(nextState);
    set(nextState);

    return { isNewBest, shardsEarned };
  },

  unlockAbility: (id) => {
    const state = get();
    const info = ABILITIES[id];
    if (!info || state.shards < info.cost || state.unlockedAbilities.includes(id)) {
      return false;
    }

    const nextState = {
      ...state,
      shards: state.shards - info.cost,
      unlockedAbilities: [...state.unlockedAbilities, id],
    };
    saveState(nextState);
    set(nextState);
    return true;
  },

  toggleEquipAbility: (id) => {
    set((state) => {
      let nextEquipped = [...state.equippedAbilities];
      if (nextEquipped.includes(id)) {
        nextEquipped = nextEquipped.filter((a) => a !== id);
      } else {
        // Max 2 abilities equipped simultaneously
        if (nextEquipped.length >= 2) {
          nextEquipped.shift(); // Remove oldest
        }
        nextEquipped.push(id);
      }
      const nextState = { ...state, equippedAbilities: nextEquipped };
      saveState(nextState);
      return nextState;
    });
  },

  recordEndlessScore: (depth) => {
    const state = get();
    const isBest = depth > state.endlessHighScore;
    const nextState = { ...state, endlessRuns: state.endlessRuns + 1, endlessHighScore: Math.max(state.endlessHighScore, depth) };
    saveState(nextState);
    set(nextState);
    return isBest;
  },

  recordDailyScore: (day, depth) => {
    const state = get();
    const prev = state.dailyDay === day ? state.dailyBestDepth : 0;
    const nextState = { ...state, dailyDay: day, dailyBestDepth: Math.max(prev, depth) };
    saveState(nextState);
    set(nextState);
    return depth > prev;
  },

  buySkin: (id) => {
    const state = get();
    const skin = SKIN_BY_ID[id];
    if (!skin || state.ownedSkins.includes(id) || skin.unlock.kind !== 'shards') return false;
    if (state.shards < skin.unlock.value) return false;
    const nextState = { ...state, shards: state.shards - skin.unlock.value, ownedSkins: [...state.ownedSkins, id], equippedSkin: id };
    saveState(nextState);
    set(nextState);
    return true;
  },

  equipSkin: (id) => {
    const state = get();
    const skin = SKIN_BY_ID[id];
    if (!skin || skinStatus(skin, skinProgress(state)).state !== 'owned') return false;
    const nextState = { ...state, equippedSkin: id };
    saveState(nextState);
    set(nextState);
    return true;
  },

  setHeadphonePromptSeen: () => {
    set((state) => {
      const next = { ...state, hasSeenHeadphonePrompt: true };
      saveState(next);
      return next;
    });
  },
}));
