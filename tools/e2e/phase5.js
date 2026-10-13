/**
 * Phase 5 end-to-end scenario: shop, characters/abilities, daily reward, chapter mastery.
 * Usage: node tools/e2e/phase5.js <outDir>   (dev server on :8081)
 * The time service is stubbed (fetch) so the run is deterministic; the reward logic and UI run for real.
 * Ability numbers are proven in src/__tests__/characters.test.ts.
 */
const path = require('path');
const { launch, sleep } = require('./harness');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', '.e2e-out');
const APP = process.env.APP_URL || 'http://localhost:8081/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const seed = () => {
  const records = {};
  for (let i = 1; i <= 50; i++) records[i] = { levelId: i, unlocked: i <= 6, completed: i <= 5, stars: i <= 5 ? 3 : 0, bestTime: i <= 5 ? 20 : null, bestMomentum: i <= 5 ? 1 : null, ghostRun: false };
  return {
    saveVersion: 2, shards: 1600, selectedCharacter: 'bat_rookie', unlockedCharacters: ['bat_rookie'], records,
    hasSeenHeadphonePrompt: true, claimedMilestones: [],
    settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true },
    daily: { lastClaimDay: null, streak: 0 },
  };
};

const text = (h, id) => h.eval(`(()=>{const e=document.querySelector('[data-testid="${id}"]');return e?e.innerText:null;})()`);
const shardsNow = async (h) => parseInt(((await text(h, 'shop-shards')) || '').replace(/[^0-9]/g, ''), 10);
const stubTime = (h, mode) =>
  h.eval(
    mode === 'offline'
      ? `window.fetch=async()=>{throw new Error('offline')};true`
      : `window.fetch=async()=>({ok:true,json:async()=>({unixtime:${NOW / 1000}})});true`,
  );
async function toHome(h) {
  await h.tapTestId('btn-pause');
  await sleep(250);
  await h.tapTestId('btn-pause-home');
  await sleep(700);
}

