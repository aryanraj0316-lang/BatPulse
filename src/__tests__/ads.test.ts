import * as fs from 'fs';
import * as path from 'path';
import { ECHO_CONFIG } from '../constants/gameConfig';
import { AdController, AdOutcome, AdProvider, AdUsage, noAdProvider } from '../ads/AdController';
import { mergeSaves } from '../cloud/merge';
import { defaultSave, migrateSave } from '../save/schema';
import { MemoryStorage } from '../save/storage';
import { SaveManager } from '../save/SaveManager';

const DAY = 86_400_000;

function rig(opts: { enabled?: boolean; ready?: boolean; outcome?: AdOutcome | 'throw'; maxPerDay?: number; reward?: number } = {}) {
  const state = { ready: opts.ready ?? true, outcome: opts.outcome ?? 'rewarded', shows: 0 };
  const provider: AdProvider = {
    isReady: () => state.ready,
    show: async () => {
      state.shows++;
      if (state.outcome === 'throw') throw new Error('sdk crashed');
      return state.outcome;
    },
  };
  let usage: AdUsage = { day: null, count: 0 };
  let now = 20_000 * DAY + 5000;
  const granted: { amount: number; source: string }[] = [];
  const ctl = new AdController({
    provider,
    getUsage: () => usage,
    setUsage: (u) => (usage = u),
    grant: (amount, source) => granted.push({ amount, source }),
    now: () => now,
    config: { enabled: opts.enabled ?? true, rewardShards: opts.reward ?? 50, maxPerDay: opts.maxPerDay ?? 3 },
  });
  return { ctl, state, granted, usage: () => usage, nextDay: () => (now += DAY) };
}

describe('rewarded ads (behind a flag)', () => {
  it('ships OFF: the flag is false and the default provider is never ready', () => {
    expect(ECHO_CONFIG.online.ads.enabled).toBe(false);
    expect(noAdProvider.isReady()).toBe(false);
  });

  it('with the flag off there is no offer and watching does nothing, even when an ad is ready', async () => {
    const r = rig({ enabled: false, ready: true });
    expect(r.ctl.offer()).toEqual({ available: false, reason: 'disabled' });
    expect(await r.ctl.watch()).toBe('unavailable');
    expect(r.state.shows).toBe(0);
    expect(r.granted).toEqual([]);
  });

  it('offers the configured reward when enabled and an ad is ready', () => {
    expect(rig({ reward: 75 }).ctl.offer()).toEqual({ available: true, reward: 75 });
  });

  it('no offer while the ad is not loaded', async () => {
    const r = rig({ ready: false });
    expect(r.ctl.offer()).toEqual({ available: false, reason: 'not_ready' });
    expect(await r.ctl.watch()).toBe('unavailable');
  });

  it('pays the reward only when the ad was completed', async () => {
    const r = rig({ outcome: 'rewarded' });
    expect(await r.ctl.watch()).toBe('rewarded');
    expect(r.granted).toEqual([{ amount: 50, source: 'rewarded_ad' }]);
    expect(r.usage()).toEqual({ day: 20_000, count: 1 });
  });

  it('pays nothing and counts nothing when the ad is dismissed, fails or the SDK throws', async () => {
    for (const outcome of ['dismissed', 'failed', 'throw'] as const) {
      const r = rig({ outcome });
      const res = await r.ctl.watch();
      expect(res).toBe(outcome === 'throw' ? 'failed' : outcome);
      expect(r.granted).toEqual([]);
      expect(r.usage()).toEqual({ day: null, count: 0 });
    }
  });

  it('one ad per result screen', async () => {
    const r = rig();
    expect(r.ctl.offer(true)).toEqual({ available: false, reason: 'already_used' });
    expect(await r.ctl.watch(true)).toBe('unavailable');
    expect(r.state.shows).toBe(0);
  });

  it('a soft daily cap, which resets the next day', async () => {
    const r = rig({ maxPerDay: 2 });
    await r.ctl.watch();
    await r.ctl.watch();
    expect(r.ctl.offer()).toEqual({ available: false, reason: 'daily_limit' });
    expect(await r.ctl.watch()).toBe('unavailable');
    expect(r.granted).toHaveLength(2);
    r.nextDay();
    expect(r.ctl.offer().available).toBe(true);
    await r.ctl.watch();
    expect(r.usage()).toEqual({ day: 20_001, count: 1 });
  });

  it('two taps at once show one ad and pay once', async () => {
    const r = rig();
    const [a, b] = await Promise.all([r.ctl.watch(), r.ctl.watch()]);
    expect([a, b].sort()).toEqual(['rewarded', 'unavailable']);
    expect(r.state.shows).toBe(1);
    expect(r.granted).toHaveLength(1);
  });

  it('a failed ad can be tried again (the player is not locked out)', async () => {
    const r = rig({ outcome: 'failed' });
    await r.ctl.watch();
    r.state.outcome = 'rewarded';
    expect(await r.ctl.watch()).toBe('rewarded');
    expect(r.granted).toHaveLength(1);
  });
});

