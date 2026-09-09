const p = new URLSearchParams(location.search);
const site = p.get('site') || '';
const originalUrl = p.get('url') || '';
document.getElementById('siteName').textContent = '🔐 ' + site;
let buf = '';
const dots = [0,1,2,3].map(i => document.getElementById('v'+i));
function upd() { dots.forEach((d,i) => d.classList.toggle('filled', i < buf.length)); }
document.querySelectorAll('.num').forEach(btn => {
  btn.onclick = () => {
    const n = btn.dataset.n;
    if (n==='C') { buf=''; upd(); document.getElementById('err').textContent=''; return; }
    if (n==='OK') { submit(); return; }
    if (buf.length < 4) { buf += n; upd(); }
    if (buf.length === 4) setTimeout(submit, 100);
  };
});
function submit() {
  chrome.runtime.sendMessage({ action:'vaultUnlock', pin:buf, site }, (res) => {
    if (res?.ok) {
      location.href = originalUrl || 'https://' + site;
    } else {
      document.getElementById('err').textContent = '❌ Wrong PIN';
      buf=''; upd();
      setTimeout(() => document.getElementById('err').textContent='', 1500);
    }
  });
}
document.getElementById('backBtn').onclick = () => history.back();
