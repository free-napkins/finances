// ============================================================
// BUDGET · PAYDAY · WEEKLY SCORE
// Monthly budget categories (like a spreadsheet budget), categorized
// receipts and transactions per card/cash, daily pay with suggested
// savings splits (auto-set from each goal's complete-by date), and a
// Monday–Sunday score game. The AI coach lives in coach.js.
//
// All amounts are US dollars.
// Everything lives under the synced "budget:" localStorage prefix.
// ============================================================
(function () {
  const F = window.__finance;
  if (!F) return;
  const { storeGet, storeSet, escapeHtml } = F;

  const K = {
    cats: 'budget:categories',
    tx: 'budget:transactions',
    methods: 'budget:methods',
    income: 'budget:income',
    goals: 'budget:goals',
    scores: 'budget:scores',
    plan: 'budget:savingsPlan',
    prefs: 'budget:prefs'
  };
  const $ = id => document.getElementById(id);
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const PENCIL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  // ---------- small helpers ----------
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => isoOf(new Date());
  const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const validISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(parseISO(s));
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const daysIn = monthKey => { const [y, m] = monthKey.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const monthOf = iso => String(iso).slice(0, 7);
  const weekStartOf = iso => { const d = parseISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoOf(d); };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const shortDate = iso => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthLabel = key => parseISO(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

  const money = amount => F.fmtMoney(amount);
  const num = v => round2(parseFloat(v) || 0);
  const inputVal = amount => { const v = round2(amount); return v ? String(v) : ''; };

  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector('.bg-toast');
    if (!el) { el = document.createElement('div'); el.className = 'bg-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------- data access ----------
  const getCats = () => storeGet(K.cats) || [];
  const getTx = () => storeGet(K.tx) || [];
  const getMethods = () => storeGet(K.methods) || [];
  const getIncome = () => storeGet(K.income) || [];
  const getGoals = () => storeGet(K.goals) || [];
  const getPrefs = () => storeGet(K.prefs) || {};
  function save(key, value) {
    storeSet(key, value);
    renderAll();
    window.dispatchEvent(new Event('budget:changed'));
  }

  function seed() {
    if (!storeGet(K.cats)) {
      storeSet(K.cats, [
        ['🏠', 'Rent', true], ['🛒', 'Groceries'], ['🍔', 'Dining out'], ['⛽', 'Gas'],
        ['👕', 'Clothing'], ['🧴', 'Personal care'], ['🎬', 'Entertainment'], ['📦', 'Other']
      ].map(([icon, name, fixed]) => ({ id: uid('c_'), icon, name, budget: 0, fixed: !!fixed })));
    }
    if (!storeGet(K.methods)) {
      const bank = F.listAllNwAccounts().find(a => a.catKey === 'bank');
      storeSet(K.methods, [
        { id: uid('m_'), name: 'Cash', type: 'cash', account: '' },
        { id: uid('m_'), name: 'Debit card', type: 'debit', account: bank ? 'bank::' + bank.itemName : '' }
      ]);
    }
  }

  // ---------- net-worth accounts ("cat::name" refs, same as subs/bills) ----------
  const ACCT_ICONS = { bank: '🏦', stocks: '📈', crypto: '🪙', other: '💼' };
  function accountOptions(selected, emptyLabel) {
    const accounts = F.listAllNwAccounts();
    return '<option value="">' + esc(emptyLabel) + '</option>' + accounts.map(a => {
      const ref = a.catKey + '::' + a.itemName;
      return '<option value="' + esc(ref) + '"' + (ref === selected ? ' selected' : '') + '>' + (ACCT_ICONS[a.catKey] || '') + ' ' + esc(a.itemName) + '</option>';
    }).join('');
  }
  const accountName = ref => (ref ? String(ref).split('::').slice(1).join('::') : '');
  // Adds delta (dollars) to a net-worth account. Returns false if it no longer exists.
  function adjustAccount(ref, delta, label) {
    if (!ref || !delta) return false;
    const ix = ref.indexOf('::');
    const cat = ref.slice(0, ix), name = ref.slice(ix + 2);
    const items = storeGet('nw:' + cat) || [];
    const idx = items.findIndex(it => String(it.name) === name);
    if (idx < 0) return false;
    items[idx].amount = (Number(items[idx].amount) || 0) + delta;
    storeSet('nw:' + cat, items);
    F.logActivity(cat, label || name, delta, 'edit');
    return true;
  }
  function applyMoves(moves, sign) {
    moves.forEach(m => adjustAccount(m.ref, sign * m.delta, m.label));
    if (moves.length) F.renderAllNetWorth();
  }

  // ---------- categories ----------
  const catLabel = c => (c.icon ? c.icon + ' ' : '') + c.name;
  function catOptions(selected, withAll) {
    return (withAll ? '<option value="">All categories</option>' : '') + getCats().map(c =>
      '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(catLabel(c)) + '</option>').join('');
  }
  const CATEGORY_HINTS = [
    [/shell|chevron|exxon|mobil|bp\b|circle k|speedway|valero|marathon|sunoco|fuel|gas/i, /gas|fuel|car|transport/i],
    [/walmart|kroger|aldi|lidl|coop|migros|safeway|trader joe|whole foods|costco|publix|heb|grocery|market/i, /grocer|food/i],
    [/mcdonald|burger|pizza|taco|starbucks|coffee|cafe|restaurant|chipotle|wendy|subway|kfc|doordash|uber eats|grubhub/i, /dining|restaurant|eat|food/i],
    [/cvs|walgreens|ulta|sephora|salon|barber|pharmacy/i, /personal|care|health|beauty/i],
    [/h&m|zara|uniqlo|nike|adidas|old navy|gap|shoe|apparel/i, /cloth|apparel/i],
    [/netflix|spotify|cinema|movie|theater|steam|playstation|xbox|ticket/i, /entertain|fun|leisure/i]
  ];
  function guessCategory(text) {
    const cats = getCats();
    for (const [merchantRe, catRe] of CATEGORY_HINTS) {
      if (merchantRe.test(text || '')) {
        const hit = cats.find(c => catRe.test(c.name));
        if (hit) return hit.id;
      }
    }
    const other = cats.find(c => /other|misc/i.test(c.name));
    return other ? other.id : (cats[0] ? cats[0].id : '');
  }

  // ---------- payment methods ----------
  const METHOD_ICONS = { cash: '💵', debit: '💳', credit: '💳' };
  const methodLabel = m => (METHOD_ICONS[m.type] || '💳') + ' ' + m.name + (m.account ? ' → ' + accountName(m.account) : '');
  function methodOptions(selected, withAll) {
    return (withAll ? '<option value="">All cards &amp; cash</option>' : '') + getMethods().map(m =>
      '<option value="' + esc(m.id) + '"' + (m.id === selected ? ' selected' : '') + '>' + esc((METHOD_ICONS[m.type] || '💳') + ' ' + m.name) + '</option>').join('');
  }
  // Match a receipt's printed payment line ("VISA ****4821", "CASH") to a saved method.
  function matchMethod(hint) {
    const h = String(hint || '').toLowerCase();
    if (!h) return '';
    const methods = getMethods();
    const digits = (h.match(/\d{4}/g) || []).pop();
    if (digits) { const m = methods.find(x => x.name.includes(digits)); if (m) return m.id; }
    if (/cash/.test(h)) { const m = methods.find(x => x.type === 'cash'); if (m) return m.id; }
    const brand = (h.match(/visa|mastercard|master card|amex|american express|discover|debit|credit/) || [])[0];
    if (brand) {
      const b = brand.replace(' ', '');
      const m = methods.find(x => x.name.toLowerCase().replace(' ', '').includes(b)) || methods.find(x => x.type === (brand === 'debit' ? 'debit' : 'credit'));
      if (m) return m.id;
    }
    return '';
  }

  // ---------- transactions ----------
  // Records spending. When the card/cash is linked to an account, the total
  // is deducted once and each transaction remembers it so deletes refund.
  function recordTransactions({ date, merchant, methodId, lines, receipt }) {
    const method = getMethods().find(m => m.id === methodId);
    const day = validISO(date) ? date : todayISO();
    const receiptId = receipt ? uid('r_') : null;
    const created = lines.map(l => ({
      id: uid('t_'),
      date: day,
      merchant,
      categoryId: l.categoryId || '',
      amount: round2(l.amount),
      methodId: methodId || '',
      items: l.items || [],
      receiptId,
      createdAt: Date.now(),
      deductedFrom: null
    })).filter(t => t.amount > 0);
    if (!created.length) return { error: 'Nothing to record.' };
    const total = created.reduce((s, t) => s + t.amount, 0);
    if (method && method.account && adjustAccount(method.account, -total, merchant)) {
      created.forEach(t => { t.deductedFrom = method.account; });
      F.renderAllNetWorth();
    }
    save(K.tx, getTx().concat(created));
    const catNames = [...new Set(created.map(t => { const c = getCats().find(x => x.id === t.categoryId); return c ? c.name : 'Uncategorized'; }))];
    toast('Logged ' + money(total) + ' · ' + catNames.join(', '));
    return { ok: true };
  }
  function deleteTransaction(id) {
    const all = getTx();
    const t = all.find(x => x.id === id);
    if (!t) return;
    if (t.deductedFrom) applyMoves([{ ref: t.deductedFrom, delta: t.amount, label: 'Refund · ' + t.merchant }], 1);
    save(K.tx, all.filter(x => x.id !== id));
  }

  const goalDone = g => Number(g.target) > 0 && Number(g.saved) >= Number(g.target) - 0.005;

  // ---------- month math ----------
  const state = { month: monthOf(todayISO()), filterCat: '', filterMethod: '' };
  function spentBy(txs) {
    const out = {};
    txs.forEach(t => { out[t.categoryId] = (out[t.categoryId] || 0) + t.amount; });
    return out;
  }
  const txInMonth = key => getTx().filter(t => monthOf(t.date) === key);
  const txBetween = (a, b) => getTx().filter(t => t.date >= a && t.date <= b);
  function monthPace(key) {
    const today = todayISO();
    if (key < monthOf(today)) return 1;
    if (key > monthOf(today)) return 0;
    return parseISO(today).getDate() / daysIn(key);
  }
  function statusOf(spent, budget, pace) {
    if (!(budget > 0)) return spent > 0 ? { cls: 'neutral', label: 'No budget', tone: 'idle' } : { cls: 'neutral', label: 'Not set', tone: 'idle' };
    if (spent > budget + 0.005) return { cls: 'over', label: 'Over', tone: 'over' };
    if (pace < 1 && spent > budget * pace * 1.1) return { cls: 'warn', label: 'Ahead of pace', tone: 'warn' };
    return { cls: '', label: pace >= 1 ? 'Under' : 'On track', tone: 'ok' };
  }

  // ============================================================
  // RENDER · BUDGET TAB
  // ============================================================
  function renderHero(cats, spent) {
    const key = state.month;
    const budgeted = cats.reduce((s, c) => s + (Number(c.budget) || 0), 0);
    const total = Object.values(spent).reduce((s, v) => s + v, 0);
    const pace = monthPace(key);
    $('bgMonthLabel').textContent = monthLabel(key);
    $('bgBudgeted').textContent = money(budgeted);
    $('bgSpent').textContent = money(total);
    $('bgLeft').textContent = money(budgeted - total);
    $('bgLeft').style.color = budgeted - total < 0 ? '#FF8A8A' : '';
    const st = statusOf(total, budgeted, pace);
    const fill = $('bgHeroFill');
    fill.className = 'bg-bar-fill ' + st.cls;
    fill.style.width = (budgeted > 0 ? clamp(total / budgeted, 0, 1) * 100 : 0) + '%';
    const paceEl = $('bgHeroPace');
    paceEl.style.display = pace > 0 && pace < 1 ? '' : 'none';
    paceEl.style.left = 'calc(' + (pace * 100) + '% - 1px)';
    paceEl.title = 'Where you would be spending evenly through the month';
    let foot = '';
    const isCurrent = key === monthOf(todayISO());
    if (!(budgeted > 0)) foot = 'Set a monthly budget on your categories below to start tracking.';
    else if (isCurrent) {
      const dayN = parseISO(todayISO()).getDate(), left = daysIn(key) - dayN;
      const perDay = Math.max(0, budgeted - total) / Math.max(1, left + 1);
      foot = 'Day ' + dayN + ' of ' + daysIn(key) + ' · ' + (left ? money(perDay) + ' per day left to stay on budget' : money(Math.max(0, budgeted - total)) + ' left for today');
    } else if (pace >= 1) foot = total <= budgeted ? 'Finished ' + money(budgeted - total) + ' under budget' : 'Finished ' + money(total - budgeted) + ' over budget';
    $('bgHeroFoot').innerHTML = '<span>' + esc(foot) + '</span><span class="bg-status ' + st.tone + '">' + esc(st.label) + '</span>';
  }

  function renderCategories(cats, spent) {
    const table = $('bgCatTable');
    const pace = monthPace(state.month);
    const rows = cats.map(c => ({ c, s: spent[c.id] || 0 }));
    const knownIds = new Set(cats.map(c => c.id));
    const orphan = Object.entries(spent).filter(([id]) => !knownIds.has(id)).reduce((s, [, v]) => s + v, 0);
    $('bgCatCount').textContent = cats.length + (cats.length === 1 ? ' category' : ' categories');
    if (!cats.length) { table.innerHTML = '<div class="bg-empty">No categories yet. Add your first one below.</div>'; return; }
    table.innerHTML = rows.map(({ c, s }) => {
      const b = Number(c.budget) || 0;
      const st = statusOf(s, b, c.fixed ? 1 : pace);
      const left = b - s;
      return '<div class="bg-cat-row" data-id="' + esc(c.id) + '">'
        + '<div class="bg-cat-line">'
        + '<div class="bg-cat-name">' + esc(catLabel(c)) + (c.fixed ? '<span class="bg-tag">Fixed</span>' : '') + '</div>'
        + '<div class="bg-cat-nums"><b>' + esc(money(s)) + '</b> / <button type="button" class="bg-budget-btn" title="Edit monthly budget">' + esc(b > 0 ? money(b) : 'set budget') + '</button></div>'
        + '<div><button type="button" class="bg-x edit" data-act="edit" aria-label="Edit ' + esc(c.name) + '">' + PENCIL + '</button><button type="button" class="bg-x" data-act="del" aria-label="Delete ' + esc(c.name) + '">×</button></div>'
        + '</div>'
        + '<div class="bg-bar"><div class="bg-bar-fill ' + st.cls + '" style="width:' + (b > 0 ? clamp(s / b, 0, 1) * 100 : (s > 0 ? 100 : 0)) + '%"></div>'
        + (!c.fixed && b > 0 && pace > 0 && pace < 1 ? '<div class="bg-bar-pace" style="left:calc(' + pace * 100 + '% - 1px)"></div>' : '') + '</div>'
        + '<div class="bg-cat-foot"><span class="bg-cat-left">' + (b > 0 ? (left >= 0 ? esc(money(left)) + ' left' : esc(money(-left)) + ' over') : '') + '</span>'
        + '<span class="bg-status ' + st.tone + '">' + esc(st.label) + '</span></div>'
        + '</div>';
    }).join('') + (orphan > 0 ? '<div class="bg-cat-row"><div class="bg-cat-line"><div class="bg-cat-name">❔ Uncategorized</div><div class="bg-cat-nums"><b>' + esc(money(orphan)) + '</b></div><div></div></div><div class="bg-cat-left">Pick a category for these in Transactions below.</div></div>' : '');

    table.querySelectorAll('.bg-cat-row[data-id]').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.bg-budget-btn').addEventListener('click', () => editCategory(row, id, true));
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editCategory(row, id, false));
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        const c = getCats().find(x => x.id === id);
        const used = getTx().some(t => t.categoryId === id);
        if (!c || !confirm('Delete "' + c.name + '"?' + (used ? ' Its transactions will become uncategorized.' : ''))) return;
        save(K.cats, getCats().filter(x => x.id !== id));
      });
    });
  }

  function editCategory(row, id, focusBudget) {
    const c = getCats().find(x => x.id === id);
    if (!c) return;
    row.innerHTML = '<div class="bg-inline">'
      + '<input class="e-icon" maxlength="4" value="' + esc(c.icon || '') + '" aria-label="Icon" />'
      + '<input class="e-name" value="' + esc(c.name) + '" aria-label="Name" />'
      + '<input class="e-budget" type="number" min="0" step="1" value="' + esc(inputVal(c.budget)) + '" placeholder="Monthly budget" aria-label="Monthly budget" />'
      + '<label class="bg-check"><input class="e-fixed" type="checkbox"' + (c.fixed ? ' checked' : '') + ' /> Fixed</label>'
      + '<button type="button" class="bg-btn bg-btn-primary bg-btn-sm e-save">Save</button>'
      + '<button type="button" class="bg-btn bg-btn-sm e-cancel">Cancel</button></div>';
    const commit = () => {
      const name = row.querySelector('.e-name').value.trim();
      if (!name) return;
      const cats = getCats();
      const i = cats.findIndex(x => x.id === id);
      if (i < 0) return;
      cats[i] = { ...cats[i], name, icon: row.querySelector('.e-icon').value.trim(), budget: num(row.querySelector('.e-budget').value), fixed: row.querySelector('.e-fixed').checked };
      save(K.cats, cats);
    };
    row.querySelector('.e-save').addEventListener('click', commit);
    row.querySelector('.e-cancel').addEventListener('click', renderAll);
    row.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderAll(); }));
    const f = row.querySelector(focusBudget ? '.e-budget' : '.e-name');
    f.focus(); f.select();
  }

  function renderTransactions() {
    const cats = getCats(), methods = getMethods();
    const list = $('bgTxList');
    const txs = txInMonth(state.month)
      .filter(t => (!state.filterCat || t.categoryId === state.filterCat) && (!state.filterMethod || t.methodId === state.filterMethod))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    if (!txs.length) {
      list.innerHTML = '<div class="bg-empty">' + (getTx().length ? 'No transactions match for ' + esc(monthLabel(state.month)) + '.' : 'Scan a receipt or log an expense above. Each one lands in a category and counts against its budget.') + '</div>';
      return;
    }
    const total = txs.reduce((s, t) => s + t.amount, 0);
    let lastDate = '';
    list.innerHTML = '<div class="bg-card-sub" style="margin:-4px 4px 4px">' + txs.length + ' transactions · ' + esc(money(total)) + '</div>' + txs.map(t => {
      const head = t.date !== lastDate ? '<div class="bg-day-head">' + esc(parseISO(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) + '</div>' : '';
      lastDate = t.date;
      const m = methods.find(x => x.id === t.methodId);
      const itemsText = t.items && t.items.length ? t.items.slice(0, 4).join(', ') + (t.items.length > 4 ? ' +' + (t.items.length - 4) : '') : '';
      const known = cats.some(c => c.id === t.categoryId);
      return head + '<div class="bg-row" data-id="' + esc(t.id) + '">'
        + '<div class="bg-row-date">' + (t.receiptId ? '🧾' : '✍️') + '</div>'
        + '<div class="bg-row-main"><div class="bg-row-title" title="' + esc(itemsText) + '">' + esc(t.merchant) + (itemsText ? ' <span class="bg-muted" style="font-weight:400">· ' + esc(itemsText) + '</span>' : '') + '</div>'
        + '<div class="bg-row-meta"><select class="bg-mini tx-cat" aria-label="Category">' + (known ? '' : '<option value="" selected>❔ Uncategorized</option>') + catOptions(t.categoryId) + '</select>'
        + '<span>' + esc(m ? (METHOD_ICONS[m.type] || '💳') + ' ' + m.name : 'No card set') + '</span></div></div>'
        + '<div class="bg-row-amt">' + esc(money(t.amount)) + '</div>'
        + '<button type="button" class="bg-x" aria-label="Delete transaction">×</button></div>';
    }).join('');
    list.querySelectorAll('.bg-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.tx-cat').addEventListener('change', e => {
        save(K.tx, getTx().map(t => t.id === id ? { ...t, categoryId: e.target.value } : t));
      });
      row.querySelector('.bg-x').addEventListener('click', () => {
        const t = getTx().find(x => x.id === id);
        if (t && confirm('Delete ' + t.merchant + ' (' + money(t.amount) + ')?' + (t.deductedFrom ? ' The amount goes back to ' + accountName(t.deductedFrom) + '.' : ''))) deleteTransaction(id);
      });
    });
  }

  function renderMethods() {
    const list = $('bgMethodList');
    const methods = getMethods();
    const monthTx = txInMonth(monthOf(todayISO()));
    if (!methods.length) { list.innerHTML = '<div class="bg-empty">Add the cards you use and cash.</div>'; }
    else {
      list.innerHTML = methods.map(m => {
        const used = monthTx.filter(t => t.methodId === m.id).reduce((s, t) => s + t.amount, 0);
        return '<div class="bg-row bg-method-row" data-id="' + esc(m.id) + '">'
          + '<div class="bg-method-icon">' + (METHOD_ICONS[m.type] || '💳') + '</div>'
          + '<div class="bg-row-main"><div class="bg-row-title">' + esc(m.name) + ' <span class="bg-tag">' + esc(m.type) + '</span></div>'
          + '<div class="bg-row-meta"><select class="bg-mini m-acct" aria-label="Linked account">' + accountOptions(m.account, m.type === 'credit' ? 'Not linked (track only)' : 'Not linked') + '</select></div></div>'
          + '<div class="bg-row-amt" title="Spent this month">' + esc(money(used)) + '</div>'
          + '<button type="button" class="bg-x" aria-label="Delete ' + esc(m.name) + '">×</button></div>';
      }).join('');
      list.querySelectorAll('.bg-row').forEach(row => {
        const id = row.dataset.id;
        row.querySelector('.m-acct').addEventListener('change', e => save(K.methods, getMethods().map(m => m.id === id ? { ...m, account: e.target.value } : m)));
        row.querySelector('.bg-x').addEventListener('click', () => {
          const m = getMethods().find(x => x.id === id);
          if (m && confirm('Remove ' + m.name + '? Past transactions keep their amounts.')) save(K.methods, getMethods().filter(x => x.id !== id));
        });
      });
    }
    const acctSel = $('bgMethodAccount');
    const prev = acctSel.value;
    acctSel.innerHTML = accountOptions(prev, 'Link to account (optional)');
  }

  function renderForms() {
    const catSel = $('bgTxCategory'), methodSel = $('bgTxMethod');
    const prevCat = catSel.value, prevMethod = methodSel.value || getPrefs().lastMethod || '';
    catSel.innerHTML = catOptions(prevCat);
    methodSel.innerHTML = methodOptions(prevMethod);
    if (!$('bgTxDate').value) $('bgTxDate').value = todayISO();
    const fc = $('bgFilterCat'), fm = $('bgFilterMethod');
    fc.innerHTML = catOptions(state.filterCat, true);
    fm.innerHTML = methodOptions(state.filterMethod, true);
  }

  // ============================================================
  // SAVINGS AUTOPILOT — for every goal with a target and a "complete by"
  // date, work out what % of each payday must go to it to finish on time,
  // from the last 30 days of pay, and set that % on the goal. Runs on
  // load and whenever pay or goals change. Plain math, no AI, so the
  // numbers are exact; the coach (coach.js) explains them.
  // ============================================================
  function autoPlan() {
    const today = todayISO();
    const goals = getGoals();
    const dated = goals.filter(g => g.deadline && Number(g.target) > 0 && !goalDone(g));
    const prev = storeGet(K.plan) || {};
    const plan = { updatedAt: Date.now(), date: today, goals: [], notes: [], changes: prev.changes || [], changedAt: prev.changedAt || null, status: 'ok' };
    if (!dated.length) {
      plan.status = goals.length ? 'no-dates' : 'no-goals';
      storeSet(K.plan, plan);
      return plan;
    }
    const recent = getIncome().filter(e => e.date >= addDays(today, -29) && e.date <= today);
    const payDays = new Set(recent.map(e => e.date)).size;
    if (payDays < 3) {
      plan.status = 'need-pay';
      storeSet(K.plan, plan);
      return plan;
    }
    const firstPay = recent.map(e => e.date).sort()[0];
    const windowDays = Math.max(7, Math.min(30, daysBetween(firstPay, today) + 1));
    const avgPay = recent.reduce((sum, e) => sum + e.amount, 0) / payDays;
    const paydaysPerDay = payDays / windowDays;
    const manualPct = goals.filter(g => !dated.includes(g) && !goalDone(g)).reduce((sum, g) => sum + (Number(g.percent) || 0), 0);

    const needs = dated.map(g => {
      const remaining = Number(g.target) - (Number(g.saved) || 0);
      const daysLeft = Math.max(1, daysBetween(today, g.deadline));
      const paydaysLeft = Math.max(1, daysLeft * paydaysPerDay);
      const pct = Math.ceil(remaining / paydaysLeft / avgPay * 100 * 2) / 2; // round up to 0.5%
      return { g, remaining, daysLeft, pct };
    });
    // Never plan to save more than 80% of pay in total; if dates need more,
    // scale down and report when each goal will actually finish.
    const cap = Math.max(0, 80 - manualPct);
    const wanted = needs.reduce((sum, n) => sum + n.pct, 0);
    const scale = wanted > cap ? cap / wanted : 1;
    if (scale < 1) plan.notes.push('Hitting every date would take ' + round2(wanted + manualPct) + '% of your pay, so goals are capped at 80% in total. Consider later dates or earning more.');

    const changes = [];
    needs.forEach(n => {
      const pct = Math.floor(n.pct * scale * 2) / 2;
      const perPayday = avgPay * pct / 100;
      const finishDays = perPayday > 0 ? Math.ceil(n.remaining / perPayday / paydaysPerDay) : Infinity;
      const onTrack = finishDays <= n.daysLeft;
      const old = Number(n.g.percent) || 0;
      if (Math.abs(old - pct) >= 0.5) changes.push({ goalId: n.g.id, name: n.g.name, icon: n.g.icon || '', from: old, to: pct });
      n.g.percent = pct;
      n.g.autoPercent = true;
      plan.goals.push({ goalId: n.g.id, name: n.g.name, icon: n.g.icon || '', pct, perPayday: round2(perPayday), deadline: n.g.deadline, remaining: round2(n.remaining), onTrack, finish: isFinite(finishDays) ? addDays(today, finishDays) : null });
    });
    goals.forEach(g => { if (!dated.includes(g)) delete g.autoPercent; });
    storeSet(K.goals, goals);
    plan.avgPay = round2(avgPay);
    plan.payDays = payDays;
    plan.totalPct = round2(manualPct + plan.goals.reduce((sum, x) => sum + x.pct, 0));
    if (changes.length) { plan.changes = changes; plan.changedAt = Date.now(); }
    storeSet(K.plan, plan);
    if (changes.length) window.dispatchEvent(new Event('budget:plan'));
    return plan;
  }

  // ============================================================
  // PAYDAY — daily pay with a suggested savings split
  // ============================================================
  const plannedPercent = () => getGoals().filter(g => !goalDone(g)).reduce((s, g) => s + (Number(g.percent) || 0), 0);

  // Returns { lines: [{goal, amount}], notes: [] } for a day's pay.
  function suggestSplit(pay, dateISO) {
    const notes = [];
    const goals = getGoals().filter(g => !goalDone(g));
    if (!(pay > 0) || !goals.length) return { lines: [], notes };
    const totalPct = goals.reduce((s, g) => s + (Number(g.percent) || 0), 0);
    const weights = goals.map(g => totalPct > 0 ? (Number(g.percent) || 0) / totalPct : 1 / goals.length);
    let base = totalPct > 0 ? pay * totalPct / 100 : pay * 0.2;
    if (!(totalPct > 0)) notes.push('No % set on your goals yet, so this sets aside 20% and splits it evenly. Give each goal a "complete by" date and the coach sets the % for you.');

    // A better-than-usual day: bank half of the extra.
    const since = addDays(dateISO, -30);
    const recent = getIncome().filter(e => e.date >= since && e.date < dateISO);
    const byDay = {};
    recent.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.amount; });
    const days = Object.values(byDay);
    const avg = days.length >= 3 ? days.reduce((s, v) => s + v, 0) / days.length : 0;
    let extra = 0;
    if (avg > 0 && pay > avg * 1.15) {
      extra = (pay - avg) * 0.5;
      notes.push('Above your usual ' + money(avg) + ' a day, so half of the extra ' + money(pay - avg) + ' goes to savings too.');
    }

    // Light month: if pay so far (after savings) hasn't kept up with the budget
    // since the first payday logged this month, ease off. Needs a few paydays
    // of history so a first entry mid-month isn't judged against the whole month.
    const month = monthOf(dateISO);
    const budgetTotal = getCats().reduce((s, c) => s + (Number(c.budget) || 0), 0);
    const monthInc = getIncome().filter(e => monthOf(e.date) === month && e.date <= dateISO);
    const payDays = new Set(monthInc.map(e => e.date).concat(dateISO));
    if (budgetTotal > 0 && payDays.size >= 5) {
      const firstDay = [...payDays].sort()[0];
      const kept = monthInc.reduce((s, e) => s + e.amount - (e.allocations || []).reduce((a, x) => a + x.amount, 0), 0) + pay - base;
      const need = budgetTotal * (daysBetween(firstDay, dateISO) + 1) / daysIn(month);
      if (kept < need * 0.9 && extra === 0) {
        base *= 0.6;
        notes.push('Your pay this month is behind what your budget needs (' + money(need) + ' by today), so this saves a bit less and keeps more for spending.');
      }
    }

    const pot = base + extra;
    const lines = goals.map((g, i) => {
      let amount = pot * weights[i];
      const room = Number(g.target) > 0 ? Number(g.target) - (Number(g.saved) || 0) : Infinity;
      if (amount > room) { amount = room; notes.push(g.name + ' only needs ' + money(room) + ' more to hit its target 🎉'); }
      return { goal: g, amount: round2(amount) };
    });
    lines.forEach(l => {
      if (l.goal.deadline && Number(l.goal.target) > 0) {
        const weeksLeft = Math.max(1, daysBetween(dateISO, l.goal.deadline) / 7);
        const perWeek = (Number(l.goal.target) - (Number(l.goal.saved) || 0)) / weeksLeft;
        if (perWeek > 0) notes.push(l.goal.name + ': about ' + money(perWeek) + ' a week reaches it by ' + shortDate(l.goal.deadline) + '.');
      }
    });
    return { lines, notes };
  }

  let payDraft = null; // { key, amounts: {goalId: displayAmount} }
  function renderPaySplit() {
    const box = $('bgPaySplit');
    const payDisplay = parseFloat($('bgPayAmount').value);
    const date = validISO($('bgPayDate').value) ? $('bgPayDate').value : todayISO();
    if (!(payDisplay > 0)) {
      payDraft = null;
      box.innerHTML = '<div class="bg-empty">Enter what you made and you\'ll get a suggested amount to set aside for each savings goal.' + (getGoals().length ? '' : ' Add a goal below first.') + '</div>';
      return;
    }
    const { lines, notes } = suggestSplit(round2(payDisplay), date);
    const key = payDisplay + '|' + date + '|' + lines.map(l => l.goal.id).join(',');
    if (!payDraft || payDraft.key !== key) payDraft = { key, amounts: Object.fromEntries(lines.map(l => [l.goal.id, l.amount])) };
    const setAside = lines.reduce((s, l) => s + (Number(payDraft.amounts[l.goal.id]) || 0), 0);
    const keep = payDisplay - setAside;
    box.innerHTML = '<div class="bg-split">'
      + (lines.length ? lines.map(l => {
        const v = payDraft.amounts[l.goal.id];
        return '<div class="bg-split-row" data-goal="' + esc(l.goal.id) + '"><div class="bg-split-name">' + esc((l.goal.icon ? l.goal.icon + ' ' : '') + l.goal.name)
          + '<small>' + (l.goal.account ? 'Moves to ' + esc(accountName(l.goal.account)) : 'Tracked (no account linked)') + '</small></div>'
          + '<div class="bg-split-pct">' + (payDisplay > 0 ? Math.round((Number(v) || 0) / payDisplay * 100) : 0) + '%</div>'
          + '<input type="number" min="0" step="0.01" value="' + esc(v) + '" aria-label="Amount for ' + esc(l.goal.name) + '" /></div>';
      }).join('') : '<div class="bg-empty">Add a savings goal below to get a suggested split.</div>')
      + '<div class="bg-split-total"><span>Set aside <b>' + esc(money(setAside)) + '</b> (' + Math.round(setAside / payDisplay * 100) + '%)</span>'
      + '<span>Keep for spending <b style="color:' + (keep < 0 ? '#FF8A8A' : '') + '">' + esc(money(keep)) + '</b></span></div>'
      + (notes.length ? '<div class="bg-notes">' + notes.map(n => '<div>' + esc(n) + '</div>').join('') + '</div>' : '')
      + '<div class="bg-form-hint" id="bgPayHint"></div>'
      + '<div class="bg-split-actions"><button type="button" class="bg-btn" id="bgPayOnly">Just log pay</button>'
      + (lines.length ? '<button type="button" class="bg-btn bg-btn-primary" id="bgPaySave">Log pay &amp; set aside</button>' : '') + '</div></div>';
    box.querySelectorAll('.bg-split-row').forEach(row => {
      row.querySelector('input').addEventListener('change', e => { payDraft.amounts[row.dataset.goal] = Math.max(0, parseFloat(e.target.value) || 0); renderPaySplit(); });
    });
    $('bgPayOnly').addEventListener('click', () => logPay(false));
    if ($('bgPaySave')) $('bgPaySave').addEventListener('click', () => logPay(true));
  }

  function logPay(withSavings) {
    const payDisplay = parseFloat($('bgPayAmount').value);
    const date = $('bgPayDate').value;
    const hint = $('bgPayHint');
    if (!(payDisplay > 0)) return;
    if (!validISO(date)) { hint.textContent = 'Pick a date.'; hint.classList.add('error'); return; }
    const pay = round2(payDisplay);
    const source = $('bgPaySource').value.trim();
    const depositTo = $('bgPayAccount').value;
    const allocations = withSavings && payDraft
      ? Object.entries(payDraft.amounts).map(([goalId, v]) => ({ goalId, amount: num(v) })).filter(a => a.amount > 0)
      : [];
    const setAside = allocations.reduce((s, a) => s + a.amount, 0);
    if (setAside > pay + 0.005) { hint.textContent = 'You\'re setting aside more than you made.'; hint.classList.add('error'); return; }

    // Money moves: pay lands in the deposit account, then each goal's share
    // moves to that goal's linked account. Stored so deleting reverses it.
    const moves = [];
    const label = 'Pay' + (source ? ' · ' + source : '');
    if (depositTo && adjustAccount(depositTo, pay, label)) moves.push({ ref: depositTo, delta: pay, label });
    const goals = getGoals();
    allocations.forEach(a => {
      const g = goals.find(x => x.id === a.goalId);
      if (!g) return;
      g.saved = round2((Number(g.saved) || 0) + a.amount);
      if (depositTo && g.account && g.account !== depositTo && moves.length) {
        if (adjustAccount(depositTo, -a.amount, 'To ' + g.name)) moves.push({ ref: depositTo, delta: -a.amount, label: 'To ' + g.name });
        if (adjustAccount(g.account, a.amount, g.name)) moves.push({ ref: g.account, delta: a.amount, label: g.name });
      }
    });
    if (moves.length) F.renderAllNetWorth();
    storeSet(K.goals, goals);
    storeSet(K.prefs, { ...getPrefs(), payAccount: depositTo, paySource: source });
    const entry = { id: uid('i_'), date, amount: pay, source, depositTo, allocations, moves, createdAt: Date.now() };
    $('bgPayAmount').value = '';
    payDraft = null;
    storeSet(K.income, getIncome().concat(entry));
    autoPlan();
    save(K.income, getIncome());
    toast('💵 Logged ' + money(pay) + (setAside > 0 ? ' · ' + money(setAside) + ' set aside' : ''));
  }

  function deleteIncome(id) {
    const all = getIncome();
    const e = all.find(x => x.id === id);
    if (!e) return;
    applyMoves((e.moves || []).map(m => ({ ...m, label: 'Undo · ' + m.label })), -1);
    const goals = getGoals();
    (e.allocations || []).forEach(a => { const g = goals.find(x => x.id === a.goalId); if (g) g.saved = round2(Math.max(0, (Number(g.saved) || 0) - a.amount)); });
    storeSet(K.goals, goals);
    storeSet(K.income, all.filter(x => x.id !== id));
    autoPlan();
    save(K.income, getIncome());
  }

  function renderPayday() {
    const prefs = getPrefs();
    if (!$('bgPayDate').value) $('bgPayDate').value = todayISO();
    if (!$('bgPaySource').value && prefs.paySource) $('bgPaySource').value = prefs.paySource;
    const acct = $('bgPayAccount');
    const prevAcct = acct.value || prefs.payAccount || '';
    acct.innerHTML = accountOptions(prevAcct, 'Deposit into… (optional)');
    const wk = weekStartOf(todayISO());
    const weekInc = getIncome().filter(e => e.date >= wk);
    $('bgPayWeek').textContent = 'This week: ' + money(weekInc.reduce((s, e) => s + e.amount, 0)) + ' earned · ' + money(weekInc.reduce((s, e) => s + (e.allocations || []).reduce((a, x) => a + x.amount, 0), 0)) + ' saved';
    renderPaySplit();
    renderGoals();
    renderIncomeLog();
  }

  function renderGoals() {
    const list = $('bgGoalList');
    const goals = getGoals();
    const pct = plannedPercent();
    $('bgGoalPct').textContent = goals.length ? 'Saving ' + round2(pct) + '% of each day\'s pay' : '';
    const acctSel = $('bgGoalAccount');
    acctSel.innerHTML = accountOptions(acctSel.value, 'Savings account (optional)');
    if (!goals.length) { list.innerHTML = '<div class="bg-empty">Add what you\'re saving for, like an emergency fund, a car, or a trip. Give each one a % of each day\'s pay.</div>'; return; }
    const today = todayISO();
    list.innerHTML = goals.map(g => {
      const target = Number(g.target) || 0, saved = Number(g.saved) || 0;
      const done = goalDone(g);
      let pace = '';
      let tone = 'ok', label = done ? 'Reached' : 'Saving';
      if (!done && g.deadline && target > 0) {
        const weeksLeft = daysBetween(today, g.deadline) / 7;
        if (weeksLeft <= 0) { pace = 'Deadline passed'; tone = 'over'; label = 'Past due'; }
        else {
          const perWeek = (target - saved) / weeksLeft;
          const wkStart = weekStartOf(today);
          const thisWeek = getIncome().filter(e => e.date >= wkStart).reduce((s, e) => s + (e.allocations || []).filter(a => a.goalId === g.id).reduce((a, x) => a + x.amount, 0), 0);
          pace = 'Complete by ' + shortDate(g.deadline) + ' · ' + money(perWeek) + '/week needed · ' + money(thisWeek) + ' this week';
          if (thisWeek < perWeek * 0.5 && parseISO(today).getDay() === 0) { tone = 'warn'; label = 'Behind'; }
        }
      }
      return '<div class="bg-goal" data-id="' + esc(g.id) + '">'
        + '<div class="bg-goal-top"><div class="bg-goal-name">' + esc((g.icon ? g.icon + ' ' : '') + g.name) + ' <span class="bg-tag"' + (g.autoPercent ? ' title="Set automatically by your coach to finish by ' + esc(shortDate(g.deadline)) + '"' : '') + '>' + (g.autoPercent ? '✨ auto · ' : '') + (Number(g.percent) || 0) + '% of pay</span></div>'
        + '<div class="bg-cat-nums"><b>' + esc(money(saved)) + '</b>' + (target > 0 ? ' / ' + esc(money(target)) : '') + '</div>'
        + '<div><button type="button" class="bg-x edit" data-act="edit" aria-label="Edit ' + esc(g.name) + '">' + PENCIL + '</button><button type="button" class="bg-x" data-act="del" aria-label="Delete ' + esc(g.name) + '">×</button></div></div>'
        + '<div class="bg-bar"><div class="bg-bar-fill' + (done ? '' : '') + '" style="width:' + (target > 0 ? clamp(saved / target, 0, 1) * 100 : 0) + '%"></div></div>'
        + '<div class="bg-goal-meta"><span>' + esc(pace || (g.account ? 'Saved into ' + accountName(g.account) : 'No account linked')) + '</span><span class="bg-status ' + tone + '">' + esc(label) + '</span></div></div>';
    }).join('');
    list.querySelectorAll('.bg-goal').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        const g = getGoals().find(x => x.id === id);
        if (g && confirm('Delete the goal "' + g.name + '"? Money already moved stays in your accounts.')) { storeSet(K.goals, getGoals().filter(x => x.id !== id)); autoPlan(); save(K.goals, getGoals()); }
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => editGoal(row, id));
    });
  }

  function editGoal(row, id) {
    const g = getGoals().find(x => x.id === id);
    if (!g) return;
    row.innerHTML = '<div class="bg-inline bg-goal-inline">'
      + '<input class="e-icon" maxlength="4" value="' + esc(g.icon || '') + '" aria-label="Icon" />'
      + '<input class="e-name" value="' + esc(g.name) + '" aria-label="Name" />'
      + '<input class="e-target" type="number" min="0" value="' + esc(inputVal(g.target)) + '" placeholder="Target" aria-label="Target" />'
      + '<input class="e-saved" type="number" min="0" value="' + esc(inputVal(g.saved)) + '" placeholder="Saved so far" aria-label="Saved so far" />'
      + '<input class="e-pct" type="number" min="0" max="100" value="' + esc(Number(g.percent) || 0) + '" aria-label="% of pay"' + (g.deadline ? ' disabled title="Automatic: set by your coach from the complete-by date"' : '') + ' />'
      + '<input class="e-deadline" type="date" value="' + esc(g.deadline || '') + '" aria-label="Complete by" title="Complete by" />'
      + '<select class="e-acct" aria-label="Savings account">' + accountOptions(g.account, 'No account') + '</select></div>'
      + '<div class="bg-split-actions"><button type="button" class="bg-btn bg-btn-sm e-cancel">Cancel</button><button type="button" class="bg-btn bg-btn-primary bg-btn-sm e-save">Save</button></div>';
    row.querySelector('.e-cancel').addEventListener('click', renderPayday);
    row.querySelector('.e-save').addEventListener('click', () => {
      const name = row.querySelector('.e-name').value.trim();
      if (!name) return;
      save(K.goals, getGoals().map(x => x.id === id ? {
        ...x, name, icon: row.querySelector('.e-icon').value.trim(),
        target: num(row.querySelector('.e-target').value), saved: num(row.querySelector('.e-saved').value),
        percent: clamp(parseFloat(row.querySelector('.e-pct').value) || 0, 0, 100),
        deadline: validISO(row.querySelector('.e-deadline').value) ? row.querySelector('.e-deadline').value : '',
        account: row.querySelector('.e-acct').value
      } : x));
      autoPlan();
      renderAll();
    });
    row.querySelector('.e-deadline').addEventListener('change', e => {
      row.querySelector('.e-pct').disabled = !!e.target.value;
    });
  }

  function renderIncomeLog() {
    const list = $('bgIncomeList');
    const inc = getIncome().slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    const month = monthOf(todayISO());
    const monthInc = inc.filter(e => monthOf(e.date) === month);
    $('bgIncomeTotals').textContent = monthLabel(month).split(' ')[0] + ': ' + money(monthInc.reduce((s, e) => s + e.amount, 0)) + ' over ' + new Set(monthInc.map(e => e.date)).size + ' days';
    if (!inc.length) { list.innerHTML = '<div class="bg-empty">Your daily pay shows up here.</div>'; return; }
    list.innerHTML = inc.slice(0, 40).map(e => {
      const aside = (e.allocations || []).reduce((s, a) => s + a.amount, 0);
      return '<div class="bg-row" data-id="' + esc(e.id) + '"><div class="bg-row-date">' + esc(shortDate(e.date)) + '</div>'
        + '<div class="bg-row-main"><div class="bg-row-title">' + esc(e.source || 'Pay') + '</div><div class="bg-row-meta">'
        + (aside > 0 ? '<span>' + esc(money(aside)) + ' set aside (' + Math.round(aside / e.amount * 100) + '%)</span>' : '<span>Nothing set aside</span>')
        + (e.depositTo ? '<span>→ ' + esc(accountName(e.depositTo)) + '</span>' : '') + '</div></div>'
        + '<div class="bg-row-amt">+' + esc(money(e.amount)) + '</div><button type="button" class="bg-x" aria-label="Delete">×</button></div>';
    }).join('');
    list.querySelectorAll('.bg-row').forEach(row => row.querySelector('.bg-x').addEventListener('click', () => {
      const e = getIncome().find(x => x.id === row.dataset.id);
      if (e && confirm('Delete this pay entry (' + money(e.amount) + ')? Account moves and goal savings from it are reversed.')) deleteIncome(e.id);
    }));
  }

  // ============================================================
  // WEEKLY SCORE — savings 35% · spending 40% · goals 25%
  // ============================================================
  function gradeOf(score) {
    return score >= 97 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  }

  function computeWeek(start) {
    const end = addDays(start, 6);
    const today = todayISO();
    const upTo = today < end ? today : end;
    const daysCounted = clamp(daysBetween(start, upTo) + 1, 1, 7);
    const cats = getCats(), goals = getGoals();
    const income = getIncome().filter(e => e.date >= start && e.date <= upTo);
    const earned = income.reduce((s, e) => s + e.amount, 0);
    const saved = income.reduce((s, e) => s + (e.allocations || []).reduce((a, x) => a + x.amount, 0), 0);
    const boosts = [];

    // Savings: what you set aside vs. the plan (goal %s of what you earned).
    const pct = plannedPercent() || (goals.length ? 0 : 20);
    const planned = earned * pct / 100;
    let savings, savingsWhy;
    if (!(earned > 0)) { savings = saved > 0 ? 100 : 50; savingsWhy = 'No pay logged yet this week.'; boosts.push('Log each day\'s pay on the Payday tab.'); }
    else if (!(planned > 0)) { savings = saved > 0 ? 100 : 60; savingsWhy = 'Saved ' + money(saved) + ' of ' + money(earned) + ' earned.'; }
    else {
      savings = clamp(saved / planned, 0, 1) * 100;
      savingsWhy = 'Set aside ' + money(saved) + ' of the ' + money(planned) + ' plan (' + round2(pct) + '% of ' + money(earned) + ').';
      if (saved < planned - 0.5) boosts.push('Set aside ' + money(planned - saved) + ' more to max out savings.');
    }

    // Spending: flexible categories vs. a weekly slice of their monthly budget.
    const month = monthOf(start);
    const weekTx = txBetween(start, upTo);
    const spent = spentBy(weekTx);
    const flex = cats.filter(c => !c.fixed && Number(c.budget) > 0);
    const allowance = flex.reduce((s, c) => s + c.budget * daysCounted / daysIn(month), 0);
    const flexSpent = flex.reduce((s, c) => s + (spent[c.id] || 0), 0) + weekTx.filter(t => !cats.some(c => c.id === t.categoryId)).reduce((s, t) => s + t.amount, 0);
    let spending, spendingWhy;
    if (!(allowance > 0)) { spending = 50; spendingWhy = 'Set monthly budgets on your categories to score spending.'; boosts.push('Give your categories a monthly budget.'); }
    else {
      const ratio = flexSpent / allowance;
      spending = ratio <= 0.8 ? 100 : ratio <= 1 ? 100 - (ratio - 0.8) * 75 : Math.max(0, 85 - (ratio - 1) * 170);
      const blown = flex.filter(c => (spent[c.id] || 0) > c.budget * daysCounted / daysIn(month) * 1.2 && (spent[c.id] || 0) > 1);
      spending = Math.max(0, spending - blown.length * 4);
      spendingWhy = 'Spent ' + money(flexSpent) + ' of a ' + money(allowance) + ' allowance so far' + (blown.length ? ' · over in ' + blown.map(c => c.name).join(', ') : '') + '.';
      const monthTx = txBetween(month + '-01', upTo);
      const monthSpent = spentBy(monthTx);
      const fixedOver = cats.filter(c => c.fixed && Number(c.budget) > 0 && (monthSpent[c.id] || 0) > c.budget + 0.005);
      if (fixedOver.length) { spending = Math.max(0, spending - 10); spendingWhy += ' Fixed costs over budget: ' + fixedOver.map(c => c.name).join(', ') + '.'; }
      if (upTo < end) {
        const fullAllowance = flex.reduce((s, c) => s + c.budget * 7 / daysIn(month), 0);
        const room = fullAllowance * 0.8 - flexSpent;
        if (room > 0) boosts.push('Keep flexible spending under ' + money(room) + ' for the rest of the week for a perfect spending score.');
        else boosts.push('Try a no-spend day or two to pull spending back toward budget.');
      }
    }

    // Goals: on pace for each goal (deadline pace, or its % of this week's pay).
    const active = goals.filter(g => !(goalDone(g) && !income.some(e => (e.allocations || []).some(a => a.goalId === g.id))));
    let goalsScore, goalsWhy;
    if (!active.length) { goalsScore = goals.length ? 100 : 50; goalsWhy = goals.length ? 'Every goal is funded 🎉' : 'Add a savings goal to score this.'; if (!goals.length) boosts.push('Add a savings goal on the Payday tab.'); }
    else {
      const parts = active.map(g => {
        const got = income.reduce((s, e) => s + (e.allocations || []).filter(a => a.goalId === g.id).reduce((a, x) => a + x.amount, 0), 0);
        let need;
        if (g.deadline && Number(g.target) > 0) {
          const savedBefore = (Number(g.saved) || 0) - getIncome().filter(e => e.date >= start).reduce((s, e) => s + (e.allocations || []).filter(a => a.goalId === g.id).reduce((a, x) => a + x.amount, 0), 0);
          const weeksLeft = Math.max(1, daysBetween(start, g.deadline) / 7);
          need = Math.max(0, g.target - savedBefore) / weeksLeft * daysCounted / 7;
        } else need = earned * (Number(g.percent) || 0) / 100;
        const score = need > 0 ? clamp(got / need, 0, 1) : (got > 0 || !(earned > 0) ? 1 : 0.6);
        if (need > got + 0.5) boosts.push('Put ' + money(need - got) + ' more toward ' + g.name + ' to stay on pace.');
        return { g, score };
      });
      goalsScore = parts.reduce((s, p) => s + p.score, 0) / parts.length * 100;
      const onPace = parts.filter(p => p.score >= 0.95).length;
      goalsWhy = onPace + ' of ' + parts.length + ' goals on pace this week.';
    }

    savings = Math.round(savings); spending = Math.round(spending); goalsScore = Math.round(goalsScore);
    const total = Math.round(savings * 0.35 + spending * 0.40 + goalsScore * 0.25);
    return { start, end, total, grade: gradeOf(total), savings, spending, goals: goalsScore, savingsWhy, spendingWhy, goalsWhy, boosts: [...new Set(boosts)].slice(0, 4), earned, saved, flexSpent, partial: today < end, daysLeft: Math.max(0, daysBetween(today, end)) };
  }

  // Completed weeks are scored once and frozen, so later edits to budgets
  // don't rewrite history. Only weeks with activity count.
  function freezeWeeks() {
    const scores = storeGet(K.scores) || {};
    const dates = getTx().map(t => t.date).concat(getIncome().map(e => e.date)).filter(validISO).sort();
    if (!dates.length) return scores;
    const thisWeek = weekStartOf(todayISO());
    let wk = weekStartOf(dates[0]);
    const earliest = addDays(thisWeek, -7 * 26);
    if (wk < earliest) wk = earliest;
    let changed = false;
    for (; wk < thisWeek; wk = addDays(wk, 7)) {
      if (scores[wk]) continue;
      const end = addDays(wk, 6);
      if (!dates.some(d => d >= wk && d <= end)) continue;
      const r = computeWeek(wk);
      scores[wk] = { total: r.total, grade: r.grade, savings: r.savings, spending: r.spending, goals: r.goals, earned: round2(r.earned), saved: round2(r.saved), spent: round2(r.flexSpent) };
      changed = true;
    }
    if (changed) storeSet(K.scores, scores);
    return scores;
  }

  let tooltipEl = null;
  function showTip(e, html) {
    if (!tooltipEl) { tooltipEl = document.createElement('div'); tooltipEl.className = 'bg-tooltip'; document.body.appendChild(tooltipEl); }
    tooltipEl.innerHTML = html;
    tooltipEl.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tooltipEl.offsetWidth - 8);
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = (e.clientY - tooltipEl.offsetHeight - 12) + 'px';
  }
  const hideTip = () => { if (tooltipEl) tooltipEl.hidden = true; };

  function scoreTone(v) { return v >= 80 ? '' : v >= 60 ? 'warn' : 'over'; }
  function subscore(name, value, why) {
    return '<div><div class="bg-subscore-top"><span class="bg-subscore-name">' + name + '</span><span class="bg-subscore-val">' + value + '</span></div>'
      + '<div class="bg-bar"><div class="bg-bar-fill ' + scoreTone(value) + '" style="width:' + value + '%"></div></div>'
      + '<div class="bg-subscore-why">' + esc(why) + '</div></div>';
  }

  function renderScore() {
    const scores = freezeWeeks();
    const now = computeWeek(weekStartOf(todayISO()));
    const R = 62, C = 2 * Math.PI * R;
    const ringColor = now.total >= 80 ? '#6BE3A4' : now.total >= 60 ? '#F2C063' : '#FF6B6B';
    $('bgScoreNow').innerHTML = '<div class="card bg-card">'
      + '<div class="bg-card-head"><div class="bg-card-title">This week, so far</div><div class="bg-card-sub">' + esc(shortDate(now.start) + ' – ' + shortDate(now.end)) + ' · ' + (now.daysLeft ? now.daysLeft + (now.daysLeft === 1 ? ' day' : ' days') + ' left' : 'last day') + '</div></div>'
      + '<div class="bg-score-hero"><div class="bg-ring" role="img" aria-label="Score ' + now.total + ' out of 100, grade ' + now.grade + '">'
      + '<svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="10"/>'
      + '<circle cx="75" cy="75" r="' + R + '" fill="none" stroke="' + ringColor + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * now.total / 100) + ' ' + C + '"/></svg>'
      + '<div class="bg-ring-center"><div class="bg-ring-score">' + now.total + '</div><div class="bg-ring-grade">GRADE ' + now.grade + '</div></div></div>'
      + '<div class="bg-subscores">' + subscore('💰 Savings', now.savings, now.savingsWhy) + subscore('🧾 Spending', now.spending, now.spendingWhy) + subscore('🎯 Goals', now.goals, now.goalsWhy) + '</div></div>'
      + (now.boosts.length ? '<div class="bg-boost"><div class="bg-eyebrow" style="margin-bottom:2px">Boost your score</div>' + now.boosts.map(b => '<div>' + esc(b) + '</div>').join('') + '</div>' : '')
      + '</div>';

    const weeks = Object.keys(scores).sort();
    const last = weeks[weeks.length - 1];
    const lastWeekStart = addDays(weekStartOf(todayISO()), -7);
    if (last) {
      const s = scores[last], prev = scores[weeks[weeks.length - 2]];
      const delta = prev ? s.total - prev.total : null;
      const cheer = s.total >= 90 ? 'Outstanding week! 🏆' : s.total >= 80 ? 'Solid week 💪' : s.total >= 70 ? 'Decent week, with room to grow.' : 'Tough week. This one\'s a fresh start.';
      $('bgScoreLast').innerHTML = '<div class="card bg-card"><div class="bg-last"><div class="bg-last-grade">' + esc(s.grade) + '</div><div>'
        + '<div class="bg-last-title">' + (last === lastWeekStart ? 'Last week' : 'Week of ' + esc(shortDate(last))) + ': ' + s.total + ' pts' + (delta != null ? ' <span class="bg-muted" style="font-weight:500">(' + (delta >= 0 ? '↑' : '↓') + Math.abs(delta) + ' vs week before)</span>' : '') + '</div>'
        + '<div class="bg-last-sub">' + esc(cheer) + ' Savings ' + s.savings + ' · Spending ' + s.spending + ' · Goals ' + s.goals + ' · earned ' + esc(money(s.earned)) + ', saved ' + esc(money(s.saved)) + ', spent ' + esc(money(s.spent)) + ' flexible</div></div></div></div>';
    } else $('bgScoreLast').innerHTML = '';

    // Season: XP, level, streak, 12-week history, badges.
    const xp = weeks.reduce((s, w) => s + scores[w].total, 0);
    const level = Math.floor(xp / 500) + 1;
    let streak = 0;
    for (let i = weeks.length - 1; i >= 0 && scores[weeks[i]].total >= 70; i--) streak++;
    $('bgLevel').textContent = 'Level ' + level + ' · ' + xp + ' XP' + (streak ? ' · 🔥 ' + streak + '-week streak' : '');
    const cols = [];
    for (let i = 11; i >= 0; i--) cols.push(addDays(weekStartOf(todayISO()), -7 * i));
    const hist = $('bgScoreHistory');
    hist.innerHTML = '<div class="bg-eyebrow">Level ' + (level + 1) + ' in ' + (500 - xp % 500) + ' XP</div>'
      + '<div class="bg-bar bg-level-bar"><div class="bg-bar-fill" style="width:' + (xp % 500) / 5 + '%;background:#7DD3FC"></div></div>'
      + '<div class="bg-eyebrow" style="margin-bottom:8px">Last 12 weeks</div>'
      + '<div class="bg-history">' + cols.map(w => {
        const isNow = w === now.start;
        const s = isNow ? now : scores[w];
        if (!s) return '<div class="bg-hbar-wrap" data-w="' + w + '"></div>';
        return '<div class="bg-hbar-wrap" data-w="' + w + '"><div class="bg-hbar-val">' + s.total + '</div><div class="bg-hbar' + (isNow ? ' current' : '') + '" style="height:' + Math.max(2, s.total * 0.85) + '%"></div></div>';
      }).join('') + '</div>'
      + '<div class="bg-history-axis">' + cols.map((w, i) => '<span>' + (i % 3 === 0 || i === 11 ? esc(shortDate(w).replace(' ', ' ')) : '') + '</span>').join('') + '</div>';
    hist.querySelectorAll('.bg-hbar-wrap').forEach(el => {
      const w = el.dataset.w, isNow = w === now.start, s = isNow ? now : scores[w];
      el.addEventListener('mousemove', e => showTip(e, '<b>' + esc(shortDate(w)) + ' – ' + esc(shortDate(addDays(w, 6))) + (isNow ? ' (so far)' : '') + '</b><br>'
        + (s ? 'Score ' + s.total + ' · ' + esc(s.grade) + '<br>Savings ' + s.savings + ' · Spending ' + s.spending + ' · Goals ' + s.goals : 'No activity')));
      el.addEventListener('mouseleave', hideTip);
    });

    const all = weeks.map(w => scores[w]);
    const receiptTx = new Set(getTx().filter(t => t.receiptId).map(t => t.receiptId)).size;
    const badges = [
      ['🏆', 'A-grade week', 'Score 90+ in a week', all.some(s => s.total >= 90)],
      ['🛡️', 'Budget keeper', 'Spending score 95+', all.some(s => s.spending >= 95)],
      ['💰', 'Full saver', 'Hit your savings plan', all.some(s => s.savings >= 100)],
      ['🎯', 'On target', 'Every goal on pace', all.some(s => s.goals >= 100)],
      ['🔥', 'Hot streak', '3 weeks in a row at 70+', streak >= 3],
      ['🧾', 'Receipt pro', 'Scan 10 receipts', receiptTx >= 10],
      ['🥇', 'Goal reached', 'Fully fund a goal', getGoals().some(goalDone)],
      ['⭐', 'Level 5', 'Earn 2,000 XP', level >= 5]
    ];
    $('bgBadges').innerHTML = '<div class="bg-eyebrow">Badges</div><div class="bg-badges">' + badges.map(([icon, name, how, got]) =>
      '<div class="bg-badge' + (got ? '' : ' locked') + '" title="' + esc(how) + '"><span class="bg-badge-icon">' + icon + '</span><div><b>' + esc(name) + '</b>' + esc(got ? 'Earned' : how) + '</div></div>').join('') + '</div>';
  }

  // ============================================================
  // WIRING
  // ============================================================
  function renderAll() {
    if (!$('bgCatTable')) return;
    const cats = getCats();
    const spent = spentBy(txInMonth(state.month));
    renderHero(cats, spent);
    renderCategories(cats, spent);
    renderForms();
    renderTransactions();
    renderMethods();
    renderPayday();
    renderScore();
  }

  function shiftMonth(n) {
    const d = parseISO(state.month + '-01');
    d.setMonth(d.getMonth() + n);
    state.month = monthOf(isoOf(d));
    renderAll();
    window.dispatchEvent(new Event('budget:month'));
  }

  function addExpense() {
    const hint = $('bgTxHint');
    const amount = parseFloat($('bgTxAmount').value);
    const merchant = $('bgTxMerchant').value.trim();
    const fail = m => { hint.textContent = m; hint.classList.add('error'); };
    hint.classList.remove('error');
    if (!merchant) return fail('Add where or what it was.');
    if (!(amount > 0)) return fail('Enter an amount.');
    const methodId = $('bgTxMethod').value;
    storeSet(K.prefs, { ...getPrefs(), lastMethod: methodId });
    const r = recordTransactions({ date: $('bgTxDate').value, merchant, methodId, lines: [{ categoryId: $('bgTxCategory').value, amount, items: [] }] });
    if (r.error) return fail(r.error);
    $('bgTxMerchant').value = ''; $('bgTxAmount').value = ''; hint.textContent = '';
    $('bgTxMerchant').focus();
  }

  function addCategory() {
    const name = $('bgCatName').value.trim();
    if (!name) { $('bgCatName').focus(); return; }
    save(K.cats, getCats().concat({ id: uid('c_'), icon: $('bgCatIcon').value.trim(), name, budget: num($('bgCatBudget').value), fixed: $('bgCatFixed').checked }));
    ['bgCatIcon', 'bgCatName', 'bgCatBudget'].forEach(id => { $(id).value = ''; });
    $('bgCatFixed').checked = false;
  }

  function addMethod() {
    const name = $('bgMethodName').value.trim();
    if (!name) { $('bgMethodName').focus(); return; }
    save(K.methods, getMethods().concat({ id: uid('m_'), name, type: $('bgMethodType').value, account: $('bgMethodAccount').value }));
    $('bgMethodName').value = '';
  }

  function addGoal() {
    const name = $('bgGoalName').value.trim();
    if (!name) { $('bgGoalName').focus(); return; }
    const deadline = $('bgGoalDeadline').value;
    save(K.goals, getGoals().concat({
      id: uid('g_'), icon: $('bgGoalIcon').value.trim(), name,
      target: num($('bgGoalTarget').value), saved: 0,
      percent: clamp(parseFloat($('bgGoalPercent').value) || 0, 0, 100),
      deadline: validISO(deadline) ? deadline : '', account: $('bgGoalAccount').value
    }));
    autoPlan();
    renderAll();
    ['bgGoalIcon', 'bgGoalName', 'bgGoalTarget', 'bgGoalPercent', 'bgGoalDeadline', 'bgGoalAccount'].forEach(id => { $(id).value = ''; });
    $('bgGoalPercent').disabled = false;
  }

  function wire() {
    $('bgPrevMonth').addEventListener('click', () => shiftMonth(-1));
    $('bgNextMonth').addEventListener('click', () => shiftMonth(1));
    $('bgTxAdd').addEventListener('click', addExpense);
    ['bgTxMerchant', 'bgTxAmount'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') addExpense(); }));
    $('bgTxMerchant').addEventListener('change', () => {
      if (!$('bgTxCategory').dataset.touched) $('bgTxCategory').value = guessCategory($('bgTxMerchant').value) || $('bgTxCategory').value;
    });
    $('bgTxCategory').addEventListener('change', () => { $('bgTxCategory').dataset.touched = '1'; });
    $('bgCatAdd').addEventListener('click', addCategory);
    ['bgCatName', 'bgCatBudget'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); }));
    $('bgMethodAdd').addEventListener('click', addMethod);
    $('bgGoalAdd').addEventListener('click', addGoal);
    // With a complete-by date the coach sets the %, so the field is just informational.
    $('bgGoalDeadline').addEventListener('change', () => { $('bgGoalPercent').disabled = !!$('bgGoalDeadline').value; });
    $('bgFilterCat').addEventListener('change', e => { state.filterCat = e.target.value; renderTransactions(); });
    $('bgFilterMethod').addEventListener('change', e => { state.filterMethod = e.target.value; renderTransactions(); });
    $('bgPayAmount').addEventListener('input', renderPaySplit);
    $('bgPayDate').addEventListener('change', renderPaySplit);
    $('bgPayAmount').addEventListener('keydown', e => { if (e.key === 'Enter' && $('bgPaySave')) logPay(true); });
    // Net worth or a cloud sync changed underneath us.
    window.addEventListener('finance:changed', () => { if (!document.activeElement || !document.activeElement.closest('.bg-inline, .bg-split')) renderAll(); });
    window.addEventListener('storage', renderAll);
    // Roll over to the new day/week when the app is reopened.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
  }

  seed();
  window.__budget = {
    data: () => ({ cats: getCats(), tx: getTx(), income: getIncome(), goals: getGoals(), methods: getMethods() }),
    month: () => state.month,
    toast,
    plan: () => storeGet(K.plan),
    autoPlan,
    scores: () => storeGet(K.scores) || {},
    setCategoryBudget: (id, amount) => save(K.cats, getCats().map(c => (c.id === id ? { ...c, budget: round2(amount) } : c))),
    categories: getCats,
    methods: getMethods,
    methodLabel,
    matchMethod,
    guessCategory,
    recordReceipt: ({ merchant, date, methodId, lines }) => recordTransactions({ merchant, date, methodId, lines, receipt: true })
  };
  wire();
  autoPlan();
  renderAll();
})();
