// =====================================================================
// BABASITARAM PRO -- background.js (CHROME BUILD)
// Bundle this file ONLY with manifest-chrome.json. It contains the
// declarativeNetRequest.getMatchedRules() call, which Chrome supports and
// Firefox does not implement. Do NOT include this file in a Firefox/AMO
// submission -- use background-firefox.js instead, which has that code
// path removed entirely so AMO's static scanner never sees the reference.
// =====================================================================
﻿﻿// ═══════════════════════════════════════════════════════════════════
// BABASITARAM PRO v9.2.2 — background.js
// Fireproof History Trim: MAX=15, KEEP=3
// Activity Log Limit: 10 entries only
// ═══════════════════════════════════════════════════════════════════
// NOTE: importScripts() only exists in a real Worker context (Chrome's MV3
// service worker). Firefox MV3 runs the background as an event page (a plain
// script context), where importScripts is undefined — calling it unguarded
// throws immediately and kills this entire file before anything else runs.
// That is why Firefox previously showed 0 Ads Killed / 0 Trackers / no stats
// at all: the background script never finished loading, so no message
// listeners, alarms, or counters were ever registered.
if (typeof importScripts === 'function') {
  try {
    importScripts('filter-sync.js');
  } catch (e) {
    console.error('[BABASITARAM] importScripts(filter-sync.js) failed:', e);
  }
}
// On Firefox, filter-sync.js is loaded beforehand via manifest.json's
// "background.scripts" array (see manifest.json fix), so syncFilterLists
// is already defined globally by the time we get here.

// Fallback: if filter-sync.js failed to load
if (typeof syncFilterLists === 'undefined') {
  var syncFilterLists = async function(addLogFn) {
    if (typeof addLogFn === 'function') {
      addLogFn('❌ Filter Sync unavailable: filter-sync.js failed to load');
    }
    console.error('[BABASITARAM] syncFilterLists is undefined — filter-sync.js did not load correctly.');
    try {
      await chrome.storage.local.set({
        filterSyncMeta: { lastSync: Date.now(), status: 'error', error: 'filter-sync.js not loaded' },
        filterSyncStatus: 'error',
        filterSyncTime: Date.now(),
        filterSyncCount: 0
      });
    } catch (_) { /* storage unavailable */ }
    return { ok: false, error: 'filter-sync.js not loaded' };
  };
}

const VERSION = "9.2.2";
const PING_INTERVAL_MINUTES = 30;
const FILTER_SYNC_INTERVAL_MINUTES = 720;

const SYNC_KEYS = [
  "blockedSites", "allowedSites", "focusMode", "focusSites",
  "vaultSites", "vaultPin", "timeLimits", "customRules",
  "burnOnClose", "idleTimeout", "notificationsEnabled"
];

