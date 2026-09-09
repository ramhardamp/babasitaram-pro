// ═══════════════════════════════════════════════════════════════
// BABASITARAM PRO — Shared Utils
// Common helpers used across background.js, filter-sync.js,
// popup.js, newtab.js.
// ═══════════════════════════════════════════════════════════════

// XSS prevention helper — escape all user-controlled strings before innerHTML
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Promise-based delay
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ISO-ish week key, e.g. "2026-W36" — used to bucket weekly stats
function getWeekKey(date) {
    const d = date ? new Date(date) : new Date();
    const s = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + '-W' + Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7);
}

// Format a duration in seconds as a short human string: "45s", "12min", "1h 5m"
function formatTime(sec) {
    sec = Number(sec) || 0;
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'min';
    return Math.floor(sec / 3600) + 'h ' + Math.round((sec % 3600) / 60) + 'm';
}

// True if hostname equals domain or is a subdomain of it
function isDomainMatch(hostname, domain) {
    if (!hostname || !domain) return false;
    hostname = String(hostname).toLowerCase();
    domain = String(domain).toLowerCase().replace(/^\*\./, '').replace(/^\./, '');
    return hostname === domain || hostname.endsWith('.' + domain);
}

// Export for CommonJS/module contexts; in classic-script contexts
// (importScripts / <script>) these stay as plain globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { esc, sleep, getWeekKey, formatTime, isDomainMatch };
}
