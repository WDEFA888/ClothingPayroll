'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
function fixture() {
  const state = C.newState();
  state.employees.push({id:'employee-1',name:'测试员工',role:'客服',shopId:'taobao-a',serviceShopIds:['taobao-a','taobao-b'],base:450000,active:true,startMonth:'2026-01'});
  C.generate(state,'2026-11'); return state;
}
test('金额按分精确计算，拒绝异常值和三位小数', () => {
  assert.equal(C.money('0.29'),29); assert.equal(C.money('4500.01'),450001); assert.equal(C.money('100000000.00'),C.MAX);
  for (const value of ['','-1','1.001','NaN','Infinity','1e5','100000001','0x10']) assert.throws(() => C.money(value));
});
test('工资公式覆盖七项金额与负数实发', () => {
  const row={base:400000,commission:150000,bonus:10000,subsidy:20000,deduction:10000,insurance:50000,tax:2000};
  assert.equal(C.net(row),518000); assert.equal(C.deductions(row),62000);
  assert.equal(C.net({...row,deduction:1000000}),-472000);
});
test('跨店员工只生成一行；重复生成不覆盖已填工资', () => {
  const s=fixture(); s.months['2026-11'].rows[0].commission=12345;
  assert.equal(C.generate(s,'2026-11'),0); assert.equal(s.months['2026-11'].rows.length,1);
  assert.equal(s.months['2026-11'].rows[0].commission,12345);
});
test('历史月份保存姓名岗位底薪与店铺快照', () => {
  const s=fixture(); s.employees[0].base=600000; s.employees[0].name='新姓名'; s.employees[0].shopId='taobao-b';
  C.generate(s,'2026-12'); assert.equal(s.months['2026-11'].rows[0].base,450000); assert.equal(s.months['2026-11'].rows[0].name,'测试员工');
  assert.equal(s.months['2026-11'].rows[0].shopId,'taobao-a'); assert.equal(s.months['2026-12'].rows[0].base,600000);
});
test('停用员工及入职较晚的员工不新增到工资表，旧工资保留', () => {
  const s=fixture(); s.employees[0].active=false; assert.equal(C.generate(s,'2026-12'),0); assert.equal(s.months['2026-11'].rows.length,1);
  s.employees[0].active=true; assert.equal(C.generate(s,'2025-12'),0);
});
test('锁账阻止编辑和补员；解锁必须说明原因', () => {
  const s=fixture(), row=s.months['2026-11'].rows[0];
  C.setLock(s,'2026-11',true); assert.throws(()=>C.updateRow(s,'2026-11','employee-1',row)); assert.throws(()=>C.generate(s,'2026-11'));
  assert.throws(()=>C.setLock(s,'2026-11',false,'')); C.setLock(s,'2026-11',false,'重新核对');
  C.updateRow(s,'2026-11','employee-1',{...row,commission:20000}); assert.equal(s.months['2026-11'].rows[0].commission,20000);
  assert.match(s.logs[0].message,/原值/); assert.match(s.logs[0].message,/新值/);
});
test('恢复校验拒绝伪造金额、重复工资和重复员工', () => {
  const s=fixture(); assert.equal(C.validate(JSON.parse(JSON.stringify(s))).app,'clothing-payroll');
  const a=structuredClone(s); a.months['2026-11'].rows[0].base=1.5; assert.throws(()=>C.validate(a));
  const b=structuredClone(s); b.months['2026-11'].rows.push({...b.months['2026-11'].rows[0]}); assert.throws(()=>C.validate(b));
  const c=structuredClone(s); c.employees.push({...c.employees[0]}); assert.throws(()=>C.validate(c));
  const d=structuredClone(s); d.months['2026-11'].rows[0].employeeId='missing'; assert.throws(()=>C.validate(d));
  assert.throws(()=>C.validate({app:'other'}));
});
test('CSV 带 UTF-8 BOM，转义引号换行，并阻止公式注入', () => {
  const value=C.csv([['=SUM(1,2)',' +1','@危险','"双引号"','换\n行']]);
  assert.ok(value.startsWith('﻿')); assert.ok(value.includes('"\'=SUM(1,2)"')); assert.ok(value.includes('"\' +1"'));
  assert.ok(value.includes('"\'@危险"')); assert.ok(value.includes('""双引号""')); assert.ok(value.includes('"换\n行"'));
});
test('操作记录保留最近500条；合法月份检查', () => {
  const s=C.newState(); for(let i=0;i<600;i++) C.log(s,String(i)); assert.equal(s.logs.length,500); assert.equal(s.logs[0].message,'599');
  for(const m of ['2026-00','2026-13','2026-1','1999-12','2100-01']) assert.equal(C.monthValid(m),false);
  assert.equal(C.monthValid('2026-11'),true);
});
function imported(rowNumber=4, name='导入测试员工') {
  return {...C.blankAmounts(),name,base:400000,mealAllowance:20000,commission:30000,leaveDays:0,note:'',
    source:{fileName:'测试.xlsx',fingerprint:'a'.repeat(64),sheet:'Sheet1',row:rowNumber,number:'19',section:'测试工资',month:'2026-09',recordedNet:450300,warnings:[],cells:[]}};
}
function batchOptions(rows=1,shopId='offline-a') {return {month:'2026-09',shopId,rows:Array.from({length:rows},(_,index)=>({index,selected:true,employeeId:''}))};}
test('17 项工资分别计入收入和扣款，社保应发和个人扣款不混淆',()=>{
  const r={...C.blankAmounts(),base:600000,mealAllowance:20000,commission:30000,housingAllowance:50000,insuranceAllowance:40000,insurance:10000};
  assert.equal(C.net(r),730000); assert.equal(C.gross(r),740000); assert.equal(C.deductions(r),10000);
});
test('请假天数保留半天，不擅自按月天数推算扣款',()=>{
  assert.equal(C.days('19.5'),1950);assert.equal(C.dayText(1950),'19.5');assert.throws(()=>C.days('31.01'));
  const r={...imported(),shopId:'offline-a',leaveDays:1950};assert.equal(C.net(r),450000);assert.ok(C.issues(r).some(x=>x.includes('请假')));
});
test('v1 数据兼容升级，不修改历史实发金额，不自动写回输入对象',()=>{
  const s=fixture();s.version=1;
  for(const row of s.months['2026-11'].rows){for(const f of C.fields)if(!['base','commission','bonus','subsidy','deduction','insurance','tax'].includes(f))delete row[f];delete row.leaveDays;}
  const original=JSON.stringify(s),before=C.net(s.months['2026-11'].rows[0]),upgraded=C.upgrade(s);
  assert.equal(upgraded.version,2);assert.equal(C.net(upgraded.months['2026-11'].rows[0]),before);assert.equal(JSON.stringify(s),original);
  assert.equal(upgraded.months['2026-11'].rows[0].mealAllowance,0);
});
test('同编号不同姓名建立独立员工，保留原表实发与来源',()=>{
  const s=C.newState(),batch={rows:[imported(4,'甲'),imported(8,'乙')]};
  assert.equal(C.importBatch(s,batch,batchOptions(2)),2);assert.equal(s.employees.length,2);assert.notEqual(s.employees[0].id,s.employees[1].id);
  assert.equal(s.months['2026-09'].rows[0].source.recordedNet,450300);assert.equal(C.net(s.months['2026-09'].rows[0]),450000);
});
test('同文件同一行不重复导入，导入错误保持全部原数据不变',()=>{
  const s=C.newState(),batch={rows:[imported()]};C.importBatch(s,batch,batchOptions());const before=JSON.stringify(s);
  assert.throws(()=>C.importBatch(s,batch,batchOptions()));assert.equal(JSON.stringify(s),before);
  const other={rows:[imported(8,'新员工'),imported(4)]};assert.throws(()=>C.importBatch(s,other,batchOptions(2)));assert.equal(JSON.stringify(s),before);
});
test('同员工同月已有工资不能被导入覆盖；匹配已有员工不新增档案',()=>{
  const s=C.newState(),batch={rows:[imported()]};C.importBatch(s,batch,batchOptions());
  const options=batchOptions();options.rows[0].employeeId=s.employees[0].id;
  const before=JSON.stringify(s);assert.throws(()=>C.importBatch(s,{rows:[imported(8)]},options));assert.equal(JSON.stringify(s),before);
});
test('原表缺实发不当0；差3元不会自动补齐；未核实不能锁账',()=>{
  const s=C.newState();C.importBatch(s,{rows:[imported()]},batchOptions());let row=s.months['2026-09'].rows[0];
  assert.ok(C.issues(row).some(x=>x.includes('3.00')));assert.equal(row.extraPay,0);assert.throws(()=>C.setLock(s,'2026-09',true));
  C.updateRow(s,'2026-09',row.employeeId,{...row,review:{confirmed:true,reason:'公司确认保留三元差额，后续补发',at:new Date().toISOString()}});
  C.setLock(s,'2026-09',true);assert.equal(row.source.recordedNet,450300);
  const missing={...row,source:{...row.source,recordedNet:null},review:undefined};assert.equal(C.pending(missing),true);assert.ok(C.issues(missing).some(x=>x.includes('未填写')));
});
test('待确认归属不能用核实说明绕过锁账；修改金额后清除旧确认',()=>{
  const s=C.newState();C.importBatch(s,{rows:[imported()]},batchOptions(1,C.UNASSIGNED));const row=s.months['2026-09'].rows[0];
  C.updateRow(s,'2026-09',row.employeeId,{...row,review:{confirmed:true,reason:'待确定',at:''}});assert.throws(()=>C.setLock(s,'2026-09',true));
  C.updateRow(s,'2026-09',row.employeeId,{...row,shopId:'offline-a',extraPay:300,review:undefined});assert.equal(C.pending(row),false);assert.equal(row.source.recordedNet,450300);
});
test('禁止混合月份；修改原表月份必须显式确认',()=>{
  const s=C.newState(),batch={rows:[imported()]},options={...batchOptions(),month:'2026-11'};
  assert.throws(()=>C.importBatch(s,batch,options));C.importBatch(s,batch,{...options,allowMonthOverride:true});
  assert.equal(s.months['2026-11'].rows[0].source.month,'2026-09');
  const next=imported(8);next.source.month='2026-10';assert.throws(()=>C.importBatch(C.newState(),{rows:[imported(),next]},{...batchOptions(2),allowMonthOverride:true}));
});
test('删除员工保留已锁账及未锁账工资，未来不再生成，备份可恢复',()=>{
  const s=fixture();C.generate(s,'2026-10');C.setLock(s,'2026-11',true);
  const before=structuredClone(s.months);C.deleteEmployee(s,'employee-1');
  assert.equal(s.employees[0].deleted,true);assert.equal(s.employees[0].active,false);
  assert.deepEqual(s.months,before);assert.match(s.logs[0].message,/删除员工档案/);
  assert.equal(C.generate(s,'2026-12'),0);
  const restored=C.upgrade(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.employees[0].deleted,true);assert.deepEqual(restored.months['2026-11'],before['2026-11']);
});
test('删除不存在或已删除的员工失败，不改变现有数据',()=>{
  const s=fixture();let before=JSON.stringify(s);
  assert.throws(()=>C.deleteEmployee(s,'missing'));assert.equal(JSON.stringify(s),before);
  C.deleteEmployee(s,'employee-1');before=JSON.stringify(s);
  assert.throws(()=>C.deleteEmployee(s,'employee-1'));assert.equal(JSON.stringify(s),before);
});
test('无工资员工也可删除；删除标记必须合法，不能重新标记为在职',()=>{
  const s=fixture();s.months={};C.deleteEmployee(s,'employee-1');
  assert.equal(C.generate(s,'2026-12'),0);C.validate(s);
  s.employees[0].active=true;assert.equal(C.generate(s,'2027-01'),0);assert.throws(()=>C.validate(s));
  s.employees[0].active=false;s.employees[0].deleted='true';assert.throws(()=>C.validate(s));
});
test('导入不能匹配已删除档案，同名新建不会复活或覆盖旧工资',()=>{
  const s=fixture();C.deleteEmployee(s,'employee-1');const before=JSON.stringify(s);
  const options=batchOptions();options.rows[0].employeeId='employee-1';
  assert.throws(()=>C.importBatch(s,{rows:[imported(8,'测试员工')]},options));assert.equal(JSON.stringify(s),before);
  C.importBatch(s,{rows:[imported(8,'测试员工')]},batchOptions());
  assert.equal(s.employees.length,2);assert.equal(s.employees[0].deleted,true);
  assert.notEqual(s.employees[1].id,'employee-1');assert.equal(s.months['2026-11'].rows[0].employeeId,'employee-1');
  C.validate(s);
});
test('员工月度备注按月份与员工隔离，可单独清空，不影响工资',()=>{
  const s=fixture();s.employees.push({...s.employees[0],id:'employee-2'});const wages=structuredClone(s.months);
  C.setEmployeeNote(s,'2026-11','employee-1','本月表现稳定\n安排进阶培训');
  C.setEmployeeNote(s,'2026-11','employee-2','同名员工的独立备注');
  C.setEmployeeNote(s,'2026-12','employee-1','下月跟进');
  assert.equal(s.employeeNotes['2026-11'][0].note,'本月表现稳定\n安排进阶培训');
  C.setEmployeeNote(s,'2026-11','employee-1','  ');
  assert.deepEqual(s.employeeNotes['2026-11'],[{employeeId:'employee-2',note:'同名员工的独立备注'}]);
  assert.equal(s.employeeNotes['2026-12'][0].note,'下月跟进');assert.deepEqual(s.months,wages);C.validate(s);
});
test('未生成工资或工资已锁账时仍可写内部月度备注，不改变锁账和工资',()=>{
  const s=fixture();C.setLock(s,'2026-11',true);const wages=structuredClone(s.months);
  C.setEmployeeNote(s,'2026-11','employee-1','已发薪后的内部跟进');
  C.setEmployeeNote(s,'2026-12','employee-1','尚未生成工资也可备注');
  assert.deepEqual(s.months,wages);assert.equal(s.months['2026-12'],undefined);
  assert.equal(C.setEmployeeNote(s,'2026-11','employee-1','已发薪后的内部跟进'),false);C.validate(s);
});
test('旧备份缺月度备注可兼容读取；新增备注后完整备份可恢复',()=>{
  const s=fixture();delete s.employeeNotes;const before=JSON.stringify(s);
  C.upgrade(s);assert.equal(JSON.stringify(s),before);
  C.setEmployeeNote(s,'2026-11','employee-1','包含换行\n与 <标签>、引号 "');
  const restored=C.upgrade(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.employeeNotes,s.employeeNotes);
});
test('备注拒绝异常月份、未知员工、超长文本及损坏备份',()=>{
  const s=fixture(),before=JSON.stringify(s);
  for(const args of [['2026-13','employee-1','备注'],['2026-11','missing','备注'],['2026-11','employee-1','字'.repeat(1001)],['2026-11','employee-1',null]]){
    assert.throws(()=>C.setEmployeeNote(s,...args));assert.equal(JSON.stringify(s),before);
  }
  for(const notes of [null,[],{'2026-13':[]},{'2026-11':[{employeeId:'missing',note:'备注'}]},{'2026-11':[{employeeId:'employee-1',note:'甲'},{employeeId:'employee-1',note:'乙'}]}]){
    const bad=structuredClone(s);bad.employeeNotes=notes;assert.throws(()=>C.validate(bad));
  }
});
test('删除员工保留已保存月度备注，不允许再修改已删除员工的备注',()=>{
  const s=fixture();C.setEmployeeNote(s,'2026-11','employee-1','应保留的历史备注');C.deleteEmployee(s,'employee-1');
  const before=JSON.stringify(s);assert.throws(()=>C.setEmployeeNote(s,'2026-11','employee-1','覆盖'));
  assert.equal(JSON.stringify(s),before);assert.equal(C.upgrade(JSON.parse(before)).employeeNotes['2026-11'][0].note,'应保留的历史备注');
});
test('提成算式计算百分比、固定金额、每件与四则运算，结果精确到分',()=>{
  assert.equal(C.commissionCents('50000×3%'),150000);
  assert.equal(C.commissionCents('2000'),200000);
  assert.equal(C.commissionCents('120×5'),60000);
  assert.equal(C.commissionCents('(50000-2000)×3%+300'),174000);
  assert.equal(C.commissionCents('＋5000'),500000);
  assert.equal(C.commissionCents('10000÷3'),333333);
  assert.equal(C.commissionCents('0.29'),29);
  assert.equal(C.commissionCents('50%×100'),5000);
  assert.equal(C.commissionCents('1,000×2'),200000);
  assert.equal(C.commissionCents('（100）'),10000);
});
test('提成算式拒绝空、非法字符、括号不匹配、负结果、除零和超限',()=>{
  for(const value of ['','abc','50000xx','3%%','(1+2','1+2)','-5','1/0','100000000000×100','2..5','×5'])assert.throws(()=>C.commissionCents(value),value);
});
test('Excel 导出是真实 ZIP 工作簿，文本不作为公式执行',()=>{
  const Excel=require('../excel.js'),data=Excel.writeWorkbook([{name:'测试',rows:[['姓名','金额'],['=HYPERLINK("https://example.invalid")',{v:123.45,s:2}]]}]);
  assert.equal(data[0],0x50);assert.equal(data[1],0x4b);const text=Buffer.from(data).toString('utf8');
  assert.ok(text.includes('t="inlineStr"'));assert.ok(text.includes('=HYPERLINK'));assert.equal(text.includes('<f>'),false);assert.ok(text.includes('123.45'));
});