// ── Storage helpers ──────────────────────────────────────────────
function getLocal(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function setLocal(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}
function getSync(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}
function setSync(obj) {
  return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
}

// ── ACTIVITY LOGGING ────────────────────────────────────────────
async function addActivityLog(message) {
  const { activityLogs = [] } = await getLocal(["activityLogs"]);
  const timestamp = new Date().toLocaleString('en-IN', { hour12: false });
  activityLogs.unshift({ time: timestamp, msg: message });
  // ✅ CHANGE: 100 → 10 (sirf last 10 entries dikhein)
  if (activityLogs.length > 10) activityLogs.length = 10;
  await setLocal({ activityLogs });
}

// ── Safe cookie URL ──────────────────────────────────────────────
function safeCookieUrl(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const d = domain.startsWith(".") ? domain.slice(1) : domain;
  if (!d || d.length > 253 || d.includes(" ") || d.includes("/") || d.includes(":") || d.includes("..") || d.includes("@") || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(d)) return null;
  return `https://${d}`;
}

const ALLOWED_EXT_PAGES = new Set(['vault-blocked.html', 'blocked.html', 'burn.html', 'burned.html', 'focus-blocked.html', 'focus-mode.html', 'timelimit.html', 'onboarding.html']);
function safeExtUrl(page) {
  if (!ALLOWED_EXT_PAGES.has(page)) return null;
  return chrome.runtime.getURL(page);
}

// ── FIREPROOF CENTRAL GUARD ──────────────────────────────────────
let _protectedCache = null;
let _protectedCacheTime = 0;
const PROTECTED_CACHE_TTL = 30000;

async function getProtectedSet() {
  if (_protectedCache && Date.now() - _protectedCacheTime < PROTECTED_CACHE_TTL) {
    return _protectedCache;
  }
  const { 
    fireproofSites = [], 
    vaultSites = [], 
    whitelist = [], 
    breakageBypass = [],
    disabledSites = []
  } = await getLocal(["fireproofSites", "vaultSites", "whitelist", "breakageBypass", "disabledSites"]);
  
  const expanded = new Set();
  for (const fp of [...fireproofSites, ...vaultSites, ...whitelist, ...breakageBypass, ...disabledSites]) {
    if (!fp || typeof fp !== 'string') continue;
    const clean = fp.toLowerCase().replace(/^www\./, '');
    expanded.add(clean);
    expanded.add(getRootDomain(clean));
    for (const sso of getSSODomains(clean)) expanded.add(sso);
  }
  _protectedCache = expanded;
  _protectedCacheTime = Date.now();
  return expanded;
}

function isProtectedHostname(hostname, protectedSet) {
  if (!hostname) return false;
  const h = hostname.toLowerCase().replace(/^www\./, '');
  for (const fp of protectedSet) {
    if (h === fp || h.endsWith('.' + fp)) return true;
  }
  return false;
}

function bustProtectedCache() { _protectedCache = null; }

// ── SW state restore on startup ──────────────────────────────────
getLocal(["focusModeUntil", "settings"]).then(d => {
  focusModeUntil = d.focusModeUntil || 0;
  tabIsolationEnabled = !!(d.settings && d.settings.tabIsolation);
  const autoBurnMinutes = d.settings && d.settings.autoBurnMinutes;
  if (autoBurnMinutes !== undefined && autoBurnMinutes !== 0) {
    setAutoHistoryWipe(autoBurnMinutes);
  }
});

// ── Vault unlock session ─────────────────────────────────────────
let vaultUnlocked = false;
let pinSessionUntil = 0;

function isVaultUnlocked() {
  if (vaultUnlocked && Date.now() < pinSessionUntil) return true;
  vaultUnlocked = false;
  pinSessionUntil = 0;
  return false;
}
function unlockVault(durationMs = 5 * 60 * 1000) {
  vaultUnlocked = true;
  pinSessionUntil = Date.now() + durationMs;
}
function lockVault() {
  vaultUnlocked = false;
  pinSessionUntil = 0;
}

// ── allProtected (deduped) ──────────────────────────────────────
async function getAllProtected() {
  const data = await getLocal(["blockedSites", "vaultSites", "focusSites"]);
  const set = new Set([
    ...(data.blockedSites || []),
    ...(data.vaultSites || []),
    ...(data.focusSites || [])
  ]);
  return [...set];
}

// ── clearNonDailyData ────────────────────────────────────────────
async function clearNonDailyData() {
  const _cndPS = await getProtectedSet();
  await chrome.browsingData.remove({ since: 0 }, { cache: true, formData: true });

  const _cndHist = await chrome.history.search({ text:"", startTime:0, maxResults:100000 });
  for (const _hi of _cndHist) {
    try {
      const _hh = new URL(_hi.url).hostname.replace(/^www\./, "");
      if (!isProtectedHostname(_hh, _cndPS)) chrome.history.deleteUrl({url:_hi.url}).catch(()=>{});
    } catch {}
  }

  const _cndCookies = await chrome.cookies.getAll({});
  for (const ck of _cndCookies) {
    const cd = ck.domain.replace(/^\./, "");
    if (isProtectedHostname(cd, _cndPS)) continue;
    const _cu = safeCookieUrl(ck.domain);
    if (_cu) await chrome.cookies.remove({ url: _cu, name: ck.name }).catch(() => {});
  }
  addActivityLog('🔄 Non-daily data cleared (cache, non-protected history & cookies)');
}

// ── Root domain extractor ────────────────────────────────────────
const MULTI_PART_TLDS = new Set(["co.in","co.uk","co.jp","co.nz","co.za","com.au","com.br","net.in","org.in","gov.in","ac.in"]);
function getRootDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const twoPartTld = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(twoPartTld)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

// ── Ad subdomain blocklist ──────────────────────────────────────
const AD_SUBDOMAINS = new Set([
  "ads", "ad", "adservice", "adservices", "pagead", "pagead2",
  "doubleclick", "googleadservices", "googlesyndication",
  "adnxs", "adsystem", "advertising", "tracker", "tracking",
  "analytics", "pixel", "beacon", "telemetry", "metrics",
  "stats", "log", "logs", "collect", "tag", "tags"
]);

function isAdSubdomain(cookieDomain, parentDomain) {
  if (cookieDomain === parentDomain) return false;
  if (!cookieDomain.endsWith("." + parentDomain)) return false;
  const sub = cookieDomain.slice(0, cookieDomain.length - parentDomain.length - 1);
  const leftmost = sub.split(".")[0];
  return AD_SUBDOMAINS.has(leftmost);
}

function isFireproofCookie(cookieDomain, fireproofSites) {
  const expanded = new Set();
  for (const fp of fireproofSites) {
    expanded.add(fp);
    expanded.add(getRootDomain(fp));
    for (const sso of getSSODomains(fp)) expanded.add(sso);
  }
  for (const fp of expanded) {
    if (cookieDomain === fp) return true;
    if (cookieDomain.endsWith("." + fp) && !isAdSubdomain(cookieDomain, fp)) return true;
  }
  return false;
}

// ── SSO domain map ──────────────────────────────────────────────
const SSO_MAP = {
  "csccloud.in":    ["csc.gov.in", "connect.csc.gov.in"],
  "csc.gov.in":    ["connect.csc.gov.in"],
  "paycsc.in":     ["csc.gov.in", "connect.csc.gov.in"],
};
function getSSODomains(domain) {
  const root = getRootDomain(domain);
  return SSO_MAP[domain] || SSO_MAP[root] || [];
}

async function fireWipe() {
  const { fireproofSites: rawFP = [], vaultSites = [] } = await getLocal(["fireproofSites", "vaultSites"]);
  const fireproofSites = [...new Set(rawFP)];
  const allProtectedSites = [...new Set([...fireproofSites, ...vaultSites])];

  await chrome.browsingData.remove({ since: 0 }, {
    cache: true, downloads: true, formData: true
  });

  const _fwPS = await getProtectedSet();
  const histItems = await chrome.history.search({ text: "", startTime: 0, maxResults: 100000 });
  let histCount = 0;
  for (const item of histItems) {
    try {
      const h = new URL(item.url).hostname.replace(/^www\./, "");
      if (!isProtectedHostname(h, _fwPS)) {
        chrome.history.deleteUrl({ url: item.url }).catch(() => {});
        histCount++;
      }
    } catch {}
  }

  const allCookies = await chrome.cookies.getAll({});
  const toDelete = allCookies.filter(c => {
    const cd = c.domain.replace(/^\./, "");
    return !isFireproofCookie(cd, allProtectedSites);
  });
  await Promise.all(toDelete.map(c => {
    const url = safeCookieUrl(c.domain);
    return url ? chrome.cookies.remove({ url, name: c.name }).catch(() => {}) : Promise.resolve();
  }));

  const wk = weekKey();
  const { weeklyStats = {} } = await getLocal(["weeklyStats"]);
  const ws = weeklyStats[wk] || { ads: 0, burns: 0 };
  ws.burns = (ws.burns || 0) + 1;
  weeklyStats[wk] = ws;
  await setLocal({ weeklyStats });

  addActivityLog(`🔥 Emergency Burn executed — ${histCount} history entries, ${toDelete.length} cookies deleted (${allProtectedSites.length} protected sites)`);
  return { ok: true, fireproofCount: allProtectedSites.length };
}

function weekKey() {
  const d = new Date(), s = new Date(d.getFullYear(), 0, 1);
  return d.getFullYear() + "-W" + Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7);
}