(async () => {
  const h = await launch({ outDir: OUT, fresh: true });
  try {
    await h.goto(APP);
    await h.seedSave(seed());
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(2500);

    // ---------------------------------------------------------------- daily reward (offline first, then online)
    await stubTime(h, 'offline');
    await toHome(h);
    await sleep(800);
    const offlineText = await text(h, 'daily-card');
    check('offline: the daily card asks to connect instead of trusting the phone clock', /Connect to the internet/.test(offlineText || ''), (offlineText || '').replace(/\n/g, ' | '));
    check('offline: nothing can be claimed', !(await h.exists('daily-claim')));

    await stubTime(h, 'online');
    await h.tapTestId('daily-retry');
    await sleep(900);
    check('online: day 1 is offered with its reward', /CLAIM DAY 1 · \+50/.test((await text(h, 'daily-card')) || ''), ((await text(h, 'daily-card')) || '').replace(/\n/g, ' | '));
    await h.tapTestId('daily-claim');
    await sleep(900);
    check('claiming pays +50 and shows it', /\+50/.test((await text(h, 'daily-claimed')) || ''));
    await h.shot('01_home_daily');

    await toGameAndBack(h);
    async function toGameAndBack(hh) {
      // a reload re-mounts the home screen: the same UTC day must not be claimable again
      await hh.goto('about:blank');
      await sleep(500);
      await hh.goto(APP);
      await sleep(2500);
      await stubTime(hh, 'online');
      await toHome(hh);
      await sleep(900);
    }
    const again = (await text(h, 'daily-card')) || '';
    check('after a restart the same day cannot be claimed again', /Next reward in/.test(again) && !(await h.exists('daily-claim')), again.replace(/\n/g, ' | '));

    // ---------------------------------------------------------------- shop
    await h.tapTestId('btn-shop');
    await sleep(700);
    check('shop shows the balance including the daily reward (1600 + 50)', (await shardsNow(h)) === 1650, String(await shardsNow(h)));
    for (const id of ['bat_rookie', 'bat_vesper', 'bat_sonarbot', 'bat_phantom', 'bat_turbo']) {
      check(`shop lists ${id}`, await h.exists(`shop-card-${id}`));
    }
    const cardText = (await text(h, 'shop-card-bat_turbo')) || '';
    check('Turbo Moth card: price and stat bars', /10,000/.test(cardText) && /RANGE/.test(cardText) && /DURATION/.test(cardText) && /NOISE/.test(cardText) && /cap x4\.0/.test(cardText), cardText.replace(/\n/g, ' | ').slice(0, 160));
    check('the Rookie is equipped from the start', /EQUIPPED/.test((await text(h, 'shop-card-bat_rookie')) || ''));
    check('an unaffordable bat says so', /NOT ENOUGH SHARDS/.test((await text(h, 'shop-buy-bat_sonarbot')) || ''));

    await h.tapTestId('shop-buy-bat_sonarbot');
    await sleep(400);
    check('trying to buy it tells how many shards are missing and charges nothing', /Need 1850 more shards/.test((await text(h, 'shop-notice')) || '') && (await shardsNow(h)) === 1650, (await text(h, 'shop-notice')) || '');

    await h.tapTestId('shop-buy-bat_vesper');
    await sleep(600);
    check('buying Vesper costs exactly 1500', (await shardsNow(h)) === 150, String(await shardsNow(h)));
    check('a bought bat is equipped right away', /EQUIPPED/.test((await text(h, 'shop-card-bat_vesper')) || ''));
    await h.shot('02_shop');

    await h.tapTestId('shop-equip-bat_rookie');
    await sleep(300);
    check('equip switches back to the Rookie', /EQUIPPED/.test((await text(h, 'shop-card-bat_rookie')) || '') && /EQUIP\b/.test((await text(h, 'shop-card-bat_vesper')) || ''));
    await h.tapTestId('shop-equip-bat_vesper');
    await sleep(300);

    // ---------------------------------------------------------------- persistence
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(2500);
    await stubTime(h, 'online');
    await toHome(h);
    await h.tapTestId('btn-shop');
    await sleep(600);
    check('after a restart: balance, ownership and the equipped bat persisted', (await shardsNow(h)) === 150 && /EQUIPPED/.test((await text(h, 'shop-card-bat_vesper')) || ''), String(await shardsNow(h)));
    await h.tapTestId('shop-back');
    await sleep(500);

    // ---------------------------------------------------------------- the ability really applies in a level
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    check('chapter mastery milestones are shown with their rewards', /25% \+20/.test((await text(h, 'mastery-1')) || '') && /100% \+100/.test((await text(h, 'mastery-1')) || ''), ((await text(h, 'mastery-1')) || '').replace(/\n/g, ' '));
    await h.tapTestId('level-6');
    await sleep(1300);
    const p = await h.eval(`(()=>{const p=window.__echo.sim.params||window.__echo.sim['params'];return p?{glow:p.glowBonusSec,rate:p.momentumRateMult,max:p.momentumMax,hear:p.hearingMult}:null})()`);
    check('Echo 06 runs with Vesper: walls and spikes glow +2 s', p && p.glow === 2 && p.rate === 1 && p.max === 2, JSON.stringify(p));
    await h.shot('03_game_vesper');

    // ---------------------------------------------------------------- finishing records the clear and pays out
    await h.eval(`(()=>{const e=window.__echo;const f=e.sim.world.finish;e.sim.body.x=f.x;e.sim.body.y=f.y;})()`);
    await sleep(900);
    check('the result screen shows the shards earned', /\+\d+ ✦/.test((await text(h, 'result-shards')) || ''), (await text(h, 'result-shards')) || '');
    await h.shot('04_result');
    check('no errors logged during the whole run', h.logs.length === 0, h.logs.slice(0, 2).join(' | '));
  } catch (e) {
    check('scenario ran to the end without throwing', false, String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e));
  } finally {
    await h.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();
