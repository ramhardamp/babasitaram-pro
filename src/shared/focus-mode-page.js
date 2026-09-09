const p = new URLSearchParams(location.search);
const site = decodeURIComponent(p.get('site') || '');
document.getElementById('siteName').textContent = '🚫 ' + site;

function tick() {
    chrome.storage.local.get({ focusModeUntil: 0 }, d => {
        const remaining = Math.max(0, Math.floor((d.focusModeUntil - Date.now()) / 1000));
        if (remaining === 0) { document.getElementById('focusTimer').textContent = '00:00'; return; }
        const m = Math.floor(remaining / 60), s = remaining % 60;
        document.getElementById('focusTimer').textContent =
            String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    });
}
tick(); setInterval(tick, 1000);

document.querySelector('.btn-back').addEventListener('click', () => history.back());
