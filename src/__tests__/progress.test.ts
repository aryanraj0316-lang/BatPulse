import { applyVictory, emptyRecord } from '../state/progress';
import { LevelRecord } from '../types/game';

const fresh = (): Record<number, LevelRecord> => ({ 1: emptyRecord(1, true) });

describe('applyVictory', () => {
  it('first clear: pays 20/35/50 x momentum, records, unlocks the next level', () => {
    const out = applyVictory(fresh(), 100, 1, { timeSec: 12, stars: 3, momentum: 1.2, bestMomentum: 1.4 });
    expect(out.result).toMatchObject({ firstClear: true, shardsEarned: 60, isNewBestTime: true, newBestStars: true, ghostBonus: 0 });
    expect(out.shards).toBe(160);
    expect(out.records[1]).toMatchObject({ completed: true, stars: 3, bestTime: 12, bestMomentum: 1.4 });
    expect(out.records[2].unlocked).toBe(true);
    expect(out.records[2].completed).toBe(false);
  });
  it('replays pay less and only improve the records', () => {
    const first = applyVictory(fresh(), 0, 1, { timeSec: 20, stars: 2, momentum: 1, bestMomentum: 1.1 });
    const replay = applyVictory(first.records, first.shards, 1, { timeSec: 30, stars: 1, momentum: 1, bestMomentum: 1 });
    expect(replay.result.firstClear).toBe(false);
    expect(replay.result.shardsEarned).toBeLessThan(first.result.shardsEarned);
    expect(replay.result.shardsEarned).toBeGreaterThanOrEqual(1);
    expect(replay.records[1].stars).toBe(2); // never downgraded
    expect(replay.records[1].bestTime).toBe(20); // slower run does not replace it
    expect(replay.records[1].bestMomentum).toBe(1.1);
    expect(replay.result.isNewBestTime).toBe(false);
    expect(replay.result.newBestStars).toBe(false);
  });
  it('a better replay updates time, stars and momentum', () => {
    const first = applyVictory(fresh(), 0, 1, { timeSec: 30, stars: 1, momentum: 1, bestMomentum: 1 });
    const replay = applyVictory(first.records, first.shards, 1, { timeSec: 9, stars: 3, momentum: 1.5, bestMomentum: 1.5 });
    expect(replay.records[1]).toMatchObject({ stars: 3, bestTime: 9, bestMomentum: 1.5 });
    expect(replay.result).toMatchObject({ isNewBestTime: true, newBestStars: true });
  });
  it('does not mutate its inputs and never loses shards', () => {
    const recs = fresh();
    const snapshot = JSON.stringify(recs);
    const out = applyVictory(recs, 500, 1, { timeSec: 5, stars: 1, momentum: 1, bestMomentum: 1 });
    expect(JSON.stringify(recs)).toBe(snapshot);
    expect(out.shards).toBeGreaterThanOrEqual(500);
  });
  it('completing a level that has a later record keeps that record', () => {
    const recs = { ...fresh(), 2: { ...emptyRecord(2, true), completed: true, stars: 3, bestTime: 5 } };
    const out = applyVictory(recs, 0, 1, { timeSec: 5, stars: 1, momentum: 1, bestMomentum: 1 });
    expect(out.records[2]).toMatchObject({ completed: true, stars: 3, bestTime: 5, unlocked: true });
  });

  it('Ghost Run: +25 shards the first time only, and the badge is kept', () => {
    const first = applyVictory(fresh(), 0, 1, { timeSec: 10, stars: 1, momentum: 1, bestMomentum: 1, ghostRun: true });
    expect(first.result.ghostBonus).toBe(25);
    expect(first.result.shardsEarned).toBe(20 + 25);
    expect(first.records[1].ghostRun).toBe(true);
    const again = applyVictory(first.records, first.shards, 1, { timeSec: 10, stars: 1, momentum: 1, bestMomentum: 1, ghostRun: true });
    expect(again.result.ghostBonus).toBe(0); // already earned
    expect(again.records[1].ghostRun).toBe(true);
    const noGhost = applyVictory(first.records, first.shards, 1, { timeSec: 10, stars: 1, momentum: 1, bestMomentum: 1, ghostRun: false });
    expect(noGhost.records[1].ghostRun).toBe(true); // a later loud run never removes the badge
  });
  it('a level first cleared loudly can still earn the Ghost bonus later', () => {
    const loud = applyVictory(fresh(), 0, 1, { timeSec: 10, stars: 1, momentum: 1, bestMomentum: 1, ghostRun: false });
    expect(loud.records[1].ghostRun).toBe(false);
    const ghost = applyVictory(loud.records, loud.shards, 1, { timeSec: 10, stars: 1, momentum: 1, bestMomentum: 1, ghostRun: true });
    expect(ghost.result.ghostBonus).toBe(25);
    expect(ghost.result.firstClear).toBe(false);
  });
});
