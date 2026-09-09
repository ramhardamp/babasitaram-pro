# Changelog

All notable changes to BABASITARAM PRO are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [9.2.4] — 2026-09-09

### Fixed — Store Compliance (Critical)
- **Split background into two separate files** (`background-chrome.js` → `src/chrome/background.js`, `background-firefox.js` → `src/firefox/background.js`). Root cause: AMO's static scanner flags `declarativeNetRequest.getMatchedRules` by AST node name, independent of any runtime guard. The only durable fix is to ensure the token simply does not exist in any file included in the Firefox package.
- **Removed all `innerHTML` assignments** from `popup.js`. AMO's scanner flags any assignment to `.innerHTML` — even on a detached `<template>` element. Replaced `setHTML()` helper with a real DOM-builder API: `el()`, `clearNode()`, `replaceContent()`, `emptyMsg()`. All 22 former call sites rewritten as genuine `createElement`/`appendChild` trees.
- **`strict_min_version` updated to `142.0`** in Firefox manifest (required for `data_collection_permissions` to pass AMO manifest validation).

### Fixed — Runtime Bugs
- **Extension context invalidated error**: `safeSendMessage()` wrapper added on all 41 `chrome.runtime.sendMessage` call sites. Guards `chrome.runtime.id` before sending; catches `chrome.runtime.lastError` (silent failures on Firefox); wraps in try/catch for synchronous throws.
- **Firefox import silent failure**: `importSettings` handler now validates empty/null/non-string input, has a dedicated try/catch around `JSON.parse`, returns `{ ok: false, error: "Invalid file" }` for all failure modes. Popup surfaces `r.error` in the toast so the user sees exactly what went wrong.
- **Fireproof banner checkbox not responding**: Listener moved from `dismissCheck.onchange` (label element) to `cb.addEventListener('change', …)` (the input element). Close button changed from `closeBtn.onclick =` to `closeBtn.addEventListener('click', …)`.

### Changed
- Build system formalised: `scripts/build.sh` and `scripts/validate.sh` added. CI via GitHub Actions (`.github/workflows/build.yml`, `release.yml`).
- Repo structure reorganised: `src/shared/`, `src/chrome/`, `src/firefox/`.

---

## [9.2.2] — 2026-08-15

### Added
- Weekly Privacy Report (ads, trackers, top offender sites, burn count, export to CSV)
- Custom Block Rules (per-site CSS selectors via Element Picker or manual entry)
- Filter List Sync: EasyList + EasyPrivacy + uBO Annoyances, auto-refresh every 12 h
- Focus Mode Deep Work timer (15 min / 1 hr / 2 hr / custom)
- Tab Isolation toggle (3rd-party cookie blocking per tab)
- DNS-over-HTTPS (Cloudflare / Google / Quad9 via `chrome://settings/security`)
- Breach Alert with HIBP v3 API (user-supplied API key, stored locally)
- Cloud Sync (push / pull via `chrome.storage.sync`)

### Fixed
- `importScripts()` guard (`typeof importScripts === 'function'`) prevents crash on Firefox event-page background where `importScripts` is undefined
- `filter-sync.js` loaded via manifest `scripts` array on Firefox (not via `importScripts`)

---

## [9.2.0] — 2026-07-01

### Added
- Vault Mode — password-protect individual sites (PIN stored in local storage)
- Emergency Burn button — one-click full wipe (history, cookies, cache, formData, IndexedDB, serviceWorkers) with confirmation modal
- Cookie Cleaner with per-domain stats and auto-clean on idle
- Per-site time limits with visual progress bars
- Nightly auto-clear alarm

### Changed
- Popup redesigned with 7-tab layout: Monitor, PRO, Logs, Fireproof, Stats, v8, Settings
- Tracker detection regex expanded to 50+ known tracker patterns

---

## [9.0.0] — 2026-05-01

### Added
- Initial MV3 release (Chrome + Firefox)
- 100k+ ad rule base (EasyList)
- Fireproof Daily Workspace (preserve sessions for listed sites)
- History Guard (auto-delete non-whitelisted history)
- Exit Auto-Clear (wipe on browser close)
- Force HTTPS toggle
- Global ad blocker toggle
- Element Picker (point-and-click site element blocking)
- New Tab page override with live stats
- Site Lock (PIN on all sites when idle)
- Import / Export settings (universal JSON)
- Activity log (last 10 entries)