// ── Focus mode state ────────────────────────────────────────────
let focusModeUntil = 0;
async function setFocusMode(minutes) {
  if (!minutes) {
    focusModeUntil = 0;
    await setLocal({ focusMode: false, focusModeUntil: 0 });
    addActivityLog('⏹ Focus Mode stopped');
  } else {
    focusModeUntil = Date.now() + minutes * 60 * 1000;
    await setLocal({ focusMode: true, focusModeUntil });
    addActivityLog(`🎯 Focus Mode started for ${minutes} minutes`);
  }
}
function getFocusStatus() {
  const remaining = Math.max(0, Math.ceil((focusModeUntil - Date.now()) / 1000));
  return { active: focusModeUntil > Date.now(), remaining };
}

// ── Tab isolation flag ──────────────────────────────────────────
let tabIsolationEnabled = false;

// ── Nightly clear alarm ──────────────────────────────────────────
function setNightlyClear(enabled) {
  if (enabled) {
    chrome.alarms.create("nightlyClear", { when: nextMidnight(), periodInMinutes: 1440 });
    addActivityLog('🌙 Nightly clear enabled');
  } else {
    chrome.alarms.clear("nightlyClear");
    addActivityLog('🌙 Nightly clear disabled');
  }
}
function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ── Auto history wipe alarm ──────────────────────────────────────
function setAutoHistoryWipe(minutes) {
  chrome.alarms.clear("autoHistoryWipe");
  if (minutes > 0) {
    chrome.alarms.create("autoHistoryWipe", { periodInMinutes: minutes });
    addActivityLog(`⏱️ Auto history wipe set to ${minutes} minutes`);
  } else {
    addActivityLog('⏱️ Auto history wipe disabled');
  }
}

// ── Tab isolation ──────────────────────────────────────────────
async function isolateTab(tabId, url) {
  if (!url || url.startsWith("chrome") || url.startsWith("about")) return;
  let hostname;
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { return; }
  const { fireproofSites: _fp = [], whitelist: _wl = [] } = await getLocal(["fireproofSites", "whitelist"]);
  const _safe = [...new Set([..._fp, ..._wl])];
  if (_safe.some(s => hostname === s || hostname.endsWith("." + s))) return;
  const cookieUrl = safeCookieUrl(hostname);
  if (!cookieUrl) return;
  try {
    const cookies = await chrome.cookies.getAll({ url: cookieUrl });
    for (const cookie of cookies) {
      const removeUrl = safeCookieUrl(cookie.domain);
      if (!removeUrl) continue;
      await chrome.cookies.remove({ url: removeUrl, name: cookie.name }).catch(() => {});
    }
  } catch {}
}

// ── Sync push/pull ──────────────────────────────────────────────
async function pushToSync() {
  const data = await getLocal(SYNC_KEYS);
  const payload = {};
  for (const key of SYNC_KEYS) {
    if (data[key] !== undefined) payload[key] = data[key];
  }
  await setSync(payload);
  addActivityLog('☁️ Pushed settings to cloud');
}
async function pullFromSync() {
  const data = await getSync(SYNC_KEYS);
  if (Object.keys(data).length) {
    await setLocal(data);
    addActivityLog('☁️ Pulled settings from cloud');
  } else {
    addActivityLog('⚠️ No cloud data to pull');
  }
}

// ── Blocking logic ──────────────────────────────────────────────
async function shouldBlock(url) {
  if (!url || url.startsWith("chrome") || url.startsWith("about")) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  const data = await getLocal(["blockedSites", "allowedSites", "focusMode", "focusSites", "timeLimits"]);
  const allowed = (data.allowedSites || []).map(s => s.replace(/^www\./, ""));
  if (allowed.includes(hostname)) return false;

  const blocked = (data.blockedSites || []).map(s => s.replace(/^www\./, ""));
  if (blocked.includes(hostname)) return true;

  if (data.focusMode) {
    const focus = (data.focusSites || []).map(s => s.replace(/^www\./, ""));
    if (!focus.includes(hostname)) return true;
  }

  const limits = data.timeLimits || {};
  if (limits[hostname]) {
    const used = await getDailyUsage(hostname);
    if (used >= limits[hostname] * 60 * 1000) return true;
  }
  return false;
}

