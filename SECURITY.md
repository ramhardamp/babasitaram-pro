# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 9.2.x   | ✅ Active  |
| < 9.2   | ❌ No longer maintained |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

If you discover a security vulnerability, please report it privately:

1. Open a [GitHub Security Advisory](https://github.com/yourusername/babasitaram-pro/security/advisories/new)
2. Or email: security@yourdomain.com (replace with your actual address)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We will respond within **48 hours** and aim to release a fix within **7 days** for critical issues.

## Security Design Principles

BABASITARAM PRO is designed with security as a core requirement:

### Zero External Data Transmission
- No telemetry, no analytics, no crash reports
- No data is ever sent to any external server by us
- The **only** external call is the HIBP Breach Alert — made directly from your browser to `api.haveibeenpwned.com` using **your own API key**, which you supply

### Storage Security
- All settings stored in `chrome.storage.local` (device-only)
- Optional sync via `chrome.storage.sync` (synced via your Google/Firefox account)
- Your HIBP API key is stored in `chrome.storage.local` only — not in code, not hardcoded, not on any server
- Vault PINs stored locally — never transmitted

### DOM Security
- **Zero `innerHTML` assignments** in production code
- All user-influenced content inserted via `textContent` or `createElement`/`appendChild`
- CSS selectors from page DOM (element picker) rendered via `textContent` (protected against DOM-XSS)
- All template literals that historically touched HTML are gone — pure DOM API throughout

### Extension Context Security
- All `chrome.runtime.sendMessage` calls wrapped in `safeSendMessage()` — checks `chrome.runtime.id` before sending, handles `lastError`
- Content scripts use `safeSendMessage()` — graceful degradation if extension reloads mid-session

### Permission Justification
Every permission is required:

| Permission | Why |
|---|---|
| `storage` | Store all settings, stats, and site lists locally |
| `tabs` | Read current tab URL for per-site features (vault, time limits, tracker stats) |
| `cookies` | Cookie Cleaner feature |
| `browsingData` | Emergency Burn (wipe history, cache, etc.) |
| `history` | History Guard (auto-delete non-whitelisted history) |
| `declarativeNetRequest` | Ad blocking rule engine |
| `declarativeNetRequestFeedback` | Per-tab match counts (Chrome only) |
| `alarms` | Nightly auto-clear, filter sync refresh, ping keepalive |
| `webNavigation` | Detect page navigations for Focus Mode, time limits, vault |
| `idle` | Detect when user leaves PC (triggers site lock, auto-clear) |
| `contextMenus` | Right-click menu for adding sites to lists |
| `<all_urls>` host permission | Content script must run on all sites to block ads and show banners |

