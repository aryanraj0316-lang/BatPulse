/**
 * Phase 7 end-to-end scenario: hidden key + locked door (Echo 36) and safe zones (Echo 33).
 * Usage: node tools/e2e/phase7.js <outDir>   (dev server on :8081)
 * The debug hook teleports the bat for set-up only; the key pick-up, the unlock, hiding, the sonar refill and the timeout
 * run in the real game, and the bat is moved with real touch drags.
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

const seed = () => {
  const records = {};
  for (let i = 1; i <= 50; i++) records[i] = { levelId: i, unlocked: true, completed: i <= 8, stars: i <= 8 ? 2 : 0, bestTime: i <= 8 ? 20 : null, bestMomentum: i <= 8 ? 1.2 : null, ghostRun: false };
  return {
    saveVersion: 2, shards: 0, selectedCharacter: 'bat_rookie', unlockedCharacters: ['bat_rookie'], records,
    hasSeenHeadphonePrompt: true, claimedMilestones: [],
    settings: { sfxVolume: 0.8, musicVolume: 0.5, brightness: 1, hapticsEnabled: true, floatingJoystick: true },
    daily: { lastClaimDay: null, streak: 0 },
  };
};

const st = (h) =>
  h.eval(`(()=>{const e=window.__echo;if(!e)return null;const s=e.sim;return {id:e.def.id,status:s.status,x:s.body.x,y:s.body.y,charges:s.energy.charges,hidden:s.hidden,hideLeft:s.hideLeft,hasKey:s.hasKey,keyTaken:Array.from(s.keyTaken),door:Array.from(s.doorTimer).map(t=>t>0),alerts:s.alertCount,pulses:s.pulsesUsed,zoneIn:s.hiddenZone,keys:e.def.keys||[],zones:e.def.safeZones||[],doors:e.def.doors,enemies:s.enemies.enemies.map(x=>({state:x.state,x:x.body.x,y:x.body.y}))};})()`);
const tele = (h, x, y) => h.eval(`(()=>{const s=window.__echo.sim;s.body.x=${x};s.body.y=${y};s.body.vx=0;s.body.vy=0;})()`);
const text = (h, id) => h.eval(`(()=>{const e=document.querySelector('[data-testid="${id}"]');return e?e.innerText:null;})()`);
async function openLevel(h, n) {
  await h.tapTestId('btn-pause');
  await sleep(250);
  await h.tapTestId('btn-pause-home');
  await sleep(600);
  await h.clickText('SELECT ECHO CHAMBER');
  await sleep(500);
  await h.tapTestId(`level-${n}`);
  await sleep(1400);
}
/** A real drag with one finger: down at (x, y), moves to (x, y + dy) and holds for `ms`, then lifts. */
async function drag(h, x, y, dy, ms) {
  await h.touch('touchStart', [{ id: 5, x, y }]);
  await h.touch('touchMove', [{ id: 5, x, y: y + dy }]);
  await sleep(ms);
  await h.touch('touchEnd', []);
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

    // ================================================================ keys and locked doors (Echo 36)
    await openLevel(h, 36);
    let s = await st(h);
    check('Echo 36 has one hidden key and one locked door', s.id === 36 && s.keys.length === 1 && s.doors.filter((d) => d.keyId).length === 1, JSON.stringify({ keys: s.keys, doors: s.doors.map((d) => d.keyId || d.switchId) }));
    check('no key chip in the HUD at the start', !(await h.exists('hud-key')));
    const door = s.doors.find((d) => d.keyId);
    const key = s.keys[0];

    // without the key the door is a wall
    await tele(h, door.x + door.width / 2, door.y + door.height + 60);
    await sleep(200);
    await drag(h, 300, 600, -60, 1500);
    s = await st(h);
    check('without the key the locked door blocks the way', s.y > door.y + door.height - 2 && !s.door[0], `bat y ${s.y.toFixed(0)}, door bottom ${door.y + door.height}`);
    await h.shot('01_locked_door_blocks');

    // a pulse lights the hidden key
    await tele(h, key.x + 60, key.y + 40);
    await sleep(100);
    await h.eval('window.__echo.sim.firePulse(); true');
    await sleep(450);
    await h.shot('02_key_lit_by_pulse');
    const keyDrawn = await h.eval(`(()=>{const g=document.querySelector('[data-testid="game-canvas"] svg g');return g?g.innerHTML.includes('#FFD866'):false})()`);
    check('a pulse lights the hidden key (gold key drawn)', keyDrawn);

    // flying over the key picks it up
    await tele(h, key.x, key.y + 4);
    await sleep(300);
    s = await st(h);
    check('flying over the key picks it up', s.keyTaken[0] === 1 && s.hasKey, JSON.stringify(s.keyTaken));
    check('the HUD shows the key chip', await h.exists('hud-key'), (await text(h, 'hud-key')) || '');
    await h.shot('03_key_in_hud');

    // with the key, reaching the door opens it for good
    await tele(h, door.x + door.width / 2, door.y + door.height + 60);
    await sleep(200);
    await drag(h, 300, 600, -60, 1700);
    s = await st(h);
    check('with the key the door opens as the bat reaches it, and the bat flies through', s.door[0] && s.y < door.y, `bat y ${s.y.toFixed(0)}, door top ${door.y}`);
    check('the key chip disappears once the key is used', !(await h.exists('hud-key')));
    await h.shot('04_door_unlocked');
    await sleep(9000);
    s = await st(h);
    check('the unlocked door stays open (no timer, unlike a switch door)', s.door[0]);

    // a restart puts everything back
    await h.tapTestId('btn-restart');
    await sleep(400);
    s = await st(h);
    check('a restart locks the door again and puts the key back', !s.door[0] && s.keyTaken[0] === 0 && !s.hasKey);

    // the key hint is shown after the checkpoint hint
    await sleep(9500);
    check('the tutorial hint explains the locked door', /locked/i.test((await text(h, 'hint-text')) || ''), (await text(h, 'hint-text')) || '');

    // ================================================================ safe zones (Echo 33)
    await openLevel(h, 33);
    s = await st(h);
    check('Echo 33 has two safe zones', s.id === 33 && s.zones.length === 2, String(s.zones.length));
    await sleep(1500);
    await h.shot('05_zones_visible');
    const zoneDrawn = await h.eval(`(()=>{const g=document.querySelector('[data-testid="game-canvas"] svg g');return g?g.innerHTML.includes('#7CFFD1'):false})()`);
    check('the zones are always faintly visible (mint outline), without any pulse', zoneDrawn);
    check('the zone hint is shown', /zone/i.test((await text(h, 'hint-text')) || ''), (await text(h, 'hint-text')) || '');
    check('not hidden at the start', !s.hidden && !(await h.exists('hud-hidden')));

    // hide, refill, time out
    const z = s.zones[0];
    await h.eval('window.__echo.sim.energy.restore(1); true');
    await tele(h, z.x + z.width / 2, z.y + z.height / 2);
    await sleep(500);
    s = await st(h);
    check('entering a zone hides the bat', s.hidden && s.zoneIn === 0, `hidden ${s.hidden}`);
    check('the HUD shows HIDDEN with the seconds left', /HIDDEN \d+s/.test((await text(h, 'hud-hidden')) || ''), (await text(h, 'hud-hidden')) || '');
    await h.shot('06_hiding');

    // a real tap while hiding: the pulse works and no hunter hears it
    const alertsBefore = s.alerts;
    const pBefore = s.pulses;
    await h.touch('touchStart', [{ id: 9, x: 80, y: 420 }]);
    await sleep(60);
    await h.touch('touchEnd', []);
    await sleep(300);
    s = await st(h);
    check('a tap inside the zone still sends a pulse', s.pulses === pBefore + 1, `${pBefore} -> ${s.pulses}`);
    check('and no hunter heard it', s.alerts === alertsBefore, `alerts ${alertsBefore} -> ${s.alerts}`);

    const c0 = s.charges;
    await sleep(3200);
    s = await st(h);
    check('the sonar refills while hiding (one charge about every 2.5 s)', s.charges >= c0 + 1, `${c0} -> ${s.charges}`);
    check('the HUD shows the new sonar count', new RegExp(`SONAR: ${s.charges} / 5`).test((await text(h, 'hud-sonar')) || ''), (await text(h, 'hud-sonar')) || '');

    await sleep(5500); // past the 8 s limit
    s = await st(h);
    check('after 8 s the bat is visible again (the zone rests)', !s.hidden && !(await h.exists('hud-hidden')), `hidden ${s.hidden}`);
    await h.shot('07_expired');

    // leaving by yourself
    await tele(h, z.x + z.width + 80, z.y + z.height / 2);
    await sleep(300);
    s = await st(h);
    check('leaving the zone ends the hiding', !s.hidden);

    // fps with zones, hunters and the HUD chips
    const fps = await h.eval(`new Promise(res=>{let n=0,max=0,last=performance.now();const t0=last;function f(t){n++;max=Math.max(max,t-last);last=t;if(t-t0<2500)requestAnimationFrame(f);else res({fps:n/((t-t0)/1000),max});}requestAnimationFrame(f);})`);
    check('60 FPS on the level with zones', fps.fps >= 55, `${fps.fps.toFixed(1)} FPS, worst frame ${fps.max.toFixed(0)} ms`);
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
