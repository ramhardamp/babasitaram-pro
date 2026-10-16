/* ============================================================
   BSR PRO Digital Khata - Byaj Calculator screen (UI only)
   Engine: interest-calc.js (pure, Node-tested). Ye file sirf screen banati hai.
   Dashboard ke globals use hote hain: t(), toast(), loadShareCardImage(), roundRect(), userData, currentLang.
   ============================================================ */
(function () {
  'use strict';
  var IC = window.InterestCalc;
  if (!IC) return;
  var KEY = 'bsr_calc_v1';

  function T(en, hi) { return typeof t === 'function' ? t(en, hi) : hi; }
  function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addMonthsISO(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); var b = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    var t0 = new Date(b.getFullYear(), b.getMonth() + n, 1), last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate();
    var d = new Date(t0.getFullYear(), t0.getMonth(), Math.min(b.getDate(), last));
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function defaults() {
    return { mode: 'simple', solve: 'interest', principal: '', rate: '', rateUnit: 'month', interest: '', targetKind: 'interest',
      periodType: 'dates', startDate: todayISO(), endDate: '', years: '', months: '', days: '', freq: 'monthly',
      dayCount: 'cal30', rounding: 'paise', adv: false, sched: false, forecast: false };
  }
  function load() {
    var d = defaults();
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j && typeof j === 'object') Object.keys(d).forEach(function (k) { if (j[k] !== undefined && typeof j[k] === typeof d[k]) d[k] = j[k]; });
    } catch (_) {}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) d.startDate = todayISO();
    return d;
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }

  /* ---------- formatting ---------- */
  function dec() { return S.rounding === 'paise' ? 2 : 0; }
  function inr(x, d) { var n = Number(x) || 0, k = d == null ? dec() : d; return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: k, maximumFractionDigits: k }); }
  function pct(x) { return (Math.round((Number(x) || 0) * 10000) / 10000).toString() + '%'; }
  function plain(s) { return String(s == null ? '' : s).replace(/,/g, '').trim(); }
  function typing(v) { // 1234567.5 -> 12,34,567.5 (max 2 decimals, 12 digits)
    var raw = String(v || '').replace(/[^\d.]/g, ''), p = raw.split('.');
    var ip = p[0].replace(/^0+(?=\d)/, '').slice(0, 12), fp = p.length > 1 ? p.slice(1).join('').slice(0, 2) : null;
    var g = ip === '' ? '' : Number(ip).toLocaleString('en-IN');
    return fp === null ? g : (g || '0') + '.' + fp;
  }
  function fdate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function periodText(p) {
    if (!p) return '';
    var a = [];
    if (p.years) a.push(p.years + ' ' + T('yr', 'साल'));
    if (p.months) a.push(p.months + ' ' + T('mo', 'माह'));
    if (p.days) a.push(p.days + ' ' + T('days', 'दिन'));
    return a.length ? a.join(' ') : '0 ' + T('days', 'दिन');
  }

  /* ---------- labels ---------- */
  function modeLbl(m) { return m === 'compound' ? T('Compound interest', 'चक्रवृद्धि ब्याज') : T('Simple interest', 'साधारण ब्याज'); }
  function freqLbl(f) { return { daily: T('Daily', 'रोज़'), monthly: T('Monthly', 'हर महीने'), quarterly: T('Quarterly', 'हर तिमाही'), halfyearly: T('Half-yearly', 'हर 6 महीने'), yearly: T('Yearly', 'हर साल') }[f] || f; }
  function unitLbl(u) { return { month: T('per month', 'प्रति माह'), halfyear: T('per half-year', 'प्रति छमाही'), year: T('per year', 'प्रति वर्ष') }[u] || u; }
  function dcLbl(v) { return { cal30: T('30-day month (same as loan card)', '30 दिन का महीना (लोन कार्ड जैसा)'), actual365: T('Actual days ÷ 365', 'असली दिन ÷ 365'), actual360: T('Actual days ÷ 360', 'असली दिन ÷ 360') }[v]; }
  function rdLbl(v) { return { paise: T('To the paisa (₹0.01)', 'पैसे तक (₹0.01)'), rupee: T('Nearest rupee', 'नज़दीकी रुपया'), floor: T('Round down', 'नीचे का रुपया'), ceil: T('Round up', 'ऊपर का रुपया') }[v]; }
  function opts(list, cur, lblFn) { return list.map(function (v) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + E(lblFn(v)) + '</option>'; }).join(''); }

  /* ---------- screen markup ---------- */
  function chip(act, label, on) { return '<button type="button" class="calc-chip' + (on ? ' on' : '') + '" data-act="' + act + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + E(label) + '</button>'; }
  function build() {
    var solve = S.solve, h = '<div class="calc-wrap">';
    h += '<div class="calc-seg" role="group" aria-label="' + E(T('Interest type', 'ब्याज का प्रकार')) + '">' +
      '<button type="button" data-act="mode:simple" class="' + (S.mode === 'simple' ? 'on' : '') + '">' + E(modeLbl('simple')) + '</button>' +
      '<button type="button" data-act="mode:compound" class="' + (S.mode === 'compound' ? 'on' : '') + '">' + E(modeLbl('compound')) + '</button></div>';
    h += '<div class="calc-chips">' + chip('solve:interest', T('Find interest', 'ब्याज निकालें'), solve === 'interest') + chip('solve:rate', T('Find rate', 'दर निकालें'), solve === 'rate') +
      chip('solve:principal', T('Find principal', 'मूलधन निकालें'), solve === 'principal') + chip('solve:time', T('Find time', 'समय निकालें'), solve === 'time') + '</div>';
    h += '<div class="calc-card">';
    if (solve !== 'principal') {
      h += '<div class="calc-f"><label for="cPrincipal">' + E(T('Principal (₹)', 'मूलधन (₹)')) + '</label><div class="calc-money"><b>₹</b>' +
        '<input id="cPrincipal" class="calc-in" data-f="principal" inputmode="decimal" autocomplete="off" placeholder="0" value="' + E(S.principal) + '"></div></div>';
    }
    if (solve === 'rate' || solve === 'principal' || solve === 'time') {
      var kind = solve === 'principal' && S.targetKind === 'total';
      h += '<div class="calc-f"><label for="cInterest">' + E(kind ? T('Total amount (₹)', 'कुल राशि (₹)') : T('Interest amount (₹)', 'ब्याज की रकम (₹)')) + '</label><div class="calc-money"><b>₹</b>' +
        '<input id="cInterest" class="calc-in" data-f="interest" inputmode="decimal" autocomplete="off" placeholder="0" value="' + E(S.interest) + '"></div>';
      if (solve === 'principal') h += '<div class="calc-chips" style="padding:8px 0 0">' + chip('kind:interest', T('Interest given', 'ब्याज पता है'), !kind) + chip('kind:total', T('Total given', 'कुल राशि पता है'), kind) + '</div>';
      h += '</div>';
    }
    if (solve !== 'rate') {
      h += '<div class="calc-f"><label for="cRate">' + E(T('Interest rate (%)', 'ब्याज दर (%)')) + '</label><div class="calc-row2">' +
        '<input id="cRate" class="calc-in" data-f="rate" inputmode="decimal" autocomplete="off" placeholder="0" value="' + E(S.rate) + '">' +
        '<select class="calc-in" data-f="rateUnit" aria-label="' + E(T('Rate unit', 'दर की इकाई')) + '">' + opts(['month', 'halfyear', 'year'], S.rateUnit, unitLbl) + '</select></div></div>';
    } else {
      h += '<div class="calc-f"><label for="cUnit">' + E(T('Show rate as', 'दर किस रूप में')) + '</label><select id="cUnit" class="calc-in" data-f="rateUnit">' + opts(['month', 'halfyear', 'year'], S.rateUnit, unitLbl) + '</select></div>';
    }
    if (S.mode === 'compound') {
      h += '<div class="calc-f"><label for="cFreq">' + E(T('Interest added to principal', 'ब्याज मूलधन में कब जुड़े')) + '</label><select id="cFreq" class="calc-in" data-f="freq">' +
        opts(['daily', 'monthly', 'quarterly', 'halfyearly', 'yearly'], S.freq, freqLbl) + '</select></div>';
    }
    if (solve !== 'time') {
      h += '<div class="calc-lbl">' + E(T('Period', 'अवधि')) + '</div><div class="calc-chips" style="padding-top:0">' +
        chip('ptype:dates', T('Date to date', 'तारीख से तारीख'), S.periodType === 'dates') + chip('ptype:manual', T('Years / months / days', 'साल / महीने / दिन'), S.periodType === 'manual') + '</div>';
      if (S.periodType === 'dates') {
        h += '<div class="calc-row2"><div class="calc-f"><label for="cStart">' + E(T('From', 'शुरू')) + '</label><input id="cStart" type="date" class="calc-in" data-f="startDate" value="' + E(S.startDate) + '"></div>' +
          '<div class="calc-f"><label for="cEnd">' + E(T('To', 'खत्म')) + '</label><input id="cEnd" type="date" class="calc-in" data-f="endDate" value="' + E(S.endDate) + '"></div></div>' +
          '<div class="calc-chips" style="padding:0 0 4px">' + [3, 6, 12, 24].map(function (n) { return chip('quick:' + n, n < 12 ? n + ' ' + T('mo', 'माह') : (n / 12) + ' ' + T('yr', 'साल'), false); }).join('') + chip('quick:today', T('Till today', 'आज तक'), false) + '</div>';
      } else {
        h += '<div class="calc-row3">' + [['years', T('Years', 'साल')], ['months', T('Months', 'माह')], ['days', T('Days', 'दिन')]].map(function (a) {
          return '<div class="calc-f"><label for="c_' + a[0] + '">' + E(a[1]) + '</label><input id="c_' + a[0] + '" class="calc-in" data-f="' + a[0] + '" inputmode="numeric" autocomplete="off" placeholder="0" value="' + E(S[a[0]]) + '"></div>';
        }).join('') + '</div>';
      }
    }
    h += '<button type="button" class="calc-adv-btn" data-act="adv" aria-expanded="' + (S.adv ? 'true' : 'false') + '">' + (S.adv ? '▾ ' : '▸ ') + E(T('Calculation settings', 'हिसाब की शर्तें')) + '</button>';
    if (S.adv) {
      h += '<div class="calc-row2" style="margin-top:8px"><div class="calc-f"><label for="cDc">' + E(T('Counting days', 'दिन गिनने का तरीका')) + '</label><select id="cDc" class="calc-in" data-f="dayCount">' + opts(IC.DAY_COUNTS, S.dayCount, dcLbl) + '</select></div>' +
        '<div class="calc-f"><label for="cRd">' + E(T('Rounding', 'राउंडिंग')) + '</label><select id="cRd" class="calc-in" data-f="rounding">' + opts(IC.ROUNDINGS, S.rounding, rdLbl) + '</select></div></div>' +
        '<div class="calc-sub">' + E(T('Default matches the loan card exactly.', 'डिफ़ॉल्ट शर्तें आपके लोन कार्ड से बिल्कुल मेल खाती हैं।')) + '</div>';
    }
    h += '</div><div id="calcResult" aria-live="polite"></div>';
    h += '<button type="button" class="calc-reset" data-act="reset">↺ ' + E(T('Reset', 'रीसेट')) + '</button></div>';
    return h;
  }

  /* ---------- input -> engine ---------- */
  function inputObj() {
    return { mode: S.mode, principal: plain(S.principal), rate: S.rate, rateUnit: S.rateUnit, interest: plain(S.interest), periodType: S.periodType,
      startDate: S.startDate, endDate: S.endDate, years: S.years, months: S.months, days: S.days, compoundFreq: S.freq, dayCount: S.dayCount, rounding: S.rounding };
  }
  var LAST = null;
  function run() {
    var i = inputObj(), r;
    if (S.solve === 'rate') r = IC.solveRate(i);
    else if (S.solve === 'principal') r = IC.solvePrincipal(i, S.targetKind);
    else if (S.solve === 'time') r = IC.solveTime(i);
    else r = IC.calculate(i);
    r.solve = S.solve; return r;
  }
  function msg(e) { return currentLang === 'en' ? e.en : e.hi; }
  function methodText(r) { return r.mode === 'compound' ? modeLbl('compound') + ' · ' + freqLbl(r.compoundFreq) : modeLbl('simple'); }
  function rateText(r) { return pct(r.rate) + ' ' + unitLbl(r.rateUnit); }

  function schedHTML(r) {
    if (!r.schedule || !r.schedule.length) return '';
    var rows = r.schedule.map(function (x) {
      var lbl = x.date ? fdate(x.date) : x.dayEnd != null ? x.dayEnd + ' ' + T('days', 'दिन') : (x.monthEnd % 12 === 0 && x.monthEnd >= 12 ? (x.monthEnd / 12) + ' ' + T('yr', 'साल') : (Math.round(x.monthEnd * 100) / 100) + ' ' + T('mo', 'माह'));
      return '<tr' + (x.current ? ' class="cur"' : '') + '><td>' + E(lbl) + (x.current ? ' <i>' + E(T('latest', 'अंतिम')) + '</i>' : '') + '</td><td>' + inr(x.amount) + '</td><td>' + inr(x.running) + '</td><td>' + inr(x.balance) + '</td></tr>';
    }).join('');
    return '<button type="button" class="calc-adv-btn" data-act="sched" aria-expanded="' + (S.sched ? 'true' : 'false') + '">' + (S.sched ? '▾ ' : '▸ ') + E(T('Period-wise interest table', 'अवधि-वार ब्याज तालिका')) + '</button>' +
      (S.sched ? '<div class="calc-tblw"><table class="calc-tbl"><thead><tr><th>' + E(T('Till', 'तक')) + '</th><th>' + E(T('Interest', 'ब्याज')) + '</th><th>' + E(T('Total interest', 'कुल ब्याज')) + '</th><th>' + E(T('Total due', 'कुल रकम')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '');
  }
  function forecastHTML() {
    var label = E(T('Interest forecast (up to 50 years)', 'ब्याज पूर्वानुमान (50 साल तक)'));
    var button = '<button type="button" class="calc-adv-btn" data-act="forecast" aria-expanded="' + (S.forecast ? 'true' : 'false') + '">' + (S.forecast ? '▾ ' : '▸ ') + label + '</button>';
    if (!S.forecast) return button;
    var halfYearSteps = S.mode === 'compound' && S.freq === 'halfyearly';
    var step = halfYearSteps ? 0.5 : 1;
    var rows = [];
    // V18 forecast parity: project up to 50 years; half-yearly compound mode emits 6-month rows.
    for (var years = step; years <= 50 + 1e-9; years = Math.round((years + step) * 100) / 100) {
      var input = inputObj();
      input.periodType = 'manual'; input.years = years; input.months = 0; input.days = 0;
      var projected = IC.calculate(input);
      if (!projected || !projected.ok || !isFinite(projected.interest) || !isFinite(projected.total)) continue;
      var label = (years % 1 === 0 ? years.toFixed(0) : years.toFixed(1)) + ' ' + T('years', 'साल');
      rows.push('<tr><td>' + E(label) + '</td><td>' + inr(projected.interest) + '</td><td>' + inr(projected.total) + '</td></tr>');
    }
    return button + '<div class="calc-tblw"><table class="calc-tbl"><thead><tr><th>' + E(T('Period', 'अवधि')) + '</th><th>' + E(T('Interest', 'ब्याज')) + '</th><th>' + E(T('Total amount', 'कुल राशि')) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function dl(a, b, cls) { return '<div class="calc-dl' + (cls ? ' ' + cls : '') + '"><span>' + E(a) + '</span><b>' + E(b) + '</b></div>'; }

  function resultHTML(r) {
    if (!r.ok) {
      var need = r.errors.every(function (e) { return /_required$/.test(e.code); });
      if (need) return '<div class="calc-ph">' + E(T('Fill the details above — the result appears here instantly.', 'ऊपर की जानकारी भरते ही हिसाब यहीं दिख जाएगा।')) + '</div>';
      return '<div class="calc-err" role="alert">' + r.errors.filter(function (e) { return !/_required$/.test(e.code); }).map(function (e) { return '<div>⚠ ' + E(msg(e)) + '</div>'; }).join('') + '</div>';
    }
    var h = '<div class="calc-res">';
    if (r.solve === 'interest') {
      h += '<div class="calc-hero"><div class="calc-hero-l">' + E(T('Total amount (principal + interest)', 'कुल राशि (मूलधन + ब्याज)')) + '</div><div class="calc-hero-v">' + inr(r.total) + '</div></div>';
      if (r.endDate && r.endDate > todayISO()) h += '<div class="calc-note">📈 ' + E(T('Forecast through', 'इस तारीख तक अनुमान')) + ' ' + E(fdate(r.endDate)) + '</div>';
      h += '<div class="calc-two"><div><span>' + E(T('Principal', 'मूलधन')) + '</span><b>' + inr(r.principal) + '</b></div><div class="int"><span>' + E(T('Interest', 'ब्याज')) + '</span><b>' + inr(r.interest) + '</b></div></div>';
      h += '<div class="calc-card calc-dls">' +
        dl(T('Period', 'अवधि'), periodText(r.period) + (r.startDate ? ' (' + fdate(r.startDate) + ' → ' + fdate(r.endDate) + ')' : '')) +
        dl(T('Rate', 'दर'), rateText(r) + (r.rateUnit !== 'month' ? ' = ' + pct(r.monthlyRatePct) + ' ' + unitLbl('month') : '') + (r.rateUnit !== 'year' ? ' = ' + pct(r.yearlyNominalPct) + ' ' + unitLbl('year') : '')) +
        dl(T('Method', 'तरीका'), methodText(r)) +
        dl(T('Avg. interest / month', 'औसत ब्याज / माह'), inr(r.avgPerMonth)) +
        dl(T('Avg. interest / day', 'औसत ब्याज / दिन'), inr(r.perDay)) +
        (r.effectiveYearlyPct != null ? dl(T('Effective yearly rate', 'असल सालाना दर'), pct(Math.round(r.effectiveYearlyPct * 100) / 100)) : '') + '</div>';
      if (r.compare) {
        h += '<div class="calc-note">' + E(r.mode === 'simple' ? T('With compound interest the same amount would be ', 'चक्रवृद्धि लगाते तो ब्याज होता ') : T('With simple interest the same amount would be ', 'साधारण लगाते तो ब्याज होता ')) +
          '<b>' + inr(r.compare.interest) + '</b> (' + inr(Math.abs(r.compare.diff)) + ')</div>';
      }
      h += schedHTML(r);
      h += forecastHTML();
      h += '<div class="calc-actions"><button type="button" class="calc-act wa" data-act="share">💬 ' + E(T('WhatsApp', 'WhatsApp')) + '</button><button type="button" class="calc-act" data-act="img">🖼 ' + E(T('Photo', 'फोटो')) + '</button><button type="button" class="calc-act" data-act="copy">📋 ' + E(T('Copy', 'कॉपी')) + '</button></div>';
    } else if (r.solve === 'rate') {
      h += '<div class="calc-hero"><div class="calc-hero-l">' + E(T('Interest rate', 'ब्याज दर')) + '</div><div class="calc-hero-v">' + pct(r.rate) + ' <small>' + E(unitLbl(r.rateUnit)) + '</small></div></div>';
      h += '<div class="calc-card calc-dls">' + dl(unitLbl('month'), pct(r.ratePerMonth)) + dl(unitLbl('halfyear'), pct(r.ratePerHalfYear)) + dl(unitLbl('year'), pct(r.ratePerYear)) + '</div>';
      h += '<button type="button" class="calc-act full" data-act="apply">' + E(T('Use this rate → find interest', 'इस दर से ब्याज निकालें →')) + '</button>';
    } else if (r.solve === 'principal') {
      h += '<div class="calc-hero"><div class="calc-hero-l">' + E(T('Principal', 'मूलधन')) + '</div><div class="calc-hero-v">' + inr(r.principal, 2) + '</div></div>';
      h += '<button type="button" class="calc-act full" data-act="apply">' + E(T('Use this principal → find interest', 'इस मूलधन से ब्याज निकालें →')) + '</button>';
    } else if (r.solve === 'time') {
      h += '<div class="calc-hero"><div class="calc-hero-l">' + E(T('Time needed', 'ज़रूरी समय')) + '</div><div class="calc-hero-v">' + E(periodText({ years: r.years, months: r.monthsPart, days: r.days })) + '</div></div>';
      h += '<div class="calc-card calc-dls">' + dl(T('In months', 'कुल माह'), String(r.months)) + '</div>';
      h += '<button type="button" class="calc-act full" data-act="apply">' + E(T('Use this period → find interest', 'इस अवधि से ब्याज निकालें →')) + '</button>';
    }
    return h + '</div>';
  }
  function update() {
    var box = document.getElementById('calcResult'); if (!box) return;
    LAST = run(); var html = resultHTML(LAST);
    if (box._html !== html) { box.innerHTML = html; box._html = html; } /* same ho to DOM chhua hi nahi */
  }

  /* ---------- share ---------- */
  function shareText(r) {
    var shop = (typeof userData !== 'undefined' && userData && userData.shopName) ? userData.shopName : 'BSRPRO Digital Khata';
    var L = ['🧮 ' + T('Interest calculation', 'ब्याज का हिसाब'), '',
      T('Principal', 'मूलधन') + ': ' + inr(r.principal), T('Rate', 'दर') + ': ' + rateText(r), T('Method', 'तरीका') + ': ' + methodText(r),
      T('Period', 'अवधि') + ': ' + periodText(r.period) + (r.startDate ? ' (' + fdate(r.startDate) + ' → ' + fdate(r.endDate) + ')' : ''), '',
      T('Interest', 'ब्याज') + ': ' + inr(r.interest), T('Total amount', 'कुल राशि') + ': ' + inr(r.total), '', '— ' + shop];
    return L.join('\n');
  }
  function shareWhatsApp() { if (!LAST || !LAST.ok || LAST.solve !== 'interest') return; var txt = shareText(LAST);
    if (navigator.share) { navigator.share({ text: txt }).catch(function (e) { if (!e || e.name !== 'AbortError') window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); }); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); }
  function copyText() { if (!LAST || !LAST.ok) return; var txt = shareText(LAST);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('✅ ' + T('Copied', 'कॉपी हो गया'), 'success'); }, function () { toast(T('Could not copy', 'कॉपी नहीं हुआ'), 'error'); });
    else toast(T('Could not copy', 'कॉपी नहीं हुआ'), 'error'); }

  function buildImage(r) {
    var rows = [[T('Principal', 'मूलधन'), inr(r.principal)], [T('Rate', 'दर'), rateText(r)], [T('Method', 'तरीका'), methodText(r)],
      [T('Period', 'अवधि'), periodText(r.period)]];
    if (r.startDate) rows.push([T('Dates', 'तारीख'), fdate(r.startDate) + ' → ' + fdate(r.endDate)]);
    rows.push([T('Interest', 'ब्याज'), inr(r.interest)]);
    var W = 1080, H = 470 + rows.length * 92 + 190, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d'); if (!ctx) return Promise.reject(new Error('Canvas unavailable'));
    var bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#078b3d'); bg.addColorStop(1, '#13843c'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    var logoUrl = new URL('assets/guru-shree-logo.jpg?v=20260929-5', location.href).href;
    return (typeof loadShareCardImage === 'function' ? loadShareCardImage(logoUrl) : Promise.resolve(null)).then(function (logo) {
      var shop = (typeof userData !== 'undefined' && userData && userData.shopName) ? userData.shopName : 'BSR PRO';
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 54px Arial,sans-serif'; ctx.fillText('🧮 ' + T('Interest calculation', 'ब्याज का हिसाब'), 56, 112);
      ctx.font = '700 32px Arial,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillText(shop, 56, 164);
      roundRect(ctx, 28, 210, W - 56, H - 238, 36); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = '700 32px Arial,sans-serif'; ctx.fillText(T('Total amount (principal + interest)', 'कुल राशि (मूलधन + ब्याज)'), W / 2, 288);
      ctx.fillStyle = '#0f172a'; ctx.font = '900 96px Arial,sans-serif'; ctx.fillText(inr(r.total), W / 2, 394);
      var y = 470; rows.forEach(function (row, i) {
        ctx.fillStyle = i % 2 ? '#fff' : '#f8fafc'; ctx.fillRect(56, y - 54, W - 112, 92);
        ctx.textAlign = 'left'; ctx.fillStyle = '#64748b'; ctx.font = '700 32px Arial,sans-serif'; ctx.fillText(row[0], 84, y + 4);
        ctx.textAlign = 'right'; ctx.fillStyle = row[0] === T('Interest', 'ब्याज') ? '#b91c1c' : '#0f172a'; ctx.font = '800 34px Arial,sans-serif'; ctx.fillText(row[1], W - 84, y + 4); y += 92;
      });
      var fy = H - 96; if (logo) { ctx.save(); roundRect(ctx, 56, fy - 40, 70, 70, 16); ctx.clip(); ctx.drawImage(logo, 56, fy - 40, 70, 70); ctx.restore(); }
      ctx.textAlign = 'left'; ctx.fillStyle = '#078b3d'; ctx.font = '900 30px Arial,sans-serif'; ctx.fillText('BSR PRO', 142, fy - 6); ctx.font = '700 22px Arial,sans-serif'; ctx.fillText('DIGITAL KHATA APP', 142, fy + 22);
      return new Promise(function (resolve, reject) { canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Image creation failed')); }, 'image/png', .94); });
    });
  }
  function shareImage() {
    if (!LAST || !LAST.ok || LAST.solve !== 'interest') return;
    var r = LAST;
    buildImage(r).then(function (blob) {
      var file = new File([blob], 'bsr-pro-interest-calculation.png', { type: 'image/png' });
      var can = !!navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (can) return navigator.share({ files: [file], text: shareText(r), title: T('Interest calculation', 'ब्याज का हिसाब') });
      toast(T('Photo sharing is not available here — sharing text instead.', 'इस फ़ोन पर फोटो शेयर नहीं हो सकता — टेक्स्ट भेज रहे हैं।'), 'error'); shareWhatsApp();
    }).catch(function (e) { if (e && e.name === 'AbortError') return; console.error('Calc image share failed:', e); toast(T('Photo could not be created — sharing text instead.', 'फोटो नहीं बन सकी — टेक्स्ट भेज रहे हैं।'), 'error'); shareWhatsApp(); });
  }

  /* ---------- events ---------- */
  function apply() {
    var r = LAST; if (!r || !r.ok) return;
    if (r.solve === 'rate') S.rate = String(r.rate);
    else if (r.solve === 'principal') S.principal = typing(String(r.principal));
    else if (r.solve === 'time') { S.periodType = 'manual'; S.years = r.years ? String(r.years) : ''; S.months = r.monthsPart ? String(r.monthsPart) : ''; S.days = r.days ? String(r.days) : ''; }
    S.solve = 'interest'; save(); render();
    var el = document.getElementById('calcResult'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function onAct(a) {
    var p = a.split(':'), k = p[0], v = p[1];
    if (k === 'mode') { S.mode = v; save(); render(); }
    else if (k === 'solve') { S.solve = v; save(); render(); }
    else if (k === 'kind') { S.targetKind = v; save(); render(); }
    else if (k === 'ptype') { S.periodType = v; save(); render(); }
    else if (k === 'adv') { S.adv = !S.adv; save(); render(); }
    else if (k === 'sched') { S.sched = !S.sched; save(); update(); }
    else if (k === 'forecast') { S.forecast = !S.forecast; save(); update(); }
    else if (k === 'quick') { if (!S.startDate) S.startDate = todayISO(); S.endDate = v === 'today' ? todayISO() : addMonthsISO(S.startDate, +v); save(); render(); }
    else if (k === 'reset') { S = defaults(); save(); render(); }
    else if (k === 'share') shareWhatsApp();
    else if (k === 'img') shareImage();
    else if (k === 'copy') copyText();
    else if (k === 'apply') apply();
  }
  function bind(root) {
    if (root._calcBound) return; root._calcBound = true;
    root.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-act]'); if (b && root.contains(b)) onAct(b.getAttribute('data-act')); });
    function onField(e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return;
      var v = e.target.value;
      if (f === 'principal' || f === 'interest') { var nv = typing(v); if (nv !== v) { e.target.value = nv; } v = nv; }
      else if (f === 'rate') { v = v.replace(/[^\d.]/g, '').replace(/^(\d*\.\d*).*$/, '$1'); if (v !== e.target.value) e.target.value = v; }
      else if (f === 'years' || f === 'months' || f === 'days') { v = v.replace(/[^\d.]/g, ''); if (v !== e.target.value) e.target.value = v; }
      /* 'change' (blur) us value par jo 'input' me pehle hi aa chuki hai: dobara draw NAHI karte. Warna field chhodte hi result
         dobara ban jata hai aur neeche ke button (WhatsApp / table) ka tap kho jata hai. */
      if (e.type === 'change' && S[f] === v) return;
      S[f] = v; save();
      update();
    }
    root.addEventListener('input', onField); root.addEventListener('change', onField);
  }
  function render() {
    var el = document.getElementById('screen-calc'); if (!el) return;
    el.innerHTML = build(); bind(el); update();
  }
  window.renderCalc = render;
  window.__calcState = function () { return S; }; // tests/debug
})();
