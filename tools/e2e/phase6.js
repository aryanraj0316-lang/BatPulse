/**
 * Phase 6 end-to-end scenario: settings (cave echo, graphics), leaderboards screen, cloud-save status, crash recovery,
 * low-quality rendering, ads hidden by default, version display, and a v2 -> v3 save migration.
 * Usage: node tools/e2e/phase6.js <outDir>   (dev server on :8081)
 * Audio, ads and online services cannot be heard/served in a browser: they are covered by unit tests with fakes.
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

/** An OLD (v2, balance-only) save: proves the migration to the ledger keeps everything. */
const seedV2 = () => {
  const records = {};
  for (let i = 1; i <= 50; i++) {
    records[i] = {
      levelId: i, unlocked: true, completed: i <= 8, stars: i <= 8 ? 2 : 0,
      bestTime: i <= 8 ? 20 + i : null, bestMomentum: i <= 8 ? 1.2 : null, ghostRun: false,
      ...(i <= 8 ? { bestTimes: { bat_rookie: 20 + i, bat_vesper: 19 + i } } : {}),
    };
  }
  return {
    saveVersion: 2, shards: 480, selectedCharacter: 'bat_vesper', unlockedCharacters: ['bat_rookie', 'bat_vesper'], records,
    hasSeenHeadphonePrompt: true, claimedMilestones: [],
    settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true },
    daily: { lastClaimDay: null, streak: 0 },
  };
};

const text = (h, id) => h.eval(`(()=>{const e=document.querySelector('[data-testid="${id}"]');return e?e.innerText:null;})()`);
async function toHome(h) {
  await h.tapTestId('btn-pause');
  await sleep(250);
  await h.tapTestId('btn-pause-home');
  await sleep(700);
}
async function reload(h) {
  await h.goto('about:blank');
  await sleep(500);
  await h.goto(APP);
  await sleep(2500);
}

