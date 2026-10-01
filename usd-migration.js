// ============================================================
// ONE-TIME SWITCH TO US DOLLARS
// Amounts used to be stored in CHF and converted for display. The app is
// dollars-only now, so stored amounts are converted once at the CHF→USD
// rate. A marker key (synced like the rest of the data) records that a
// state is already in dollars; sync.js runs remote data that lacks it
// through the same conversion before applying it, so devices can't
// double-convert or mix bases.
// ============================================================
(function () {
  const MARKER = 'nw:currency_base';
  const FALLBACK_RATE = 1.25; // used only if the live rate can't be fetched

  const NW_KEYS = ['nw:bank', 'nw:stocks', 'nw:crypto', 'nw:other'];
  const LEGACY_KEYS = ['subs', 'bills', 'wishlist', 'incoming_orders'];

  const scale = (v, r) => Math.round((Number(v) || 0) * r * 100) / 100;
  // Budget records kept the amount as typed; use it exactly when it was dollars.
  const typedUSD = rec => (rec && rec.currency === 'USD' && Number(rec.entered) > 0 ? Number(rec.entered) : null);

  // Converts every stored amount in a {key: value} state object. Returns a new object.
  function convertState(state, r) {
    const out = { ...state };
    const mapList = (key, fn) => { if (Array.isArray(out[key])) out[key] = out[key].map(x => (x && typeof x === 'object' ? fn({ ...x }) : x)); };

    NW_KEYS.forEach(k => mapList(k, it => { it.amount = scale(it.amount, r); return it; }));
    mapList('nw:activity', a => { a.delta = scale(a.delta, r); return a; });
    mapList('nw:history', h => { h.v = scale(h.v, r); return h; });
    LEGACY_KEYS.forEach(k => mapList(k, it => {
      ['amount', 'amountCHF', 'cost'].forEach(f => { if (it[f] != null) it[f] = scale(it[f], r); });
      return it;
    }));

    mapList('budget:categories', c => { c.budget = scale(c.budget, r); return c; });
    mapList('budget:transactions', t => {
      const typed = typedUSD(t);
      t.amount = typed != null ? typed : scale(t.amount, r);
      delete t.entered; delete t.currency;
      return t;
    });
    mapList('budget:goals', g => { g.target = scale(g.target, r); g.saved = scale(g.saved, r); return g; });
    mapList('budget:income', e => {
      const typed = typedUSD(e);
      const factor = typed != null && Number(e.amount) > 0 ? typed / Number(e.amount) : r;
      e.amount = typed != null ? typed : scale(e.amount, r);
      e.allocations = (e.allocations || []).map(a => ({ ...a, amount: scale(a.amount, factor) }));
      e.moves = (e.moves || []).map(m => ({ ...m, delta: scale(m.delta, factor) }));
      delete e.entered; delete e.currency;
      return e;
    });
    if (out['budget:scores'] && typeof out['budget:scores'] === 'object') {
      const scores = {};
      Object.entries(out['budget:scores']).forEach(([w, sc]) => {
        scores[w] = { ...sc, earned: scale(sc.earned, r), saved: scale(sc.saved, r), spent: scale(sc.spent, r) };
      });
      out['budget:scores'] = scores;
    }
    // Coach suggestions were priced in the old base; the next analysis refreshes them.
    delete out['budget:insights'];
    delete out.nw_currency;
    out[MARKER] = 'USD';
    return out;
  }

  let ratePromise = null;
  function chfToUsd() {
    if (!ratePromise) {
      ratePromise = Promise.race([
        fetch('https://open.er-api.com/v6/latest/CHF').then(r => r.json()).then(d => Number(d && d.rates && d.rates.USD) || null),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]).catch(() => null).then(rate => rate || FALLBACK_RATE);
    }
    return ratePromise;
  }

  const read = key => { try { const raw = localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); } catch (_) { return null; } };
  const moneyKeys = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('nw:') || k.startsWith('budget:') || LEGACY_KEYS.includes(k) || k === 'nw_currency')) keys.push(k);
    }
    return keys.filter(k => k !== MARKER);
  };

  let localRun = null;
  function migrateLocal() {
    if (read(MARKER) === 'USD') return Promise.resolve(false);
    const keys = moneyKeys();
    // Nothing stored yet: this browser starts out in dollars.
    if (!keys.length) { localStorage.setItem(MARKER, JSON.stringify('USD')); return Promise.resolve(false); }
    if (!localRun) {
      localRun = chfToUsd().then(rate => {
        if (read(MARKER) === 'USD') return false;
        const state = {};
        moneyKeys().forEach(k => { state[k] = read(k); });
        const converted = convertState(state, rate);
        Object.keys(state).forEach(k => { if (!(k in converted)) localStorage.removeItem(k); });
        Object.entries(converted).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        return true;
      }).finally(() => { localRun = null; });
    }
    return localRun;
  }

  window.__financeUSD = {
    // For sync.js: bring a remote state into dollars before it is applied locally.
    async toUSD(state) {
      if (!state || state[MARKER] === 'USD') return state;
      const hasMoney = Object.keys(state).some(k => k.startsWith('nw:') || k.startsWith('budget:') || LEGACY_KEYS.includes(k));
      if (!hasMoney) return { ...state, [MARKER]: 'USD' };
      return convertState(state, await chfToUsd());
    }
  };

  migrateLocal().then(changed => {
    if (!changed) return;
    // The page may have rendered with the old numbers; redraw everything.
    const refresh = () => {
      if (window.__finance) window.__finance.renderAllNetWorth();
      window.dispatchEvent(new Event('storage'));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
    else refresh();
  });
})();
