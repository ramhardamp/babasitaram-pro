/* ============================================================
   BSR PRO - shared theme (Light / Dark / System) - HAR page par yahi ek script.
   Save: localStorage 'bsp_theme' = 'light' | 'dark' | 'system'   (default: light)
   <html data-theme="light|dark"> set hota hai; sab CSS usi par chalti hai (theme.css + ux-pro.css).
   Pehle 3 tarike the (OS media query, body.dark-mode, data-theme) - ab sirf ye ek.
   API: BspTheme.get() / effective() / set(mode) / toggle()
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'bsp_theme', OLD_KEY = 'bsp_dark_mode', root = document.documentElement, animT = 0;
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function get() {
    var v = read(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
    if (read(OLD_KEY) === '1') { write(KEY, 'dark'); return 'dark'; } // purane "Dark Mode" switch ka migration
    return 'light';
  }
  function sysDark() { try { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
  function effective(m) { m = m || get(); return (m === 'dark' || (m === 'system' && sysDark())) ? 'dark' : 'light'; }
  function paint(m, eff) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'dark' ? '#141c17' : (meta.getAttribute('data-light') || meta.getAttribute('content') || '#1e8e3e'));
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.textContent = eff === 'dark' ? '☀️' : '🌙';
      b.setAttribute('aria-pressed', eff === 'dark' ? 'true' : 'false');
      b.setAttribute('aria-label', eff === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      b.setAttribute('title', eff === 'dark' ? 'Light' : 'Dark');
    });
    document.querySelectorAll('[data-theme-state]').forEach(function (e) { e.textContent = { light: 'Light', dark: 'Dark', system: 'System' }[m]; });
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { var on = b.getAttribute('data-theme-set') === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function apply(animate) {
    var m = get(), eff = effective(m);
    if (animate) { root.classList.add('theme-anim'); clearTimeout(animT); animT = setTimeout(function () { root.classList.remove('theme-anim'); }, 380); }
    root.setAttribute('data-theme', eff); root.setAttribute('data-theme-mode', m);
    paint(m, eff);
    try { window.dispatchEvent(new CustomEvent('bsp-theme', { detail: { mode: m, theme: eff } })); } catch (e) {}
  }
  function set(m) { if (m !== 'light' && m !== 'dark' && m !== 'system') m = 'light'; write(KEY, m); apply(true); }
  function toggle() { set(effective() === 'dark' ? 'light' : 'dark'); }

  window.BspTheme = { KEY: KEY, get: get, effective: effective, set: set, toggle: toggle, apply: apply };
  apply(false); // <head> me chalta hai => pehla frame hi sahi rang me (flash nahi)

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-theme-toggle],[data-theme-set]'); if (!t) return;
    if (t.hasAttribute('data-theme-set')) set(t.getAttribute('data-theme-set')); else toggle();
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) apply(true); }); // doosre tab/page me badla to yahan bhi
  try { var mq = matchMedia('(prefers-color-scheme: dark)'); var onMq = function () { if (get() === 'system') apply(true); }; mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq); } catch (e) {}

  function ready() {
    // Jin pages par top-bar toggle nahi hai (login, signup, forgot-password, customer-view) wahan chhota floating toggle
    if (!document.querySelector('[data-theme-toggle]') && !document.getElementById('appShell')) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'theme-fab'; b.setAttribute('data-theme-toggle', ''); document.body.appendChild(b);
    }
    apply(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
