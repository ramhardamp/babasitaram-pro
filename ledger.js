/* ============================================================
   BSR PRO Digital Khata - Canonical Ledger (pure functions)
   Koi UI / Firestore dependency nahi. Browser: window.Ledger, Node: require().
   Har screen (dashboard, portal, share, UPI, statement, export, integrity)
   isi ek formula se balance nikalti hai. Rules: docs/ledger-rules.md
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ledger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SCHEMA_VERSION = 2;
  var ORDINARY_TYPES = ['udhaar', 'jama'];
  var LOAN_TYPES = ['byaj_loan', 'loan_repay', 'interest_paid'];
  var ALL_TYPES = ORDINARY_TYPES.concat(LOAN_TYPES);

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function isDeleted(t) { return !!t && (t.status === 'deleted' || !!t.deletedAt); }

  // Legacy monthsBetween - original dashboard logic, bit-for-bit (compat).
  function monthsBetween(start, end) {
    var s = new Date(start), e = new Date(end);
    if (e <= s) return 0;
    var years = e.getFullYear() - s.getFullYear();
    var months = e.getMonth() - s.getMonth();
    var days = e.getDate() - s.getDate();
    if (days < 0) { months -= 1; days += new Date(e.getFullYear(), e.getMonth(), 0).getDate(); }
    var totalMonths = years * 12 + months;
    var daysInMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
    return Math.max(0, totalMonths + days / daysInMonth);
  }

  function linkedOf(loan, transactions, type) {
    return (transactions || []).filter(function (t) { return t && !isDeleted(t) && t.type === type && t.loanId && String(t.loanId) === String(loan.loanId || loan.id); });
  }
  // Embedded loan.repayments / loan.interestPaid AUTHORITATIVE hain (purane aur naye dono loans mein poori history yahin hai,
  // isliye purane numbers nahi badalte). Linked loanId transactions sirf tab fallback hain jab embedded khaali ho.
  function repaymentsOf(loan, transactions) {
    var emb = Array.isArray(loan.repayments) ? loan.repayments : [];
    if (emb.length) return emb.map(function (r) { return { amount: num(r && r.amount), date: r && (r.date || r.dateTime) }; });
    return linkedOf(loan, transactions, 'loan_repay').map(function (t) { return { amount: num(t.amount), date: t.date || t.dateTime }; });
  }
  function interestPaidOf(loan, transactions) {
    var emb = Math.max(0, num(loan.interestPaid));
    if (emb > 0) return emb;
    return linkedOf(loan, transactions, 'interest_paid').reduce(function (s, t) { return s + num(t.amount); }, 0);
  }


  /* ===== COMPOUND INTEREST (naya, sirf jab loan.interestType === 'compound'; purane loans ka koi number nahi badalta) =====
     Rules (reference app ke numbers se verify: 43,309 @ 2%/mo monthly, 2 Jun -> 12 Oct 2026 = 3,882.58):
     - Period anniversary se chalte hain (start date se har N mahine), calendar 1st se nahi.
     - Poora period: base x rate_per_month x N. Adhura (current) period: base x rate x (poore mahine + bache din/30).
     - Period end par us period ka byaj principal me jud jata hai (capitalize) -> agle period ka base = principal + capitalized byaj.
     - Daily: har din base x rate/30, roz capitalize.  Rate per year ho to monthly = rate/12.
     - Principal repayment: loan.partPaymentInterest !== false (DEFAULT, "ON") => us tareekh se interest-bearing base ghatta hai (repayment ko byaj ka fayda milta hai).
       partPaymentInterest === false ("OFF") => byaj poore principal par chalta rehta hai, repayment sirf outstanding se face-value par kat-ti hai.
       interest_paid sirf outstanding ghatata hai (compounding base nahi). */
  var FREQ_MONTHS = { daily: 0, monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };
  function toDay(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (m) return new Date(+m[1], +m[2] - 1, +m[3]); }
    var d = new Date(v); return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addMonthsClamped(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  }
  function monthsSpan(a, b) { // poore mahine (anniversary) + bache din / 30
    if (b <= a) return 0;
    var full = 0; while (addMonthsClamped(a, full + 1) <= b) full++;
    var rem = Math.round((b - addMonthsClamped(a, full)) / 86400000);
    return full + rem / 30;
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  /* Dar ki ikai: month (default) | halfyear (har 6 mahine) | year (har 12 mahine) -> hamesha "per month" me badli jaati hai. */
  function unitDivisor(loan) { return loan && loan.rateUnit === 'year' ? 12 : (loan && loan.rateUnit === 'halfyear' ? 6 : 1); }
  /* Calendar-style span: saal/mahina/din alag nikalte hain (din ghatne par pichhle mahine ke din udhaar), phir
     mahine = 12*saal + mahina + din/30. Sirf naye simple loans (loan.simpleMethod === 'cal30') me use hota hai. */
  function calendarMonths(start, end) {
    var s = new Date(start), e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    if (e < s) { var t = s; s = e; e = t; }
    var dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], y = e.getFullYear();
    if (y % 400 === 0 || (y % 100 !== 0 && y % 4 === 0)) dim[1] = 29;
    var borrow = 0, yearBorrow = 0, days, months;
    if (e.getDate() >= s.getDate()) days = e.getDate() - s.getDate();
    else { days = dim[e.getMonth() > 0 ? e.getMonth() - 1 : 11] - s.getDate() + e.getDate(); borrow = 1; }
    if (e.getMonth() - borrow >= s.getMonth()) months = e.getMonth() - borrow - s.getMonth();
    else { months = 12 - s.getMonth() + (e.getMonth() - borrow); yearBorrow = 1; }
    var years = e.getFullYear() - s.getFullYear() - yearBorrow;
    return 12 * years + months + days / 30;
  }
  function compoundSchedule(loan, reps, asOfDate) {
    var start = toDay(loan.startDate), asOf = toDay(asOfDate || new Date());
    var P = Math.max(0, num(loan.principal));
    var freq = FREQ_MONTHS[loan.compoundFreq] !== undefined ? loan.compoundFreq : 'monthly';
    var mRate = Math.max(0, num(loan.rate)) / 100 / unitDivisor(loan);
    var reduceBase = loan.partPaymentInterest !== false;
    var out = { rows: [], principal: P, accrued: 0, months: 0, freq: freq };
    if (!start || !asOf || asOf <= start) return out;
    var events = (reps || []).map(function (r) { var d = toDay(r.date); return d && r.amount > 0 ? { t: d < start ? start : d, amount: r.amount } : null; })
      .filter(function (e) { return e && e.t <= asOf; }).sort(function (a, b) { return a.t - b.t; });
    var ei = 0, cap = 0, pending = 0, rowAmt = 0, last = start, rows = out.rows;
    function accrue(to) { if (to > last) { var add = (P + cap) * mRate * monthsSpan(last, to); pending += add; rowAmt += add; last = to; } }
    function repayUpTo(date) { while (ei < events.length && events[ei].t <= date) { accrue(events[ei].t); if (reduceBase) P = Math.max(0, P - events[ei].amount); ei++; } }
    if (freq === 'daily') {
      var day = new Date(start), j = 1, nextB = addMonthsClamped(start, 1), guard = 0;
      while (day < asOf && guard++ < 36600) {
        var prev = new Date(day); day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
        while (ei < events.length && events[ei].t <= prev) { if (reduceBase) P = Math.max(0, P - events[ei].amount); ei++; }
        var add = (P + cap) * mRate / 30; cap += add; rowAmt += add;
        if (day >= nextB && day < asOf) { rows.push({ date: nextB, amount: r2(rowAmt), running: r2(cap), current: false }); rowAmt = 0; j++; nextB = addMonthsClamped(start, j); }
      }
      while (ei < events.length && events[ei].t <= asOf) { if (reduceBase) P = Math.max(0, P - events[ei].amount); ei++; }
      pending = 0;
    } else {
      var L = FREQ_MONTHS[freq], k = 1, g2 = 0;
      for (;;) {
        var pEnd = addMonthsClamped(start, k * L);
        if (pEnd <= asOf && g2++ < 1200) {
          repayUpTo(pEnd); accrue(pEnd); cap += pending; pending = 0;
          rows.push({ date: pEnd, amount: r2(rowAmt), running: r2(cap), current: false }); rowAmt = 0; k++;
        } else { repayUpTo(asOf); accrue(asOf); break; }
      }
    }
    var total = cap + pending;
    if (rowAmt > 0 || !rows.length) rows.push({ date: asOf, amount: r2(rowAmt), running: r2(total), current: true });
    var prevRun = 0; rows.forEach(function (r) { r.amount = r2(r.running - prevRun); prevRun = r.running; }); // row amounts = running ka farak (paise me exact)
    out.principal = P; out.accrued = total; out.months = monthsSpan(start, asOf);
    return out;
  }

  /* calculateLoanState(loan, transactions, asOfDate, opts)
     opts.mode: 'legacy'  -> purana rule (current principal x rate x poore elapsed months). DEFAULT (history nahi badalti)
                'timeline'-> principal timeline: repayment ke baad agle period se kam principal par interest.
     Return shape = purane calcLoan jaisa + naye fields. Principal aur interest kabhi mix nahi hote. */
  function calculateLoanState(loan, transactions, asOfDate, opts) {
    var mode = (opts && opts.mode) === 'timeline' ? 'timeline' : 'legacy';
    var asOf = asOfDate ? new Date(asOfDate) : new Date();
    var principal = Math.max(0, num(loan.principal));
    var rate = Math.max(0, num(loan.rate)) / unitDivisor(loan); // rateUnit sirf naye loans me
    var spanFn = loan.simpleMethod === 'cal30' ? calendarMonths : monthsBetween; // cal30 sirf naye simple loans me; purane loans legacy monthsBetween par
    var reps = repaymentsOf(loan, transactions);
    var repaid = reps.reduce(function (s, r) { return s + r.amount; }, 0);
    var currentP = Math.max(0, principal - repaid);
    var accr;
    if (loan.interestType === 'compound') { // naya compound path (purane loans me interestType hota hi nahi)
      var cs = compoundSchedule(loan, reps, asOf);
      accr = Math.round(cs.accrued); /* currentP = principal - repaid (upar), toggle se independent: repayment hamesha outstanding ghatati hai */
      var saved = 0;
      if (loan.partPaymentInterest !== false && repaid > 0) { var off = compoundSchedule(Object.assign({}, loan, { partPaymentInterest: false }), reps, asOf); saved = Math.max(0, Math.round(off.accrued) - accr); }
      var outC = finish(cs.months); outC.interestSaved = saved; outC.partPaymentInterest = loan.partPaymentInterest !== false; outC.mode = 'compound'; outC.schedule = cs.rows; outC.interestType = 'compound'; outC.compoundFreq = cs.freq;
      return outC;
    }
    if (mode === 'legacy') {
      var mRaw = spanFn(loan.startDate, asOf);
      var months = isFinite(mRaw) ? mRaw : 0;
      accr = Math.round((currentP * rate * months) / 100);
      var out0 = finish(months);
      return out0;
    }
    // timeline
    var events = reps.filter(function (r) { return r.amount > 0 && r.date; })
      .map(function (r) { return { t: new Date(r.date), amount: r.amount }; })
      .filter(function (r) { return !isNaN(r.t.getTime()) && r.t <= asOf; })
      .sort(function (a, b) { return a.t - b.t; });
    var P = principal, segStart = new Date(loan.startDate), sum = 0, totalMonths = 0;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var when = ev.t < segStart ? segStart : ev.t;
      var m = spanFn(segStart, when);
      sum += (P * rate * m) / 100; totalMonths += m;
      P = Math.max(0, P - ev.amount); segStart = when;
    }
    var mLast = spanFn(segStart, asOf);
    sum += (P * rate * mLast) / 100; totalMonths += mLast;
    accr = Math.round(sum);
    return finish(isFinite(totalMonths) ? totalMonths : 0);

    function finish(months) {
      var intPaid = interestPaidOf(loan, transactions);
      var intOut = Math.max(0, accr - intPaid);
      var cp = currentP;
      return {
        mode: mode,
        principalOriginal: Math.round(principal),
        principalRepaid: Math.round(repaid),
        principalOutstanding: Math.round(cp),
        interestAccrued: accr,
        interestPaid: Math.round(intPaid),
        interestOutstanding: Math.round(intOut),
        totalOutstanding: Math.round(cp + intOut),
        status: cp <= 0 && intOut <= 0 ? 'closed' : 'active',
        // purane calcLoan ke naam (UI compat)
        repaidPrincipal: Math.round(repaid), currentPrincipal: Math.round(cp),
        months: Math.round(months * 10) / 10, loanTotal: Math.round(cp + intOut),
        progress: principal > 0 ? Math.min(100, Math.round((repaid / principal) * 100)) : 0
      };
    }
  }

  function ordinaryState(txns) {
    var net = 0;
    (txns || []).forEach(function (t) {
      if (isDeleted(t)) return;
      if (t.type === 'udhaar') net += num(t.amount); else if (t.type === 'jama') net -= num(t.amount);
    });
    return { net: net, ordinaryOutstanding: Math.max(0, net), advance: Math.max(0, -net) };
  }

  /* customerState: ek customer ka canonical balance.
     total = ordinaryOutstanding + loanPrincipalOutstanding + interestOutstanding. Advance alag dikhta hai, loan se net nahi hota. */
  function customerState(partyTxns, asOfDate, opts) {
    var live = (partyTxns || []).filter(function (t) { return !isDeleted(t); });
    var o = ordinaryState(live);
    var mode = (opts && opts.mode) === 'timeline' ? 'timeline' : 'legacy';
    var loans = live.filter(function (t) { return t.type === 'byaj_loan'; });
    var rows = [], principal = 0, interest = 0, accrued = 0, interestPaid = 0;
    loans.forEach(function (l) {
      var m = calculateLoanState(l, live, asOfDate, opts);
      // legacy: sirf 'active' loans (purana behaviour). timeline: band loan ka bacha hua byaj bhi gina jata hai.
      if (l.settled === true) return; // hath se settle kiya hua loan balance me nahi ginta (unsettle par wapas)
      var include = mode === 'timeline' ? (l.status === 'active' || m.interestOutstanding > 0) : l.status === 'active';
      if (!include) return;
      rows.push({ loan: l, state: m });
      principal += m.principalOutstanding; interest += m.interestOutstanding;
      accrued += m.interestAccrued; interestPaid += m.interestPaid;
    });
    return {
      net: o.net, ordinaryOutstanding: o.ordinaryOutstanding, advance: o.advance,
      loanPrincipalOutstanding: principal, interestOutstanding: interest,
      interestAccrued: accrued, interestPaid: interestPaid,
      loanOutstanding: principal + interest,
      totalOutstanding: o.ordinaryOutstanding + principal + interest,
      loans: rows, mode: mode
    };
  }

  function portfolioTotals(states) {
    var t = { ordinary: 0, principal: 0, interest: 0, total: 0, advance: 0 };
    (states || []).forEach(function (s) {
      t.ordinary += s.ordinaryOutstanding; t.principal += s.loanPrincipalOutstanding;
      t.interest += s.interestOutstanding; t.total += s.totalOutstanding; t.advance += s.advance;
    });
    return t;
  }

  // Share/SMS template category: normal | advance | loan | mixed | clear
  function messageKind(s) {
    var hasO = s.ordinaryOutstanding > 0, hasL = s.loanOutstanding > 0;
    if (hasO && hasL) return 'mixed';
    if (hasL) return 'loan';
    if (hasO) return 'normal';
    return s.advance > 0 ? 'advance' : 'clear';
  }

  // Public portal payload (minimal fields, versioned). Legacy fields compat ke liye rehte hain.
  function publicSummary(state, txns) {
    var live = (txns || []).filter(function (t) { return !isDeleted(t); });
    var sums = { ordinaryUdhaar: 0, ordinaryJama: 0, loanGiven: 0, loanRepaid: 0, interestPaid: 0 };
    live.forEach(function (t) {
      var a = num(t.amount || t.principal);
      if (t.type === 'udhaar') sums.ordinaryUdhaar += a; else if (t.type === 'jama') sums.ordinaryJama += a;
      else if (t.type === 'byaj_loan') sums.loanGiven += num(t.principal || t.amount);
      else if (t.type === 'loan_repay') sums.loanRepaid += a; else if (t.type === 'interest_paid') sums.interestPaid += a;
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      ordinaryOutstanding: state.ordinaryOutstanding, advance: state.advance,
      loanPrincipalOutstanding: state.loanPrincipalOutstanding, interestOutstanding: state.interestOutstanding,
      totalOutstanding: state.totalOutstanding,
      ordinaryUdhaar: sums.ordinaryUdhaar, ordinaryJama: sums.ordinaryJama,
      loanGiven: sums.loanGiven, loanRepaid: sums.loanRepaid, interestPaid: sums.interestPaid
    };
  }

  // Invariants (docs/ledger-rules.md section "Invariants")
  function checkInvariants(s) {
    var errs = [];
    if (s.ordinaryOutstanding < 0 || s.advance < 0) errs.push('negative ordinary/advance');
    if (s.ordinaryOutstanding > 0 && s.advance > 0) errs.push('ordinary and advance both > 0');
    if (s.totalOutstanding !== s.ordinaryOutstanding + s.loanPrincipalOutstanding + s.interestOutstanding) errs.push('total formula');
    if (s.loanOutstanding !== s.loanPrincipalOutstanding + s.interestOutstanding) errs.push('loan formula');
    return errs;
  }

  /* UPI: ID format validate + amount > 0 + INR + URL-safe. "UPI app khula" != "payment hua" (ledger-side confirm). */
  var UPI_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
  function isValidUpiId(id) { return typeof id === 'string' && UPI_RE.test(id.trim()); }
  function buildUpiUrl(upiId, amount) {
    var id = String(upiId || '').trim(), am = Number(amount);
    if (!isValidUpiId(id) || !isFinite(am) || am <= 0 || am > 10000000) return '';
    return 'upi://pay?pa=' + encodeURIComponent(id).replace(/%40/g, '@') + '&am=' + am.toFixed(2) + '&cu=INR';
  }
  // Portal token: crypto-random alnum; malformed token Firestore tak jata hi nahi
  var TOKEN_RE = /^[A-Za-z0-9]{20,64}$/;
  function isWellFormedToken(t) { return typeof t === 'string' && TOKEN_RE.test(t); }
  // revoked / expired / ok
  function portalStatus(view, now) {
    if (!view) return 'missing';
    if (view.revokedAt) return 'revoked';
    var e = view.expiresAt;
    if (e) { var d = e && typeof e.toDate === 'function' ? e.toDate() : new Date(e); if (!isNaN(d.getTime()) && d.getTime() <= (now || new Date()).getTime()) return 'expired'; }
    return 'ok';
  }

  /* integrityReport: read-only audit. Kuch auto-fix nahi karta (fix tool alag, dry-run + confirm ke saath).
     severity 'error' => data galat; 'warn' => dhyan dene layak. */
  function integrityReport(input) {
    var customers = input.customers || [], txns = input.transactions || [];
    var issues = [];
    function add(code, severity, id, detail) { issues.push({ code: code, severity: severity, id: id || '', detail: detail || '' }); }
    var custIds = {}; customers.forEach(function (c) { custIds[String(c.id)] = c; });
    var seen = {}, loanById = {}, linkedRepay = {}, linkedInt = {}, now = input.now ? new Date(input.now) : new Date();
    txns.forEach(function (t) {
      if (seen[t.id]) add('duplicate_txn_id', 'error', t.id); seen[t.id] = 1;
      if (ALL_TYPES.indexOf(t.type) < 0) add('invalid_type', 'error', t.id, String(t.type));
      if (!custIds[String(t.partyId)]) add('orphan_transaction', 'error', t.id, 'partyId=' + t.partyId);
      var amt = t.type === 'byaj_loan' ? num(t.principal || t.amount) : num(t.amount);
      if (!(amt > 0)) add('invalid_amount', 'error', t.id, t.type + ':' + t.amount);
      if (t.type === 'byaj_loan') {
        var lid = String(t.loanId || t.id);
        if (loanById[lid]) add('duplicate_loan_id', 'error', t.id, lid);
        loanById[lid] = t;
        if (num(t.rate) < 0) add('invalid_rate', 'error', t.id);
      }
      var when = new Date(t.dateTime || t.transactionAt || t.date || t.startDate);
      if (!isDeleted(t) && !isNaN(when.getTime()) && when.getTime() > now.getTime() + 86400000) add('future_dated', 'warn', t.id, String(t.date || ''));
    });
    txns.forEach(function (t) {
      if (isDeleted(t)) return;
      if (t.type === 'loan_repay' || t.type === 'interest_paid') {
        var loan = loanById[String(t.loanId || '')];
        if (!t.loanId) add('derived_without_loanid', 'warn', t.id, t.type);
        else if (!loan) add('derived_orphan_loan', 'error', t.id, 'loanId=' + t.loanId);
        else if (isDeleted(loan)) add('derived_on_deleted_loan', 'error', t.id, 'loanId=' + t.loanId);
        else if (t.type === 'loan_repay') linkedRepay[t.loanId] = (linkedRepay[t.loanId] || 0) + num(t.amount);
        else linkedInt[t.loanId] = (linkedInt[t.loanId] || 0) + num(t.amount);
      }
    });
    Object.keys(loanById).forEach(function (lid) {
      var l = loanById[lid]; if (isDeleted(l)) return;
      var emb = (Array.isArray(l.repayments) ? l.repayments : []).reduce(function (s, r) { return s + num(r && r.amount); }, 0);
      if (emb > num(l.principal) + 0.5) add('repaid_exceeds_principal', 'error', l.id, emb + '>' + l.principal);
      if (linkedRepay[lid] !== undefined && Math.abs(linkedRepay[lid] - emb) > 0.5) add('repayment_mismatch', 'error', l.id, 'embedded=' + emb + ' linked=' + linkedRepay[lid]);
      if (linkedInt[lid] !== undefined && Math.abs(linkedInt[lid] - num(l.interestPaid)) > 0.5) add('interest_paid_mismatch', 'error', l.id, 'embedded=' + num(l.interestPaid) + ' linked=' + linkedInt[lid]);
      if (num(l.interestPaid) < 0) add('negative_interest_paid', 'error', l.id);
      var closedByPrincipal = emb >= num(l.principal) && num(l.principal) > 0;
      if (l.status === 'active' && closedByPrincipal) add('status_should_be_closed', 'warn', l.id);
      if (l.status === 'closed' && !closedByPrincipal) add('status_closed_but_principal_left', 'warn', l.id);
    });
    var perParty = {};
    txns.forEach(function (t) { if (!isDeleted(t)) (perParty[String(t.partyId)] = perParty[String(t.partyId)] || []).push(t); });
    customers.forEach(function (c) {
      var o = ordinaryState(perParty[String(c.id)] || []);
      if (num(c.balance) !== o.net) add('balance_mismatch', 'error', c.id, 'stored=' + num(c.balance) + ' computed=' + o.net);
      if (c.viewToken && !isWellFormedToken(c.viewToken)) add('malformed_view_token', 'warn', c.id);
    });
    var errors = issues.filter(function (i) { return i.severity === 'error'; }).length;
    var counts = {}; issues.forEach(function (i) { counts[i.code] = (counts[i.code] || 0) + 1; });
    return { ok: errors === 0, errors: errors, warnings: issues.length - errors, counts: counts, issues: issues,
      customers: customers.length, transactions: txns.length };
  }
  // Fix-tool dry run: kaun se customers ka stored balance galat hai (kuch likhta nahi)
  function balanceFixPlan(customers, txns) {
    var perParty = {}; (txns || []).forEach(function (t) { if (!isDeleted(t)) (perParty[String(t.partyId)] = perParty[String(t.partyId)] || []).push(t); });
    var plan = [];
    (customers || []).forEach(function (c) {
      var o = ordinaryState(perParty[String(c.id)] || []);
      if (num(c.balance) !== o.net) plan.push({ id: c.id, name: c.name, from: num(c.balance), to: o.net });
    });
    return plan;
  }

  return {
    integrityReport: integrityReport, balanceFixPlan: balanceFixPlan,
    isValidUpiId: isValidUpiId, buildUpiUrl: buildUpiUrl, isWellFormedToken: isWellFormedToken, portalStatus: portalStatus,
    SCHEMA_VERSION: SCHEMA_VERSION, ORDINARY_TYPES: ORDINARY_TYPES, LOAN_TYPES: LOAN_TYPES, ALL_TYPES: ALL_TYPES,
    monthsBetween: monthsBetween, calendarMonths: calendarMonths, unitDivisor: unitDivisor, calculateLoanState: calculateLoanState, compoundSchedule: compoundSchedule, FREQ_MONTHS: FREQ_MONTHS, ordinaryState: ordinaryState,
    customerState: customerState, portfolioTotals: portfolioTotals, messageKind: messageKind,
    publicSummary: publicSummary, checkInvariants: checkInvariants, isDeleted: isDeleted
  };
});
