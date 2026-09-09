// ═══════════════════════════════════════════════════════════
// BABASITARAM PRO v8 — Element Picker Content Script
// Right-click → pick element → block permanently
// ═══════════════════════════════════════════════════════════
(function() {
    if (window.__babaPicker) return;
    window.__babaPicker = true;

    let picking = false;
    let highlight = null;
    let lastEl = null;

    function getSelector(el) {
        if (!el || el === document.body) return 'body';
        // Try ID first
        if (el.id) return '#' + el.id;
        // Class-based
        const cls = [...el.classList].filter(c => c && !c.match(/^js-|active|open|visible|hidden/)).slice(0,2).join('.');
        if (cls) {
            const tag = el.tagName.toLowerCase();
            return `${tag}.${cls}`;
        }
        // nth-child fallback
        let path = el.tagName.toLowerCase();
        let p = el.parentElement;
        if (p) {
            const idx = [...p.children].indexOf(el) + 1;
            path = `${p.tagName.toLowerCase()} > ${path}:nth-child(${idx})`;
        }
        return path;
    }

    function showOverlay(el) {
        if (!highlight) {
            highlight = document.createElement('div');
            highlight.id = '__baba_highlight__';
            Object.assign(highlight.style, {
                position:'fixed',pointerEvents:'none',zIndex:'2147483646',
                border:'2px solid #ff3860',background:'rgba(255,56,96,0.15)',
                boxShadow:'0 0 0 1px rgba(255,56,96,0.5)',
                transition:'all 0.1s ease',borderRadius:'2px',
                fontFamily:'monospace',fontSize:'11px',color:'#ff3860'
            });
            document.body.appendChild(highlight);
        }
        const r = el.getBoundingClientRect();
        Object.assign(highlight.style, {
            top: r.top+'px', left: r.left+'px',
            width: r.width+'px', height: r.height+'px', display:'block'
        });
    }

    function removeOverlay() {
        if (highlight) { highlight.style.display='none'; }
    }

    function showPickerBar() {
        const bar = document.createElement('div');
        bar.id = '__baba_picker_bar__';
        Object.assign(bar.style, {
            position:'fixed',top:'0',left:'0',right:'0',
            background:'#060a10',borderBottom:'2px solid #ff3860',
            color:'#c8d8e8',fontFamily:'monospace',fontSize:'12px',
            padding:'8px 16px',zIndex:'2147483647',
            display:'flex',alignItems:'center',gap:'12px',
            boxShadow:'0 2px 20px rgba(255,56,96,0.3)'
        });
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'color:#ff3860;font-weight:bold';
        titleSpan.textContent = '🎯 BABA PICKER';
        const hintSpan = document.createElement('span');
        hintSpan.style.color = '#4a6080';
        hintSpan.textContent = 'Hover over element and click to block';
        const previewSpan = document.createElement('span');
        previewSpan.id = '__baba_sel_preview__';
        previewSpan.style.cssText = 'flex:1;color:#00d4ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const cancelBtn = document.createElement('button');
        cancelBtn.id = '__baba_cancel_pick__';
        cancelBtn.style.cssText = 'background:#1a2535;border:1px solid #ff3860;color:#ff3860;padding:3px 12px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:11px';
        cancelBtn.textContent = '✕ Cancel';
        bar.append(titleSpan, hintSpan, previewSpan, cancelBtn);
        document.body.appendChild(bar);
        cancelBtn.onclick = stopPicker;
        return bar;
    }

    function startPicker() {
        if (picking) return;
        picking = true;
        document.body.style.cursor = 'crosshair';
        showPickerBar();
        document.addEventListener('mouseover', onHover, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
    }

    function stopPicker() {
        picking = false;
        document.body.style.cursor = '';
        removeOverlay();
        const bar = document.getElementById('__baba_picker_bar__');
        if (bar) bar.remove();
        document.removeEventListener('mouseover', onHover, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        lastEl = null;
    }

    function onHover(e) {
        if (!picking) return;
        const el = e.target;
        if (el.id && (el.id.startsWith('__baba'))) return;
        lastEl = el;
        showOverlay(el);
        const prev = document.getElementById('__baba_sel_preview__');
        if (prev) prev.textContent = getSelector(el);
        e.stopPropagation();
    }

    function onClick(e) {
        if (!picking || !lastEl) return;
        e.preventDefault(); e.stopPropagation();
        const sel = getSelector(lastEl);
        if (!sel) { stopPicker(); return; }
        // Ask user to confirm
        const confirmed = showConfirmBubble(lastEl, sel);
    }

    function onKey(e) {
        if (e.key === 'Escape') stopPicker();
    }

    function showConfirmBubble(el, sel) {
        stopPicker();
        const box = document.createElement('div');
        box.id = '__baba_confirm_box__';
        const r = el.getBoundingClientRect();
        Object.assign(box.style, {
            position:'fixed', zIndex:'2147483647',
            top: Math.min(r.bottom + 8, window.innerHeight - 130) + 'px',
            left: Math.min(r.left, window.innerWidth - 300) + 'px',
            background:'#0c1219', border:'1px solid #ff3860',
            borderRadius:'6px', padding:'12px', width:'290px',
            fontFamily:'monospace', fontSize:'11px', color:'#c8d8e8',
            boxShadow:'0 0 20px rgba(255,56,96,0.3)'
        });
        // NOTE: `sel` is derived from the page's own id/class attributes
        // (see getSelector above), so it's page-controlled, not just
        // "our" data — building it into a string just to re-parse as HTML
        // was also a real XSS opening, not only a lint warning. Using
        // textContent below closes that off completely.
        const title = document.createElement('div');
        title.style.cssText = 'color:#ff3860;font-weight:bold;margin-bottom:6px';
        title.textContent = '🎯 Block this element?';
        const selBox = document.createElement('div');
        selBox.style.cssText = 'background:#050810;border:1px solid #1a2535;border-radius:3px;padding:6px;color:#00d4ff;word-break:break-all;margin-bottom:8px';
        selBox.textContent = sel;
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px';
        const blockBtn = document.createElement('button');
        blockBtn.style.cssText = 'flex:1;background:#ff3860;border:none;color:white;padding:6px;border-radius:4px;cursor:pointer;font-family:monospace;font-weight:bold';
        blockBtn.textContent = 'BLOCK';
        const cancelBoxBtn = document.createElement('button');
        cancelBoxBtn.style.cssText = 'flex:1;background:#1a2535;border:1px solid #1a2535;color:#4a6080;padding:6px;border-radius:4px;cursor:pointer;font-family:monospace';
        cancelBoxBtn.textContent = 'Cancel';
        btnRow.append(blockBtn, cancelBoxBtn);
        box.append(title, selBox, btnRow);
        document.body.appendChild(box);
        blockBtn.onclick = () => {
            box.remove();
            applyBlock(sel);
        };
        cancelBoxBtn.onclick = () => box.remove();
    }

    function applyBlock(sel) {
        // Inject CSS immediately
        const style = document.createElement('style');
        style.textContent = `${sel} { display: none !important; visibility: hidden !important; }`;
        document.head.appendChild(style);
        // Save to storage via message
        chrome.runtime.sendMessage({ action: 'saveCustomRule', hostname: location.hostname, selector: sel }, () => {
            showToast(`Blocked: ${sel}`);
        });
    }

    function showToast(msg) {
        const t = document.createElement('div');
        t.textContent = '✅ ' + msg;
        Object.assign(t.style, {
            position:'fixed',bottom:'20px',right:'20px',
            background:'#051a0e',border:'1px solid #00ff88',
            color:'#00ff88',padding:'8px 16px',borderRadius:'6px',
            fontFamily:'monospace',fontSize:'11px',zIndex:'2147483647',
            boxShadow:'0 0 12px rgba(0,255,136,0.3)'
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    // Listen for picker activation
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'startElementPicker') startPicker();
    });

    // Apply saved custom rules on page load — with retry for slow SW startup
    function applyCustomRulesWithRetry(attempt) {
        chrome.runtime.sendMessage({ action: 'getCustomRules', hostname: location.hostname }, (rules) => {
            if (chrome.runtime.lastError) {
                if (attempt < 3) setTimeout(() => applyCustomRulesWithRetry(attempt + 1), 500);
                return;
            }
            if (!Array.isArray(rules) || !rules.length) return;
            const style = document.createElement('style');
            style.id = '__baba_custom_rules__';
            style.textContent = rules.map(r => r && r.selector ? `${r.selector} { display: none !important; }` : '').join('\n');
            (document.head || document.documentElement).appendChild(style);
        });
    }
    applyCustomRulesWithRetry(0);

})();
