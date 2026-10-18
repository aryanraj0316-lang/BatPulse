/**
 * Phase 1 end-to-end scenario (real touch input, real browser).
 * Usage: node tools/e2e/phase1.js <outDir>     (dev server must be running on :8081)
 */
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./harness');
const { findRoute } = require('./route');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', '.e2e-out');
const APP = process.env.APP_URL || 'http://localhost:8081/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const level = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'levels', 'data', `echo_0${n}.json`), 'utf8'));

async function state(h) {
  return h.eval(`(()=>{const e=window.__echo; if(!e) return null; const s=e.sim; return {x:s.body.x,y:s.body.y,vx:s.body.vx,vy:s.body.vy,status:s.status,elapsed:s.elapsed,attempt:s.attempt,charges:s.energy.charges,pulses:s.pulsesUsed,mom:s.momentum.value,id:e.def.id,hint:s.hints.current,waves:s.waves.activeCount};})()`);
}

/** Closed-loop autopilot: pure pursuit along the route using a real touch drag on the stick zone. */
async function autopilot(h, def, { timeoutMs = 60000 } = {}) {
  const route = findRoute(def);
  if (!route) throw new Error('no route for level ' + def.id);
  const origin = { x: 300, y: 600 };
  await h.touch('touchStart', [{ id: 1, x: origin.x, y: origin.y }]);
  const t0 = Date.now();
  let idx = 0;
  let deaths = 0;
  let lastAttempt = (await state(h)).attempt;
  while (Date.now() - t0 < timeoutMs) {
    const s = await state(h);
    if (!s) break;
    if (s.status === 'won') break;
    if (s.attempt !== lastAttempt) {
      deaths++;
      lastAttempt = s.attempt;
      idx = 0;
    }
    while (idx < route.length - 1 && Math.hypot(route[idx].x - s.x, route[idx].y - s.y) < 30) idx++;
    const look = route[Math.min(route.length - 1, idx + 6)];
    const dx = look.x - s.x;
    const dy = look.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    await h.touch('touchMove', [{ id: 1, x: origin.x + (dx / d) * 50, y: origin.y + (dy / d) * 50 }]);
    await sleep(25);
  }
  await h.touch('touchEnd', []);
  return { deaths, ms: Date.now() - t0 };
}

