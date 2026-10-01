// Headless screenshots of the running viewer, via the Chrome DevTools Protocol.
// Waits until each structure is built and on screen.
//
//   (cd deploy && python3 -m http.server 8817) &
//   node tests/shoot.mjs [outDir] [id[:hash-extra][,…]] [width] [height]
//
// Also reports any console errors from the page.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const out = process.argv[2] || `${homedir()}/cvshots`;
const ids = (process.argv[3] || 'na,cu,mg,nacl,cscl,zns,caf2,diamond,graphite').split(',');
const W = +(process.argv[4] || 1400), H = +(process.argv[5] || 900);
const BASE = process.env.BASE || 'http://localhost:8817/';
mkdirSync(out, { recursive: true });

const port = 9334;
const chrome = spawn('chromium-browser', [
  '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, `--user-data-dir=${homedir()}/.cv-chrome`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value).join(' '));
});
const send = (method, params = {}) => new Promise((r) => {
  const id = ++seq;
  pending.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

for (const spec of ids) {
  const [id, setup] = spec.split(':');
  await send('Page.navigate', { url: `${BASE}?shot#${id}` });
  const t0 = Date.now();
  let shown = '';
  while (Date.now() - t0 < 30000) {
    await sleep(200);
    shown = await evaluate('document.body.dataset.shown || ""');
    if (shown.startsWith(id)) break;
  }
  const ms = Date.now() - t0;
  // stop the spin so the picture is the default view, then run optional setup
  await evaluate("{ const s = document.getElementById('spin'); s.checked = false; s.dispatchEvent(new Event('change')); }");
  if (setup) await evaluate(decodeURIComponent(setup));
  await sleep(900);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${id}${process.env.TAG || ''}.png`, Buffer.from(data, 'base64'));
  console.log(`${id}: shown="${shown}" after ${ms} ms`);
}
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
ws.close();
chrome.kill();
