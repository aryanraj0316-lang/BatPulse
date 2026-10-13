import { CHARACTER_IDS } from '../game/characters';
import { CloudProvider, HttpCloudProvider, RemoteSave, syncSave } from '../cloud/CloudSave';
import { CloudSync, syncStatusText } from '../cloud/CloudSync';
import { mergeRecord, mergeSaves } from '../cloud/merge';
import { assignDevice, balanceOf, credit, ledgerFromBalance, mergeLedgers, normalizeLedger, spentOn, totalEarned } from '../save/ledger';
import { SAVE_KEYS, SaveManager, checksum, decodeEnvelope, encodeEnvelope } from '../save/SaveManager';
import { SAVE_VERSION, SaveData, defaultSave, migrateSave } from '../save/schema';
import { MemoryStorage } from '../save/storage';
import { LevelRecord } from '../types/game';
import { purchaseCharacter } from '../state/economy';

const rec = (id: number, p: Partial<LevelRecord> = {}): LevelRecord => ({ levelId: id, unlocked: true, completed: false, stars: 0, bestTime: null, bestMomentum: null, ghostRun: false, ...p });

/** A save as one device would hold it. */
function device(id: string, over: Partial<SaveData> = {}): SaveData {
  const d = defaultSave();
  d.ledger = { deviceId: id, earned: {} };
  return { ...d, ...over };
}
const earn = (d: SaveData, n: number): SaveData => {
  const ledger = credit(d.ledger, n);
  return { ...d, ledger, shards: balanceOf(ledger, d.unlockedCharacters) };
};
const buy = (d: SaveData, bat: string): SaveData => {
  const r = purchaseCharacter(d.shards, d.unlockedCharacters, bat);
  if (!r.ok) throw new Error(`cannot buy ${bat}: ${r.reason}`);
  return { ...d, unlockedCharacters: r.unlocked, shards: balanceOf(d.ledger, r.unlocked) };
};
/** Equality ignoring which device wrote the save. */
const content = (d: SaveData) => JSON.stringify({ ...d, ledger: { earned: d.ledger.earned } });

/* ------------------------------------------------------------------ ledger */
describe('shard ledger', () => {
  it('balance = earned on all devices - price of owned bats, never negative', () => {
    let l = { deviceId: 'a', earned: {} as Record<string, number> };
    l = credit(l, 1000);
    expect(balanceOf(l, ['bat_rookie'])).toBe(1000);
    expect(balanceOf(l, ['bat_rookie', 'bat_vesper'])).toBe(0); // 1000 - 1500 floors at 0
    l = credit(credit(l, 700), 100);
    expect(balanceOf(l, ['bat_rookie', 'bat_vesper'])).toBe(300);
  });
  it('ignores zero, negative and broken credits', () => {
    const l = { deviceId: 'a', earned: { a: 5 } };
    for (const bad of [0, -3, NaN, Infinity]) expect(credit(l, bad)).toBe(l);
    expect(credit(l, 2.9).earned.a).toBe(7);
  });
  it('merging takes each device maximum, so nothing is lost or counted twice', () => {
    const a = { deviceId: 'a', earned: { a: 100, b: 20 } };
    const b = { deviceId: 'b', earned: { a: 80, b: 50 } };
    expect(mergeLedgers(a, b).earned).toEqual({ a: 100, b: 50 });
    expect(mergeLedgers(a, a).earned).toEqual(a.earned);
    expect(totalEarned(mergeLedgers(a, b))).toBe(150);
  });
  it('an old balance-only save becomes a ledger that reproduces the same balance', () => {
    const l = ledgerFromBalance(480, ['bat_rookie', 'bat_vesper']);
    expect(balanceOf(l, ['bat_rookie', 'bat_vesper'])).toBe(480);
    expect(ledgerFromBalance(0, ['bat_rookie']).earned).toEqual({});
    expect(ledgerFromBalance(NaN, ['bat_rookie']).earned).toEqual({});
  });
  it('a new install takes the pending balance under its own device id', () => {
    const l = assignDevice(ledgerFromBalance(300, ['bat_rookie']), () => 'dX');
    expect(l).toEqual({ deviceId: 'dX', earned: { dX: 300 } });
    expect(assignDevice(l, () => 'other')).toBe(l); // already has one
    expect(assignDevice({ deviceId: '', earned: {} }, () => 'dY')).toEqual({ deviceId: 'dY', earned: {} });
  });
  it('normalises junk', () => {
    expect(normalizeLedger(null)).toBeNull();
    expect(normalizeLedger([])).toBeNull();
    expect(normalizeLedger({ deviceId: 5, earned: { a: -1, b: 'x', c: 7.9 } })).toEqual({ deviceId: '', earned: { c: 7 } });
    expect(spentOn(['bat_rookie', 'nope', 'bat_turbo'])).toBe(10000);
  });
});

