/* Shared offline locale adapter for non-dashboard screens. Exact-key only; never changes user-entered values. */
(function () {
  const supported = ['en','hi','gu','mr','ne','te'];
  const lang = () => {
    const requested = localStorage.getItem('bsp_lang') || 'hi';
    return supported.includes(requested) ? requested : 'hi';
  };
  function translate(root) {
    const i18n = window.BSR_I18N;
    const locale = lang();
    if (!i18n || !i18n.locales || !i18n.locales[locale] || !root) return;
    const dict = i18n.locales[locale];
    const lookup = value => {
      const raw = String(value ?? ''), trim = raw.trim();
      if (!trim) return value;
      let key;
      for (const l of supported) {
        key = i18n.reverse[l] && i18n.reverse[l][trim];
        if (key) break;
      }
      if (!key || typeof dict[key] !== 'string' || !dict[key].trim()) return value;
      const at = raw.indexOf(trim);
      return raw.slice(0, at) + dict[key] + raw.slice(at + trim.length);
    };
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    else if (root.nodeType === Node.ELEMENT_NODE || root === document) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const el = node.parentElement, tag = el && el.tagName;
          if (!el || ['SCRIPT','STYLE','TEXTAREA','NOSCRIPT'].includes(tag) || el.isContentEditable) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
    }
    if (root === document || root === document.body) document.title = lookup(document.title);
    nodes.forEach(node => { const next = lookup(node.nodeValue); if (next !== node.nodeValue) node.nodeValue = next; });
    const els = root.querySelectorAll ? root.querySelectorAll('input[placeholder],textarea[placeholder],button[aria-label],input[aria-label],[title]') : [];
    els.forEach(el => ['placeholder','aria-label','title'].forEach(attr => {
      if (el.hasAttribute(attr)) { const old = el.getAttribute(attr), next = lookup(old); if (next !== old) el.setAttribute(attr, next); }
    }));
    document.documentElement.lang = locale;
  }
  function addLanguagePicker() {
    if (document.getElementById('sharedLocaleSelect')) return;
    const wrap = document.createElement('label');
    wrap.setAttribute('for', 'sharedLocaleSelect');
    wrap.style.cssText = 'position:fixed;top:8px;right:8px;z-index:10000;background:rgba(255,255,255,.96);border:1px solid #d1d5db;border-radius:10px;padding:4px 7px;box-shadow:0 2px 8px rgba(0,0,0,.10);font:12px system-ui,sans-serif;color:#111827';
    wrap.textContent = '🌐 ';
    const select = document.createElement('select');
    select.id = 'sharedLocaleSelect'; select.setAttribute('aria-label', 'App language');
    select.style.cssText = 'border:0;background:transparent;color:inherit;font:inherit;max-width:112px';
    const options = [['en','English'],['hi','हिंदी'],['gu','ગુજરાતી'],['mr','मराठी'],['ne','नेपाली'],['te','తెలుగు']];
    options.forEach(([value,label]) => { const option=document.createElement('option'); option.value=value; option.textContent=label; select.appendChild(option); });
    select.value = lang();
    select.addEventListener('change', () => { localStorage.setItem('bsp_lang', select.value); location.reload(); });
    wrap.appendChild(select); document.body.appendChild(wrap);
  }
  function start() {
    addLanguagePicker();
    translate(document.body);
    // Translate content rendered after initial page load (e.g. customer statement details).
    const observer = new MutationObserver(records => records.forEach(record => {
      record.addedNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) translate(node); });
      if (record.type === 'attributes' && record.target instanceof Element) translate(record.target);
    }));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder','aria-label','title'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
