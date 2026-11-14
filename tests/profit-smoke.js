/* 盈利分析页面的轻量冒烟测试：确认新视图渲染、录入并生成折线图，无运行时错误。 */
'use strict';
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const delay = ms => new Promise(r => setTimeout(r, ms));
const root = path.resolve(__dirname, '..');
const browserPath = process.env.PAYROLL_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
async function freePort() { const s = net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const port=s.address().port; await new Promise(r=>s.close(r)); return port; }
(async()=>{
  const port = await freePort();
  const profile = path.join(require('node:os').tmpdir(), 'profit-smoke-' + Date.now());
  const child = spawn(browserPath, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','--disable-extensions','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'], {stdio:'ignore'});
  let ws;
  try {
    let version;
    for(let i=0;i<100;i++){try{version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();break;}catch(_){await delay(100);}}
    assert.ok(version,'Chrome 未启动');
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let serial=0, session; const pending=new Map(), errors=[];
    function call(method,params={},sid=session){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP 超时 '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
    ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
      if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));
      if(message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message.params.entry.text);
    });
    const target=await call('Target.createTarget',{url:'about:blank'},null);
    session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
    await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
    async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
    await call('Page.navigate',{url:pathToFileURL(path.join(root,'工资助手.html')).href});
    for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && !!window.PayrollCore && !!document.getElementById('profit-chart')"))break;await delay(100);}
    const navCount = await evaluate("document.querySelectorAll('.nav-item').length");
    const hasView = await evaluate("!!document.getElementById('view-profit')");
    const emptyText = await evaluate("document.getElementById('profit-chart').textContent");
    assert.equal(navCount,6,'导航项应为 6 个');
    assert.ok(hasView,'盈利分析视图应存在');
    assert.match(emptyText,/还没有盈利数据/,'空状态应显示提示');
    await evaluate("document.querySelector('[data-view=\"profit\"]').click()");
    await evaluate("document.getElementById('profit-month').value='2026-11';document.getElementById('profit-month').dispatchEvent(new Event('change'))");
    await evaluate("document.getElementById('profit-revenue').value='100000';document.getElementById('profit-goods').value='40000';document.getElementById('profit-other').value='5000';document.getElementById('profit-save').click()");
    const chartHasSvg = await evaluate("document.getElementById('profit-chart').innerHTML.includes('<svg')");
    const rowCount = await evaluate("document.getElementById('profit-body').querySelectorAll('tr').length");
    const profitCell = await evaluate("document.querySelector('#profit-body tr td:nth-child(6)').textContent.trim()");
    const saved = await evaluate("JSON.parse(localStorage.getItem('yizhang-payroll-v1')).profits['2026-11']");
    assert.ok(chartHasSvg,'保存后应出现 SVG 折线图');
    assert.equal(rowCount,1,'应有一行历史盈利');
    assert.equal(profitCell,'55000.00','盈利 = 100000-40000-5000-0');
    assert.equal(saved.revenue,10000000);
    assert.deepEqual(errors, [], '页面不应有运行时错误: ' + errors.join(' | '));
    console.log('profit-smoke OK：导航 ' + navCount + ' 项、视图存在、空状态正常、录入后生成折线图且盈利计算正确');
  } finally {
    try { ws && ws.close(); } catch (_) {}
    child.kill();
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
