/**
 * Phase 2 end-to-end scenario: menus, level select, settings, and the Echo 06-20 mechanics in a real browser.
 * Usage: node tools/e2e/phase2.js <outDir>   (dev server on :8081)
 * Gameplay solvability of every level is proven separately by the simulation bots (src/__tests__/chapter1.test.ts);
 * here the debug hook moves the bat to the ring so the real UI pipeline (result, save, unlock) runs for all 20 levels.
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
  h.eval(`(()=>{const e=window.__echo;if(!e)return null;const s=e.sim;return {id:e.def.id,status:s.status,x:s.body.x,y:s.body.y,att:s.attempt,charges:s.energy.charges,pulses:s.pulsesUsed,cause:s.failCause,door:Array.from(s.doorTimer),taken:Array.from(s.pickupTaken),elapsed:s.elapsed};})()`);
const body = (h) => h.eval('document.body.innerText');
const attr = (h, id, a) => h.eval(`(document.querySelector('[data-testid="${id}"]')||{getAttribute(){return null}}).getAttribute('${a}')`);

async function tapAt(h, x, y, id = 40) {
  await h.touch('touchStart', [{ id, x, y }]);
  await h.touch('touchEnd', []);
}

async function sonarTap(h) {
  const p = await h.clickTestId('sonar-button');
  await tapAt(h, p.x, p.y, 41);
}

/** Debug-only: put the bat on the finish ring so the normal finish/result/save pipeline runs. */
async function reachFinish(h) {
  await h.eval(`(()=>{const e=window.__echo;const f=e.sim.world.finish;e.sim.body.x=f.x;e.sim.body.y=f.y;})()`);
  await sleep(500);
}