// ── Daily usage tracking ──────────────────────────────────────
async function getDailyUsage(hostname) {
  const key = `usage_${hostname}_${todayKey()}`;
  const data = await getLocal([key]);
  return data[key] || 0;
}
async function addDailyUsage(hostname, ms) {
  const key = `usage_${hostname}_${todayKey()}`;
  const data = await getLocal([key]);
  await setLocal({ [key]: (data[key] || 0) + ms });
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Vault guard ──────────────────────────────────────────────────
async function isVaultSite(url) {
  if (!url) return false;
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  const data = await getLocal(["vaultSites"]);
  return (data.vaultSites || []).map(s => s.replace(/^www\./, "")).includes(hostname);
}

// ── Navigation handler ──────────────────────────────────────────
chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, url, frameId }) => {
  if (frameId !== 0) return;
  if (await isVaultSite(url)) {
    if (!isVaultUnlocked()) {
      const vaultUrl = safeExtUrl('vault-blocked.html'); if (vaultUrl) chrome.tabs.update(tabId, { url: vaultUrl });
      return;
    }
  }
  if (await shouldBlock(url)) {
    const blockedUrl = safeExtUrl('blocked.html'); if (blockedUrl) chrome.tabs.update(tabId, { url: blockedUrl });
    return;
  }
});

// ── Fireproof History Memory Trim ──────────────────────────────
// MAX=15, KEEP=3 — Fireproof sites ki history sirf 15 entries, latest 3 keep
const FP_HIST_MAX = 15;
const FP_HIST_KEEP = 3;

async function trimFireproofHistory(hostname) {
  try {
    const items = await chrome.history.search({
      text: hostname,
      startTime: 0,
      maxResults: FP_HIST_MAX + 50
    });
    const mine = items.filter(item => {
      try {
        const h = new URL(item.url).hostname.replace(/^www\./, '');
        return h === hostname || h.endsWith('.' + hostname);
      } catch { return false; }
    });
    if (mine.length > FP_HIST_MAX) {
      mine.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
      const toDelete = mine.slice(FP_HIST_KEEP);
      for (const item of toDelete) {
        chrome.history.deleteUrl({ url: item.url }).catch(() => {});
      }
    }
  } catch {}
}

async function shouldDeleteHistory(url) {
  if (!url || url.startsWith('chrome') || url.startsWith('about')) return false;
  let h;
  try { h = new URL(url).hostname.replace(/^www\./, ""); } catch { return false; }
  const { settings = {} } = await getLocal(["settings"]);
  // 🔴 Live Mode ON (autoBurnMinutes === -1) → non-Fireproof history delete
  if (parseInt(settings.autoBurnMinutes) !== -1) return false;
  const ps = await getProtectedSet();
  return !isProtectedHostname(h, ps);
}

// 🔴 LIVE MODE — real catch-all via chrome.history.onVisited.
// webNavigation.onCommitted/onCompleted (below) only fire for full page
// navigations. Modern sites like YouTube use the History API (pushState) to
// change the URL WITHOUT a full navigation — e.g. searching or opening a
// video while already on youtube.com. Those SPA-style URL changes never
// trigger onCommitted/onCompleted, so Live Mode never got a chance to delete
// them, which is why entries like a YouTube search or a watched video kept
// showing up in history even with Live Mode on. chrome.history.onVisited
// fires for every new history entry no matter how it was created, so it
// reliably catches these too.
chrome.history.onVisited.addListener(async (historyItem) => {
  if (await shouldDeleteHistory(historyItem.url)) {
    chrome.history.deleteUrl({ url: historyItem.url }).catch(() => {});
    addActivityLog(`🔴 Live mode: deleted history for ${historyItem.url}`);
  }
});

chrome.webNavigation.onCommitted.addListener(async ({ url, frameId }) => {
  if (frameId !== 0) return;
  if (await shouldDeleteHistory(url)) {
    chrome.history.deleteUrl({ url }).catch(() => {});
  }
});

chrome.webNavigation.onCompleted.addListener(async ({ url, frameId }) => {
  if (frameId !== 0) return;
  if (await shouldDeleteHistory(url)) {
    chrome.history.deleteUrl({ url }).catch(() => {});
    return;
  }
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const ps = await getProtectedSet();
    if (isProtectedHostname(h, ps)) {
      const root = getRootDomain(h);
      await trimFireproofHistory(root);
    }
  } catch {}
});

// ── Tab tracking for usage ──────────────────────────────────────
const tabActivity = {};
chrome.tabs.onActivated.addListener(({ tabId }) => {
  tabActivity[tabId] = { start: Date.now() };
  chrome.tabs.get(tabId, tab => {
    if (tab && tab.url) tabActivity[tabId].url = tab.url;
  });
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  if (tabActivity[tabId]) tabActivity[tabId].url = tab.url;
  if (tabIsolationEnabled) await isolateTab(tabId, tab.url);
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const entry = tabActivity[tabId];
  if (entry && entry.url && entry.start) {
    try {
      const hostname = new URL(entry.url).hostname.replace(/^www\./, "");
      await addDailyUsage(hostname, Date.now() - entry.start);
    } catch {}
  }
  delete tabActivity[tabId];
});

// ── Idle / burn ──────────────────────────────────────────────────
chrome.idle.onStateChanged.addListener(async state => {
  if (state !== "idle") return;
  const data = await getLocal(["idleTimeout", "burnOnClose", "settings"]);
  const s = data.settings || {};
  if (data.burnOnClose || s.exitClear) await clearNonDailyData();
});

// ── Context menus ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "blockSite", title: "Block this site", contexts: ["page"] });
    chrome.contextMenus.create({ id: "pickElement", title: "Pick element to hide", contexts: ["page"] });
  });
  const { settings } = await getLocal(["settings"]);
  if (!settings) {
    await setLocal({
      settings: {
        adBlocker: true, ipPrivacy: true, lightweightMode: false,
        fireproofPrompt: true, historyGuard: true, autoDisablePaymentSites: true
      }
    });
  }
  pullFromSync();
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url) return;
  let hostname;
  try {
    hostname = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch { return; }
  if (info.menuItemId === "blockSite") {
    const data = await getLocal(["blockedSites"]);
    const list = data.blockedSites || [];
    if (!list.includes(hostname)) {
      await setLocal({ blockedSites: [...list, hostname] });
      addActivityLog(`🚫 Blocked site: ${hostname}`);
    }
  } else if (info.menuItemId === "pickElement") {
    chrome.tabs.sendMessage(tab.id, { action: "startPicker" });
  }
});

