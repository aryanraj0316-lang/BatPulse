import * as fs from 'fs';
import * as path from 'path';
import { authoredLevelIds, loadAuthoredLevel } from '../levels/loader';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { Leaderboards } from '../leaderboard/Leaderboards';
import { HttpLeaderboardProvider, LeaderboardProvider, RemoteRow } from '../leaderboard/providers';
import { MAX_BOARD_TIME_SEC, MAX_QUEUE, Submission, boardKey, displayNameFor, enqueueScore, minPossibleTimeSec, personalBoard, validateSubmission } from '../leaderboard/rules';
import { applyVictory } from '../state/progress';
import { defaultSave, migrateSave } from '../save/schema';
import { LevelRecord } from '../types/game';

const level = (id: number) => loadAuthoredLevel(id, true)!;
const sub = (levelId: number, character: string, timeSec: number): Submission => ({ levelId, character, timeSec });

describe('board rules', () => {
  it('a board is one level + one bat', () => {
    expect(boardKey(7, 'bat_turbo')).toBe('7:bat_turbo');
    expect(boardKey(7, 'bat_turbo')).not.toBe(boardKey(7, 'bat_rookie'));
  });

  it('the minimum time is a straight line to the finish at top speed', () => {
    const d = level(1);
    const reach = Math.hypot(d.finish.x - d.start.x, d.finish.y - d.start.y) - (d.finish.radius ?? 18) - ECHO_CONFIG.player.radius;
    expect(minPossibleTimeSec(d)).toBeCloseTo(reach / ECHO_CONFIG.player.speed, 6);
    expect(minPossibleTimeSec(d)).toBeGreaterThan(0);
  });

  it('on every level the star times and par are physically reachable', () => {
    const ids = authoredLevelIds().filter((i) => i > 0);
    expect(ids).toHaveLength(50);
    for (const id of ids) {
      const d = level(id);
      const min = minPossibleTimeSec(d);
      // a 3-star time below the physical minimum would make the star impossible
      expect({ id, ok: d.starThresholds.three >= min }).toEqual({ id, ok: true });
      expect({ id, ok: d.parTime >= min * 0.9 }).toEqual({ id, ok: true });
    }
  });

  it('accepts a normal clear on every level (the recorded bot clean time passes validation)', () => {
    for (const id of authoredLevelIds().filter((i) => i > 0)) {
      const d = level(id);
      expect(validateSubmission(sub(id, 'bat_rookie', d.parTime), d)).toBeNull();
    }
  });

  it('rejects impossible and broken submissions', () => {
    const d = level(1);
    const min = minPossibleTimeSec(d);
    expect(validateSubmission(sub(1, 'bat_rookie', min * 0.5), d)).toBe('too_fast');
    expect(validateSubmission(sub(1, 'bat_rookie', min * 0.99), d)).toBeNull(); // within the 2 % frame slack
    expect(validateSubmission(sub(1, 'bat_rookie', 0), d)).toBe('bad_time');
    expect(validateSubmission(sub(1, 'bat_rookie', -4), d)).toBe('bad_time');
    expect(validateSubmission(sub(1, 'bat_rookie', NaN), d)).toBe('bad_time');
    expect(validateSubmission(sub(1, 'bat_rookie', Infinity), d)).toBe('bad_time');
    expect(validateSubmission(sub(1, 'bat_rookie', MAX_BOARD_TIME_SEC + 1), d)).toBe('too_slow');
    expect(validateSubmission(sub(1, 'bat_ghost', 30), d)).toBe('unknown_character');
    expect(validateSubmission(sub(999, 'bat_rookie', 30), null)).toBe('unknown_level');
    expect(validateSubmission(sub(2, 'bat_rookie', 30), d)).toBe('unknown_level'); // level data does not match the id
    expect(validateSubmission(sub(0, 'bat_rookie', 30), level(0 as number) ?? null)).toBe('unknown_level'); // the debug chamber is never ranked
  });

  it('names are anonymous, stable and short', () => {
    expect(displayNameFor('d00c0ffee0123abcd')).toBe('Bat-ABCD');
    expect(displayNameFor('d00c0ffee0123abcd')).toBe(displayNameFor('d00c0ffee0123abcd'));
    expect(displayNameFor('')).toBe('Bat-0000');
    expect(displayNameFor('zzz')).toBe('Bat-0000');
  });
});

