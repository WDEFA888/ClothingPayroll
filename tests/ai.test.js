/* AI 查账引擎本地逻辑测试：只测 executeQuery 的金额计算，不调用外部 AI。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
globalThis.PayrollCore = C;
const AI = require('../ai.js');

function fixture() {
  const s = C.newState();
  s.employees.push({ id: 'e1', name: '张三', role: '导购', shopId: 'offline-a', serviceShopIds: ['offline-a'], base: 500000, active: true, startMonth: '2026-01' });
  s.employees.push({ id: 'e2', name: '李四', role: '店长', shopId: 'offline-b', serviceShopIds: ['offline-b'], base: 600000, active: true, startMonth: '2026-01' });
  s.employees.push({ id: 'e3', name: '王五', role: '客服', shopId: 'taobao-a', serviceShopIds: ['taobao-a'], base: 400000, active: true, startMonth: '2026-01' });
  C.generate(s, '2026-10');
  C.generate(s, '2026-11');
  s.months['2026-11'].rows.forEach(r => {
    if (r.employeeId === 'e1') r.commission = 200000;
    if (r.employeeId === 'e2') r.commission = 50000;
    if (r.employeeId === 'e3') r.commission = 30000;
    r.insurance = 65000;
  });
  return s;
}

test('AI 查询：某月汇总、各店、明细、累计、排名、对比', () => {
  const s = fixture();
  assert.ok(AI.executeQuery({ type: 'month_summary', month: '2026-11' }, s).includes('3 人'));
  assert.ok(AI.executeQuery({ type: 'shop_summary', month: '2026-11' }, s).includes('淘宝店 A'));
  assert.ok(AI.executeQuery({ type: 'employee_detail', employee: '张三', month: '2026-11' }, s).includes('提成 2,000.00 元'));
  assert.ok(AI.executeQuery({ type: 'employee_total', employee: '张三', from: '2026-10', to: '2026-11', metric: 'net' }, s).includes('2 个月'));
  assert.ok(AI.executeQuery({ type: 'ranking', field: 'commission', month: '2026-11', order: 'desc', limit: 3 }, s).includes('1. 张三'));
  assert.ok(AI.executeQuery({ type: 'compare_months', metric: 'net', months: ['2026-10', '2026-11'] }, s).includes('2026-11'));
});

test('AI 查询：待处理清单与异常提醒', () => {
  const s = fixture();
  const row = s.months['2026-11'].rows.find(r => r.employeeId === 'e1');
  row.leaveDays = 100; // 请假 1 天但不填扣款
  assert.ok(AI.executeQuery({ type: 'pending_list', month: '2026-11' }, s).includes('张三'));
  assert.ok(AI.executeQuery({ type: 'anomaly', month: '2026-11' }, s).includes('请假'));
});

test('AI 统计：按店、按岗位、人均/最高/最低', () => {
  const s = fixture();
  const byShop = AI.executeQuery({ type: 'stats', month: '2026-11', field: 'net', groupBy: 'shop', agg: 'sum' }, s);
  assert.ok(byShop.includes('上海实体店 A') && byShop.includes('淘宝店 A'));
  const byRole = AI.executeQuery({ type: 'stats', month: '2026-11', field: 'net', groupBy: 'role', agg: 'avg' }, s);
  assert.ok(byRole.includes('导购') && byRole.includes('店长'));
  assert.ok(AI.executeQuery({ type: 'stats', month: '2026-11', field: 'net', groupBy: 'shop', agg: 'max' }, s).includes('最高'));
});

test('AI 修改建议：只返回草案，不修改数据', () => {
  const s = fixture();
  const before = JSON.stringify(s);
  const r = AI.executeQuery({ type: 'suggest_update', employee: '张三', month: '2026-11', field: 'commission', value: 2500 }, s);
  assert.equal(r.suggest, true);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].to, 250000);
  assert.equal(r.actions[0].employeeId, 'e1');
  assert.equal(JSON.stringify(s), before, '建议不应修改数据');
});

test('AI 批量修改建议：按店生成多人草案', () => {
  const s = fixture();
  const before = JSON.stringify(s);
  const r = AI.executeQuery({ type: 'suggest_batch', shop: '淘宝店 A', month: '2026-11', field: 'mealAllowance', value: 300 }, s);
  assert.equal(r.suggest, true);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].employeeId, 'e3');
  assert.equal(r.actions[0].to, 30000);
  assert.equal(JSON.stringify(s), before);
});

test('AI 建议校验：非法金额、非法字段、无记录时报错', () => {
  const s = fixture();
  assert.throws(() => AI.executeQuery({ type: 'suggest_update', employee: '张三', month: '2026-11', field: 'commission', value: -5 }, s));
  assert.throws(() => AI.executeQuery({ type: 'suggest_update', employee: '张三', month: '2026-11', field: '不存在', value: 100 }, s));
  assert.throws(() => AI.executeQuery({ type: 'suggest_update', employee: '不存在的人', month: '2026-11', field: 'commission', value: 100 }, s));
});

test('AI 建议拒绝已锁账月份', () => {
  const s = fixture();
  C.setLock(s, '2026-11', true);
  assert.throws(() => AI.executeQuery({ type: 'suggest_update', employee: '张三', month: '2026-11', field: 'commission', value: 100 }, s), /锁账/);
  assert.throws(() => AI.executeQuery({ type: 'suggest_batch', month: '2026-11', field: 'mealAllowance', value: 100 }, s), /锁账/);
  // 未锁账月份仍可生成建议
  assert.equal(AI.executeQuery({ type: 'suggest_update', employee: '张三', month: '2026-10', field: 'commission', value: 100 }, s).suggest, true);
});