// ── Message handler ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.action) {
    case "ping":
      return { status: "ok", version: VERSION };

    case "unlockVault":
      unlockVault(msg.durationMs);
      addActivityLog('🔓 Vault unlocked');
      return { ok: true };

    case "lockVault":
      lockVault();
      addActivityLog('🔒 Vault locked');
      return { ok: true };

    case "vaultStatus":
      return { unlocked: isVaultUnlocked() };

    case "getAllProtected":
      return { sites: await getAllProtected() };

    case "clearNonDailyData":
      await clearNonDailyData();
      return { ok: true };

    case "isolateTab": {
      const tab = sender.tab || (msg.tabId ? await chrome.tabs.get(msg.tabId) : null);
      if (tab) await isolateTab(tab.id, tab.url);
      return { ok: true };
    }

    case "pushSync":
      await pushToSync();
      return { ok: true };

    case "pullSync":
      await pullFromSync();
      return { ok: true };

    case "getUsage": {
      const usage = await getDailyUsage(msg.hostname);
      return { usage };
    }

    case "fireWipe":
    case "burn":
      return await fireWipe();

    // ── Ad pipeline messages from content.js ──
    case "adDetected":
    case "adBlocked": {
      const { adCount = 0, totalAds = 0, weeklyStats: wsAll = {}, domainStats: dsAll = {} } =
        await getLocal(["adCount", "totalAds", "weeklyStats", "domainStats"]);

      const wk = weekKey();
      const ws = wsAll[wk] || { ads: 0, burns: 0 };
      ws.ads = (ws.ads || 0) + 1;
      wsAll[wk] = ws;

      let domain = null;
      try {
        const tabUrl = (sender.tab && sender.tab.url) || null;
        if (tabUrl) domain = new URL(tabUrl).hostname;
      } catch {}
      if (domain) dsAll[domain] = (dsAll[domain] || 0) + 1;

      await setLocal({
        adCount: adCount + 1,
        totalAds: totalAds + 1,
        weeklyStats: wsAll,
        domainStats: dsAll
      });

      const site = domain || 'unknown';
      addActivityLog(`🛡️ Ad blocked on ${site}`);

      return { ok: true };
    }

    // ── Tracker pipeline (separate counter from ads) ──
    case "trackerBlocked": {
      const { totalThreats = 0, trackerDomainStats: tdsAll = {} } =
        await getLocal(["totalThreats", "trackerDomainStats"]);

      const inc = Math.max(1, parseInt(msg.count) || 1);

      let domain = null;
      try {
        const tabUrl = (sender.tab && sender.tab.url) || null;
        if (tabUrl) domain = new URL(tabUrl).hostname;
      } catch {}
      if (domain) tdsAll[domain] = (tdsAll[domain] || 0) + inc;

      await setLocal({
        totalThreats: totalThreats + inc,
        trackerDomainStats: tdsAll
      });

      addActivityLog(`🕵️ ${inc} tracker(s) blocked on ${domain || 'unknown'}`);
      return { ok: true };
    }

    case "paymentSiteDetected":
      await setLocal({ lastPaymentSite: { site: msg.site, title: msg.pageTitle, ts: msg.timestamp } });
      addActivityLog(`💳 Payment site detected: ${msg.site}`);
      return { ok: true };

    // ── Custom element-hide rules ──
    case "getCustomRules": {
      const { customRules = {} } = await getLocal(["customRules"]);
      return customRules[msg.domain] || [];
    }

    case "saveCustomRule": {
      const { customRules: cr = {} } = await getLocal(["customRules"]);
      const domain = msg.domain;
      const existing = cr[domain] || [];
      if (!existing.includes(msg.selector)) {
        cr[domain] = [...existing, msg.selector];
        await setLocal({ customRules: cr });
        addActivityLog(`🎯 Custom rule saved for ${domain}: ${msg.selector}`);
      }
      return { ok: true };
    }

    case "deleteCustomRule": {
      const { customRules: dcr = {} } = await getLocal(["customRules"]);
      if (dcr[msg.domain]) {
        dcr[msg.domain] = dcr[msg.domain].filter(s => s !== msg.selector);
        await setLocal({ customRules: dcr });
        addActivityLog(`🗑️ Custom rule deleted for ${msg.domain}`);
      }
      return { ok: true };
    }

    // ── Filter list sync ──
    case "syncFilters": {
      const logs = [];
      const result = await syncFilterLists(l => logs.push(l));
      if (result.ok) addActivityLog(`📥 Filter lists synced (${result.total} rules)`);
      else addActivityLog(`❌ Filter sync failed: ${result.error}`);
      return { ...result, logs };
    }

    // ── Vault CRUD ──
    case "getVaultSites": {
      const { vaultSites = [] } = await getLocal(["vaultSites"]);
      return vaultSites.map(site => ({ site, unlocked: isVaultUnlocked() }));
    }

    case "addVaultSite": {
      const { vaultSites: vs = [] } = await getLocal(["vaultSites"]);
      if (!vs.includes(msg.site)) {
        await setLocal({ vaultSites: [...new Set([...vs, msg.site])] });
        addActivityLog(`🔐 Added vault site: ${msg.site}`);
      }
      return { ok: true };
    }

    case "removeVaultSite": {
      const { vaultSites: rvs = [] } = await getLocal(["vaultSites"]);
      await setLocal({ vaultSites: rvs.filter(s => s !== msg.site) });
      addActivityLog(`🔓 Removed vault site: ${msg.site}`);
      return { ok: true };
    }

    // ── Cookie stats / clean ──
    case "getCookieStats": {
      const { whitelist = [] } = await getLocal(["whitelist"]);
      const all = await chrome.cookies.getAll({});
      const map = {};
      for (const c of all) {
        const d = c.domain.replace(/^\./, "");
        map[d] = (map[d] || 0) + 1;
      }
      const byDomain = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => ({ domain, count, trusted: whitelist.includes(domain) }));
      return { total: all.length, byDomain };
    }

    case "cleanCookiesDomain": {
      const _cdPS = await getProtectedSet();
      const _cdHost = (msg.domain || "").replace(/^\./, "");
      if (isProtectedHostname(_cdHost, _cdPS)) return { cleaned: 0, protected: true };
      const cookies = await chrome.cookies.getAll({ domain: msg.domain });
      let cleaned = 0;
      for (const ck of cookies) {
        const url = safeCookieUrl(ck.domain);
        if (url) { await chrome.cookies.remove({ url, name: ck.name }).catch(() => {}); cleaned++; }
      }
      addActivityLog(`🍪 Cleaned ${cleaned} cookies for ${msg.domain}`);
      return { cleaned };
    }

    case "cleanAllCookies": {
      const { whitelist: wl = [], fireproofSites: fp2 = [], vaultSites: vs2 = [] } = await getLocal(["whitelist","fireproofSites","vaultSites"]);
      const all = await chrome.cookies.getAll({});
      let cleaned = 0;
      for (const c of all) {
        const d = c.domain.replace(/^\./, "");
        if (isFireproofCookie(d, [...fp2, ...vs2])) continue;
        const url = safeCookieUrl(c.domain);
        if (url) { await chrome.cookies.remove({ url, name: c.name }).catch(() => {}); cleaned++; }
      }
      addActivityLog(`🍪 Cleaned all non-protected cookies (${cleaned})`);
      return { cleaned };
    }

    // ── Time limits ──
    case "getTimeSpent": {
      const { timeLimits = {} } = await getLocal(["timeLimits"]);
      const result = {};
      for (const [domain, limitMins] of Object.entries(timeLimits)) {
        const spent = Math.round((await getDailyUsage(domain)) / 1000);
        const limit = limitMins * 60;
        result[domain] = { spent, limit, pct: limit ? Math.round(spent / limit * 100) : 0 };
      }
      return result;
    }

    case "setTimeLimit": {
      const { timeLimits: tl = {} } = await getLocal(["timeLimits"]);
      if (!msg.minutes) delete tl[msg.domain];
      else tl[msg.domain] = msg.minutes;
      await setLocal({ timeLimits: tl });
      if (msg.minutes) addActivityLog(`⏰ Time limit set for ${msg.domain}: ${msg.minutes}min`);
      else addActivityLog(`⏰ Time limit removed for ${msg.domain}`);
      return { ok: true };
    }

    case "resetTimeSpent": {
      const key = `usage_${msg.domain}_${todayKey()}`;
      await setLocal({ [key]: 0 });
      addActivityLog(`⏱️ Reset time spent for ${msg.domain}`);
      return { ok: true };
    }

    // ── Weekly report ──
    case "getWeeklyReport": {
      const wk = weekKey();
      const data = await getLocal(["weeklyStats", "totalAds", "totalThreats", "trackerDomainStats", "domainStats"]);
      const ws = (data.weeklyStats || {})[wk] || { ads: 0, burns: 0 };
      const topTrackerSites = Object.entries(data.trackerDomainStats || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topAdSites = Object.entries(data.domainStats || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        week: wk, adsBlocked: ws.ads || 0, trackersBlocked: data.totalThreats || 0,
        burns: ws.burns || 0, totalAllTime: data.totalAds || 0,
        topTrackerSites, topAdSites
      };
    }

    // ── Filter sync meta ──
    case "getFilterSyncMeta": {
      const d = await getLocal(["filterSyncStatus", "filterSyncTime", "filterSyncCount", "filterSyncError"]);
      return { status: d.filterSyncStatus || null, lastSync: d.filterSyncTime || null, total: d.filterSyncCount || 0, error: d.filterSyncError || null };
    }

    case "getDynamicRuleCount": {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return { count: rules.length };
    }

    case "clearDynamicRules": {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const ids = rules.map(r => r.id);
      if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
      addActivityLog('🗑️ Dynamic rules cleared');
      return { ok: true };
    }

    case "syncFilterLists": {
      const logs = [];
      const result = await syncFilterLists(l => logs.push(l));
      if (result.ok) addActivityLog(`📥 Filter lists synced (${result.total} rules)`);
      else addActivityLog(`❌ Filter sync failed: ${result.error}`);
      return { ...result, logs };
    }

    // ── DNR count for current tab ──
    case "getDNRCount": {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      let site = "";
      if (tab?.url) { try { site = new URL(tab.url).hostname; } catch {} }
      let count = 0;
      try {
        // getDynamicRules() only reports rules added at runtime (always empty here) —
        // the real network-layer blocks come from the static rules.json ruleset, which
        // getMatchedRules() reports per-tab (requires declarativeNetRequestFeedback,
        // a Chrome-only permission -- this is why this file is the CHROME build and
        // is not the one bundled for Firefox/AMO; see background-firefox.js).
        //
        // NOTE: Chrome documents that getMatchedRules() only returns matches from the
        // last 5 minutes for a document that isn't newly navigated — older matches are
        // dropped from the API's own buffer, which is why the count used to silently
        // reset to 0 while the popup sat open ("shows, then disappears"). We blend in
        // our own persistent trackerDomainStats (built from real-time tracker messages
        // from content.js) so the badge doesn't lose the count once Chrome's 5-minute
        // window rolls over.
        if (tab?.id && chrome.declarativeNetRequest && typeof chrome.declarativeNetRequest.getMatchedRules === 'function') {
          const matched = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
          count = (matched && matched.rulesMatchedInfo) ? matched.rulesMatchedInfo.length : 0;
        }
      } catch (e) {
        // getMatchedRules can throw (e.g. quota exceeded — max 20 calls per 10 min
        // unless tied to a user gesture, or no permission for this URL). Don't let
        // that wipe the number; fall through to the persistent stat below instead.
      }
      if (site) {
        const { trackerDomainStats: tdsGet = {} } = await getLocal(["trackerDomainStats"]);
        const persisted = tdsGet[site] || 0;
        count = Math.max(count, persisted);
      }
      return { count, site };
    }

    // ── Custom rules (all domains) ──
    case "getAllCustomRules": {
      const { customRules = {} } = await getLocal(["customRules"]);
      const normalized = {};
      for (const [host, val] of Object.entries(customRules)) {
        normalized[host] = (Array.isArray(val) ? val : []).map(s =>
          typeof s === "string" ? { selector: s } : s
        );
      }
      return normalized;
    }

    case "deleteCustomRule": {
      const { customRules: dcr2 = {} } = await getLocal(["customRules"]);
      const host = msg.hostname || msg.domain;
      if (dcr2[host]) {
        dcr2[host] = dcr2[host].filter(s => (typeof s === "string" ? s : s?.selector) !== msg.selector);
        await setLocal({ customRules: dcr2 });
        addActivityLog(`🗑️ Custom rule deleted for ${host}`);
      }
      return { ok: true };
    }

    // ── Element picker ──
    case "startElementPickerOnTab": {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "startPicker" }).catch(() => {});
      return { ok: true };
    }

    // ── Focus mode ──
    case "getFocusStatus":
      return getFocusStatus();

    case "setFocusMode":
      await setFocusMode(msg.minutes || 0);
      return { ok: true };

    // ── Tab isolation ──
    case "setTabIsolation":
      tabIsolationEnabled = !!msg.enabled;
      await setLocal({ settings: { ...((await getLocal(["settings"])).settings || {}), tabIsolation: tabIsolationEnabled } });
      addActivityLog(tabIsolationEnabled ? '🛡️ Tab isolation enabled' : '🔓 Tab isolation disabled');
      return { ok: true };

    // ── Lock sites now ──
    case "lockSitesNow":
      lockVault();
      addActivityLog('🔒 All sites locked (vault)');
      return { ok: true };

    // ── Reset counters ──
    case "resetCount":
      await setLocal({ totalAds: 0, totalThreats: 0 });
      addActivityLog('🔄 Counters reset');
      return { ok: true };

    case "resetDomainStats":
      await setLocal({ domainStats: {}, trackerDomainStats: {} });
      addActivityLog('🔄 Domain stats reset');
      return { ok: true };

    // ── Clear logs ──
    case "clearLogs":
      await setLocal({ activityLogs: [] });
      await chrome.storage.session.set({ activityLogs: [] }).catch(() => {});
      return { ok: true };

    // ── Import settings ──
    // BUG FIX (#9): accept a backup file regardless of which browser (or
    // which extension version) produced it. We only ever read `.data` if
    // present, otherwise treat the whole JSON as the data object itself —
    // so both the new {app,format,version,sourceBrowser,data} envelope and
    // older/bare exports import cleanly on either Chrome or Firefox.
    case "importSettings": {
      try {
        if (!msg.json || typeof msg.json !== "string" || !msg.json.trim()) {
          return { ok: false, error: "Invalid file" };
        }
        let parsed;
        try {
          parsed = JSON.parse(msg.json);
        } catch (parseErr) {
          return { ok: false, error: "Invalid file" };
        }
        if (!parsed || typeof parsed !== "object") return { ok: false, error: "Invalid file" };
        const importData = (parsed.data && typeof parsed.data === "object") ? parsed.data : parsed;
        if (parsed.format && parsed.format !== "universal-v1") {
          console.warn("[BABASITARAM] Importing backup with unrecognized format tag:", parsed.format, "— attempting best-effort import anyway.");
        }
        const ALLOWED = ["settings","whitelist","dailySites","fireproofSites","vaultSites","timeLimits","customRules","pin","pinEnabled"];
        const safe = {};
        for (const k of ALLOWED) {
          if (!(k in importData)) continue;
          if (k === 'pin' && typeof importData[k] !== 'string') continue;
          if (k === 'pinEnabled' && typeof importData[k] !== 'boolean') continue;
          if (['whitelist','dailySites','fireproofSites','vaultSites'].includes(k) && !Array.isArray(importData[k])) continue;
          if (['settings','timeLimits','customRules'].includes(k) && (typeof importData[k] !== 'object' || Array.isArray(importData[k]))) continue;
          safe[k] = importData[k];
        }
        if (!Object.keys(safe).length) return { ok: false, error: "Invalid file" };
        await setLocal(safe);
        addActivityLog('📂 Settings imported');
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : "Invalid file" };
      }
    }

    // ── IP privacy / cookie clean / smart clean ──
    case "applyIPPrivacy":
    case "triggerCookieClean":
    case "triggerSmartClean":
      return { ok: true };

    // ── Nightly clear / auto history wipe ──
    case "setNightlyClear":
      setNightlyClear(!!msg.enabled);
      return { ok: true };

    case "setAutoHistoryWipe":
      setAutoHistoryWipe(msg.minutes || 0);
      return { ok: true };

    // ── Sync aliases ──
    case "pushToSync":
      await pushToSync();
      return { ok: true };

    case "pullFromSync":
      await pullFromSync();
      return { ok: true };

    // ── Page Exception: per-hostname cosmetic-only override ──
    case "togglePageException": {
      const cleanPE = (msg.hostname || "").replace(/^www\./, "");
      if (!cleanPE) return { ok: false, error: "no hostname" };
      const { pageExceptions: pe = [] } = await getLocal(["pageExceptions"]);
      const enable = msg.enable !== undefined ? !!msg.enable : !pe.includes(cleanPE);
      const updated = enable
        ? [...new Set([...pe, cleanPE])]
        : pe.filter(h => h !== cleanPE);
      await setLocal({ pageExceptions: updated });
      if (enable) addActivityLog(`🛠️ Page exception enabled for ${cleanPE} (cosmetic mode)`);
      else addActivityLog(`🔄 Page exception removed for ${cleanPE}`);
      const peTabId = msg.tabId || (sender && sender.tab ? sender.tab.id : null);
      if (peTabId) {
        chrome.tabs.sendMessage(
          peTabId,
          { action: "setPageException", enabled: enable, hostname: cleanPE }
        ).catch(() => {});
      }
      return { ok: true, enabled: enable, hostname: cleanPE };
    }

    // ── Get all page exceptions ──
    case "getPageExceptions": {
      const { pageExceptions: gpe = [] } = await getLocal(["pageExceptions"]);
      return { pageExceptions: gpe };
    }

    // ── Clear all page exceptions ──
    case "clearPageExceptions": {
      await setLocal({ pageExceptions: [] });
      addActivityLog('🧹 All page exceptions cleared');
      return { ok: true };
    }

    // ── Lightweight Mode ──
    case "toggleLightweightMode": {
      const { settings: lwS = {} } = await getLocal(["settings"]);
      const enabled = !!msg.enabled;
      lwS.lightweightMode = enabled;
      await setLocal({ settings: lwS });
      const allTabs = await chrome.tabs.query({});
      for (const t of allTabs) {
        if (t.id && t.url && !t.url.startsWith("chrome") && !t.url.startsWith("about")) {
          chrome.tabs.sendMessage(t.id, { action: "setLightweightMode", enabled }).catch(() => {});
        }
      }
      if (enabled) addActivityLog('⚡ Lightweight mode enabled');
      else addActivityLog('⚡ Lightweight mode disabled');
      return { ok: true, lightweightMode: enabled };
    }

    // ── Site Breakage Fix ──
    case "siteBreakageFix": {
      const fixHost = (msg.hostname || "").replace(/^www\./, "");
      if (!fixHost) return { ok: false, error: "no hostname" };
      const { pageExceptions: sfPE = [] } = await getLocal(["pageExceptions"]);
      if (!sfPE.includes(fixHost)) {
        await setLocal({ pageExceptions: [...sfPE, fixHost] });
        addActivityLog(`🛠️ Site breakage fix applied for ${fixHost}`);
      }
      bustProtectedCache();
      const senderTabId = (sender && sender.tab) ? sender.tab.id : null;
      if (senderTabId) {
        chrome.tabs.sendMessage(senderTabId, { action: "disableBlockingForSite" }).catch(() => {});
      }
      return { ok: true, hostname: fixHost };
    }

    // ── Clear breakage bypass ──
    case "clearBreakageBypass": {
      await setLocal({ breakageBypass: [] });
      bustProtectedCache();
      addActivityLog('🧹 All breakage bypasses cleared');
      return { ok: true };
    }

    // ── Emergency Site Disable ──
    case "toggleSiteDisable": {
      const { disabledSites = [] } = await getLocal(["disabledSites"]);
      const site = msg.hostname;
      const index = disabledSites.indexOf(site);
      if (index > -1) {
        disabledSites.splice(index, 1);
        addActivityLog(`🔄 Site re-enabled: ${site}`);
      } else {
        disabledSites.push(site);
        addActivityLog(`⛔ Site disabled (emergency): ${site}`);
      }
      await setLocal({ disabledSites });
      bustProtectedCache();
      return { ok: true, enabled: index === -1 };
    }

    default:
      return { error: "unknown action" };
  }
}

