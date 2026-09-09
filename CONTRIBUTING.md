# Contributing to BABASITARAM PRO

Thank you for your interest in contributing! This guide will get you set up quickly.

---

## 🚀 Getting Started

```bash
git clone https://github.com/yourusername/babasitaram-pro.git
cd babasitaram-pro
```

Load the extension locally:

**Chrome:**
1. `bash scripts/build.sh chrome` → creates `dist/chrome/`
2. Open `chrome://extensions`
3. Enable **Developer Mode**
4. Click **Load Unpacked** → select `dist/chrome/`

**Firefox:**
1. `bash scripts/build.sh firefox` → creates `dist/firefox/`
2. Open `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select `dist/firefox/manifest.json`

---

## 📁 Where to Find Things

| What you want to change | File |
|---|---|
| Popup UI (tabs, buttons, cards) | `src/shared/popup.html` |
| Popup logic (all event handlers, data display) | `src/shared/popup.js` |
| Tracker / ad detection in pages | `src/shared/content.js` |
| Background (ad counts, message handler, burn, vault, etc.) | `src/chrome/background.js` AND `src/firefox/background.js` |
| Filter list sync (EasyList parsing) | `src/shared/filter-sync.js` |
| Element picker UI | `src/shared/element-picker.js` |
| Site lock / PIN screen | `src/shared/password-guard.js` |
| New tab page | `src/shared/newtab.js` / `newtab.html` |
| Shared utilities (esc, sleep, weekKey, formatTime) | `src/shared/utils.js` |
| Chrome-only features (getMatchedRules) | `src/chrome/background.js` ONLY |

---

## ⚠️ Critical Rules

### 1. Never write `innerHTML =` in any JS file

AMO's automated scanner flags every `.innerHTML =` assignment — even with escaped content. Always use the DOM builder helpers:

```js
// ✅ CORRECT — use el() helper
const row = el('div', { className: 'bar-row' },
  el('span', { className: 'label' }, domain),
  el('span', { style: { color: '#00ff88' } }, String(count))
);
replaceContent(container, row);

// ❌ WRONG — flagged by AMO
container.innerHTML = `<div class="bar-row"><span>${esc(domain)}</span>...</div>`;
```

### 2. Never add `getMatchedRules` to `src/firefox/background.js`

This API string is flagged by AMO's static scanner **by name** — no runtime check prevents the flag. Keep it in `src/chrome/background.js` only. If you need per-tab counts on Firefox, use `trackerDomainStats` (accumulated by content.js).

### 3. Always update **both** background files for shared logic changes

If you change the message handler, storage keys, or any shared feature, update both:
- `src/chrome/background.js`
- `src/firefox/background.js`

### 4. Run validation before every commit

```bash
bash scripts/validate.sh
```

This must exit with **0 failures**. The CI workflow will fail your PR if it doesn't pass.

---

## 🔧 Making Changes

### Adding a new popup feature

1. Add your HTML to the appropriate tab in `src/shared/popup.html`
2. Add event listeners and data logic in `src/shared/popup.js`
3. Use `el()` / `replaceContent()` for any DOM construction — never `innerHTML`
4. Add the background message handler in **both** `src/chrome/background.js` and `src/firefox/background.js`
5. Test in both Chrome and Firefox before submitting

### Adding a new background feature

1. Implement in `src/chrome/background.js`
2. Port to `src/firefox/background.js` — if the feature uses Chrome-only APIs (`getMatchedRules`, etc.), add a compatible fallback instead
3. Add the new message `action` to the `handleMessage` switch in both files

### Adding a new tracker pattern

Edit the `TRACKER_PATTERNS` array in `src/shared/content.js`. Use minimal regex — each pattern is compiled into a single combined RegExp that runs on every page.

---

## ✅ PR Checklist

Before opening a Pull Request:

- [ ] `bash scripts/validate.sh` exits with 0 failures
- [ ] `bash scripts/build.sh all` completes without errors
- [ ] Feature works correctly in **Chrome** (tested locally)
- [ ] Feature works correctly in **Firefox** (tested locally)  
- [ ] No `innerHTML` assignments added
- [ ] No `getMatchedRules` added to `src/firefox/background.js`
- [ ] Both background files updated for any shared logic
- [ ] Entry added to `CHANGELOG.md` under `[Unreleased]`
- [ ] PR title follows: `feat: ...` / `fix: ...` / `docs: ...` / `refactor: ...`

---

## 🐛 Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:
- Browser + version
- Extension version
- Exact steps to reproduce
- Console errors (F12 → Console)

---

## 💡 Requesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md).

---

## 📜 Code Style

- **No semicolons** in `popup.js` (existing style)
- **`const`/`let`** — no `var` in new code
- **Arrow functions** preferred
- **No external dependencies** — this extension ships zero npm packages
- **All DOM construction via `el()`** — no HTML strings

---

## 📄 License

By contributing, you agree your code will be licensed under the [MIT License](LICENSE).
