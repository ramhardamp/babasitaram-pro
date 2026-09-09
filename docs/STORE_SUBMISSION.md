# Store Submission Guide

## Chrome Web Store

### Build
```bash
bash scripts/build.sh chrome
# → babasitaram-pro-chrome-9.2.4.zip
```

### Upload
1. Go to https://chrome.google.com/webstore/devconsole
2. Click **New Item** → Upload `babasitaram-pro-chrome-9.2.4.zip`
3. Fill in store listing (see below)
4. Submit for review

### Listing Details

**Name:** BABASITARAM PRO

**Summary (132 chars max):**
> Ultimate Privacy Shield: 100k+ Ad Rules, Vault, Focus Mode, Emergency Burn, Tab Isolation, Element Picker & Breach Alert

**Category:** Privacy & Security

**Language:** English (Hindi UI elements are decorative)

**Screenshots required:** 1280×800 or 640×400 (at least 1, up to 5)

### Compliance Notes
- ✅ MV3 service worker (no `scripts` key)
- ✅ Zero `innerHTML` assignments
- ✅ Zero `eval` / `Function` constructor
- ✅ All permissions justified
- ✅ No remote code execution
- ✅ No external data transmission (HIBP = user's own API key + direct browser call)

---

## Firefox AMO

### Build
```bash
bash scripts/build.sh firefox
# → babasitaram-pro-firefox-9.2.4.zip
```

### Upload
1. Go to https://addons.mozilla.org/en-US/developers/
2. Click **Submit a New Add-on** → Upload `babasitaram-pro-firefox-9.2.4.zip`
3. Choose **On this site** (listed) or **By myself** (unlisted)
4. Fill in listing details
5. Submit for review

### AMO Listing Details

**Name:** BABASITARAM PRO

**Summary (250 chars max):**
> Ultimate privacy shield: 100k+ ad rules, Vault mode (site lock), Focus Mode, Emergency Burn (one-click full wipe), Tab Isolation, Element Picker, Cookie Cleaner, Breach Alert. Free and open source.

**Categories:** Privacy & Security, Appearance

### AMO Compliance Notes
- ✅ MV3 `scripts` array (no `service_worker`)
- ✅ `browser_specific_settings.gecko.strict_min_version: "142.0"`
- ✅ `data_collection_permissions` correctly structured
- ✅ Zero `getMatchedRules` in Firefox background (removed entirely, not guarded)
- ✅ Zero `innerHTML` assignments
- ✅ Zero `createContextualFragment` calls
- ✅ All CSS built via `textContent` on `<style>` nodes (password-guard.js)
- ✅ Gecko add-on ID set: `babasitaram-pro@example.com`
- ✅ Source code available (link this GitHub repo in AMO submission)

### AMO Source Code Requirement
AMO may ask for source code. Upload a ZIP of this entire repository root. The `scripts/build.sh` script is the reproducible build process — AMO reviewers can run it and verify the output matches the submitted ZIP.

---

## Release Process (GitHub → Stores)

```bash
# 1. Update version in both manifests
#    src/chrome/manifest.json → "version": "9.2.5"
#    src/firefox/manifest.json → "version": "9.2.5"

# 2. Update CHANGELOG.md with new version entry

# 3. Run full validation
bash scripts/validate.sh

# 4. Build both packages
bash scripts/build.sh all

# 5. Test both packages locally before uploading

# 6. Commit and tag
git add .
git commit -m "chore: release v9.2.5"
git tag v9.2.5
git push origin main --tags

# → GitHub Actions automatically creates a Release with both ZIPs attached
# → Download ZIPs from GitHub Release and upload to each store
```