describe('personal board', () => {
  const rec: LevelRecord = { levelId: 3, unlocked: true, completed: true, stars: 3, bestTime: 9, bestMomentum: 1, ghostRun: false, bestTimes: { bat_rookie: 12.5, bat_turbo: 9, bat_vesper: 11 } };
  it('lists every bat the player has a time for, fastest first, in numbers', () => {
    const rows = personalBoard(rec, 'Bat-1234');
    expect(rows.map((r) => r.timeSec)).toEqual([9, 11, 12.5]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].name).toContain('Turbo Moth');
    expect(rows.every((r) => r.isYou)).toBe(true);
  });
  it('is empty for a level without bat times', () => {
    expect(personalBoard(undefined, 'x')).toEqual([]);
    expect(personalBoard({ ...rec, bestTimes: undefined }, 'x')).toEqual([]);
  });
});

describe('offline queue', () => {
  it('keeps only the fastest time per board', () => {
    let q = enqueueScore([], sub(1, 'bat_rookie', 20));
    q = enqueueScore(q, sub(1, 'bat_rookie', 25)); // slower: ignored
    q = enqueueScore(q, sub(1, 'bat_rookie', 18)); // faster: replaces
    q = enqueueScore(q, sub(1, 'bat_turbo', 30)); // another bat = another board
    expect(q).toEqual([sub(1, 'bat_rookie', 18), sub(1, 'bat_turbo', 30)]);
  });
  it('is bounded', () => {
    let q: Submission[] = [];
    for (let i = 1; i <= MAX_QUEUE + 30; i++) q = enqueueScore(q, sub(i, 'bat_rookie', 10));
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q.at(-1)!.levelId).toBe(MAX_QUEUE + 30);
  });
  it('does not modify its input', () => {
    const q = [sub(1, 'bat_rookie', 20)];
    enqueueScore(q, sub(1, 'bat_rookie', 10));
    expect(q).toEqual([sub(1, 'bat_rookie', 20)]);
  });
  it('is saved, cleaned on load and capped', () => {
    const s = JSON.parse(JSON.stringify(defaultSave()));
    s.scoreQueue = [sub(1, 'bat_rookie', 20), sub(1, 'bat_rookie', 15), { levelId: 2, character: 'bat_rookie', timeSec: -1 }, { levelId: 'x' }, null, sub(3, 'bat_turbo', 9)];
    expect(migrateSave(s).scoreQueue).toEqual([sub(1, 'bat_rookie', 15), sub(3, 'bat_turbo', 9)]);
    expect(migrateSave({ scoreQueue: 'nope' }).scoreQueue).toEqual([]);
    expect(defaultSave().scoreQueue).toEqual([]);
  });
});

/* ------------------------------------------------------------------ the service with a fake backend */
class FakeBoard implements LeaderboardProvider {
  sent: (Submission & { name: string })[] = [];
  rows: RemoteRow[] = [];
  down = false;
  reject = false;
  topCalls = 0;
  async submit(e: Submission & { name: string }) {
    if (this.down) throw new Error('offline');
    if (this.reject) return false;
    this.sent.push(e);
    return true;
  }
  async top() {
    this.topCalls++;
    if (this.down) throw new Error('offline');
    return this.rows;
  }
}

function service(provider: LeaderboardProvider | null = new FakeBoard()) {
  let queue: Submission[] = [];
  let now = 1_000_000;
  const svc = new Leaderboards({
    provider,
    getQueue: () => queue,
    setQueue: (q) => (queue = q),
    getName: () => 'Bat-TEST',
    loadLevel: (id) => loadAuthoredLevel(id, true) ?? null,
    now: () => now,
  });
  return { svc, board: provider as FakeBoard, queue: () => queue, advance: (ms: number) => (now += ms) };
}
const okTime = (id: number) => level(id).parTime;

