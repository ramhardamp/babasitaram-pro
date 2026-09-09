const p = new URLSearchParams(location.search);
document.getElementById('blockedSite').textContent = '🚫 ' + (p.get('site') || 'This site');
function updateTimer() {
    chrome.storage.local.get({ focusModeUntil: 0, focusDuration: 0 }, d => {
        if (!d.focusModeUntil) { document.getElementById('timer').textContent = '∞ No limit'; return; }
        const rem = Math.max(0, Math.ceil((d.focusModeUntil - Date.now()) / 1000));
        const m = Math.floor(rem/60), s = rem%60;
        document.getElementById('timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        if (rem <= 0) { document.getElementById('timer').textContent = 'DONE!'; location.href = 'https://' + (p.get('site')||'google.com'); }
    });
}
setInterval(updateTimer, 1000); updateTimer();
function endFocus() {
    chrome.storage.local.set({ focusMode: false, focusModeUntil: 0 }, () => history.back());
}
document.querySelector('.btn:not(.btn-end)').addEventListener('click', () => history.back());
document.querySelector('.btn-end').addEventListener('click', endFocus);
