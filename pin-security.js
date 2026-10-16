/* BSR PRO - PIN security (pure + WebCrypto). Browser: window.PinSecurity, Node: require().
   PIN plaintext store nahi hota: PBKDF2-SHA256 + random salt. Lockout sirf local UI friction hai (device-side) -
   ye server-side security nahi; asli data Firebase Auth + Firestore rules se bachta hai (docs/security-model.md). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PinSecurity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ITER = 150000, FREE_TRIES = 5, BASE_MS = 30000, MAX_MS = 900000;
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function derive(pin, salt, iter) {
    var c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : null;
    if (!c) throw new Error('WebCrypto unavailable');
    var key = await c.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256));
  }
  async function createRecord(pin) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return { pinHash: b64(await derive(pin, salt, ITER)), pinSalt: b64(salt), pinIter: ITER, pinVersion: 2 };
  }
  async function verifyRecord(pin, rec) {
    if (!rec || !rec.pinHash || !rec.pinSalt) return false;
    var got = await derive(pin, unb64(rec.pinSalt), Number(rec.pinIter) || ITER), want = unb64(rec.pinHash);
    if (got.length !== want.length) return false;
    var diff = 0; for (var i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // constant-time compare
    return diff === 0;
  }
  // state: { count, until }
  function registerFailure(state, now) {
    var count = ((state && state.count) || 0) + 1, until = (state && state.until) || 0;
    if (count >= FREE_TRIES) until = now + Math.min(MAX_MS, BASE_MS * Math.pow(2, count - FREE_TRIES));
    return { count: count, until: until };
  }
  function remainingLock(state, now) { return state && state.until > now ? state.until - now : 0; }
  return { ITER: ITER, FREE_TRIES: FREE_TRIES, createRecord: createRecord, verifyRecord: verifyRecord, registerFailure: registerFailure, remainingLock: remainingLock };
});
