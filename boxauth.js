// ============================================================
// BOXAUTH — one sign-in shared by every app on boxofjelly.xyz.
//
// Supabase keeps its session in this storage adapter instead of
// localStorage: a cookie on ".boxofjelly.xyz" (Secure, SameSite=Lax),
// so signing in at accounts.boxofjelly.xyz signs you into
// finances.boxofjelly.xyz and macros.boxofjelly.xyz too. On localhost
// the cookie is host-only, and cookies ignore ports, so apps running
// on different localhost ports share it as well.
//
// The same file is copied into each app (finances/boxauth.js,
// macros/src/lib/boxauth.js); keep the copies identical.
// ============================================================
(function (root) {
  'use strict';

  var ROOT_DOMAIN = 'boxofjelly.xyz';
  var PROD_ACCOUNTS = 'https://accounts.' + ROOT_DOMAIN;
  var LOCAL_ACCOUNTS = 'http://localhost:3002';
  var STORAGE_KEY = 'box-auth';
  var CHUNK = 3000; // stay well under the ~4 KB per-cookie limit
  var MAX_AGE = 60 * 60 * 24 * 400; // browsers cap cookies at 400 days; Supabase still expires the session itself

  var host = root.location.hostname;
  var onBox = host === ROOT_DOMAIN || host.slice(-(ROOT_DOMAIN.length + 1)) === '.' + ROOT_DOMAIN;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  var secure = root.location.protocol === 'https:';
  var accountsOrigin = onBox ? PROD_ACCOUNTS : isLocal ? LOCAL_ACCOUNTS : PROD_ACCOUNTS;

  // ---------- cookie storage (chunked, base64url) ----------
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function readCookies() {
    var out = {};
    (root.document.cookie || '').split(';').forEach(function (part) {
      var i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    return out;
  }
  function writeCookie(name, value, maxAge) {
    root.document.cookie = name + '=' + value + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax'
      + (secure ? '; Secure' : '') + (onBox ? '; Domain=.' + ROOT_DOMAIN : '');
  }
  function chunkNames(key, jar) {
    return Object.keys(jar).filter(function (n) { return n === key || n.indexOf(key + '.') === 0; });
  }

  var storage = {
    getItem: function (key) {
      var jar = readCookies();
      if (jar[key]) { try { return b64decode(jar[key]); } catch (_) { return null; } }
      var parts = [];
      for (var i = 0; jar[key + '.' + i] !== undefined; i++) parts.push(jar[key + '.' + i]);
      if (!parts.length) return null;
      try { return b64decode(parts.join('')); } catch (_) { return null; }
    },
    setItem: function (key, value) {
      var enc = b64encode(String(value));
      var jar = readCookies();
      var count = Math.ceil(enc.length / CHUNK);
      // PKCE verifiers only matter until the emailed link is used.
      var maxAge = /code-verifier$/.test(key) ? 60 * 60 * 24 : MAX_AGE;
      for (var i = 0; i < count; i++) writeCookie(key + '.' + i, enc.slice(i * CHUNK, (i + 1) * CHUNK), maxAge);
      // clear leftovers from a longer previous value, and any un-chunked copy
      chunkNames(key, jar).forEach(function (n) {
        var idx = n === key ? -1 : Number(n.slice(key.length + 1));
        if (n === key || idx >= count) writeCookie(n, '', 0);
      });
    },
    removeItem: function (key) {
      chunkNames(key, readCookies()).forEach(function (n) { writeCookie(n, '', 0); });
    }
  };

  // ---------- redirects ----------
  // Only send people back to our own sites (no open redirect).
  function isAllowedReturn(url) {
    try {
      var u = new URL(url, root.location.href);
      if (u.protocol === 'https:' && (u.hostname === ROOT_DOMAIN || u.hostname.slice(-(ROOT_DOMAIN.length + 1)) === '.' + ROOT_DOMAIN)) return true;
      if (isLocal && (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
      return false;
    } catch (_) { return false; }
  }
  function signInUrl(returnTo) {
    return accountsOrigin + '/sign-in?redirect_to=' + encodeURIComponent(returnTo || root.location.href);
  }

  // Apps call this on load: resolves with the session when it is fully
  // signed in (password + 2FA), otherwise sends the browser to the
  // accounts site and resolves null. Off our domains (e.g. a vercel.app
  // preview) it can't share the cookie, so it resolves null without redirecting.
  function requireSession(client) {
    return client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return null;
      return client.auth.mfa.getAuthenticatorAssuranceLevel().then(function (aal) {
        return aal.data && aal.data.currentLevel === 'aal2' ? session : null;
      });
    }).catch(function () { return null; }).then(function (session) {
      if (!session && (onBox || isLocal)) root.location.replace(signInUrl());
      return session;
    });
  }

  root.BoxAuth = {
    ROOT_DOMAIN: ROOT_DOMAIN,
    onBox: onBox,
    isLocal: isLocal,
    canSignIn: onBox || isLocal,
    accountsOrigin: accountsOrigin,
    accountUrl: accountsOrigin + '/account',
    storage: storage,
    storageKey: STORAGE_KEY,
    isAllowedReturn: isAllowedReturn,
    signInUrl: signInUrl,
    requireSession: requireSession,
    // Options for supabase.createClient(url, key, BoxAuth.clientOptions())
    clientOptions: function (extra) {
      var auth = { storage: storage, storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' };
      if (extra) for (var k in extra) auth[k] = extra[k];
      return { auth: auth };
    }
  };
})(window);
