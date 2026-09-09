// ═══════════════════════════════════════════════════════════════
// BABASITARAM PRO v8 — Focus Mode
// Sirf whitelist sites allow, baaki sab block. Timer ke saath.
// ═══════════════════════════════════════════════════════════════

const FOCUS_RULE_ID = 9999; // Reserved DNR rule ID for focus mode

async function enableFocusMode(whitelistedDomains, durationMinutes) {
    // Block all navigation to non-whitelisted domains
    // Using webNavigation.onBeforeNavigate (already in background.js)
    const until = durationMinutes > 0 ? Date.now() + durationMinutes * 60000 : 0;
    await chrome.storage.local.set({
        focusMode: true,
        focusModeUntil: until,
        focusDuration: durationMinutes
    });
    if (durationMinutes > 0) {
        chrome.alarms.create('focusModeEnd', { delayInMinutes: durationMinutes });
    }
    return { ok: true, until };
}

async function disableFocusMode() {
    chrome.alarms.clear('focusModeEnd');
    await chrome.storage.local.set({ focusMode: false, focusModeUntil: 0 });
    return { ok: true };
}

async function checkFocusMode(url, whitelist) {
    const d = await chrome.storage.local.get({ focusMode: false, focusModeUntil: 0 });
    if (!d.focusMode) return false;
    if (d.focusModeUntil > 0 && Date.now() > d.focusModeUntil) {
        await disableFocusMode();
        return false;
    }
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (url.startsWith('chrome') || url.startsWith('extension')) return false;
        const allowed = (whitelist || []).some(w => {
            const wc = w.trim().toLowerCase().replace(/^www\./, '');
            return wc && (host === wc || host.endsWith('.' + wc));
        });
        return !allowed;
    } catch(e) { return false; }
}

if (typeof module !== 'undefined') module.exports = { enableFocusMode, disableFocusMode, checkFocusMode };
