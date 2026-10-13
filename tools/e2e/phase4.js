/**
 * Phase 4 end-to-end scenario: multi-room levels with checkpoints, escape levels, Chapter 3, and all 50 levels.
 * Usage: node tools/e2e/phase4.js <outDir>   (dev server on :8081)
 * The debug hook teleports the bat for set-up only; checkpoints, respawn, the wall, rewards and screens run for real.
 * Solvability of each level is proven in src/__tests__/chapter*.test.ts.
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
  h.eval(`(()=>{const e=window.__echo;if(!e)return null;const s=e.sim;return {id:e.def.id,status:s.status,cause:s.failCause,att:s.attempt,elapsed:s.elapsed,wt:s.worldTime,x:s.body.x,y:s.body.y,cp:s.lastCheckpoint,wall:s.escapeWallY,threat:s.threat,doors:Array.from(s.doorTimer),taken:Array.from(s.pickupTaken),charges:s.energy.charges,cps:e.def.checkpoints,h:e.def.height,esc:e.def.escape.enabled};})()`);
const tele = (h, x, y) => h.eval(`(()=>{const s=window.__echo.sim;s.body.x=${x};s.body.y=${y};s.body.vx=0;s.body.vy=0;})()`);
const toFinish = async (h) => {
  await h.eval(`(()=>{const e=window.__echo;const f=e.sim.world.finish;e.sim.body.x=f.x;e.sim.body.y=f.y;})()`);
  await sleep(500);
};
/** Vertical offset of the world group on screen (the camera). */
const camY = (h) =>
  h.eval(`(()=>{const g=document.querySelector('[data-testid="game-canvas"] svg g');const m=/translate\\(([-+\\deE.]+)\\s+([-+\\deE.]+)\\)/.exec(g.getAttribute('transform')||'');return m?parseFloat(m[2]):null;})()`);

const seed = () => {
  const records = {};
  for (let i = 1; i <= 50; i++) records[i] = { levelId: i, unlocked: true, completed: i <= 35, stars: i <= 35 ? 1 : 0, bestTime: i <= 35 ? 30 : null, bestMomentum: i <= 35 ? 1 : null, ghostRun: false };
  return {
    saveVersion: 2, shards: 0, selectedCharacter: 'bat_rookie', unlockedCharacters: ['bat_rookie'], records,
    hasSeenHeadphonePrompt: true,
    settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true },
    daily: { lastClaimDay: null, streak: 0 },
  };
};

