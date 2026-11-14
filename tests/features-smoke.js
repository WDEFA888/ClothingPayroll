/* 新增功能冒烟测试：待办横幅、员工工资历史、工资占比、年度导出按钮。 */
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
  const profile = path.join(require('node:os').tmpdir(), 'features-smoke-' + Date.now());
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
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
    await call('Page.navigate',{url:pathToFileURL(path.join(root,'工资助手.html')).href + '?demo=1'});
    for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('payroll-todo')"))break;await delay(100);}
    // 1. 待办横幅
    const todoVisible = await evaluate("!document.getElementById('payroll-todo').hidden");
    const todoText = await evaluate("document.getElementById('payroll-todo').textContent");
    assert.ok(todoVisible,'待办横幅应显示');
    assert.match(todoText,/发薪前待办/,'待办横幅应有标题');
    // 2. 年度导出按钮
    assert.ok(await evaluate("!!document.getElementById('export-annual')"),'年度导出按钮应存在');
    // 3. 员工工资历史
    await evaluate("document.querySelector('[data-view=\"employees\"]').click()");
    await evaluate("document.querySelector('[data-wage-history]').click()");
    const histOpen = await evaluate("document.getElementById('history-dialog').open");
    const histHasSvg = await evaluate("document.getElementById('history-chart').innerHTML.includes('<svg')");
    const histRows = await evaluate("document.getElementById('history-body').querySelectorAll('tr').length");
    assert.ok(histOpen,'工资历史弹窗应打开');
    assert.ok(histHasSvg,'工资历史应有折线图');
    assert.ok(histRows>=1,'工资历史表应有行');
    await evaluate("document.getElementById('history-dialog').close()");
    // 4. 工资占比
    await evaluate("document.querySelector('[data-view=\"profit\"]').click()");
    const month = await evaluate("document.getElementById('profit-month').value");
    await evaluate("document.getElementById('profit-revenue').value='100000';document.getElementById('profit-revenue').dispatchEvent(new Event('input',{bubbles:true}))");
    const ratioText = await evaluate("document.getElementById('profit-ratio').textContent.trim()");
    assert.match(ratioText,/%$/,'工资占比应显示百分比，实际：' + ratioText);
    assert.deepEqual(errors, [], '页面不应有运行时错误: ' + errors.join(' | '));
    console.log('features-smoke OK：待办横幅、年度导出、工资历史、工资占比全部正常，占比=' + ratioText);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    child.kill();
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
