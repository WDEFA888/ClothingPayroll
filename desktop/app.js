/* 单机界面：正式与演示空间完全隔离，不发送网络请求。 */
'use strict';
(() => {
  const C = window.PayrollCore, Excel = window.PayrollExcel;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconPaths = {
    "shirt": "<path d=\"M15 4l6 2v5h-3v8a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-8h-3v-5l6 -2a3 3 0 0 0 6 0\" />",
    "store": "<path d=\"M3 21l18 0\" /> <path d=\"M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4\" /> <path d=\"M5 21l0 -10.15\" /> <path d=\"M19 21l0 -10.15\" /> <path d=\"M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4\" />",
    "wallet": "<path d=\"M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12\" /> <path d=\"M20 12v4h-4a2 2 0 0 1 0 -4h4\" />",
    "users": "<path d=\"M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" /> <path d=\"M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2\" /> <path d=\"M16 3.13a4 4 0 0 1 0 7.75\" /> <path d=\"M21 21v-2a4 4 0 0 0 -3 -3.85\" />",
    "settings": "<path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065\" /> <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />",
    "book": "<path d=\"M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /> <path d=\"M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /> <path d=\"M3 6l0 13\" /> <path d=\"M12 6l0 13\" /> <path d=\"M21 6l0 13\" />",
    "hard-drive": "<path d=\"M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0\" /> <path d=\"M4 6v6a8 3 0 0 0 16 0v-6\" /> <path d=\"M4 12v6a8 3 0 0 0 16 0v-6\" />",
    "arrow-up-right": "<path d=\"M17 7l-10 10\" /> <path d=\"M8 7l9 0l0 9\" />",
    "chevron-right": "<path d=\"M9 6l6 6l-6 6\" />",
    "grid": "<path d=\"M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /> <path d=\"M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /> <path d=\"M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /> <path d=\"M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" />",
    "calendar": "<path d=\"M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12\" /> <path d=\"M16 3v4\" /> <path d=\"M8 3v4\" /> <path d=\"M4 11h16\" />",
    "search": "<path d=\"M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" /> <path d=\"M21 21l-6 -6\" />",
    "receipt": "<path d=\"M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2\" />",
    "minus-circle": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M9 12l6 0\" />",
    "info": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 9h.01\" /> <path d=\"M11 12h1v4h1\" />",
    "alert-circle": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 8v4\" /> <path d=\"M12 16h.01\" />",
    "check-circle": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M9 12l2 2l4 -4\" />",
    "clock": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 7v5l3 3\" />",
    "lock": "<path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M8 11v-4a4 4 0 1 1 8 0v4\" />",
    "unlock": "<path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M8 11v-5a4 4 0 0 1 8 0\" />",
    "table": "<path d=\"M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14\" /> <path d=\"M3 10h18\" /> <path d=\"M10 3v18\" />",
    "upload": "<path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2\" /> <path d=\"M7 9l5 -5l5 5\" /> <path d=\"M12 4l0 12\" />",
    "download": "<path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2\" /> <path d=\"M7 11l5 5l5 -5\" /> <path d=\"M12 4l0 12\" />",
    "file-text": "<path d=\"M14 3v4a1 1 0 0 0 1 1h4\" /> <path d=\"M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2\" /> <path d=\"M9 9l1 0\" /> <path d=\"M9 13l6 0\" /> <path d=\"M9 17l6 0\" />",
    "plus": "<path d=\"M12 5l0 14\" /> <path d=\"M5 12l14 0\" />",
    "history": "<path d=\"M12 8l0 4l2 2\" /> <path d=\"M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5\" />",
    "trash": "<path d=\"M4 7l16 0\" /> <path d=\"M10 11l0 6\" /> <path d=\"M14 11l0 6\" /> <path d=\"M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12\" /> <path d=\"M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3\" />",
    "calculator": "<path d=\"M4 5a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -14\" /> <path d=\"M8 8a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1l0 -1\" /> <path d=\"M8 14l0 .01\" /> <path d=\"M12 14l0 .01\" /> <path d=\"M16 14l0 .01\" /> <path d=\"M8 17l0 .01\" /> <path d=\"M12 17l0 .01\" /> <path d=\"M16 17l0 .01\" />"
  };;
  function icon(name) { return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.info)+'</svg>'; }
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  function person(name, description) {
    return `<div class="person"><strong class="person-name" title="${escape(name)}">${escape(name)}</strong><small class="person-meta" title="${escape(description)}">${escape(description)}</small></div>`;
  }
  function statusText(text, status='neutral', hint='') {
    return `<span class="status-text ${status}"${hint?' title="'+escape(hint)+'"':''}><i class="status-dot" aria-hidden="true"></i>${escape(text)}</span>`;
  }
  const isDemo = new URLSearchParams(location.search).get('demo') === '1';
  const key = 'yizhang-payroll-v1' + (isDemo ? '-demo' : '');
  const today = new Date();
  const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  let state = C.newState(), raw = null, blocked = false, toastTimer, slipEmployee = null, stagedImport = null;
  let employeeNoteMonth = currentMonth;
  const noteDrafts = new Map();
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function safe(fn) { return (...args) => { try { const result = fn(...args); if (result && result.catch) result.catch(error => alert(error.message)); } catch (error) { alert(error.message); } }; }
  function fail(message) { $('fatal').textContent = message; $('fatal').hidden = false; $('save-status').textContent = '⚠ 暂停写入'; }
  try {
    raw = localStorage.getItem(key);
    if (raw !== null) state = C.upgrade(JSON.parse(raw));
  } catch (error) {
    blocked = true;
    fail('无法读取原有数据，已暂停写入，未覆盖原数据。请先到“店铺与备份”下载原始数据，再恢复有效备份。原因：' + error.message);
  }
  function commit(action, restoring = false) {
    if (blocked && !restoring) throw new Error('当前已暂停写入。请按页面顶部提示处理，避免覆盖原数据。');
    const onDisk = localStorage.getItem(key);
    if (onDisk !== raw) {
      blocked = true; fail('另一个页面已修改数据。当前页面暂停写入，请刷新后再继续。');
      throw new Error('数据已在另一个页面中变化，未保存本次修改，请刷新。');
    }
    const next = structuredClone(state);
    action(next);
    C.validate(next);
    const serialized = JSON.stringify(next);
    localStorage.setItem(key, serialized);
    state = next; raw = serialized; blocked = false;
    if (!isDemo && window.desktop?.saveData) window.desktop.saveData(serialized).catch(() => {});
    $('fatal').hidden = true;
    $('save-status').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', {hour12: false});
    render();
  }
  if (isDemo) {
    $('demo-banner').hidden = false;
    document.title = '演示空间 · 衣账工资助手';
    if (raw === null && !blocked) {
      safe(() => commit(s => {
        const names = ['示例·陈导购', '示例·林店长', '示例·周客服', '示例·许运营'];
        s.shops.forEach((shop, i) => s.employees.push({id: 'demo-' + i, name: names[i], role: ['导购','店长','客服','运营'][i], shopId: shop.id,
          serviceShopIds: i === 3 ? ['taobao-a','taobao-b'] : [shop.id], base: [450000,600000,480000,650000][i], active: true, startMonth: currentMonth}));
        C.generate(s, currentMonth);
        s.months[currentMonth].rows.forEach((r, i) => {r.commission = [125000,210000,90000,180000][i]; r.subsidy = 20000; r.insurance = 65000; r.tax = 0; r.note = '虚构演示：提成与各项扣款均非公司实际规则。';});
        C.log(s, '创建隔离的虚构演示数据');
      }))();
    }
  }
  $('month').value = Object.keys(state.months).sort().at(-1) || currentMonth;
  employeeNoteMonth = $('month').value;
  function shopName(id) { return id === C.UNASSIGNED ? '待确认归属' : state.shops.find(s => s.id === id)?.name || '未知店铺'; }
  function monthKey() { const value = $('month').value; if (!C.monthValid(value)) throw new Error('请选择 2000—2099 年内的月份'); return value; }
  function monthData() { return state.months[$('month').value]; }
  function options(selected, all = false) {
    const shops = [...state.shops, {id: C.UNASSIGNED, name: '待确认归属'}];
    return (all ? '<option value="">全部店铺</option>' : '') + shops.map(s => `<option value="${escape(s.id)}"${s.id === selected ? ' selected' : ''}>${escape(s.name)}</option>`).join('');
  }
  function reviewText(row) { return C.pending(row) ? '待核实' : row.review?.confirmed ? '已说明核实' : row.source ? '金额一致' : '待核对'; }
  function originalNet(row) { return row.source?.recordedNet == null ? '—' : C.amount(row.source.recordedNet); }
  function visibleRows() {
    const filter = $('shop-filter').value, query = $('search').value.trim().toLowerCase();
    return (monthData()?.rows || []).filter(r => (!filter || r.shopId === filter) && (!query || (r.name + ' ' + r.role).toLowerCase().includes(query)));
  }
  function restDeduction(row) { return row.lateness + row.deduction + row.insurance + row.tax; }
  function eligibleMissing() {
    const ids = new Set((monthData()?.rows || []).map(r => r.employeeId));
    return state.employees.filter(e => !e.deleted && e.active && e.startMonth <= $('month').value && !ids.has(e.id));
  }
  function renderSummary(rows, hasRows) {
    const sum = fn => rows.reduce((total,row)=>total+fn(row),0);
    $('summary-people').textContent = rows.length;
    $('summary-people-note').textContent = hasRows ? '本月共 '+monthData().rows.length+' 人' : '暂无工资记录';
    for(const [id,fn] of [['summary-gross',C.gross],['summary-deductions',C.deductions],['summary-net',C.net]]){
      const value=sum(fn),el=$(id);
      el.textContent=hasRows?(value/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
      el.classList.toggle('compact-value',el.textContent.length>10);
      el.classList.toggle('long-value',el.textContent.length>15);
      el.classList.toggle('negative',value<0);
    }
    const pending=rows.filter(C.pending).length;
    $('summary-net-note').textContent=pending?pending+' 人待核实':'计算结果，非发薪凭证';
    $('summary-scope').textContent=($('month').value||'所选月份')+' · '+($('shop-filter').value?shopName($('shop-filter').value):'全部店铺')+($('search').value.trim()?' · 已筛选':'');
    $('page-meta').textContent=($('month').value||'所选月份')+' · 共 '+rows.length+' 人'+($('shop-filter').value||$('search').value.trim()?'（已筛选）':'');
  }
  function renderPayroll() {
    const month = monthData(), rows = visibleRows(), hasRows = !!month?.rows.length;
    renderSummary(rows,hasRows);
    $('month-title').textContent = ($('month').value || '所选月份') + ' 工资明细';
    $('row-count').textContent = hasRows ? `当前显示 ${rows.length} / ${month.rows.length} 位员工` : '从导入或新增员工开始';
    const pending = (month?.rows || []).filter(C.pending).length;
    $('lock-badge').innerHTML = statusText(!hasRows ? '未生成' : month.locked ? '已锁账' : pending ? `${pending} 人待核实` : '待核对', !hasRows ? 'neutral' : month.locked ? 'locked' : 'draft');
    $('lock').disabled = !hasRows || blocked;
    $('lock').innerHTML = icon(month?.locked?'lock':'check-circle')+(month?.locked ? '解锁修改' : '审核锁账');
    $('generate').innerHTML = icon('plus')+(hasRows ? '补充在职员工' : '生成本月工资表');
    $('generate').disabled = !!month?.locked || blocked || (hasRows && !eligibleMissing().length);
    $('export-payroll').disabled = !rows.length || blocked; $('export-excel').disabled = !rows.length || blocked;
    $('import-excel').disabled = blocked; $('empty-import').disabled = blocked;
    $('empty-payroll').hidden = hasRows; $('payroll-table-wrap').hidden = !hasRows;
    $('empty-add').textContent = employeeProfiles().length ? '查看员工档案' : '添加员工';
    const sourceRows = (month?.rows || []).filter(r => r.source), filled = sourceRows.filter(r => r.source.recordedNet !== null);
    $('review-summary').hidden = !pending && !sourceRows.length;
    $('review-summary').textContent = `${pending ? '本月全部记录中有 '+pending+' 人存在未分配店铺、差异或缺项，请逐人核实。' : '本月已无待处理的导入核对事项。'}${sourceRows.length ? ' 原表已填写实发的 '+filled.length+' 条合计 '+C.amount(filled.reduce((s,r)=>s+r.source.recordedNet,0))+' 元；另有 '+(sourceRows.length-filled.length)+' 条实发空白。软件合计仅供核对。' : ''}`;
    $('payroll-body').innerHTML = rows.length ? rows.map(r => {
      const status=C.pending(r)?'draft':reviewText(r)==='待核对'?'neutral':'locked';
      const other=C.gross(r)-r.base-r.mealAllowance-r.commission;
      const diff=r.source?.recordedNet==null?null:C.net(r)-r.source.recordedNet;
      const description=(r.role||'岗位待补充')+' · '+shopName(r.shopId);
      return `<tr><td class="person-cell">${person(r.name,description)}</td><td class="numeric" data-label="基本工资 / 饭贴"><span>${C.amount(r.base)}</span><small>饭贴 ${C.amount(r.mealAllowance)}</small></td><td class="numeric" data-label="提成">${C.amount(r.commission)}</td><td class="numeric" data-label="其他应发">${C.amount(other)}</td><td class="numeric" data-label="扣请假">${C.amount(r.leaveDeduction)}</td><td class="numeric" data-label="买衣服">${C.amount(r.clothing)}</td><td class="numeric" data-label="预支工资">${C.amount(r.advance)}</td><td class="numeric" data-label="员工押金">${C.amount(r.depositDeduction)}</td><td class="numeric" data-label="其余扣款">${C.amount(restDeduction(r))}</td><td class="numeric net-cell" data-label="软件实发"><strong class="net ${C.net(r)<0?'negative':''}">${C.amount(C.net(r))}</strong><small class="${diff!==null&&diff!==0?'difference-note':''}">${r.source?'原表 '+(r.source.recordedNet===null?'未填写':originalNet(r)):'未关联原表'}${diff!==null&&diff!==0?' · 差 '+C.amount(diff):''}</small></td><td class="status-cell" data-label="核对状态">${statusText(reviewText(r),status,C.issues(r).join('；')||'仍需人工审核')}${r.source?'<small class="source-ref">第 '+r.source.row+' 行</small>':''}</td><td class="row-action-cell"><div class="row-actions"><button class="text-button edit-action" data-edit-salary="${escape(r.employeeId)}" ${month.locked || blocked ? 'disabled' : ''}>编辑工资</button><button class="text-button" data-slip="${escape(r.employeeId)}">工资条</button>${month.locked || blocked ? '' : `<button class="text-button danger remove-action" data-remove="${escape(r.employeeId)}" title="从本月工资表移除" aria-label="从本月工资表移除 ${escape(r.name)}">${icon('trash')}</button>`}</div></td></tr>`;
    }).join('') : '<tr class="no-results"><td colspan="12"><div class="no-results-content">'+icon('search')+'<span>没有找到匹配的员工</span><small>试试其他姓名，或切换店铺筛选。</small></div></td></tr>';
    const sum = fn => C.amount(rows.reduce((total, r) => total + fn(r), 0));
    $('payroll-foot').innerHTML = `<tr><td>筛选合计 · ${rows.length} 人</td><td class="numeric">${sum(r=>r.base)}<small>饭贴 ${sum(r=>r.mealAllowance)}</small></td><td class="numeric">${sum(r=>r.commission)}</td><td class="numeric">${sum(r=>C.gross(r)-r.base-r.mealAllowance-r.commission)}</td><td class="numeric">${sum(r=>r.leaveDeduction)}</td><td class="numeric">${sum(r=>r.clothing)}</td><td class="numeric">${sum(r=>r.advance)}</td><td class="numeric">${sum(r=>r.depositDeduction)}</td><td class="numeric">${sum(restDeduction)}</td><td class="numeric net">${sum(C.net)}</td><td colspan="2" class="footer-disclaimer">计算参考，非发薪凭证</td></tr>`;
  }
  function employeeProfiles() { return state.employees.filter(e => !e.deleted); }
  function noteDraftKey(month, id) { return month + '/' + id; }
  function noteStatus() {
    $('employee-note-status').textContent = noteDrafts.size ? '有 ' + noteDrafts.size + ' 条备注草稿未保存（可能在其他月份）。请点击对应员工的“保存备注”；切换月份不会丢失当前草稿。' : '填写后请点击每行的“保存备注”。月份之间不自动复制；完整备份会包含已保存的备注。';
    $('employee-note-status').classList.toggle('has-drafts', noteDrafts.size > 0);
  }
  function noteEditor(employee, notes) {
    const key = noteDraftKey(employeeNoteMonth, employee.id), saved = notes.get(employee.id) || '';
    const value = noteDrafts.has(key) ? noteDrafts.get(key) : saved, dirty = value !== saved;
    return `<div class="note-editor"><textarea data-employee-note="${escape(employee.id)}" data-note-month="${escape(employeeNoteMonth)}" aria-label="${escape(employeeNoteMonth+' '+employee.name+' 月度备注')}" maxlength="1000" rows="2" placeholder="记录本月表现、培训或待跟进事项…" ${blocked?'disabled':''}>${escape(value)}</textarea><div class="note-editor-footer"><small data-note-state class="${dirty?'note-unsaved':''}">${dirty?'未保存':saved?'已保存':'尚无备注'}</small><button class="text-button edit-action" data-save-employee-note="${escape(employee.id)}" ${blocked||!dirty?'disabled':''}>保存备注</button></div></div>`;
  }
  function renderEmployees() {
    const employees = employeeProfiles(), notes = new Map((state.employeeNotes?.[employeeNoteMonth] || []).map(entry => [entry.employeeId, entry.note]));
    $('employee-note-month').value = employeeNoteMonth;
    noteStatus();
    $('employees-body').innerHTML = employees.length ? employees.map(e => `<tr><td class="person-cell">${person(e.name,e.role||'岗位待补充')}</td><td data-label="归属店铺">${escape(shopName(e.shopId))}</td><td data-label="服务店铺" class="service-shops">${e.serviceShopIds.length?e.serviceShopIds.map(id=>escape(shopName(id))).join('、'):'<span class="muted">待确认</span>'}</td><td data-label="工资启用月份">${escape(e.startMonth)}</td><td class="numeric" data-label="默认底薪">${C.amount(e.base)}</td><td data-label="员工状态">${statusText(e.active?'在职':'已停用',e.active?'locked':'neutral')}</td><td class="monthly-note-cell" data-label="${escape(employeeNoteMonth)} 月度备注">${noteEditor(e,notes)}</td><td class="end row-action-cell"><div class="row-actions"><button class="text-button edit-action" data-edit-employee="${escape(e.id)}" ${blocked ? 'disabled' : ''}>编辑档案</button><button class="text-button delete-employee-action" data-delete-employee="${escape(e.id)}" aria-label="删除员工 ${escape(e.name)}" ${blocked ? 'disabled' : ''}>${icon('trash')}删除员工</button></div></td></tr>`).join('') : '<tr class="no-results"><td colspan="8"><div class="no-results-content">'+icon('users')+'<span>尚无员工</span><small>点击右上角“添加员工”，或从工资单导入。</small></div></td></tr>';
  }
  function render() {
    const selected = $('shop-filter').value;
    $('shop-filter').innerHTML = options(selected, true);
    renderPayroll(); renderEmployees();
    $('shops-inputs').innerHTML = state.shops.map(s => `<label>${escape(s.type)}店铺<input data-shop-id="${escape(s.id)}" value="${escape(s.name)}" maxlength="60" required></label>`).join('');
    $('audit-list').innerHTML = state.logs.length ? state.logs.slice(0, 50).map(l => `<div class="audit-entry"><time>${escape(new Date(l.at).toLocaleString('zh-CN', {hour12: false}))}</time>${escape(l.message)}</div>`).join('') + (state.logs.length > 50 ? '<p class="muted">页面仅展示最近 50 条，完整记录包含在备份中。</p>' : '') : '<p class="muted">还没有操作记录。</p>';
    $('add-employee').disabled = blocked;
    $('clear-data').disabled = blocked;
  }
  function view(name) {
    document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== 'view-' + name);
    document.querySelectorAll('.nav-item').forEach(el => {
      const active=el.dataset.view===name;el.classList.toggle('active',active);
      if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
    });
    $('breadcrumb-current').textContent=({payroll:'每月工资',employees:'员工档案',settings:'店铺与备份',guide:'使用说明'})[name]||'工作空间';
    window.scrollTo(0,0);
  }
  function openEmployee(id) {
    if (blocked) throw new Error('当前暂停写入，请先处理顶部提示。');
    const e = state.employees.find(e => e.id === id && !e.deleted);
    if (id && !e) throw new Error('员工档案不存在或已删除');
    $('employee-form').reset(); $('employee-id').value = e?.id || '';
    $('employee-title').textContent = e ? '编辑员工档案' : '添加员工';
    $('employee-name').value = e?.name || ''; $('employee-role').value = e?.role || '';
    $('employee-shop').innerHTML = options(e?.shopId || state.shops[0].id);
    $('employee-base').value = C.amount(e?.base || 0); $('employee-start').value = e?.startMonth || currentMonth;
    $('employee-active').value = String(e?.active ?? true);
    $('employee-services').innerHTML = state.shops.map(s => `<label><input type="checkbox" value="${escape(s.id)}" ${e?.serviceShopIds.includes(s.id) ? 'checked' : ''}>${escape(s.name)}</label>`).join('');
    $('employee-dialog').showModal();
  }
  $('employee-form').addEventListener('submit', safe(event => {
    event.preventDefault();
    const id = $('employee-id').value || crypto.randomUUID(), previous = state.employees.find(e => e.id === id);
    if ($('employee-id').value && (!previous || previous.deleted)) throw new Error('员工档案不存在或已删除，未保存修改');
    const employee = {id, name: $('employee-name').value.trim(), role: $('employee-role').value.trim(), shopId: $('employee-shop').value,
      serviceShopIds: [...new Set([...($('employee-shop').value === C.UNASSIGNED ? [] : [$('employee-shop').value]), ...Array.from($('employee-services').querySelectorAll('input:checked'), el => el.value)])],
      base: C.money($('employee-base').value), active: $('employee-active').value === 'true', startMonth: $('employee-start').value};
    if (employeeProfiles().some(e => e.id !== id && e.name === employee.name) && !confirm('已有同名员工。确定这是另一位员工，需要单独建立档案吗？')) return;
    commit(s => {
      const index = s.employees.findIndex(e => e.id === id);
      if (index < 0) s.employees.push(employee); else s.employees[index] = employee;
      C.log(s, (previous ? '修改' : '新增') + '员工 ' + employee.name + '，归属 ' + shopName(employee.shopId) + '，默认底薪 ' + C.amount(employee.base) + '，状态 ' + (employee.active ? '在职' : '停用') + (previous ? '；原档案：' + JSON.stringify(previous) : ''));
    });
    $('employee-dialog').close(); toast('员工已保存；已有月份工资未变动');
  }));
  $('salary-fields').innerHTML = [{title:'应发项目',fields:C.incomeFields},{title:'扣款项目',fields:C.deductionFields}].map(group => `<h3 class="form-section-title">${group.title}</h3><div class="form-grid">${group.fields.map(f => `<label>${escape(C.labels[f])}（元）<input id="salary-${f}" data-money-field="${f}" type="number" min="0" max="100000000" step="0.01" required></label>`).join('')}</div>`).join('');
  function salaryValues() {
    const values = {note: $('salary-note').value.trim(), shopId: $('salary-shop').value, leaveDays: C.days($('salary-leave-days').value)};
    C.fields.forEach(f => values[f] = C.money($('salary-' + f).value)); return values;
  }
  function previewSalary() {
    try {
      const row = monthData()?.rows.find(r => r.employeeId === $('salary-employee-id').value);
      const values = salaryValues(), result = C.net(values);
      $('salary-preview').textContent = C.amount(result); $('salary-preview').classList.toggle('negative', result < 0);
      const messages = C.issues({...row,...values});
      $('salary-review').hidden = !messages.length;
      $('salary-issues').innerHTML = messages.map(m => `<li>${escape(m)}</li>`).join('');
      $('salary-comparison').hidden = !row?.source;
      if (row?.source) $('salary-comparison').textContent = row.source.recordedNet === null ? '原表实发：未填写（不是 0 元）。软件金额只是按目前项目计算，请向公司核实缺项。' : '原表实发：'+C.amount(row.source.recordedNet)+' 元；软件减原表：'+C.amount(result-row.source.recordedNet)+' 元。原表金额只读，不会被修改。';
    } catch (_) { $('salary-preview').textContent = '请检查金额或天数'; }
  }
  function commissionMode() { const checked = document.querySelector('input[name="commission-mode"]:checked'); return checked ? checked.value : 'percent'; }
  function commissionExpression() {
    const num = id => document.getElementById(id).value.trim();
    const mode = commissionMode();
    if (mode === 'percent') return (num('commission-base') || '0') + '×' + (num('commission-rate') || '0') + '%';
    if (mode === 'fixed') return num('commission-fixed') || '0';
    if (mode === 'perunit') return (num('commission-units') || '0') + '×' + (num('commission-unit-price') || '0');
    return document.getElementById('commission-formula').value;
  }
  function renderCommission() {
    const result = $('commission-result'), box = result.parentElement, hint = $('commission-hint');
    try {
      result.textContent = C.amount(C.commissionCents(commissionExpression()));
      box.classList.remove('invalid'); hint.hidden = true; hint.textContent = '';
    } catch (error) {
      result.textContent = '算式有误'; box.classList.add('invalid'); hint.hidden = false; hint.textContent = error.message;
    }
  }
  function commissionPanel() {
    const mode = commissionMode();
    document.querySelectorAll('[data-commission-panel]').forEach(panel => panel.hidden = panel.dataset.commissionPanel !== mode);
  }
  function resetCommission() {
    const percent = document.querySelector('input[name="commission-mode"][value="percent"]'); if (percent) percent.checked = true;
    ['commission-base','commission-rate','commission-fixed','commission-units','commission-unit-price'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('commission-formula').value = '';
    commissionPanel(); renderCommission();
  }
  function applyCommission() {
    const cents = C.commissionCents(commissionExpression());
    const field = $('salary-commission'); field.value = C.amount(cents);
    field.dispatchEvent(new Event('input', {bubbles: true}));
    toast('已填入本月提成 ' + C.amount(cents) + ' 元，点“保存本月工资”后生效');
  }
  $('commission-calculator').addEventListener('change', event => { if (event.target.name === 'commission-mode') { commissionPanel(); renderCommission(); } });
  $('commission-calculator').addEventListener('input', renderCommission);
  $('commission-apply').addEventListener('click', safe(() => applyCommission()));
  function openSalary(id) {
    const month = monthData(); if (!month || month.locked || blocked) throw new Error('当前月份不能修改工资');
    const row = month.rows.find(r => r.employeeId === id); if (!row) return;
    $('salary-employee-id').value = id; $('salary-title').textContent = row.name + ' · 编辑工资';
    $('salary-subtitle').textContent = monthKey() + ' / ' + shopName(row.shopId);
    C.fields.forEach(f => $('salary-' + f).value = C.amount(row[f]));
    $('salary-leave-days').value = C.dayText(row.leaveDays); $('salary-shop').innerHTML = options(row.shopId);
    $('salary-note').value = row.note; $('salary-reviewed').checked = !!row.review?.confirmed;
    $('salary-review-reason').value = row.review?.reason || '';
    $('salary-source').hidden = !row.source; $('salary-source').open = false;
    if (row.source) $('salary-source-content').innerHTML = `<p class="muted">${escape(row.source.fileName)} / ${escape(row.source.sheet)} / 第 ${row.source.row} 行；原表标题：${escape(row.source.section || '无')}；原表编号：${escape(row.source.number || '无')}；原表月份：${escape(row.source.month || '未识别')}</p><div class="table-wrap"><table><thead><tr><th>单元格</th><th>项目</th><th>原始内容</th></tr></thead><tbody>${row.source.cells.map(cell=>`<tr><td>${escape(cell.ref)}</td><td>${escape(cell.label)}</td><td>${escape(cell.raw)}</td></tr>`).join('')}</tbody></table></div>`;
    resetCommission();
    previewSalary(); $('salary-dialog').showModal(); $('salary-dialog').scrollTop = 0;
  }
  $('salary-form').addEventListener('input', event => {
    if (event.target.closest('#commission-calculator')) return;
    if (!['salary-reviewed','salary-review-reason'].includes(event.target.id)) $('salary-reviewed').checked = false;
    previewSalary();
  });
  $('salary-shop').addEventListener('change', previewSalary);
  $('salary-form').addEventListener('submit', safe(event => {
    event.preventDefault(); const values = salaryValues();
    values.review = {confirmed: $('salary-reviewed').checked, reason: $('salary-review-reason').value.trim(), at: $('salary-reviewed').checked ? new Date().toISOString() : ''};
    if (values.review.confirmed && values.review.reason.length < 2) throw new Error('确认核实需要填写至少两个字的说明');
    if (C.net(values) < 0 && !confirm('扣款超过应发，实发为负数。请核对金额，确定仍要保存吗？')) return;
    commit(s => C.updateRow(s, monthKey(), $('salary-employee-id').value, values));
    $('salary-dialog').close(); toast('本月工资已保存，原表实发未改动');
  }));
  function bytesToBase64(bytes) {
    let binary = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(binary);
  }
  function base64ToBytes(str) {
    const binary = atob(str), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function encryptBackup(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:200000, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, new TextEncoder().encode(plaintext));
    return JSON.stringify({app:'clothing-payroll-backup', encrypted:true, v:1, kdf:'PBKDF2-SHA256', iterations:200000, salt:bytesToBase64(salt), iv:bytesToBase64(iv), data:bytesToBase64(new Uint8Array(ct))});
  }
  async function decryptBackup(payload, password) {
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:base64ToBytes(payload.salt), iterations:payload.iterations || 200000, hash:'SHA-256'}, keyMaterial, {name:'AES-GCM', length:256}, false, ['decrypt']);
    try {
      const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:base64ToBytes(payload.iv)}, key, base64ToBytes(payload.data));
      return new TextDecoder().decode(pt);
    } catch (_) { throw new Error('密码不正确，或备份文件已损坏'); }
  }
  let passwordResolver = null, passwordRequireConfirm = false;
  function askPassword(title, hint, requireConfirm) {
    passwordRequireConfirm = !!requireConfirm;
    $('password-title').textContent = title;
    $('password-hint').textContent = hint || '';
    $('password-input').value = ''; $('password-confirm').value = '';
    $('password-confirm-wrap').hidden = !passwordRequireConfirm;
    $('password-error').hidden = true; $('password-error').textContent = '';
    $('password-dialog').showModal();
    return new Promise(resolve => { passwordResolver = resolve; });
  }
  function resolvePassword(value) {
    if (passwordResolver) { const r = passwordResolver; passwordResolver = null; r(value); }
    if ($('password-dialog').open) $('password-dialog').close();
  }
  $('password-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('password-input').value, err = $('password-error');
    if (!value) { err.textContent = '请输入密码'; err.hidden = false; return; }
    if (passwordRequireConfirm) {
      if (value.length < 6) { err.textContent = '密码至少 6 位，建议更长'; err.hidden = false; return; }
      if (value !== $('password-confirm').value) { err.textContent = '两次输入不一致，请重新输入'; err.hidden = false; return; }
    }
    resolvePassword(value);
  });
  $('password-dialog').addEventListener('close', () => {
    if (passwordResolver) { const r = passwordResolver; passwordResolver = null; r(null); }
  });
  let promptResolver = null, promptValidator = null;
  function askText(title, hint, options = {}) {
    $('prompt-title').textContent = title;
    $('prompt-hint').textContent = hint || '';
    $('prompt-input').value = options.value || '';
    $('prompt-input').placeholder = options.placeholder || '';
    $('prompt-input').type = options.type || 'text';
    $('prompt-error').hidden = true; $('prompt-error').textContent = '';
    promptValidator = options.validator || null;
    $('prompt-dialog').showModal();
    $('prompt-input').focus();
    return new Promise(resolve => { promptResolver = resolve; });
  }
  function resolvePrompt(value) {
    if (promptResolver) { const r = promptResolver; promptResolver = null; r(value); }
    if ($('prompt-dialog').open) $('prompt-dialog').close();
  }
  $('prompt-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('prompt-input').value;
    if (promptValidator) {
      const error = promptValidator(value);
      if (error) { $('prompt-error').textContent = error; $('prompt-error').hidden = false; return; }
    }
    resolvePrompt(value);
  });
  $('prompt-dialog').addEventListener('close', () => {
    if (promptResolver) { const r = promptResolver; promptResolver = null; r(null); }
  });
  async function download(name, data, mime) {
    if (window.desktop?.saveFile) {
      try {
        const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(data);
        const saved = await window.desktop.saveFile(name, bytes);
        if (!saved) return;
        toast('文件已保存：' + saved + '。备份含敏感工资信息，请妥善保管。');
        return;
      } catch (error) { if (error && error.name === 'AbortError') return; throw new Error('文件保存未完成：' + error.message); }
    }
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const extension = '.' + name.split('.').at(-1);
        const handle = await window.showSaveFilePicker({suggestedName: name, types: [{description: extension === '.json' ? '完整数据备份' : extension === '.xlsx' ? 'Excel 工资单' : 'Excel 可打开的 CSV', accept: {[mime]: [extension]}}]});
        const writable = await handle.createWritable(); await writable.write(data); await writable.close();
        toast('文件已保存。备份含敏感工资信息，请妥善保管。'); return;
      } catch (e) { if (e.name === 'AbortError') return; throw new Error('文件保存未完成：' + e.message); }
    }
    if (!confirm('即将通过浏览器下载。请确认下载位置在 D 盘；如果尚未设置，请取消，并先在浏览器设置中开启“每次下载前询问保存位置”。继续下载吗？')) return;
    const url = URL.createObjectURL(new Blob([data], {type: mime + ';charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000); toast('已发起下载，请在浏览器中确认文件已保存。');
  }
  function exportTable() {
    const rows = visibleRows(); if (!rows.length) throw new Error('当前筛选下没有可导出的工资');
    const header = ['月份','姓名','岗位','归属店铺','请假天数',...C.fields.map(f => C.labels[f]),'应发合计','扣款合计','软件计算实发','原表实发','差额（软件减原表）','核对状态','核实说明','备注','源文件','源工作表','原表行号'];
    const data = rows.map(r => [monthKey(),r.name,r.role,shopName(r.shopId),C.dayText(r.leaveDays),...C.fields.map(f => C.amount(r[f])),C.amount(C.gross(r)),C.amount(C.deductions(r)),C.amount(C.net(r)),r.source?.recordedNet==null?'':C.amount(r.source.recordedNet),r.source?.recordedNet==null?'':C.amount(C.net(r)-r.source.recordedNet),reviewText(r)+(monthData().locked?' / 已锁账':''),r.review?.reason||'',r.note,r.source?.fileName||'',r.source?.sheet||'',r.source?.row||'']);
    return download((isDemo ? '演示-' : '') + monthKey() + '-工资表-当前筛选.csv', C.csv([header,...data]), 'text/csv');
  }
  function exportExcel() {
    const rows = visibleRows(); if (!rows.length) throw new Error('当前筛选下没有工资记录');
    return download((isDemo ? '演示-' : '')+monthKey()+'-工资单-当前筛选.xlsx', Excel.payrollWorkbook(rows,monthKey(),shopName,monthData().locked), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function slipData(id) {
    const row = monthData()?.rows.find(r => r.employeeId === id); if (!row) throw new Error('工资记录不存在');
    return {row, values: [['工资月份',monthKey()],['员工姓名',row.name],['岗位',row.role],['归属店铺',shopName(row.shopId)],['请假天数',C.dayText(row.leaveDays)],...C.fields.map(f => [C.labels[f],C.amount(row[f])]),['扣款合计',C.amount(C.deductions(row))],['软件计算实发',C.amount(C.net(row))],['原表实发',row.source?.recordedNet==null?'未填写/无来源':C.amount(row.source.recordedNet)],['核对提示',C.issues(row).join('；')],['核实说明',row.review?.reason||''],['备注',row.note],['核对状态',monthData().locked ? '已锁账' : reviewText(row)]]};
  }
  function openSlip(id) {
    const {row} = slipData(id); slipEmployee = id;
    const displayed = C.fields.filter(f => row[f] !== 0 || ['base','mealAllowance','commission','bonus'].includes(f));
    $('slip-content').innerHTML = `<div class="slip-heading"><h2>${escape(monthKey())} 工资条</h2>${isDemo ? '<p class="muted">虚构演示数据</p>' : ''}</div><div class="slip-meta">姓名：${escape(row.name)}<br>岗位：${escape(row.role || '—')}<br>归属店铺：${escape(shopName(row.shopId))}<br>请假天数：${C.dayText(row.leaveDays)} 天<br>核对状态：${monthData().locked ? '已锁账' : escape(reviewText(row))+'（非发薪凭证）'}</div><table class="slip-table"><tbody>${displayed.map(f => `<tr><td>${escape(C.labels[f])}</td><td class="numeric">${C.amount(row[f])}</td></tr>`).join('')}<tr><td><strong>软件计算实发（元）</strong></td><td class="numeric net"><strong>${C.amount(C.net(row))}</strong></td></tr>${row.source ? `<tr><td>原表实发（元）</td><td class="numeric">${originalNet(row)}</td></tr>` : ''}</tbody></table><div class="slip-note">备注：${escape(row.note || '无')}${row.source ? '<br>原表来源：'+escape(row.source.fileName)+' / '+escape(row.source.sheet)+' / 第 '+row.source.row+' 行' : ''}${C.issues(row).length ? '<br>核对提示：'+escape(C.issues(row).join('；')) : ''}${row.review?.reason ? '<br>'+ (row.review.confirmed ? '核实说明：' : '未确认的说明（仅供参考）：') +escape(row.review.reason) : ''}<br>各项金额由人工核定；本工资条不证明已付款。</div>`;
    $('slip-dialog').showModal(); $('slip-dialog').scrollTop = 0;
  }
  function importChoices() {
    return Array.from($('import-body').querySelectorAll('input[data-import-index]'), checkbox => ({index:Number(checkbox.dataset.importIndex),selected:checkbox.checked&&!checkbox.disabled,employeeId:$('import-match-'+checkbox.dataset.importIndex).value}));
  }
  function importMonthNotice() {
    if (!stagedImport) return;
    const selected = importChoices().filter(r=>r.selected).map(r=>stagedImport.rows[r.index]);
    $('import-month-warning').hidden = !selected.some(r=>r.source.month && r.source.month!==$('import-month').value);
    const locked = state.months[$('import-month').value]?.locked;
    $('confirm-import').disabled = blocked || !!locked || !selected.length;
    const warnings=[...stagedImport.warnings,...(stagedImport.sections.length?['原表标题：'+stagedImport.sections.join('、')+'；标题不自动映射为某一家店。']:[])];
    if(locked)warnings.unshift('目标月份已锁账，不能导入。请取消，核实后解锁，或选择正确月份。');
    $('import-warning').hidden=!warnings.length; $('import-warning').textContent=warnings.join(' ');
  }
  function renderImport() {
    const batch=stagedImport;
    $('import-file-label').textContent=batch.fileName+' · '+batch.rows.length+' 条记录 · 全程本地读取，尚未写入工资数据';
    $('import-shop').innerHTML=options(C.UNASSIGNED);
    $('import-month').value=batch.months.length===1?batch.months[0]:monthKey();
    $('import-month-override').checked=false;
    const missing=batch.rows.filter(r=>r.source.recordedNet===null).length;
    const differences=batch.rows.filter(r=>r.source.recordedNet!==null && C.net(r)!==r.source.recordedNet).length;
    $('import-summary').textContent='识别原表月份：'+(batch.months.join('、')||'未识别，请核实')+'。共 '+batch.rows.length+' 条；'+missing+' 条未填实发，'+differences+' 条与已列项目计算有差异。原表编号可能重复，不按编号合并员工。';
    const warnings=[...batch.warnings,...(batch.sections.length?['原表标题：'+batch.sections.join('、')+'；标题不自动映射为某一家店。']:[])];
    $('import-warning').hidden=!warnings.length; $('import-warning').textContent=warnings.join(' ');
    const existingSources=new Set(Object.values(state.months).flatMap(m=>m.rows.filter(r=>r.source).map(r=>r.source.fingerprint+'/'+r.source.sheet+'/'+r.source.row)));
    $('import-body').innerHTML=batch.rows.map((r,index)=>{
      const duplicate=existingSources.has(r.source.fingerprint+'/'+r.source.sheet+'/'+r.source.row);
      const matches=employeeProfiles().filter(e=>e.name.normalize('NFKC').trim()===r.name.normalize('NFKC').trim());
      const selected=matches.length===1?matches[0].id:'';
      const matchOptions='<option value="">新建员工档案</option>'+matches.map(e=>`<option value="${escape(e.id)}" ${e.id===selected?'selected':''}>匹配：${escape(e.name)} / ${escape(shopName(e.shopId))}${e.active?'':' / 已停用'}</option>`).join('');
      const problems=[...(duplicate?['该文件此行已导入，已取消选择']:[]),...C.issues(r),...(matches.length>1?['同名档案不止一个，请明确选择']:[])];
      return `<tr><td><input type="checkbox" data-import-index="${index}" ${duplicate?'disabled':'checked'} aria-label="选择原表第 ${r.source.row} 行"></td><td>第 ${r.source.row} 行<small>编号 ${escape(r.source.number||'无')}</small></td><td><strong>${escape(r.name)}</strong><select id="import-match-${index}" class="import-match" aria-label="原表第 ${r.source.row} 行员工匹配" ${duplicate?'disabled':''}>${matchOptions}</select></td><td class="numeric">${C.amount(C.net(r))}</td><td class="numeric">${originalNet(r)}</td><td class="import-problems">${problems.length?problems.map(escape).join('<br>'):'已列金额一致；仍需人工核对归属等信息'}</td></tr>`;
    }).join('');
    $('import-select-all').checked=Array.from($('import-body').querySelectorAll('input:not(:disabled)')).every(el=>el.checked);
    importMonthNotice();
  }
  function chooseExcel() { if (!blocked) $('excel-file').click(); }
  $('import-excel').addEventListener('click',chooseExcel); $('empty-import').addEventListener('click',chooseExcel);
  $('excel-file').addEventListener('change',safe(async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(blocked)throw new Error('当前暂停写入，请先处理顶部提示');
    $('import-excel').disabled=true;$('empty-import').disabled=true;$('save-status').textContent='正在本地读取 Excel…';
    try {stagedImport=await Excel.read(file);renderImport();$('import-dialog').showModal();$('import-dialog').scrollTop=0;}
    finally {$('import-excel').disabled=blocked;$('empty-import').disabled=blocked;$('save-status').textContent=blocked?'暂停写入':'Excel 仅在本地读取';}
  }));
  $('import-month').addEventListener('change',()=>{$('import-month-override').checked=false;importMonthNotice();});
  $('import-body').addEventListener('change',importMonthNotice);
  $('import-select-all').addEventListener('change',event=>{$('import-body').querySelectorAll('input[data-import-index]:not(:disabled)').forEach(el=>el.checked=event.target.checked);importMonthNotice();});
  $('import-form').addEventListener('submit',safe(event=>{
    event.preventDefault();if(!stagedImport)throw new Error('请先选择 Excel');
    const choices=importChoices(),selected=choices.filter(r=>r.selected),month=$('import-month').value;
    const sourceMonths=[...new Set(selected.map(r=>stagedImport.rows[r.index].source.month).filter(Boolean))];
    if(sourceMonths.length>1)throw new Error('所选记录来自不同月份，请按原表月份分批勾选导入');
    if(sourceMonths.some(m=>m!==month) && !$('import-month-override').checked)throw new Error('导入月份与原表不同，请先核实并勾选月份变更确认');
    if(!selected.length)throw new Error('请至少选择一条尚未导入的记录');
    if(!confirm(`将 ${selected.length} 条工资导入 ${month}，归属选择“${shopName($('import-shop').value)}”。\n不覆盖已有工资；原表实发和来源会保留，存在差异的记录仍需核实。确定继续？`))return;
    commit(s=>C.importBatch(s,stagedImport,{month,shopId:$('import-shop').value,rows:choices,allowMonthOverride:$('import-month-override').checked}));
    $('month').value=month;$('shop-filter').value='';$('search').value='';renderPayroll();view('payroll');
    $('import-dialog').close();stagedImport=null;toast('已导入 '+selected.length+' 条，请先处理待核实事项');
  }));
  $('employee-note-month').addEventListener('change', safe(() => {
    const month = $('employee-note-month').value;
    if (!C.monthValid(month)) { $('employee-note-month').value = employeeNoteMonth; throw new Error('请选择 2000—2099 年内的备注月份'); }
    employeeNoteMonth = month; renderEmployees();
  }));
  $('employees-body').addEventListener('input', event => {
    const input = event.target.closest('[data-employee-note]'); if (!input) return;
    const month = input.dataset.noteMonth, id = input.dataset.employeeNote, key = noteDraftKey(month,id);
    const saved = state.employeeNotes?.[month]?.find(entry => entry.employeeId === id)?.note || '';
    if (input.value === saved) noteDrafts.delete(key); else noteDrafts.set(key,input.value);
    const editor = input.closest('.note-editor'), dirty = input.value !== saved, status = editor.querySelector('[data-note-state]');
    status.textContent = dirty ? '未保存' : saved ? '已保存' : '尚无备注';
    status.classList.toggle('note-unsaved',dirty);
    editor.querySelector('[data-save-employee-note]').disabled = blocked || !dirty;
    noteStatus();
  });
  window.addEventListener('beforeunload', event => { if (noteDrafts.size) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('click', safe(async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.view) view(button.dataset.view);
    if (button.dataset.close) $(button.dataset.close).close();
    if (button.dataset.saveEmployeeNote) {
      const input = button.closest('.note-editor').querySelector('[data-employee-note]');
      const id = input.dataset.employeeNote, month = input.dataset.noteMonth, note = input.value;
      const saved = state.employeeNotes?.[month]?.find(entry => entry.employeeId === id)?.note || '';
      if (!note.trim() && saved && !confirm('确定清空这位员工 ' + month + ' 的月度备注？其他月份不受影响。')) return;
      commit(s => C.setEmployeeNote(s,month,id,note));
      noteDrafts.delete(noteDraftKey(month,id)); renderEmployees(); toast(month + ' 的员工备注已保存');
    }
    if (button.dataset.editEmployee) openEmployee(button.dataset.editEmployee);
    if (button.dataset.deleteEmployee) {
      if (blocked) throw new Error('当前暂停写入，请先处理顶部提示');
      const employee = employeeProfiles().find(e => e.id === button.dataset.deleteEmployee);
      if (!employee) throw new Error('员工档案不存在或已删除');
      const count = Object.values(state.months).reduce((total,m) => total + m.rows.filter(r => r.employeeId === employee.id).length, 0);
      if (!confirm('确定删除员工“' + employee.name + '”（' + shopName(employee.shopId) + '）的档案？\n\n已生成的 ' + count + ' 条工资（包括已锁账记录）全部保留，不会被删除；以后不再自动为此员工生成工资。\n为保留历史关联，备份中仍会保存已删除档案和已保存的月度备注；此员工未保存的备注草稿会被丢弃。仅离职可选择“编辑档案”改为停用。\n\n删除不能直接撤销，建议先下载完整备份。')) return;
      const entered = await askText('删除员工', '请输入“删除员工”四个字确认；取消则不删除。', {validator: v => v === '删除员工' ? '' : '请输入“删除员工”'});
      if (entered !== '删除员工') return;
      commit(s => C.deleteEmployee(s, employee.id));
      for (const key of noteDrafts.keys()) if (key.slice(8) === employee.id) noteDrafts.delete(key);
      noteStatus();
      toast('员工档案已删除；已生成工资全部保留');
    }
    if (button.dataset.editSalary) openSalary(button.dataset.editSalary);
    if (button.dataset.slip) openSlip(button.dataset.slip);
    if (button.dataset.remove) {
      const row = monthData().rows.find(r => r.employeeId === button.dataset.remove);
      if (!confirm('从 ' + monthKey() + ' 工资表移除 ' + row.name + '？该员工本月已填写的工资项目会被移除，员工档案保留。')) return;
      commit(s => {const m = s.months[monthKey()]; if (m.locked) throw new Error('已锁账，不能移除'); m.rows = m.rows.filter(r => r.employeeId !== row.employeeId); C.log(s, monthKey() + ' 移除工资行：' + JSON.stringify(row));});
      toast('已从本月工资表移除');
    }
  }));
  $('add-employee').addEventListener('click', safe(() => openEmployee()));
  $('empty-add').addEventListener('click', safe(() => employeeProfiles().length ? view('employees') : openEmployee()));
  $('open-demo').addEventListener('click', () => window.open('工资助手.html?demo=1', '_blank', 'noopener'));
  $('month').addEventListener('change', safe(() => {monthKey(); renderPayroll();}));
  $('shop-filter').addEventListener('change', renderPayroll); $('search').addEventListener('input', renderPayroll);
  $('generate').addEventListener('click', safe(() => {
    const month = monthKey(), count = eligibleMissing().length;
    if (!count) {toast('没有符合条件的在职员工。请先检查员工档案和入职月份。'); return;}
    if (!confirm(`将为 ${month} 加入 ${count} 位员工，使用当前档案的默认底薪。已有工资不覆盖。补录历史月份时请人工核对名单，继续吗？`)) return;
    commit(s => C.generate(s, month)); toast('工资表已生成 / 补充，请逐人核对');
  }));
  $('lock').addEventListener('click', safe(async () => {
    const m = monthData(); if (!m?.rows.length) return;
    if (m.locked) {
      const reason = await askText('填写解锁原因', '至少两个字，最多 500 字，将保留操作记录。', {placeholder: '例如：发现提成录错，需要修正', validator: v => v.trim().length >= 2 ? '' : '解锁原因至少两个字'});
      if (reason === null) return;
      commit(s => C.setLock(s, monthKey(), false, reason)); toast('已解锁，请在修改后重新核对锁账');
    } else {
      const unresolved = m.rows.filter(C.pending).length;
      if (unresolved) throw new Error('还有 '+unresolved+' 人存在未分配店铺、差异或缺项。请编辑工资，核实并填写说明后再锁账。');
      const negative = m.rows.filter(r => C.net(r) < 0).length;
      if (!confirm(`确认已核对 ${monthKey()} 全部 ${m.rows.length} 人的工资、提成和各项扣款？${negative ? '\n注意：有 ' + negative + ' 人实发为负数，请特别核对。' : ''}\n锁账后需填写原因才能解锁。锁账不代表已付款。`)) return;
      commit(s => C.setLock(s, monthKey(), true)); toast('本月已锁账');
    }
  }));
  $('export-payroll').addEventListener('click', safe(exportTable));
  $('export-excel').addEventListener('click', safe(exportExcel));
  $('slip-csv').addEventListener('click', safe(() => {
    const {row, values} = slipData(slipEmployee);
    const name = row.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    return download((isDemo ? '演示-' : '') + monthKey() + '-' + name + '-个人工资条.csv', C.csv([['项目','内容'],...values]), 'text/csv');
  }));
  $('slip-print').addEventListener('click', () => window.print());
  $('shops-form').addEventListener('submit', safe(event => {
    event.preventDefault();
    const values = Array.from($('shops-inputs').querySelectorAll('input'), el => ({id:el.dataset.shopId, name:el.value.trim()}));
    if (new Set(values.map(v => v.name)).size !== values.length) throw new Error('四家店铺名称不能重复');
    if (!confirm('店名修改后，历史工资会按相同店铺编号显示新店名。确定保存吗？')) return;
    commit(s => {const before = s.shops.map(shop => shop.name).join('、'); values.forEach(v => s.shops.find(shop => shop.id === v.id).name = v.name); C.log(s, '店名从 ' + before + ' 改为 ' + values.map(v => v.name).join('、'));}); toast('店名已保存');
  }));
  $('backup').addEventListener('click', safe(async () => {
    const plaintext = blocked && raw !== null ? raw : JSON.stringify(state, null, 2);
    const password = await askPassword('设置备份密码', '这份备份会被加密，恢复时需要输入这个密码。', true);
    if (!password) return;
    const encrypted = await encryptBackup(plaintext, password);
    await download((isDemo ? '演示-' : '') + '衣账-加密备份-' + currentMonth + '-' + Date.now() + '.json', encrypted, 'application/json');
    toast('已生成加密备份。请牢记密码，忘记将无法恢复。');
  }));
  $('restore').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', safe(async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 20000000) throw new Error('备份文件超过 20MB，无法导入');
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (_) { throw new Error('备份文件不是有效的 JSON，请选择正确的备份文件'); }
    let restored;
    if (parsed && parsed.encrypted === true) {
      const password = await askPassword('输入备份密码', '这份备份是加密的，请输入当时设置的密码。', false);
      if (!password) return;
      let plaintext;
      try { plaintext = await decryptBackup(parsed, password); }
      catch (error) { throw error; }
      try { restored = C.upgrade(JSON.parse(plaintext)); }
      catch (_) { throw new Error('密码正确，但备份内容损坏或不是本软件的备份'); }
    } else {
      restored = C.upgrade(parsed);
      if (!confirm('这是未加密的旧版备份。恢复后建议立即用密码重新备份。确定继续恢复吗？')) return;
    }
    const count = Object.values(restored.months).reduce((n, m) => n + m.rows.length, 0);
    const employees = restored.employees.filter(e => !e.deleted).length;
    if (!confirm(`备份包含 ${employees} 位员工档案、${restored.employees.length-employees} 位已删除关联档案、${Object.keys(restored.months).length} 个月、${count} 条工资。\n这会替换${isDemo ? '演示' : '正式'}空间的全部数据，包括锁账记录和未保存的备注草稿。请先下载当前备份。确定继续？`)) return;
    const phrase = await askText('确认恢复', '为避免误覆盖，请输入“确认恢复”四个字。', {validator: v => v === '确认恢复' ? '' : '请输入“确认恢复”'});
    if (phrase !== '确认恢复') return;
    commit(s => {
      Object.keys(s).forEach(k => delete s[k]);
      // 只复制已知字段，避免备份里的 __proto__ 等字段影响原型。
      for (const k of ['app','version','employees','months','employeeNotes','logs','shops']) if (restored[k] !== undefined) s[k] = structuredClone(restored[k]);
      C.log(s, '从本地备份恢复全部数据（原空间数据被替换）');
    }, true);
    noteDrafts.clear(); renderEmployees();
    toast('备份已恢复，请核对员工和工资');
  }));
  $('clear-data').addEventListener('click', safe(async () => {
    if (blocked) throw new Error('当前暂停写入，请先处理顶部提示或刷新后再操作');
    if (!confirm('确定清空本机全部数据吗？\n\n将删除正式空间和演示空间的全部员工、工资、锁账记录、操作记录和月度备注（本机浏览器存储）。网页文件本身不受影响。\n\n此操作不可撤销，刷新也无法找回。请务必先在本页点击“下载完整备份”保存数据。')) return;
    const phrase = await askText('清空数据', '为避免误删，请输入“清空数据”四个字；取消则不删除。', {validator: v => v === '清空数据' ? '' : '请输入“清空数据”'});
    if (phrase !== '清空数据') return;
    localStorage.removeItem('yizhang-payroll-v1');
    localStorage.removeItem('yizhang-payroll-v1-demo');
    if (window.desktop?.saveData) window.desktop.saveData('').catch(() => {});
    state = C.newState(); raw = null; blocked = false; stagedImport = null;
    noteDrafts.clear();
    $('month').value = currentMonth; $('search').value = ''; $('shop-filter').value = '';
    employeeNoteMonth = currentMonth;
    $('fatal').hidden = true;
    render();
    $('save-status').textContent = '已清空本机数据 · 本地空间';
    toast('正式空间和演示空间的本机数据已全部清空');
  }));
  window.addEventListener('storage', event => {
    if ((event.key === key || event.key === null) && localStorage.getItem(key) !== raw) {
      blocked = true; fail('另一个页面已修改或清理本空间数据。当前页面暂停写入，请刷新以读取最新数据。'); render();
    }
  });
  render();
  if (!blocked) $('save-status').textContent = raw === null ? '尚无工资数据 · 本地空间' : '已读取本机数据';
  if (!isDemo && window.desktop?.loadData) {
    (async () => {
      if (raw !== null) { window.desktop.saveData(raw).catch(() => {}); return; }
      if (blocked) return;
      try {
        const text = await window.desktop.loadData();
        if (!text) return;
        const restored = C.upgrade(JSON.parse(text));
        const serialized = JSON.stringify(restored);
        localStorage.setItem(key, serialized);
        state = restored; raw = serialized; blocked = false;
        $('month').value = Object.keys(state.months).sort().at(-1) || currentMonth;
        employeeNoteMonth = $('month').value;
        $('fatal').hidden = true;
        render();
        $('save-status').textContent = '已从本机数据文件恢复';
      } catch (_) { /* 镜像文件损坏时忽略，不影响启动 */ }
    })();
  }
})();
