// ============================================================
// BUDGET COACH — lives in the ✨ bubble in the tab bar and pops up
// every time the app opens with:
//   • Today: three short tips, written by the AI once a day (cached in
//     budget:coachDaily, synced) with a number-based fallback offline
//   • Savings autopilot: the % of each payday going to each goal so it
//     finishes by its "complete by" date (computed in budget.js)
//   • Spending analysis: patterns, budget edits you can apply, ways to
//     save (budget:insights; re-runs itself about once a week)
//   • Chat: ask anything; it can propose fixes to your numbers, which
//     you apply (or undo) yourself
// ============================================================
(function () {
  const F = window.__finance, B = window.__budget;
  const bubble = document.getElementById('coachBubble');
  const panel = document.getElementById('coachPanel');
  if (!F || !B || !bubble || !panel) return;

  const DAILY_KEY = 'budget:coachDaily';
  const INSIGHTS_KEY = 'budget:insights';
  const $ = id => document.getElementById(id);
  const esc = s => F.escapeHtml(String(s == null ? '' : s));
  const money = v => F.fmtMoney(v);
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const todayISO = () => isoOf(new Date());
  const monthOf = iso => String(iso).slice(0, 7);
  const daysIn = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const shortDate = iso => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sum = (list, f) => list.reduce((s, x) => s + (f ? f(x) : x), 0);
  const allocated = e => sum(e.allocations || [], a => a.amount);

  const state = { dailyBusy: false, analysisBusy: false, analysisError: '' };
  const aiHeaders = async () => ({ 'Content-Type': 'application/json', ...(await window.__financeAuth.headers()) });

  // ---------- month-to-date numbers shared by the tips ----------
  function monthStatus(d) {
    const today = todayISO(), m = monthOf(today);
    const dayN = parseISO(today).getDate(), days = daysIn(m);
    const spent = sum(d.tx.filter(t => monthOf(t.date) === m), t => t.amount);
    const budget = sum(d.cats, c => Number(c.budget) || 0);
    const pace = budget * dayN / days;
    const perDayLeft = Math.max(0, budget - spent) / Math.max(1, days - dayN + 1);
    const byCat = {};
    d.tx.filter(t => monthOf(t.date) === m).forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
    const flex = d.cats.filter(c => !c.fixed && Number(c.budget) > 0).map(c => ({ c, spent: byCat[c.id] || 0, pace: c.budget * dayN / days, pct: (byCat[c.id] || 0) / c.budget }));
    return { today, m, dayN, days, spent, budget, pace, perDayLeft, flex };
  }

  // Everything the AI sees (dollars, no ids beyond what it must return).
  function buildSummary() {
    const d = B.data(), ms = monthStatus(d);
    const today = ms.today, since90 = addDays(today, -90), since30 = addDays(today, -30);
    const months = [1, 2, 3].map(i => { const x = parseISO(today); x.setDate(1); x.setMonth(x.getMonth() - i); return monthOf(isoOf(x)); }).reverse();
    const recent = d.tx.filter(t => t.date >= since90);
    const weekendShare = list => { const tot = sum(list, t => t.amount); return tot ? round2(sum(list.filter(t => [0, 6].includes(parseISO(t.date).getDay())), t => t.amount) / tot) : 0; };
    const inc30 = d.income.filter(e => e.date >= since30);
    const plan = B.plan() || {};
    return {
      currency: 'USD',
      today,
      weekday: parseISO(today).toLocaleDateString('en-US', { weekday: 'long' }),
      day_of_month: ms.dayN,
      days_in_month: ms.days,
      month_to_date: { spent: round2(ms.spent), total_budget: round2(ms.budget), even_pace_by_today: round2(ms.pace), per_day_left_to_stay_on_budget: round2(ms.perDayLeft) },
      categories: d.cats.map(c => {
        const mine = recent.filter(t => t.categoryId === c.id);
        const merchants = {};
        mine.forEach(t => { const k = t.merchant || '?'; merchants[k] = merchants[k] || { merchant: k, total: 0, count: 0 }; merchants[k].total += t.amount; merchants[k].count++; });
        return {
          id: c.id, name: c.name, fixed: !!c.fixed,
          monthly_budget: round2(c.budget),
          spent_this_month: round2(sum(d.tx.filter(t => t.categoryId === c.id && monthOf(t.date) === ms.m), t => t.amount)),
          spent_previous_months: Object.fromEntries(months.map(m => [m, round2(sum(d.tx.filter(t => t.categoryId === c.id && monthOf(t.date) === m), t => t.amount))])),
          transactions_last_90_days: mine.length,
          weekend_share_of_spend: weekendShare(mine),
          top_merchants_90_days: Object.values(merchants).sort((a, b) => b.total - a.total).slice(0, 4).map(x => ({ merchant: x.merchant, total: round2(x.total), count: x.count }))
        };
      }),
      spent_yesterday: round2(sum(d.tx.filter(t => t.date === addDays(today, -1)), t => t.amount)),
      paid_from_accounts: d.accounts.map(a => {
        const mine = recent.filter(t => d.txAccount(t) === a.ref);
        return { account: a.name, kind: a.cat, balance: round2(a.balance), spent_90_days: round2(sum(mine, t => t.amount)), transactions: mine.length };
      }),
      income: {
        last_30_days_total: round2(sum(inc30, e => e.amount)),
        days_paid_last_30: new Set(inc30.map(e => e.date)).size,
        set_aside_last_30_days: round2(sum(inc30, allocated)),
        paid_today: d.income.some(e => e.date === today),
        recent_days: d.income.slice(-14).map(e => ({ date: e.date, amount: round2(e.amount), source: e.source || '' }))
      },
      goals: d.goals.map(g => ({ name: g.name, target: round2(g.target), saved: round2(g.saved), complete_by: g.deadline || null, percent_of_pay: Number(g.percent) || 0, percent_set_automatically: !!g.autoPercent })),
      savings_plan: { status: plan.status || 'none', average_pay_per_payday: plan.avgPay || null, total_percent_of_pay_saved: plan.totalPct || null, goals: (plan.goals || []).map(x => ({ name: x.name, percent_of_pay: x.pct, per_payday: x.perPayday, complete_by: x.deadline, on_track: x.onTrack, projected_finish: x.finish })), notes: plan.notes || [] },
      recent_weekly_scores: Object.entries(B.scores()).sort().slice(-6).map(([week, s]) => ({ week, total: s.total, savings: s.savings, spending: s.spending, goals: s.goals }))
    };
  }

  // ---------- today's three tips ----------
  // Worked out from the numbers — shown instantly, and whenever the AI can't be reached.
  function localBullets() {
    const d = B.data(), ms = monthStatus(d), plan = B.plan() || {};
    const out = [];
    const monthName = parseISO(ms.today).toLocaleDateString('en-US', { month: 'long' });
    if (ms.budget > 0) {
      out.push(ms.spent <= ms.pace
        ? 'You\'ve spent ' + money(ms.spent) + ' of ' + money(ms.budget) + ' this month, ' + money(ms.pace - ms.spent) + ' under pace. Keep it to ' + money(ms.perDayLeft) + ' a day.'
        : 'You\'re ' + money(ms.spent - ms.pace) + ' over budget pace; aim for under ' + money(ms.perDayLeft) + ' a day for the rest of ' + monthName + '.');
    } else out.push('Give your categories monthly budgets on the Budget tab so I can track your pace.');
    const g = (plan.goals || []).slice().sort((a, b) => (a.deadline < b.deadline ? -1 : 1))[0];
    if (plan.status === 'ok' && g) out.push('Set aside ' + g.pct + '% of each payday (about ' + money(g.perPayday) + ') for ' + g.name + (g.onTrack ? ' to finish by ' + shortDate(g.deadline) + '.' : '; at this pace it finishes ' + (g.finish ? shortDate(g.finish) : 'later') + ', after your date.'));
    else if (plan.status === 'need-pay') out.push('Log at least 3 paydays so I can work out how much to set aside for your goals.');
    else if (plan.status === 'no-dates') out.push('Add a "complete by" date to a savings goal and I\'ll set how much of each payday to save.');
    else out.push('Create a savings goal with a "complete by" date on the Payday tab to start saving automatically.');
    const hot = ms.flex.filter(x => x.spent > x.pace * 1.1 && x.spent > 5).sort((a, b) => b.spent / b.pace - a.spent / a.pace)[0];
    if (hot) out.push(hot.c.name + ' is at ' + Math.round(hot.pct * 100) + '% of its monthly budget already; skip one ' + hot.c.name.toLowerCase() + ' purchase today.');
    else if (!d.income.some(e => e.date === ms.today)) out.push('Log today\'s pay on the Payday tab so your savings plan stays accurate.');
    else out.push('Snap your next receipt so every item lands in the right category.');
    return out;
  }

  const readDaily = () => F.storeGet(DAILY_KEY) || {};
  async function loadDaily() {
    const today = todayISO(), cached = readDaily();
    if (cached.date === today && cached.source === 'ai') return;
    if (state.dailyBusy) return;
    // Don't hammer the API when it's down: one AI retry per hour per day.
    // A sign-in problem is retried as soon as you're signed in (see the auth listener below).
    if (cached.date === today && cached.source === 'local' && !cached.auth && Date.now() - (cached.attemptAt || 0) < 3600000) return;
    if (cached.date === today && cached.auth && !(window.__financeAuth && window.__financeAuth.session)) return;
    state.dailyBusy = true;
    renderToday();
    let next;
    try {
      const r = await fetch('/api/insights', { method: 'POST', headers: await aiHeaders(), body: JSON.stringify({ mode: 'daily', summary: buildSummary() }) });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) { const e = new Error(data.error || 'Sign in to get AI tips.'); e.auth = true; throw e; }
      if (!r.ok || !Array.isArray(data.bullets) || data.bullets.length < 3) throw new Error(data.error || 'no tips');
      next = { date: today, bullets: data.bullets.slice(0, 3), source: 'ai', at: Date.now() };
      markUnread();
    } catch (e) {
      next = { date: today, bullets: localBullets(), source: 'local', attemptAt: Date.now(), error: e.message, auth: !!e.auth };
    }
    F.storeSet(DAILY_KEY, next);
    state.dailyBusy = false;
    renderToday();
  }

  function renderToday() {
    const today = todayISO(), cached = readDaily();
    const fresh = cached.date === today && Array.isArray(cached.bullets);
    const bullets = fresh && cached.source === 'ai' ? cached.bullets : localBullets();
    $('coachDate').textContent = parseISO(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    $('coachToday').innerHTML = bullets.map(b => '<li>' + esc(b) + '</li>').join('');
    $('coachTodaySrc').innerHTML = state.dailyBusy ? '<span class="bg-spinner"></span>Writing today\'s tips…'
      : fresh && cached.source === 'ai' ? 'Written for you this morning'
        : fresh && cached.auth ? 'From your numbers · sign in (top right) for AI tips'
          : 'From your numbers · AI tips unavailable right now';
  }

  // ---------- savings autopilot ----------
  function renderPlan() {
    const plan = B.plan() || {};
    const box = $('coachPlan');
    if (plan.status === 'no-goals') { box.innerHTML = '<div class="coach-note">Add a savings goal with a <b>complete by</b> date on the Payday tab and I\'ll work out how much of each payday to set aside.</div>'; return; }
    if (plan.status === 'no-dates') { box.innerHTML = '<div class="coach-note">Give your goals a <b>complete by</b> date (edit a goal on the Payday tab) and I\'ll set their share of your pay automatically.</div>'; return; }
    if (plan.status === 'need-pay') { box.innerHTML = '<div class="coach-note">Log at least 3 paydays and I\'ll work out how much to set aside so each goal finishes on time.</div>'; return; }
    if (!plan.goals || !plan.goals.length) { box.innerHTML = '<div class="coach-note">Your savings plan will show here.</div>'; return; }
    const recentChange = plan.changedAt && Date.now() - plan.changedAt < 3 * 86400000 ? plan.changes : [];
    box.innerHTML = '<div class="coach-plan-sum">Saving <b>' + esc(plan.totalPct) + '%</b> of each payday · you average <b>' + esc(money(plan.avgPay)) + '</b> per payday</div>'
      + plan.goals.map(g => {
        const ch = recentChange.find(c => c.goalId === g.goalId);
        return '<div class="coach-goal"><div class="coach-goal-top"><span>' + esc((g.icon ? g.icon + ' ' : '') + g.name) + '</span><b>' + esc(g.pct) + '%</b></div>'
          + '<div class="coach-goal-sub">' + esc(money(g.perPayday)) + ' per payday · complete by ' + esc(shortDate(g.deadline))
          + ' · <span class="bg-status ' + (g.onTrack ? 'ok' : 'warn') + '">' + (g.onTrack ? 'On track' : 'Finishes ' + (g.finish ? shortDate(g.finish) : 'late')) + '</span></div>'
          + (ch ? '<div class="coach-goal-change">Updated ' + esc(ch.from) + '% → ' + esc(ch.to) + '% based on your recent pay</div>' : '') + '</div>';
      }).join('')
      + (plan.notes || []).map(n => '<div class="coach-note warn">' + esc(n) + '</div>').join('');
  }

  // ---------- spending analysis (weekly, or on demand) ----------
  async function runAnalysis(auto) {
    if (state.analysisBusy) return;
    state.analysisBusy = true; state.analysisError = '';
    const prev = F.storeGet(INSIGHTS_KEY) || {};
    F.storeSet(INSIGHTS_KEY, { ...prev, attemptAt: Date.now() });
    renderAnalysis();
    try {
      const r = await fetch('/api/insights', { method: 'POST', headers: await aiHeaders(), body: JSON.stringify({ summary: buildSummary() }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data && data.error) || 'The coach could not analyze your budget.');
      const ins = data.insights || {};
      (ins.budget_changes || []).forEach(c => { c.suggested_budget = round2(c.suggested_budget); });
      F.storeSet(INSIGHTS_KEY, { at: Date.now(), attemptAt: Date.now(), insights: ins, done: {} });
      if (auto) markUnread();
    } catch (e) {
      state.analysisError = auto ? '' : (e.message || 'The coach is unavailable right now.');
    }
    state.analysisBusy = false;
    renderAnalysis();
  }
  function maybeAutoAnalysis() {
    const saved = F.storeGet(INSIGHTS_KEY) || {};
    if (saved.attemptAt && Date.now() - saved.attemptAt < 7 * 86400000) return;
    const since = addDays(todayISO(), -30);
    if (B.data().tx.filter(t => t.date >= since).length < 10) return;
    runAnalysis(true);
  }
  function markDone(key, how) {
    const saved = F.storeGet(INSIGHTS_KEY) || {};
    saved.done = { ...(saved.done || {}), [key]: how };
    F.storeSet(INSIGHTS_KEY, saved);
  }
  function renderAnalysis() {
    const body = $('coachAnalysis'), btn = $('coachAnalyze');
    btn.disabled = state.analysisBusy;
    btn.innerHTML = state.analysisBusy ? '<span class="bg-spinner"></span>Analyzing…' : 'Analyze my spending';
    const saved = F.storeGet(INSIGHTS_KEY) || {};
    const ins = saved.insights, done = saved.done || {};
    let html = state.analysisError ? '<div class="bg-form-hint error">' + esc(state.analysisError) + '</div>' : '';
    if (!ins) {
      body.innerHTML = html + '<div class="coach-note">I study your categories, receipts, cards and pay for patterns, then suggest budget changes and ways to save. Once you\'ve logged a couple of weeks of spending I check in on my own every week.</div>';
      return;
    }
    const cats = B.data().cats;
    html += '<div class="bg-coach-headline">' + esc(ins.headline || '') + '</div>';
    if ((ins.patterns || []).length) html += '<ul class="bg-coach-list">' + ins.patterns.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>';
    const changes = (ins.budget_changes || []).filter(c => cats.some(x => x.id === c.category_id));
    if (changes.length) {
      html += '<div class="bg-coach-sub">Suggested budget changes</div>' + changes.map((c, i) => {
        const cat = cats.find(x => x.id === c.category_id);
        const key = 'b' + i + ':' + c.category_id, st = done[key];
        return '<div class="bg-suggest' + (st ? ' done' : '') + '"><div><div class="bg-suggest-title">' + esc((cat.icon ? cat.icon + ' ' : '') + cat.name) + ' <span class="bg-num">' + esc(money(cat.budget)) + ' → ' + esc(money(c.suggested_budget)) + '</span></div>'
          + '<div class="bg-suggest-reason">' + esc(c.reason) + '</div></div>'
          + '<div class="bg-suggest-actions">' + (st ? '<span class="bg-status ' + (st === 'applied' ? 'ok' : 'idle') + '">' + (st === 'applied' ? 'Applied' : 'Dismissed') + '</span>'
            : '<button type="button" class="bg-btn bg-btn-primary bg-btn-sm" data-apply="' + i + '">Apply</button><button type="button" class="bg-btn bg-btn-sm" data-dismiss="' + esc(key) + '">Dismiss</button>') + '</div></div>';
      }).join('');
    }
    if ((ins.savings_tips || []).length) {
      html += '<div class="bg-coach-sub">Ways to save</div>' + ins.savings_tips.map(t =>
        '<div class="bg-suggest"><div><div class="bg-suggest-title">' + esc(t.title) + (t.estimated_monthly_savings > 0 ? ' <span class="bg-num">≈ ' + esc(money(Math.round(t.estimated_monthly_savings))) + '/mo</span>' : '') + '</div>'
        + '<div class="bg-suggest-reason">' + esc(t.detail) + '</div></div><div></div></div>').join('');
    }
    html += '<div class="bg-coach-foot">Analyzed ' + esc(new Date(saved.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.apply), c = changes[i];
      markDone('b' + i + ':' + c.category_id, 'applied');
      B.setCategoryBudget(c.category_id, c.suggested_budget);
      renderAnalysis();
    }));
    body.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', () => { markDone(b.dataset.dismiss, 'dismissed'); renderAnalysis(); }));
  }

  // ---------- chat: ask the coach anything, and let it fix mistakes ----------
  // The conversation stays on this device. Each question goes to /api/chat
  // with a snapshot of your data; proposed fixes come back as cards you can
  // Apply (and Undo) — nothing changes until you press Apply.
  const CHAT_KEY = 'coach:chat';
  const undos = {}; // edit key -> undo(), for this session only
  let chatBusy = false;
  const readChat = () => { try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } catch (_) { return []; } };
  const writeChat = msgs => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40))); } catch (_) {} };

  function chatContext() {
    const d = B.data();
    const cat = id => d.cats.find(c => c.id === id);
    return {
      today: todayISO(),
      summary: buildSummary(),
      transactions: d.tx.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 200).map(t => ({
        id: t.id, date: t.date, merchant: t.merchant, items: (t.items || []).slice(0, 4), amount: round2(t.amount),
        category_id: t.categoryId, category: cat(t.categoryId) ? cat(t.categoryId).name : 'Uncategorized', paid_from: d.txPaidWith(t)
      })),
      categories: d.cats.map(c => ({ id: c.id, name: c.name, monthly_budget: round2(c.budget), fixed: !!c.fixed })),
      goals: d.goals.map(g => ({ id: g.id, name: g.name, target: round2(g.target), saved: round2(g.saved), complete_by: g.deadline || null, percent_of_pay: Number(g.percent) || 0, percent_is_automatic: !!g.autoPercent })),
      income: d.income.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map(e => ({ id: e.id, date: e.date, amount: round2(e.amount), source: e.source || '', set_aside: round2(allocated(e)) })),
      accounts: d.accounts.map(a => ({ ref: a.ref, name: a.name, kind: a.cat, balance: round2(a.balance) }))
    };
  }
  // What the model sees of its own earlier turns (text, plus what it proposed and what you did).
  function historyFor(msgs) {
    return msgs.map(m => {
      if (m.role === 'user') return { role: 'user', content: m.text };
      const notes = (m.edits || []).map(e => '[' + (e.status || 'proposed') + ': ' + e.action + ' ' + e.id + ' ' + e.field + ']');
      return { role: 'assistant', content: m.text + (notes.length ? '\n' + notes.join('\n') : '') };
    });
  }

  function renderChat() {
    const box = $('coachChat');
    const msgs = readChat();
    box.replaceChildren();
    if (!msgs.length) {
      const chips = document.createElement('div');
      chips.className = 'coach-chips';
      ['How am I doing this month?', 'Where can I cut back?', 'Fix a mistake…'].forEach(q => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'coach-chip'; b.textContent = q;
        b.addEventListener('click', () => {
          const input = $('coachAskInput');
          if (q.endsWith('…')) { input.value = 'I made a mistake: '; input.focus(); }
          else { input.value = q; $('coachAsk').requestSubmit(); }
        });
        chips.appendChild(b);
      });
      const hint = document.createElement('div');
      hint.className = 'coach-note';
      hint.textContent = 'Ask about your spending, budgets, pay or goals. If something\'s wrong ("Walmart was $32.50, not $23.50"), I\'ll suggest the fix for you to apply.';
      box.append(hint, chips);
    }
    msgs.forEach((m, mi) => {
      const bubbleEl = document.createElement('div');
      bubbleEl.className = 'coach-msg coach-msg-' + m.role;
      const text = document.createElement('div');
      text.className = 'coach-msg-text';
      text.textContent = m.text;
      bubbleEl.appendChild(text);
      (m.edits || []).forEach((e, ei) => bubbleEl.appendChild(editCard(m, mi, e, ei)));
      box.appendChild(bubbleEl);
    });
    if (chatBusy) {
      const t = document.createElement('div');
      t.className = 'coach-msg coach-msg-assistant coach-typing';
      t.innerHTML = '<span class="bg-spinner"></span>Thinking…';
      box.appendChild(t);
    }
  }

  function editCard(m, mi, e, ei) {
    const key = mi + ':' + ei;
    const card = document.createElement('div');
    card.className = 'coach-edit';
    const d = e.status === 'applied' || e.status === 'undone' ? (e.summary || {}) : B.describeEdit(e);
    const title = document.createElement('div');
    title.className = 'coach-edit-title';
    title.textContent = d.title || 'Proposed change';
    card.appendChild(title);
    if (d.before != null || d.after) {
      const diff = document.createElement('div');
      diff.className = 'coach-edit-diff';
      if (d.before != null) { const b = document.createElement('s'); b.textContent = d.before; diff.append(b, ' → '); }
      const a = document.createElement('b'); a.textContent = d.after || ''; diff.appendChild(a);
      card.appendChild(diff);
    }
    if (e.reason) { const r = document.createElement('div'); r.className = 'coach-edit-reason'; r.textContent = e.reason; card.appendChild(r); }
    const row = document.createElement('div');
    row.className = 'coach-edit-actions';
    const setStatus = (status, extra) => {
      const msgs = readChat();
      Object.assign(msgs[mi].edits[ei], { status }, extra || {});
      writeChat(msgs);
      renderChat();
    };
    if (e.status === 'applied') {
      row.innerHTML = '<span class="bg-status ok">Applied</span>';
      if (undos[key]) {
        const u = document.createElement('button');
        u.type = 'button'; u.className = 'bg-btn bg-btn-sm'; u.textContent = 'Undo';
        u.addEventListener('click', () => { undos[key](); delete undos[key]; setStatus('undone'); });
        row.appendChild(u);
      }
    } else if (e.status === 'undone') row.innerHTML = '<span class="bg-status idle">Undone</span>';
    else if (e.status === 'skipped') row.innerHTML = '<span class="bg-status idle">Skipped</span>';
    else if (!d.ok) {
      const warn = document.createElement('span');
      warn.className = 'bg-status warn';
      warn.textContent = 'Can\'t apply: ' + d.error;
      row.appendChild(warn);
    } else {
      const apply = document.createElement('button');
      apply.type = 'button'; apply.className = 'bg-btn bg-btn-primary bg-btn-sm'; apply.textContent = 'Apply';
      apply.addEventListener('click', () => {
        const res = B.applyEdit(e);
        if (!res.ok) return setStatus('failed', { summary: { title: d.title, after: res.error } });
        undos[key] = res.undo;
        setStatus('applied', { summary: { title: d.title, before: d.before, after: d.after } });
      });
      const skip = document.createElement('button');
      skip.type = 'button'; skip.className = 'bg-btn bg-btn-sm'; skip.textContent = 'Skip';
      skip.addEventListener('click', () => setStatus('skipped'));
      row.append(apply, skip);
    }
    card.appendChild(row);
    return card;
  }

  async function sendChat(text) {
    if (chatBusy || !text.trim()) return;
    const msgs = readChat();
    msgs.push({ role: 'user', text: text.trim().slice(0, 1000) });
    writeChat(msgs);
    chatBusy = true;
    renderChat();
    scrollChat();
    let reply;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: await aiHeaders(), body: JSON.stringify({ messages: historyFor(msgs), context: chatContext() }) });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) reply = { role: 'assistant', text: data.error || 'Sign in (top right) to chat with your coach.', error: true };
      else if (!r.ok) reply = { role: 'assistant', text: data.error || 'I couldn\'t answer just now. Try again in a moment.', error: true };
      else reply = { role: 'assistant', text: data.reply || '…', edits: (data.edits || []).map(e => ({ ...e, status: 'proposed' })) };
    } catch (_) {
      reply = { role: 'assistant', text: 'I couldn\'t reach the server. Check your connection and try again.', error: true };
    }
    const all = readChat();
    all.push(reply);
    writeChat(all);
    chatBusy = false;
    renderChat();
    scrollChat();
  }
  function scrollChat() { const body = panel.querySelector('.coach-body'); body.scrollTop = body.scrollHeight; }

  $('coachAsk').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('coachAskInput');
    const text = input.value;
    input.value = '';
    sendChat(text);
  });
  $('coachChatClear').addEventListener('click', () => { writeChat([]); renderChat(); });

  // ---------- the bubble & panel ----------
  const dot = bubble.querySelector('.coach-dot');
  function markUnread() { if (panel.hidden && dot) dot.hidden = false; }
  function setOpen(open, focus) {
    panel.hidden = !open;
    bubble.setAttribute('aria-expanded', String(open));
    bubble.classList.toggle('open', open);
    if (open) {
      if (dot) dot.hidden = true;
      renderAll();
      loadDaily();
      if (focus) $('coachClose').focus();
    } else if (focus) bubble.focus();
  }
  function renderAll() { renderToday(); renderPlan(); renderAnalysis(); renderChat(); }

  bubble.addEventListener('click', () => setOpen(panel.hidden, true));
  $('coachClose').addEventListener('click', () => setOpen(false, true));
  $('coachAnalyze').addEventListener('click', () => runAnalysis(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) setOpen(false, true); });
  document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target) && !bubble.contains(e.target)) setOpen(false); });
  ['budget:changed', 'budget:plan', 'storage'].forEach(ev => window.addEventListener(ev, () => { if (!panel.hidden) { renderPlan(); renderAnalysis(); if (!state.dailyBusy) renderToday(); } }));

  // Once you sign in, fetch today's AI tips if they were waiting on it.
  window.addEventListener('finance:auth', e => { if (e.detail && readDaily().auth && readDaily().date === todayISO()) loadDaily(); });

  // Pop up from the bubble every time the app opens.
  setTimeout(() => setOpen(true, false), 500);
  maybeAutoAnalysis();
})();
