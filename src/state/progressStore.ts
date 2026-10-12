import { create } from 'zustand';
import { LevelRecord } from '../types/game';
import { saveManager } from '../save';
import { defaultSave } from '../save/schema';
import { Analytics } from '../analytics/Analytics';
import { applyVictory, VictoryResult, VictoryRun } from './progress';

interface ProgressState {
  shards: number;
  records: Record<number, LevelRecord>;
  hasSeenHeadphonePrompt: boolean;
  selectedCharacter: string;

  /** Records a finished level (best time/stars, unlocks, shard reward) and saves it. */
  recordVictory: (levelId: number, run: VictoryRun) => VictoryResult;
  setHeadphonePromptSeen: () => void;
  /** Replaces in-memory state with the loaded save. Call once after saveManager.load(). */
  hydrate: () => void;
}

/** Copies the persisted slice of the store into the central save (versioned, backed up). */
const persist = (s: ProgressState) => {
  saveManager.mutate((d) => {
    d.shards = s.shards;
    d.records = s.records;
    d.hasSeenHeadphonePrompt = s.hasSeenHeadphonePrompt;
    d.selectedCharacter = s.selectedCharacter;
  });
};

const initial = defaultSave();

export const useProgressStore = create<ProgressState>((set, get) => ({
  shards: initial.shards,
  records: initial.records,
  hasSeenHeadphonePrompt: initial.hasSeenHeadphonePrompt,
  selectedCharacter: initial.selectedCharacter,

  hydrate: () => {
    const d = saveManager.data;
    set({
      shards: d.shards,
      records: d.records,
      hasSeenHeadphonePrompt: d.hasSeenHeadphonePrompt,
      selectedCharacter: d.selectedCharacter,
    });
  },

  recordVictory: (levelId, run) => {
    const s = get();
    const out = applyVictory(s.records, s.shards, levelId, run);
    set({ records: out.records, shards: out.shards });
    persist(get());
    if (out.result.shardsEarned > 0) {
      Analytics.track({ name: 'shard_earned', amount: out.result.shardsEarned, source: `level_${levelId}` });
    }
    return out.result;
  },

  setHeadphonePromptSeen: () => {
    set({ hasSeenHeadphonePrompt: true });
    persist(get());
  },
}));