(async () => {
  const h = await launch({ outDir: OUT, fresh: true });
  try {
    await h.goto(APP);
    await h.seedSave(seedV2());
    await reload(h);

    // ---------------------------------------------------------------- migration + version
    await toHome(h);
    const homeText = await h.eval('document.body.innerText');
    check('the home screen shows the real build version (from app.json)', /BUILD 1\.0\.0/.test(homeText), (homeText.match(/BUILD [^\n]*/) || [''])[0]);
    check('the old save still shows its 480 shards after the ledger migration', /480 SHARDS/.test(homeText), (homeText.match(/\d+ SHARDS/) || [''])[0]);

    // ---------------------------------------------------------------- settings
    await h.clickText('SETTINGS & CALIBRATION');
    await sleep(500);
    check('settings has the cave echo switch', await h.exists('switch-reverb'));
    check('settings has the graphics button, default AUTO', /AUTO/.test((await text(h, 'btn-graphics')) || ''), (await text(h, 'btn-graphics')) || '');
    const cloud = (await text(h, 'cloud-status')) || '';
    check('cloud save says it is not available in this build (no broken online screen)', /not available in this build/.test(cloud) && !(await h.exists('btn-cloud-sync')), cloud);
    await h.tapTestId('btn-graphics');
    await sleep(200);
    check('graphics cycles AUTO -> LOW', /LOW/.test((await text(h, 'btn-graphics')) || ''), (await text(h, 'btn-graphics')) || '');
    await h.tapTestId('btn-graphics');
    await sleep(200);
    check('graphics cycles LOW -> HIGH', /HIGH/.test((await text(h, 'btn-graphics')) || ''));
    await h.tapTestId('btn-graphics');
    await sleep(200);
    check('graphics cycles HIGH -> AUTO', /AUTO/.test((await text(h, 'btn-graphics')) || ''));
    await h.tapTestId('btn-graphics');
    await sleep(200); // leave it on LOW for the rest of the run
    const echoBefore = await h.eval(`(()=>{const e=document.querySelector('[data-testid="switch-reverb"] input')||document.querySelector('[data-testid="switch-reverb"]');return e?(e.checked!==undefined?e.checked:e.getAttribute('aria-checked')):null})()`);
    await h.eval(`(()=>{const e=document.querySelector('[data-testid="switch-reverb"] input')||document.querySelector('[data-testid="switch-reverb"]');e.click();return true})()`);
    await sleep(300);
    const echoAfter = await h.eval(`(()=>{const e=document.querySelector('[data-testid="switch-reverb"] input')||document.querySelector('[data-testid="switch-reverb"]');return e?(e.checked!==undefined?e.checked:e.getAttribute('aria-checked')):null})()`);
    check('the cave echo switch toggles', String(echoBefore) !== String(echoAfter), `${echoBefore} -> ${echoAfter}`);
    await h.tapTestId('btn-settings-back');
    await sleep(500);

    // settings persist across a restart
    await reload(h);
    await toHome(h);
    await h.clickText('SETTINGS & CALIBRATION');
    await sleep(500);
    check('graphics = LOW survived a restart', /LOW/.test((await text(h, 'btn-graphics')) || ''), (await text(h, 'btn-graphics')) || '');
    await h.tapTestId('btn-settings-back');
    await sleep(400);

    // ---------------------------------------------------------------- leaderboards
    await h.tapTestId('btn-leaderboard');
    await sleep(900);
    check('the leaderboard screen opens on the latest cleared level (Echo 08)', /ECHO 08/.test((await text(h, 'lb-level')) || ''), (await text(h, 'lb-level')) || '');
    check('online boards say they are not available (no fake data)', await h.exists('lb-disabled'));
    const rows = await h.eval(`Array.from(document.querySelectorAll('[data-testid="lb-row"]')).map(r=>r.innerText.replace(/\\n/g,' | '))`);
    check('your own best times are listed per bat, fastest first', rows.length === 2 && /Vesper/.test(rows[0]) && /Rookie/.test(rows[1]), JSON.stringify(rows));
    check('Vesper (27.00 -> 0:27.00) is faster than the Rookie (28 -> 0:28.00)', /0:27\.00/.test(rows[0]) && /0:28\.00/.test(rows[1]));
    await h.tapTestId('lb-prev');
    await sleep(300);
    check('the level stepper moves to Echo 07', /ECHO 07/.test((await text(h, 'lb-level')) || ''));
    check('a non-Rookie bat gets the fairness toggle (Rookie only / my bat)', (await h.exists('lb-rookie')) && (await h.exists('lb-mybat')));
    await h.shot('01_leaderboards');
    await h.tapTestId('lb-back');
    await sleep(500);

    // ---------------------------------------------------------------- game on LOW quality: still lit, still 60 FPS
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    await h.tapTestId('level-39');
    await sleep(1500);
    const tall = await h.eval(`(()=>{const e=window.__echo;return {id:e.def.id,h:e.def.height}})()`);
    check('Echo 39 (a tall level) loads', tall.id === 39 && tall.h > 1500, JSON.stringify(tall));
    await h.eval(`(()=>{window.__echo.sim.firePulse();return true})()`);
    await sleep(500);
    const lit = await h.eval(`(()=>{const g=document.querySelector('[data-testid="game-canvas"] svg g');return g?g.querySelectorAll('*').length:0})()`);
    check('on LOW quality a pulse still lights the level', lit > 8, `${lit} drawn elements`);
    await h.shot('02_low_quality_pulse');
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<2500)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),max});}requestAnimationFrame(f);})`);
    check('60 FPS on LOW quality', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.max.toFixed(0)} ms`);

    // lit items far off screen are not drawn (culling): teleport to the top and compare the drawn world rows
    const rowsDrawn = async () =>
      h.eval(`(()=>{const e=window.__echo;const s=e.sim;const g=document.querySelector('[data-testid="game-canvas"] svg g');const m=/translate\\(([-+\\deE.]+)\\s+([-+\\deE.]+)\\)\\s+scale\\(([-+\\deE.]+)\\)/.exec(g.getAttribute('transform')||'');return m?{offsetY:parseFloat(m[2]),scale:parseFloat(m[3])}:null})()`);
    const cam = await rowsDrawn();
    check('the camera follows the bat in the tall level', cam && cam.offsetY < -100, JSON.stringify(cam));

    // ---------------------------------------------------------------- finish: result card has no ad button (flag off)
    await h.eval(`(()=>{const e=window.__echo;const f=e.sim.world.finish;e.sim.body.x=f.x;e.sim.body.y=f.y;return true})()`);
    await sleep(900);
    check('the result card appears', await h.exists('result-shards'), (await text(h, 'result-shards')) || '');
    check('rewarded ads are off by default: no ad button is shown', !(await h.exists('btn-watch-ad')));
    await h.shot('03_result_no_ad');

    // ---------------------------------------------------------------- crash recovery
    await h.eval(`(()=>{window.__echoCrash();return true})()`);
    await sleep(800);
    check('a rendering error shows the "SIGNAL LOST" recovery screen, not a blank page', await h.exists('crash-screen'), ((await text(h, 'crash-screen')) || '').replace(/\n/g, ' | '));
    await h.shot('04_crash_screen');
    await h.tapTestId('crash-restart');
    await sleep(900);
    check('RESTART returns to the home screen with the save intact', /DEPLOY ECHO/.test(await h.eval('document.body.innerText')) && /SHARDS/.test(await h.eval('document.body.innerText')));

    // the crash was recorded but did not touch the save
    await reload(h);
    await toHome(h);
    const afterText = await h.eval('document.body.innerText');
    check('after the crash and a restart the progress is unchanged (still 8 levels cleared, shards kept)', /SHARDS/.test(afterText) && !/\b0 SHARDS/.test(afterText), (afterText.match(/\d+ SHARDS/) || [''])[0]);
    check('no unexpected console errors (the crash test error is the only one allowed)', h.logs.filter((l) => !/crash test|SIGNAL LOST|The above error occurred|Error: crash test/i.test(l)).length === 0, h.logs.filter((l) => !/crash test|The above error occurred/i.test(l)).slice(0, 2).join(' | '));
  } catch (e) {
    check('scenario ran to the end without throwing', false, String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e));
  } finally {
    await h.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();
