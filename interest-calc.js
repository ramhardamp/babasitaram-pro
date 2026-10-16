/* ============================================================
   BSR PRO Digital Khata - Interest Calculator engine (pure functions)
   Koi UI / Firestore dependency nahi. Browser: window.InterestCalc, Node: require().
   Ledger.js ke loan engine se SAME numbers dene ke liye usi ke helpers (calendarMonths, compoundSchedule) use karta hai.

   Kya karta hai
   - Simple / Compound (daily, monthly, quarterly, half-yearly, yearly)
   - Dar: per month / half-year / year   (andar hamesha "per month" me badli jaati hai)
   - Avadhi: tareekh se tareekh YA saal-mahina-din
   - Din ginne ke tareeke: cal30 (default, loan card jaisa) | actual365 | actual360
   - Rounding: paise (default) | rupee | floor | ceil
   - Ulta hisaab: dar nikalo / muldhan nikalo / samay nikalo
   - Ek hi jagah validation (Hindi + English message)
   Rules: docs/INTEREST-ENGINE.md
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ledger.js'));
  else root.InterestCalc = factory(root.Ledger);
})(typeof self !== 'undefined' ? self : this, function (Ledger) {
  'use strict';
  var VERSION = '1.0';
  var LIMITS = { maxPrincipal: 1e11, maxRatePerMonth: 100, maxMonths: 1200 }; // 100 saal
  var FREQ_MONTHS = { daily: 0, monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };
  var DAY_COUNTS = ['cal30', 'actual365', 'actual360'];
  var ROUNDINGS = ['paise', 'rupee', 'floor', 'ceil'];
  var RATE_UNITS = { month: 1, halfyear: 6, year: 12 };
  var DAY_MS = 86400000;

  function num(v) { if (v === '' || v == null) return NaN; var n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function toDay(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (m) { var d0 = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d0.getTime()) ? null : d0; } }
    var d = new Date(v); return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addMonths(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
  }
  function applyRounding(x, mode) {
    if (mode === 'rupee') return Math.round(x);
    if (mode === 'floor') return Math.floor(x + 1e-9);
    if (mode === 'ceil') return Math.ceil(x - 1e-9);
    return r2(x);
  }
  function err(field, code, hi, en) { return { field: field, code: code, hi: hi, en: en }; }

  /* Do tareekhon ke beech: poore saal / mahine / bache din (anniversary se) + total din */
  function periodBetween(a, b) {
    var s = toDay(a), e = toDay(b);
    if (!s || !e || e < s) return { years: 0, months: 0, days: 0, totalDays: 0, totalMonthsInt: 0 };
    var full = 0; while (addMonths(s, full + 1) <= e && full < 12000) full++;
    var rem = Math.round((e - addMonths(s, full)) / DAY_MS);
    return { years: Math.floor(full / 12), months: full % 12, days: rem, totalDays: Math.round((e - s) / DAY_MS), totalMonthsInt: full };
  }
  function normalizeManual(y, m, d) { // din >= 30 ho to mahine me jod do (sirf dikhane ke liye)
    var tm = y * 12 + m + Math.floor(d / 30), dd = d - Math.floor(d / 30) * 30;
    return { years: Math.floor(tm / 12), months: tm % 12, days: Math.round(dd * 100) / 100 };
  }

  /* ---------- input ko saaf karo + validate ---------- */
  function normalize(input, opts) {
    var o = opts || {}, solve = o.solveFor || 'interest';
    var errors = [], x = input || {};
    var mode = x.mode === 'compound' ? 'compound' : 'simple';
    var rateUnit = RATE_UNITS[x.rateUnit] ? x.rateUnit : 'month';
    var freq = FREQ_MONTHS[x.compoundFreq] !== undefined ? x.compoundFreq : 'yearly';
    var dayCount = DAY_COUNTS.indexOf(x.dayCount) >= 0 ? x.dayCount : 'cal30';
    var rounding = ROUNDINGS.indexOf(x.rounding) >= 0 ? x.rounding : 'paise';
    var periodType = x.periodType === 'manual' ? 'manual' : 'dates';
    var P = num(x.principal), rate = num(x.rate), tgt = num(x.interest);
    var out = { mode: mode, rateUnit: rateUnit, freq: freq, dayCount: dayCount, rounding: rounding, periodType: periodType,
      principal: P, rate: rate, targetInterest: tgt, solveFor: solve };

    if (solve !== 'principal') {
      if (isNaN(P)) errors.push(err('principal', 'principal_required', 'मूलधन भरें', 'Enter principal'));
      else if (P <= 0) errors.push(err('principal', 'principal_positive', 'मूलधन 0 से ज़्यादा होना चाहिए', 'Principal must be greater than 0'));
      else if (P > LIMITS.maxPrincipal) errors.push(err('principal', 'principal_max', 'मूलधन बहुत बड़ा है', 'Principal is too large'));
    }
    if (solve !== 'rate') {
      if (isNaN(rate)) errors.push(err('rate', 'rate_required', 'ब्याज दर भरें', 'Enter interest rate'));
      else if (rate < 0) errors.push(err('rate', 'rate_negative', 'दर 0 से कम नहीं हो सकती', 'Rate cannot be negative'));
      else if (rate / RATE_UNITS[rateUnit] > LIMITS.maxRatePerMonth) errors.push(err('rate', 'rate_max', 'दर बहुत ज़्यादा है', 'Rate is too high'));
    }
    if (solve === 'rate' || solve === 'principal' || solve === 'time') {
      if (isNaN(tgt)) errors.push(err('interest', 'interest_required', solve === 'principal' && o.targetKind === 'total' ? 'कुल राशि भरें' : 'ब्याज की रकम भरें', 'Enter interest amount'));
      else if (tgt <= 0) errors.push(err('interest', 'interest_positive', 'रकम 0 से ज़्यादा होनी चाहिए', 'Amount must be greater than 0'));
    }

    if (solve === 'time') { out.period = null; return finish(); }
    if (periodType === 'manual') {
      var yy = num(x.years), mm = num(x.months), dd = num(x.days);
      yy = isNaN(yy) ? 0 : yy; mm = isNaN(mm) ? 0 : mm; dd = isNaN(dd) ? 0 : dd;
      if (yy < 0 || mm < 0 || dd < 0) errors.push(err('period', 'period_negative', 'अवधि 0 से कम नहीं हो सकती', 'Period cannot be negative'));
      var tm = yy * 12 + mm + dd / 30;
      if (tm <= 0 && !errors.length) errors.push(err('period', 'period_required', 'अवधि भरें (साल / महीने / दिन)', 'Enter period (years / months / days)'));
      else if (tm > LIMITS.maxMonths) errors.push(err('period', 'period_max', 'अवधि 100 साल से ज़्यादा नहीं हो सकती', 'Period cannot exceed 100 years'));
      out.totalMonths = tm; out.period = normalizeManual(yy, mm, dd); out.period.totalDays = Math.round(tm * 30);
    } else {
      var s = toDay(x.startDate), e = toDay(x.endDate);
      if (!s) errors.push(err('startDate', 'start_required', 'शुरू की तारीख चुनें', 'Pick start date'));
      if (!e) errors.push(err('endDate', 'end_required', 'खत्म होने की तारीख चुनें', 'Pick end date'));
      if (s && e) {
        if (e < s) errors.push(err('endDate', 'end_before_start', 'खत्म की तारीख शुरू से पहले नहीं हो सकती', 'End date cannot be before start date'));
        else if ((e - s) / DAY_MS > LIMITS.maxMonths * 31) errors.push(err('endDate', 'period_max', 'अवधि 100 साल से ज़्यादा नहीं हो सकती', 'Period cannot exceed 100 years'));
      }
      out.start = s; out.end = e;
      if (s && e && e >= s) { out.period = periodBetween(s, e); }
    }
    return finish();
    function finish() { out.errors = errors; out.ok = errors.length === 0; return out; }
  }

  /* ---------- samay (mahine) nikalna ---------- */
  function monthsOf(n) {
    if (n.periodType === 'manual') return n.totalMonths;
    if (!n.start || !n.end || n.end <= n.start) return 0;
    var days = Math.round((n.end - n.start) / DAY_MS);
    if (n.dayCount === 'actual365') return days / 365 * 12;
    if (n.dayCount === 'actual360') return days / 360 * 12;
    return Ledger.calendarMonths(n.start, n.end); // cal30: loan card (simple) jaisa
  }

  /* ---------- closed form compound (manual avadhi / actual day-count) ---------- */
  function closedCompound(P, rm, freq, totalMonths, dayCount, totalDaysExact) {
    var L = FREQ_MONTHS[freq], rows = [], total, label;
    if (L === 0) { // daily
      var dr = dayCount === 'actual365' ? rm * 12 / 365 : dayCount === 'actual360' ? rm / 30 : rm / 30; // cal30 & actual360: rm/30
      var D = totalDaysExact != null ? totalDaysExact : Math.round(totalMonths * 30);
      total = P * Math.pow(1 + dr, D) - P;
      if (D <= 36600) { var step = 30, shown = 0;
        for (var d = step; d < D && shown < 400; d += step, shown++) { var run = P * Math.pow(1 + dr, d) - P; rows.push({ dayEnd: d, running: run }); }
        rows.push({ dayEnd: D, running: total, current: true }); }
      return { interest: total, rows: rows, unit: 'day' };
    }
    var g = 1 + rm * L, k = Math.floor(totalMonths / L + 1e-9), rem = totalMonths - k * L;
    if (k > 4000) return { interest: NaN, rows: [], unit: 'month' };
    var base = P, run2 = 0;
    for (var i = 1; i <= k; i++) { var add = base * rm * L; run2 += add; base += add; rows.push({ monthEnd: i * L, running: run2 }); }
    if (rem > 1e-9) { var part = base * rm * rem; run2 += part; rows.push({ monthEnd: totalMonths, running: run2, current: true }); }
    else if (rows.length) rows[rows.length - 1].current = true;
    return { interest: run2, rows: rows, unit: 'month' };
  }

  /* ---------- interest (unrounded) + schedule ---------- */
  function computeExact(n, principal, rm) {
    var P = principal, months = monthsOf(n), res = { months: months, rows: [] };
    if (!(months > 0) || P <= 0 || rm <= 0) { res.interest = 0; return res; }
    if (n.mode === 'simple') {
      res.interest = P * rm * months;
      var rows = [], per = months <= 36 ? 1 : 12, cap = 0;
      for (var m = per; m < months + per - 1e-9 && rows.length < 400; m += per) {
        var upto = Math.min(m, months), run = P * rm * upto;
        rows.push({ monthEnd: upto, running: run, amount: run - cap, current: upto >= months - 1e-9 }); cap = run;
        if (upto >= months - 1e-9) break;
      }
      res.rows = rows; return res;
    }
    // compound
    if (n.periodType === 'dates' && n.dayCount === 'cal30') {
      var loan = { principal: P, rate: rm * 100, rateUnit: 'month', startDate: iso(n.start), interestType: 'compound', compoundFreq: n.freq };
      var cs = Ledger.compoundSchedule(loan, [], n.end);
      res.interest = cs.accrued; res.months = cs.months;
      res.rows = cs.rows.map(function (r) { return { date: iso(toDay(r.date)), running: r.running, amount: r.amount, current: !!r.current }; });
      return res;
    }
    var daysExact = n.periodType === 'dates' ? Math.round((n.end - n.start) / DAY_MS) : null;
    var cc = closedCompound(P, rm, n.freq, months, n.dayCount, daysExact);
    res.interest = cc.interest; var prev = 0;
    res.rows = cc.rows.map(function (r) { var o = { running: r.running, amount: r.running - prev, current: !!r.current }; prev = r.running;
      if (r.monthEnd != null) o.monthEnd = r.monthEnd; if (r.dayEnd != null) o.dayEnd = r.dayEnd; return o; });
    return res;
  }

  function monthlyRate(n) { return n.rate / 100 / RATE_UNITS[n.rateUnit]; }

  /* ---------- MAIN: calculate(input) ---------- */
  function calculate(input) {
    var n = normalize(input, { solveFor: 'interest' });
    if (!n.ok) return { ok: false, errors: n.errors };
    var rm = monthlyRate(n), ex = computeExact(n, n.principal, rm);
    if (!isFinite(ex.interest)) return { ok: false, errors: [err('principal', 'overflow', 'रकम बहुत बड़ी हो गई — अवधि या दर कम करें', 'Result too large — reduce period or rate')] };
    var interest = applyRounding(ex.interest, n.rounding), total = r2(n.principal + interest);
    var P = n.principal, months = ex.months;
    var res = {
      ok: true, version: VERSION, mode: n.mode, principal: P, interest: interest, total: total, exactInterest: ex.interest,
      months: months, period: n.period, periodType: n.periodType, dayCount: n.dayCount, rounding: n.rounding,
      rateUnit: n.rateUnit, rate: n.rate, compoundFreq: n.mode === 'compound' ? n.freq : null,
      monthlyRatePct: rm * 100, yearlyNominalPct: rm * 1200,
      avgPerMonth: months > 0 ? interest / months : 0, perDay: months > 0 ? interest / (months * 30) : 0,
      effectiveYearlyPct: months >= 1 && P > 0 ? (Math.pow((P + ex.interest) / P, 12 / months) - 1) * 100 : null,
      schedule: ex.rows.map(function (r) { var o = { running: r2(r.running), amount: r2(r.amount), balance: r2(P + r.running), current: !!r.current };
        if (r.date) o.date = r.date; if (r.monthEnd != null) o.monthEnd = Math.round(r.monthEnd * 100) / 100; if (r.dayEnd != null) o.dayEnd = r.dayEnd; return o; })
    };
    if (n.periodType === 'dates') { res.startDate = iso(n.start); res.endDate = iso(n.end); }
    // Doosra tareeka (compare): simple <-> compound
    var other = Object.assign({}, input, { mode: n.mode === 'simple' ? 'compound' : 'simple' });
    var n2 = normalize(other, { solveFor: 'interest' });
    if (n2.ok) { var ex2 = computeExact(n2, P, monthlyRate(n2));
      if (isFinite(ex2.interest)) { var i2 = applyRounding(ex2.interest, n.rounding); res.compare = { mode: n2.mode, interest: i2, diff: r2(i2 - interest) }; } }
    return res;
  }

  /* ---------- ULTA HISAAB ---------- */
  function bisect(f, lo, hi, target) { // f increasing
    var flo = f(lo), fhi = f(hi);
    if (!(fhi >= target)) return NaN;
    for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (f(mid) < target) lo = mid; else hi = mid; if (hi - lo < 1e-12) break; }
    return (lo + hi) / 2;
  }
  function solveRate(input) {
    var n = normalize(input, { solveFor: 'rate' });
    if (!n.ok) return { ok: false, errors: n.errors };
    var P = n.principal, tgt = n.targetInterest;
    var months = monthsOf(n);
    if (!(months > 0)) return { ok: false, errors: [err('period', 'period_required', 'अवधि भरें', 'Enter period')] };
    var rm;
    if (n.mode === 'simple') rm = tgt / (P * months);
    else {
      var f = function (r) { var nn = Object.assign({}, n, { rate: r * 100, rateUnit: 'month' }); var e = computeExact(nn, P, r).interest; return isFinite(e) ? e : Infinity; };
      rm = bisect(f, 0, LIMITS.maxRatePerMonth / 100, tgt);
    }
    if (!isFinite(rm) || rm <= 0 || rm * 100 > LIMITS.maxRatePerMonth) return { ok: false, errors: [err('interest', 'unreachable', 'इस ब्याज के लिए दर निकल नहीं सकी — रकम जाँचें', 'Could not find a rate for this interest — check amounts')] };
    var ratePerMonth = rm * 100;
    return { ok: true, solveFor: 'rate', ratePerMonth: Math.round(ratePerMonth * 10000) / 10000,
      ratePerHalfYear: Math.round(ratePerMonth * 6 * 10000) / 10000, ratePerYear: Math.round(ratePerMonth * 12 * 10000) / 10000,
      rate: Math.round(ratePerMonth * RATE_UNITS[n.rateUnit] * 10000) / 10000, rateUnit: n.rateUnit, months: months };
  }
  function solvePrincipal(input, targetKind) { // targetKind: 'interest' (default) | 'total'
    var kind = targetKind === 'total' ? 'total' : 'interest';
    var n = normalize(input, { solveFor: 'principal', targetKind: kind });
    if (!n.ok) return { ok: false, errors: n.errors };
    var rm = monthlyRate(n), unit = computeExact(n, 1, rm).interest; // P=1 par byaj (byaj P ke seedhe anupaat me hai)
    if (!(unit > 0) || !isFinite(unit)) return { ok: false, errors: [err('rate', 'zero_interest', 'इस दर/अवधि पर ब्याज 0 है — दर या अवधि बढ़ाएँ', 'Interest is 0 for this rate/period')] };
    var P = kind === 'total' ? n.targetInterest / (1 + unit) : n.targetInterest / unit;
    if (!isFinite(P) || P > LIMITS.maxPrincipal) return { ok: false, errors: [err('principal', 'principal_max', 'मूलधन बहुत बड़ा निकला', 'Principal came out too large')] };
    return { ok: true, solveFor: 'principal', principal: r2(P), targetKind: kind };
  }
  function solveTime(input) {
    var n = normalize(input, { solveFor: 'time' });
    if (!n.ok) return { ok: false, errors: n.errors };
    var P = n.principal, rm = monthlyRate(n), tgt = n.targetInterest;
    if (!(rm > 0)) return { ok: false, errors: [err('rate', 'rate_required', 'ब्याज दर 0 से ज़्यादा भरें', 'Enter rate above 0')] };
    var months;
    if (n.mode === 'simple') months = tgt / (P * rm);
    else {
      var man = Object.assign({}, n, { periodType: 'manual', dayCount: 'cal30' });
      var f = function (m) { man.totalMonths = m; var e = computeExact(man, P, rm).interest; return isFinite(e) ? e : Infinity; };
      months = bisect(f, 0, LIMITS.maxMonths, tgt);
    }
    if (!isFinite(months) || months <= 0 || months > LIMITS.maxMonths) return { ok: false, errors: [err('interest', 'unreachable', 'इस ब्याज के लिए समय निकल नहीं सका (100 साल से ज़्यादा)', 'Could not find a period (over 100 years)')] };
    var whole = Math.floor(months + 1e-9), days = Math.round((months - whole) * 30);
    if (days >= 30) { whole += 1; days = 0; }
    return { ok: true, solveFor: 'time', months: Math.round(months * 10000) / 10000, years: Math.floor(whole / 12), monthsPart: whole % 12, days: days };
  }

  return {
    VERSION: VERSION, LIMITS: LIMITS, FREQ_MONTHS: FREQ_MONTHS, DAY_COUNTS: DAY_COUNTS, ROUNDINGS: ROUNDINGS, RATE_UNITS: RATE_UNITS,
    calculate: calculate, solveRate: solveRate, solvePrincipal: solvePrincipal, solveTime: solveTime,
    periodBetween: periodBetween, normalize: normalize, applyRounding: applyRounding
  };
});
