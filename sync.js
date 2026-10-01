// ============================================================
// SYNC — keeps finance data the same on every device.
// Each stored key is one row in public.finance_kv (per user, RLS +
// 2FA protected), stamped with the server's time.
//   • Changes upload within half a second of being saved, and an upload
//     still in flight finishes even if the page is closed (keepalive),
//     so a quick entry on the phone isn't lost when you lock it.
//   • Other devices' changes arrive live (Realtime), and the app also
//     checks every 15 s while open and whenever you come back to it,
//     so a dropped live connection never leaves you stale.
//   • Saves are conflict-safe (public.finance_kv_put): a key is only
//     written if the server still has the version this device last saw.
//     Otherwise the device downloads, merges and retries, so two devices
//     never overwrite each other. Lists merge against the last synced
//     version: additions from both are kept and deletions on either side
//     stick. Other values: newest wins.
// ============================================================
(function () {
  'use strict';

  var PREFIXES = ['nw:', 'budget:'];
  var KEYS = ['subs', 'bills', 'wishlist', 'incoming_orders'];
  var META_KEY = 'sync:meta';   // { key: server updated_at last seen }
  var BASE_KEY = 'sync:base';   // { key: value as last synced } (merge base)
  var OWNER_KEY = 'box:owner';  // whose data this browser holds
  var POLL_MS = 15000;
  var isSynced = function (k) { return !!k && (KEYS.indexOf(k) >= 0 || PREFIXES.some(function (p) { return k.indexOf(p) === 0; })); };

  var client = null, userId = null, meta = {}, base = {}, pushing = false, pulling = false, started = false;
  var pushTimer = null, live = false, lastOk = 0, lastError = '';

  function readJson(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; } }
  function saveState() {
    origSetItem.call(localStorage, META_KEY, JSON.stringify(meta));
    origSetItem.call(localStorage, BASE_KEY, JSON.stringify(base));
  }
  function localKeys() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (isSynced(k)) out.push(k); }
    return out;
  }
  function repaint() {
    if (window.__finance) window.__finance.renderAllNetWorth();
    window.dispatchEvent(new Event('storage'));
  }
  function status(state, error) {
    if (state === 'ok') { lastOk = Date.now(); lastError = ''; } else if (error) lastError = error;
    window.__financeSync.status = { state: state, live: live, lastOk: lastOk, error: lastError };
    window.dispatchEvent(new CustomEvent('finance:sync', { detail: window.__financeSync.status }));
  }

  // Upload as soon as anything synced is saved (debounced).
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSetItem.call(this, k, v);
    if (this === window.localStorage && client && isSynced(k)) schedulePush();
  };
  var origRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (k) {
    origRemoveItem.call(this, k);
    if (this === window.localStorage && client && isSynced(k)) schedulePush();
  };
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 400); }

  // ---------- merging ----------
  function identity(x) { return x && typeof x === 'object' ? (x.id != null ? 'id:' + x.id : x.name != null ? 'name:' + x.name : null) : null; }
  function isIdList(v) { return Array.isArray(v) && v.length > 0 && v.every(function (x) { return identity(x) != null; }); }
  // Three-way merge of two edited copies of a list against the last synced version.
  function mergeLists(baseList, local, remote) {
    var b = {}, l = {}, r = {};
    (baseList || []).forEach(function (x) { b[identity(x)] = JSON.stringify(x); });
    local.forEach(function (x) { l[identity(x)] = x; });
    remote.forEach(function (x) { r[identity(x)] = x; });
    var out = [];
    remote.forEach(function (x) {
      var id = identity(x);
      if (id in b && !(id in l)) return;                                   // deleted here
      if (id in l && JSON.stringify(l[id]) !== b[id]) out.push(l[id]);     // edited here: keep ours
      else out.push(x);
    });
    local.forEach(function (x) {
      var id = identity(x);
      if (!(id in r) && !(id in b)) out.push(x);                           // added here
    });
    return out;
  }
  function mergeValues(baseVal, localVal, remoteVal) {
    if (Array.isArray(localVal) && Array.isArray(remoteVal) && (isIdList(localVal) || isIdList(remoteVal))) {
      return mergeLists(Array.isArray(baseVal) ? baseVal : [], localVal, remoteVal);
    }
    if (localVal && remoteVal && typeof localVal === 'object' && typeof remoteVal === 'object' && !Array.isArray(localVal) && !Array.isArray(remoteVal)) {
      var out = Object.assign({}, remoteVal), bv = baseVal && typeof baseVal === 'object' ? baseVal : {};
      Object.keys(localVal).forEach(function (k) { if (JSON.stringify(localVal[k]) !== JSON.stringify(bv[k])) out[k] = localVal[k]; });
      return out;
    }
    return remoteVal;
  }

  // Apply one server row. Returns true when local data changed.
  function applyRow(row) {
    if (!row || !isSynced(row.key)) return false;
    var known = meta[row.key];
    if (known && row.updated_at <= known) return false; // already have this version
    var localRaw = localStorage.getItem(row.key);
    var remoteRaw = JSON.stringify(row.value);
    var baseRaw = base[row.key];
    var value = row.value;
    // Unsynced local edits (or this device's first sync of a key it already has): merge.
    if (localRaw != null && localRaw !== remoteRaw && localRaw !== baseRaw) {
      try { value = mergeValues(baseRaw != null ? JSON.parse(baseRaw) : null, JSON.parse(localRaw), row.value); } catch (_) { value = row.value; }
    }
    meta[row.key] = row.updated_at;
    base[row.key] = remoteRaw;
    var raw = JSON.stringify(value);
    if (raw === localRaw) return false;
    origSetItem.call(localStorage, row.key, raw); // merged result differs from the server → pushes below
    return true;
  }

  async function pull(skipPush) {
    if (!client || pulling) return;
    pulling = true;
    try {
      // Cheap check first: just keys + timestamps, then fetch only what's newer.
      var heads = await client.from('finance_kv').select('key, updated_at');
      if (heads.error) throw heads.error;
      var stale = (heads.data || []).filter(function (r) { return isSynced(r.key) && !(meta[r.key] && r.updated_at <= meta[r.key]); }).map(function (r) { return r.key; });
      if (stale.length) {
        var res = await client.from('finance_kv').select('key, value, updated_at').in('key', stale);
        if (res.error) throw res.error;
        var rows = res.data || [];
        // Rows saved before the dollars switch get converted on the way in.
        if (window.__financeUSD && rows.length) {
          var state = {};
          rows.forEach(function (r) { state[r.key] = r.value; });
          var usd = await window.__financeUSD.toUSD(state);
          if (usd !== state) rows.forEach(function (r) { if (r.key in usd) r.value = usd[r.key]; });
        }
        var changed = false;
        rows.forEach(function (r) { if (applyRow(r)) changed = true; });
        saveState();
        if (changed) repaint();
      }
      status('ok');
    } catch (e) {
      status('error', (e && e.message) || 'Sync failed');
    } finally { pulling = false; }
    if (!skipPush) await push();
  }

  // Keys changed here since the last sync, each with the server version it was based on.
  function pendingBatch() {
    var batch = [];
    localKeys().forEach(function (k) {
      var raw = localStorage.getItem(k);
      if (raw === base[k]) return;
      var value;
      try { value = JSON.parse(raw); } catch (_) { value = raw; }
      batch.push({ key: k, value: value, raw: raw, expected: meta[k] || null });
    });
    return batch;
  }
  var wire = function (batch) { return batch.map(function (b) { return { key: b.key, value: b.value, expected: b.expected }; }); };

  async function push(retries) {
    if (!client || pushing) return;
    var batch = pendingBatch();
    if (!batch.length) return;
    pushing = true;
    var conflicted = false;
    try {
      var res = await client.rpc('finance_kv_put', { rows: wire(batch) });
      if (res.error) throw res.error;
      var sent = {};
      batch.forEach(function (b) { sent[b.key] = b.raw; });
      ((res.data && res.data.applied) || []).forEach(function (r) { base[r.key] = sent[r.key]; meta[r.key] = r.updated_at; });
      conflicted = ((res.data && res.data.conflicts) || []).length > 0;
      saveState();
      status('ok');
    } catch (e) {
      status('error', (e && e.message) || 'Upload failed');
    } finally { pushing = false; }
    // Another device saved first: download + merge, then save the merged result.
    if (conflicted && (retries || 0) < 3) { await pull(true); return push((retries || 0) + 1); }
    if (pendingBatch().length) schedulePush(); // something changed while uploading
  }

  // Leaving the page: send pending changes with keepalive so the request
  // survives the tab closing or the phone locking.
  async function pushOnExit() {
    var batch = pendingBatch();
    if (!batch.length || !client) return;
    var cfg = window.__FINANCE_CONFIG__ || {};
    var sess = await client.auth.getSession();
    var token = sess.data && sess.data.session && sess.data.session.access_token;
    // Same conflict-safe save; a conflict just stays pending and merges next time the app opens.
    var body = JSON.stringify({ rows: wire(batch) });
    if (!token || body.length > 60000) { push(); return; } // keepalive bodies are capped at 64 KB
    try {
      fetch(cfg.supabaseUrl + '/rest/v1/rpc/finance_kv_put', {
        method: 'POST', keepalive: true,
        headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body
      });
    } catch (_) { push(); }
  }

  function subscribe() {
    client.channel('finance_kv:' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_kv', filter: 'user_id=eq.' + userId }, function (payload) {
        if (payload.eventType === 'DELETE') {
          var key = payload.old && payload.old.key;
          if (key && isSynced(key)) { origRemoveItem.call(localStorage, key); delete meta[key]; delete base[key]; saveState(); repaint(); }
          return;
        }
        if (applyRow(payload.new)) { saveState(); repaint(); schedulePush(); }
        else saveState();
      })
      .subscribe(function (state) {
        live = state === 'SUBSCRIBED';
        status(lastError ? 'error' : 'ok');
        if (live) pull(); // catch anything sent while we were connecting
      });
  }

  async function start(session) {
    if (started && userId === session.user.id) return;
    started = true;
    client = window.__financeSupabase;
    userId = session.user.id;
    // Someone else's data on this browser? Don't mix accounts.
    var owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId && window.__financeAuth) window.__financeAuth.clearFinanceData();
    origSetItem.call(localStorage, OWNER_KEY, userId);
    meta = readJson(META_KEY);
    base = readJson(BASE_KEY);
    await pull();
    subscribe();
    setInterval(function () { if (!document.hidden) pull(); }, POLL_MS);
    window.addEventListener('focus', function () { pull(); });
    window.addEventListener('online', function () { pull(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) pushOnExit(); else pull(); });
    window.addEventListener('pagehide', pushOnExit);
  }

  window.__financeSync = { flush: function () { return push(); }, pull: function () { return pull(); }, status: { state: 'starting', live: false, lastOk: 0, error: '' } };
  window.addEventListener('finance:auth', function (e) { if (e.detail) start(e.detail); });
  if (window.__financeAuth && window.__financeAuth.session) start(window.__financeAuth.session);
})();
