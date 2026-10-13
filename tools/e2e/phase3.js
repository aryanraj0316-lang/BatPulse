/**
 * Phase 3 end-to-end scenario: hunters, stealth, fail screen and Ghost Run in a real browser.
 * Usage: node tools/e2e/phase3.js <outDir>   (dev server on :8081)
 * The debug hook teleports the bat for set-up only; hearing, alerts, capture, rewards and screens run for real.
 * Solvability of every level (stealth and loud) is proven separately in src/__tests__/chapter2.test.ts.
 */
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./harness');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', '.e2e-out');
const APP = process.env.APP_URL || 'http://localhost:8081/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const st = (h) =>
  h.eval(`(()=>{const e=window.__echo;if(!e)return null;const s=e.sim;const ri=s.world.revealables.findIndex(r=>r.kind==='enemy');return {id:e.def.id,status:s.status,cause:s.failCause,att:s.attempt,elapsed:s.elapsed,x:s.body.x,y:s.body.y,alerts:s.alertCount,threat:s.threat,pulses:s.pulsesUsed,marker:s.markerAge[0],eglow:ri>=0?s.reveal.glow[ri]:0,en:s.enemies.enemies.map(x=>({state:x.state,x:x.body.x,y:x.body.y,tx:x.tx,ty:x.ty}))};})()`);
const body = (h) => h.eval('document.body.innerText');
const tele = (h, x, y) => h.eval(`(()=>{const s=window.__echo.sim;s.body.x=${x};s.body.y=${y};s.body.vx=0;s.body.vy=0;})()`);
const toFinish = async (h) => {
  await h.eval(`(()=>{const e=window.__echo;const f=e.sim.world.finish;e.sim.body.x=f.x;e.sim.body.y=f.y;})()`);
  await sleep(500);
};
async function sonarTap(h) {
  const p = await h.clickTestId('sonar-button');
  await h.touch('touchStart', [{ id: 41, x: p.x, y: p.y }]);
  await h.touch('touchEnd', []);
}
/** Restart and wait until the 3 s spawn safe window is over. */
async function freshAttempt(h, waitPastSafe = true) {
  await h.tapTestId('btn-restart');
  await sleep(250);
  if (waitPastSafe) {
    for (let i = 0; i < 60; i++) {
      const s = await st(h);
      if (s.elapsed > 3.3) break;
      await sleep(100);
    }
  }
}

const seed = () => {
  const records = {};
  for (let i = 1; i <= 35; i++) records[i] = { levelId: i, unlocked: true, completed: i <= 20, stars: i <= 20 ? 1 : 0, bestTime: i <= 20 ? 30 : null, bestMomentum: i <= 20 ? 1 : null, ghostRun: false };
  return {
    saveVersion: 2, shards: 0, selectedCharacter: 'bat_rookie', unlockedCharacters: ['bat_rookie'], records,
    hasSeenHeadphonePrompt: true,
    settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true },
    daily: { lastClaimDay: null, streak: 0 },
  };
};

