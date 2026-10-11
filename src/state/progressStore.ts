import { create } from 'zustand';
import { LevelRecord, AbilityId, AbilityInfo, GhostPoint } from '../types/game';
import { saveManager } from '../save';
import { getDebugFlags } from '../debug/debugFlags';
import { Analytics } from '../analytics/Analytics';
import { defaultSave } from '../save/schema';

export const ABILITIES: Record<AbilityId, AbilityInfo> = {
  WIDE_PULSE: {
    id: 'WIDE_PULSE',
    name: 'Wide Pulse',
    description: '1.4× radius, but 1.3× cost in Wraith hearing audibility',
    cost: 40,
    unlocked: false,
  },
  PIERCING_PING: {
    id: 'PIERCING_PING',
    name: 'Piercing Ping',
    description: 'Sonar wave passes through the first solid wall it strikes',
    cost: 75,
    unlocked: false,
  },
  RICOCHET: {
    id: 'RICOCHET',
    name: 'Ricochet',
    description: 'Sonar wave bounces once off surfaces, revealing around corners',
    cost: 120,
    unlocked: false,
  },
  WHISPER_STEP: {
    id: 'WHISPER_STEP',
    name: 'Whisper Step',
    description: 'Movement noise and sprint footstep volume reduced by 60%',
    cost: 90,
    unlocked: false,
  },
  SIXTH_SENSE: {
    id: 'SIXTH_SENSE',
    name: 'Sixth Sense',
    description: 'Faint pulse-free directional hint toward the goal, once per run',
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
  hasSeenHeadphonePrompt: boolean;
  selectedCharacter: string;

  // Actions
  addShards: (amount: number) => void;
  recordLevelVictory: (
    levelId: number,
    timeSeconds: number,
    sonarUsed: number,
    stars: number,
    ghostRun: boolean,
    perfectEcho: boolean,
    ghostTrack?: GhostPoint[]
  ) => { isNewBest: boolean; shardsEarned: number };
  unlockAbility: (id: AbilityId) => boolean;
  toggleEquipAbility: (id: AbilityId) => void;
  recordEndlessScore: (depth: number) => boolean;
  setHeadphonePromptSeen: () => void;
  /** Replaces in-memory state with the loaded save. Call once after saveManager.load(). */
  hydrate: () => void;
}

/** Copies the persisted slice of the store into the central save (versioned, backed up). */
const saveState = (state: ProgressState) => {
  saveManager.mutate((d) => {
    d.shards = state.shards;
    d.records = state.records;
    d.equippedAbilities = state.equippedAbilities;
    d.unlockedAbilities = state.unlockedAbilities;
    d.endlessHighScore = state.endlessHighScore;
    d.dailyBestDepth = state.dailyBestDepth;
    d.hasSeenHeadphonePrompt = state.hasSeenHeadphonePrompt;
    d.selectedCharacter = state.selectedCharacter;
  });
};

const initialSaved = defaultSave();

export const useProgressStore = create<ProgressState>((set, get) => ({
  shards: initialSaved.shards ?? 0,
  records: initialSaved.records ?? {
    1: { levelId: 1, unlocked: true, completed: false, stars: 0, bestTime: null, bestSonarUsed: null, ghostRun: false, perfectEcho: false },
  },
  equippedAbilities: initialSaved.equippedAbilities ?? [],
  unlockedAbilities: initialSaved.unlockedAbilities ?? [],
  endlessHighScore: initialSaved.endlessHighScore ?? 0,
  dailyBestDepth: initialSaved.dailyBestDepth ?? 0,
  hasSeenHeadphonePrompt: initialSaved.hasSeenHeadphonePrompt ?? false,
  selectedCharacter: initialSaved.selectedCharacter ?? 'bat_rookie',

  hydrate: () => {
    const d = saveManager.data;
    set({
      shards: d.shards,
      records: d.records,
      equippedAbilities: d.equippedAbilities,
      unlockedAbilities: d.unlockedAbilities,
      endlessHighScore: d.endlessHighScore,
      dailyBestDepth: d.dailyBestDepth,
      hasSeenHeadphonePrompt: d.hasSeenHeadphonePrompt,
      selectedCharacter: d.selectedCharacter,
    });
  },

  addShards: (amount) => {
    set((state) => {
      const next = { ...state, shards: state.shards + amount };
      saveState(next);
      return next;
    });
  },

  recordLevelVictory: (levelId, timeSeconds, sonarUsed, stars, ghostRun, perfectEcho, ghostTrack) => {
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
    const shardsEarned = newStars * 15 + (firstClear ? 25 : 0) + (ghostRun ? 10 : 0);

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
    const free = getDebugFlags().unlimitedShards; // debug builds only
    if (!info || (!free && state.shards < info.cost) || state.unlockedAbilities.includes(id)) {
      return false;
    }

    const nextState = {
      ...state,
      shards: free ? state.shards : state.shards - info.cost,
      unlockedAbilities: [...state.unlockedAbilities, id],
    };
    saveState(nextState);
    set(nextState);
    if (!free) Analytics.track({ name: 'shard_spent', amount: info.cost, item: id });
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
    if (depth > state.endlessHighScore) {
      const nextState = { ...state, endlessHighScore: depth };
      saveState(nextState);
      set(nextState);
      return true;
    }
    return false;
  },

  setHeadphonePromptSeen: () => {
    set((state) => {
      const next = { ...state, hasSeenHeadphonePrompt: true };
      saveState(next);
      return next;
    });
  },
}));
