#!/usr/bin/env node
// Reliable kanban board screenshot.
// The board is client-rendered: chromium's --screenshot fires at the load event,
// BEFORE React finishes the /api/board fetch, so it often captures "Loading board...".
// This drives chromium over the DevTools protocol and WAITS until the board has
// actually rendered (columns present, no loading text) before capturing.
// No external deps — uses Node 22's built-in global WebSocket.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const URL  = process.env.SHOT_URL || 'http://localhost:3001';
const OUT  = process.env.SHOT_OUT || '/tmp/kanban-board.png';
const W    = parseInt(process.env.SHOT_W || '1600', 10);
const H    = parseInt(process.env.SHOT_H || '1700', 10);
const PORT = 9222 + Math.floor(Math.random() * 2000);

const httpGet = (path) => new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}${path}`, (r) => {
    let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
  }).on('error', rej);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chrome = spawn('/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      try { const t = JSON.parse(await httpGet('/json')); target = t.find((x) => x.type === 'page'); if (target) break; } catch (e) {}
      await sleep(250);
    }
    if (!target) throw new Error('devtools endpoint never came up');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0; const pending = {};
    const send = (method, params = {}) => { const mid = ++id; ws.send(JSON.stringify({ id: mid, method, params })); return new Promise((r) => (pending[mid] = r)); };
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL });

    let rendered = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      const r = await send('Runtime.evaluate', {
        expression: "(()=>{const t=document.body?document.body.innerText:'';return !!t && !t.includes('Loading board') && /Backlog/.test(t) && /Done/.test(t);})()",
        returnByValue: true,
      });
      if (r && r.result && r.result.value) { rendered = true; break; }
    }
    await sleep(600); // let card layout settle

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log(`${rendered ? 'RENDERED' : 'TIMEOUT'} -> ${OUT}`);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
