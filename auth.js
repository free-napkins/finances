// ============================================================
// SIGN-IN for Finances — uses the shared boxofjelly.xyz account.
// Runs in <head> before the page paints:
//   • no session cookie → clear this browser's copy of the finance data
//     (it lives in your account) and go to accounts.boxofjelly.xyz
//   • session without 2FA → same redirect (boxauth's requireSession)
//   • signed in → window.__financeAuth.session is set, "finance:auth"
//     fires (sync.js starts), and the account button appears top-right.
// With no Supabase settings (local testing) the app runs offline as before.
// ============================================================
(function () {
  'use strict';

  var config = window.__FINANCE_CONFIG__ || {};
  var B = window.BoxAuth;
  var enabled = !!(config.supabaseUrl && config.supabaseAnonKey && window.supabase && B);

  var DATA_PREFIXES = ['nw:', 'budget:'];
  var DATA_KEYS = ['subs', 'bills', 'wishlist', 'incoming_orders', 'nw_currency', 'sync:meta', 'box:owner'];
  // Remove every finance value from this browser (your account keeps the synced copy).
  function clearFinanceData() {
    var doomed = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (DATA_KEYS.indexOf(k) >= 0 || DATA_PREFIXES.some(function (p) { return k.indexOf(p) === 0; }))) doomed.push(k);
    }
    doomed.forEach(function (k) { localStorage.removeItem(k); });
  }

  var auth = window.__financeAuth = {
    enabled: enabled,
    session: null,
    clearFinanceData: clearFinanceData,
    // Headers for the AI endpoints (api/receipt, api/insights), which only
    // answer 2FA-verified sessions.
    headers: async function () {
      var client = window.__financeSupabase;
      if (!client) return {};
      try {
        var res = await client.auth.getSession();
        return res.data && res.data.session ? { Authorization: 'Bearer ' + res.data.session.access_token } : {};
      } catch (_) { return {}; }
    }
  };
  if (!enabled) return;

  var client = window.__financeSupabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, B.clientOptions());
  var signingOut = false; // our own Sign out button handles the redirect

  function toSignIn() {
    clearFinanceData();
    document.documentElement.classList.add('auth-redirect');
    location.replace(B.signInUrl());
  }

  // Fast path before anything renders: no session cookie at all.
  if (B.canSignIn && !B.storage.getItem(B.storageKey)) { toSignIn(); return; }

  B.requireSession(client).then(function (session) {
    if (!session) {
      // Off our domains (preview URLs) the cookie isn't shared; stay offline.
      if (B.canSignIn) clearFinanceData();
      return;
    }
    auth.session = session;
    window.dispatchEvent(new CustomEvent('finance:auth', { detail: session }));
    whenReady(function () { renderAccountButton(session); });
  });

  client.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') { if (B.canSignIn && !signingOut) toSignIn(); return; }
    if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) auth.session = session;
  });
  // Signed out from another app (the shared cookie is gone): follow suit.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && B.canSignIn && !B.storage.getItem(B.storageKey)) toSignIn();
  });

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ---------- account button (top right) ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderAccountButton(session) {
    var wrap = el('div', 'acct');
    var btn = el('button', 'acct-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Account');
    btn.textContent = (session.user.email || '?').charAt(0).toUpperCase();
    var menu = el('div', 'acct-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    var who = el('div', 'acct-who');
    var name = el('div', 'acct-name', session.user.email || '');
    var mail = el('div', 'acct-mail', '');
    who.append(name, mail);
    var settings = el('a', 'acct-item', 'Account settings');
    settings.href = B.accountUrl;
    settings.setAttribute('role', 'menuitem');
    var home = el('a', 'acct-item', 'All apps');
    home.href = B.accountsOrigin + '/';
    home.setAttribute('role', 'menuitem');
    var out = el('button', 'acct-item acct-out', 'Sign out');
    out.type = 'button';
    out.setAttribute('role', 'menuitem');
    out.addEventListener('click', async function () {
      out.disabled = true;
      signingOut = true;
      out.textContent = 'Signing out…';
      try { if (window.__financeSync) await window.__financeSync.flush(); } catch (_) {}
      await client.auth.signOut({ scope: 'local' });
      clearFinanceData();
      location.replace(B.accountsOrigin + '/');
    });
    menu.append(who, settings, home, out);
    wrap.append(btn, menu);
    document.body.appendChild(wrap);
    function setOpen(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function () { setOpen(menu.hidden); });
    document.addEventListener('pointerdown', function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

    client.from('usernames').select('username').eq('user_id', session.user.id).maybeSingle().then(function (res) {
      var u = res.data && res.data.username;
      if (!u) return;
      btn.textContent = u.charAt(0).toUpperCase();
      name.textContent = u;
      mail.textContent = session.user.email || '';
    });
  }
})();
