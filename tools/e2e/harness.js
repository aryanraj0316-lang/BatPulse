/**
 * Minimal end-to-end harness: drives the web build in headless Edge/Chrome through the DevTools protocol
 * with REAL touch/key input, reads the DOM and takes screenshots.
 *
 * Requires: `npm run web` running (default http://localhost:8081) and a Chromium browser.
 * Override the browser with EDGE_PATH, the app URL with APP_URL.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) =>
  new Promise((res, rej) =>
    http
      .get(url, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => res(JSON.parse(d)));
      })
      .on('error', rej),
  );

async function launch({ outDir, width = 390, height = 844, port = 9333, fresh = true, profile } = {}) {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chromium browser found; set EDGE_PATH');
  fs.mkdirSync(outDir, { recursive: true });
  const profileDir = profile || path.join(outDir, 'profile');
  if (fresh) fs.rmSync(profileDir, { recursive: true, force: true });
  const proc = spawn(
    exe,
    ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, `--user-data-dir=${profileDir}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  await sleep(2500);
  const tabs = await getJson(`http://localhost:${port}/json`);
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));

  let id = 0;
  const pending = {};
  const logs = [];
  ws.on('message', (m) => {
    const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg.result || msg.error);
      delete pending[msg.id];
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('EXCEPTION: ' + (d.exception?.description || d.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400));
    }
  });
  // every protocol call must answer within 20 s, otherwise fail loudly instead of hanging the whole run
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      const timer = setTimeout(() => {
        delete pending[i];
        reject(new Error(`CDP call timed out: ${method} ${JSON.stringify(params).slice(0, 120)}`));
      }, 20000);
      pending[i] = (v) => {
        clearTimeout(timer);
        resolve(v);
      };
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  const h = {
    width,
    height,
    logs,
    sleep,
    send,
    /** Navigates and (for http pages) waits until the app has really rendered something, however long a cold bundle takes. */
    async goto(url) {
      await send('Page.navigate', { url });
      if (!url.startsWith('http')) return;
      const t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        await sleep(1500);
        try {
          const len = await h.eval('document.body ? document.body.innerText.length : 0');
          if (len > 20) return;
        } catch {
          // the page is still busy loading its bundle: keep waiting
        }
      }
      throw new Error('page did not render within 180 s');
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    },
    async shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.data, 'base64'));
    },
    /** touches: [{id,x,y}] = every finger currently down. */
    touch: (type, touches) => send('Input.dispatchTouchEvent', { type, touchPoints: touches.map((t) => ({ x: t.x, y: t.y, id: t.id })) }),
    key: (type, code, key) => send('Input.dispatchKeyEvent', { type, code, key: key || code, windowsVirtualKeyCode: 0 }),
    /** Text of the element with this testID (RN-web renders testID as data-testid). */
    text: (testID) => h.eval(`(document.querySelector('[data-testid="${testID}"]')||{}).innerText||null`),
    exists: (testID) => h.eval(`!!document.querySelector('[data-testid="${testID}"]')`),
    // scrolls the element into view first (like a player would), then returns its centre
    clickTestId: (testID) =>
      h.eval(`(()=>{const e=document.querySelector('[data-testid="${testID}"]');if(!e)return false;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`),
    /** Real tap (touch down + up) in the middle of an element. */
    async tapTestId(testID) {
      const p = await h.clickTestId(testID);
      if (!p) return false;
      await h.touch('touchStart', [{ id: 90, x: p.x, y: p.y }]);
      await h.touch('touchEnd', []);
      return true;
    },
    async clickText(txt) {
      return h.eval(
        `(()=>{const els=[...document.querySelectorAll('div,span')].filter(e=>e.children.length===0&&e.textContent.trim().toUpperCase().includes(${JSON.stringify(txt.toUpperCase())}));if(!els.length)return false;const t=els[els.length-1];['mousedown','mouseup','click'].forEach(n=>t.dispatchEvent(new MouseEvent(n,{bubbles:true})));return true;})()`,
      );
    },
    /**
     * Writes a save into the page's storage in the game's envelope format (checksummed), so a scenario can start
     * from any progress state. Call before (re)loading the app.
     */
    async seedSave(save) {
      const body = JSON.stringify(save);
      await h.eval(`(()=>{const body=${JSON.stringify(body)};let h=0x811c9dc5;for(let i=0;i<body.length;i++){h^=body.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}const cs=h.toString(16).padStart(8,'0');const env=JSON.stringify({saveVersion:${save.saveVersion},checksum:cs,body});localStorage.setItem('echo.save.primary',env);localStorage.setItem('echo.save.backup',env);})()`);
    },
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill();
    },
  };
  return h;
}

module.exports = { launch, sleep };