describe('Leaderboards service', () => {
  it('sends a valid best time and empties the queue', async () => {
    const { svc, board, queue } = service();
    expect(await svc.submitBest(sub(1, 'bat_rookie', okTime(1)))).toBe('sent');
    expect(board.sent).toEqual([{ ...sub(1, 'bat_rookie', okTime(1)), name: 'Bat-TEST' }]);
    expect(queue()).toEqual([]);
  });

  it('offline: the time is kept and sent on the next flush', async () => {
    const { svc, board, queue } = service();
    board.down = true;
    expect(await svc.submitBest(sub(1, 'bat_rookie', okTime(1)))).toBe('queued');
    expect(queue()).toHaveLength(1);
    expect(svc.pending).toBe(1);
    board.down = false;
    await svc.flush();
    expect(board.sent).toHaveLength(1);
    expect(queue()).toEqual([]);
  });

  it('a server refusal removes the entry for good (no endless retries)', async () => {
    const { svc, board, queue } = service();
    board.reject = true;
    expect(await svc.submitBest(sub(1, 'bat_rookie', okTime(1)))).toBe('sent');
    expect(queue()).toEqual([]);
    expect(board.sent).toEqual([]);
  });

  it('invalid times are never queued or sent', async () => {
    const { svc, board, queue } = service();
    expect(await svc.submitBest(sub(1, 'bat_rookie', 0.5))).toBe('too_fast');
    expect(await svc.submitBest(sub(1, 'bat_rookie', NaN))).toBe('bad_time');
    expect(await svc.submitBest(sub(1, 'nobody', 20))).toBe('unknown_character');
    expect(await svc.submitBest(sub(0, 'bat_rookie', 20))).toBe('unknown_level');
    expect(queue()).toEqual([]);
    expect(board.sent).toEqual([]);
  });

  it('without a backend nothing is queued and the status says disabled', async () => {
    const { svc, queue } = service(null);
    expect(svc.enabled).toBe(false);
    expect(await svc.submitBest(sub(1, 'bat_rookie', okTime(1)))).toBe('disabled');
    expect(queue()).toEqual([]);
    expect(await svc.top(1, 'bat_rookie')).toEqual({ status: 'disabled', rows: [] });
    await expect(svc.flush()).resolves.toBeUndefined();
  });

  it('a network failure in the middle keeps the rest of the queue in order', async () => {
    const { svc, board, queue } = service();
    board.down = true;
    await svc.submitBest(sub(1, 'bat_rookie', okTime(1)));
    await svc.submitBest(sub(2, 'bat_rookie', okTime(2)));
    expect(queue()).toHaveLength(2);
    board.down = false;
    const original = board.submit.bind(board);
    let n = 0;
    board.submit = async (e) => {
      if (++n === 2) throw new Error('dropped');
      return original(e);
    };
    await svc.flush();
    expect(board.sent).toHaveLength(1);
    expect(queue()).toHaveLength(1);
  });

  it('a faster time queued while a flush runs is not lost', async () => {
    const { svc, board, queue } = service();
    board.down = true;
    await svc.submitBest(sub(1, 'bat_rookie', okTime(1)));
    board.down = false;
    const faster = okTime(1) - 0.5;
    const original = board.submit.bind(board);
    board.submit = async (e) => {
      // a new best is queued for the same board while this send is in flight
      if (e.timeSec === okTime(1) && !board.sent.length) await svc.submitBest(sub(1, 'bat_rookie', faster));
      return original(e);
    };
    await svc.flush();
    await svc.flush();
    const times = board.sent.map((s) => s.timeSec);
    expect(times).toContain(faster);
    expect(queue()).toEqual([]);
  });

  it('only one flush runs at a time', async () => {
    const { svc, board } = service();
    board.down = true;
    await svc.submitBest(sub(1, 'bat_rookie', okTime(1)));
    board.down = false;
    await Promise.all([svc.flush(), svc.flush(), svc.flush()]);
    expect(board.sent).toHaveLength(1);
  });

  it('top: returns rows, caches briefly, and falls back to the cache when offline', async () => {
    const { svc, board, advance } = service();
    board.rows = [{ rank: 1, name: 'Bat-AAAA', timeSec: 10, isYou: false }];
    expect((await svc.top(1, 'bat_rookie')).rows).toHaveLength(1);
    await svc.top(1, 'bat_rookie');
    expect(board.topCalls).toBe(1); // cached
    advance(31_000);
    board.down = true;
    const stale = await svc.top(1, 'bat_rookie');
    expect(stale.status).toBe('ok'); // an old list beats an error
    expect(stale.rows).toHaveLength(1);
    expect((await svc.top(2, 'bat_rookie')).status).toBe('offline'); // nothing cached for another board
  });

  it('a board is cleared from the cache once your new time is sent', async () => {
    const { svc, board } = service();
    board.rows = [{ rank: 1, name: 'x', timeSec: 10, isYou: false }];
    await svc.top(1, 'bat_rookie');
    await svc.submitBest(sub(1, 'bat_rookie', okTime(1)));
    await svc.top(1, 'bat_rookie');
    expect(board.topCalls).toBe(2);
  });
});