describe('save v3 and migration', () => {
  it('an old v2 save keeps its balance, gets a ledger and a device id on load', async () => {
    const storage = new MemoryStorage();
    const v2 = { saveVersion: 2, shards: 480, selectedCharacter: 'bat_rookie', unlockedCharacters: ['bat_rookie', 'bat_vesper'], records: { 1: rec(1, { completed: true, stars: 2 }) }, settings: {}, daily: { lastClaimDay: null, streak: 0 } };
    const body = JSON.stringify(v2);
    storage.map.set(SAVE_KEYS.primary, JSON.stringify({ saveVersion: 2, checksum: checksum(body), body }));
    const m = new SaveManager(storage, () => 'dTEST', () => 777);
    await m.load();
    expect(m.data.shards).toBe(480);
    expect(m.data.ledger.deviceId).toBe('dTEST');
    expect(balanceOf(m.data.ledger, m.data.unlockedCharacters)).toBe(480);
    expect(m.data.records[1].stars).toBe(2);
    // and it was written back as v3
    const stored = decodeEnvelope(storage.map.get(SAVE_KEYS.primary)!)!;
    expect(stored.version).toBe(SAVE_VERSION);
    expect(stored.data.ledger.deviceId).toBe('dTEST');
  });
  it('a fresh install gets an id once and keeps it across restarts', async () => {
    const storage = new MemoryStorage();
    const a = new SaveManager(storage, () => 'first');
    await a.load();
    expect(a.data.ledger.deviceId).toBe('first');
    const b = new SaveManager(storage, () => 'second');
    await b.load();
    expect(b.data.ledger.deviceId).toBe('first');
  });
  it('mutate stamps updatedAt', async () => {
    const m = new SaveManager(new MemoryStorage(), () => 'd1', () => 4242);
    await m.load();
    m.mutate((d) => (d.hasSeenHeadphonePrompt = true));
    expect(m.data.updatedAt).toBe(4242);
  });
  it('the shard balance cannot be edited directly: it follows the ledger', () => {
    const s = defaultSave();
    s.ledger = { deviceId: 'a', earned: { a: 100 } };
    s.shards = 999999;
    expect(migrateSave(s).shards).toBe(100);
  });
  it('adopt keeps this install id', async () => {
    const m = new SaveManager(new MemoryStorage(), () => 'mine');
    await m.load();
    const merged = mergeSaves(m.data, device('other', { ledger: { deviceId: 'other', earned: { other: 50 } } }));
    m.adopt({ ...merged, ledger: { ...merged.ledger, deviceId: 'other' } });
    expect(m.data.ledger.deviceId).toBe('mine');
    expect(m.data.shards).toBe(50);
  });
});

