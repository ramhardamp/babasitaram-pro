// BABASITARAM PRO v9 — Apply saved custom element block rules
(function() {
    'use strict';
    const hostname = location.hostname.replace(/^www\./, '');
    chrome.runtime.sendMessage({ action: 'getCustomRules', domain: hostname }, (rules) => {
        if (chrome.runtime.lastError || !rules || !rules.length) return;
        const css = rules.map(r => {
            const sel = typeof r === 'string' ? r : r.selector;
            return sel ? `${sel}{display:none!important;visibility:hidden!important;}` : '';
        }).filter(Boolean).join('\n');
        if (!css) return;
        const style = document.createElement('style');
        style.id = 'baba-custom-rules';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    });
})();
