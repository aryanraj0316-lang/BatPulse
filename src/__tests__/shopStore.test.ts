import { MemoryStorage } from '../save/storage';
import { SaveManager } from '../save/SaveManager';

// the store talks to the app-wide save manager: back it with memory so a "restart" can be simulated
const storage = new MemoryStorage();
let mockManager = new SaveManager(storage);
jest.mock('../save', () => ({
  get saveManager() {
    return mockManager;
  },
}));

// eslint-disable-next-line import/first
import { useProgressStore } from '../state/progressStore';
import { Analytics } from '../analytics/Analytics';
import { MS_PER_DAY } from '../state/economy';

const T0 = Date.UTC(2026, 5, 1, 9, 0, 0);

async function boot() {
  mockManager = new SaveManager(storage);
  await mockManager.load();
  useProgressStore.getState().hydrate();
}
const give = (n: number) => {
  useProgressStore.setState({ shards: n });
  mockManager.mutate((d) => (d.shards = n));
};
const st = () => useProgressStore.getState();

describe('shop and daily reward through the store', () => {
  beforeEach(async () => {
    storage.map.clear();
    await boot();
  });

  it('starts with the Rookie only', () => {
    expect(st().unlockedCharacters).toEqual(['bat_rookie']);
    expect(st().selectedCharacter).toBe('bat_rookie');
  });

  it('a purchase deducts the price, unlocks the bat and survives a restart', async () => {
    give(2000);
    const r = st().buyCharacter('bat_vesper');
    expect(r.ok).toBe(true);
    expect(st().shards).toBe(500);
    expect(st().unlockedCharacters).toContain('bat_vesper');
    await mockManager.flush();
    await boot();
    expect(st().shards).toBe(500);
    expect(st().unlockedCharacters).toEqual(['bat_rookie', 'bat_vesper']);
  });

  it('a failed purchase changes nothing', () => {
    give(1499);
    const r = st().buyCharacter('bat_vesper');
    expect(r).toEqual({ ok: false, reason: 'not_enough_shards', missing: 1 });
    expect(st().shards).toBe(1499);
    expect(st().unlockedCharacters).toEqual(['bat_rookie']);
  });

  it('buying twice only charges once', () => {
    give(5000);
    st().buyCharacter('bat_vesper');
    const again = st().buyCharacter('bat_vesper');
    expect(again.ok).toBe(false);
    expect(st().shards).toBe(3500);
  });

  it('equipping needs ownership, and the choice persists', async () => {
    give(4000);
    expect(st().chooseCharacter('bat_sonarbot')).toBe(false);
    expect(st().selectedCharacter).toBe('bat_rookie');
    st().buyCharacter('bat_sonarbot');
    expect(st().chooseCharacter('bat_sonarbot')).toBe(true);
    await mockManager.flush();
    await boot();
    expect(st().selectedCharacter).toBe('bat_sonarbot');
    expect(st().chooseCharacter('bat_rookie')).toBe(true);
  });

  it('the finished level is recorded against the equipped bat', () => {
    give(1500);
    st().buyCharacter('bat_vesper');
    st().chooseCharacter('bat_vesper');
    st().recordVictory(1, { timeSec: 14, stars: 2, momentum: 1, bestMomentum: 1 });
    expect(st().records[1].bestTimes).toEqual({ bat_vesper: 14 });
  });

  it('the daily reward pays once per UTC day and persists', async () => {
    const first = st().claimDailyReward(T0);
    expect(first).toEqual({ reward: 50, day: 1 });
    expect(st().shards).toBe(50);
    expect(st().claimDailyReward(T0 + 3600_000)).toBeNull();
    expect(st().shards).toBe(50);
    await mockManager.flush();
    await boot();
    expect(st().daily.streak).toBe(1);
    expect(st().claimDailyReward(T0 + 1000)).toBeNull(); // still the same day after a restart
    expect(st().claimDailyReward(T0 + MS_PER_DAY)?.day).toBe(2);
  });

  it('mastery milestones are remembered across a restart and never paid twice', async () => {
    // 5 first clears of 3 stars = 15 of Chapter 1's 60 stars = the 25 % milestone
    for (let id = 1; id <= 5; id++) st().recordVictory(id, { timeSec: 10, stars: 3, momentum: 1, bestMomentum: 1 });
    expect(st().claimedMilestones).toEqual(['1:25']);
    const before = st().shards;
    await mockManager.flush();
    await boot();
    expect(st().claimedMilestones).toEqual(['1:25']);
    const r = st().recordVictory(1, { timeSec: 9, stars: 3, momentum: 1, bestMomentum: 1 });
    expect(r.masteryBonus).toBe(0);
    expect(st().shards - before).toBe(r.shardsEarned);
  });

  it('reports shop events to analytics', () => {
    const spy = jest.spyOn(Analytics, 'track');
    give(2000);
    st().buyCharacter('bat_vesper');
    st().claimDailyReward(T0);
    const names = spy.mock.calls.map((c) => c[0].name);
    expect(names).toEqual(expect.arrayContaining(['shard_spent', 'character_unlocked', 'daily_claimed', 'shard_earned']));
    spy.mockRestore();
  });
});
