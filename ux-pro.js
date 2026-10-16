/* BSRPRO Digital Khata - UX-PRO v1 (Phase 1-3). Pure helpers (Node-testable) + browser wiring.
   Rule: sirf additive. Existing ledger/Firestore logic ko nahi chhuta; sab kuch existing globals (customers, t, esc, fmt, showModal ...) ke upar chalta hai. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UxPro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var RECEIVED = ['jama', 'loan_repay', 'interest_paid'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var live = function (tx) { return tx && tx.status !== 'deleted' && !tx.deletedAt; };
  var amountOf = function (tx) { return tx.type === 'byaj_loan' ? (Number(tx.principal || tx.amount) || 0) : (Number(tx.amount) || 0); };

  /* ---------- PURE HELPERS ---------- */
  function periodPreset(name, now) {
    now = now || new Date(); var to = ymd(now);
    if (name === 'month') return { from: to.slice(0, 8) + '01', to: to };
    if (name === 'last30') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to: to };
    if (name === 'lastmonth') return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    return { from: '', to: '' }; /* all */
  }
  function validRange(r) {
    if (!r || (!r.from && !r.to)) return true;
    var ok = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00').getTime()); };
    return ok(r.from) && ok(r.to) && r.from <= r.to;
  }
  /* dayOf(tx) -> 'YYYY-MM-DD'. Payments = jama/loan_repay/interest_paid, Credits = udhaar/byaj_loan */
  function periodTotals(txns, dayOf, range) {
    var o = { payments: 0, credits: 0, paymentCount: 0, creditCount: 0 };
    (txns || []).forEach(function (tx) {
      if (!live(tx)) return; var d = dayOf(tx); if (!d) return;
      if (range && range.from && (d < range.from || d > range.to)) return;
      var a = amountOf(tx);
      if (RECEIVED.indexOf(tx.type) >= 0) { o.payments += a; o.paymentCount++; }
      else if (tx.type === 'udhaar' || tx.type === 'byaj_loan') { o.credits += a; o.creditCount++; }
    });
    return o;
  }
  /* Last 7 din ki vasooli vs pichhle 7 din */
  function collectionTrend(txns, dayOf, now) {
    now = now || new Date();
    var key = function (back) { return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)); };
    var cur = { from: key(6), to: key(0) }, prev = { from: key(13), to: key(7) };
    var sum = function (r) { var x = 0; (txns || []).forEach(function (tx) { if (!live(tx) || RECEIVED.indexOf(tx.type) < 0) return; var d = dayOf(tx); if (d && d >= r.from && d <= r.to) x += amountOf(tx); }); return x; };
    var c = sum(cur), p = sum(prev);
    return { current: c, previous: p, pct: p > 0 ? Math.round((c - p) / p * 100) : null };
  }
  function backupStale(lastMs, nowMs, days) {
    var last = Number(lastMs) || 0; return !last || (nowMs - last) > (days || 7) * 86400000;
  }
  var api = { periodPreset: periodPreset, validRange: validRange, periodTotals: periodTotals, collectionTrend: collectionTrend, backupStale: backupStale };
  if (typeof document === 'undefined') return api;

  /* ---------- BROWSER WIRING ---------- */
  var THEME_KEY = 'bsp_theme', BACKUP_KEY = 'bsp_lastBackup';
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var T = function (en, hi) { return typeof t === 'function' ? t(en, hi) : en; };
  var E = function (s) { return typeof esc === 'function' ? esc(s) : String(s); };
  var dayOf = function (tx) {
    var d = [tx.dateTime, tx.transactionAt, tx.date, tx.startDate].map(toDateObject).find(function (x) { return x && !isNaN(x.getTime()); });
    return d ? localDateInputValue(d) : '';
  };

  /* Phase 2: Dark mode (user choice: light | dark | system) */
  function applyTheme() { if (window.BspTheme) BspTheme.apply(false); } // theme.js hi asli logic hai (har page par ek)
  api.setTheme = function (m) { if (window.BspTheme) BspTheme.set(m); };

  /* Phase 2: Statement sheet (prompt() ki jagah) */
  var origStatement = window.exportCustomerStatementPdf;
  function openStatementSheet(id) {
    var c = customers.find(function (x) { return String(x.id) === String(id); }); if (!c) return;
    var txns = getPartyTransactions(id), cur = 'month';
    var chips = [['month', T('This month', 'इस महीने')], ['last30', T('Last 30 days', 'पिछले 30 दिन')], ['lastmonth', T('Last month', 'पिछला महीना')], ['all', T('All', 'पूरा हिसाब')]];
    showModal('<div class="modal-handle"></div><div class="modal-title">📄 ' + T('Account Statement', 'स्टेटमेंट') + '</div>' +
      '<div style="text-align:center;font-weight:800;margin:-8px 0 10px">' + E(c.name) + '</div>' +
      '<div class="ux-chips">' + chips.map(function (x) { return '<button type="button" class="ux-chip" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="ux-dates"><div class="input-group"><label class="input-label">' + T('From', 'से') + '</label><input id="uxFrom" class="text-input" type="date"></div>' +
      '<div class="input-group"><label class="input-label">' + T('To', 'तक') + '</label><input id="uxTo" class="text-input" type="date"></div></div>' +
      '<div class="ux-sum"><div class="cr"><small>' + T('Credit given', 'पेमेंट दिया') + '</small><b id="uxCr">₹0</b><small id="uxCrN"></small></div><div class="ux-sep"></div>' +
      '<div class="pay"><small>' + T('Payments received', 'जमा मिला') + '</small><b id="uxPay">₹0</b><small id="uxPayN"></small></div></div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" type="button" onclick="closeModal()">' + T('Close', 'बंद करें') + '</button>' +
      '<button class="btn btn-primary" type="button" id="uxDl">⬇ ' + T('Download PDF', 'PDF डाउनलोड') + '</button></div>');
    var from = document.getElementById('uxFrom'), to = document.getElementById('uxTo');
    function range() { return { from: from.value, to: to.value }; }
    function refresh() {
      var r = range(), ok = validRange(r) && (!!r.from === !!r.to);
      var s = periodTotals(txns, dayOf, ok ? r : { from: '', to: '' });
      document.getElementById('uxCr').textContent = fmt(s.credits); document.getElementById('uxPay').textContent = fmt(s.payments);
      document.getElementById('uxCrN').textContent = s.creditCount + ' ' + T('entries', 'एंट्री'); document.getElementById('uxPayN').textContent = s.paymentCount + ' ' + T('entries', 'एंट्री');
      document.getElementById('uxDl').disabled = !ok;
    }
    function pick(name) {
      cur = name; var r = periodPreset(name); from.value = r.from; to.value = r.to;
      document.querySelectorAll('.ux-chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-p') === name); }); refresh();
    }
    document.querySelectorAll('.ux-chip').forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-p')); }); });
    [from, to].forEach(function (i) { i.addEventListener('change', function () { document.querySelectorAll('.ux-chip').forEach(function (b) { b.classList.remove('on'); }); refresh(); }); });
    document.getElementById('uxDl').addEventListener('click', function () {
      var r = range(); if (!validRange(r) || (!!r.from !== !!r.to)) { toast(T('Enter valid dates', 'सही तारीखें डालें'), 'error'); return; }
      closeModal(); origStatement(id, r);
    });
    pick('month');
  }
  if (typeof origStatement === 'function') window.exportCustomerStatementPdf = function (id, range) { return range !== undefined ? origStatement(id, range) : openStatementSheet(id); };

  /* Phase 3: Smart insights (Reports) - sirf existing data se, kuch store nahi hota */
  function insightsHtml() {
    var rows = [], items = [];
    try { rows = getRecoveryRows(); } catch (e) {}
    var tr = collectionTrend(transactions, dayOf, new Date());
    var pct = tr.pct == null ? '' : ' <span class="' + (tr.pct >= 0 ? 'ux-up' : 'ux-down') + '">(' + (tr.pct >= 0 ? '▲' : '▼') + Math.abs(tr.pct) + '% ' + T('vs last week', 'पिछले हफ्ते से') + ')</span>';
    items.push(['💰', T('Collected in last 7 days: ', 'पिछले 7 दिन में वसूली: ') + '<b>' + fmt(tr.current) + '</b>' + pct]);
    var late = rows.filter(function (r) { return r.bucket === 'late' || r.bucket === 'critical'; });
    if (late.length) items.push(['⏰', '<b>' + late.length + '</b> ' + T('customers overdue 30+ days: ', 'ग्राहकों का 30+ दिन से बकाया: ') + '<b>' + fmt(late.reduce(function (a, r) { return a + (Number(r.due) || 0); }, 0)) + '</b>']);
    var worst = rows.slice().sort(function (a, b) { return (b.daysOverdue || 0) - (a.daysOverdue || 0); })[0];
    if (worst && worst.daysOverdue > 7) items.push(['🐢', T('Longest pending: ', 'सबसे ज़्यादा लेट: ') + '<b>' + E(worst.name) + '</b> — ' + worst.daysOverdue + ' ' + T('days', 'दिन') + ' (' + fmt(worst.due) + ')']);
    if (items.length === 1 && !tr.current && !tr.previous) items.push(['✅', T('No pending recovery — all clear', 'कोई वसूली बाकी नहीं')]);
    return '<h3>💡 ' + T('Smart insights', 'स्मार्ट इनसाइट्स') + '</h3>' + items.map(function (x) { return '<div class="ux-ins"><i>' + x[0] + '</i><div>' + x[1] + '</div></div>'; }).join('');
  }
  var origReports = window.renderReports;
  if (typeof origReports === 'function') window.renderReports = function () {
    var r = origReports.apply(this, arguments);
    try {
      var host = document.querySelector('.report-wrap'), card = document.getElementById('uxInsights');
      if (host) { if (!card) { card = document.createElement('div'); card.id = 'uxInsights'; card.className = 'ux-insights'; var first = host.querySelector('.stat-grid'); host.insertBefore(card, first ? first.nextSibling : host.firstChild); } card.innerHTML = insightsHtml(); }
    } catch (e) { console.warn('insights', e); }
    return r;
  };

  /* Phase 1: Backup yaad dilana - slim banner (toast jaisa screen nahi dhakta); X dabane par aaj ke liye band */
  function backupBanner() {
    var host = document.getElementById('screen-dashboard'), el = document.getElementById('uxBackupBanner');
    var today = ymd(new Date()), need = customers.length && lsGet('bsp_backupNudgeDay') !== today && backupStale(lsGet(BACKUP_KEY), Date.now(), 7);
    if (!host || !need) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'uxBackupBanner'; el.className = 'recovery-banner'; el.setAttribute('role', 'button'); el.tabIndex = 0;
    el.style.cssText = 'border-color:rgba(30,142,62,.45);background:rgba(30,142,62,.08)';
    el.innerHTML = '<span>💾 ' + T('Backup is 7+ days old', 'Backup को 7+ दिन हो गए') + '<small>' + T('Tap to open Data & Backup', 'Data & Backup खोलने के लिए दबाएं') + '</small></span><span class="ux-x" aria-label="Dismiss" style="font-size:20px;padding:0 4px">✕</span>';
    el.addEventListener('click', function (e) {
      if (e.target.closest('.ux-x')) { lsSet('bsp_backupNudgeDay', today); el.remove(); return; }
      switchTab('settings'); setTimeout(function () { openSettingsPanel('data'); }, 150);
    });
    var anchor = host.querySelector('.customer-search-wrap'); host.insertBefore(el, anchor);
  }
  var origDash = window.renderDashboard;
  if (typeof origDash === 'function') window.renderDashboard = function () {
    var r = origDash.apply(this, arguments);
    try { backupBanner(); } catch (e) { console.warn('backupBanner', e); }
    try { ensureListControls(); } catch (e) { console.warn('listControls', e); }
    return r;
  };

  /* Settings: "Theme & App Health" section (existing android-setting classes ke saath) */
  function injectSettings() {
    if (document.querySelector('[data-settings-section="ux"]')) return;
    var after = document.querySelector('.android-setting-section[data-settings-section="data"]'); if (!after) return;
    var sec = document.createElement('section'); sec.className = 'android-setting-section'; sec.setAttribute('data-settings-section', 'ux');
    sec.innerHTML = '<button class="android-setting-row" type="button" onclick="openSettingsPanel(\'ux\')"><span class="android-setting-icon">🎨</span>' +
      '<span class="android-setting-main"><b>Theme &amp; App Health</b><small>Dark mode, error log, backup status</small></span><span class="android-setting-chevron">›</span></button>' +
      '<div class="android-setting-content">' +
      '<div class="android-export-title">THEME <span id="uxThemeState" data-theme-state style="float:right;text-transform:none"></span></div>' +
      '<button class="android-sub-row action" type="button" data-theme-set="light" onclick="UxPro.setTheme(\'light\')"><span>☀️ <b>Light</b><small>Default</small></span></button>' +
      '<button class="android-sub-row action" type="button" data-theme-set="dark" onclick="UxPro.setTheme(\'dark\')"><span>🌙 <b>Dark</b><small>Raat / kam roshni ke liye</small></span></button>' +
      '<button class="android-sub-row action" type="button" data-theme-set="system" onclick="UxPro.setTheme(\'system\')"><span>📱 <b>System</b><small>Phone ki setting follow kare</small></span></button>' +
      '<div class="android-export-title">APP HEALTH</div>' +
      '<button class="android-sub-row action" type="button" onclick="UxPro.showErrorLog()"><span>🧰 <b>Error log</b><small>Phone par saved errors — sirf yahin rehte hain</small></span></button>' +
      '<div class="android-setting-note" id="uxBackupState"></div></div>';
    after.parentNode.insertBefore(sec, after.nextSibling);
    applyTheme();
    var b = Number(lsGet(BACKUP_KEY)) || 0;
    var st = document.getElementById('uxBackupState');
    if (st) st.textContent = b ? ('Last backup: ' + Math.floor((Date.now() - b) / 86400000) + ' din pehle') : 'Abhi tak is phone se backup export nahi hua.';
  }
  api.showErrorLog = function () {
    var txt = window.ErrLog ? window.ErrLog.text() : 'ErrLog unavailable';
    showModal('<div class="modal-handle"></div><div class="modal-title">🧰 Error log</div><div class="ux-log" id="uxLogBox"></div>' +
      '<div class="modal-actions"><button class="btn btn-secondary" type="button" id="uxLogClear">Clear</button><button class="btn btn-primary" type="button" id="uxLogCopy">Copy</button></div>');
    document.getElementById('uxLogBox').textContent = txt;
    document.getElementById('uxLogCopy').onclick = function () { try { navigator.clipboard.writeText(txt); toast('Copied', 'success'); } catch (e) { toast('Copy failed', 'error'); } };
    document.getElementById('uxLogClear').onclick = function () { window.ErrLog && window.ErrLog.clear(); document.getElementById('uxLogBox').textContent = 'No errors logged'; };
  };

  /* ===== Byaj (interest) UI: Simple/Compound chips + accrual sheet ===== */
  var FREQ_TXT = { daily: ['daily', 'रोज़'], monthly: ['monthly', 'मासिक'], quarterly: ['quarterly', 'तिमाही'], halfyearly: ['half-yearly', 'छमाही'], yearly: ['yearly', 'सालाना'] };
  function freqNote() {
    var f = (document.getElementById('mFreq') || {}).value || 'monthly', n = document.getElementById('mFreqNote');
    if (n) n.textContent = T('Compound interest will be compounded ' + FREQ_TXT[f][0] + '.', 'ब्याज पर ब्याज ' + FREQ_TXT[f][1] + ' जुड़ेगा।');
  }
  window.setLoanIntType = function (v) {
    var h = document.getElementById('mIntType'); if (h) h.value = v;
    document.querySelectorAll('[data-it]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-it') === v); });
    var box = document.getElementById('mCompoundBox'); if (box) box.style.display = v === 'compound' ? '' : 'none'; freqNote();
  };
  window.setLoanFreq = function (v) {
    var h = document.getElementById('mFreq'); if (h) h.value = v;
    document.querySelectorAll('[data-f]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-f') === v); }); freqNote();
  };
  var money2 = function (n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  window.setLoanPartInterest = function (id, on) {
    requirePIN(function () {
      db.collection('users').doc(currentUser.uid).collection('transactions').doc(id)
        .update({ partPaymentInterest: !!on, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { var onPage = isLoanPage(); toast(T('Updated', 'अपडेट हो गया'), 'success'); if (onPage) reopenIfLoanPage(id); else { closeModal(); setTimeout(function () { window.showLoanAccrual(id); }, 600); } })
        .catch(function (e) { console.error(e); toast('Error', 'error'); });
    });
  };
  window.showLoanAccrual = function (id) {
    var loan = transactions.find(function (x) { return x.id === id; }); if (!loan) return;
    var st = Ledger.calculateLoanState(loan, [], new Date(), { mode: APP_CONFIG.interestMode }), rows = (st.schedule || []).slice().reverse();
    var reps = (Array.isArray(loan.repayments) ? loan.repayments : []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var paid = reps.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0), on = loan.partPaymentInterest !== false;
    var ft = FREQ_TXT[loan.compoundFreq || 'monthly'];
    var mon = function (d) { return d.toLocaleString('en', { month: 'short' }).toUpperCase() + ' ' + String(d.getFullYear()).slice(2); };
    var small = function (x) { return '<div style="font-size:12px;color:var(--text-muted);font-weight:700">' + x + '</div>'; };
    showModal('<div class="modal-handle"></div><div class="modal-title">📅 ' + T('Interest accrual', 'ब्याज का हिसाब') + '</div>' +
      '<div class="ux-sum"><div><small>' + T('Principal', 'मूलधन') + '</small><b>' + fmt(st.currentPrincipal) + '</b></div><div class="ux-sep"></div>' +
      '<div><small>' + T('Interest', 'ब्याज') + '</small><b style="color:var(--interest)">' + fmt(st.interestAccrued) + '</b></div><div class="ux-sep"></div>' +
      '<div><small>' + T('Outstanding', 'बाकी') + '</small><b class="ux-down">' + fmt(st.totalOutstanding) + '</b></div></div>' +
      small(T('Compound', 'चक्रवृद्धि') + ' · ' + T(ft[0], ft[1]) + ' · ' + loan.rate + '% / ' + (loan.rateUnit === 'year' ? T('year', 'वर्ष') : (loan.rateUnit === 'halfyear' ? T('6 months', 'छह माह') : T('month', 'माह'))) + (loan.dueDate ? ' · ' + T('Due', 'वापसी') + ' ' + dateStr(loan.dueDate) : '')) +
      '<div class="section-title" style="margin:12px 0 6px">' + T('PART-PAYMENTS', 'आंशिक वापसी') + ' <span style="float:right;text-transform:none">' + reps.length + ' ' + T('received', 'मिले') + ' · ' + money2(paid) + '</span></div>' +
      (reps.length ? '<div class="ux-log" style="font-family:inherit;font-size:13px;line-height:1.4;white-space:normal;max-height:16vh;margin-bottom:8px">' + reps.map(function (r) { return '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>' + dateStr(r.date) + '</span><b>' + money2(r.amount) + '</b></div>'; }).join('') + '</div>' : '') +
      '<div style="display:flex;align-items:center;gap:10px;background:#0f1d3a;color:#fff;border-radius:16px;padding:12px 14px;margin-bottom:10px">' +
      '<button type="button" role="switch" aria-checked="' + on + '" onclick="setLoanPartInterest(\'' + id + '\',' + (!on) + ')" style="flex:0 0 46px;height:26px;border-radius:999px;border:0;background:' + (on ? 'var(--primary)' : '#64748b') + ';position:relative;cursor:pointer"><span style="position:absolute;top:3px;' + (on ? 'right:3px' : 'left:3px') + ';width:20px;height:20px;border-radius:50%;background:#fff"></span></button>' +
      '<div style="flex:1;min-width:0"><b style="font-size:13px">' + T('Interest on part-payments ', 'वापसी पर ब्याज ') + (on ? 'ON' : 'OFF') + '</b><div style="font-size:11px;opacity:.8">' + (on ? T('Repayments reduce the interest base from their date', 'वापसी की तारीख से ब्याज का आधार घटता है') : T('Interest keeps running on the full principal', 'ब्याज पूरे मूलधन पर चलता रहता है')) + '</div></div>' +
      '<div style="text-align:right"><small style="font-size:10px;opacity:.8">' + T('SAVED', 'बचत') + '</small><div style="font-weight:900;color:#ffb347">' + money2(st.interestSaved || 0) + '</div></div></div>' +
      '<div class="section-title" style="margin:6px 0">' + T('INTEREST ACCRUAL', 'ब्याज जुड़ना') + ' <span style="float:right;text-transform:none">' + rows.length + ' ' + T('periods', 'अवधि') + '</span></div>' +
      '<div class="ux-log" style="font-family:inherit;font-size:13px;line-height:1.4;white-space:normal;max-height:30vh">' + rows.map(function (r) {
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)"><div><b>' + mon(r.date) + '</b>' + (r.current ? ' <small style="color:var(--primary);font-weight:800">' + T('CURRENT', 'चालू') + '</small>' : '') + '</div><div style="text-align:right"><b style="color:var(--interest)">+' + money2(r.amount) + '</b><br><small style="color:var(--text-muted)">' + T('running', 'कुल') + ' ' + money2(r.running) + '</small></div></div>';
      }).join('') + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">' + T('Interest compounds on each anniversary of the start date; the current period is pro-rated (days/30).', 'ब्याज शुरुआत तारीख की हर सालगिरह पर जुड़ता है; चालू अवधि दिन/30 के हिसाब से।') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" type="button" onclick="closeModal()">' + T('Close', 'बंद करें') + '</button></div>');
  };

  /* ===== Edit Loan: byaj ke terms (Simple <-> Compound) — New Loan jaisa hi block, loan ki maujooda value ke saath ===== */
  window.loanTermsFields = function (loan) {
    loan = loan || {};
    var unit = loan.rateUnit === 'year' ? 'year' : (loan.rateUnit === 'halfyear' ? 'halfyear' : 'month'), comp = loan.interestType === 'compound', fr = loan.compoundFreq || 'monthly';
    var chip = function (attr, val, label, on) { return '<button type="button" class="ux-chip' + (on ? ' on' : '') + '" data-' + attr + '="' + val + '" onclick="' + (attr === 'it' ? 'setLoanIntType' : 'setLoanFreq') + '(\'' + val + '\')">' + label + '</button>'; };
    var freqs = [['daily', T('Daily', 'रोज़')], ['monthly', T('Monthly', 'मासिक')], ['quarterly', T('Quarterly', 'तिमाही')], ['halfyearly', T('Half-yearly', 'छमाही')], ['yearly', T('Yearly', 'सालाना')]];
    return '<div class="input-group"><label class="input-label">' + T('Interest rate', 'ब्याज दर') + ' *</label><div style="display:flex;gap:8px">' +
      '<div class="input-prefix-wrap" style="flex:1"><span class="input-prefix">%</span><input type="number" id="mRate" class="text-input" value="' + E(loan.rate != null ? loan.rate : 2) + '" step="0.1" inputmode="decimal"></div>' +
      '<select id="mRateUnit" class="select-input" style="flex:0 0 118px"><option value="month"' + (unit === 'month' ? ' selected' : '') + '>' + T('per month', 'प्रति माह') + '</option><option value="halfyear"' + (unit === 'halfyear' ? ' selected' : '') + '>' + T('per 6 months', 'प्रति छह माह') + '</option><option value="year"' + (unit === 'year' ? ' selected' : '') + '>' + T('per year', 'प्रति वर्ष') + '</option></select></div></div>' +
      '<div class="input-group"><label class="input-label">' + T('Interest type', 'ब्याज का प्रकार') + '</label><input type="hidden" id="mIntType" value="' + (comp ? 'compound' : 'simple') + '"><div class="ux-chips" style="padding-bottom:0">' +
      chip('it', 'simple', T('Simple', 'साधारण'), !comp) + chip('it', 'compound', T('Compound', 'चक्रवृद्धि'), comp) + '</div></div>' +
      '<div id="mCompoundBox" style="display:' + (comp ? '' : 'none') + '"><div class="input-group"><label class="input-label">' + T('Compounded', 'कंपाउंडिंग') + '</label><input type="hidden" id="mFreq" value="' + fr + '"><div class="ux-chips" style="padding-bottom:0">' +
      freqs.map(function (f) { return chip('f', f[0], f[1], f[0] === fr); }).join('') + '</div>' +
      '<div id="mFreqNote" style="margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--interest-bg);font-size:12px;font-weight:700"></div></div></div>' +
      '<div class="input-group"><label class="input-label">' + T('Due date', 'वापसी की तारीख') + '</label><input type="date" id="mDue" class="text-input" value="' + E(String(loan.dueDate || '').slice(0, 10)) + '"></div>';
  };

  /* ===== Page-mode: entry forms full page (entry upar, keyboard neeche) ===== */
  var origShowModal = window.showModal;
  if (typeof origShowModal === 'function') window.showModal = function () {
    var r = origShowModal.apply(this, arguments);
    try { var m = document.getElementById('activeModal'); if (m && m.querySelector('.txn-sheet,#mAmt,#mPrincipal,#mRepay,#mIntAmt')) m.classList.add('pm'); } catch (e) {}
    return r;
  };

  /* ===== Settle / Unsettle loan ===== */
  function loanDoc(id) { return db.collection('users').doc(currentUser.uid).collection('transactions').doc(id); }
  function afterLoanChange(loan) {
    var c = customers.find(function (x) { return x.id === loan.partyId; });
    if (c && c.viewToken) { try { updatePublicView(loan.partyId, c.viewToken, { name: c.name, phone: c.phone, balance: c.balance || 0 }); } catch (e) { console.warn('public view', e); } }
  }
  window.settleLoanConfirm = function (id) {
    var loan = transactions.find(function (x) { return x.id === id; }); if (!loan) return;
    requirePIN(function () {
      var st = Ledger.calculateLoanState(loan, [], new Date(), { mode: APP_CONFIG.interestMode });
      if (!confirm(T('Mark this loan as settled? Remaining ', 'इस लोन को सेटल मानें? बाकी ') + fmt(st.totalOutstanding) + T(' will no longer be counted. You can unsettle later.', ' गिनती से हट जाएगा। बाद में अनसेटल कर सकते हैं।'))) return;
      loanDoc(id).update({ status: 'closed', settled: true, settledAt: firebase.firestore.FieldValue.serverTimestamp(), settledOutstanding: st.totalOutstanding, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { toast(T('Loan settled', 'लोन सेटल हो गया'), 'success'); afterLoanChange(loan); reopenIfLoanPage(id); })
        .catch(function (e) { console.error(e); toast('Error', 'error'); });
    });
  };
  window.unsettleLoan = function (id) {
    var loan = transactions.find(function (x) { return x.id === id; }); if (!loan) return;
    requirePIN(function () {
      if (!confirm(T('Unsettle this loan? It will count again.', 'इस लोन को अनसेटल करें? ये फिर से गिना जाएगा।'))) return;
      loanDoc(id).update({ status: 'active', settled: false, settledAt: firebase.firestore.FieldValue.delete(), settledOutstanding: firebase.firestore.FieldValue.delete(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { toast(T('Loan is active again', 'लोन फिर से सक्रिय'), 'success'); afterLoanChange(loan); reopenIfLoanPage(id); })
        .catch(function (e) { console.error(e); toast('Error', 'error'); });
    });
  };

  /* ===== LOAN ENTRY PAGE (loan par tap => poora page; edit/settle/delete/part-payment/PDF sab yahin se) ===== */
  var returnLoanId = null, inShow = false;
  function isLoanPage() { var m = document.getElementById('activeModal'); return !!(m && m.classList.contains('loan-page')); }
  function reopenIfLoanPage(id) { if (isLoanPage()) setTimeout(function () { window.openLoanPage(id); }, 700); }
  var dParse = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  var addM = function (d, n) { var t0 = new Date(d.getFullYear(), d.getMonth() + n, 1), last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate(); return new Date(t0.getFullYear(), t0.getMonth(), Math.min(d.getDate(), last)); };
  function humanSpan(a, b) {
    if (!a || b <= a) return T('Today', 'आज');
    var m = 0; while (addM(a, m + 1) <= b) m++; var d = Math.round((b - addM(a, m)) / 86400000), y = Math.floor(m / 12); m = m % 12;
    var p = []; if (y) p.push(y + ' ' + T(y > 1 ? 'years' : 'year', 'वर्ष')); if (m) p.push(m + ' ' + T(m > 1 ? 'months' : 'month', 'माह')); if (d || !p.length) p.push(d + ' ' + T(d === 1 ? 'day' : 'days', 'दिन'));
    return p.join(' ');
  }
  var UNIT_TXT = { month: ['MONTH', 'माह'], halfyear: ['6 MONTHS', '6 माह'], year: ['YEAR', 'वर्ष'] };
  window.openLoanPage = function (id) {
    var loan = transactions.find(function (x) { return x.id === id; }); if (!loan) return;
    var cu = customers.find(function (x) { return x.id === loan.partyId; }) || {};
    var st = Ledger.calculateLoanState(loan, [], new Date(), { mode: APP_CONFIG.interestMode });
    var comp = loan.interestType === 'compound', closed = loan.status === 'closed', on = loan.partPaymentInterest !== false;
    var reps = (Array.isArray(loan.repayments) ? loan.repayments : []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var paid = reps.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    var ft = FREQ_TXT[loan.compoundFreq || 'monthly'], ut = UNIT_TXT[loan.rateUnit] || UNIT_TXT.month;
    var start = dParse(loan.startDate), today = dParse(ymd(new Date())), due = dParse(loan.dueDate);
    var dd = due ? Math.floor((today - due) / 86400000) : null, overdue = !closed && dd !== null && dd > 0 && st.totalOutstanding > 0;
    var title = (loan.note && String(loan.note).trim()) || (T('Loan', 'लोन') + ' ' + fmt(loan.principal));
    var mon = function (d) { return d.toLocaleString('en', { month: 'short' }).toUpperCase() + ' ' + String(d.getFullYear()).slice(2); };
    var rows = (st.schedule || []).slice().reverse();
    /* compound: paise tak exact (schedule ka aakhri running), baaki loan card jaisa */
    var intExact = comp && rows.length ? rows[0].running : st.interestAccrued;
    var outExact = comp && rows.length ? Math.max(0, st.currentPrincipal + intExact - (Number(st.interestPaid) || 0)) : st.totalOutstanding;
    var lbl = function (x) { return '<div class="lp-lbl">' + x + '</div>'; };
    var item = function (k, v, cls) { return '<div><div class="lp-k">' + k + '</div><div class="lp-v ' + (cls || '') + '">' + v + '</div></div>'; };
    var act = function (key, ico, txt, danger) { return '<button type="button" class="lp-mi' + (danger ? ' danger' : '') + '" onclick="UxPro.lpAct(\'' + key + '\',\'' + id + '\')">' + ico + ' ' + txt + '</button>'; };
    var html =
      '<div class="lp-top"><button type="button" class="lp-sq" aria-label="Back" onclick="closeModal()">‹</button>' +
      '<div class="lp-ttl"><small>' + T('LOAN', 'लोन') + ' · ' + E(cu.name || '') + '</small><b>' + E(title) + '</b></div>' +
      '<button type="button" class="lp-sq" aria-label="PDF" onclick="UxPro.lpAct(\'pdf\',\'' + id + '\')">⬇</button>' +
      '<div style="position:relative"><button type="button" class="lp-sq" aria-label="Menu" onclick="document.getElementById(\'lpMenu\').classList.toggle(\'open\')">⌄</button>' +
      '<div class="lp-menu" id="lpMenu">' + act('edit', '✏️', T('Edit loan', 'लोन एडिट')) +
      (closed ? act('unsettle', '↩', T('Unsettle', 'अनसेटल')) : act('settle', '✅', T('Mark settled', 'सेटल करें')) + act('repay', '💵', T('Part-payment (principal)', 'आंशिक वापसी (मूलधन)')) + act('int', '📈', T('Interest payment', 'ब्याज भुगतान'))) +
      act('delete', '🗑️', T('Delete loan', 'लोन डिलीट'), true) + '</div></div></div>' +
      '<div class="lp-chips"><span class="lp-pill lent">↗ ' + T('LENT', 'दिया') + '</span><span class="lp-pill ' + (closed ? 'closed' : '') + '">' + (closed ? (loan.settled === true ? T('SETTLED', 'सेटल') : T('CLOSED', 'बंद')) : T('ACTIVE', 'सक्रिय')) + '</span>' +
      (overdue ? '<span class="lp-pill bad">⚠ ' + T('OVERDUE', 'बकाया') + ' ' + dd + ' ' + T('days', 'दिन') + '</span>' : '') + '<span class="lp-dur">' + humanSpan(start, today) + '</span></div>' +
      '<div class="lp-card"><div class="lp-prin"><div>' + lbl(T('PRINCIPAL', 'मूलधन')) + '<div class="lp-big">' + money2(loan.principal) + '</div></div>' +
      '<div class="lp-rate"><b>' + E(loan.rate) + '<small>%</small></b><span>/ ' + T(ut[0], ut[1]) + '</span></div></div>' +
      '<div class="lp-3">' + item(T('TYPE', 'प्रकार'), comp ? T('Compound', 'चक्रवृद्धि') + ' · ' + T(ft[0], ft[1]) : T('Simple', 'साधारण')) + item(T('STARTED', 'शुरुआत'), dateStr(loan.startDate)) + item(T('DUE', 'वापसी'), loan.dueDate ? dateStr(loan.dueDate) : '—', overdue ? 'bad' : '') + '</div>' +
      '<div class="lp-sum">' + item(T('INTEREST', 'ब्याज'), money2(intExact), 'amber') + item(T('PART PAID', 'वापसी'), money2(paid), 'orange') + item(T('OUTSTANDING', 'बाकी'), money2(outExact), 'red') + '</div></div>' +
      (Number(st.interestPaid) > 0 ? '<div class="lp-note-line">' + T('Interest paid so far', 'अब तक ब्याज भुगतान') + ': <b>' + money2(st.interestPaid) + '</b></div>' : '') +
      (closed && loan.settled === true && Number(loan.settledOutstanding) > 0 ? '<div class="lp-note-line">' + T('Waived at settlement', 'सेटल पर छोड़ा गया') + ': <b>' + money2(loan.settledOutstanding) + '</b></div>' : '') +
      (loan.note && String(loan.note).trim() ? lbl(T('DESCRIPTION', 'विवरण')) + '<div class="lp-card lp-desc">' + E(loan.note) + '</div>' : '') +
      lbl(T('PART-PAYMENTS', 'आंशिक वापसी') + ' <span class="lp-r">' + reps.length + ' ' + T('received', 'मिले') + ' · ' + money2(paid) + '</span>') +
      (reps.length ? '<div class="lp-card lp-list">' + reps.map(function (r) { return '<div class="lp-row"><span>' + dateStr(r.date) + '</span><b>' + money2(r.amount) + '</b></div>'; }).join('') + '</div>' : '<div class="lp-empty">' + T('No part-payments yet', 'अभी कोई वापसी नहीं') + '</div>') +
      (comp ? '<div class="lp-toggle"><button type="button" role="switch" aria-checked="' + on + '" class="lp-sw ' + (on ? 'on' : '') + '" onclick="setLoanPartInterest(\'' + id + '\',' + (!on) + ')"><span></span></button>' +
        '<div class="lp-tt"><b>' + T('Interest on part-payments ', 'वापसी पर ब्याज ') + (on ? 'ON' : 'OFF') + '</b><small>' + (on ? T('Repayments reduce the interest base from their date', 'वापसी की तारीख से ब्याज का आधार घटता है') : T('Interest keeps running on the full principal', 'ब्याज पूरे मूलधन पर चलता रहता है')) + '</small></div>' +
        '<div class="lp-earn"><small>' + T('SAVED', 'बचत') + '</small><b>' + money2(st.interestSaved || 0) + '</b></div></div>' : '') +
      lbl(T('INTEREST ACCRUAL', 'ब्याज जुड़ना') + ' <span class="lp-r">' + (comp ? T('Auto · every anniversary', 'अपने आप · हर सालगिरह') : T('Simple interest', 'साधारण ब्याज')) + '</span>') +
      (comp ? '<div class="lp-card"><div class="lp-ah"><b>' + T(ft[0].charAt(0).toUpperCase() + ft[0].slice(1), ft[1]) + ' ' + T('accrual', 'जुड़ना') + ' · ' + E(loan.rate) + '%</b><span>' + rows.length + ' ' + T('periods', 'अवधि') + '</span></div>' + rows.map(function (r) {
        return '<div class="lp-ar"><span class="lp-m' + (r.current ? ' cur' : '') + '">' + mon(r.date) + '</span><div><b>' + money2(r.amount) + '</b><small>' + T('running', 'कुल') + ' ' + money2(r.running) + '</small></div>' + (r.current ? '<em>' + T('CURRENT', 'चालू') + '</em>' : '') + '</div>';
      }).join('') + '</div><div class="lp-foot">' + T('Interest compounds on each anniversary of the start date; the current period is pro-rated (days/30).', 'ब्याज शुरुआत तारीख की हर सालगिरह पर जुड़ता है; चालू अवधि दिन/30 के हिसाब से।') + '</div>'
        : '<div class="lp-card lp-desc">' + E(loan.rate) + '% / ' + T(ut[0].toLowerCase(), ut[1]) + ' × ' + st.months + ' ' + T('months', 'माह') + ' = <b>' + money2(st.interestAccrued) + '</b></div>') +
      (closed ? '' : '<div class="modal-actions"><button class="btn btn-secondary" type="button" onclick="UxPro.lpAct(\'int\',\'' + id + '\')">📈 ' + T('Interest paid', 'ब्याज भुगतान') + '</button><button class="btn btn-primary" type="button" onclick="UxPro.lpAct(\'repay\',\'' + id + '\')">💵 ' + T('Part-payment', 'आंशिक वापसी') + '</button></div>');
    showModal('<div class="lp">' + html + '</div>');
    var m = document.getElementById('activeModal'); if (m) { m.classList.add('pm', 'loan-page'); m.addEventListener('click', function (e) { var mn = document.getElementById('lpMenu'); if (mn && !e.target.closest('.lp-menu') && !e.target.closest('[aria-label=Menu]')) mn.classList.remove('open'); }); }
    returnLoanId = null;
  };
  api.lpAct = function (key, id) {
    var loan = transactions.find(function (x) { return x.id === id; }); if (!loan) return;
    var mn = document.getElementById('lpMenu'); if (mn) mn.classList.remove('open');
    if (key === 'settle') return window.settleLoanConfirm(id);
    if (key === 'unsettle') return window.unsettleLoan(id);
    if (key === 'pdf') return loanPdf(loan);
    if (key === 'delete') { closeModal(); return deleteLoanConfirm(id); }
    requirePIN(function () {
      closeModal(); returnLoanId = id;
      if (key === 'edit') openEditLoanModal(loan);
      else if (key === 'repay') { openRepayModal(); var s1 = document.getElementById('mLoanSel'); if (s1) s1.value = id; }
      else if (key === 'int') { openIntPaidModal(); var s2 = document.getElementById('mLoanSel2'); if (s2) s2.value = id; }
    });
  };
  function loanPdf(loan) {
    var c = customers.find(function (x) { return x.id === loan.partyId; }) || {}, st = Ledger.calculateLoanState(loan, [], new Date(), { mode: APP_CONFIG.interestMode }), comp = loan.interestType === 'compound';
    var reps = Array.isArray(loan.repayments) ? loan.repayments : [], ft = FREQ_TXT[loan.compoundFreq || 'monthly'], ut = UNIT_TXT[loan.rateUnit] || UNIT_TXT.month;
    var box = function (l, v) { return '<div class="box"><div class="label">' + l + '</div><div class="value">' + v + '</div></div>'; };
    var body = '<h1>' + T('Loan statement', 'लोन स्टेटमेंट') + ' — ' + E(c.name || '') + '</h1><div class="meta">' + E(loan.note || '') + ' • ' + dateStr(ymd(new Date())) + '</div>' +
      '<div class="summary">' + box(T('Principal', 'मूलधन'), money2(loan.principal)) + box(T('Interest', 'ब्याज'), money2(st.interestAccrued)) + box(T('Outstanding', 'बाकी'), money2(st.totalOutstanding)) + '</div>' +
      '<h2>' + T('Terms', 'शर्तें') + '</h2><table><tbody><tr><td>' + T('Rate', 'दर') + '</td><td>' + E(loan.rate) + '% / ' + T(ut[0].toLowerCase(), ut[1]) + '</td></tr><tr><td>' + T('Type', 'प्रकार') + '</td><td>' + (comp ? T('Compound', 'चक्रवृद्धि') + ' (' + T(ft[0], ft[1]) + ')' : T('Simple', 'साधारण')) + '</td></tr><tr><td>' + T('Started', 'शुरुआत') + '</td><td>' + dateStr(loan.startDate) + '</td></tr><tr><td>' + T('Due', 'वापसी') + '</td><td>' + (loan.dueDate ? dateStr(loan.dueDate) : '—') + '</td></tr>' +
      (comp ? '<tr><td>' + T('Interest on part-payments', 'वापसी पर ब्याज') + '</td><td>' + (loan.partPaymentInterest === false ? 'OFF' : 'ON') + '</td></tr>' : '') + '</tbody></table>' +
      '<h2>' + T('Part-payments', 'आंशिक वापसी') + '</h2>' + (reps.length ? '<table><thead><tr><th>' + T('Date', 'तारीख') + '</th><th>' + T('Amount', 'रकम') + '</th></tr></thead><tbody>' + reps.map(function (r) { return '<tr><td>' + dateStr(r.date) + '</td><td>' + money2(r.amount) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="meta">—</div>') +
      (comp ? '<h2>' + T('Interest accrual', 'ब्याज जुड़ना') + '</h2><table><thead><tr><th>' + T('Period end', 'अवधि समाप्त') + '</th><th>' + T('Interest', 'ब्याज') + '</th><th>' + T('Running', 'कुल') + '</th></tr></thead><tbody>' + (st.schedule || []).map(function (r) { return '<tr><td>' + dateStr(ymd(r.date)) + (r.current ? ' (' + T('current', 'चालू') + ')' : '') + '</td><td>+' + money2(r.amount) + '</td><td>' + money2(r.running) + '</td></tr>'; }).join('') + '</tbody></table>' : '');
    printExportWindow(T('Loan statement', 'लोन स्टेटमेंट') + ' - ' + (c.name || ''), body);
  }
  /* edit/repay/interest modal band hone par (save ya cancel) wapas Loan page */
  var origShow2 = window.showModal;
  window.showModal = function () { inShow = true; try { return origShow2.apply(this, arguments); } finally { inShow = false; } };
  var origClose = window.closeModal;
  window.closeModal = function () {
    var wasPage = isLoanPage(), r = origClose.apply(this, arguments);
    if (wasPage && !inShow) returnLoanId = null;
    else if (!inShow && returnLoanId && !wasPage) { var id = returnLoanId; returnLoanId = null; setTimeout(function () { if (!document.getElementById('activeModal') && transactions.some(function (x) { return x.id === id; })) window.openLoanPage(id); }, 700); }
    return r;
  };

  /* ===== Customer list: Overdue filter + Sort ===== */
  var SORT_KEY = 'bsp_sort';
  var sortMode = lsGet(SORT_KEY) || 'default';
  var todayStr = function () { return ymd(new Date()); };
  /* PERF FIX (dashboard freeze): the old isCustomerOverdue() called getRecoveryRows() - a full ledger pass over
     ALL customers - once PER customer (O(N^2 x txns)). With the Overdue filter active every dashboard render
     (incl. each Firestore snapshot and every return from a customer screen) froze the UI for seconds.
     buildOverdueMatcher() computes the recovery rows ONCE and answers each customer in O(1). */
  window.buildOverdueMatcher = function () {
    var tdy = todayStr(), late = {};
    try { getRecoveryRows().forEach(function (r) { if (r.bucket === 'late' || r.bucket === 'critical') late[String(r.id)] = 1; }); } catch (e) {}
    return function (cid) {
      try {
        if (late[String(cid)]) return true;
        return getLoans(cid).some(function (l) { return l.dueDate && String(l.dueDate).slice(0, 10) < tdy && Ledger.calculateLoanState(l, [], new Date(), { mode: APP_CONFIG.interestMode }).totalOutstanding > 0; });
      } catch (e) { return false; }
    };
  };
  window.isCustomerOverdue = function (cid) { return window.buildOverdueMatcher()(cid); };
  var lastActivity = function (cid) { var m = ''; (txnIndex.get(cid) || []).forEach(function (tx) { var d = dayOf(tx); if (d > m) m = d; }); return m; };
  window.applyCustomerSort = function (list) {
    if (sortMode === 'name') return list.slice().sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }); });
    if (sortMode === 'balance') return list.slice().sort(function (a, b) { return (b.grandTotal || 0) - (a.grandTotal || 0); });
    if (sortMode === 'activity') { var act = {}; list.forEach(function (s) { act[s.id] = lastActivity(s.id); }); return list.slice().sort(function (a, b) { return act[b.id] < act[a.id] ? -1 : act[b.id] > act[a.id] ? 1 : 0; }); }
    return list;
  };
  api.setSort = function (m) { sortMode = m; lsSet(SORT_KEY, m); closeModal(); renderDashboard(); };
  api.openSort = function () {
    var opts = [['default', T('Default', 'डिफ़ॉल्ट')], ['name', T('Name A–Z', 'नाम A–Z')], ['balance', T('Highest balance', 'सबसे ज़्यादा बकाया')], ['activity', T('Last activity', 'आख़िरी लेन-देन')]];
    showModal('<div class="modal-handle"></div><div class="modal-title">⇅ ' + T('Sort customers', 'ग्राहक क्रम') + '</div>' + opts.map(function (o) {
      return '<button type="button" class="btn ' + (sortMode === o[0] ? 'btn-primary' : 'btn-secondary') + '" style="margin-bottom:8px" onclick="UxPro.setSort(\'' + o[0] + '\')">' + o[1] + '</button>';
    }).join('') + '<button class="btn btn-secondary" type="button" onclick="closeModal()">' + T('Close', 'बंद करें') + '</button>');
  };
  function ensureListControls() {
    var tabs = document.querySelector('#screen-dashboard .tabs'); if (!tabs) return;
    var od = tabs.querySelector('[data-filter="overdue"]');
    if (!od) { od = document.createElement('div'); od.className = 'tab'; od.setAttribute('data-filter', 'overdue'); od.setAttribute('onclick', "setFilter('overdue')"); tabs.appendChild(od); }
    od.textContent = '⚠ ' + T('Overdue', 'बकाया लेट');
    var sb = document.getElementById('uxSortBtn');
    if (!sb) { sb = document.createElement('div'); sb.id = 'uxSortBtn'; sb.className = 'tab'; sb.setAttribute('onclick', 'UxPro.openSort()'); tabs.appendChild(sb); }
    sb.textContent = '⇅ ' + T('Sort', 'क्रम') + (sortMode !== 'default' ? ' •' : '');
  }

  /* Phase 1: Accessibility - clickable div/card ko keyboard + screen-reader friendly banana */
  var a11yT = 0;
  function a11y() {
    document.querySelectorAll('.tab,.customer-card,.rec-chip,[onclick]:not(button):not(a):not(input):not(select):not(label)').forEach(function (el) {
      if (el.hasAttribute('data-a11y')) return; el.setAttribute('data-a11y', '1');
      if (!el.getAttribute('role')) el.setAttribute('role', 'button'); if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
      el.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); el.click(); } });
    });
    document.querySelectorAll('button:not([aria-label])').forEach(function (b) {
      if (!(b.textContent || '').replace(/[\s\u200b]/g, '').match(/^[^\p{L}\p{N}]*$/u)) return;
      var l = b.getAttribute('title') || b.getAttribute('data-label'); if (l) b.setAttribute('aria-label', l);
    });
  }
  function scheduleA11y() { clearTimeout(a11yT); a11yT = setTimeout(a11y, 250); }

  function boot() {
    applyTheme(); injectSettings(); a11y();
    try { new MutationObserver(scheduleA11y).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return api;
});
