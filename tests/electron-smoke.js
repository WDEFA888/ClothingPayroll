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
    const dialogs = [];
    ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } return; } if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); call('Page.handleJavaScriptDialog', {accept: true}).catch(e => errors.push(e.message)); } if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails)); if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text); });
    await call('Runtime.enable'); await call('Log.enable'); await call('Page.enable');
    async function evaluate(expression) { const r = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: true}); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
    async function wait(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); } throw new Error('等待失败 ' + expression); }
    async function click(selector) {
      const pos = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('元素不存在');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await call('Input.dispatchMouseEvent', {type:'mousePressed', ...pos, button:'left', clickCount:1});
      await call('Input.dispatchMouseEvent', {type:'mouseReleased', ...pos, button:'left', clickCount:1});
    }
    async function fill(selector, value) { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
    async function screenshot(name) {
      await evaluate('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
      const img = await call('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(work, name), Buffer.from(img.data, 'base64'));
    }
    const state = () => evaluate("JSON.parse(localStorage.getItem('yizhang-payroll-v1'))");
    await wait("document.readyState === 'complete' && !!document.querySelector('.app-shell')");
    const title = await evaluate('document.title');
    assert.ok(title.includes('衣账'), '窗口标题应包含衣账：' + title);
    assert.equal(await evaluate("typeof window.desktop?.saveFile"), 'function');
    assert.equal(await evaluate("typeof window.desktop?.loadData"), 'function');
    assert.equal(await evaluate("typeof window.desktop?.saveData"), 'function');
    // 数据镜像文件读写可用。
    assert.equal(await evaluate("window.desktop.saveData('__mirror__').then(()=>window.desktop.loadData())"), '__mirror__');
    assert.equal(await evaluate("window.desktop.saveData('').then(()=>window.desktop.loadData())"), null);
    // localStorage 读写可用。
    await evaluate("localStorage.setItem('__smoke__','ok')");
    assert.equal(await evaluate("localStorage.getItem('__smoke__')"), 'ok');
    await evaluate("localStorage.removeItem('__smoke__')");
    // 主界面渲染（侧栏品牌与汇总卡片）。
    assert.ok((await evaluate("document.querySelector('.brand')?.textContent")).includes('衣账'));
    assert.ok(await evaluate("!!document.querySelector('.summary-bar')"));
    // 在隔离的真实桌面窗口中建档、键盘输入提成、保存，再检查跨月不串值。
    await click('.nav-item[data-view="employees"]');await click('#add-employee');
    await fill('#employee-name', '虚构·桌面手填测试');await fill('#employee-base', '3000');
    await click('#employee-form button[type=submit]');await wait("!document.querySelector('#employee-dialog').open");
    await click('.nav-item[data-view="payroll"]');await click('#generate');
    await wait("document.querySelectorAll('[data-edit-salary]').length===1");
    const month = await evaluate("document.querySelector('#month').value");
    await click('[data-edit-salary]');await wait("document.querySelector('#salary-dialog').open");
    assert.equal(await evaluate("document.querySelector('input[name=\"commission-mode\"]:checked').value"), 'fixed');
    assert.equal(await evaluate("document.querySelector('#commission-fixed').value"), '0.00');
    await click('#commission-fixed');
    await call('Input.dispatchKeyEvent', {type:'keyDown', key:'a', code:'KeyA', windowsVirtualKeyCode:65, modifiers:2});
    await call('Input.dispatchKeyEvent', {type:'keyUp', key:'a', code:'KeyA', windowsVirtualKeyCode:65, modifiers:2});
    await call('Input.insertText', {text:'1234.56'});
    assert.equal(await evaluate("document.querySelector('#commission-result').textContent"), '1234.56');
    assert.equal(await evaluate("document.querySelector('#salary-commission').value"), '0.00');
    await screenshot('manual-commission.png');await click('#commission-apply');
    assert.equal(await evaluate("document.querySelector('#salary-commission').value"), '1234.56');
    assert.equal((await state()).months[month].rows[0].commission, 0);
    await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
    assert.equal((await state()).months[month].rows[0].commission, 123456);
    await click('[data-edit-salary]');
    assert.equal(await evaluate("document.querySelector('#commission-fixed').value"), '1234.56');
    await fill('#commission-fixed', '-1');
    assert.equal(await evaluate("document.querySelector('#commission-result').textContent"), '算式有误');
    await click('#commission-apply');await wait("document.querySelector('#salary-dialog').open");
    assert.equal(await evaluate("document.querySelector('#salary-commission').value"), '1234.56');
    assert.ok(dialogs.some(text=>text.includes('不能为负数')));
    await click('#salary-dialog .dialog-footer [data-close]');
    await click('[data-confirm]');await click('#lock');await wait("document.querySelector('#lock-badge').textContent==='已锁账'");
    await click('#lock');await wait("document.querySelector('#prompt-dialog').open");
    await fill('#prompt-input', '虚构测试：重新核对提成');await click('#prompt-submit');
    await wait("!document.querySelector('#prompt-dialog').open && document.querySelector('#lock-badge').textContent==='待核对'");
    const nextMonth = month.endsWith('-12') ? (Number(month.slice(0,4))+1)+'-01' : month.slice(0,5)+String(Number(month.slice(5))+1).padStart(2,'0');
    await fill('#month', nextMonth);await click('#generate');
    await wait("document.querySelectorAll('[data-edit-salary]').length===1");
    await click('[data-edit-salary]');
    assert.equal(await evaluate("document.querySelector('#commission-fixed').value"), '0.00');
    await click('#salary-dialog .dialog-footer [data-close]');
    await fill('#month', month);await click('[data-edit-salary]');
    assert.equal(await evaluate("document.querySelector('#commission-fixed').value"), '1234.56');
    await click('#salary-dialog .dialog-footer [data-close]');
    console.log('PASS 桌面真实交互：默认手动、键盘输入、应用与保存边界、负数拒绝、跨月隔离及原因解锁');
    const listPages = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t => t.type === 'page');
    const beforePages = await listPages();
    await evaluate("window.open('https://example.com/','_blank')");
    await delay(500);
    assert.equal((await listPages()).length, beforePages.length, '外部链接不应打开新窗口');
    await evaluate("location.href='https://example.com/'");
    await delay(400);
    assert.equal(await evaluate('location.protocol'), 'file:', '页面不应跳转离开本程序');
    await evaluate("window.open('工资助手.html?demo=1','_blank')");
    let demoPage;
    for (let i = 0; i < 40; i++) { demoPage = (await listPages()).find(t => t.url.includes('demo=1')); if (demoPage) break; await delay(100); }
    assert.ok(demoPage, '演示窗口应能正常打开');
    await fetch(`http://127.0.0.1:${port}/json/close/${demoPage.id}`).catch(() => {});
    const img = await call('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync(path.join(work, packaged ? 'packaged-app.png' : 'electron-app.png'), Buffer.from(img.data, 'base64'));
    assert.deepEqual(errors, [], '存在渲染进程错误');
    console.log((packaged ? 'PACKAGED' : 'ELECTRON') + ' OK', work);
    await call('Browser.close', {}, undefined).catch(() => {});
    process.exitCode = 0;
  } finally {
    if (ws) ws.close();
    try { child.kill(); } catch (_) {}
    // 确保杀掉 Electron 的整棵进程树，避免残留进程锁住 app.asar
    try { require('node:child_process').execSync('taskkill /F /T /PID ' + child.pid + ' >nul 2>&1'); } catch (_) {}
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