(async () => {
  const h = await launch({ outDir: OUT, fresh: true });
  try {
    await h.goto(APP);
    await sleep(20000);
    await h.clickText('INITIALIZE ACOUSTIC');
    await sleep(3200);

    // ---- main menu
    await h.tapTestId('btn-pause');
    await sleep(300);
    await h.tapTestId('btn-pause-home');
    await sleep(700);
    let txt = await body(h);
    check('main menu offers Play, Level Select and Settings', txt.includes('DEPLOY ECHO') && txt.includes('SELECT ECHO CHAMBER') && txt.includes('SETTINGS'));
    await h.shot('01_menu');

    // ---- level select: chapter, stars, locks
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    txt = await body(h);
    check('level select shows Chapter 1 "The Dark Cavern"', txt.includes('THE DARK CAVERN') && txt.includes('CHAPTER 1'));
    check('level select lists Echo 01..20', ['01', '10', '20'].every((n) => txt.includes(n)));
    check('only Echo 01 is open on a fresh save', (await attr(h, 'level-1', 'aria-disabled')) !== 'true' && (await attr(h, 'level-2', 'aria-disabled')) === 'true' && (await attr(h, 'level-20', 'aria-disabled')) === 'true');
    await h.shot('02_level_select');
    await h.tapTestId('btn-select-back');
    await sleep(500);

    // ---- settings: sliders + toggles persist
    await h.clickText('SETTINGS');
    await sleep(500);
    const sfx = await h.clickTestId('slider-sfx');
    const box = await h.eval(`(()=>{const r=document.querySelector('[data-testid="slider-sfx"]').getBoundingClientRect();return {x:r.x,w:r.width,y:r.y+r.height/2};})()`);
    await tapAt(h, box.x + box.w * 0.25, box.y);
    await sleep(300);
    const bright = await h.eval(`(()=>{const r=document.querySelector('[data-testid="slider-brightness"]').getBoundingClientRect();return {x:r.x,w:r.width,y:r.y+r.height/2};})()`);
    await tapAt(h, bright.x + bright.w * 0.75, bright.y);
    await sleep(300);
    await h.tapTestId('switch-haptics');
    await sleep(300);
    txt = await body(h);
    check('SFX slider sets ~25%', /Effects volume[\s\S]{0,40}2[0-9]%/.test(txt), (txt.match(/Effects volume[\s\S]{0,30}/) || [''])[0].replace(/\n/g, ' '));
    check('brightness slider sets ~125%', /Brightness[\s\S]{0,40}1[12][0-9]%/.test(txt));
    await h.shot('03_settings');
    const save = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('settings are saved', Math.abs(save.settings.sfxVolume - 0.25) < 0.06 && save.settings.brightness > 1.1 && save.settings.hapticsEnabled === false, JSON.stringify(save.settings));
    await h.tapTestId('btn-settings-back');
    await sleep(400);

    // ---- full flow Menu -> Level Select -> Play -> Result for all 20 levels
    await h.clickText('DEPLOY ECHO');
    await sleep(1500);
    let s = await st(h);
    check('Play starts the furthest unlocked level (Echo 01)', s && s.id === 1);
    for (let n = 1; n <= 20; n++) {
      s = await st(h);
      if (!s || s.id !== n) {
        check(`Echo ${n} loaded`, false, JSON.stringify(s));
        break;
      }
      if (n === 6) {
        // hazards stay hidden until pulsed, then glow
        const before = await h.eval(`(()=>{const s=window.__echo.sim;const i=s.world.revealables.findIndex(r=>r.kind==='hazard');return s.reveal.glow[i];})()`);
        // move next to the slider so the pulse reaches it
        await h.eval(`(()=>{const e=window.__echo;const hz=e.sim.world.hazards[0];e.sim.body.x=hz.x;e.sim.body.y=hz.y+120;})()`);
        await sonarTap(h);
        await sleep(450);
        const after = await h.eval(`(()=>{const s=window.__echo.sim;const i=s.world.revealables.findIndex(r=>r.kind==='hazard');return s.reveal.glow[i];})()`);
        check('Echo 06: the slider is dark until a pulse reveals it', before === 0 && after > 0.3, `${before} -> ${after.toFixed(2)}`);
        await h.shot('04_slider_revealed');
        await h.tapTestId('btn-restart');
        await sleep(300);
      }
      if (n === 9) {
        // blade kills with cause hazard
        await h.eval(`(()=>{const e=window.__echo;const hz=e.sim.world.hazards[0];e.sim.body.x=hz.x+hz.width/2;e.sim.body.y=hz.y+hz.height/2;})()`);
        let dead = null;
        for (let i = 0; i < 40 && !dead; i++) {
          await sleep(30);
          const x = await st(h);
          if (x.status === 'dying') dead = x;
        }
        check('Echo 09: touching the blade kills (cause: hazard)', dead && dead.cause === 'hazard');
        await h.shot('05_blade_death');
        await sleep(1400);
        s = await st(h);
        check('Echo 09: auto-restart after a hazard death', s.status === 'playing');
      }
      if (n === 13) {
        // spend a pulse, then pick up a refill
        await sonarTap(h);
        await sleep(300);
        const used = await st(h);
        await h.eval(`(()=>{const e=window.__echo;const p=e.sim.world.pickups[0];e.sim.body.x=p.x;e.sim.body.y=p.y;})()`);
        await sleep(300);
        const got = await st(h);
        check('Echo 13: a cyan diamond refills one pulse (fixed mode)', got.charges === used.charges + 1 && got.taken[0] === 1, `${used.charges} -> ${got.charges}`);
        await h.tapTestId('btn-restart');
        await sleep(300);
      }
      if (n === 14) {
        // switch + door with countdown, pause freezes it
        await h.eval(`(()=>{const e=window.__echo;const sw=e.sim.world.switches[0];e.sim.body.x=sw.x-60;e.sim.body.y=sw.y;})()`);
        await sleep(300);
        await sonarTap(h);
        await sleep(600);
        let d = await st(h);
        check('Echo 14: pulsing the switch opens the door', d.door[0] > 7, `timer ${d.door[0].toFixed(1)}`);
        await h.shot('06_door_open');
        await h.tapTestId('btn-pause');
        await sleep(300);
        const t1 = (await st(h)).door[0];
        await sleep(1200);
        const t2 = (await st(h)).door[0];
        check('pausing during a door timer freezes it', Math.abs(t1 - t2) < 0.02, `${t1.toFixed(2)} -> ${t2.toFixed(2)}`);
        await h.tapTestId('btn-resume');
        await sleep(8800);
        d = await st(h);
        check('the door closes again after 8 s', d.door[0] === 0, `timer ${d.door[0]}`);
      }
      await reachFinish(h);
      check(`Echo ${String(n).padStart(2, '0')}: result screen shown`, await h.exists('result-stars'), (await h.text('result-shards')) || '');
      if (n === 6) await h.shot('07_result');
      if (n < 20) {
        await h.tapTestId('btn-next');
        await sleep(900);
      }
    }
    check('after Echo 20 the game continues: Next leads into Chapter 2', await h.exists('btn-next'));

    // ---- home, level select shows progress
    await h.tapTestId('btn-home');
    await sleep(700);
    await h.clickText('SELECT ECHO CHAMBER');
    await sleep(500);
    txt = await body(h);
    check('level select shows 20 / 20 cleared', txt.includes('20 / 20 cleared'), (txt.match(/\d+ \/ \d+ cleared/) || [''])[0]);
    check('every level is open now', (await attr(h, 'level-20', 'aria-disabled')) !== 'true');
    await h.shot('08_level_select_done');
    check('no errors logged during the whole flow', h.logs.length === 0, h.logs.slice(0, 2).join(' | '));

    // ---- relaunch keeps everything (settings + progress)
    await h.goto('about:blank');
    await sleep(500);
    await h.goto(APP);
    await sleep(15000);
    const save2 = JSON.parse(JSON.parse(await h.eval(`localStorage.getItem('echo.save.primary')`)).body);
    check('relaunch: all 20 levels still cleared', Object.values(save2.records).filter((r) => r.completed).length === 20);
    check('relaunch: settings persisted', Math.abs(save2.settings.sfxVolume - 0.25) < 0.06 && save2.settings.hapticsEnabled === false);

    // ---- frame rate on the most crowded level with everything lit
    await sleep(2500);
    s = await st(h);
    await h.eval(`(()=>{const e=window.__echo;for(let i=0;i<3;i++){e.sim.energy.reset();e.sim.step(0.1);e.sim.firePulse();}})()`);
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<3000)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),max});}requestAnimationFrame(f);})`);
    check('60 FPS with pulses lighting the level', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.max.toFixed(0)} ms (level ${s && s.id})`);
  } catch (e) {
    check('scenario ran to the end without throwing', false, e.stack || String(e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'phase2-results.json'), JSON.stringify(results, null, 2));
    await h.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