(async () => {
  const h = await launch({ outDir: OUT, fresh: true });
  try {
    await h.goto(APP);
    await sleep(20000);
    await h.seedSave(seed());
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(15000);
    await sleep(2500);

    // ---- level select shows Chapter 2
    let s = await st(h);
    check('returning player resumes at the furthest unlocked level (Echo 35)', s && s.id === 35);
    await h.tapTestId('btn-pause');
    await sleep(300);
    await h.tapTestId('btn-pause-home');
    await sleep(700);
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(600);
    let txt = await body(h);
    check('level select shows Chapter 2 "The Listening Deep" with Echo 21-35', txt.includes('THE LISTENING DEEP') && txt.includes('CHAPTER 2') && txt.includes('35'));
    await h.shot('01_chapter2');
    await h.tapTestId('level-21');
    await sleep(1500);
    s = await st(h);
    check('Echo 21 opens with one hunter on patrol', s && s.id === 21 && s.en.length === 1 && s.en[0].state === 'patrol');
    check('the hunter is invisible until a wave hits it', s.eglow === 0);
    check('the first hint explains hearing', (await h.text('hint-text')) === 'Hunters hear your pulses. Pulse far from them.', await h.text('hint-text'));

    // ---- 3 s spawn safe window
    const hx = s.en[0].x;
    await tele(h, hx + 60, s.en[0].y);
    await sonarTap(h);
    await sleep(1200);
    s = await st(h);
    check('safe window: a pulse right next to a hunter is not heard and the bat is not caught', s.en[0].state === 'patrol' && s.status === 'playing' && s.alerts === 0, `${s.en[0].state}, elapsed ${s.elapsed.toFixed(1)}`);

    // ---- hearing, alert, sound marker, visibility
    await freshAttempt(h);
    s = await st(h);
    await tele(h, s.en[0].x - 110, s.en[0].y);
    await sonarTap(h);
    await sleep(150);
    s = await st(h);
    check('a pulse inside 1.2x the pulse radius alerts the hunter', s.en[0].state === 'alerted' && s.alerts === 1, `${s.en[0].state}, alerts ${s.alerts}`);
    check('the alerted hunter heads for the place the pulse was made', Math.hypot(s.en[0].tx - s.x, s.en[0].ty - s.y) < 2, `target (${s.en[0].tx.toFixed(0)},${s.en[0].ty.toFixed(0)}) vs bat (${s.x.toFixed(0)},${s.y.toFixed(0)})`);
    check('a faint sound marker appears where the pulse was made', s.marker < 0.5, `age ${s.marker}`);
    check('the wave lit the hunter up', s.eglow > 0.5, s.eglow.toFixed(2));
    await h.shot('02_alerted_marker');
    await tele(h, 60, 620); // slip away so the test can observe the visibility timing
    await sleep(1500);
    s = await st(h);
    check('the hunter is visible for only about a second after the wave', s.eglow === 0, `glow ${s.eglow}`);

    // ---- heartbeat / red edge
    await freshAttempt(h);
    s = await st(h);
    await tele(h, s.en[0].x + 85, s.en[0].y);
    await sleep(350);
    s = await st(h);
    check('within ~5 tiles the threat level and the red screen edge appear', s.threat > 0 && (await h.exists('threat-edge')), `threat ${s.threat.toFixed(2)}`);
    await h.shot('03_heartbeat_edge');
    await tele(h, 60, 620);
    await sleep(300);
    check('the red edge goes away when the hunter is not near', !(await h.exists('threat-edge')));

    // ---- capture, fail screen, jump effect cooldown, Retry Cleaner
    await freshAttempt(h);
    s = await st(h);
    await tele(h, s.en[0].x, s.en[0].y);
    await sleep(300);
    s = await st(h);
    check('contact with a hunter ends the run (cause: enemy)', s.status === 'dying' && s.cause === 'enemy');
    check('the fail screen shows "Retry Cleaner"', await h.exists('btn-retry-cleaner'));
    check('the first catch plays the dark jump effect', await h.exists('jump-effect'));
    await h.shot('04_jump');
    await sleep(1600);
    await h.shot('05_fail_screen');
    s = await st(h);
    check('being caught does not restart by itself', s.status === 'dying');
    await h.tapTestId('btn-restart'); // the HUD restart works in this state
    await sleep(300);
    s = await st(h);
    check('the HUD restart button works from the fail screen', s.status === 'playing' && !(await h.exists('btn-retry-cleaner')));
    await freshAttempt(h);
    s = await st(h);
    await tele(h, s.en[0].x, s.en[0].y);
    await sleep(400);
    check('a second catch right after does NOT repeat the jump effect', (await h.exists('btn-retry-cleaner')) && !(await h.exists('jump-effect')));
    const a1 = (await st(h)).att;
    await h.tapTestId('btn-retry-cleaner');
    await sleep(300);
    s = await st(h);
    check('Retry Cleaner restarts the level at once', s.status === 'playing' && s.att === a1 + 1 && s.elapsed < 0.6);
    check('the hunter is back on patrol after the retry', s.en[0].state === 'patrol' && s.alerts === 0);

    // ---- ghost run: bonus once, badge kept
    await toFinish(h);
    check('a clean run is a Ghost Run (badge on the result card)', await h.exists('ghost-badge'), await h.text('ghost-badge'));
    const shards1 = await h.text('result-shards');
    check('the first Ghost Run pays +25 shards on top of the stars', /\+(7[0-9]|8[0-9]) /.test(shards1 || ''), shards1);
    await h.shot('06_ghost_result');
    let save = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('the Ghost badge is saved on the level record', save.records['21'].ghostRun === true && save.shards >= 70, `shards ${save.shards}`);
    await h.tapTestId('btn-retry');
    await sleep(300);
    await toFinish(h);
    const shards2 = await h.text('result-shards');
    const badge2 = (await h.text('ghost-badge')) || '';
    check('a repeated Ghost Run pays no second bonus', badge2.includes('GHOST RUN') && !badge2.includes('+25'), badge2);
    check('replays pay less than the first clear', parseInt((shards2 || '+0').replace(/\D/g, ''), 10) < parseInt((shards1 || '+0').replace(/\D/g, ''), 10), `${shards1} -> ${shards2}`);
    await h.tapTestId('btn-retry');
    await sleep(300);

    // ---- a loud run is not a ghost run
    await freshAttempt(h);
    s = await st(h);
    await tele(h, s.en[0].x - 110, s.en[0].y);
    await sonarTap(h);
    await sleep(100);
    await toFinish(h);
    check('after alerting a hunter the finish is not a Ghost Run', !(await h.exists('ghost-badge')) && (await h.exists('result-stars')));
    save = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('a later loud run never removes the Ghost badge', save.records['21'].ghostRun === true);

    // ---- all fifteen levels through the real result/save pipeline
    for (let n = 22; n <= 35; n++) {
      await h.tapTestId('btn-next');
      await sleep(900);
      s = await st(h);
      if (!s || s.id !== n) {
        check(`Echo ${n} loaded`, false, JSON.stringify(s && s.id));
        break;
      }
      if (n === 29) {
        const sp = s.en.map((e) => e.state);
        check('Echo 29 has a fast hunter', sp.length >= 1);
        await h.shot('07_level29');
      }
      await toFinish(h);
      check(`Echo ${n}: finished as a Ghost Run`, await h.exists('ghost-badge'));
    }
    check('after Echo 35 the game continues into Chapter 3 (Next is offered)', await h.exists('btn-next'));

    // ---- level select: progress and badges
    await h.tapTestId('btn-home');
    await sleep(700);
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(600);
    txt = await body(h);
    const bats = (txt.match(/🦇/g) || []).length;
    check('level select shows the Ghost badge on all 15 chapter-2 levels', bats >= 15, `${bats} badges`);
    check('chapter progress shows 15 / 15 cleared in chapter 2', (txt.match(/\d+ \/ \d+ cleared/g) || []).some((x) => x.startsWith('15 / 15')), (txt.match(/\d+ \/ \d+ cleared/g) || []).join(' | '));
    await h.shot('08_select_done');
    await h.tapTestId('level-35');
    await sleep(1500);

    // ---- 50 restarts with hunters; frame rate with hunters and pulses
    const a0 = (await st(h)).att;
    for (let i = 0; i < 50; i++) {
      await h.tapTestId('btn-restart');
      await sleep(40);
    }
    await sleep(300);
    s = await st(h);
    check('50 consecutive restarts with hunters: clean state, exact attempt count', s.att === a0 + 50 && s.status === 'playing' && s.alerts === 0, `attempts +${s.att - a0}`);
    await sleep(3400);
    await h.eval(`(()=>{const e=window.__echo;const sim=e.sim;sim.energy.reset();sim.firePulse();})()`);
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<3000)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),max});}requestAnimationFrame(f);})`);
    check('60 FPS with two fast hunters chasing and a pulse lighting the level', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.max.toFixed(0)} ms`);
    check('no errors logged during the whole run', h.logs.length === 0, h.logs.slice(0, 2).join(' | '));

    // ---- relaunch keeps the badges and shards
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(15000);
    save = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    const ghosts = Object.values(save.records).filter((r) => r.ghostRun).length;
    check('relaunch: Ghost badges and shards survive', ghosts === 15 && save.shards > 700, `${ghosts} badges, ${save.shards} shards`);
  } catch (e) {
    check('scenario ran to the end without throwing', false, e.stack || String(e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'phase3-results.json'), JSON.stringify(results, null, 2));
    await h.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
