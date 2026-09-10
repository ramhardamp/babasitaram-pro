# Privacy Policy — BABASITARAM PRO

**Last updated:** September 2026

**Applies to:**
- BABASITARAM PRO — Ultimate Privacy Shield (v9.2.4)
- BABASITARAM PRO Password Manager (v5.13)

**Developer:** VIKRAM SINGH RAJPUT

---

## 🔒 Our Commitment

**BABASITARAM PRO does not operate any backend server, and the developer does not collect, receive, or have access to any of your data.**

All settings, preferences, and statistics are stored **locally on your device** using the browser's built-in storage APIs (`chrome.storage.local`). This data never leaves your device unless you explicitly export it yourself.

We do **not** collect:
- ❌ Personal information (name, email, address, etc.)
- ❌ Browsing history
- ❌ Usage statistics
- ❌ Analytics or telemetry
- ❌ Cookies or credentials
- ❌ Health, financial, or authentication data
- ❌ Location data

**No account is required. No tracking. No ads. 100% private.**

---

## 📌 What Data Is Stored, And Where

The following data is stored **locally on your device** using `chrome.storage.local`:

| Data Type | Purpose |
|---|---|
| **Settings & Preferences** | To remember your chosen configuration (ad blocker, HTTPS, etc.) |
| **Whitelist / Fireproof Sites** | To protect specific sites from cleaning |
| **Vault Sites** | To password-protect sensitive sites |
| **PIN (hashed)** | To unlock the Vault — stored locally, never transmitted |
| **Custom Block Rules** | To remember element picker and CSS rules |
| **Time Limits** | To track daily time spent per domain |
| **Activity Logs** | To show recent activity in the popup |
| **Statistics** | To display ads blocked, trackers blocked, etc. |

This data **never leaves your device** unless you explicitly use the **Export Backup** feature (Settings → Export Backup). Even then, the exported file is saved on your own device and is not transmitted to us.

---

## ☁️ Browser Sync (Optional)

If you enable the extension's **"Cloud Sync"** option:

- A small subset of your settings is stored using `chrome.storage.sync`
- This is operated by your **browser vendor** (Mozilla, Microsoft, or Google), **not by us**
- This only runs if you turn it on
- It only syncs between your own signed-in devices

---

## 🌐 Network Requests This Extension Makes

### 1. Filter List Updates (Automatic)
The extension periodically downloads publicly published ad/tracker block-lists:

- **EasyList** (https://easylist.to/)
- **EasyPrivacy** (https://easylist.to/)
- **uBlock Origin's Annoyances list** (https://ublockorigin.com/)

These are plain list downloads from their official hosts. **No information about you or your browsing is sent.**

### 2. Breach Alert (Optional, User-Initiated)
If you use the **"Breach Alert"** feature:

- The email address you type is sent directly to `haveibeenpwned.com`'s public API
- This only happens when you press **"Check"**
- Only the email address you enter is sent — **nothing else**
- **Never to us** — we don't have any servers
- You must provide your own free HIBP API key (available at haveibeenpwned.com/API/Key)

### 3. DNS-over-HTTPS (Optional)
If you enable a DoH provider in Settings:

- Your browser's DNS resolution is routed through the provider you choose (e.g., Cloudflare, Google, Quad9)
- This uses your browser's native DoH support
- **We do not proxy or see this traffic**

---

## 🔑 Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `storage` | To save your settings/lists locally |
| `tabs` | To know the current tab's URL for per-site features |
| `cookies`, `browsingData`, `history` | Used only for Cookie Cleaner, Emergency Burn, and Fireproof features — all local, user-initiated |
| `declarativeNetRequest` | To block ads/trackers at the network layer |
| `webNavigation` | To detect page navigation for site-specific features |
| `idle` | To trigger auto-cleanup when the browser is idle |
| `alarms` | To schedule periodic filter list updates and nightly cleanup |
| `contextMenus` | To add right-click menu items ("Block this site", "Pick element") |
| `host_permissions` (`<all_urls>`) | Required so ad-blocking, site-lock, and element picker can run on any site you visit |

**All permissions are used exclusively for local functionality. No data is transmitted to any external server.**

---

## 🔗 Third Parties

**We do not sell, rent, or share any data, because we never receive any.**

The only third parties your browser ever talks to as a direct result of using this extension are:

| Service | Purpose | When It Runs |
|---|---|---|
| EasyList / EasyPrivacy | Filter list downloads | Automatically (periodic) |
| uBlock Origin Annoyances | Filter list downloads | Automatically (periodic) |
| haveibeenpwned.com | Breach Alert (optional) | Only when you press "Check" |

---

## 🧒 Children's Privacy

This extension does not knowingly collect any personal information from children under 13. The extension is designed for general use and does not target children.

---

## 📝 Changes to This Policy

If this policy changes, the updated version will be included with the next extension update and posted to:

[https://github.com/ramhardamp/babasitaram-pro](https://github.com/ramhardamp/babasitaram-pro)

The "Last updated" date at the top of this page will also be revised.

---

## 📬 Contact

Questions about this policy:

📧 **ramhardamp@gmail.com**

**Developer:** VIKRAM SINGH RAJPUT  
**GitHub:** [https://github.com/ramhardamp/babasitaram-pro](https://github.com/ramhardamp/babasitaram-pro)

---

## ✅ Summary

| Question | Answer |
|---|---|
| Do you collect my data? | ❌ **No** |
| Do you store my data on your servers? | ❌ **No** |
| Do you sell my data? | ❌ **No** |
| Do you share my data? | ❌ **No** |
| Do you use analytics or telemetry? | ❌ **No** |
| Is my data stored locally? | ✅ **Yes** |
| Can I export my data? | ✅ **Yes** (Settings → Export Backup) |
| Can I delete my data? | ✅ **Yes** (uninstall the extension) |
| Is my PIN transmitted anywhere? | ❌ **Never** |
| Is my browsing history sent anywhere? | ❌ **Never** |
| Does Breach Alert send data to you? | ❌ **No** — it goes directly to HIBP |

---

**BABASITARAM PRO is, and always will be, 100% free. No paywalls, no locked features, no telemetry, no tracking. Your privacy is the product — not you.**
