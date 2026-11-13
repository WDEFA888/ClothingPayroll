/* AI 查账助手：把自然语言问题变成结构化查询/操作建议，在本机计算，不上传任何工资数据。
   写操作只返回“建议草案”，由界面确认后才真正写入。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ENDPOINT = 'https://api.deepseek.com/chat/completions';
  const MODEL = 'deepseek-chat';
  const Core = globalThis.PayrollCore || (typeof module === 'object' ? require('./core.js') : null);

  // 只发给模型“字段名 + 名单 + 问题”，绝不带金额。
  function buildContext(state) {
    const C = Core;
    const fields = (C ? C.fields : []).map(f => ({ key: f, label: C ? C.labels[f] : f }));
    const metricKeys = ['gross', 'net', 'deductions'].concat(C ? C.fields : []);
    const metricLabels = { gross: '应发合计', net: '实发合计', deductions: '扣款合计' };
    return {
      fields,
      metricKeys,
      metricLabels,
      shops: (state.shops || []).map(s => ({ name: s.name, type: s.type })),
      employees: (state.employees || []).filter(e => !e.deleted).map(e => e.name),
      months: Object.keys(state.months || {}).sort()
    };
  }

  function systemPrompt(ctx) {
    const fieldLines = ctx.fields.map(f => '  ' + f.key + ' = ' + f.label).join('\n');
    const metricLines = ctx.metricKeys.map(k => '  ' + k + ' = ' + (ctx.metricLabels[k] || (ctx.fields.find(f => f.key === k) || {}).label || k)).join('\n');
    const shopLines = ctx.shops.map(s => '  ' + s.name + '（' + s.type + '）').join('\n') || '  （无）';
    const employeeLines = ctx.employees.join('、') || '（无）';
    const monthLines = ctx.months.join('、') || '（无）';
    return [
      '你是“衣账工资助手”的查账助手。用户会用中文问工资相关问题，你的任务是：',
      '理解问题，然后只输出一个 JSON 对象（不要任何多余文字、不要 markdown 代码块），用来在本地程序里查询或生成修改建议。',
      '',
      '工资字段（key = 含义）：',
      fieldLines,
      '',
      '统计指标 key（可作为 metric 或 field）：',
      metricLines,
      '',
      '店铺名单：',
      shopLines,
      '',
      '员工名单：' + employeeLines,
      '',
      '已有工资月份：' + monthLines,
      '',
      'JSON 必须是以下 11 种类型之一（type 字段区分）：',
      '1) 某月汇总： {"type":"month_summary","month":"2026-11","shop":"店名或省略"}',
      '2) 各店汇总： {"type":"shop_summary","month":"2026-11"}',
      '3) 某人某月明细： {"type":"employee_detail","employee":"姓名","month":"2026-11"}',
      '4) 某人累计： {"type":"employee_total","employee":"姓名","from":"2026-01","to":"2026-11","metric":"net"}',
      '5) 排名： {"type":"ranking","field":"commission","month":"2026-11","order":"desc","limit":5}',
      '6) 两月对比： {"type":"compare_months","metric":"net","months":["2026-10","2026-11"]}',
      '7) 待处理清单： {"type":"pending_list","month":"2026-11"}（month 可省略=全部月份）',
      '8) 异常提醒： {"type":"anomaly","month":"2026-11"}（请假无扣款、原表缺实发、差额、实发环比大幅下降）',
      '9) 统计： {"type":"stats","month":"2026-11","field":"net","groupBy":"shop","agg":"sum"}（groupBy=shop 或 role；agg=sum/avg/max/min）',
      '10) 修改建议（一个人）： {"type":"suggest_update","employee":"姓名","month":"2026-11","field":"commission","value":2000}',
      '11) 批量修改建议： {"type":"suggest_batch","shop":"店名","month":"2026-11","field":"mealAllowance","value":500}（shop 可省略=所有人）',
      '',
      '规则：',
      '- 月份用 YYYY-MM；如果用户没说明，用已有月份里最新的。',
      '- 员工姓名必须从上面名单里精确选一个；找不到就输出 {"type":"error","message":"找不到员工XXX"}。',
      '- 店铺名必须从上面名单里精确选一个。',
      '- metric/field 只用上面列出的 key。',
      '- value 用“元”作单位，只填数字（不要单位、不要逗号）。',
      '- 金额单位是元，但不要你计算任何金额——你只输出查询或修改建议，程序会在本地算并执行。',
      '- 修改建议不会立即生效，程序会先给用户确认；但你已经能判断要改哪个字段、改成多少。',
      '- 只输出 JSON，不要解释。'
    ].join('\n');
  }

  async function chat(apiKey, userQuestion, ctx) {
    const messages = [
      { role: 'system', content: systemPrompt(ctx) },
      { role: 'user', content: userQuestion }
    ];
    if (typeof window !== 'undefined' && window.desktop && window.desktop.aiChat) {
      return await window.desktop.aiChat({ apiKey, messages });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0, stream: false }),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error('AI 接口请求失败（' + res.status + '）：' + text.slice(0, 200));
      }
      const data = await res.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (typeof content !== 'string') throw new Error('AI 返回内容为空');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseQuery(text) {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 返回内容无法解析为查询');
    const q = JSON.parse(m[0]);
    if (!q || typeof q !== 'object' || !q.type) throw new Error('AI 返回的查询缺少 type');
    return q;
  }

  // ---- 本地计算（金额不出本机） ----
  function money(cents) { return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 元'; }
  function findEmployee(state, name) {
    const list = (state.employees || []).filter(e => !e.deleted);
    const exact = list.find(e => e.name === name);
    if (exact) return exact;
    const like = list.filter(e => e.name.includes(name) || name.includes(e.name));
    if (like.length === 1) return like[0];
    throw new Error('找不到员工“' + name + '”' + (like.length > 1 ? '（有多位姓名相近，请写全名）' : ''));
  }
  function findShop(state, name) {
    const exact = (state.shops || []).find(s => s.name === name);
    if (exact) return exact;
    throw new Error('找不到店铺“' + name + '”');
  }
  function rowsOfMonth(state, month) {
    const m = state.months[month];
    return m ? (m.rows || []) : [];
  }
  function latestMonth(state) { return Object.keys(state.months || {}).sort().at(-1) || ''; }
  function prevMonth(month) {
    const y = Number(month.slice(0, 4)), m = Number(month.slice(5));
    return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
  }
  function metricValue(C, row, metric) {
    if (metric === 'gross') return C.gross(row);
    if (metric === 'net') return C.net(row);
    if (metric === 'deductions') return C.deductions(row);
    if (C.fields.includes(metric)) return row[metric] || 0;
    throw new Error('不支持的指标：' + metric);
  }
  function metricLabel(C, metric) {
    if (metric === 'gross') return '应发';
    if (metric === 'net') return '实发';
    if (metric === 'deductions') return '扣款';
    return C.labels[metric] || metric;
  }
  function shopName(state, id) {
    const C = Core;
    if (id === (C && C.UNASSIGNED)) return '待确认归属';
    return (state.shops.find(s => s.id === id) || {}).name || '未知店铺';
  }
  function centsFromValue(C, value) {
    // 模型给“元”，这里转成“分”并校验；只接受非负、最多两位小数。
    if (value === undefined || value === null) throw new Error('缺少要修改的金额');
    return C.money(String(value));
  }

  function executeQuery(q, state) {
    const C = Core;
    switch (q.type) {
      case 'month_summary': {
        let rows = rowsOfMonth(state, q.month);
        if (q.shop) rows = rows.filter(r => shopName(state, r.shopId) === q.shop);
        if (!rows.length) return q.month + (q.shop ? ' ' + q.shop : '') + ' 没有工资记录。';
        const sum = fn => rows.reduce((t, r) => t + fn(r), 0);
        return q.month + (q.shop ? ' ' + q.shop : '') + ' 共 ' + rows.length + ' 人：应发 ' + money(sum(C.gross)) + '，扣款 ' + money(sum(C.deductions)) + '，实发 ' + money(sum(C.net)) + '。';
      }
      case 'shop_summary': {
        const rows = rowsOfMonth(state, q.month);
        if (!rows.length) return q.month + ' 没有工资记录。';
        const byShop = new Map();
        rows.forEach(r => {
          const key = shopName(state, r.shopId);
          const e = byShop.get(key) || { people: 0, gross: 0, net: 0 };
          e.people++; e.gross += C.gross(r); e.net += C.net(r);
          byShop.set(key, e);
        });
        const lines = [...byShop.entries()].map(([name, e]) => name + '：' + e.people + ' 人，应发 ' + money(e.gross) + '，实发 ' + money(e.net));
        return q.month + ' 各店汇总：\n' + lines.join('\n');
      }
      case 'employee_detail': {
        const emp = findEmployee(state, q.employee);
        const row = rowsOfMonth(state, q.month).find(r => r.employeeId === emp.id);
        if (!row) return emp.name + ' 在 ' + q.month + ' 没有工资记录。';
        const income = C.incomeFields.filter(f => row[f]).map(f => C.labels[f] + ' ' + money(row[f]));
        const ded = C.deductionFields.filter(f => row[f]).map(f => C.labels[f] + ' ' + money(row[f]));
        return emp.name + ' ' + q.month + '：应发 ' + money(C.gross(row)) + '，扣款 ' + money(C.deductions(row)) + '，实发 ' + money(C.net(row)) +
          (income.length ? '\n应发明细：' + income.join('、') : '') +
          (ded.length ? '\n扣款明细：' + ded.join('、') : '');
      }
      case 'employee_total': {
        const emp = findEmployee(state, q.employee);
        const from = q.from || '0000-00', to = q.to || '9999-99', metric = q.metric || 'net';
        const months = Object.keys(state.months).sort().filter(m => m >= from && m <= to);
        let total = 0, count = 0;
        months.forEach(m => {
          const row = rowsOfMonth(state, m).find(r => r.employeeId === emp.id);
          if (row) { total += metricValue(C, row, metric); count++; }
        });
        if (!count) return emp.name + ' 在 ' + from + ' 到 ' + to + ' 之间没有工资记录。';
        return emp.name + ' ' + from + ' 至 ' + to + ' 共 ' + count + ' 个月，' + metricLabel(C, metric) + '合计 ' + money(total);
      }
      case 'ranking': {
        const rows = rowsOfMonth(state, q.month);
        if (!rows.length) return q.month + ' 没有工资记录。';
        const field = q.field || 'net';
        const sorted = rows.slice().sort((a, b) => metricValue(C, b, field) - metricValue(C, a, field));
        const top = (q.order === 'asc' ? sorted.slice().reverse() : sorted).slice(0, Math.max(1, Math.min(q.limit || 5, 100)));
        return q.month + ' ' + metricLabel(C, field) + '排名：\n' + top.map((r, i) => (i + 1) + '. ' + r.name + ' ' + money(metricValue(C, r, field))).join('\n');
      }
      case 'compare_months': {
        const months = q.months || [];
        const metric = q.metric || 'net';
        const parts = months.map(m => {
          const rows = rowsOfMonth(state, m);
          const total = rows.reduce((t, r) => t + metricValue(C, r, metric), 0);
          return m + ' ' + metricLabel(C, metric) + ' ' + money(total) + '（' + rows.length + ' 人）';
        });
        return metricLabel(C, metric) + '对比：\n' + parts.join('\n');
      }
      case 'pending_list': {
        const months = q.month ? [q.month] : Object.keys(state.months).sort();
        const lines = [];
        months.forEach(m => {
          const rows = rowsOfMonth(state, m).filter(r => C.pending(r));
          if (!rows.length) return;
          lines.push(m + ' 有 ' + rows.length + ' 人待处理：');
          rows.forEach(r => lines.push('  - ' + r.name + '（' + shopName(state, r.shopId) + '）：' + (C.issues(r).join('；') || '待核对')));
        });
        return lines.length ? lines.join('\n') : '没有待处理的事项。';
      }
      case 'anomaly': {
        const month = q.month || latestMonth(state);
        if (!month) return '还没有工资数据。';
        const rows = rowsOfMonth(state, month);
        const lines = [];
        rows.forEach(r => {
          if (r.leaveDays > 0 && r.leaveDeduction === 0) lines.push(r.name + '：有请假 ' + C.dayText(r.leaveDays) + ' 天但没填请假扣款');
          if (r.source && r.source.recordedNet === null) lines.push(r.name + '：原表没填实发金额');
          if (r.source && r.source.recordedNet !== null && C.net(r) !== r.source.recordedNet) lines.push(r.name + '：软件实发比原表' + (C.net(r) > r.source.recordedNet ? '多' : '少') + ' ' + money(Math.abs(C.net(r) - r.source.recordedNet)));
        });
        const prev = prevMonth(month);
        if (prev && state.months[prev]) {
          rows.forEach(r => {
            const cur = r, last = rowsOfMonth(state, prev).find(x => x.employeeId === r.employeeId);
            if (last && last.net > 0 && cur.net < last.net * 0.8) lines.push(r.name + '：实发比上月 ' + prev + ' 少了 ' + money(last.net - cur.net) + '（降幅超 20%）');
          });
        }
        return lines.length ? month + ' 的异常：\n' + lines.join('\n') : month + ' 没有发现明显异常。';
      }
      case 'stats': {
        const month = q.month || latestMonth(state);
        const rows = rowsOfMonth(state, month);
        if (!rows.length) return (month || '') + ' 没有工资记录。';
        const field = q.field || 'net', groupBy = q.groupBy === 'role' ? 'role' : 'shop', agg = q.agg || 'sum';
        const groups = new Map();
        rows.forEach(r => {
          const key = groupBy === 'role' ? (r.role || '岗位待补充') : shopName(state, r.shopId);
          const v = metricValue(C, r, field);
          const e = groups.get(key) || { values: [], people: 0 };
          e.values.push(v); e.people++;
          groups.set(key, e);
        });
        const aggText = { sum: '合计', avg: '人均', max: '最高', min: '最低' }[agg] || '合计';
        const lines = [...groups.entries()].map(([name, e]) => {
          let v;
          if (agg === 'avg') v = e.values.reduce((a, b) => a + b, 0) / e.values.length;
          else if (agg === 'max') v = Math.max(...e.values);
          else if (agg === 'min') v = Math.min(...e.values);
          else v = e.values.reduce((a, b) => a + b, 0);
          return name + '：' + e.people + ' 人，' + metricLabel(C, field) + aggText + ' ' + money(Math.round(v));
        });
        return month + ' ' + metricLabel(C, field) + aggText + '（按' + (groupBy === 'role' ? '岗位' : '店铺') + '）：\n' + lines.join('\n');
      }
      case 'suggest_update': {
        const emp = findEmployee(state, q.employee);
        const month = q.month || latestMonth(state);
        const monthData = state.months[month];
        if (!monthData || monthData.locked) throw new Error(month + ' 已锁账或没有工资记录，无法修改');
        const row = monthData.rows.find(r => r.employeeId === emp.id);
        if (!row) throw new Error(emp.name + ' 在 ' + month + ' 没有工资记录，无法修改');
        if (!C.fields.includes(q.field)) throw new Error('不支持的工资字段：' + q.field);
        const to = centsFromValue(C, q.value);
        return {
          suggest: true,
          title: '把 ' + emp.name + ' ' + month + ' 的「' + C.labels[q.field] + '」从 ' + money(row[q.field]) + ' 改为 ' + money(to),
          actions: [{ employeeId: emp.id, name: emp.name, month, field: q.field, to }]
        };
      }
      case 'suggest_batch': {
        const month = q.month || latestMonth(state);
        const monthData = state.months[month];
        if (!monthData || monthData.locked) throw new Error(month + ' 已锁账或没有工资记录，无法修改');
        let rows = rowsOfMonth(state, month);
        if (q.shop) { const sh = findShop(state, q.shop); rows = rows.filter(r => r.shopId === sh.id); }
        if (!rows.length) throw new Error(month + (q.shop ? ' ' + q.shop : '') + ' 没有可修改的工资记录');
        if (!C.fields.includes(q.field)) throw new Error('不支持的工资字段：' + q.field);
        const to = centsFromValue(C, q.value);
        const actions = rows.map(r => ({ employeeId: r.employeeId, name: r.name, month, field: q.field, to }));
        return {
          suggest: true,
          title: '把 ' + (q.shop || month + ' 全部') + ' ' + actions.length + ' 人的「' + C.labels[q.field] + '」改为 ' + money(to),
          actions
        };
      }
      case 'error':
        return '抱歉：' + (q.message || '无法理解这个问题');
      default:
        throw new Error('不支持的查询类型：' + q.type);
    }
  }

  return { MODEL, ENDPOINT, buildContext, systemPrompt, chat, parseQuery, executeQuery };
});