async function openLevel(h, n) {
  await h.tapTestId('btn-pause');
  await sleep(250);
  await h.tapTestId('btn-pause-home');
  await sleep(600);
  await h.clickText('SELECT ECHO CHAMBER');
  await sleep(500);
  await h.tapTestId(`level-${n}`);
  await sleep(1300);
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

    // ---- chapter 3 in Level Select
    await h.tapTestId('btn-pause');
    await sleep(250);
    await h.tapTestId('btn-pause-home');
    await sleep(600);
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    let txt = await h.eval('document.body.innerText');
    check('level select shows Chapter 3 "The Silent Abyss"', txt.includes('THE SILENT ABYSS') && txt.includes('CHAPTER 3'));
    await h.shot('01_chapter3');

    // ---- multi-room level: scrolling camera
    await h.tapTestId('level-39');
    await sleep(1300);
    let s = await st(h);
    check('Echo 39 is a tall three-room level with two checkpoints', s && s.id === 39 && s.h > 1500 && s.cps.length === 2, `height ${s && s.h}`);
    const camBottom = await camY(h);
    await tele(h, 190, 300);
    await sleep(300);
    const camTop = await camY(h);
    check('the camera scrolls with the bat in a tall level', camTop > camBottom + 300, `${camBottom.toFixed(0)} -> ${camTop.toFixed(0)}`);
    await h.shot('02_scrolled');

    // ---- checkpoints and respawn
    await h.tapTestId('btn-restart');
    await sleep(300);
    s = await st(h);
    check('a fresh run has no checkpoint', s.cp === -1);
    const cp0 = s.cps[0];
    await tele(h, cp0.x, cp0.y);
    await sleep(300);
    s = await st(h);
    check('touching a checkpoint saves it', s.cp === 0);
    await h.shot('03_checkpoint');
    // die on purpose: move onto the first slider area is unreliable, so use the 3 s hunter room's spikes? use direct kill
    await h.eval(`(()=>{const s=window.__echo.sim;const hz=s.world.hazards[0];s.body.x=hz.x+hz.width/2;s.body.y=hz.y+hz.height/2;})()`);
    await sleep(200);
    s = await st(h);
    // (hazard of the first room is far below the checkpoint: the bat there is simply below the checkpoint)
    await h.tapTestId('btn-restart');
    await sleep(300);

    // ---- level 37: spikes + hunter, death at the checkpoint
    await openLevel(h, 37);
    s = await st(h);
    const c37 = s.cps[0];
    await tele(h, c37.x, c37.y);
    await sleep(250);
    s = await st(h);
    check('Echo 37: checkpoint reached', s.cp === 0);
    const wt0 = s.wt;
    const el0 = s.elapsed;
    // run into the spike island of the first room? it is below; kill with the wall of the room instead: use a pulse-free death
    await h.eval(`(()=>{const s=window.__echo.sim;const sp=s.world.spikes[0];s.body.x=sp.x+sp.width/2;s.body.y=sp.y+sp.height/2;})()`);
    await sleep(300);
    s = await st(h);
    check('touching spikes ends the run (cause: spike)', s.status === 'dying' && s.cause === 'spike');
    await sleep(1400);
    s = await st(h);
    check('the death flow returns the bat to the LAST CHECKPOINT, not the start', s.status === 'playing' && Math.abs(s.x - c37.x) < 1 && Math.abs(s.y - c37.y) < 1, `(${s.x.toFixed(0)},${s.y.toFixed(0)}) vs (${c37.x},${c37.y})`);
    check('the run timer kept counting through the death', s.elapsed > el0);
    check('the world was rewound to the checkpoint moment', Math.abs(s.wt - wt0) < 0.6, `world time ${s.wt.toFixed(2)} vs ${wt0.toFixed(2)}`);
    await h.tapTestId('btn-restart');
    await sleep(300);
    s = await st(h);
    check('the HUD restart button starts the whole level over (no checkpoint kept)', s.cp === -1 && s.y > c37.y);

    // ---- hunter catch -> Retry Cleaner returns to the checkpoint
    await tele(h, c37.x, c37.y);
    await sleep(250);
    for (let i = 0; i < 40; i++) { s = await st(h); if (s.wt > 3.5) break; await sleep(150); }
    await h.eval(`(()=>{const s=window.__echo.sim;const e=s.enemies.enemies[0].body;s.body.x=e.x;s.body.y=e.y;})()`);
    await sleep(500);
    s = await st(h);
    check('being caught shows the fail screen', s.status === 'dying' && s.cause === 'enemy' && (await h.exists('btn-retry-cleaner')));
    await h.tapTestId('btn-retry-cleaner');
    await sleep(400);
    s = await st(h);
    check('Retry Cleaner respawns at the last checkpoint', s.status === 'playing' && Math.abs(s.y - c37.y) < 1 && s.cp === 0, `y ${s.y.toFixed(0)} vs ${c37.y}`);

    // ---- door consistency on a real level (Echo 38)
    await openLevel(h, 38);
    s = await st(h);
    const c38 = s.cps[0];
    const sw = await h.eval(`(()=>{const s=window.__echo.sim.world.switches[0];return {x:s.x,y:s.y};})()`);
    await tele(h, sw.x + 60, sw.y);
    const sonar = await h.clickTestId('sonar-button');
    await h.touch('touchStart', [{ id: 41, x: sonar.x, y: sonar.y }]);
    await h.touch('touchEnd', []);
    await sleep(500);
    s = await st(h);
    check('Echo 38: the switch opens the door in room 1', s.doors[0] > 7, `timer ${s.doors[0].toFixed(1)}`);
    await tele(h, c38.x, c38.y);
    await sleep(300);
    const doorAtCp = (await st(h)).doors[0];
    await sleep(1500);
    const attBefore = (await st(h)).att;
    await h.eval(`(()=>{const s=window.__echo.sim;const hz=s.world.hazards[0];s.body.x=hz.x+hz.width/2;s.body.y=hz.y+hz.height/2;})()`);
    // read the door the moment the respawn happens (its countdown keeps running afterwards)
    let atRespawn = null;
    for (let i = 0; i < 120 && !atRespawn; i++) {
      await sleep(20);
      const x = await st(h);
      if (x.att > attBefore && x.status === 'playing') atRespawn = x;
    }
    check('after a respawn the door is as it was at the checkpoint', !!atRespawn && atRespawn.doors[0] >= doorAtCp - 0.05 && atRespawn.doors[0] <= doorAtCp + 0.6 /* saved when the checkpoint was touched, a moment before it was read here */, `${doorAtCp.toFixed(2)} vs ${atRespawn && atRespawn.doors[0].toFixed(2)}`);

    // ---- escape level
    await openLevel(h, 46);
    s = await st(h);
    check('Echo 46 is an escape level with the wall behind the start', s.esc && s.wall > s.y, `wall ${s.wall.toFixed(0)}, bat ${s.y.toFixed(0)}`);
    check('the hint warns about the wall', ((await h.text('hint-text')) || '').includes('wall of darkness'), await h.text('hint-text'));
    check('the red warning edge shows when the wall is close', s.threat > 0 || (await h.exists('threat-edge')), `threat ${s.threat.toFixed(2)}`);
    const w1 = s.wall;
    await sleep(1000);
    s = await st(h);
    check('the wall rises at the speed from the level data (55 units/s)', Math.abs(w1 - s.wall - 55) < 12, `${(w1 - s.wall).toFixed(1)} per second`);
    await h.shot('04_escape_wall');
    // dawdle: the wall catches the bat
    let died = null;
    for (let i = 0; i < 60 && !died; i++) {
      await sleep(150);
      const x = await st(h);
      if (x.status === 'dying') died = x;
    }
    check('standing still gets you caught by the wall (cause: escape_wall)', died && died.cause === 'escape_wall');
    await sleep(1500);
    s = await st(h);
    check('an escape death auto-restarts within about a second', s.status === 'playing');
    // checkpoint respawn keeps the wall behind
    const c46 = s.cps[0];
    await tele(h, c46.x, c46.y);
    await sleep(300);
    for (let i = 0; i < 80; i++) {
      await tele(h, c46.x, c46.y);
      const x = await st(h);
      if (x.status === 'dying') break;
      await sleep(250);
    }
    await sleep(1600);
    s = await st(h);
    check('after the respawn the wall is at least 220 units behind the bat (fair checkpoint)', s.status === 'playing' && s.wall - (s.y + 14) >= 219, `gap ${(s.wall - s.y - 14).toFixed(0)}`);
    await h.shot('05_after_respawn');

    // ---- all fifty levels through the real result / save pipeline
    await openLevel(h, 1);
    for (let n = 1; n <= 50; n++) {
      s = await st(h);
      if (!s || s.id !== n) {
        check(`Echo ${n} loaded`, false, JSON.stringify(s && s.id));
        break;
      }
      await toFinish(h);
      const ok = await h.exists('result-stars');
      if (!ok) {
        check(`Echo ${n}: result screen shown`, false);
        break;
      }
      if (n < 50) {
        await h.tapTestId('btn-next');
        await sleep(900);
      }
    }
    check('all 50 levels reached their result screen', (await h.exists('result-stars')) && !(await h.exists('btn-next')), 'Next hidden after Echo 50');
    await h.shot('06_echo50_result');

    // ---- level select: whole game cleared
    await h.tapTestId('btn-home');
    await sleep(700);
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(600);
    txt = await h.eval('document.body.innerText');
    const cleared = txt.match(/\d+ \/ \d+ cleared/g) || [];
    check('every chapter shows all its levels cleared', cleared.length === 3 && cleared.every((c) => { const [a, b] = c.split(' / ').map((x) => parseInt(x, 10)); return a === parseInt(b, 10); }), cleared.join(' | '));
    const save = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('the save has 50 completed levels', Object.values(save.records).filter((r) => r.completed).length === 50);
    await h.shot('07_all_cleared');

    // ---- 50 restarts and frame rate on the tallest escape level
    await h.tapTestId('level-50');
    await sleep(1300);
    const a0 = (await st(h)).att;
    for (let i = 0; i < 50; i++) {
      await h.tapTestId('btn-restart');
      await sleep(40);
    }
    await sleep(300);
    s = await st(h);
    check('50 consecutive restarts on the final escape level: clean state', s.att === a0 + 50 && s.cp === -1, `attempts +${s.att - a0}`);
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<3000)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),max});}requestAnimationFrame(f);})`);
    check('60 FPS on the tallest level with hunters, hazards and the wall', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.max.toFixed(0)} ms`);
    check('no errors logged during the whole run', h.logs.length === 0, h.logs.slice(0, 2).join(' | '));

    // ---- relaunch
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    const save2 = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('relaunch: all 50 levels still cleared', Object.values(save2.records).filter((r) => r.completed).length === 50);
  } catch (e) {
    check('scenario ran to the end without throwing', false, e.stack || String(e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'phase4-results.json'), JSON.stringify(results, null, 2));
    await h.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
