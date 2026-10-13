import { create } from 'zustand';
import { LevelRecord } from '../types/game';
import { saveManager } from '../save';
import { defaultSave } from '../save/schema';
import { Analytics } from '../analytics/Analytics';
import { getDebugFlags } from '../debug/debugFlags';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { applyVictory, VictoryResult, VictoryRun } from './progress';
import { balanceOf, credit, Ledger } from '../save/ledger';
import { claimDaily, DailyState, purchaseCharacter, PurchaseResult, selectCharacter } from './economy';

interface ProgressState {
  /** Spendable balance, always derived from the ledger and the owned bats. */
  shards: number;
  ledger: Ledger;
  records: Record<number, LevelRecord>;
  hasSeenHeadphonePrompt: boolean;
  selectedCharacter: string;
  unlockedCharacters: string[];
  claimedMilestones: string[];
  daily: DailyState;

  /** Buys a bat with shards (all-or-nothing) and saves. */
  buyCharacter: (id: string) => PurchaseResult;
  /** Equips an owned bat. Returns false when the bat is not owned. */
  chooseCharacter: (id: string) => boolean;
  /** Claims today's reward given TRUSTED UTC time; null when already claimed today. */
  claimDailyReward: (utcMs: number) => { reward: number; day: number } | null;
  /** Records a finished level (best time/stars, unlocks, shard reward) and saves it. */
  recordVictory: (levelId: number, run: VictoryRun) => VictoryResult;
  setHeadphonePromptSeen: () => void;
  /** Adds shards earned outside a level (e.g. a rewarded ad). Whole, positive amounts only. */
  creditShards: (amount: number, source: string) => void;
  /** Replaces in-memory state with the loaded save. Call once after saveManager.load(). */
  hydrate: () => void;
}

/** Copies the persisted slice of the store into the central save (versioned, backed up). */
const persist = (s: ProgressState) => {
  saveManager.mutate((d) => {
    d.ledger = s.ledger;
    d.shards = s.shards;
    d.records = s.records;
    d.hasSeenHeadphonePrompt = s.hasSeenHeadphonePrompt;
    d.selectedCharacter = s.selectedCharacter;
    d.unlockedCharacters = s.unlockedCharacters;
    d.claimedMilestones = s.claimedMilestones;
    d.daily = s.daily;
  });
};

const initial = defaultSave();

export const useProgressStore = create<ProgressState>((set, get) => ({
  shards: initial.shards,
  ledger: initial.ledger,
  records: initial.records,
  hasSeenHeadphonePrompt: initial.hasSeenHeadphonePrompt,
  selectedCharacter: initial.selectedCharacter,
  unlockedCharacters: initial.unlockedCharacters,
  claimedMilestones: initial.claimedMilestones,
  daily: initial.daily,

  hydrate: () => {
    const d = saveManager.data;
    set({
      shards: d.shards,
      ledger: d.ledger,
      records: d.records,
      hasSeenHeadphonePrompt: d.hasSeenHeadphonePrompt,
      selectedCharacter: d.selectedCharacter,
      unlockedCharacters: d.unlockedCharacters,
      claimedMilestones: d.claimedMilestones,
      daily: d.daily,
    });
  },

  recordVictory: (levelId, run) => {
    const s = get();
    const out = applyVictory(s.records, s.shards, levelId, { ...run, characterId: run.characterId ?? s.selectedCharacter }, s.claimedMilestones);
    const ledger = credit(s.ledger, out.result.shardsEarned);
    set({ records: out.records, ledger, shards: balanceOf(ledger, s.unlockedCharacters), claimedMilestones: out.claimedMilestones });
    persist(get());
    if (out.result.shardsEarned > 0) {
      Analytics.track({ name: 'shard_earned', amount: out.result.shardsEarned, source: `level_${levelId}` });
    }
    for (const m of out.result.milestones) Analytics.track({ name: 'mastery_milestone', chapterId: m.chapterId, pct: m.pct, bonus: m.bonus });
    return out.result;
  },

  buyCharacter: (id) => {
    // debug builds only (the flag is forced off in release): top the balance up so any bat can be bought for testing
    const price = ECHO_CONFIG.characters[id]?.price ?? 0;
    if (getDebugFlags().unlimitedShards && get().shards < price && !get().unlockedCharacters.includes(id)) {
      get().creditShards(price - get().shards, 'debug');
    }
    const s = get();
    const r = purchaseCharacter(s.shards, s.unlockedCharacters, id);
    if (!r.ok) return r;
    const spent = s.shards - r.shards;
    // the balance is earnings minus the price of owned bats, so owning the bat IS the payment
    set({ shards: balanceOf(s.ledger, r.unlocked), unlockedCharacters: r.unlocked });
    persist(get());
    Analytics.track({ name: 'shard_spent', amount: spent, item: id });
    Analytics.track({ name: 'character_unlocked', characterId: id });
    return r;
  },

  chooseCharacter: (id) => {
    const s = get();
    const next = selectCharacter(s.selectedCharacter, s.unlockedCharacters, id);
    if (next !== id) return false;
    if (next !== s.selectedCharacter) {
      set({ selectedCharacter: next });
      persist(get());
      Analytics.track({ name: 'character_selected', characterId: next });
    }
    return true;
  },

  creditShards: (amount, source) => {
    const s = get();
    const ledger = credit(s.ledger, amount);
    if (ledger === s.ledger) return; // zero, negative or not a number: nothing to add
    set({ ledger, shards: balanceOf(ledger, s.unlockedCharacters) });
    persist(get());
    Analytics.track({ name: 'shard_earned', amount: Math.floor(amount), source });
  },

  claimDailyReward: (utcMs) => {
    const s = get();
    const c = claimDaily(s.daily, utcMs);
    if (!c) return null;
    const ledger = credit(s.ledger, c.reward);
    set({ daily: c.daily, ledger, shards: balanceOf(ledger, s.unlockedCharacters) });
    persist(get());
    Analytics.track({ name: 'daily_claimed', day: c.day, amount: c.reward });
    Analytics.track({ name: 'shard_earned', amount: c.reward, source: 'daily' });
    return { reward: c.reward, day: c.day };
  },

  setHeadphonePromptSeen: () => {
    set({ hasSeenHeadphonePrompt: true });
    persist(get());
  },
}));
