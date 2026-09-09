# Architecture Overview

## Source Tree

```
src/
├── shared/     All files bundled into BOTH Chrome and Firefox packages
├── chrome/     Chrome-only files (service worker + Chrome manifest)
└── firefox/    Firefox-only files (event page + Firefox manifest)
```

## Why Two Background Files?

Chrome MV3 and Firefox MV3 differ fundamentally in how they handle background scripts:

```
Chrome MV3:                     Firefox MV3:
─────────────────────────       ─────────────────────────
Service Worker                  Event Page (plain script)
├── importScripts() ✅           ├── importScripts() ❌
├── getMatchedRules() ✅         ├── getMatchedRules() ❌ (not implemented)
└── background.js runs as SW    └── background.js runs as event page
```

AMO's static linter scans every file in the submitted package by AST. If the token `declarativeNetRequest.getMatchedRules` appears anywhere — even in dead code, comments excluded — it fires the `UNSUPPORTED_API` warning. There is no runtime guard or feature check that satisfies the linter. The only solution is to ensure the string is absent from every file in the Firefox ZIP.

The Firefox background achieves equivalent per-tab tracker counts by reading `trackerDomainStats` — a persistent counter built incrementally by `content.js` every time a tracker is detected and sent via the `trackerBlocked` message. This is the same fallback Chrome uses once `getMatchedRules` rolls over its 5-minute buffer anyway, so behaviour is identical.

## Message Bus

All inter-component communication flows through `chrome.runtime.sendMessage` / `onMessage`:

```
content.js ──── safeSendMessage() ──── background.js (handleMessage switch)
popup.js ─────── safeSendMessage() ──┘
password-guard.js ── direct storage reads (no message needed)
element-picker.js ── safeSendMessage() ─┘
```

`safeSendMessage()` in every sender file:
1. Checks `chrome.runtime.id` — if undefined (context invalidated after extension reload), calls callback with `{ ok: false, error: '...' }` instead of throwing
2. Checks `chrome.runtime.lastError` in the callback — catches Firefox's silent failure mode (callback fires with `undefined`, no error thrown)
3. Wraps everything in try/catch for synchronous throws

## Filter Pipeline

```
EasyList (easylist.to)       ┐
EasyPrivacy (easylist.to)    ├──► filter-list-worker.js (Web Worker)
uBO Annoyances (github)      ┘         │
                                       │  ABP syntax → DNR rule objects
                                       ▼
                           chrome.declarativeNetRequest
                           .updateDynamicRules()
                                       │
                                       ▼
                           Every network request matched
                           against up to ~30,000 dynamic rules
                           + 100 static rules (rules.json)
```

Filter lists are synced every 12 hours via a Chrome alarm. The worker parses the raw ABP/uBO filter text (handles `##`, `@@`, `||`, `^`, `$`) and converts it to DNR `block` / `allow` / `hideMatchedElement` rules. Static rules (`rules.json`) cover the highest-priority always-on patterns.

## Storage Layout

```
chrome.storage.local:
  settings              object     All toggle states (adBlocker, HTTPS, etc.)
  whitelist             string[]   Trusted domains (Fireproof main list)
  dailySites            string[]   Daily workspace sites
  fireproofSites        string[]   Fireproof + auto-protected SSO/root domains
  vaultSites            string[]   Vault-protected sites
  pin                   string     Vault/lock PIN (plaintext — local only)
  pinEnabled            boolean    Whether site lock is active
  timeLimits            object     { domain: { limit, spent, pct } }
  customRules           object     { domain: [{ selector }] }
  totalAds              number     Lifetime ads blocked
  totalThreats          number     Lifetime trackers blocked
  domainStats           object     { domain: count } per-domain ad blocks
  trackerDomainStats    object     { domain: count } per-domain tracker hits
  weeklyStats           object     Per-week bucketed stats
  activityLogs          object[]   Last 10 activity entries
  paymentSitesVisited   object[]   Payment site visit log
  filterSyncMeta        object     Last sync timestamp, status, rule count
  hibpApiKey            string     User's HaveIBeenPwned API key
  unlockedSites         string[]   Sites unlocked this session (site lock)
  focusMode             boolean    Focus mode active flag
  focusModeUntil        number     Focus mode end timestamp (ms)
  focusSites            string[]   Sites blocked during focus sessions

chrome.storage.sync:
  blockedSites, allowedSites, focusMode, focusSites, vaultSites,
  vaultPin, timeLimits, customRules, burnOnClose, idleTimeout,
  notificationsEnabled
  (synced across devices via Google/Firefox account)
```

## Content Script Flow

On every page load:

```
document_start: content.js
  1. Check if page is on vault/focus/daily list → redirect if needed
  2. Observe DOM for new network elements (img, script, iframe, link)
  3. Run TRACKER_REGEX against each src/href → report trackerBlocked
  4. Observe <link rel="preload">, <link rel="prefetch"> → block/report
  5. After 2s + 6s: full scanPageTrackers() sweep of the current DOM

document_start: custom-rules-inject.js
  1. Load custom rules for this domain from storage
  2. Inject <style> tag with block rules immediately

document_idle: password-guard.js
  1. Check if site lock is enabled
  2. Check if current domain is in whitelist/vault
  3. If locked and not whitelisted/unlocked → render PIN screen

document_idle: element-picker.js
  1. Wait for startElementPicker message from popup
  2. On receive: inject toolbar, highlight hovered elements
  3. On click: show confirm bubble → save rule → inject block style
```