/* ------------------------------------------------------------------ http adapter */
describe('HttpLeaderboardProvider', () => {
  const res = (status: number, body?: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;
  const make = (queue: Response[], seen: { url: string; init: RequestInit }[] = []) =>
    new HttpLeaderboardProvider('https://api.example/', async () => 'T', 1000, (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return queue.shift()!;
    }) as unknown as typeof fetch);

  it('posts a score with the bearer token', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const p = make([res(200, {})], seen);
    expect(await p.submit({ ...sub(1, 'bat_rookie', 12), name: 'Bat-1' })).toBe(true);
    expect(seen[0].url).toBe('https://api.example/scores');
    expect(JSON.parse(seen[0].init.body as string)).toEqual({ levelId: 1, character: 'bat_rookie', timeSec: 12, name: 'Bat-1' });
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe('Bearer T');
  });

  it('400/422 mean refused for good; 5xx is retried later', async () => {
    expect(await make([res(400)]).submit({ ...sub(1, 'bat_rookie', 12), name: 'n' })).toBe(false);
    expect(await make([res(422)]).submit({ ...sub(1, 'bat_rookie', 12), name: 'n' })).toBe(false);
    await expect(make([res(503)]).submit({ ...sub(1, 'bat_rookie', 12), name: 'n' })).rejects.toThrow(/HTTP 503/);
  });

  it('reads the top list and drops malformed rows', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const p = make([res(200, { rows: [{ rank: 1, name: 'A', timeSec: 9.5, isYou: true }, { name: 'bad', timeSec: 'x' }, null, { rank: 3, name: 'C'.repeat(40), timeSec: 12 }] })], seen);
    const rows = await p.top(7, 'bat_turbo', 10);
    expect(rows).toEqual([
      { rank: 1, name: 'A', timeSec: 9.5, isYou: true },
      { rank: 3, name: 'C'.repeat(24), timeSec: 12, isYou: false },
    ]);
    expect(seen[0].url).toBe('https://api.example/scores?levelId=7&character=bat_turbo&limit=10');
  });

  it('respects the requested count and rejects a bad response', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, name: 'n', timeSec: 10 + i }));
    expect(await make([res(200, { rows })]).top(1, 'bat_rookie', 5)).toHaveLength(5);
    await expect(make([res(200, { rows: 'x' })]).top(1, 'bat_rookie', 5)).rejects.toThrow(/bad response/);
    await expect(make([res(500)]).top(1, 'bat_rookie', 5)).rejects.toThrow(/HTTP 500/);
  });
});

/* ------------------------------------------------------------------ wiring */
describe('clear time -> leaderboard', () => {
  it('flags a personal best per bat, separately for each bat', () => {
    const base = { stars: 3 as const, momentum: 1, bestMomentum: 1 };
    let out = applyVictory({}, 0, 1, { ...base, timeSec: 20, characterId: 'bat_rookie' });
    expect(out.result.newCharacterBest).toBe(true);
    out = applyVictory(out.records, out.shards, 1, { ...base, timeSec: 25, characterId: 'bat_rookie' }, out.claimedMilestones);
    expect(out.result.newCharacterBest).toBe(false);
    out = applyVictory(out.records, out.shards, 1, { ...base, timeSec: 25, characterId: 'bat_turbo' }, out.claimedMilestones);
    expect(out.result.newCharacterBest).toBe(true); // slower than the Rookie, but the first time with Turbo Moth
    out = applyVictory(out.records, out.shards, 1, { ...base, timeSec: 18, characterId: 'bat_rookie' }, out.claimedMilestones);
    expect(out.result.newCharacterBest).toBe(true);
    // a tie is not an improvement
    out = applyVictory(out.records, out.shards, 1, { ...base, timeSec: 18, characterId: 'bat_rookie' }, out.claimedMilestones);
    expect(out.result.newCharacterBest).toBe(false);
  });

  it('the game screen submits only real personal bests, and never for the debug chamber', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'GameScreen.tsx'), 'utf8');
    expect(src).toMatch(/def\.id !== 0 && res\.newCharacterBest/);
    expect(src).toMatch(/leaderboards\.submitBest\(/);
  });
});
