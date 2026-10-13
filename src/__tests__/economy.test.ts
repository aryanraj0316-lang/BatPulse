import { ECHO_CONFIG } from '../constants/gameConfig';
import { CHAPTERS, chapterLevelIds } from '../levels/chapters';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { LevelRecord } from '../types/game';
import { claimDaily, dailyRewardFor, dailyStatus, DailyState, MS_PER_DAY, purchaseCharacter, selectCharacter, utcDay } from '../state/economy';
import { applyVictory } from '../state/progress';
import { chapterMilestoneStates, newMilestones, reachedMilestones } from '../state/mastery';
import { fetchTrustedTime, parseTrustedTime } from '../state/trustedTime';
import { defaultSave, migrateSave } from '../save/schema';

const rec = (id: number, stars: number): LevelRecord => ({ levelId: id, unlocked: true, completed: stars > 0, stars, bestTime: stars ? 10 : null, bestMomentum: null, ghostRun: false });
const DAY0 = Date.UTC(2026, 5, 1, 12, 0, 0);

describe('purchases', () => {
  it('buys with exact funds, never goes negative, never charges twice', () => {
    const r = purchaseCharacter(1500, ['bat_rookie'], 'bat_vesper');
    expect(r).toEqual({ ok: true, shards: 0, unlocked: ['bat_rookie', 'bat_vesper'] });
    expect(purchaseCharacter(0, ['bat_rookie', 'bat_vesper'], 'bat_vesper')).toEqual({ ok: false, reason: 'already_owned' });
  });
  it('refuses when one shard short and tells how many are missing', () => {
    expect(purchaseCharacter(1499, ['bat_rookie'], 'bat_vesper')).toEqual({ ok: false, reason: 'not_enough_shards', missing: 1 });
    expect(purchaseCharacter(9999, ['bat_rookie'], 'bat_turbo')).toEqual({ ok: false, reason: 'not_enough_shards', missing: 1 });
  });
  it('rejects unknown ids and broken numbers', () => {
    expect(purchaseCharacter(99999, ['bat_rookie'], 'bat_ghost')).toEqual({ ok: false, reason: 'unknown_character' });
    expect(purchaseCharacter(NaN, ['bat_rookie'], 'bat_vesper').ok).toBe(false);
  });
  it('does not mutate its inputs', () => {
    const owned = ['bat_rookie'];
    purchaseCharacter(5000, owned, 'bat_sonarbot');
    expect(owned).toEqual(['bat_rookie']);
  });
  it('can only equip owned bats', () => {
    expect(selectCharacter('bat_rookie', ['bat_rookie'], 'bat_turbo')).toBe('bat_rookie');
    expect(selectCharacter('bat_rookie', ['bat_rookie', 'bat_turbo'], 'bat_turbo')).toBe('bat_turbo');
    expect(selectCharacter('bat_rookie', ['bat_rookie'], 'zzz')).toBe('bat_rookie');
  });
  it('Rookie is free and owned from the start', () => {
    expect(ECHO_CONFIG.characters.bat_rookie.price).toBe(0);
    expect(defaultSave().unlockedCharacters).toEqual(['bat_rookie']);
    expect(defaultSave().selectedCharacter).toBe('bat_rookie');
  });
});