// ── Alarms ──────────────────────────────────────────────────────
chrome.alarms.create("ping",        { periodInMinutes: PING_INTERVAL_MINUTES });
chrome.alarms.create("filterSync",  { periodInMinutes: FILTER_SYNC_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "ping") {
    chrome.storage.local.set({ lastPing: Date.now(), pingVersion: VERSION });
  } else if (alarm.name === "filterSync") {
    await syncFilterLists(() => {});
    addActivityLog('📥 Scheduled filter sync completed');
  } else if (alarm.name === "nightlyClear") {
    await clearNonDailyData();
    addActivityLog('🌙 Nightly clear executed');
  } else if (alarm.name === "autoHistoryWipe") {
    const { fireproofSites: fph=[], whitelist: wlh=[] } = await getLocal(["fireproofSites","whitelist"]);
    const _protH = [...new Set([...fph,...wlh])];
    const _hItems = await chrome.history.search({ text:"", startTime:0, maxResults:100000 });
    let count = 0;
    for (const _hi of _hItems) {
      try {
        const _hh = new URL(_hi.url).hostname.replace(/^www./,"");
        if (!_protH.some(fp => _hh===fp || _hh.endsWith("."+fp))) {
          chrome.history.deleteUrl({url:_hi.url}).catch(()=>{});
          count++;
        }
      } catch {}
    }
    addActivityLog(`⏱️ Auto history wipe executed (${count} entries)`);
  }
});