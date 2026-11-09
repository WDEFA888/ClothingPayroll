/* 用 Node 原生 WebSocket + Chrome DevTools Protocol 驱动 Electron，验证桌面版能正常打开与存取数据。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const delay = ms => new Promise(r => setTimeout(r, ms));
const desktopRoot = path.resolve(__dirname, '..', 'desktop');
const work = path.join(__dirname, 'browser-artifacts', 'electron-' + Date.now());
fs.mkdirSync(work, {recursive: true});
const packaged = process.argv.includes('--packaged');
const electronBin = packaged
  ? (process.env.ELECTRON_EXE || path.join(desktopRoot, 'dist', 'win-unpacked', '衣账工资助手.exe'))
  : (process.env.ELECTRON_BIN || path.join(desktopRoot, 'node_modules', 'electron', 'dist', 'electron.exe'));
async function freePort() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
(async () => {
  const port = await freePort();
  const profile = path.join(work, 'profile-' + Date.now());
  const args = [
    ...(packaged ? [] : ['.']),
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--no-first-run', '--disable-gpu'
  ];
  const child = spawn(electronBin, args, {cwd: desktopRoot, stdio: 'ignore'});
  let ws;
  try {
    let version;
    for (let i = 0; i < 100; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (_) { await delay(100); } }
    assert.ok(version, 'Electron 未启动');
    // 找到已加载的应用页面 target。
    let page;
    for (let i = 0; i < 100; i++) {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = targets.find(t => t.type === 'page' && /^file:/.test(t.url));
      if (page) break; await delay(100);
    }
    if (!page) {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      assert.fail('未找到应用页面 target: ' + JSON.stringify(targets));
    }
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
    let serial = 0; const pending = new Map(); const errors = [];
    function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时 ' + method)); }, 15000); pending.set(id, {resolve, reject, timer}); ws.send(JSON.stringify({id, method, params})); }); }
    ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } return; } if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails)); if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text); });
    await call('Runtime.enable'); await call('Log.enable'); await call('Page.enable');
    async function evaluate(expression) { const r = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: true}); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
    async function wait(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } throw new Error('等待失败 ' + expression); }
    await wait("document.readyState === 'complete' && !!document.querySelector('.app-shell')");
    const title = await evaluate('document.title');
    assert.ok(title.includes('衣账'), '窗口标题应包含衣账：' + title);
    assert.equal(await evaluate("typeof window.desktop?.saveFile"), 'function');
    // localStorage 读写可用。
    await evaluate("localStorage.setItem('__smoke__','ok')");
    assert.equal(await evaluate("localStorage.getItem('__smoke__')"), 'ok');
    await evaluate("localStorage.removeItem('__smoke__')");
    // 主界面渲染（侧栏品牌与汇总卡片）。
    assert.ok((await evaluate("document.querySelector('.brand')?.textContent")).includes('衣账'));
    assert.ok(await evaluate("!!document.querySelector('.summary-bar')"));
    const img = await call('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync(path.join(work, packaged ? 'packaged-app.png' : 'electron-app.png'), Buffer.from(img.data, 'base64'));
    assert.deepEqual(errors, [], '存在渲染进程错误');
    console.log((packaged ? 'PACKAGED' : 'ELECTRON') + ' OK', work);
    await call('Browser.close', {}, undefined).catch(() => {});
    process.exit(0);
  } finally { if (ws) ws.close(); child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
