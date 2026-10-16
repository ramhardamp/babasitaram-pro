/* ============================================================
   BSRPRO Digital Khata - Backup sanitize / validate / import planner
   Pure functions (no Firestore / DOM). Browser: window.BackupImport, Node: require().
   Rules:
   - Backup file never contains PIN data, passwords, or public-link tokens.
   - Import is ADD-ONLY: it never overwrites or deletes existing customers/transactions.
   - Import is previewed first; nothing is written until the owner confirms.
   - Deleted records are not imported (Firestore rules forbid creating status:'deleted').
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BackupImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TYPES = ['udhaar', 'jama', 'byaj_loan', 'loan_repay', 'interest_paid'];
  var MAX_TXNS_PER_CUSTOMER = 480; // one Firestore batch = 500 ops; 1 op is the balance update
  var SECRET_KEY = /^(pin|pinhash|pinsalt|piniter|pinversion|password|passwd|secret|apikey|api_key|token|viewtoken|privatekey)$/i;

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function isDeleted(t) { return !!t && (t.status === 'deleted' || !!t.deletedAt); }
  function isMoney(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v <= 1000000000; }

  /* ---------- EXPORT SIDE ---------- */
  function stripSecrets(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) { if (!SECRET_KEY.test(k)) out[k] = obj[k]; });
    return out;
  }
  function sanitizeUser(user) { return stripSecrets(user); }
  function sanitizeCustomer(c) { return stripSecrets(c); }

  async function sha256Hex(text) {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('SHA-256 unavailable');
    var d = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /* ---------- VALIDATION ---------- */
  function normPhone(p) { var d = String(p || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; }
  function normName(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function isValidDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s.slice(0, 10) + 'T00:00:00').getTime()); }

  async function validateBackup(p) {
    var errors = [], warnings = [];
    function fail(m) { errors.push(m); return { ok: false, errors: errors, warnings: warnings }; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return fail('फ़ाइल BSRPRO backup नहीं है');
    if (p.schemaVersion !== 2) return fail('Backup schema समर्थित नहीं है (schemaVersion ' + p.schemaVersion + ')');
    if (!p.data || !Array.isArray(p.data.customers) || !Array.isArray(p.data.transactions)) return fail('Backup में customers/transactions सूची नहीं है');
    if (!p.counts || p.counts.customers !== p.data.customers.length || p.counts.transactions !== p.data.transactions.length) return fail('Record counts मेल नहीं खाते — फ़ाइल अधूरी या बदली हुई है');
    var want = p.integrity && p.integrity.checksumSha256;
    if (!/^[a-f0-9]{64}$/.test(want || '')) return fail('Checksum नहीं मिला — फ़ाइल सत्यापित नहीं हो सकती');
    var got;
    try { got = await sha256Hex(JSON.stringify(p.data)); } catch (e) { return fail('इस डिवाइस पर checksum जाँच उपलब्ध नहीं'); }
    if (got !== want) return fail('Checksum मेल नहीं खाया — फ़ाइल बदली हुई या खराब है');

    var customers = [], seenC = {};
    p.data.customers.forEach(function (c, i) {
      var id = c && c.id != null ? String(c.id) : '';
      var name = c && typeof c.name === 'string' ? c.name.trim() : '';
      if (!id || !name || name.length > 200) { warnings.push('ग्राहक #' + (i + 1) + ' छोड़ा गया (नाम/ID अमान्य)'); return; }
      if (seenC[id]) { warnings.push('दोहरा ग्राहक ID छोड़ा गया: ' + name); return; }
      seenC[id] = true; customers.push(c);
    });
    var txns = [], orphan = 0, invalid = 0, deleted = 0, seenT = {};
    p.data.transactions.forEach(function (t) {
      if (!t || typeof t !== 'object') { invalid++; return; }
      if (isDeleted(t)) { deleted++; return; }
      if (!seenC[String(t.partyId)]) { orphan++; return; }
      if (TYPES.indexOf(t.type) < 0) { invalid++; return; }
      var amt = t.type === 'byaj_loan' ? t.principal : t.amount;
      if (!isMoney(num(amt)) || (t.type === 'byaj_loan' && !(num(t.rate) >= 0 && num(t.rate) <= 1000))) { invalid++; return; }
      if (t.date != null && !isValidDate(t.date)) { invalid++; return; }
      if (t.id != null) { if (seenT[String(t.id)]) { invalid++; return; } seenT[String(t.id)] = true; }
      txns.push(t);
    });
    if (orphan) warnings.push(orphan + ' लेन-देन बिना ग्राहक के थे — नहीं जोड़े जाएँगे');
    if (invalid) warnings.push(invalid + ' लेन-देन अमान्य (रकम/प्रकार/तारीख) — नहीं जोड़े जाएँगे');
    return { ok: true, errors: errors, warnings: warnings, customers: customers, transactions: txns, skipped: { orphan: orphan, invalid: invalid, deleted: deleted } };
  }

  /* ---------- IMPORT PLAN (pure; caller supplies existing data and an id generator) ---------- */
  function txnKey(t, partyId, loanId) {
    var amt = t.type === 'byaj_loan' ? num(t.principal) : num(t.amount);
    return [partyId, t.type, amt, String(t.date || '').slice(0, 10), String(t.time || ''), String(t.note || '').trim(), loanId || ''].join('|');
  }
  var RESERVED = { id: 1, createdAt: 1, partyId: 1, loanId: 1, deletedAt: 1, deletedBy: 1, deletedReason: 1, viewToken: 1 };

  function planImport(valid, existingCustomers, existingTxns, genId) {
    var exByKey = {}, exById = {};
    (existingCustomers || []).forEach(function (c) {
      exById[String(c.id)] = c;
      var k = normName(c.name) + '|' + normPhone(c.phone);
      if (!exByKey[k]) exByKey[k] = c;
    });
    var exTxnKeys = {}, exTxnIds = {};
    (existingTxns || []).forEach(function (t) {
      if (isDeleted(t)) return;
      exTxnIds[String(t.id)] = t;
      exTxnKeys[txnKey(t, String(t.partyId), t.loanId ? String(t.loanId) : '')] = String(t.id);
    });

    var partyMap = {};            // backup customer id -> { id, isNew, src }
    var plan = { newCustomers: [], mergedCustomers: [], txns: [], duplicateTxns: 0, tooLarge: [], skipped: valid.skipped };
    valid.customers.forEach(function (c) {
      var hit = exById[String(c.id)] && normName(exById[String(c.id)].name) === normName(c.name) ? exById[String(c.id)] : exByKey[normName(c.name) + '|' + normPhone(c.phone)];
      if (hit) { partyMap[String(c.id)] = { id: String(hit.id), isNew: false, src: c }; plan.mergedCustomers.push({ id: String(hit.id), name: c.name }); }
      else { var nid = genId(); partyMap[String(c.id)] = { id: nid, isNew: true, src: c }; plan.newCustomers.push({ id: nid, name: c.name, phone: c.phone || '' }); }
    });

    // order: loans first so repay/interest rows can be re-linked
    var loanIdMap = {};           // backup loan id -> new/existing loan txn id
    var ordered = valid.transactions.slice().sort(function (a, b) { return (a.type === 'byaj_loan' ? 0 : 1) - (b.type === 'byaj_loan' ? 0 : 1); });
    var perParty = {};
    ordered.forEach(function (t) {
      var pm = partyMap[String(t.partyId)];
      var newPartyId = pm.id;
      var oldLoanRef = t.loanId != null ? String(t.loanId) : '';
      var mappedLoan = oldLoanRef ? (loanIdMap[oldLoanRef] || '') : '';
      if ((t.type === 'loan_repay' || t.type === 'interest_paid') && !mappedLoan) { plan.skipped = Object.assign({}, plan.skipped, { invalid: (plan.skipped.invalid || 0) + 1 }); return; }
      var key = txnKey(t, newPartyId, mappedLoan);
      var dupId = (!pm.isNew) ? (exTxnKeys[key] || (t.id != null && exTxnIds[String(t.id)] && String(exTxnIds[String(t.id)].partyId) === newPartyId ? String(t.id) : '')) : '';
      if (dupId) { plan.duplicateTxns++; if (t.type === 'byaj_loan' && t.id != null) loanIdMap[String(t.id)] = dupId; return; }
      var newId = genId();
      if (t.type === 'byaj_loan') { if (t.id != null) loanIdMap[String(t.id)] = newId; if (t.loanId != null) loanIdMap[String(t.loanId)] = newId; }
      var data = {};
      Object.keys(t).forEach(function (k) { if (!RESERVED[k] && !SECRET_KEY.test(k)) data[k] = t[k]; });
      data.partyId = newPartyId;
      if (mappedLoan) data.loanId = mappedLoan;
      if (t.createdAt != null) data.originalCreatedAt = t.createdAt;
      if (data.status === 'active' || data.status == null) delete data.status; // keep rules-default
      var row = { id: newId, partyId: newPartyId, data: data };
      plan.txns.push(row);
      (perParty[newPartyId] = perParty[newPartyId] || []).push(row);
    });

    // ordinary balance delta per customer (matches Ledger.ordinaryState / party.balance meaning)
    plan.balanceDelta = {};
    Object.keys(perParty).forEach(function (pid) {
      var net = 0;
      perParty[pid].forEach(function (r) { if (r.data.type === 'udhaar') net += num(r.data.amount); else if (r.data.type === 'jama') net -= num(r.data.amount); });
      plan.balanceDelta[pid] = net;
      if (perParty[pid].length > MAX_TXNS_PER_CUSTOMER) plan.tooLarge.push(pid);
    });
    plan.perParty = perParty;
    plan.partyMap = partyMap;
    plan.isNoop = plan.txns.length === 0 && plan.newCustomers.length === 0;
    return plan;
  }

  return {
    TYPES: TYPES, MAX_TXNS_PER_CUSTOMER: MAX_TXNS_PER_CUSTOMER,
    stripSecrets: stripSecrets, sanitizeUser: sanitizeUser, sanitizeCustomer: sanitizeCustomer,
    sha256Hex: sha256Hex, validateBackup: validateBackup, planImport: planImport, txnKey: txnKey
  };
});
