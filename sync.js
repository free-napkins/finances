// ============================================================
// SYNC — keeps finance data the same on every device.
// Each stored key is one row in public.finance_kv (per user, RLS +
// 2FA protected). Local changes push within ~2 s; other devices'
// changes arrive live over Realtime, and again on focus as a safety
// net. Conflicts resolve per key by the server's timestamp. The first
// time a device syncs a key it already has locally, list values are
// merged by id/name so nothing either device entered is lost.
// ============================================================
(function () {
  'use strict';

  var PREFIXES = ['nw:', 'budget:'];
  var KEYS = ['subs', 'bills', 'wishlist', 'incoming_orders'];
  var META_KEY = 'sync:meta';   // { key: server updated_at last seen }
  var OWNER_KEY = 'box:owner';  // whose data this browser holds
  var isSynced = function (k) { return !!k && (KEYS.indexOf(k) >= 0 || PREFIXES.some(function (p) { return k.indexOf(p) === 0; })); };

  var client = null, userId = null, meta = {}, lastSent = {}, pushing = false, started = false;

  function readMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (_) { return {}; } }
  function writeMeta() { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  function localKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (isSynced(k)) out.push(k); }
    return out;
  }
  function repaint() {
    if (window.__finance) window.__finance.renderAllNetWorth();
    window.dispatchEvent(new Event('storage'));
  }

  // First sync of a key this device already had: keep both devices' entries.
  function identity(x) { return x && typeof x === 'object' ? (x.id != null ? 'id:' + x.id : x.name != null ? 'name:' + x.name : null) : null; }
  function merge(localVal, remoteVal) {
    if (Array.isArray(localVal) && Array.isArray(remoteVal)) {
      var seen = {}, out = remoteVal.slice();
      remoteVal.forEach(function (r) { var id = identity(r); if (id) seen[id] = true; });
      localVal.forEach(function (l) { var id = identity(l); if (id && !seen[id]) out.push(l); });
      return out;
    }
    if (localVal && remoteVal && typeof localVal === 'object' && typeof remoteVal === 'object' && !Array.isArray(localVal) && !Array.isArray(remoteVal)) {
      return Object.assign({}, localVal, remoteVal);
    }
    return remoteVal;
  }

  function applyRow(row, firstSync) {
    if (!row || !isSynced(row.key)) return false;
    var known = meta[row.key];
    if (known && row.updated_at <= known) return false; // already have this version
    var localRaw = localStorage.getItem(row.key);
    var value = row.value;
    if (firstSync && !known && localRaw != null) {
      try { value = merge(JSON.parse(localRaw), row.value); } catch (_) { value = row.value; }
    }
    var raw = JSON.stringify(value);
    meta[row.key] = row.updated_at;
    // If the merge added local entries, leave lastSent stale so they push up.
    lastSent[row.key] = JSON.stringify(row.value);
    if (raw === localRaw) return false;
    localStorage.setItem(row.key, raw);
    return true;
  }

  async function pull(firstSync) {
    var res = await client.from('finance_kv').select('key, value, updated_at');
    if (res.error) { console.warn('sync pull failed', res.error.message); return; }
    var rows = res.data || [];
    // Rows saved before the dollars switch get converted on the way in.
    if (window.__financeUSD && rows.length) {
      var state = {};
      rows.forEach(function (r) { state[r.key] = r.value; });
      var usd = await window.__financeUSD.toUSD(state);
      if (usd !== state) rows.forEach(function (r) { if (r.key in usd) r.value = usd[r.key]; });
    }
    var changed = false;
    rows.forEach(function (r) { if (applyRow(r, firstSync)) changed = true; });
    writeMeta();
    if (changed) repaint();
  }

  async function push() {
    if (!client || pushing) return;
    var batch = [];
    localKeys().forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw === lastSent[k]) return;
      var value;
      try { value = JSON.parse(raw); } catch (_) { value = raw; }
      batch.push({ user_id: userId, key: k, value: value });
    });
    if (!batch.length) return;
    pushing = true;
    try {
      var res = await client.from('finance_kv').upsert(batch, { onConflict: 'user_id,key' }).select('key, value, updated_at');
      if (res.error) { console.warn('sync push failed', res.error.message); return; }
      (res.data || []).forEach(function (r) { lastSent[r.key] = JSON.stringify(r.value); meta[r.key] = r.updated_at; });
      writeMeta();
    } finally { pushing = false; }
  }

  async function start(session) {
    if (started && userId === session.user.id) return;
    started = true;
    client = window.__financeSupabase;
    userId = session.user.id;
    // Someone else's data on this browser? Don't mix accounts.
    var owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId && window.__financeAuth) window.__financeAuth.clearFinanceData();
    localStorage.setItem(OWNER_KEY, userId);
    meta = readMeta();
    var firstSync = !Object.keys(meta).length;
    await pull(firstSync);
    await push();

    client.channel('finance_kv:' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_kv', filter: 'user_id=eq.' + userId }, function (payload) {
        if (payload.eventType === 'DELETE') {
          var key = payload.old && payload.old.key;
          if (key && isSynced(key)) { localStorage.removeItem(key); delete meta[key]; delete lastSent[key]; writeMeta(); repaint(); }
          return;
        }
        if (applyRow(payload.new, false)) { writeMeta(); repaint(); }
      })
      .subscribe();

    setInterval(push, 2000);
    window.addEventListener('focus', function () { pull(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(false); else push(); });
    window.addEventListener('pagehide', function () { push(); });
  }

  window.__financeSync = { flush: push };
  window.addEventListener('finance:auth', function (e) { if (e.detail) start(e.detail); });
  if (window.__financeAuth && window.__financeAuth.session) start(window.__financeAuth.session);
})();
