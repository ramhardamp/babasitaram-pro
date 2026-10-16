/* ============================================================
   BSRPRO Digital Khata - Recovery (वसूली) engine. Pure functions.
   Browser: window.Recovery, Node: require().
   Uses Ledger.customerState for the amount (single source of truth) and a FIFO
   rule only to AGE the unpaid ordinary Payment: payments are applied to the oldest
   Payment first, so "days overdue" = age of the oldest part that is still unpaid.
   It never changes any balance.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Recovery = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function isDeleted(t) { return !!t && (t.status === 'deleted' || !!t.deletedAt); }
  function dayOf(t) { var d = new Date(String(t.date || t.dateTime || '').slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; }
  function daysBetween(a, b) { return Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY)); }

  // bucket: 'ok' (<=7d) | 'due' (8-30) | 'late' (31-90) | 'critical' (>90)
  function bucketOf(days) { return days > 90 ? 'critical' : days > 30 ? 'late' : days > 7 ? 'due' : 'ok'; }

  function ageOrdinary(txns, asOf) {
    // PERF: parse each transaction date ONCE (the old comparator re-parsed dates O(n log n) times). Result is identical.
    var paid = 0, ud = [], oldest = null, lastPay = null;
    for (var k = 0; k < txns.length; k++) {
      var t = txns[k];
      if (isDeleted(t) || (t.type !== 'udhaar' && t.type !== 'jama')) continue;
      var d = dayOf(t);
      if (t.type === 'jama') {
        paid += num(t.amount);
        if (d && (!lastPay || d > lastPay)) lastPay = d;
      } else if (d) {
        ud.push({ d: d, ms: d.getTime(), i: ud.length, amt: num(t.amount) });
      }
    }
    ud.sort(function (a, b) { return (a.ms - b.ms) || (a.i - b.i); });   // stable: same order as before
    for (var i = 0; i < ud.length; i++) {
      if (paid >= ud[i].amt) { paid -= ud[i].amt; continue; }
      oldest = ud[i].d; break;                // first Payment that is not fully paid
    }
    return { oldestUnpaid: oldest, lastPayment: lastPay };
  }

  /* buildRecoveryList(Ledger, customers, transactions, asOf, opts)
     returns rows (only customers who owe money), sorted by priority (amount x age). */
  function buildRecoveryList(Ledger, customers, transactions, asOf, opts) {
    var now = asOf ? new Date(asOf) : new Date();
    now = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var mode = (opts && opts.mode) === 'timeline' ? 'timeline' : 'legacy';
    var by = {};
    (transactions || []).forEach(function (t) { if (t) (by[String(t.partyId)] = by[String(t.partyId)] || []).push(t); });
    var rows = [];
    (customers || []).forEach(function (c) {
      var tx = by[String(c.id)] || [];
      var st = Ledger.customerState(tx, now, { mode: mode });
      var due = st.totalOutstanding;
      if (!(due > 0)) return;
      var ag = ageOrdinary(tx, now);
      var oldest = ag.oldestUnpaid;
      // loans with something due also age from their start date
      (st.loans || []).forEach(function (r) {
        var sd = r.loan && r.loan.startDate ? new Date(String(r.loan.startDate).slice(0, 10) + 'T00:00:00') : null;
        if (sd && !isNaN(sd.getTime()) && (r.state.totalOutstanding > 0) && (!oldest || sd < oldest)) oldest = sd;
      });
      var days = oldest ? daysBetween(oldest, now) : 0;
      var sinceLastPay = ag.lastPayment ? daysBetween(ag.lastPayment, now) : null;
      rows.push({
        id: c.id, name: c.name, phone: c.phone || '', due: due,
        ordinaryDue: st.ordinaryOutstanding, loanPrincipal: st.loanPrincipalOutstanding, interestDue: st.interestOutstanding,
        daysOverdue: days, sinceLastPayment: sinceLastPay, bucket: bucketOf(days),
        priority: due * (1 + days / 30)
      });
    });
    rows.sort(function (a, b) { return b.priority - a.priority || b.due - a.due; });
    return rows;
  }

  function summarize(rows) {
    var s = { count: rows.length, total: 0, ok: 0, due: 0, late: 0, critical: 0, amount: { ok: 0, due: 0, late: 0, critical: 0 } };
    rows.forEach(function (r) { s.total += r.due; s[r.bucket]++; s.amount[r.bucket] += r.due; });
    return s;
  }

  /* Credit limit is a WARNING only (never blocks). limit empty/0/invalid = no limit. */
  function checkLimit(limit, currentDue, addAmount) {
    var l = num(limit), d = Math.max(0, num(currentDue)), a = num(addAmount);
    var newDue = d + a;
    return { hasLimit: l > 0, exceeds: l > 0 && newDue > l, newDue: newDue, limit: l, over: l > 0 ? Math.max(0, newDue - l) : 0 };
  }

  return { buildRecoveryList: buildRecoveryList, summarize: summarize, bucketOf: bucketOf, checkLimit: checkLimit };
});
