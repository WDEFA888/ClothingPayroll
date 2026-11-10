/* 工资计算与备份校验；金额统一使用整数分，天数使用百分之一天。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX = 10000000000;
  const UNASSIGNED = 'unassigned';
  const incomeFields = ['base', 'mealAllowance', 'commission', 'bonus', 'housingAllowance', 'insuranceAllowance', 'subsidy', 'extraPay', 'depositRefund'];
  const deductionFields = ['leaveDeduction', 'lateness', 'clothing', 'advance', 'depositDeduction', 'deduction', 'insurance', 'tax'];
  const fields = [...incomeFields, ...deductionFields];
  const oldFields = ['base', 'commission', 'bonus', 'subsidy', 'deduction', 'insurance', 'tax'];
  const labels = {base: '基本工资', mealAllowance: '饭贴', commission: '提成', bonus: '奖金', housingAllowance: '房贴', insuranceAllowance: '社保（应发项）', subsidy: '其他补贴', extraPay: '其他补发', depositRefund: '退还押金', leaveDeduction: '请假扣款', lateness: '迟到扣款', clothing: '买衣服扣款', advance: '预支工资抵扣', depositDeduction: '押金扣款（历史项）', deduction: '其他扣款', insurance: '个人社保公积金扣款', tax: '个人所得税'};
  function assert(ok, message) { if (!ok) throw new Error(message); }
  function noDanger(obj, label) {
    // JSON.parse 可以把 __proto__ 变成自有属性；禁止它，避免恢复备份时污染原型。
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(label + '含有不允许的字段：' + key);
    }
  }
  function monthValid(value) { return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value); }
  function text(value, max, label) { assert(typeof value === 'string' && value.length <= max, label + '格式不正确'); }
  function centsValid(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX; }
  function money(value) {
    const s = String(value).trim();
    assert(/^\d{1,9}(\.\d{1,2})?$/.test(s), '金额必须是非负数字，最多两位小数');
    const parts = s.split('.');
    const cents = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
    assert(centsValid(cents), '单项金额不能超过一亿元');
    return cents;
  }
  function days(value) { const n = money(value); assert(n <= 3100, '请假天数必须在 0—31 天之间'); return n; }
  function commissionCents(input) {
    // 仅支持数字与 + - × ÷ % 括号的算式，返回整数分；不执行任何脚本。
    if (String(input).length > 500) throw new Error('算式过长，请简化后再试');
    const s = String(input)
      .replace(/[×＋－÷％（）]/g, c => ({'×':'*','＋':'+','－':'-','÷':'/','％':'%','（':'(','）':')'}[c]))
      .replace(/[，,]/g, '')
      .replace(/[\s　]/g, '');
    if (!s) throw new Error('请先填写提成算式');
    let pos = 0;
    function number() {
      const match = /^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(pos));
      if (!match) throw new Error('算式里出现无法识别的数字，请检查：' + s.slice(pos));
      pos += match[0].length; return Number(match[0]);
    }
    function expr() {
      let value = term();
      while (s[pos] === '+' || s[pos] === '-') { const op = s[pos++], rhs = term(); value = op === '+' ? value + rhs : value - rhs; }
      return value;
    }
    function term() { let value = factor(); while (s[pos] === '*' || s[pos] === '/') { const op = s[pos++], rhs = factor(); value = op === '*' ? value * rhs : value / rhs; } return value; }
    function factor() { if (s[pos] === '-') { pos++; return -factor(); } if (s[pos] === '+') { pos++; return factor(); } return atom(); }
    function atom() { let value; if (s[pos] === '(') { pos++; value = expr(); if (s[pos] !== ')') throw new Error('算式缺少右括号'); pos++; } else value = number(); if (s[pos] === '%') { pos++; value /= 100; } return value; }
    const result = expr();
    if (pos < s.length) throw new Error('算式末尾有多余内容：' + s.slice(pos));
    if (!Number.isFinite(result)) throw new Error('算式结果无效，请检查是否除以了 0');
    if (result < 0) throw new Error('提成结果不能为负数');
    const cents = Math.round(result * 100);
    if (!Number.isSafeInteger(cents) || cents > MAX) throw new Error('提成结果超过一亿元');
    return cents;
  }
  function amount(cents) { return (cents / 100).toFixed(2); }
  function dayText(value) { return String(value / 100); }
  function gross(row) { return incomeFields.reduce((total, key) => total + (row[key] ?? 0), 0); }
  function deductions(row) { return deductionFields.reduce((total, key) => total + (row[key] ?? 0), 0); }
  function net(row) { return gross(row) - deductions(row); }
  function blankAmounts() { return Object.fromEntries(fields.map(f => [f, 0])); }
  function newState() {
    return {app: 'clothing-payroll', version: 2, employees: [], months: {}, employeeNotes: {}, logs: [], shops: [
      {id: 'offline-a', name: '上海实体店 A', type: '线下'}, {id: 'offline-b', name: '上海实体店 B', type: '线下'},
      {id: 'taobao-a', name: '淘宝店 A', type: '线上'}, {id: 'taobao-b', name: '淘宝店 B', type: '线上'}]};
  }
  function upgrade(value) {
    if (value && value.app === 'clothing-payroll' && value.version === 1) {
      value = structuredClone(value);
      Object.values(value.months || {}).forEach(m => (m.rows || []).forEach(r => {
        fields.filter(f => !oldFields.includes(f)).forEach(f => { if (r[f] === undefined) r[f] = 0; });
        if (r.leaveDays === undefined) r.leaveDays = 0;
      }));
      value.version = 2;
    }
    return validate(value);
  }
  function validateSource(source) {
    assert(source && typeof source === 'object', '原表来源格式不正确');
    noDanger(source, '原表来源');
    text(source.fileName, 260, '源文件名'); text(source.sheet, 100, '工作表名'); text(source.section, 200, '原表标题'); text(source.number, 60, '原表编号');
    assert(typeof source.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(source.fingerprint), '源文件指纹不正确');
    assert(Number.isSafeInteger(source.row) && source.row > 0 && source.row <= 1048576, '原表行号不正确');
    assert(source.recordedNet === null || centsValid(source.recordedNet), '原表实发金额不正确');
    assert(source.month === '' || monthValid(source.month), '原表月份不正确');
    assert(Array.isArray(source.warnings) && source.warnings.length <= 30, '原表核对提示不正确');
    source.warnings.forEach(w => text(w, 500, '核对提示'));
    assert(Array.isArray(source.cells) && source.cells.length <= 50, '原始单元格记录不正确');
    source.cells.forEach(cell => {text(cell.ref, 20, '单元格位置'); text(cell.label, 100, '单元格标题'); text(cell.raw, 2000, '原始单元格值');});
  }
  function validate(state) {
    assert(state && state.app === 'clothing-payroll' && state.version === 2, '不是本软件支持的备份文件');
    noDanger(state, '备份');
    assert(Array.isArray(state.shops) && state.shops.length === 4, '备份必须包含四家实际店铺');
    const shops = new Set([UNASSIGNED]);
    state.shops.forEach(s => {
      noDanger(s, '店铺');
      text(s.id, 80, '店铺编号'); assert(s.id && !shops.has(s.id), '店铺编号重复'); shops.add(s.id);
      text(s.name, 60, '店名'); assert(s.name.trim(), '店名不能为空'); assert(['线下', '线上'].includes(s.type), '店铺类型不正确');
    });
    assert(Array.isArray(state.employees) && state.employees.length <= 10000, '员工数据格式不正确或超过一万人');
    const employees = new Set();
    state.employees.forEach(e => {
      noDanger(e, '员工');
      text(e.id, 80, '员工编号'); assert(e.id && !employees.has(e.id), '员工编号重复'); employees.add(e.id);
      text(e.name, 60, '姓名'); assert(e.name.trim(), '姓名不能为空'); text(e.role, 60, '岗位');
      assert(shops.has(e.shopId), '员工所属店铺不存在');
      assert(Array.isArray(e.serviceShopIds) && e.serviceShopIds.length <= 4 && e.serviceShopIds.every(s => shops.has(s)) && new Set(e.serviceShopIds).size === e.serviceShopIds.length, '服务店铺格式不正确');
      assert(typeof e.active === 'boolean' && monthValid(e.startMonth), '员工状态或工资启用月份不正确');
      assert(e.deleted === undefined || typeof e.deleted === 'boolean', '员工删除标记不正确');
      assert(!e.deleted || !e.active, '已删除员工不能标记为在职');
      assert(centsValid(e.base), '员工底薪不正确');
    });
    assert(state.months && typeof state.months === 'object' && !Array.isArray(state.months) && Object.keys(state.months).length <= 1200, '月份数据不正确');
    Object.entries(state.months).forEach(([key, month]) => {
      assert(monthValid(key) && month && typeof month.locked === 'boolean', '月份格式不正确');
      noDanger(month, '月份');
      assert(Array.isArray(month.rows) && month.rows.length <= 10000, '工资明细格式不正确');
      const ids = new Set();
      month.rows.forEach(r => {
        noDanger(r, '工资记录');
        assert(employees.has(r.employeeId) && !ids.has(r.employeeId), '工资表存在未知员工或重复员工'); ids.add(r.employeeId);
        text(r.name, 60, '工资表姓名'); assert(r.name.trim(), '工资表姓名不能为空'); text(r.role, 60, '工资表岗位');
        assert(shops.has(r.shopId), '工资表所属店铺不存在');
        fields.forEach(f => assert(centsValid(r[f]), '工资项目金额不正确：' + labels[f]));
        assert(Number.isSafeInteger(r.leaveDays) && r.leaveDays >= 0 && r.leaveDays <= 3100, '请假天数不正确');
        text(r.note, 1000, '工资备注');
        if (r.source !== undefined) validateSource(r.source);
        if (r.review !== undefined) {
          assert(r.review && typeof r.review.confirmed === 'boolean', '核实状态不正确');
          noDanger(r.review, '核实信息');
          text(r.review.reason, 1000, '核实说明'); text(r.review.at, 40, '核实时间');
          assert(!r.review.confirmed || r.review.reason.trim().length >= 2, '确认核实需要填写说明');
        }
      });
    });
    if (state.employeeNotes !== undefined) {
      assert(state.employeeNotes && typeof state.employeeNotes === 'object' && !Array.isArray(state.employeeNotes) && Object.keys(state.employeeNotes).length <= 1200, '员工月度备注格式不正确');
      Object.entries(state.employeeNotes).forEach(([month, notes]) => {
        assert(monthValid(month) && Array.isArray(notes) && notes.length <= 10000, '员工备注月份或记录格式不正确');
        const ids = new Set();
        notes.forEach(entry => {
          assert(entry && employees.has(entry.employeeId) && !ids.has(entry.employeeId), '员工月度备注存在未知员工或重复记录');
          noDanger(entry, '员工备注');
          ids.add(entry.employeeId); text(entry.note, 1000, '员工月度备注');
        });
      });
    }
    assert(Array.isArray(state.logs) && state.logs.length <= 500, '操作记录格式不正确');
    state.logs.forEach(l => { noDanger(l, '操作记录'); text(l.at, 40, '记录时间'); text(l.message, 4000, '操作记录'); });
    return state;
  }
  function issues(row) {
    const result = [];
    if (row.shopId === UNASSIGNED) result.push('店铺归属待确认');
    if (row.leaveDays > 0 && row.leaveDeduction === 0) result.push('有请假天数但未填请假扣款，需确认是否为带薪假或缺项');
    if (row.source) {
      if (row.source.recordedNet === null) result.push('原表未填写实发金额');
      else if (net(row) !== row.source.recordedNet) result.push('软件计算比原表实发' + (net(row) > row.source.recordedNet ? '多 ' : '少 ') + amount(Math.abs(net(row) - row.source.recordedNet)) + ' 元');
      result.push(...row.source.warnings);
    }
    return [...new Set(result)];
  }
  function pending(row) { return row.shopId === UNASSIGNED || (issues(row).length > 0 && !row.review?.confirmed); }
  function log(state, message) {
    state.logs.unshift({at: new Date().toISOString(), message: message.length > 3900 ? message.slice(0, 3900) + '…（内容截断，完整工资见备份）' : message});
    state.logs.length = Math.min(state.logs.length, 500);
  }
  function setEmployeeNote(state, monthKey, employeeId, note) {
    assert(monthValid(monthKey), '请选择 2000—2099 年内的备注月份');
    const employee = state.employees.find(e => e.id === employeeId && !e.deleted);
    assert(employee, '员工档案不存在或已删除');
    text(note, 1000, '员工月度备注');
    if (!note.trim()) note = '';
    const notes = state.employeeNotes?.[monthKey] || [], index = notes.findIndex(entry => entry.employeeId === employeeId);
    if ((index < 0 && !note) || (index >= 0 && notes[index].note === note)) return false;
    if (!state.employeeNotes) state.employeeNotes = {};
    if (!note) notes.splice(index, 1);
    else if (index < 0) notes.push({employeeId, note});
    else notes[index].note = note;
    if (notes.length) state.employeeNotes[monthKey] = notes;
    else delete state.employeeNotes[monthKey];
    log(state, monthKey + (note ? ' 保存 ' : ' 清空 ') + employee.name + ' 的员工月度备注（内部使用，不进入个人工资条）');
    return true;
  }
  function deleteEmployee(state, employeeId) {
    const employee = state.employees.find(e => e.id === employeeId && !e.deleted);
    assert(employee, '员工档案不存在或已删除');
    // 保留关联档案，避免破坏历史工资、锁账记录及旧备份的引用校验。
    employee.deleted = true; employee.active = false;
    log(state, '删除员工档案：' + employee.name + '（编号：' + employee.id + '）；已生成工资全部保留，后续不再自动生成工资');
  }
  function generate(state, monthKey) {
    assert(monthValid(monthKey), '请选择 2000—2099 年内的月份');
    const month = state.months[monthKey] || {locked: false, rows: []};
    assert(!month.locked, '本月已锁账，不能增加员工');
    const ids = new Set(month.rows.map(r => r.employeeId));
    const added = state.employees.filter(e => !e.deleted && e.active && e.startMonth <= monthKey && !ids.has(e.id));
    added.forEach(e => month.rows.push({...blankAmounts(), employeeId: e.id, name: e.name, role: e.role, shopId: e.shopId, base: e.base, leaveDays: 0, note: ''}));
    state.months[monthKey] = month;
    log(state, monthKey + ' 生成/补充工资表，新增 ' + added.length + ' 人；已有工资未改动');
    return added.length;
  }
  function updateRow(state, monthKey, employeeId, values) {
    const month = state.months[monthKey];
    assert(month && !month.locked, '本月已锁账或尚未生成工资表');
    const row = month.rows.find(r => r.employeeId === employeeId);
    assert(row, '员工工资记录不存在');
    const before = fields.map(f => labels[f] + ':' + amount(row[f])).join('，') + '；备注:' + row.note;
    fields.forEach(f => assert(centsValid(values[f]), '金额不正确：' + labels[f]));
    text(values.note, 1000, '备注');
    fields.forEach(f => row[f] = values[f]); row.note = values.note;
    if (values.leaveDays !== undefined) row.leaveDays = values.leaveDays;
    if (values.shopId !== undefined) row.shopId = values.shopId;
    row.review = values.review ? structuredClone(values.review) : {confirmed: false, reason: '', at: ''};
    log(state, monthKey + ' 修改 ' + row.name + ' 工资。原值：' + before + '。新值：' + fields.map(f => labels[f] + ':' + amount(row[f])).join('，') + '；备注:' + row.note + '；核实说明:' + row.review.reason);
  }
  function setLock(state, monthKey, locked, reason) {
    const month = state.months[monthKey]; assert(month && month.rows.length, '请先生成有员工的工资表');
    assert(month.locked !== locked, '锁账状态未发生变化');
    assert(locked || (typeof reason === 'string' && reason.trim().length >= 2), '解锁需要填写至少两个字的原因');
    assert(!reason || reason.length <= 500, '解锁原因过长');
    if (locked) assert(!month.rows.some(pending), '仍有店铺未分配或工资差异/缺项未核实，请逐人处理后再锁账');
    month.locked = locked; log(state, monthKey + (locked ? ' 已审核锁账' : ' 解锁，原因：' + reason.trim()));
  }
  function applyImport(state, batch, options) {
    const monthKey = options.month;
    assert(monthValid(monthKey), '导入月份不正确');
    const month = state.months[monthKey] || {locked: false, rows: []};
    assert(!month.locked, '导入目标月份已锁账，不能导入');
    const selected = options.rows.filter(r => r.selected);
    assert(selected.length > 0, '请至少选择一条工资记录');
    assert(options.shopId === UNASSIGNED || state.shops.some(s => s.id === options.shopId), '导入店铺不存在');
    const sourceMonths = new Set(selected.map(r => batch.rows[r.index]?.source.month).filter(Boolean));
    assert(sourceMonths.size <= 1, '请按原表月份分批导入，不能将不同月份合并');
    assert(options.allowMonthOverride || [...sourceMonths].every(m => m === monthKey), '导入月份与原表不同，需要明确确认');
    const ids = new Set(month.rows.map(r => r.employeeId));
    const knownSources = new Set(Object.values(state.months).flatMap(m => m.rows.filter(r => r.source).map(r => r.source.fingerprint + '/' + r.source.sheet + '/' + r.source.row)));
    selected.forEach(selection => {
      const incoming = batch.rows[selection.index]; assert(incoming, '导入行不存在');
      const sourceId = incoming.source.fingerprint + '/' + incoming.source.sheet + '/' + incoming.source.row;
      assert(!knownSources.has(sourceId), '原表第 ' + incoming.source.row + ' 行已导入，不能重复导入');
      let employee;
      if (selection.employeeId) { employee = state.employees.find(e => e.id === selection.employeeId && !e.deleted); assert(employee, '选中的员工档案不存在或已删除'); }
      else {
        employee = {id: crypto.randomUUID(), name: incoming.name, role: '', shopId: options.shopId,
          serviceShopIds: options.shopId === UNASSIGNED ? [] : [options.shopId], base: incoming.base, active: true, startMonth: monthKey};
        state.employees.push(employee);
      }
      assert(!ids.has(employee.id), '所选员工在 ' + monthKey + ' 已有工资，未覆盖任何记录。请取消该行或重新选择员工');
      ids.add(employee.id); knownSources.add(sourceId);
      const shopId = options.shopId === UNASSIGNED ? employee.shopId : options.shopId;
      month.rows.push({...blankAmounts(), ...structuredClone(incoming), employeeId: employee.id, role: employee.role, shopId,
        review: {confirmed: false, reason: '', at: ''}});
    });
    state.months[monthKey] = month;
    log(state, monthKey + ' 从 Excel 导入 ' + selected.length + ' 条工资，保留原表实发与来源，未覆盖已有工资');
    return selected.length;
  }
  function importBatch(state, batch, options) {
    const next = structuredClone(state);
    const count = applyImport(next, batch, options);
    validate(next);
    Object.assign(state, next);
    return count;
  }
  function csvCell(value) {
    let str = String(value ?? '');
    if (/^[\s﻿]*[=+\-@]/.test(str) || /^[\t\r\n]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  }
  function csv(rows) { return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  return {fields, incomeFields, deductionFields, labels, MAX, UNASSIGNED, money, days, dayText, amount, commissionCents, gross, net, deductions, blankAmounts, newState, upgrade, validate, issues, pending, log, setEmployeeNote, deleteEmployee, generate, updateRow, setLock, importBatch, csv, monthValid};
});
