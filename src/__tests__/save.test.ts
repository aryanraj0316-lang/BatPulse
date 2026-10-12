import { MemoryStorage } from '../save/storage';
import { SAVE_KEYS, SaveManager, checksum, decodeEnvelope, encodeEnvelope } from '../save/SaveManager';
import { SAVE_VERSION, defaultSave, migrateSave } from '../save/schema';

const fresh = async (storage = new MemoryStorage()) => {
  const m = new SaveManager(storage);
  const r = await m.load();
  return { m, storage, r };
};

describe('save: basics', () => {
  it('fresh install loads a clean default', async () => {
    const { m, r } = await fresh();
    expect(r.source).toBe('default');
    expect(r.recovered).toBe(false);
    expect(m.data).toEqual(defaultSave());
  });

  it('round-trips data through storage', async () => {
    const { m, storage } = await fresh();
    m.mutate((d) => {
      d.shards = 321;
      d.selectedCharacter = 'bat_rookie';
      d.records[3] = { levelId: 3, unlocked: true, completed: true, stars: 2, bestTime: 12.5, bestMomentum: 1.3, ghostRun: false };
    });
    await m.flush();
    const m2 = new SaveManager(storage);
    const r = await m2.load();
    expect(r.source).toBe('primary');
    expect(m2.data.shards).toBe(321);
    expect(m2.data.records[3].stars).toBe(2);
    expect(m2.data.records[3].bestTime).toBe(12.5);
  });

  it('mutate before load is ignored, not fatal', () => {
    const m = new SaveManager(new MemoryStorage());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    m.mutate((d) => (d.shards = 9));
    expect(m.data.shards).toBe(0);
    warn.mockRestore();
  });

  it('many rapid mutations all land in order (no lost shards)', async () => {
    const { m, storage } = await fresh();
    for (let i = 1; i <= 100; i++) m.mutate((d) => (d.shards += 1));
    await m.flush();
    const m2 = new SaveManager(storage);
    await m2.load();
    expect(m2.data.shards).toBe(100);
  });
});

describe('save: corruption recovery', () => {
  const populate = async () => {
    const { m, storage } = await fresh();
    m.mutate((d) => (d.shards = 100));
    m.mutate((d) => (d.shards = 250));
    await m.flush();
    return storage;
  };

  it('truncated primary falls back to the backup', async () => {
    const storage = await populate();
    const good = storage.map.get(SAVE_KEYS.primary)!;
    storage.map.set(SAVE_KEYS.primary, good.slice(0, good.length / 2));
    const m = new SaveManager(storage);
    const r = await m.load();
    expect(r.source).toBe('backup');
    expect(r.recovered).toBe(true);
    expect(m.data.shards).toBe(250); // the backup is an identical copy: nothing is lost
    expect(storage.map.get(SAVE_KEYS.corrupt)).toBe(good.slice(0, good.length / 2)); // damaged blob kept for forensics
    // primary healed
    expect(decodeEnvelope(storage.map.get(SAVE_KEYS.primary)!)).not.toBeNull();
  });

  it('flipped byte (checksum mismatch) is detected', async () => {
    const storage = await populate();
    const env = JSON.parse(storage.map.get(SAVE_KEYS.primary)!);
    env.body = env.body.replace('"shards":250', '"shards":999');
    storage.map.set(SAVE_KEYS.primary, JSON.stringify(env));
    const r = await new SaveManager(storage).load();
    expect(r.source).toBe('backup');
  });

  it('garbage in both files yields a clean default and keeps the corrupt blob', async () => {
    const storage = await populate();
    storage.map.set(SAVE_KEYS.primary, '{{{not json');
    storage.map.set(SAVE_KEYS.backup, 'also bad');
    const m = new SaveManager(storage);
    const r = await m.load();
    expect(r.source).toBe('default');
    expect(r.recovered).toBe(true);
    expect(m.data).toEqual(defaultSave());
    expect(storage.map.get(SAVE_KEYS.corrupt)).toBe('{{{not json');
  });

  it('both files always hold the same, latest save', async () => {
    const storage = await populate();
    expect(storage.map.get(SAVE_KEYS.backup)).toBe(storage.map.get(SAVE_KEYS.primary));
    const m = new SaveManager(storage);
    await m.load();
    m.mutate((d) => (d.shards += 5));
    await m.flush();
    expect(storage.map.get(SAVE_KEYS.backup)).toBe(storage.map.get(SAVE_KEYS.primary));
    expect(decodeEnvelope(storage.map.get(SAVE_KEYS.backup)!)!.data.shards).toBe(255);
  });
  it('a corrupt backup alone is repaired from the primary on the next save', async () => {
    const storage = await populate();
    storage.map.set(SAVE_KEYS.backup, 'junk');
    const m = new SaveManager(storage);
    const r = await m.load();
    expect(r.source).toBe('primary');
    m.mutate((d) => (d.shards += 1));
    await m.flush();
    expect(decodeEnvelope(storage.map.get(SAVE_KEYS.backup)!)!.data.shards).toBe(251);
  });

  it('storage that throws never crashes load', async () => {
    const bad = {
      getItem: async () => {
        throw new Error('disk gone');
      },
      setItem: async () => {
        throw new Error('disk gone');
      },
      removeItem: async () => {},
    };
    const m = new SaveManager(bad);
    const r = await m.load();
    expect(r.data).toEqual(defaultSave());
    m.mutate((d) => (d.shards = 5));
    await expect(m.flush()).resolves.toBeUndefined();
    expect(m.data.shards).toBe(5); // still usable in memory
  });

  it('a failed write is retried by the next write (nothing lost permanently)', async () => {
    const storage = new MemoryStorage();
    const m = new SaveManager(storage);
    await m.load();
    const realSet = storage.setItem.bind(storage);
    let fail = true;
    storage.setItem = async (k, v) => {
      if (fail) throw new Error('transient');
      return realSet(k, v);
    };
    m.mutate((d) => (d.shards = 10));
    await m.flush();
    fail = false;
    m.mutate((d) => (d.shards += 5));
    await m.flush();
    const m2 = new SaveManager(storage);
    await m2.load();
    expect(m2.data.shards).toBe(15);
  });

  it('refuses to overwrite a save written by a newer app version', async () => {
    const storage = new MemoryStorage();
    const future = { ...defaultSave(), saveVersion: SAVE_VERSION + 1, shards: 77 };
    const blob = encodeEnvelope(future);
    storage.map.set(SAVE_KEYS.primary, blob);
    const m = new SaveManager(storage);
    await m.load();
    m.mutate((d) => (d.shards = 1));
    await m.flush();
    expect(storage.map.get(SAVE_KEYS.primary)).toBe(blob);
  });
});

