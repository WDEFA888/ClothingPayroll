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
  C.setConfirmed(s,'2026-11','employee-1',true); C.setLock(s,'2026-11',true); assert.throws(()=>C.updateRow(s,'2026-11','employee-1',row)); assert.throws(()=>C.generate(s,'2026-11'));
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
  const s=fixture();C.generate(s,'2026-10');C.setConfirmed(s,'2026-11','employee-1',true);C.setLock(s,'2026-11',true);
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
  const s=fixture();C.setConfirmed(s,'2026-11','employee-1',true);C.setLock(s,'2026-11',true);const wages=structuredClone(s.months);
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
  assert.equal(C.commissionCents('３.５×２'),700);
  assert.equal(C.commissionCents('５０００×３％'),15000);
});
test('提成算式拒绝空、非法字符、括号不匹配、负结果、除零和超限',()=>{
  for(const value of ['','abc','50000xx','3%%','(1+2','1+2)','-5','1/0','100000000000×100','2..5','×5'])assert.throws(()=>C.commissionCents(value),value);
  assert.throws(()=>C.commissionCents('('.repeat(300)+'1'+')'.repeat(300)),/过长/);
  assert.equal(C.commissionCents('('.repeat(200)+'1'+')'.repeat(200)),100);
});
test('备份拒绝 __proto__、constructor 等原型污染字段',()=>{
  const s=fixture();
  const top=JSON.parse(JSON.stringify(s).replace(/^\{/, '{"__proto__":{"polluted":true},'));
  assert.throws(()=>C.upgrade(top),/__proto__/);
  assert.equal({}.polluted,undefined);
  const nested=JSON.parse(JSON.stringify(s).replace('"name":"测试员工"','"constructor":{},"name":"测试员工"'));
  assert.throws(()=>C.upgrade(nested),/constructor/);
  const valid=C.upgrade(JSON.parse(JSON.stringify(s)));
  assert.equal(valid.employees.length,1);
});
test('Excel 导出是真实 ZIP 工作簿，文本不作为公式执行',()=>{
  const Excel=require('../excel.js'),data=Excel.writeWorkbook([{name:'测试',rows:[['姓名','金额'],['=HYPERLINK("https://example.invalid")',{v:123.45,s:2}]]}]);
  assert.equal(data[0],0x50);assert.equal(data[1],0x4b);const text=Buffer.from(data).toString('utf8');
  assert.ok(text.includes('t="inlineStr"'));assert.ok(text.includes('=HYPERLINK'));assert.equal(text.includes('<f>'),false);assert.ok(text.includes('123.45'));
});
test('可新增店铺并删除未被引用的店铺',()=>{
  const s=fixture();const id=C.addShop(s,'新开的实体店','线下');
  assert.equal(s.shops.length,5);assert.ok(s.shops.some(sh=>sh.id===id&&sh.name==='新开的实体店'&&sh.type==='线下'));
  assert.match(s.logs[0].message,/新增店铺/);
  C.deleteShop(s,id);assert.equal(s.shops.length,4);assert.equal(s.shops.some(sh=>sh.id===id),false);assert.match(s.logs[0].message,/删除店铺/);
  C.validate(s);
});
test('新增店铺重名时自动改用唯一名称',()=>{
  const s=C.newState();
  const a=C.addShop(s,'上海实体店 A','线下');
  assert.equal(s.shops.find(sh=>sh.id===a).name,'新店铺5');
  const b=C.addShop(s,'上海实体店 A','线上');
  assert.equal(s.shops.find(sh=>sh.id===b).name,'新店铺6');
});
test('有员工或工资引用的店铺不能删除；无引用可删',()=>{
  const s=fixture();
  assert.throws(()=>C.deleteShop(s,'taobao-a'),/引用/);
  assert.throws(()=>C.deleteShop(s,'taobao-b'),/引用/);
  C.deleteShop(s,'offline-a');assert.equal(s.shops.length,3);C.validate(s);
});
test('新增店铺校验空名、类型与数量上限',()=>{
  const s=C.newState();
  assert.throws(()=>C.addShop(s,'   ','线下'),/不能为空/);
  assert.throws(()=>C.addShop(s,'新店','其他'),/类型/);
  while(s.shops.length<100)s.shops.push({id:'s'+s.shops.length,name:'店'+s.shops.length,type:'线下'});
  assert.throws(()=>C.addShop(s,'超限店','线下'),/过多/);
  const empty=C.newState();empty.shops=[];assert.throws(()=>C.validate(empty),/数量/);
});
test('删除最后一家店铺被阻止',()=>{
  const s=C.newState();
  C.deleteShop(s,'taobao-b');C.deleteShop(s,'taobao-a');C.deleteShop(s,'offline-b');
  assert.equal(s.shops.length,1);
  assert.throws(()=>C.deleteShop(s,'offline-a'),/至少需要保留/);
});
test('已删除员工的店铺引用会随删店一并清理',()=>{
  const s=C.newState();
  s.employees.push({id:'emp',name:'临时员工',role:'',shopId:'offline-a',serviceShopIds:['offline-a'],base:0,active:true,startMonth:'2026-01'});
  C.deleteEmployee(s,'emp');
  C.deleteShop(s,'offline-a');
  assert.equal(s.employees[0].shopId,C.UNASSIGNED);
  assert.deepEqual(s.employees[0].serviceShopIds,[]);
  C.validate(s);
});
test('员工可服务多家店铺，不再限于4家',()=>{
  const s=fixture();
  while(s.shops.length<10)s.shops.push({id:'extra'+s.shops.length,name:'分店'+s.shops.length,type:'线下'});
  s.employees[0].serviceShopIds=s.shops.map(sh=>sh.id);
  C.validate(s);
});
test('盈利数据保存、自动带入工资并计算盈利',()=>{
  const s=fixture();
  C.setProfit(s,'2026-11',{revenue:1000000,goodsCost:300000,otherCost:50000,note:'双十一'});
  const row=C.profitRows(s).find(r=>r.month==='2026-11');
  assert.equal(row.payroll,450000);
  assert.equal(row.profit,1000000-300000-50000-450000);
  assert.equal(row.note,'双十一');
  C.validate(s);
});
test('盈利按月份升序排列，负盈利也可计算',()=>{
  const s=fixture();
  C.setProfit(s,'2026-12',{revenue:100000,goodsCost:0,otherCost:0,note:''});
  C.setProfit(s,'2026-10',{revenue:200000,goodsCost:0,otherCost:0,note:''});
  C.setProfit(s,'2026-11',{revenue:100000,goodsCost:300000,otherCost:0,note:''});
  const rows=C.profitRows(s);
  assert.deepEqual(rows.map(r=>r.month),['2026-10','2026-11','2026-12']);
  assert.ok(rows.find(r=>r.month==='2026-11').profit<0);
});
test('盈利金额全空时清除该月记录',()=>{
  const s=fixture();
  C.setProfit(s,'2026-11',{revenue:1000,goodsCost:0,otherCost:0,note:''});
  assert.ok(s.profits['2026-11']);
  assert.equal(C.setProfit(s,'2026-11',{revenue:0,goodsCost:0,otherCost:0,note:''}),false);
  assert.equal(s.profits['2026-11'],undefined);
});
test('删除盈利记录不影响工资',()=>{
  const s=fixture();
  C.setProfit(s,'2026-11',{revenue:1000,goodsCost:0,otherCost:0,note:''});
  assert.equal(C.deleteProfit(s,'2026-11'),true);
  assert.equal(s.profits['2026-11'],undefined);
  assert.equal(C.deleteProfit(s,'2026-11'),false);
  assert.equal(s.months['2026-11'].rows.length,1);
});
test('盈利数据校验拒绝非法月份、金额与备注',()=>{
  const s=fixture();
  assert.throws(()=>C.setProfit(s,'2026-13',{revenue:100,goodsCost:0,otherCost:0,note:''}),/月份/);
  assert.throws(()=>C.setProfit(s,'2026-11',{revenue:-1,goodsCost:0,otherCost:0,note:''}),/金额/);
  assert.throws(()=>C.setProfit(s,'2026-11',{revenue:0,goodsCost:0,otherCost:0,note:'x'.repeat(201)}),/备注/);
  s.profits['bad']={revenue:0,goodsCost:0,otherCost:0,note:''};
  assert.throws(()=>C.validate(s),/月份/);
});
test('旧数据没有盈利字段时可正常校验并补空对象',()=>{
  const s=fixture();
  delete s.profits;
  C.validate(s);
  assert.deepEqual(s.profits,{});
});
test('员工工资历史按月份升序汇总',()=>{
  const s=fixture();
  s.months['2026-11'].rows[0].commission=10000;
  C.generate(s,'2026-12');
  const h=C.employeeHistory(s,'employee-1');
  assert.deepEqual(h.map(x=>x.month),['2026-11','2026-12']);
  assert.equal(h[0].commission,10000);
  assert.equal(h[1].base,450000);
  assert.equal(h[1].net,450000);
});
test('年度汇总按年筛选每人每月一行',()=>{
  const s=fixture();
  C.generate(s,'2026-12');
  const rows=C.yearRows(s,'2026');
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.month),['2026-11','2026-12']);
  assert.equal(rows[0].name,'测试员工');
  assert.equal(C.yearRows(s,'2025').length,0);
});
test('年度汇总导出是真实 ZIP 工作簿',()=>{
  const Excel=require('../excel.js');
  const buf=Excel.annualWorkbook([{month:'2026-11',name:'测试',role:'客服',shopName:'淘宝店 A',base:450000,mealAllowance:0,commission:10000,bonus:0,gross:460000,deductions:0,net:460000}],'2026年工资汇总');
  const bytes=new Uint8Array(buf);
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4B);
  assert.ok(buf.length>500);
});
test('逐人确认后才能锁账；锁账后不能再改确认',()=>{
  const s=fixture();
  assert.throws(()=>C.setLock(s,'2026-11',true),/确认/);
  assert.equal(C.setConfirmed(s,'2026-11','employee-1',true),true);
  assert.equal(s.months['2026-11'].rows[0].review.confirmed,true);
  assert.equal(s.months['2026-11'].rows[0].review.reason,'老板已确认');
  C.setLock(s,'2026-11',true);
  assert.throws(()=>C.setConfirmed(s,'2026-11','employee-1',false),/锁账/);
});
test('取消确认清除说明；重复确认不产生日志',()=>{
  const s=fixture();
  C.setConfirmed(s,'2026-11','employee-1',true);
  assert.equal(C.setConfirmed(s,'2026-11','employee-1',true),false);
  C.setConfirmed(s,'2026-11','employee-1',false);
  assert.equal(s.months['2026-11'].rows[0].review.confirmed,false);
  assert.equal(s.months['2026-11'].rows[0].review.reason,'');
});
test('员工手机号与微信号可选填并校验长度',()=>{
  const s=fixture();
  s.employees[0].phone='13800138000';s.employees[0].wechat='wx_abc';
  C.validate(s);
  s.employees[0].phone='x'.repeat(31);assert.throws(()=>C.validate(s),/手机号/);
  s.employees[0].phone='138';s.employees[0].wechat='y'.repeat(61);assert.throws(()=>C.validate(s),/微信/);
});