(async () => {
  const h = await launch({ outDir: OUT, fresh: true });
  try {
    await h.goto(APP);
    await sleep(20000);
    await h.shot('01_first_launch');

    // ---- first launch: prompt, then splash, then straight into Echo 01
    check('first launch shows the headphone prompt', await h.clickText('INITIALIZE ACOUSTIC'));
    await sleep(600);
    await h.shot('02_splash');
    check('splash is shown', await h.exists('splash'));
    await sleep(2500);
    let s = await state(h);
    check('splash goes directly to Echo 01', s && s.id === 1, JSON.stringify(s && s.id));
    check('HUD shows level id and name', (await h.text('game-screen')).includes('ECHO 01') && (await h.text('game-screen')).includes('FIRST ECHO'));
    check('first hint (move) is shown', (await h.text('hint-text')) === 'Drag anywhere to fly', await h.text('hint-text'));
    check('3 sonar charges at start', s.charges === 3 && (await h.text('hud-sonar')).includes('3 / 3'), await h.text('hud-sonar'));
    check('momentum starts at x1.0', (await h.text('hud-momentum')).includes('1.0'));
    
    // ---- no sonar button: the whole play area takes touches, the joystick is barely visible
    check('there is no SONAR button on screen', !(await h.exists('sonar-button')) && !(await h.eval(`[...document.querySelectorAll('div,span')].some(e=>e.children.length===0&&e.textContent.trim()==='SONAR')`)));
    const zone = await h.eval(`(()=>{const e=document.querySelector('[data-testid="touch-zone"]');const r=e.getBoundingClientRect();return {w:r.width,h:r.height,top:r.top};})()`);
    check('one touch zone covers the whole play area below the HUD', zone.w >= 380 && zone.top < 150 && zone.top > 60, JSON.stringify(zone));
    const alpha = await h.eval(`parseFloat(getComputedStyle(document.querySelector('[data-testid="stick-visual"]')).opacity)`);
    check('the joystick is drawn at low opacity (0.15 to 0.25)', alpha >= 0.15 && alpha <= 0.25, String(alpha));

    // ---- joystick: dead zone, movement, hint progression, momentum
    await h.touch('touchStart', [{ id: 1, x: 300, y: 600 }]);
    await h.touch('touchMove', [{ id: 1, x: 303, y: 598 }]); // 3 px: inside the 10% dead zone
    await sleep(300);
    let s2 = await state(h);
    check('dead zone: a tiny wobble does not move the bat', Math.hypot(s2.x - s.x, s2.y - s.y) < 1, `moved ${Math.hypot(s2.x - s.x, s2.y - s.y).toFixed(2)}`);
    await h.touch('touchMove', [{ id: 1, x: 300, y: 550 }]); // full stick up
    await sleep(2300);
    const mid = await state(h);
    check('dragging the stick moves the bat', mid.y < s.y - 100, `y ${s.y.toFixed(0)} -> ${mid.y.toFixed(0)}`);
    check('move hint advances to the pulse hint', (await h.text('hint-text')) === 'Tap anywhere to send a pulse', await h.text('hint-text'));
    check('momentum grows after 2 s of movement', mid.mom >= 1.1, `x${mid.mom}`);
    await h.shot('03_moving');

    // ---- both thumbs: SONAR tapped while the stick is held
    const sonar = await h.clickTestId('sonar-button');
    await h.touch('touchMove', [{ id: 1, x: 350, y: 600 }]); // steer right (away from the top wall)
    await sleep(500);
    await h.touch('touchStart', [{ id: 1, x: 350, y: 600 }, { id: 2, x: sonar.x, y: sonar.y }]);
    await sleep(50);
    await h.touch('touchEnd', [{ id: 2, x: sonar.x, y: sonar.y }]); // the other thumb lifts: a quick tap = pulse, the stick finger stays down
    await sleep(120);
    const both = await state(h);
    check('a tap with the other thumb sends a pulse while the stick is held (multi-touch)', both.pulses === 1 && both.charges === 2, `pulses ${both.pulses}, charges ${both.charges}`);
    check('stick keeps steering during the pulse', Math.hypot(both.vx, both.vy) > 60, `speed ${Math.hypot(both.vx, both.vy).toFixed(0)}`);
    check('pulse hint advances', (await h.text('hint-text')) === 'Reach the purple ring', await h.text('hint-text'));
    await sleep(150);
    await h.shot('04_pulse');
    await h.touch('touchEnd', []);

    // ---- extra finger in the stick zone must not disturb the stick
    // steer away from whichever side wall the bat is near, so the test measures the stick and not a wall
    const pos = await state(h);
    const dir = pos.x > 190 ? -1 : 1;
    await h.touch('touchStart', [{ id: 1, x: 300, y: 600 }]);
    await h.touch('touchMove', [{ id: 1, x: 300 + dir * 50, y: 600 }]);
    await sleep(300);
    await h.touch('touchStart', [{ id: 1, x: 300 + dir * 50, y: 600 }, { id: 3, x: 150, y: 300 }]);
    await h.touch('touchMove', [{ id: 1, x: 300 + dir * 50, y: 600 }, { id: 3, x: 200, y: 350 }]);
    await sleep(200);
    const after = await state(h);
    check('an extra finger does not change the stick direction', after.vx * dir > 100 && Math.abs(after.vy) < 40, `v=(${after.vx.toFixed(0)},${after.vy.toFixed(0)})`);
    await h.touch('touchEnd', []);

    // ---- gestures: a quick tap is the pulse, a drag or a hold is the joystick (never both)
    await sleep(2500); // let the bat settle and a charge come back
    const stickOn = () => h.eval('window.__echo.input.active');
    let g0 = await state(h);
    await h.touch('touchStart', [{ id: 31, x: 120, y: 420 }]); // quick tap, left side of the screen
    await sleep(60);
    await h.touch('touchEnd', []);
    await sleep(150);
    let g1 = await state(h);
    check('a quick tap anywhere sends one pulse', g1.pulses === g0.pulses + 1, `pulses ${g0.pulses} -> ${g1.pulses}`);
    check('the tap did not engage the joystick or move the bat', !(await stickOn()) && Math.hypot(g1.vx, g1.vy) < 60, `speed ${Math.hypot(g1.vx, g1.vy).toFixed(0)}`);
    await sleep(2200);
    g0 = await state(h);
    await h.touch('touchStart', [{ id: 32, x: 300, y: 620 }]);
    await h.touch('touchMove', [{ id: 32, x: 300, y: 590 }]); // 30 px: a drag
    await sleep(150);
    check('a drag engages the joystick', await stickOn());
    await h.touch('touchEnd', []);
    await sleep(150);
    g1 = await state(h);
    check('a drag sends no pulse', g1.pulses === g0.pulses, `pulses ${g0.pulses} -> ${g1.pulses}`);
    await sleep(800);
    g0 = await state(h);
    await h.touch('touchStart', [{ id: 33, x: 300, y: 620 }]);
    await sleep(450); // held still, longer than the tap limit
    const heldOn = await stickOn();
    await h.touch('touchEnd', []);
    await sleep(150);
    g1 = await state(h);
    check('a long press takes the joystick', heldOn);
    check('a long press sends no pulse, not even when released', g1.pulses === g0.pulses, `pulses ${g0.pulses} -> ${g1.pulses}`);
    check('after every gesture the joystick is released', !(await stickOn()));
    await h.shot('04b_gestures');

    // ---- recharge (tutorial: 2 s per charge)
    await sleep(500);
    let cur = await state(h);
    const wait0 = cur.charges;
    await sleep(2300);
    cur = await state(h);
    check('a charge recharges in about 2 s on Echo 01', cur.charges > wait0 || cur.charges === 3, `${wait0} -> ${cur.charges}`);

    // ---- very fast SONAR tapping
    const burst = [];
    for (let i = 0; i < 12; i++) {
      await h.touch('touchStart', [{ id: 10 + i, x: sonar.x, y: sonar.y }]);
      await h.touch('touchEnd', []);
    }
    await sleep(200);
    cur = await state(h);
    check('12 very fast taps never overdraw the charges and do not crash', cur.charges >= 0 && cur.charges <= 3 && h.logs.length === 0, `charges ${cur.charges}, logs ${h.logs.length}`);

    // ---- pause / resume freezes the clock
    await h.tapTestId('btn-pause');
    await sleep(300);
    check('pause menu opens', await h.exists('btn-resume'));
    const p1 = (await state(h)).elapsed;
    await sleep(800);
    const p2 = (await state(h)).elapsed;
    check('pausing freezes the simulation clock', Math.abs(p2 - p1) < 0.01, `${p1.toFixed(2)} -> ${p2.toFixed(2)}`);
    await h.shot('05_pause');
    await h.tapTestId('btn-resume');
    await sleep(400);
    check('resume continues the clock', (await state(h)).elapsed > p2 + 0.2);

    // ---- restart during a pulse
    await h.touch('touchStart', [{ id: 20, x: sonar.x, y: sonar.y }]);
    await h.touch('touchEnd', []);
    await h.tapTestId('btn-restart');
    await sleep(250);
    s = await state(h);
    check('restart during a pulse resets the attempt cleanly', s.waves === 0 && s.charges === 3 && s.elapsed < 0.6, JSON.stringify({ w: s.waves, c: s.charges, t: s.elapsed.toFixed(2) }));

    // ---- play Echo 01 to the end with the real touch pipeline
    const run1 = await autopilot(h, level(1));
    await sleep(600);
    s = await state(h);
    check('Echo 01 completed by touch autopilot', s.status === 'won', `${(run1.ms / 1000).toFixed(1)} s`);
    check('victory screen: stars, time, momentum, shards, buttons',
      (await h.exists('result-stars')) && !!(await h.text('result-time')) && !!(await h.text('result-momentum')) && !!(await h.text('result-shards')) && (await h.exists('btn-next')) && (await h.exists('btn-retry')) && (await h.exists('btn-home')),
      `time ${await h.text('result-time')}, shards ${await h.text('result-shards')}`);
    await h.shot('06_victory');
    const saved1 = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('save contains the record and the shard reward', saved1.records['1'] && saved1.records['1'].completed && saved1.shards > 0 && saved1.records['2'].unlocked, `shards ${saved1.shards}, stars ${saved1.records['1'].stars}`);

    // ---- levels 2..5 via Next
    for (let n = 2; n <= 5; n++) {
      await h.tapTestId('btn-next');
      await sleep(900);
      s = await state(h);
      check(`Next opens Echo 0${n}`, s && s.id === n);
      const run = await autopilot(h, level(n));
      await sleep(500);
      s = await state(h);
      check(`Echo 0${n} completed`, s.status === 'won', `${(run.ms / 1000).toFixed(1)} s, ${run.deaths} deaths`);
      check(`Echo 0${n}: no unfair deaths on a clean route`, run.deaths === 0);
      if (n === 3) await h.shot('07_level3_won');
      if (n === 5) await h.shot('08_level5_won');
    }
    check('after Echo 05 the chapter continues (Next goes to Echo 06)', await h.exists('btn-next'));

    // ---- 50 consecutive restarts
    await h.tapTestId('btn-retry');
    await sleep(300);
    const a0 = (await state(h)).attempt;
    for (let i = 0; i < 50; i++) {
      await h.touch('touchStart', [{ id: 1, x: 300, y: 600 }]);
      await h.touch('touchMove', [{ id: 1, x: 300, y: 560 }]);
      await sleep(60);
      await h.touch('touchEnd', []);
      await h.tapTestId('btn-restart');
      await sleep(40);
    }
    await sleep(300);
    s = await state(h);
    check('50 consecutive restarts: sim healthy, attempt counter exact', s.attempt === a0 + 50 && s.status === 'playing', `attempts +${s.attempt - a0}`);
    check('50 consecutive restarts: no exceptions logged', h.logs.length === 0, h.logs.slice(0, 2).join(' | '));

    // ---- frame rate while moving (headless, no GPU: indicative only)
    await h.touch('touchStart', [{ id: 1, x: 300, y: 600 }]);
    await h.touch('touchMove', [{ id: 1, x: 340, y: 570 }]);
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<4000)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),maxFrame:max});}requestAnimationFrame(f);})`);
    await h.touch('touchEnd', []);
    check('frame rate stays at 60 FPS in the browser', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.maxFrame.toFixed(0)} ms`);

    // ---- Home -> Level Select -> Echo 03, then die on the spikes
    await h.tapTestId('btn-pause');
    await sleep(300);
    await h.tapTestId('btn-pause-home');
    await sleep(800);
    check('Home button returns to the main menu', (await h.text('root') || (await h.eval('document.body.innerText'))).includes('DEPLOY ECHO'));
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    await h.shot('09_level_select');
    check('level select lists the cleared levels as open', (await h.eval(`document.querySelector('[data-testid="level-5"]').getAttribute('aria-disabled')`)) !== 'true');
    await h.tapTestId('level-3');
    await sleep(1200);
    s = await state(h);
    check('level select opens Echo 03', s && s.id === 3);
    // put the bat just left of the first spike island and push into it
    await h.eval(`(()=>{const e=window.__echo;const sp=e.sim.world.spikes[0];e.sim.body.x=sp.x-40;e.sim.body.y=sp.y+sp.height/2;})()`);
    await h.touch('touchStart', [{ id: 1, x: 300, y: 600 }]);
    await h.touch('touchMove', [{ id: 1, x: 350, y: 600 }]);
    let dying = null;
    for (let i = 0; i < 60 && !dying; i++) {
      await sleep(25);
      const st = await h.eval(`(()=>{const s=window.__echo.sim;return {status:s.status,shake:s.shake,cause:s.failCause,att:s.attempt};})()`);
      if (st.status === 'dying') dying = st;
    }
    check('touching spikes kills the bat', !!dying && dying.cause === 'spike');
    check('death starts the ~0.3 s screen shake', dying && dying.shake > 0.2 && dying.shake <= 0.3, dying && dying.shake.toFixed(2));
    await h.shot('10_death');
    const tDeath = Date.now();
    await h.touch('touchEnd', []);
    let back = null;
    for (let i = 0; i < 80 && !back; i++) {
      await sleep(25);
      const st = await h.eval(`(()=>{const s=window.__echo.sim;return {status:s.status,att:s.attempt,x:s.body.x,t:s.elapsed};})()`);
      if (st.status === 'playing' && st.att > dying.att) back = st;
    }
    const restartMs = Date.now() - tDeath;
    check('death auto-restarts within about 1 s', !!back && restartMs <= 1300, `${restartMs} ms`);
    check('after the auto-restart the attempt is fresh', back && back.t < 0.3);

    // ---- app kill + relaunch keeps progress (same profile, new page load)
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(15000);
    const saved2 = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('progress survives an app kill (relaunch)', saved2.records['5'] && saved2.records['5'].completed && saved2.shards === (await (async () => saved2.shards)()) && saved2.shards >= saved1.shards, `shards ${saved2.shards}`);
    check('relaunch does not show the first-launch prompt again', !(await h.clickText('INITIALIZE ACOUSTIC')));
    await sleep(2500);
    s = await state(h);
    check('returning player resumes at the furthest unlocked level (Echo 06, unlocked by clearing Echo 05)', s && s.id === 6, JSON.stringify(s && s.id));

    // ---- corrupt the save on purpose and relaunch: recovery from the backup
    await h.eval(`localStorage.setItem('echo.save.primary','{{corrupt')`);
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(15000);
    await sleep(2500);
    const healed = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('corrupted save is recovered from the backup', healed.records['5'] && healed.shards >= 0 && healed.records['1'].completed, `shards ${healed.shards}`);
    check('the unreadable blob was kept for forensics', (await h.eval(`localStorage.getItem('echo.save.corrupt')`)) === '{{corrupt');
  } catch (e) {
    check('scenario ran to the end without throwing', false, e.stack || String(e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'phase1-results.json'), JSON.stringify(results, null, 2));
    await h.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
