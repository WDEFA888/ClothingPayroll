/* 无第三方依赖的 Chrome CDP 界面回归。所有测试数据只进入 D 盘隔离浏览器。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {textContrastReport} = require('./ui-checks.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
function storedZip(entries) {
  const {crc32} = require('../excel.js');
  const chunks = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const flags = entry.flags || 0x800, crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.size ?? data.length, 22); local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(flags, 8); dir.writeUInt16LE(0, 10); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(entry.size ?? data.length, 24);
    dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}
const root = path.resolve(__dirname, '..');
const work = path.join(__dirname, 'browser-artifacts', 'run-' + Date.now());
fs.mkdirSync(work, {recursive:true});
const browserPath = process.env.PAYROLL_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
async function freePort() { const s = net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const port=s.address().port; await new Promise(r=>s.close(r)); return port; }
(async()=>{
  const port = await freePort();
  const profile = path.join(work, 'profile-' + Date.now());
  const child = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--disable-extensions', '--remote-debugging-port='+port, '--user-data-dir='+profile, 'about:blank'], {stdio:'ignore'});
  let ws;
  try {
    let version;
    for(let i=0;i<100;i++){try{version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();break;}catch(_){await delay(100);}}
    assert.ok(version,'Chrome 未启动');
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let serial=0, session, dialogText='重新核对', dialogAnswers=[], handledDialogs=0;
    const pending=new Map(), errors=[], downloadEvents=[], dialogs=[];
    function call(method,params={},sid=session){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP 超时 '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
    ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
      if(message.method==='Page.javascriptDialogOpening'){dialogs.push(message.params.message);const answer=dialogAnswers.shift()||{accept:true,promptText:dialogText};call('Page.handleJavaScriptDialog',answer,message.sessionId).then(()=>handledDialogs++).catch(e=>errors.push(e.message));}
      if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));
      if(message.method==='Log.entryAdded' && message.params.entry.level==='error')errors.push(message.params.entry.text);
      if(message.method==='Browser.downloadProgress')downloadEvents.push(message.params);
    });
    const target=await call('Target.createTarget',{url:'about:blank'},null);
    session=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
    await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
    await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:work,eventsEnabled:true},null);
    await call('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});"});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
    async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('等待失败 '+expression+'；最近提示：'+dialogs.slice(-2).join(' | '));}
    async function reload(){await evaluate('window.__testReloadPending=true');await call('Page.reload');await wait("!window.__testReloadPending && document.readyState==='complete' && document.querySelector('#month')?.value.length===7");}
    async function click(selector){const pos=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('元素不存在');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button:'left',clickCount:1});}
    async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
    const url=pathToFileURL(path.join(root,'工资助手.html')).href;
    const key='yizhang-payroll-v1';
    const state=()=>evaluate(`JSON.parse(localStorage.getItem('${key}'))`);
    const contrastReports=[];
    async function screenshot(name){
      await evaluate('Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})))');
      const contrast=await evaluate('('+textContrastReport.toString()+')()');
      contrastReports.push({screenshot:name,...contrast});
      fs.writeFileSync(path.join(work,'text-contrast.json'),JSON.stringify(contrastReports,null,2));
      assert.deepEqual(contrast.failures,[],'文字对比度不足：'+name);
      const img=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(work,name),Buffer.from(img.data,'base64'));
    }
    async function checkSummary(storageKey=key){
      const expected=await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})),month=document.querySelector('#month').value,shop=document.querySelector('#shop-filter').value,q=document.querySelector('#search').value.trim().toLowerCase(),rows=(s?.months[month]?.rows||[]).filter(r=>(!shop||r.shopId===shop)&&(!q||(r.name+' '+r.role).toLowerCase().includes(q)));return [rows.length,...[PayrollCore.gross,PayrollCore.deductions,PayrollCore.net].map(fn=>rows.reduce((n,r)=>n+fn(r),0))];})()`);
      assert.equal(await evaluate("document.querySelector('#summary-people').textContent"),String(expected[0]));
      for(const [i,id] of ['summary-gross','summary-deductions','summary-net'].entries())assert.equal(await evaluate(`document.getElementById('${id}').textContent`),(expected[i+1]/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}));
    }
    await call('Page.navigate',{url:url+'?demo=1'}); await wait("document.querySelectorAll('#payroll-body tr').length===4");
    assert.equal(await evaluate("document.querySelector('#demo-banner').hidden"),false);
    assert.equal(await evaluate(`localStorage.getItem('${key}')`),null);
    await checkSummary('yizhang-payroll-v1-demo');
    await screenshot('01-demo-desktop.png');
    await fill('#shop-filter','taobao-a');await checkSummary('yizhang-payroll-v1-demo');
    assert.equal(await evaluate("document.querySelector('#summary-people').textContent"),'1');
    await fill('#search','不存在的虚构员工');await checkSummary('yizhang-payroll-v1-demo');
    assert.equal(await evaluate("document.querySelector('#summary-net').textContent"),'0.00');
    await fill('#search','');await fill('#shop-filter','');
    await click('.nav-item[data-view="employees"]');
    const noteMonth=await evaluate("document.querySelector('#employee-note-month').value");
    const managerNote='仅内部：本月服务表现稳定，下月安排培训。';
    await fill('[data-employee-note="demo-0"]',managerNote);
    await fill('[data-employee-note="demo-1"]','仅内部：跟进团队排班');
    await click('[data-save-employee-note="demo-0"]');
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-1\"]').value"),'仅内部：跟进团队排班');
    await fill('#employee-note-month','2000-02');
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-0\"]').value"),'');
    const escapedNote='内部备注 </textarea><img src=x onerror=alert(1)>\n第二行';
    await fill('[data-employee-note="demo-0"]',escapedNote);await click('[data-save-employee-note="demo-0"]');
    await fill('#employee-note-month',noteMonth);
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-0\"]').value"),managerNote);
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-1\"]').value"),'仅内部：跟进团队排班');
    await click('[data-save-employee-note="demo-1"]');
    await reload();await wait("document.querySelectorAll('#payroll-body tr').length===4");
    await click('.nav-item[data-view="employees"]');await fill('#employee-note-month','2000-02');
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-0\"]').value"),escapedNote);
    assert.equal(await evaluate("document.querySelectorAll('#employees-body img').length"),0);
    await fill('[data-employee-note="demo-0"]','');await click('[data-save-employee-note="demo-0"]');
    await fill('#employee-note-month',noteMonth);
    assert.equal(await evaluate("document.querySelector('[data-employee-note=\"demo-0\"]').value"),managerNote);
    await screenshot('06-demo-employees-desktop.png');
    console.log('PASS 员工备注按月份独立保存、跨月草稿保留、刷新读取、清空与文本转义');
    const xss='<img src=x onerror=alert(1)>';
    await click('[data-edit-employee="demo-0"]');await wait("document.querySelector('#employee-dialog').open");
    await fill('#employee-name',xss);await fill('#employee-role','<svg onload=alert(1)>');
    await click('#employee-form button[type=submit]');await wait("!document.querySelector('#employee-dialog').open");
    assert.equal(await evaluate("document.querySelectorAll('#employees-body img,#employees-body [onerror],#employees-body [onload]').length"),0);
    assert.ok((await evaluate("document.querySelector('#employees-body').textContent")).includes(xss));
    await click('[data-edit-employee="demo-0"]');await wait("document.querySelector('#employee-dialog').open");
    await fill('#employee-name','示例·陈导购');await fill('#employee-role','导购');
    await click('#employee-form button[type=submit]');await wait("!document.querySelector('#employee-dialog').open");
    assert.equal(await evaluate("document.querySelector('#breadcrumb-current').textContent"),'员工档案');
    await click('.local-card [data-view="settings"]');
    assert.equal(await evaluate("document.querySelector('.nav-item.active').dataset.view"),'settings');
    assert.equal(await evaluate("document.querySelector('.nav-item.active').getAttribute('aria-current')"),'page');
    await fill('[data-shop-id="offline-a"]',xss+'店');await click('#shops-form button[type=submit]');
    await wait("document.querySelector('#shop-filter').options[1].textContent.includes('onerror')");
    assert.equal(await evaluate("document.querySelectorAll('#shop-filter img,#shop-filter [onerror],#shop-filter [onload]').length"),0);
    assert.ok((await evaluate("document.querySelector('#shop-filter').options[1].textContent")).includes(xss+'店'));
    await fill('[data-shop-id="offline-a"]','上海实体店 A');await click('#shops-form button[type=submit]');
    await wait("document.querySelector('#shop-filter').options[1].textContent==='上海实体店 A'");
    console.log('PASS 恶意姓名、岗位、店名均按纯文本显示，不执行页面脚本');
    await screenshot('07-demo-settings-desktop.png');
    await click('.nav-item[data-view="payroll"]');
    console.log('PASS 演示隔离、筛选汇总卡片与导航状态');
    await click('[data-edit-salary="demo-0"]');await wait("document.querySelector('#salary-dialog').open");
    await screenshot('08-demo-salary-dialog.png');
    await fill('#salary-commission','1111.11');await fill('#salary-note','<img src=x onerror=alert(1)>仅为测试备注');
    await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('yizhang-payroll-v1-demo')).months[document.querySelector('#month').value].rows[0].commission"),111111);
    await click('[data-edit-salary="demo-0"]');await wait("document.querySelector('#salary-dialog').open");
    assert.equal(await evaluate("document.querySelector('#commission-base').value"),'');
    await fill('#commission-base','50000');await fill('#commission-rate','3');
    assert.equal(await evaluate("document.querySelector('#commission-result').textContent"),'1500.00');
    await screenshot('13-demo-commission-calculator.png');
    await click('#commission-apply');
    assert.equal(await evaluate("document.querySelector('#salary-commission').value"),'1500.00');
    await evaluate("document.querySelector('input[name=\"commission-mode\"][value=\"formula\"]').checked=true;document.querySelector('input[name=\"commission-mode\"][value=\"formula\"]').dispatchEvent(new Event('change',{bubbles:true}))");
    await fill('#commission-formula','(50000-2000)×3%+300');
    assert.equal(await evaluate("document.querySelector('#commission-result').textContent"),'1740.00');
    await fill('#commission-formula','abc');
    assert.equal(await evaluate("document.querySelector('#commission-result').textContent"),'算式有误');
    assert.equal(await evaluate("document.querySelector('#commission-hint').hidden"),false);
    await fill('#commission-formula','(50000-2000)×3%+300');
    await click('#commission-apply');
    assert.equal(await evaluate("document.querySelector('#salary-commission').value"),'1740.00');
    await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('yizhang-payroll-v1-demo')).months[document.querySelector('#month').value].rows[0].commission"),174000);
    console.log('PASS 提成小助手：按比例与自定义算式计算、填入提成、错误提示与保存');
    await click('[data-slip="demo-0"]');await wait("document.querySelector('#slip-dialog').open");
    assert.equal(await evaluate("document.querySelectorAll('#slip-content img').length"),0);
    assert.equal((await evaluate("document.querySelector('#slip-content').textContent")).includes(managerNote),false);
    await screenshot('02-personal-payslip.png');await click('[data-close="slip-dialog"]');
    console.log('PASS 编辑工资、个人工资条与备注转义');
    await call('Page.navigate',{url});await wait("document.querySelector('#month').value.length===7");
    assert.equal((await evaluate("document.querySelector('#employees-body').textContent")).includes('尚无员工'),true);
    assert.equal(await evaluate("document.querySelector('#summary-net').textContent"),'—');
    await screenshot('09-empty-workspace-desktop.png');
    await click('#empty-add');await wait("document.querySelector('#employee-dialog').open");
    await fill('#employee-name','界面测试员工');await fill('#employee-role','跨店客服');await fill('#employee-base','4000.29');
    await evaluate("document.querySelector('#employee-services input[value=\"taobao-a\"]').checked=true;document.querySelector('#employee-services input[value=\"taobao-b\"]').checked=true");
    await click('#employee-form button[type=submit]');await wait("!document.querySelector('#employee-dialog').open");
    await click('.nav-item[data-view="employees"]');await fill('[data-employee-note]','仅内部：未生成工资前的培训安排');
    const beforeNoteFailure=JSON.stringify(await state());
    await evaluate("window.testSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('虚构测试：存储已满','QuotaExceededError')}");
    await click('[data-save-employee-note]');
    assert.equal(JSON.stringify(await state()),beforeNoteFailure);
    assert.equal(await evaluate("document.querySelector('[data-employee-note]').value"),'仅内部：未生成工资前的培训安排');
    assert.equal(await evaluate("document.querySelector('[data-note-state]').textContent"),'未保存');
    await evaluate('Storage.prototype.setItem=window.testSetItem;delete window.testSetItem');
    await click('[data-save-employee-note]');
    await click('.nav-item[data-view="payroll"]');
    await click('#generate');await wait("document.querySelectorAll('#payroll-body [data-edit-salary]').length===1");
    let s=await state();const month=Object.keys(s.months)[0], id=s.employees[0].id;
    assert.equal(s.months[month].rows.length,1);assert.equal(s.employees[0].serviceShopIds.length,3);
    await click('[data-edit-salary]');await fill('#salary-commission','1000.01');await fill('#salary-bonus','100');await fill('#salary-subsidy','200');await fill('#salary-deduction','50');await fill('#salary-insurance','650');await fill('#salary-tax','10');
    assert.equal(await evaluate("document.querySelector('#salary-preview').textContent"),'4590.30');
    await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
    await reload();await wait("document.querySelector('#payroll-body').textContent.includes('4590.30')");
    console.log('PASS 真实鼠标建档、跨店去重、七项计算与刷新持久化');
    await click('#lock');await wait("document.querySelector('#lock-badge').textContent==='已锁账'");
    assert.equal(await evaluate("document.querySelector('[data-edit-salary]').disabled"),true);
    assert.equal(await evaluate("document.querySelector('#generate').disabled"),true);
    assert.equal(await evaluate("document.querySelectorAll('[data-remove]').length"),0);
    const lockedWages=structuredClone((await state()).months);
    await click('.nav-item[data-view="employees"]');await fill('[data-employee-note]','仅内部：锁账后仍需跟进培训');await click('[data-save-employee-note]');
    assert.deepEqual((await state()).months,lockedWages);
    await click('.nav-item[data-view="payroll"]');
    await click('#lock');await wait("document.querySelector('#lock-badge').textContent==='待核对'");
    assert.ok((await state()).logs.some(l=>l.message.includes('解锁，原因：重新核对')));
    console.log('PASS 锁账禁改与填写原因解锁');
    await click('[data-view="employees"]');await click('[data-edit-employee]');await fill('#employee-base','6000');await fill('#employee-name','修改后的姓名');await click('#employee-form button[type=submit]');await wait("!document.querySelector('#employee-dialog').open");
    s=await state();assert.equal(s.months[month].rows[0].base,400029);assert.equal(s.months[month].rows[0].name,'界面测试员工');
    await click('[data-view="payroll"]');
    await fill('#shop-filter','taobao-a');assert.equal(await evaluate("document.querySelectorAll('[data-slip]').length"),0);await checkSummary();
    await fill('#shop-filter','');assert.equal(await evaluate("document.querySelectorAll('[data-slip]').length"),1);await checkSummary();
    await fill('#month','2000-01');assert.equal(await evaluate("document.querySelector('#summary-net').textContent"),'—');
    assert.equal(await evaluate("document.querySelector('#summary-people').textContent"),'0');await fill('#month',month);await checkSummary();
    console.log('PASS 档案变更不污染历史工资，店铺筛选工作正常');
    await click('#export-payroll');
    for(let i=0;i<100;i++){if(fs.readdirSync(work).some(f=>f.endsWith('当前筛选.csv')))break;await delay(50);}
    const csvName=fs.readdirSync(work).find(f=>f.endsWith('当前筛选.csv'));assert.ok(csvName,'CSV 未下载');
    const csv=fs.readFileSync(path.join(work,csvName),'utf8');assert.ok(csv.startsWith('﻿'));assert.ok(csv.includes('4590.30'));assert.ok(csv.includes('界面测试员工'));
    await click('[data-slip]');await click('#slip-csv');
    for(let i=0;i<100;i++){if(fs.readdirSync(work).some(f=>f.endsWith('个人工资条.csv')))break;await delay(50);}
    assert.ok(fs.readdirSync(work).some(f=>f.endsWith('个人工资条.csv')));await click('[data-close="slip-dialog"]');
    await click('[data-view="settings"]');
    async function submitPassword(pw, confirm) {
      await wait("document.querySelector('#password-dialog').open");
      await fill('#password-input', pw);
      if (confirm !== undefined) await fill('#password-confirm', confirm);
      await click('#password-submit');
      await wait("!document.querySelector('#password-dialog').open");
    }
    const pw = '测试密码123';
    await click('#backup');await submitPassword(pw, pw);
    let backup;
    for(let i=0;i<100;i++){backup=fs.readdirSync(work).filter(f=>f.startsWith('衣账-加密备份')&&f.endsWith('.json')).sort().at(-1);if(backup)break;await delay(50);}
    assert.ok(backup,'加密备份未下载');const backupText=fs.readFileSync(path.join(work,backup),'utf8');
    const backed=JSON.parse(backupText);assert.equal(backed.encrypted,true);assert.equal(backed.app,'clothing-payroll-backup');
    assert.ok(!backupText.includes('界面测试员工') && !backupText.includes('1000.01'),'加密备份不应包含明文工资');
    const n=await call('DOM.getDocument');const input=await call('DOM.querySelector',{nodeId:n.root.nodeId,selector:'#restore-file'});
    const beforeWrong=JSON.stringify(await state());
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(work,backup)]});
    await submitPassword('错误密码');
    assert.equal(JSON.stringify(await state()),beforeWrong,'错误密码不应恢复数据');
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(work,backup)]});
    await submitPassword(pw);dialogText='确认恢复';
    await wait("document.querySelector('#audit-list').textContent.includes('从本地备份恢复全部数据')");dialogText='重新核对';
    assert.equal((await state()).months[month].rows[0].commission,100001);
    assert.equal((await state()).employeeNotes[month][0].note,'仅内部：锁账后仍需跟进培训');
    console.log('PASS 加密备份：密码加密、明文不泄露、错误密码拒绝、正确密码恢复');
    // 旧版明文备份仍可恢复
    const legacy=path.join(work,'legacy-backup.json');fs.writeFileSync(legacy,JSON.stringify(await state()));
    dialogAnswers=[{accept:true},{accept:true},{accept:true,promptText:'确认恢复'}];
    await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[legacy]});
    await wait("document.querySelector('#audit-list').textContent.includes('从本地备份恢复全部数据')");
    assert.ok(dialogs.some(d => d.includes('这是未加密的旧版备份')),'应提示旧版备份');
    assert.equal((await state()).months[month].rows[0].commission,100001);
    console.log('PASS 旧版明文备份仍可恢复（提示重新加密）');
    const invalid=path.join(work,'invalid-backup.json');fs.writeFileSync(invalid,'{"app":"other"}');
    const before=JSON.stringify(await state());await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[invalid]});await delay(150);
    assert.equal(JSON.stringify(await state()),before);
    console.log('PASS 非法备份拒绝恢复，旧数据保持不变');
    async function excelError(bytes){
      const b64=bytes.toString('base64');
      return evaluate(`(async()=>{try{await PayrollExcel.read(new File([Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0))],'evil.xlsx'));return 'OK'}catch(e){return e.message}})()`);
    }
    const wb='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>';
    assert.match(await excelError(storedZip([{name:'xl/workbook.xml',data:wb},{name:'../evil.xml',data:'x'}])),/内部路径异常/);
    assert.match(await excelError(storedZip([{name:'xl/workbook.xml',data:wb},{name:'xl/workbook.xml',data:wb}])),/内部路径异常/);
    assert.match(await excelError(storedZip([{name:'xl/workbook.xml',data:'<!DOCTYPE x [<!ENTITY a "b">]><workbook/>'}])),/外部实体/);
    assert.match(await excelError(storedZip([{name:'xl/workbook.xml',data:wb,flags:1}])),/加密/);
    assert.match(await excelError(storedZip([{name:'xl/workbook.xml',data:wb,size:9*1024*1024}])),/过大|目录损坏/);
    console.log('PASS 恶意 XLSX：路径穿越、重复条目、DTD 实体、加密标记、伪造体积均被拒绝');
    await click('.nav-item[data-view="payroll"]');await click('#lock');await wait("document.querySelector('#lock-badge').textContent==='已锁账'");
    const retainedMonths=structuredClone((await state()).months);
    await click('.nav-item[data-view="employees"]');
    async function deleteWithAnswers(answers){
      const target=handledDialogs+answers.length;dialogAnswers=answers;
      await click('[data-delete-employee]');
      for(let i=0;i<100 && handledDialogs<target;i++)await delay(25);
      assert.equal(handledDialogs,target,'删除确认弹窗未完成');
      assert.equal(dialogAnswers.length,0);
    }
    const beforeDelete=JSON.stringify(await state());
    await deleteWithAnswers([{accept:false}]);assert.equal(JSON.stringify(await state()),beforeDelete);
    await deleteWithAnswers([{accept:true},{accept:true,promptText:'输错确认文字'}]);assert.equal(JSON.stringify(await state()),beforeDelete);
    await deleteWithAnswers([{accept:true},{accept:false}]);assert.equal(JSON.stringify(await state()),beforeDelete);
    await deleteWithAnswers([{accept:true},{accept:true,promptText:'删除员工'}]);
    await wait("document.querySelectorAll('[data-delete-employee]').length===0");
    assert.equal((await state()).employees[0].deleted,true);assert.equal((await state()).employees[0].active,false);
    assert.deepEqual((await state()).months,retainedMonths);
    await reload();await wait("document.querySelector('#payroll-body').textContent.includes('4590.30')");
    assert.equal(await evaluate("document.querySelector('#lock-badge').textContent"),'已锁账');
    await click('[data-slip]');await wait("document.querySelector('#slip-content').textContent.includes('4590.30')");await click('[data-close="slip-dialog"]');
    await click('.nav-item[data-view="employees"]');
    assert.equal(await evaluate("document.querySelectorAll('[data-edit-employee]').length"),0);
    assert.ok((await evaluate("document.querySelector('#employees-body').textContent")).includes('尚无员工'));
    await click('.nav-item[data-view="payroll"]');await fill('#month','2099-12');await click('#generate');
    assert.equal((await state()).months['2099-12'],undefined);await fill('#month',month);
    console.log('PASS 删除员工的取消/错误确认、刷新持久化、锁账与历史工资条保留、未来不再生成');
    // 制造另一标签页写入，检查主页面写保护。
    const second=await call('Target.createTarget',{url},null);
    const sid2=(await call('Target.attachToTarget',{targetId:second.targetId,flatten:true},null)).sessionId;
    await call('Runtime.enable',{},sid2);
    await call('Runtime.evaluate',{expression:`(()=>{const s=JSON.parse(localStorage.getItem('${key}'));s.logs.unshift({at:new Date().toISOString(),message:'并发测试'});localStorage.setItem('${key}',JSON.stringify(s));})()`},sid2);
    await wait("!document.querySelector('#fatal').hidden");
    assert.equal(await evaluate("document.querySelector('#add-employee').disabled"),true);
    await call('Target.closeTarget',{targetId:second.targetId},null);
    console.log('PASS 多标签页冲突时停止写入');
    if(process.argv.includes('--excel')){
      const fixture=require('./make-fixture.js').createFixture(path.join(work,'synthetic-fixture'));
      const workbook=fixture.file;
      const {createHash}=require('node:crypto');const originalHash=createHash('sha256').update(fs.readFileSync(workbook)).digest('hex');
      await call('Page.navigate',{url});await wait("document.querySelector('#month').value.length===7");
      async function selectFile(selector,file){const doc=await call('DOM.getDocument');const node=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await call('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[file]});}
      await selectFile('#excel-file',workbook);await wait("document.querySelector('#import-dialog').open");
      assert.equal(await evaluate("document.querySelectorAll('[data-import-index]').length"),23);
      assert.equal(await evaluate("document.querySelector('#import-month').value"),'2026-09');
      assert.equal(await evaluate("document.querySelector('#import-shop').value"),'unassigned');
      const preview=await evaluate("document.querySelector('#import-summary').textContent");assert.ok(preview.includes('4 条未填实发'));assert.ok(preview.includes('1 条与已列项目计算有差异'));
      await fill('#import-month','2026-11');assert.equal(await evaluate("document.querySelector('#import-month-warning').hidden"),false);await fill('#import-month','2026-09');
      await screenshot('04-synthetic-excel-import-preview.png');
      await click('#confirm-import');await wait("!document.querySelector('#import-dialog').open");
      s=await state();const imported=s.months['2026-09'].rows;assert.equal(imported.length,23);assert.equal(new Set(imported.map(r=>r.employeeId)).size,23);
      assert.equal(imported.filter(r=>r.source.recordedNet===null).length,4);assert.ok(imported.every(r=>r.shopId==='unassigned'));
      assert.equal(imported.filter(r=>r.source.recordedNet!==null).reduce((sum,r)=>sum+r.source.recordedNet,0),fixture.originalTotal);
      const byRow=n=>imported.find(r=>r.source.row===n);
      for(const expected of fixture.records){const actual=byRow(expected.row);for(const field of require('../core.js').fields)assert.equal(actual[field],expected[field],'原表行 '+expected.row+' 项目 '+field);assert.equal(actual.source.recordedNet,expected.recordedNet);assert.equal(actual.leaveDays,expected.leaveDays);}
      assert.equal(byRow(25).insuranceAllowance,50000);assert.equal(byRow(25).housingAllowance,80000);assert.equal(byRow(25).commission,12300);assert.equal(byRow(25).insurance,0);
      assert.equal(byRow(8).depositRefund,80000);assert.equal(byRow(8).leaveDays,1950);assert.equal(byRow(8).leaveDeduction,25000);
      assert.equal(byRow(42).depositDeduction,30000);assert.equal(byRow(86).extraPay,40000);
      assert.equal(byRow(33).extraPay,0);assert.equal(byRow(46).source.recordedNet,null);assert.equal(byRow(46).leaveDeduction,0);
      assert.equal(await evaluate("document.querySelector('#month').value"),'2026-09');
      console.log('PASS 压缩 XLSX 23 条虚构记录逐项核对、月份、备注补发/押金、社保方向及空白实发');
      await click('#lock');assert.equal((await state()).months['2026-09'].locked,false);
      await selectFile('#excel-file',workbook);await wait("document.querySelector('#import-dialog').open");
      assert.equal(await evaluate("document.querySelectorAll('[data-import-index]:disabled').length"),23);assert.equal(await evaluate("document.querySelector('#confirm-import').disabled"),true);
      await click('[data-close="import-dialog"]');
      console.log('PASS 重复文件整批拦截；待确认店铺与工资缺项阻止锁账');
      const differenceId=byRow(33).employeeId;
      await click('[data-edit-salary="'+differenceId+'"]');await fill('#salary-shop','offline-a');
      assert.ok((await evaluate("document.querySelector('#salary-comparison').textContent")).includes('-3.00'));
      await click('#salary-reviewed');await fill('#salary-review-reason','虚构测试：确认保留原表差额');
      await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
      let changed=(await state()).months['2026-09'].rows.find(r=>r.employeeId===differenceId);assert.equal(changed.review.confirmed,true);assert.equal(changed.extraPay,0);assert.equal(changed.source.recordedNet,byRow(33).source.recordedNet);
      await click('[data-edit-salary="'+differenceId+'"]');await fill('#salary-commission',String((byRow(33).commission+100)/100));assert.equal(await evaluate("document.querySelector('#salary-reviewed').checked"),false);
      await click('#salary-form button[type=submit]');await wait("!document.querySelector('#salary-dialog').open");
      changed=(await state()).months['2026-09'].rows.find(r=>r.employeeId===differenceId);assert.equal(changed.review.confirmed,false);assert.equal(changed.source.recordedNet,byRow(33).source.recordedNet);
      console.log('PASS 差额不自动补齐；人工核实说明及金额变更后重新待核实');
      await click('#export-excel');let excelFile;
      for(let i=0;i<100;i++){excelFile=fs.readdirSync(work).find(f=>f.endsWith('.xlsx'));if(excelFile)break;await delay(50);}
      assert.ok(excelFile,'Excel 未下载');assert.equal(fs.readFileSync(path.join(work,excelFile)).subarray(0,2).toString(),'PK');
      await selectFile('#excel-file',path.join(work,excelFile));await wait("document.querySelector('#import-dialog').open");assert.equal(await evaluate("document.querySelectorAll('[data-import-index]').length"),23);await click('[data-close="import-dialog"]');
      await click('[data-slip="'+differenceId+'"]');
      await call('Emulation.setEmulatedMedia',{media:'print'});
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.app-shell')).display"),'none');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#slip-dialog')).display"),'block');
      await screenshot('05-synthetic-print-layout.png');
      const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});fs.writeFileSync(path.join(work,'synthetic-personal-payslip.pdf'),Buffer.from(pdf.data,'base64'));
      await call('Emulation.setEmulatedMedia',{media:''});
      await click('[data-close="slip-dialog"]');
      assert.equal(createHash('sha256').update(fs.readFileSync(workbook)).digest('hex'),originalHash);
      console.log('PASS XLSX 导出重新读取、虚构个人工资条 PDF；输入文件未修改');
    }
    await call('Page.navigate',{url:url+'?demo=1'});await wait("document.querySelectorAll('#payroll-body tr').length===4");
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate('window.scrollTo(0,0)');await screenshot('03-demo-mobile.png');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.payroll-table tbody tr')).display"),'grid');
    await evaluate("document.querySelector('.payroll-panel').scrollIntoView({block:'start'})");await screenshot('10-demo-mobile-payroll-cards.png');
    await click('.nav-item[data-view="employees"]');await screenshot('11-demo-mobile-employees.png');
    await fill('[data-employee-note="demo-0"]','仅内部：手机补充本月培训跟进');await click('[data-save-employee-note="demo-0"]');
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('yizhang-payroll-v1-demo')).employeeNotes[document.querySelector('#employee-note-month').value].find(e=>e.employeeId==='demo-0').note"),'仅内部：手机补充本月培训跟进');
    await evaluate("document.querySelector('.monthly-note-cell').scrollIntoView({block:'center'})");await screenshot('12-demo-mobile-monthly-note.png');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
    await click('.nav-item[data-view="payroll"]');
    for(const width of [320,760,768,1024,1280,1920]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=760});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'页面横向溢出：'+width);
    }
    console.log('PASS 320—1920 像素响应式布局、手机工资与员工卡片');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await click('.nav-item[data-view="settings"]');
    const clearDialogs=[{accept:true},{accept:true,promptText:'清空数据'}];
    const clearTarget=handledDialogs+clearDialogs.length;dialogAnswers=clearDialogs;
    await click('#clear-data');
    for(let i=0;i<100 && handledDialogs<clearTarget;i++)await delay(25);
    assert.equal(handledDialogs,clearTarget,'清空确认弹窗未完成');
    assert.equal(await evaluate("localStorage.getItem('yizhang-payroll-v1')"),null);
    assert.equal(await evaluate("localStorage.getItem('yizhang-payroll-v1-demo')"),null);
    await click('.nav-item[data-view="employees"]');
    assert.ok((await evaluate("document.querySelector('#employees-body').textContent")).includes('尚无员工'));
    await click('.nav-item[data-view="payroll"]');
    assert.equal(await evaluate("document.querySelector('#summary-net').textContent"),'—');
    await call('Page.navigate',{url});await wait("document.querySelector('#month').value.length===7");
    assert.ok((await evaluate("document.querySelector('#employees-body').textContent")).includes('尚无员工'));
    assert.equal(await evaluate("localStorage.getItem('yizhang-payroll-v1')"),null);
    assert.equal(await evaluate("localStorage.getItem('yizhang-payroll-v1-demo')"),null);
    console.log('PASS 清空全部本机数据（正式与演示空间、操作记录一并删除，刷新后仍为空）');
    assert.deepEqual(errors,[],'存在浏览器控制台错误');
    const report={passed:true,checkedAt:new Date().toISOString(),browser:version.Browser,consoleErrors:errors,downloadCount:downloadEvents.filter(e=>e.state==='completed').length,screenshots:contrastReports.map(report=>report.screenshot),textContrastReport:'text-contrast.json'};
    fs.writeFileSync(path.join(work,'result.json'),JSON.stringify(report,null,2));
    console.log('ALL BROWSER CHECKS PASSED',path.join(work,'result.json'));
    await call('Browser.close',{},null).catch(()=>{});
  }finally{if(ws)ws.close();child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