describe('daily reward', () => {
  const none: DailyState = { lastClaimDay: null, streak: 0 };
  it('rewards ramp from 50 to 100 over the week, with the streak bonus on day 7', () => {
    const r = [1, 2, 3, 4, 5, 6, 7].map(dailyRewardFor);
    expect(r[0]).toBe(ECHO_CONFIG.rewards.dailyLoginMin);
    expect(r[5]).toBe(ECHO_CONFIG.rewards.dailyLoginMax - 0 - (ECHO_CONFIG.rewards.dailyLoginMax - Math.round(ECHO_CONFIG.rewards.dailyLoginMin + ((ECHO_CONFIG.rewards.dailyLoginMax - ECHO_CONFIG.rewards.dailyLoginMin) * 5) / 6)));
    expect(r[6]).toBe(ECHO_CONFIG.rewards.dailyLoginMax + ECHO_CONFIG.rewards.dailyStreakBonus);
    for (let i = 1; i < 6; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
    expect(Math.max(...r.slice(0, 6))).toBeLessThanOrEqual(ECHO_CONFIG.rewards.dailyLoginMax);
  });
  it('the first ever claim is day 1', () => {
    expect(dailyStatus(none, DAY0)).toEqual({ canClaim: true, day: 1, reward: 50, streakBroken: false });
  });
  it('cannot be claimed twice on the same UTC day, and shows the wait until midnight UTC', () => {
    const c = claimDaily(none, DAY0)!;
    expect(c.reward).toBe(50);
    expect(claimDaily(c.daily, DAY0 + 1000)).toBeNull();
    const s = dailyStatus(c.daily, DAY0);
    expect(s.canClaim).toBe(false);
    if (!s.canClaim) expect(s.msUntilNext).toBe((utcDay(DAY0) + 1) * MS_PER_DAY - DAY0);
  });
  it('consecutive days build the streak up to 7, then a new cycle starts', () => {
    let d = none;
    const got: number[] = [];
    for (let i = 0; i < 9; i++) {
      const c = claimDaily(d, DAY0 + i * MS_PER_DAY)!;
      got.push(c.day);
      d = c.daily;
    }
    expect(got).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
  });
  it('missing a day restarts the streak at day 1 and says so', () => {
    const c = claimDaily(none, DAY0)!;
    const c2 = claimDaily(c.daily, DAY0 + MS_PER_DAY)!;
    const s = dailyStatus(c2.daily, DAY0 + 3 * MS_PER_DAY);
    expect(s).toEqual({ canClaim: true, day: 1, reward: 50, streakBroken: true });
  });
  it('a clock set backwards cannot claim again', () => {
    const c = claimDaily(none, DAY0 + 5 * MS_PER_DAY)!;
    expect(claimDaily(c.daily, DAY0)).toBeNull();
    expect(claimDaily(c.daily, DAY0 + 4 * MS_PER_DAY)).toBeNull();
  });
  it('midnight UTC is the boundary, not 24 h after the claim', () => {
    const lateEvening = Date.UTC(2026, 5, 1, 23, 59, 0);
    const c = claimDaily(none, lateEvening)!;
    expect(claimDaily(c.daily, lateEvening + 30_000)).toBeNull();
    expect(claimDaily(c.daily, lateEvening + 120_000)).not.toBeNull();
  });
});

describe('trusted time', () => {
  it('parses both services and rejects junk', () => {
    expect(parseTrustedTime('worldtimeapi', { unixtime: 1_800_000_000 })).toBe(1_800_000_000_000);
    expect(parseTrustedTime('timeapi', { dateTime: '2026-06-01T12:00:00' })).toBe(Date.UTC(2026, 5, 1, 12));
    expect(parseTrustedTime('timeapi', { dateTime: '2026-06-01T12:00:00.1234567Z' })).toBeGreaterThan(0);
    expect(parseTrustedTime('worldtimeapi', { unixtime: 5 })).toBeNull(); // 1970
    expect(parseTrustedTime('worldtimeapi', {})).toBeNull();
    expect(parseTrustedTime('timeapi', { dateTime: 'garbage' })).toBeNull();
    expect(parseTrustedTime('timeapi', null)).toBeNull();
  });
  it('falls through to the next source, and returns null (never the phone clock) when all fail', async () => {
    const urls: string[] = [];
    const flaky = async (url: string) => {
      urls.push(url);
      if (url.includes('worldtimeapi')) throw new Error('down');
      return { dateTime: '2026-06-01T12:00:00' };
    };
    expect(await fetchTrustedTime(flaky)).toBe(Date.UTC(2026, 5, 1, 12));
    expect(urls).toHaveLength(2);
    expect(await fetchTrustedTime(async () => { throw new Error('offline'); })).toBeNull();
    expect(await fetchTrustedTime(async () => ({ nonsense: true }))).toBeNull();
  });
});

describe('chapter mastery', () => {
  const ch1 = CHAPTERS[0];
  const records = (stars: number): Record<number, LevelRecord> => {
    const out: Record<number, LevelRecord> = {};
    for (const id of chapterLevelIds(ch1)) out[id] = rec(id, 0);
    // distribute `stars` over the chapter's levels, 3 per level
    let left = stars;
    for (const id of chapterLevelIds(ch1)) {
      const s = Math.min(3, left);
      out[id] = rec(id, s);
      left -= s;
    }
    return out;
  };
  const max = chapterLevelIds(ch1).length * 3;

  it('milestones appear at 25 / 50 / 75 / 100 % of the chapter stars', () => {
    expect(reachedMilestones(ch1, records(0))).toHaveLength(0);
    expect(reachedMilestones(ch1, records(Math.ceil(max * 0.25))).map((m) => m.key)).toEqual(['1:25']);
    expect(reachedMilestones(ch1, records(Math.ceil(max * 0.5))).map((m) => m.key)).toEqual(['1:25', '1:50']);
    expect(reachedMilestones(ch1, records(max)).map((m) => m.key)).toEqual(['1:25', '1:50', '1:75', '1:100']);
    expect(reachedMilestones(ch1, records(Math.ceil(max * 0.25) - 1))).toHaveLength(0);
  });
  it('a claimed milestone is never paid twice', () => {
    expect(newMilestones(records(max), ['1:25', '1:50']).map((m) => m.key)).toEqual(['1:75', '1:100']);
    expect(newMilestones(records(max), ['1:25', '1:50', '1:75', '1:100'])).toEqual([]);
  });
  it('bar markers show reached and claimed state', () => {
    const states = chapterMilestoneStates(ch1, records(Math.ceil(max * 0.5)), ['1:25']);
    expect(states.map((s) => [s.pct, s.reached, s.claimed])).toEqual([
      [0.25, true, true],
      [0.5, true, false],
      [0.75, false, false],
      [1, false, false],
    ]);
  });
  it('applyVictory pays a milestone once, together with the level reward', () => {
    const ids = chapterLevelIds(ch1);
    let recs: Record<number, LevelRecord> = {};
    for (const id of ids) recs[id] = { ...rec(id, 0), unlocked: true };
    let shards = 0;
    let claimed: string[] = [];
    const total: number[] = [];
    for (const id of ids) {
      const out = applyVictory(recs, shards, id, { timeSec: 10, stars: 3, momentum: 1, bestMomentum: 1 }, claimed);
      recs = out.records;
      shards = out.shards;
      claimed = out.claimedMilestones;
      total.push(out.result.masteryBonus);
      expect(out.result.shardsEarned).toBe(50 + out.result.masteryBonus);
    }
    const expected = ECHO_CONFIG.rewards.masteryMilestones.reduce((n, m) => n + m.bonus, 0);
    expect(total.reduce((a, b) => a + b, 0)).toBe(expected);
    expect(claimed).toEqual(['1:25', '1:50', '1:75', '1:100']);
    // replaying everything pays no more mastery
    const again = applyVictory(recs, shards, ids[0], { timeSec: 9, stars: 3, momentum: 1, bestMomentum: 1 }, claimed);
    expect(again.result.masteryBonus).toBe(0);
  });
});

describe('best times per character', () => {
  it('keeps the best time for every bat separately, plus the overall best', () => {
    let out = applyVictory({}, 0, 1, { timeSec: 12, stars: 2, momentum: 1, bestMomentum: 1, characterId: 'bat_rookie' });
    out = applyVictory(out.records, out.shards, 1, { timeSec: 9, stars: 3, momentum: 1, bestMomentum: 1, characterId: 'bat_turbo' }, out.claimedMilestones);
    out = applyVictory(out.records, out.shards, 1, { timeSec: 11, stars: 3, momentum: 1, bestMomentum: 1, characterId: 'bat_rookie' }, out.claimedMilestones);
    expect(out.records[1].bestTimes).toEqual({ bat_rookie: 11, bat_turbo: 9 });
    expect(out.records[1].bestTime).toBe(9);
  });
  it('survives a save round trip and ignores corrupt entries', () => {
    const s = defaultSave();
    s.records[1] = { ...rec(1, 3), bestTimes: { bat_rookie: 10 } };
    const back = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(back.records[1].bestTimes).toEqual({ bat_rookie: 10 });
    const bad = JSON.parse(JSON.stringify(s));
    bad.records[1].bestTimes = { bat_rookie: -3, x: 'a', bat_turbo: 8 };
    expect(migrateSave(bad).records[1].bestTimes).toEqual({ bat_turbo: 8 });
    expect(migrateSave({ ...JSON.parse(JSON.stringify(s)), claimedMilestones: ['1:25', '1:25', 5] }).claimedMilestones).toEqual(['1:25']);
  });
});

describe('economy over the whole game', () => {
  const ids = authoredLevelIds().filter((i) => i > 0);
  const playthrough = (stars: 1 | 2 | 3, ghostLevels: (id: number) => boolean) => {
    let recs: Record<number, LevelRecord> = {};
    let shards = 0;
    let claimed: string[] = [];
    for (const id of ids) {
      const out = applyVictory(recs, shards, id, { timeSec: 10, stars, momentum: 1, bestMomentum: 1, ghostRun: ghostLevels(id) }, claimed);
      recs = out.records;
      shards = out.shards;
      claimed = out.claimedMilestones;
    }
    return shards;
  };
  const hunterLevels = new Set(ids.filter((id) => (loadAuthoredLevel(id, true)?.enemies.length ?? 0) > 0));

  it('has the 50 levels and at least one hunter level to ghost-run', () => {
    expect(ids).toHaveLength(50);
    expect(hunterLevels.size).toBeGreaterThan(20);
  });

  it('the spec rewards add up: first clear pays 20 / 35 / 50 and a ghost run +25 once', () => {
    const one = playthrough(1, () => false);
    const three = playthrough(3, () => false);
    const mastery = ECHO_CONFIG.rewards.masteryMilestones.reduce((n, m) => n + m.bonus, 0) * CHAPTERS.length;
    // with 1 star per level only the 25 % milestone of each chapter can be reached (1/3 of the stars)
    expect(one).toBe(50 * 20 + 25 * 0 + CHAPTERS.length * ECHO_CONFIG.rewards.masteryMilestones[0].bonus);
    expect(three).toBe(50 * 50 + mastery);
    expect(playthrough(3, (id) => hunterLevels.has(id)) - three).toBe(hunterLevels.size * ECHO_CONFIG.rewards.ghostRunBonus);
  });

  it('economy pacing: the whole roster costs more than one perfect first run earns, so replays matter', () => {
    const roster = Object.values(ECHO_CONFIG.characters).reduce((n, c) => n + c.price, 0);
    const perfect = playthrough(3, (id) => hunterLevels.has(id));
    expect(roster).toBe(21000);
    expect(perfect).toBeLessThan(roster);
    // a perfect first run affords Vesper or Sonar-Bot, but not both: the top bats need replays and the daily reward
    expect(perfect).toBeGreaterThan(ECHO_CONFIG.characters.bat_sonarbot.price);
    expect(perfect).toBeLessThan(ECHO_CONFIG.characters.bat_vesper.price + ECHO_CONFIG.characters.bat_sonarbot.price);
    expect(perfect).toBeLessThan(ECHO_CONFIG.characters.bat_phantom.price);
  });

  it('farming one level is never better than progressing (replays pay a quarter)', () => {
    const first = applyVictory({}, 0, 1, { timeSec: 10, stars: 3, momentum: 1, bestMomentum: 1 });
    const replay = applyVictory(first.records, first.shards, 1, { timeSec: 10, stars: 3, momentum: 1, bestMomentum: 1 }, first.claimedMilestones);
    expect(replay.result.shardsEarned).toBe(Math.round(50 * ECHO_CONFIG.rewards.replayFactor));
    expect(replay.result.shardsEarned).toBeLessThan(first.result.shardsEarned);
  });

  it('Turbo Moth momentum cap raises the reward at the finish, as designed (x4 at most)', () => {
    const x4 = applyVictory({}, 0, 1, { timeSec: 10, stars: 3, momentum: 4, bestMomentum: 4 });
    expect(x4.result.shardsEarned).toBe(200);
  });
});
