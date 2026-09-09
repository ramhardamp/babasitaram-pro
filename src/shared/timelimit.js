const p = new URLSearchParams(location.search);
const site = p.get('site') || '';
const limitMin = Math.round((parseInt(p.get('limit') || 0)) / 60);
document.getElementById('siteName').textContent = site + ' · ' + limitMin + ' min/day limit';
document.getElementById('overrideBtn').onclick = () => {
  // Add 5 min grace
  const dayKey = new Date().toISOString().slice(0,10);
  chrome.storage.local.get({ timeLimitSpent:{}, timeLimits:{} }, d => {
    const k = site + '_' + dayKey;
    const limit = d.timeLimits[site] || 0;
    d.timeLimitSpent[k] = Math.max(0, limit - 300); // subtract 5 min
    chrome.storage.local.set({ timeLimitSpent: d.timeLimitSpent }, () => {
      history.back();
    });
  });
};
document.querySelector('.btn-back').addEventListener('click', () => history.back());