describe('save: migration', () => {
  it('migrates the legacy unversioned progress + settings keys', async () => {
    const storage = new MemoryStorage();
    storage.map.set(
      SAVE_KEYS.legacyProgress,
      JSON.stringify({
        shards: 480,
        records: { 1: { levelId: 1, unlocked: true, completed: true, stars: 3, bestTime: 9, bestSonarUsed: 2, ghostRun: true, perfectEcho: false } },
        unlockedAbilities: ['WIDE_PULSE'],
        endlessHighScore: 12,
      }),
    );
    storage.map.set(SAVE_KEYS.legacySettings, JSON.stringify({ soundEnabled: false, hapticsEnabled: true }));
    const m = new SaveManager(storage);
    const r = await m.load();
    expect(r.source).toBe('legacy');
    expect(m.data.shards).toBe(480);
    expect(m.data.records[1].stars).toBe(3);
    // the retired ability/endless fields are dropped; shards and level progress survive
    expect((m.data as any).unlockedAbilities).toBeUndefined();
    expect(m.data.settings.sfxVolume).toBe(0); // legacy sound-off switch becomes zero volume
    expect(m.data.settings.musicVolume).toBe(0);
    expect(m.data.saveVersion).toBe(SAVE_VERSION);
    expect(m.data.unlockedCharacters).toContain('bat_rookie');
    // persisted in the new format
    expect(decodeEnvelope(storage.map.get(SAVE_KEYS.primary)!)).not.toBeNull();
  });

  it('migrateSave sanitises bad fields but keeps good ones', () => {
    const out = migrateSave({
      shards: -5,
      records: { 2: { stars: 99, bestTime: 'x', completed: true }, abc: {}, 4: 'nope' },
      selectedCharacter: 'bat_turbo', // not unlocked -> falls back
      unlockedCharacters: ['bat_vesper'],
      hasSeenHeadphonePrompt: true,
    });
    expect(out.shards).toBe(0);
    expect(out.records[2].stars).toBe(3);
    expect(out.records[2].bestTime).toBeNull();
    expect(out.records[2].completed).toBe(true);
    expect(out.records[4]).toBeUndefined();
    expect(out.unlockedCharacters).toEqual(['bat_rookie', 'bat_vesper']);
    expect(out.selectedCharacter).toBe('bat_rookie');
    expect(out.hasSeenHeadphonePrompt).toBe(true);
  });

  it('clamps volume and brightness settings', () => {
    const out = migrateSave({ settings: { sfxVolume: 5, musicVolume: -1, brightness: 9 } });
    expect(out.settings.sfxVolume).toBe(1);
    expect(out.settings.musicVolume).toBe(0);
    expect(out.settings.brightness).toBe(1.5);
    expect(migrateSave({ settings: { brightness: 'x' } }).settings.brightness).toBe(1);
  });

  it('migrateSave of non-objects gives defaults', () => {
    for (const v of [null, undefined, 5, 'x', []]) expect(migrateSave(v)).toEqual(defaultSave());
  });

  it('checksum is stable and sensitive', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});
