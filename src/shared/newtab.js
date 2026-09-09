// Safe text helper — prevents XSS via innerHTML
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const $ = id => document.getElementById(id);
let pinBuf = "";

function updateDots(val) {
    for (let i = 0; i < 4; i++) {
        $("d" + i).classList.toggle("filled", i < val.length);
    }
}

function getWeekKey() {
    const d = new Date(), s = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + "-W" + Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7);
}

let clockInterval = null; // memory leak fix

function checkSessionUnlock() {
    chrome.storage.local.get({ pin: "", pinEnabled: false, pinSessionUntil: 0 }, d => {
        const now = Date.now();
        // PIN enabled hai aur session expire ho gaya hai — lock dikhao
        if (d.pinEnabled && d.pin && d.pinSessionUntil <= now) {
            $("lockView").style.display = "flex";
            $("unlockedView").style.display = "none";
        } else {
            showUnlocked();
        }
    });
}

function showUnlocked() {
    $("lockView").style.display = "none";
    $("unlockedView").style.display = "flex";
    updateClock();
    // Memory leak fix: pehla interval clear karo, naya banao
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);
    chrome.storage.local.get({ totalAds: 0, weeklyStats: {}, whitelist: [], settings: {} }, d => {
        $("ntAds").textContent = d.totalAds || 0;
        const week = getWeekKey();
        const ws = (d.weeklyStats || {})[week] || { burns: 0 };
        $("ntBurns").textContent = ws.burns || 0;

        const s = d.settings || {};
        const ipOn = s.ipPrivacy !== false;
        const adOn = s.adBlocker !== false;

        $("ipBadge").textContent = ipOn ? "ON" : "OFF";
        $("ipBadge").className = ipOn ? "nt-stat-num g" : "nt-stat-num r";

        $("adBadge").textContent = adOn ? "ON" : "OFF";
        $("adBadge").className = adOn ? "nt-stat-num g" : "nt-stat-num r";

        // Render Whitelist
        // VALIDATION FIX (#4/#5): rebuilt with real DOM nodes instead of an
        // innerHTML template string. This also fixes a real functional bug:
        // the old markup used onmouseover/onmouseout HTML attributes, which
        // Manifest V3's default CSP (script-src 'self') can block inline —
        // so the hover glow silently never worked. Hover styling is now
        // wired up with addEventListener instead.
        const ntWhitelist = $("ntWhitelist");
        if (ntWhitelist) {
            while (ntWhitelist.firstChild) ntWhitelist.removeChild(ntWhitelist.firstChild);
            const sites = (d.whitelist || []).filter(url => {
                const rawHost = url.replace(/^https?:\/\//, '').replace(/\/.*/, '').toLowerCase();
                return /^[a-z0-9][a-z0-9.-]{0,252}\.[a-z]{2,}$/.test(rawHost);
            });
            if (!sites.length) {
                const empty = document.createElement('div');
                empty.style.color = 'var(--muted)';
                empty.style.fontSize = '12px';
                empty.textContent = 'No trusted sites added yet';
                ntWhitelist.appendChild(empty);
            } else {
                sites.forEach(url => {
                    const rawHost = url.replace(/^https?:\/\//, '').replace(/\/.*/, '').toLowerCase();
                    const a = document.createElement('a');
                    a.href = `https://${rawHost}`;
                    a.textContent = url;
                    a.style.cssText = "background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:var(--accent);padding:8px 16px;border-radius:20px;text-decoration:none;font-size:13px;font-family:var(--ui);font-weight:600;transition:0.3s;";
                    a.addEventListener('mouseover', () => { a.style.borderColor = 'var(--accent)'; a.style.boxShadow = '0 0 15px rgba(0,212,255,0.4)'; });
                    a.addEventListener('mouseout', () => { a.style.borderColor = 'rgba(0,212,255,0.3)'; a.style.boxShadow = 'none'; });
                    ntWhitelist.appendChild(a);
                });
            }
        }
    });
}

function toggleSetting(key) {
    chrome.storage.local.get({ settings: {} }, d => {
        const s = d.settings || {};
        const currentlyOn = s[key] !== false; // undefined/true => ON by default
        s[key] = !currentlyOn;
        chrome.storage.local.set({ settings: s }, () => {
            chrome.runtime.sendMessage({ action: "updateSettings", settings: s });
            showUnlocked(); // Refresh UI
        });
    });
}

$("ipStat").onclick = () => toggleSetting('ipPrivacy');
$("adStat").onclick = () => toggleSetting('adBlocker');

function updateClock() {
    const now = new Date();
    $("ntTime").textContent = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

    const days = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
    const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();

    $("ntDate").textContent = `${day}, ${date} ${month} ${year}`;
}

function verifyPin() {
    chrome.storage.local.get({ pin: "", pinSessionMinutes: 0 }, d => {
        if (pinBuf === d.pin) {
            if (d.pinSessionMinutes > 0) {
                const until = Date.now() + d.pinSessionMinutes * 60 * 1000;
                chrome.storage.local.set({ pinSessionUntil: until });
            }
            showUnlocked();
        } else {
            $("lockError").textContent = "❌ Wrong PIN";
            pinBuf = "";
            updateDots(pinBuf);
            setTimeout(() => { $("lockError").textContent = ""; }, 1500);
        }
    });
}

document.querySelectorAll(".num-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const n = btn.dataset.n;
        if (n === "C") { pinBuf = ""; updateDots(pinBuf); $("lockError").textContent = ""; return; }
        if (n === "OK") { verifyPin(); return; }
        if (pinBuf.length < 4) { pinBuf += n; updateDots(pinBuf); }
        if (pinBuf.length === 4) setTimeout(verifyPin, 100);
    });
});

$("lockAgainBtn").addEventListener("click", () => {
    chrome.storage.local.set({ pinSessionUntil: 0 });
    location.reload();
});

$("searchBtn").addEventListener("click", () => {
    const raw = $("searchIn").value.trim();
    if (!raw) return;
    // Safe: encodeURIComponent prevents injection; navigating to google.com only
    const q = encodeURIComponent(raw);
    window.location.href = "https://www.google.com/search?q=" + q;
});

$("searchIn").addEventListener("keydown", e => {
    if (e.key === "Enter") $("searchBtn").click();
});

checkSessionUnlock();