/* ------------------------------------------------------------------ merge */
describe('mergeSaves', () => {
  it('merging a save with itself changes nothing', () => {
    let a = device('a');
    a = earn(a, 300);
    a.records = { 1: rec(1, { completed: true, stars: 3, bestTime: 9 }) };
    expect(content(mergeSaves(a, a))).toBe(content(a));
  });

  it('is symmetric: either device ends up with the same progress', () => {
    let a = earn(device('a'), 120);
    let b = earn(device('b'), 80);
    a.records = { 1: rec(1, { completed: true, stars: 2, bestTime: 20 }), 2: rec(2) };
    b.records = { 1: rec(1, { completed: true, stars: 3, bestTime: 25 }), 3: rec(3, { completed: true, stars: 1 }) };
    a = { ...a, updatedAt: 100 };
    b = { ...b, updatedAt: 200 };
    expect(content(mergeSaves(a, b))).toBe(content(mergeSaves(b, a)));
    expect(JSON.stringify(mergeSaves(a, b).ledger.earned)).toBe(JSON.stringify(mergeSaves(b, a).ledger.earned));
  });

  it('keeps the best of both for every level', () => {
    const a = rec(5, { completed: true, stars: 2, bestTime: 30, bestMomentum: 1.2, ghostRun: false, bestTimes: { bat_rookie: 30, bat_turbo: 28 } });
    const b = rec(5, { completed: true, stars: 3, bestTime: 25, bestMomentum: 1.9, ghostRun: true, bestTimes: { bat_rookie: 26 } });
    expect(mergeRecord(a, b)).toEqual({ levelId: 5, unlocked: true, completed: true, stars: 3, bestTime: 25, bestMomentum: 1.9, ghostRun: true, bestTimes: { bat_rookie: 26, bat_turbo: 28 } });
    expect(mergeRecord(rec(5, { bestTime: null }), rec(5, { bestTime: 12 })).bestTime).toBe(12);
    expect(mergeRecord(undefined, b)).toBe(b);
    expect(mergeRecord(a, undefined)).toBe(a);
  });

  it('progress only grows: levels, stars and milestones from either device survive', () => {
    const a = device('a');
    a.records = { 1: rec(1, { completed: true, stars: 1 }) };
    a.claimedMilestones = ['1:25'];
    const b = device('b');
    b.records = { 1: rec(1), 2: rec(2, { completed: true, stars: 3 }) };
    b.claimedMilestones = ['1:25', '2:25'];
    const m = mergeSaves(a, b);
    expect(m.records[1]).toMatchObject({ completed: true, stars: 1 });
    expect(m.records[2]).toMatchObject({ completed: true, stars: 3 });
    expect(m.claimedMilestones).toEqual(['1:25', '2:25']);
  });

  it('SPENDING CANNOT BE UNDONE: a bat bought on one device is not free on the other', () => {
    // both devices start from the same cloud save with 1,500 shards
    const base = earn(device('a'), 1500);
    const phone = { ...base };
    const tablet = { ...base, ledger: { deviceId: 'b', earned: { ...base.ledger.earned } } };
    const phoneBought = buy(phone, 'bat_vesper');
    expect(phoneBought.shards).toBe(0);
    const merged = mergeSaves(phoneBought, tablet); // tablet still thinks it has 1,500
    expect(merged.unlockedCharacters).toContain('bat_vesper');
    expect(merged.shards).toBe(0);
    expect(mergeSaves(tablet, phoneBought).shards).toBe(0);
  });

  it('two bats bought offline on two devices are both kept and paid for', () => {
    let a = earn(device('a'), 5000);
    const b = { ...a, ledger: { deviceId: 'b', earned: { ...a.ledger.earned } } };
    a = buy(a, 'bat_vesper'); // 1500
    const b2 = buy(b, 'bat_sonarbot'); // 3500
    const m = mergeSaves(a, b2);
    expect(m.unlockedCharacters).toEqual(['bat_rookie', 'bat_vesper', 'bat_sonarbot']);
    expect(m.shards).toBe(0); // 5000 earned - 5000 spent: never negative, never a free bat
  });

  it('earnings on two devices add up (no loss, no double count)', () => {
    const a = earn(device('a'), 100);
    const b = earn(device('b'), 70);
    const m = mergeSaves(a, b);
    expect(m.shards).toBe(170);
    expect(mergeSaves(m, b).shards).toBe(170); // syncing again adds nothing
    expect(mergeSaves(m, a).shards).toBe(170);
  });

  it('a device that earned more after an earlier sync keeps the difference', () => {
    const shared = earn(device('a'), 100);
    const aLater = earn(shared, 40);
    const b = { ...shared, ledger: { deviceId: 'b', earned: { ...shared.ledger.earned } } };
    expect(mergeSaves(b, aLater).shards).toBe(140);
  });

  it('settings and the equipped bat come from the newer save; an unowned bat is never equipped', () => {
    const a = { ...device('a'), updatedAt: 100, unlockedCharacters: ['bat_rookie', 'bat_vesper'], selectedCharacter: 'bat_vesper' };
    a.settings = { ...a.settings, sfxVolume: 0.1, graphics: 'low' };
    const b = { ...device('b'), updatedAt: 200 };
    b.settings = { ...b.settings, sfxVolume: 0.9 };
    const m = mergeSaves(a, b);
    expect(m.settings.sfxVolume).toBe(0.9);
    expect(m.selectedCharacter).toBe('bat_rookie'); // b is newer and equips the Rookie
    expect(mergeSaves(b, a).settings.sfxVolume).toBe(0.9);
    // newer save equips a bat only the older one... cannot happen after union, but stays safe
    const c = { ...device('c'), updatedAt: 300, selectedCharacter: 'bat_turbo' }; // not owned anywhere
    expect(mergeSaves(c, a).selectedCharacter).toBe('bat_vesper');
  });

  it('the daily reward cannot be claimed once per device', () => {
    const a = { ...device('a'), daily: { lastClaimDay: 20500, streak: 3 } };
    const b = { ...device('b'), daily: { lastClaimDay: 20499, streak: 2 } };
    expect(mergeSaves(a, b).daily).toEqual({ lastClaimDay: 20500, streak: 3 });
    expect(mergeSaves(b, a).daily).toEqual({ lastClaimDay: 20500, streak: 3 });
    const none = device('n');
    expect(mergeSaves(none, a).daily).toEqual(a.daily);
    expect(mergeSaves(a, none).daily).toEqual(a.daily);
    const same = { ...device('s'), daily: { lastClaimDay: 20500, streak: 5 } };
    expect(mergeSaves(a, same).daily).toEqual({ lastClaimDay: 20500, streak: 5 });
  });

  it('the roster order is kept and inputs are not modified', () => {
    const a = { ...device('a'), unlockedCharacters: ['bat_rookie', 'bat_turbo'] };
    const b = { ...device('b'), unlockedCharacters: ['bat_rookie', 'bat_vesper'] };
    const before = JSON.stringify([a, b]);
    const m = mergeSaves(a, b);
    expect(m.unlockedCharacters).toEqual(CHARACTER_IDS.filter((id) => ['bat_rookie', 'bat_vesper', 'bat_turbo'].includes(id)));
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

/* ------------------------------------------------------------------ sync with a fake server */
class FakeServer implements CloudProvider {
  blob: string | null = null;
  version = 0;
  down = false;
  /** Number of uploads to reject as conflicts, simulating another device writing at the same time. */
  racesToLose = 0;
  uploads = 0;
  async download(): Promise<RemoteSave | null> {
    if (this.down) throw new Error('network down');
    return this.blob === null ? null : { blob: this.blob, version: String(this.version) };
  }
  async upload(blob: string, expected: string | null): Promise<boolean> {
    if (this.down) throw new Error('network down');
    if (this.racesToLose > 0) {
      this.racesToLose--;
      this.version++;
      return false;
    }
    if ((expected ?? null) !== (this.blob === null ? null : String(this.version))) return false;
    this.blob = blob;
    this.version++;
    this.uploads++;
    return true;
  }
}

describe('syncSave', () => {
  it('without a backend it does nothing and says so', async () => {
    const local = earn(device('a'), 10);
    expect(await syncSave(local, null)).toEqual({ status: 'disabled', data: local });
  });

  it('the first sync uploads the local save', async () => {
    const server = new FakeServer();
    const local = earn(device('a'), 250);
    const r = await syncSave(local, server);
    expect(r.status).toBe('ok');
    expect(server.uploads).toBe(1);
    expect(decodeEnvelope(server.blob)!.data.shards).toBe(250);
  });

  it('a second device merges what the first uploaded', async () => {
    const server = new FakeServer();
    const phone = { ...earn(device('a'), 100), records: { 1: rec(1, { completed: true, stars: 3 }) } };
    await syncSave(phone, server);
    const tablet = earn(device('b'), 60);
    const r = await syncSave(tablet, server);
    expect(r.status).toBe('ok');
    expect(r.data.shards).toBe(160);
    expect(r.data.records[1].stars).toBe(3);
    // the cloud now holds both
    expect(decodeEnvelope(server.blob)!.data.shards).toBe(160);
    // and the phone picks the tablet's earnings up next time
    const back = await syncSave(phone, server);
    expect(back.data.shards).toBe(160);
  });

  it('syncing twice in a row uploads nothing the second time', async () => {
    const server = new FakeServer();
    const local = earn(device('a'), 100);
    const first = await syncSave(local, server);
    expect(first.status).toBe('ok');
    const second = await syncSave(first.data, server);
    expect(second.status).toBe('unchanged');
    expect(server.uploads).toBe(1);
  });

  it('offline: the local save is returned untouched', async () => {
    const server = new FakeServer();
    server.down = true;
    const local = earn(device('a'), 100);
    const r = await syncSave(local, server);
    expect(r).toEqual({ status: 'offline', data: local });
  });

  it('loses a race, downloads again, merges again and still succeeds', async () => {
    const server = new FakeServer();
    server.racesToLose = 2;
    const r = await syncSave(earn(device('a'), 100), server);
    expect(r.status).toBe('ok');
    expect(server.uploads).toBe(1);
  });

  it('gives up with "conflict" after repeated races, local save intact', async () => {
    const server = new FakeServer();
    server.racesToLose = 99;
    const local = earn(device('a'), 100);
    const r = await syncSave(local, server);
    expect(r).toEqual({ status: 'conflict', data: local });
  });

  it('a cloud save from a NEWER app version is never touched', async () => {
    const server = new FakeServer();
    const future = { ...earn(device('x'), 5), saveVersion: SAVE_VERSION + 1 };
    server.blob = encodeEnvelope(future);
    server.version = 3;
    const local = earn(device('a'), 100);
    const r = await syncSave(local, server);
    expect(r).toEqual({ status: 'newer-app', data: local });
    expect(server.uploads).toBe(0);
    expect(server.blob).toBe(encodeEnvelope(future));
  });

  it('an unreadable cloud copy is replaced by the local save', async () => {
    const server = new FakeServer();
    server.blob = '{"garbage":true';
    server.version = 1;
    const local = earn(device('a'), 100);
    const r = await syncSave(local, server);
    expect(r.status).toBe('ok');
    expect(decodeEnvelope(server.blob)!.data.shards).toBe(100);
  });

  it('a damaged checksum is treated as unreadable, not trusted', async () => {
    const server = new FakeServer();
    const env = JSON.parse(encodeEnvelope(earn(device('x'), 9999)));
    env.body = env.body.replace('9999', '1');
    server.blob = JSON.stringify(env);
    server.version = 1;
    const r = await syncSave(earn(device('a'), 100), server);
    expect(r.data.shards).toBe(100); // the tampered 9999 / 1 was not merged in
  });
});

/* ------------------------------------------------------------------ http adapter */
describe('HttpCloudProvider', () => {
  const res = (status: number, body?: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

  it('GET returns the blob, 404 means none yet, errors throw', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const queue = [res(200, { blob: 'B', version: 'v1' }), res(404), res(500)];
    const p = new HttpCloudProvider('https://api.example/', async () => 'TOKEN', 1000, (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return queue.shift()!;
    }) as unknown as typeof fetch);
    expect(await p.download()).toEqual({ blob: 'B', version: 'v1' });
    expect(await p.download()).toBeNull();
    await expect(p.download()).rejects.toThrow(/HTTP 500/);
    expect(calls[0].url).toBe('https://api.example/save'); // no double slash
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
  });

  it('rejects malformed responses', async () => {
    const p = new HttpCloudProvider('https://x', async () => null, 1000, (async () => res(200, { blob: 5 })) as unknown as typeof fetch);
    await expect(p.download()).rejects.toThrow(/bad response/);
  });

  it('PUT sends the expected version; 409 and 412 mean "someone else wrote first"', async () => {
    const seen: unknown[] = [];
    const queue = [res(200, {}), res(409), res(412), res(503)];
    const p = new HttpCloudProvider('https://x', async () => null, 1000, (async (_u: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string));
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
      return queue.shift()!;
    }) as unknown as typeof fetch);
    expect(await p.upload('B', 'v1')).toBe(true);
    expect(await p.upload('B', 'v1')).toBe(false);
    expect(await p.upload('B', null)).toBe(false);
    await expect(p.upload('B', null)).rejects.toThrow(/HTTP 503/);
    expect(seen[0]).toEqual({ blob: 'B', expectedVersion: 'v1' });
  });
});

/* ------------------------------------------------------------------ controller */
describe('CloudSync controller', () => {
  const setup = (provider: CloudProvider | null = new FakeServer()) => {
    let now = 1_000_000;
    let local = earn(device('a'), 100);
    const adopted: SaveData[] = [];
    const sync = new CloudSync({ provider, getLocal: () => local, adopt: (m) => { adopted.push(m); local = m; }, now: () => now, minIntervalSec: 60 });
    return { sync, adopted, advance: (ms: number) => (now += ms), setLocal: (d: SaveData) => (local = d), server: provider as FakeServer };
  };

  it('is off without a provider', async () => {
    const { sync } = setup(null);
    expect(sync.enabled).toBe(false);
    expect(await sync.request('manual')).toBe('disabled');
    expect(syncStatusText('idle', false)).toMatch(/not available/);
  });

  it('syncs at launch, adopts the merged save and reports the time', async () => {
    const { sync, adopted } = setup();
    expect(await sync.request('launch')).toBe('ok');
    expect(adopted).toHaveLength(1);
    expect(sync.lastSyncedAt).not.toBeNull();
  });

  it('throttles automatic syncs but never manual ones', async () => {
    const { sync, server, advance, setLocal } = setup();
    await sync.request('launch');
    const uploadsAfterLaunch = server.uploads;
    setLocal(earn(device('a'), 500));
    await sync.request('change'); // too soon: skipped
    expect(server.uploads).toBe(uploadsAfterLaunch);
    await sync.request('manual'); // always runs
    expect(server.uploads).toBe(uploadsAfterLaunch + 1);
    setLocal(earn(device('a'), 900));
    advance(61_000);
    await sync.request('change'); // interval passed
    expect(server.uploads).toBe(uploadsAfterLaunch + 2);
  });

  it('only one sync runs at a time', async () => {
    const { sync, server } = setup();
    const a = sync.request('manual');
    const b = sync.request('manual');
    expect(await a).toBe(await b);
    expect(server.uploads).toBe(1);
  });

  it('offline leaves the local save alone and the status explains it', async () => {
    const { sync, adopted, server } = setup();
    server.down = true;
    expect(await sync.request('manual')).toBe('offline');
    expect(adopted).toHaveLength(0);
    expect(sync.lastSyncedAt).toBeNull();
    expect(syncStatusText(sync.status, true)).toMatch(/safe on this device/);
  });

  it('notifies listeners (the settings screen) when the status changes', async () => {
    const { sync } = setup();
    const seen: string[] = [];
    const off = sync.subscribe(() => seen.push(sync.status));
    await sync.request('manual');
    off();
    await sync.request('manual');
    expect(seen).toEqual(['ok']);
  });

  it('every status has a message', () => {
    for (const s of ['idle', 'ok', 'unchanged', 'offline', 'newer-app', 'conflict', 'disabled'] as const) {
      expect(syncStatusText(s, true).length).toBeGreaterThan(5);
    }
  });
});
