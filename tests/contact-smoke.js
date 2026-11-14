/* 员工联系方式冒烟测试：档案表有联系方式列，编辑弹窗有手机号/微信号且非必填。 */
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
  const profile = path.join(require('node:os').tmpdir(), 'contact-smoke-' + Date.now());
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
    for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete' && !!document.getElementById('employees-body')"))break;await delay(100);}
    await evaluate("document.querySelector('[data-view=\"employees\"]').click()");
    const hasContactHeader = await evaluate("[...document.querySelectorAll('.directory-table th')].some(th=>th.textContent.includes('联系方式'))");
    const contactCellText = await evaluate("document.querySelector('.contact-cell').textContent.trim()");
    assert.ok(hasContactHeader,'档案表应有“联系方式”列');
    assert.match(contactCellText,/手机|微信/,'联系方式单元格应显示手机/微信');
    await evaluate("document.querySelector('[data-edit-employee]').click()");
    const hasPhone = await evaluate("!!document.getElementById('employee-phone')");
    const phoneRequired = await evaluate("document.getElementById('employee-phone').required");
    const hasWechat = await evaluate("!!document.getElementById('employee-wechat')");
    const wechatRequired = await evaluate("document.getElementById('employee-wechat').required");
    assert.ok(hasPhone && hasWechat,'弹窗应有手机号和微信号输入框');
    assert.equal(phoneRequired,false,'手机号应选填');
    assert.equal(wechatRequired,false,'微信号应选填');
    assert.deepEqual(errors, [], '页面不应有运行时错误: ' + errors.join(' | '));
    console.log('contact-smoke OK：联系方式列、手机号/微信号输入框均正常且选填');
  } finally {
    try { ws && ws.close(); } catch (_) {}
    child.kill();
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
