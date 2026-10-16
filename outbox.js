/* ============================================================
   BSRPRO Digital Khata - Offline outbox (udhaar / jama only). Pure logic.
   Browser: window.Outbox, Node: require().
   Safety design:
   - Used ONLY when the phone is offline (the online save path is untouched).
   - Every entry carries its own Firestore document id (`key`) created up-front, so a
     replay can never create a second copy: before writing, the app checks whether that
     id already exists on the server; if it does the entry is simply dropped.
   - Entries are never silently lost: transient errors keep them queued, permanent
     errors mark them 'failed' and leave them visible for the owner to review/discard.
   - Queued entries are NOT in any balance until they are synced.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Outbox = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PREFIX = 'bsr_outbox_v1_';
  var MAX_ENTRIES = 200;

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function create(storage, uid) {
    var k = PREFIX + String(uid || '');
    function read() {
      try { var a = JSON.parse(storage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function write(a) { storage.setItem(k, JSON.stringify(a)); }   // may throw (quota) -> caller handles
    return {
      list: function () { return read(); },
      pending: function () { return read().filter(function (e) { return e.status !== 'failed'; }); },
      failed: function () { return read().filter(function (e) { return e.status === 'failed'; }); },
      count: function () { return read().length; },
      /* returns {ok:true} or {ok:false, reason} — never pretends it saved */
      add: function (entry) {
        var v = validate(entry); if (!v.ok) return v;
        var a = read();
        if (a.length >= MAX_ENTRIES) return { ok: false, reason: 'कतार भर गई (' + MAX_ENTRIES + ') — पहले नेट पर सिंक करें' };
        if (a.some(function (e) { return e.key === entry.key; })) return { ok: true, duplicate: true };
        a.push({ key: String(entry.key), customerId: String(entry.customerId), type: entry.type, amount: num(entry.amount), note: String(entry.note || ''),
          date: entry.date, time: entry.time, dateTime: entry.dateTime, queuedAt: entry.queuedAt || new Date().toISOString(), status: 'pending', error: '' });
        try { write(a); } catch (e) { return { ok: false, reason: 'फ़ोन की मेमोरी में सेव नहीं हो सका' }; }
        return { ok: true };
      },
      remove: function (key) { write(read().filter(function (e) { return e.key !== key; })); },
      mark: function (key, status, error) {
        write(read().map(function (e) { if (e.key === key) { e.status = status; e.error = error || ''; } return e; }));
      }
    };
  }

  function validate(e) {
    if (!e || !e.key || !e.customerId) return { ok: false, reason: 'अधूरी एंट्री' };
    if (e.type !== 'udhaar' && e.type !== 'jama') return { ok: false, reason: 'केवल पेमेंट/जमा कतार में जा सकता है' };
    var a = num(e.amount);
    if (!(a > 0 && a <= 1000000000)) return { ok: false, reason: 'रकम सही नहीं' };
    return { ok: true };
  }

  // errors that will never succeed by retrying
  function isPermanent(err) {
    var c = err && (err.code || '');
    return c === 'permission-denied' || c === 'invalid-argument' || c === 'not-found' || c === 'failed-precondition' || c === 'already-exists' || c === 'customer-missing';
  }

  /* replay(outbox, deps) — deps = { isOnline(), customerExists(id), exists(entry) -> Promise<bool>, commit(entry) -> Promise }
     Processes oldest first, one at a time. Stops at the first transient error (keeps order, keeps entry). */
  async function replay(outbox, deps) {
    var res = { synced: 0, alreadyThere: 0, failed: 0, stoppedOffline: false };
    var items = outbox.pending().sort(function (a, b) { return String(a.queuedAt).localeCompare(String(b.queuedAt)); });
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      if (!deps.isOnline()) { res.stoppedOffline = true; break; }
      if (!deps.customerExists(e.customerId)) { outbox.mark(e.key, 'failed', 'ग्राहक नहीं मिला'); res.failed++; continue; }
      try {
        if (await deps.exists(e)) { outbox.remove(e.key); res.alreadyThere++; continue; }   // idempotency guard
        await deps.commit(e);
        outbox.remove(e.key); res.synced++;
      } catch (err) {
        if (isPermanent(err)) { outbox.mark(e.key, 'failed', String((err && err.message) || err.code || 'error').slice(0, 160)); res.failed++; continue; }
        res.stoppedOffline = true; break;                                                    // transient: keep, retry later
      }
    }
    return res;
  }

  return { create: create, replay: replay, validate: validate, isPermanent: isPermanent, MAX_ENTRIES: MAX_ENTRIES };
});