describe('ad usage in the save', () => {
  it('defaults to none, survives a round trip, and junk is cleaned', () => {
    expect(defaultSave().ads).toEqual({ day: null, count: 0 });
    const s = JSON.parse(JSON.stringify(defaultSave()));
    s.ads = { day: 20_001.7, count: 2 };
    expect(migrateSave(s).ads).toEqual({ day: 20_001, count: 2 });
    s.ads = { day: 'x', count: -4 };
    expect(migrateSave(s).ads).toEqual({ day: null, count: 0 });
    s.ads = 'nope';
    expect(migrateSave(s).ads).toEqual({ day: null, count: 0 });
  });

  it('is stored by the save manager', async () => {
    const storage = new MemoryStorage();
    const m = new SaveManager(storage, () => 'd1');
    await m.load();
    m.mutate((d) => (d.ads = { day: 20_000, count: 3 }));
    await m.flush();
    const m2 = new SaveManager(storage);
    await m2.load();
    expect(m2.data.ads).toEqual({ day: 20_000, count: 3 });
  });

  it('cloud merge: the cap is per day, not per device', () => {
    const a = { ...defaultSave(), ads: { day: 20_000, count: 2 } };
    const b = { ...defaultSave(), ads: { day: 20_000, count: 4 } };
    const later = { ...defaultSave(), ads: { day: 20_001, count: 1 } };
    expect(mergeSaves(a, b).ads).toEqual({ day: 20_000, count: 4 });
    expect(mergeSaves(a, later).ads).toEqual({ day: 20_001, count: 1 });
    expect(mergeSaves(later, a).ads).toEqual({ day: 20_001, count: 1 });
    expect(mergeSaves(defaultSave(), a).ads).toEqual({ day: 20_000, count: 2 });
  });
});

describe('ad UI wiring', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('the result card only shows the button for an offer, and the way forward never depends on it', () => {
    const src = read('components', 'ResultCard.tsx');
    expect(src).toMatch(/adOffer && !adGranted/);
    // Next / Retry / Home are outside the ad block and never disabled by ad state
    expect(src).not.toMatch(/btn-next[^>]*disabled/);
    expect(src).not.toMatch(/btn-home[^>]*disabled/);
  });

  it('the game screen asks the controller (not the provider) and resets per result', () => {
    const src = read('screens', 'GameScreen.tsx');
    expect(src).toMatch(/ads\.offer\(adGranted !== null\)/);
    expect(src).toMatch(/ads\.watch\(adGranted !== null\)/);
    expect(src).toMatch(/setAdGranted\(null\)/);
  });

  it('no ad SDK is bundled while the feature is off', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
    expect(deps).not.toMatch(/admob|ads|applovin|unity-ads|ironsource|appodeal/i);
  });
});
