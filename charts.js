// ============================================================
// BUDGET GRAPH — one switchable graph on the Budget page.
// Pick what to show (spending by category, pace, pay, savings, …) and
// how to draw it (bar, pie, trend line, …). Drawing is done by
// chart-kit.js; the look (design, colors, animations) comes from the
// Design Lab, which sends it here via  #chart-style=<json>  and is
// saved in the synced budget:chartStyle key.
// ============================================================
(function () {
  const F = window.__finance, B = window.__budget, K = window.ChartKit;
  const host = document.getElementById('bgGraph');
  if (!F || !B || !K || !host) return;

  const PREFS_KEY = 'budget:chartPrefs';
  const STYLE_KEY = 'budget:chartStyle';
  const $ = id => document.getElementById(id);
  const esc = s => F.escapeHtml(String(s == null ? '' : s));
  const money = v => F.fmtMoney(v);

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const todayISO = () => isoOf(new Date());
  const monthOf = iso => String(iso).slice(0, 7);
  const daysIn = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addMonths = (key, n) => { const d = parseISO(key + '-01'); d.setMonth(d.getMonth() + n); return monthOf(isoOf(d)); };
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const weekStartOf = iso => { const d = parseISO(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoOf(d); };
  const monthName = (key, style) => parseISO(key + '-01').toLocaleDateString('en-US', style || { month: 'short' });
  const shortDate = iso => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sum = (list, f) => list.reduce((s, x) => s + (f ? f(x) : x), 0);
  const allocated = e => sum(e.allocations || [], a => a.amount);
  const catLabel = c => (c.icon ? c.icon + ' ' : '') + c.name;

  // ============================================================
  // VIEWS — what the graph can show. Each builds ChartKit data.
  // ============================================================
  const VIEWS = [
    { id: 'category', name: 'Spending by category', type: 'donut', sub: m => 'Where your money went in ' + monthName(m, { month: 'long' }),
      build(d, m) {
        const spent = {};
        d.tx.filter(t => monthOf(t.date) === m).forEach(t => { spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount; });
        const items = d.cats.map(c => ({ label: catLabel(c), value: spent[c.id] || 0 }));
        const known = new Set(d.cats.map(c => c.id));
        const orphan = sum(Object.entries(spent).filter(([id]) => !known.has(id)), ([, v]) => v);
        if (orphan > 0) items.push({ label: '❔ Uncategorized', value: orphan });
        return { kind: 'categorical', totalLabel: 'Spent', items: items.filter(i => i.value > 0).sort((a, b) => b.value - a.value) };
      } },
    { id: 'budget', name: 'Budget vs. actual', type: 'hbar', sub: () => 'Each category against its monthly budget',
      build(d, m) {
        const spent = {};
        d.tx.filter(t => monthOf(t.date) === m).forEach(t => { spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount; });
        return { kind: 'categorical', totalLabel: 'Spent', valueName: 'Spent', items: d.cats
          .map(c => ({ label: catLabel(c), value: spent[c.id] || 0, target: Number(c.budget) || 0 }))
          .filter(i => i.value > 0 || i.target > 0).sort((a, b) => b.value - a.value || b.target - a.target) };
      } },
    { id: 'pace', name: 'Spending pace', type: 'line', sub: () => 'Running total this month vs. an even spread of your budget',
      build(d, m) {
        const days = daysIn(m), today = todayISO();
        const lastDay = m === monthOf(today) ? parseISO(today).getDate() : m < monthOf(today) ? days : 0;
        const run = (key, upTo) => {
          const per = new Array(daysIn(key) + 1).fill(0);
          d.tx.filter(t => monthOf(t.date) === key).forEach(t => { per[parseISO(t.date).getDate()] += t.amount; });
          let acc = 0;
          return Array.from({ length: days }, (_, i) => { if (i + 1 > upTo) return null; acc += per[i + 1] || 0; return acc; });
        };
        const prevKey = addMonths(m, -1);
        const budget = sum(d.cats, c => Number(c.budget) || 0);
        const series = [{ name: 'This month', values: run(m, lastDay) }];
        const prev = run(prevKey, daysIn(prevKey));
        if (prev.some(v => v > 0)) series.push({ name: 'Last month', values: prev });
        return { kind: 'series', x: Array.from({ length: days }, (_, i) => monthName(m) + ' ' + (i + 1)), series,
          reference: budget > 0 ? { value: budget, label: 'Even budget pace' } : null, referenceStart: budget > 0 ? budget / days : 0, referenceEnd: budget };
      } },
    { id: 'daily', name: 'Daily spending', type: 'bar', sub: m => 'What you spent each day of ' + monthName(m, { month: 'long' }),
      build(d, m) {
        const days = daysIn(m), per = new Array(days).fill(0);
        d.tx.filter(t => monthOf(t.date) === m).forEach(t => { per[parseISO(t.date).getDate() - 1] += t.amount; });
        const budget = sum(d.cats.filter(c => !c.fixed), c => Number(c.budget) || 0);
        return { kind: 'series', x: per.map((_, i) => String(i + 1)), xFull: per.map((_, i) => monthName(m) + ' ' + (i + 1)), series: [{ name: 'Spent', values: per }],
          reference: budget > 0 ? { value: budget / days, label: 'Daily flexible budget' } : null };
      } },
    { id: 'calendar', name: 'Spending calendar', type: 'heatmap', sub: () => 'Darker days are bigger spending days',
      build(d, m) {
        const days = {};
        d.tx.filter(t => monthOf(t.date) === m).forEach(t => { days[t.date] = (days[t.date] || 0) + t.amount; });
        return { kind: 'calendar', month: m, days };
      } },
    { id: 'monthly', name: 'Monthly spending', type: 'bar', sub: () => 'The last 6 months against your total monthly budget',
      build(d, m) {
        const months = Array.from({ length: 6 }, (_, i) => addMonths(m, i - 5));
        const budget = sum(d.cats, c => Number(c.budget) || 0);
        return { kind: 'series', x: months.map(k => monthName(k)), xFull: months.map(k => monthName(k, { month: 'long', year: 'numeric' })),
          series: [{ name: 'Spent', values: months.map(k => sum(d.tx.filter(t => monthOf(t.date) === k), t => t.amount)) }],
          reference: budget > 0 ? { value: budget, label: 'Monthly budget' } : null };
      } },
    { id: 'pay', name: 'Pay: kept vs. set aside', type: 'bar', sub: () => 'Each week\'s pay, split into spending money and savings',
      build(d) {
        const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStartOf(todayISO()), -7 * (7 - i)));
        const rows = weeks.map(w => { const list = d.income.filter(e => e.date >= w && e.date <= addDays(w, 6)); const earned = sum(list, e => e.amount); const saved = Math.min(earned, sum(list, allocated)); return { earned, saved }; });
        return { kind: 'series', stacked: true, x: weeks.map(shortDate), xFull: weeks.map(w => 'Week of ' + shortDate(w)),
          series: [{ name: 'Kept for spending', values: rows.map(r => r.earned - r.saved) }, { name: 'Set aside', values: rows.map(r => r.saved) }] };
      } },
    { id: 'savings', name: 'Savings growth', type: 'area', sub: () => 'Total set aside toward your goals, week by week',
      build(d) {
        const entries = d.income.filter(e => allocated(e) > 0);
        const first = entries.length ? entries.map(e => e.date).sort()[0] : todayISO();
        const end = weekStartOf(todayISO());
        let start = weekStartOf(first);
        if (start < addDays(end, -7 * 25)) start = addDays(end, -7 * 25);
        const weeks = [];
        for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(w);
        if (weeks.length === 1) weeks.unshift(addDays(start, -7));
        const values = weeks.map(w => sum(entries.filter(e => e.date <= addDays(w, 6)), allocated));
        const target = sum(d.goals, g => Number(g.target) || 0);
        return { kind: 'series', x: weeks.map(shortDate), xFull: weeks.map(w => 'Week of ' + shortDate(w)), series: [{ name: 'Total set aside', values }],
          reference: target > 0 && target < Math.max(...values) * 3 ? { value: target, label: 'All goal targets' } : null };
      } },
    { id: 'goals', name: 'Savings goals', type: 'radial', sub: () => 'How far along each goal is',
      build(d) {
        return { kind: 'categorical', totalLabel: 'Saved', items: d.goals.map(g => ({ label: (g.icon ? g.icon + ' ' : '') + g.name, value: Number(g.saved) || 0, target: Number(g.target) || 0 })) };
      } },
    { id: 'methods', name: 'By card & cash', type: 'pie', sub: m => 'How you paid in ' + monthName(m, { month: 'long' }),
      build(d, m) {
        const by = {};
        d.tx.filter(t => monthOf(t.date) === m).forEach(t => { by[t.methodId || ''] = (by[t.methodId || ''] || 0) + t.amount; });
        const icon = { cash: '💵', debit: '💳', credit: '💳' };
        return { kind: 'categorical', totalLabel: 'Spent', items: Object.entries(by).map(([id, v]) => {
          const mm = d.methods.find(x => x.id === id);
          return { label: mm ? (icon[mm.type] || '💳') + ' ' + mm.name : 'Not set', value: v };
        }).sort((a, b) => b.value - a.value) };
      } },
    { id: 'weekday', name: 'By day of week', type: 'bar', sub: () => 'Average spending per weekday, last 90 days',
      build(d) {
        const end = todayISO(), start = addDays(end, -89);
        const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const totals = new Array(7).fill(0), counts = new Array(7).fill(0);
        for (let day = start; day <= end; day = addDays(day, 1)) counts[(parseISO(day).getDay() + 6) % 7]++;
        d.tx.filter(t => t.date >= start && t.date <= end).forEach(t => { totals[(parseISO(t.date).getDay() + 6) % 7] += t.amount; });
        return { kind: 'categorical', totalLabel: 'Avg / week', items: names.map((n, i) => ({ label: n, value: totals[i] / (counts[i] || 1), note: money(totals[i]) + ' total over ' + counts[i] + ' ' + n + 's' })) };
      } }
  ];

  // ---------- saved choices ----------
  const prefs = () => F.storeGet(PREFS_KEY) || {};
  const style = () => K.normalizeStyle(F.storeGet(STYLE_KEY));
  function currentView() { return VIEWS.find(v => v.id === prefs().view) || VIEWS[0]; }
  function currentType(view, data) {
    const saved = (prefs().types || {})[view.id];
    return saved && K.supports(saved, data) ? saved : view.type;
  }

  // ---------- Design Lab hand-off: #chart-style=<json> ----------
  function applyStyleFromHash() {
    const m = location.hash.match(/chart-style=([^&]+)/);
    if (!m) return;
    try {
      const incoming = JSON.parse(decodeURIComponent(m[1]));
      const next = K.normalizeStyle(incoming);
      F.storeSet(STYLE_KEY, next);
      const d = K.DESIGNS.find(x => x.id === next.design), p = K.PALETTES.find(x => x.id === next.palette);
      if (B.toast) B.toast('🎨 Chart style from Design Lab applied: ' + d.name + ' · ' + p.name);
      window.dispatchEvent(new Event('budget:changed'));
    } catch (_) {
      if (B.toast) B.toast('That Design Lab link couldn\'t be read.');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  // ---------- UI ----------
  function renderControls(view, data, type) {
    const sel = $('bgGraphView');
    if (!sel.options.length) sel.innerHTML = VIEWS.map(v => '<option value="' + v.id + '">' + esc(v.name) + '</option>').join('');
    sel.value = view.id;
    $('bgGraphTypes').innerHTML = K.TYPES.map(t => {
      const ok = K.supports(t.id, data);
      return '<button type="button" class="bg-type' + (t.id === type ? ' active' : '') + '" data-type="' + t.id + '"' + (ok ? '' : ' disabled title="' + esc(t.name) + ' doesn\'t fit this data"') + ' aria-pressed="' + (t.id === type) + '">'
        + '<span class="bg-type-icon" aria-hidden="true">' + t.icon + '</span>' + esc(t.name) + '</button>';
    }).join('');
    const st = style();
    const dn = K.DESIGNS.find(x => x.id === st.design).name, pn = K.PALETTES.find(x => x.id === st.palette).name;
    $('bgGraphSub').textContent = view.sub(B.month());
    $('bgGraphStyle').innerHTML = '🎨 ' + esc(dn) + ' · ' + esc(pn);
    $('bgGraphStyle').title = 'Chart design and colors — change them in the Design Lab\'s Charts tab';
  }

  function render(animate) {
    const section = document.querySelector('.section[data-section="budget"]');
    if (!section || section.hasAttribute('hidden')) return;
    const view = currentView();
    const data = view.build(B.data(), B.month());
    const type = currentType(view, data);
    renderControls(view, data, type);
    K.render(host, { type, data, style: style(), animate: animate !== false, format: money, title: view.name, emptyText: 'Nothing to show for this yet. Log some spending or pay first.' });
  }

  $('bgGraphView').addEventListener('change', e => {
    F.storeSet(PREFS_KEY, { ...prefs(), view: e.target.value });
    render(true);
  });
  $('bgGraphTypes').addEventListener('click', e => {
    const btn = e.target.closest('.bg-type');
    if (!btn || btn.disabled) return;
    const p = prefs();
    F.storeSet(PREFS_KEY, { ...p, types: { ...(p.types || {}), [currentView().id]: btn.dataset.type } });
    render(true);
  });

  applyStyleFromHash();
  window.addEventListener('hashchange', () => { applyStyleFromHash(); render(true); });
  window.addEventListener('finance:tab', e => { if (e.detail === 'budget') render(true); });
  window.addEventListener('budget:month', () => render(true));
  window.addEventListener('budget:changed', () => render(false));
  window.addEventListener('storage', () => render(false));
  let resizeTimer = null, lastWidth = host.clientWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (host.clientWidth !== lastWidth) { lastWidth = host.clientWidth; render(false); } }, 150);
  });
  render(true);
})();
