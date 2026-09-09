// -------------------------------------------------------------------
// BABASITARAM PRO v9.2.2 — Popup Controller (Search with Protocol Strip)
// -------------------------------------------------------------------
const $ = id => document.getElementById(id);
const GRADE_COLORS = { A:'#00ff88', B:'#00d4ff', C:'#ffcc00', D:'#ff8844', F:'#ff3860' };

// ── VALIDATION FIX (#4/#5), take 2: AMO's static scanner flags an
// assignment to ANY element's `.innerHTML` — including a detached
// <template>'s — regardless of how "safe" the surrounding code makes it.
// There's no wrapper trick that survives that scan; the only durable fix
// is to never parse an HTML string into DOM at all. `setHTML` is gone.
// In its place: a tiny, real DOM-builder helper (`el`) used at every call
// site below, plus `clearNode`/`replaceContent` for swapping a container's
// contents. All caller-supplied dynamic values still go through esc()
// wherever they're inserted as text, exactly as before — this is a
// mechanical rewrite of *how* nodes are built, not a change in what's
// escaped.
function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
        for (const k in props) {
            const v = props[k];
            if (v === undefined || v === null) continue;
            if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
            else if (k === 'html' && v instanceof Node) node.appendChild(v);
            else if (k in node && (k === 'className' || k === 'id' || k === 'title' || k === 'href' || k === 'src' || k === 'type' || k === 'placeholder' || k === 'target' || k === 'rel')) node[k] = v;
            else node.setAttribute(k, v);
        }
    }
    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === '') continue;
        node.appendChild((c instanceof Node) ? c : document.createTextNode(String(c)));
    }
    return node;
}
function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
}
function replaceContent(container, ...nodes) {
    if (!container) return;
    clearNode(container);
    for (const n of nodes.flat(Infinity)) {
        if (n === null || n === undefined || n === '') continue;
        container.appendChild((n instanceof Node) ? n : document.createTextNode(String(n)));
    }
}
// Small "empty state" message box used in a dozen places below.
function emptyMsg(text, extraStyle) {
    return el('div', { style: Object.assign({ color: 'var(--muted)', fontSize: '10px', textAlign: 'center', padding: '10px' }, extraStyle || {}) }, text);
}

// ── VALIDATION FIX (#3): "Extension context invalidated" ──
// When the extension is reloaded/updated while a popup (or newtab, etc.) is
// still open, `chrome.runtime.id` becomes undefined and any further
// `safeSendMessage()` call throws synchronously. If that throw
// happens inside an async callback (e.g. a FileReader.onload, as in the
// import flow) with no try/catch around it, it surfaces only as an
// "Uncaught (in promise) Error: Extension context invalidated" in the
// console — the UI is left stuck with no visible feedback. This wrapper
// makes every messaging call in this file safe: it no-ops (with a graceful
// callback result) if the context is already gone, and it also checks
// chrome.runtime.lastError on the response, which is the other common way
// a sendMessage call fails "silently" (callback fires with `undefined` and
// no explanation) if the port closes before the background page replies —
// this was the root cause of imports failing silently on Firefox.
function safeSendMessage(msg, callback) {
    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn('[BABASITARAM] Extension context invalidated — please reopen this popup.');
        if (typeof callback === 'function') callback({ ok: false, error: 'Extension was reloaded — please reopen this popup and try again.' });
        return;
    }
    try {
        chrome.runtime.sendMessage(msg, function (response) {
            if (chrome.runtime.lastError) {
                console.warn('[BABASITARAM] sendMessage error:', chrome.runtime.lastError.message);
                if (typeof callback === 'function') callback({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }
            if (typeof callback === 'function') callback(response);
        });
    } catch (e) {
        console.warn('[BABASITARAM] sendMessage threw:', e.message);
        if (typeof callback === 'function') callback({ ok: false, error: e.message });
    }
}

// XSS prevention helper
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// -- PIN LOCK --------------------------------------------------
let pinBuffer = '';
function updateDots(prefix, val) {
    for (let i=0;i<4;i++){const d=$(prefix+i);if(d)d.classList.toggle('filled',i<val.length);}
}
function initLock() {
    chrome.storage.local.get({pin:'',pinEnabled:false,pinSessionUntil:0,pinSessionMinutes:0},(d)=>{
        if(!d.pinEnabled||!d.pin||d.pinSessionUntil>Date.now()){showMain();return;}
        $('lockScreen').classList.remove('hidden');
        $('lockHint').textContent=d.pinSessionMinutes>0?`Session: ${d.pinSessionMinutes} min`:'Enter 4-digit PIN';
    });
}
document.querySelectorAll('#mainNumpad .num-btn').forEach(btn=>{
    btn.onclick=()=>{
        const n=btn.dataset.n;
        if(n==='C'){pinBuffer='';updateDots('d',pinBuffer);$('lockError').textContent='';return;}
        if(n==='OK'){checkPin();return;}
        if(pinBuffer.length<4){pinBuffer+=n;updateDots('d',pinBuffer);}
        if(pinBuffer.length===4)setTimeout(checkPin,100);
    };
});
function checkPin(){
    chrome.storage.local.get({pin:'',pinSessionMinutes:0},(d)=>{
        if(pinBuffer===d.pin){
            if(d.pinSessionMinutes>0)chrome.storage.local.set({pinSessionUntil:Date.now()+d.pinSessionMinutes*60000});
            showMain();
        } else {
            $('lockError').textContent='❌ Wrong PIN';
            pinBuffer='';updateDots('d',pinBuffer);
            setTimeout(()=>$('lockError').textContent='',1500);
        }
    });
}
$('noPinBtn').onclick=()=>showMain();
function showMain(){
    $('lockScreen').classList.add('hidden');
    $('mainApp').style.display='block';
    loadData();refreshDNRMonitor();
}

// -- PIN MODAL -------------------------------------------------
let modalPinBuf='',pinStep=0,firstPin='';
function openPinModal(){
    modalPinBuf='';pinStep=0;firstPin='';
    $('pinModal').style.display='flex';
    $('pinModalTitle').textContent='SET NEW PIN — STEP 1';
    $('pinModalError').textContent='';
    updateDots('md','');
}
$('changePinRow').onclick=openPinModal;
$('cancelPinModal').onclick=()=>{$('pinModal').style.display='none';};
document.querySelectorAll('.modal-num').forEach(btn=>{
    btn.onclick=()=>{
        const n=btn.dataset.n;
        if(n==='C'){modalPinBuf='';updateDots('md',modalPinBuf);return;}
        if(n==='OK'){handlePinOK();return;}
        if(modalPinBuf.length<4){modalPinBuf+=n;updateDots('md',modalPinBuf);}
        if(modalPinBuf.length===4)setTimeout(handlePinOK,100);
    };
});
function handlePinOK(){
    if(modalPinBuf.length<4){$('pinModalError').textContent='4 digits required';return;}
    if(pinStep===0){
        firstPin=modalPinBuf;modalPinBuf='';
        updateDots('md','');pinStep=1;
        $('pinModalTitle').textContent='CONFIRM PIN — STEP 2';
        $('pinModalError').textContent='';
    } else {
        if(modalPinBuf===firstPin){
            chrome.storage.local.set({pin:modalPinBuf,pinEnabled:true,pinSessionUntil:0});
            $('pinModal').style.display='none';
            showToast('✅ PIN set successfully!');
        } else {
            $('pinModalError').textContent='❌ PINs do not match. Retry.';
            modalPinBuf='';firstPin='';pinStep=0;
            updateDots('md','');$('pinModalTitle').textContent='SET NEW PIN — STEP 1';
        }
    }
}

// -- SITE LOCK -------------------------------------------------
function loadSiteLock(){
    chrome.storage.local.get(['lockAllSites','pin'],(d)=>{
        const tsl=$('toggleSiteLock'),pr=$('passwordRow'),lps=$('lockPasswordStatus');
        if(tsl)tsl.checked=d.lockAllSites||false;
        if(pr)pr.style.display=d.lockAllSites?'flex':'none';
        if(lps)lps.textContent=d.pin?'🔐 Master PIN is set':'⚠️ Set a PIN first';
    });
}
const tsl=$('toggleSiteLock');
if(tsl){
    tsl.onchange=()=>{
        const on=tsl.checked;
        chrome.storage.local.get(['pin'],(d)=>{
            if(on&&!d.pin){
                $('lockPasswordStatus').textContent='⚠️ Set a PIN first!';
                $('lockPasswordStatus').style.color='var(--red)';
                tsl.checked=false;$('passwordRow').style.display='flex';return;
            }
            chrome.storage.local.set({lockAllSites:on});
            $('passwordRow').style.display=on?'flex':'none';
            $('lockPasswordStatus').textContent=on?'✅ Protection Active!':'❌ Disabled';
            $('lockPasswordStatus').style.color=on?'var(--green)':'var(--muted)';
        });
    };
}
const cpbq=$('changePinBtnQuick');if(cpbq)cpbq.onclick=openPinModal;
const rab=$('relockAllBtn');
if(rab)rab.onclick=()=>{
    safeSendMessage({action:'lockSitesNow'},()=>{
        $('lockPasswordStatus').textContent='🔒 All locked!';
        $('lockPasswordStatus').style.color='var(--red)';
        setTimeout(()=>{$('lockPasswordStatus').textContent='🔐 Master PIN Active';$('lockPasswordStatus').style.color='var(--green)';},2000);
    });
};

// -- UTILS -----------------------------------------------------
function getWeekKey(){const d=new Date(),s=new Date(d.getFullYear(),0,1);return d.getFullYear()+'-W'+Math.ceil(((d-s)/86400000+s.getDay()+1)/7);}
function fmtSec(sec){if(sec<60)return sec+'s';if(sec<3600)return Math.round(sec/60)+'min';return Math.floor(sec/3600)+'h '+Math.round((sec%3600)/60)+'m';}
function showToast(msg,color='#00ff88'){
    const t=document.createElement('div');
    t.textContent=msg;
    Object.assign(t.style,{position:'fixed',bottom:'12px',left:'50%',transform:'translateX(-50%)',
        background:color==='#ff3860'?'#1a0510':'#051a0e',border:`1px solid ${color}`,
        color,padding:'7px 16px',borderRadius:'6px',fontFamily:'var(--mono)',fontSize:'11px',
        zIndex:'9999',whiteSpace:'nowrap',boxShadow:`0 0 12px ${color}44`});
    document.body.appendChild(t);
    setTimeout(()=>t.remove(),2500);
}
function setShield(id,on,onLbl,offLbl){
    const el=$(id);if(!el)return;
    const dot=el.querySelector('div'),lbl=el.querySelector('strong');
    const c=on?'#00ff88':'#ff3860';
    if(dot){dot.style.background=c;dot.style.boxShadow=`0 0 5px ${c}`;}
    if(lbl){lbl.textContent=on?onLbl:offLbl;lbl.style.color=c;}
}

// -- DNR LIVE REFRESH ------------------------------------------
function refreshDNRMonitor(){
    safeSendMessage({action:'getDNRCount'},(resp)=>{
        if(chrome.runtime.lastError||!resp)return;
        const count=resp.count||0,site=resp.site||'';
        const siteEl=$('monitorSiteTrackers');
        if(siteEl){siteEl.textContent=count;siteEl.style.color=count===0?'#00ff88':count<=3?'#ffcc00':'#ff8844';}
        const grade=count===0?'A':count<=2?'B':count<=5?'C':count<=10?'D':'F';
        const mg=$('monitorGrade');
        if(mg){mg.textContent=grade;mg.style.color=GRADE_COLORS[grade]||'#ffcc00';}
        const gs=$('monitorGradeSite');
        if(gs)gs.textContent=site?site.slice(0,22):'Current page';
    });
}

// -- RENDER (perf) -----------------------------------------------
function renderCounts(d){
    const s=d.settings||{};
    $('adCount').textContent=d.totalAds||0;
    $('monitorThreats').textContent=d.totalThreats||0;
    $('guardStat').textContent=s.historyGuard!==false?'ON':'OFF';
    $('guardStat').style.color=s.historyGuard!==false?'var(--green)':'var(--red)';
    $('wlCount').textContent=(d.dailySites||[]).length;
    if(s.autoBurnMinutes===-1){$('timerStatus').textContent='🔴 LIVE MODE — CONTINUOUS WIPE';$('timerStatus').style.color='var(--red)';}
    else if(s.autoBurnMinutes>0){$('timerStatus').textContent=`AUTO-WIPE: ${s.autoBurnMinutes}min`;$('timerStatus').style.color='var(--orange)';}
    else if(s.childProtection){$('timerStatus').textContent='CHILD PROTECTION ON';$('timerStatus').style.color='var(--green)';}
    else{$('timerStatus').textContent='SHIELD ACTIVE — ALL SYSTEMS GO';$('timerStatus').style.color='';}
}

// BUG FIX (#6 / #8): previously this only rendered the section matching the
// *currently active* tab. But several DOM nodes (trackerDomainStatsList,
// paymentSitesList) physically live inside the Monitor tab's markup while
// only renderStatsTab() ever wrote to them — so unless you happened to open
// the Stats tab first, Monitor's "Per-Site Trackers" / "Payment Sites"
// boxes stayed stuck on their static HTML placeholder forever, and the
// Stats tab itself looked "sometimes blank" depending on which tab was
// active when a storage change fired. Every tab-content panel already
// exists in the DOM at all times (just hidden via CSS), so it's cheap and
// correct to treat chrome.storage as the single source of truth and
// re-render ALL panels on every data load, independent of which tab is
// visible.
function renderTabData(d){
    renderMonitorTab(d);
    renderLogTab(d);
    renderWhitelistTab(d);
    renderStatsTab(d);
    renderSettingsTab(d);
}

function renderMonitorTab(d){
    const s=d.settings||{};
    const wk=getWeekKey();
    const ws=(d.weeklyStats||{})[wk]||{ads:0,burns:0};
    $('monitorAdCount').textContent=d.totalAds||0;
    $('monitorWeekAds').textContent=ws.ads||0;
    $('monTrackersGlobal').textContent=d.totalThreats||0;
    const monLog=$('monitorLogBox');
    if(monLog){
        const logs = d.activityLogs || [];
        clearNode(monLog);
        if(logs.length){
            logs.slice(0,12).forEach(l=>{
                const div=document.createElement('div');
                div.className='log-entry';
                div.textContent=l.msg||l;
                monLog.appendChild(div);
            });
        } else {
            const div=document.createElement('div');
            div.className='log-empty';
            div.textContent='Waiting...';
            monLog.appendChild(div);
        }
    }
    const adOn=s.adBlocker!==false,ipOn=s.ipPrivacy!==false;
    setShield('adKillerShieldStatus',adOn,'ACTIVE','OFF');
    setShield('ipShieldStatus',ipOn,'HIDDEN','VISIBLE');
    setShield('zeroAdShieldStatus',adOn,'RUNNING','STOPPED');
    setShield('trackerShieldStatus',adOn,'RUNNING','STOPPED');
    setShield('antiFingerShieldStatus',ipOn,'ACTIVE','OFF');
    setShield('historyGuardStatus',s.historyGuard!==false,'ON','OFF');
    const whitelist=d.dailySites||[];
    const mwl=$('monitorWList');
    if(mwl){
        clearNode(mwl);
        if(!whitelist.length){
            const div=document.createElement('div');
            div.style.cssText='font-size:10px;color:var(--muted);text-align:center;width:100%;padding:6px';
            div.textContent='No sites added';
            mwl.appendChild(div);
        } else {
            whitelist.forEach(u=>{
                const span=document.createElement('span');
                span.style.cssText='background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:#00ff88;padding:2px 6px;border-radius:4px;font-size:10px';
                span.textContent=u;
                mwl.appendChild(span);
            });
        }
    }
}

function renderLogTab(d){
    const logBox=$('logBox');
    if(logBox){
        const logs = d.activityLogs || [];
        clearNode(logBox);
        if(logs.length){
            logs.slice(0,40).forEach(l=>{
                const div=document.createElement('div');
                div.className='log-entry';
                div.textContent=l.msg||l;
                logBox.appendChild(div);
            });
        } else {
            const div=document.createElement('div');
            div.className='log-empty';
            div.textContent='Waiting for activity...';
            logBox.appendChild(div);
        }
    }
}

// ── Helper: normalize domain (remove protocol, www, trailing slash) ──
function normalizeDomain(str) {
    let s = String(str).toLowerCase().trim();
    s = s.replace(/^https?:\/\//, '');
    s = s.replace(/^www\./, '');
    s = s.replace(/\/.*$/, ''); // remove path
    return s;
}

// ── 🔥 FIREPROOF TAB — SEARCH BOTH MAIN + EXTRA (with protocol stripping)
function renderWhitelistTab(d){
    const dailySites = d.dailySites || [];
    const fireproofSites = d.fireproofSites || [];
    const dList = $('dailyList');
    if (!dList) return;

    const rawFilter = ($('dailyIn')?.value || '').trim();
    const filterText = normalizeDomain(rawFilter); // normalized for matching
    const displayFilter = rawFilter || ''; // for display in no-match message

    // ── Separate main and extra ──
    const extraFP = fireproofSites.filter(fp => !dailySites.includes(fp));

    // ── Filter function ──
    const matchesFilter = (url) => {
        if (!filterText) return true;
        const normUrl = normalizeDomain(url);
        return normUrl.includes(filterText);
    };

    // ── Filtered lists ──
    const filteredMain = dailySites.filter(matchesFilter);
    const filteredExtra = extraFP.filter(matchesFilter);

    // ── Build combined list as real DOM nodes ──
    const nodes = [];

    function mainSiteItem(url) {
        const isVault = (d.vaultSites||[]).includes(url);
        const borderColor = isVault ? '#00d4ff' : '#ff8c00';
        const icon = isVault ? '\u{1F510}' : '\u{1F525}';
        return el('div', { className: 'wl-item', style: { borderLeft: `2px solid ${borderColor}`, gap: '5px', padding: '4px 7px' } },
            el('span', { style: { fontSize: '11px', flexShrink: '0' } }, icon),
            el('span', { className: 'wl-url', style: { flex: '1', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis' } }, url),
            el('button', { className: 'daily-hclr', 'data-url': url, style: { fontSize: '8px', padding: '2px 5px', background: 'rgba(255,56,96,0.1)', border: '1px solid rgba(255,56,96,0.3)', color: '#ff6680', borderRadius: '3px', cursor: 'pointer' } }, '\u{1F5D1}'),
            el('button', { className: 'wl-del daily-del', 'data-url': url, 'data-i': String(dailySites.indexOf(url)) }, '\u2715')
        );
    }
    function extraChip(fp) {
        return el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontFamily: 'var(--mono)', background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.25)', color: '#ff8c00', padding: '1px 5px', borderRadius: '3px' } },
            fp,
            el('button', { className: 'fp-extra-del', 'data-fp': fp, style: { background: 'none', border: 'none', color: '#ff6680', cursor: 'pointer', fontSize: '9px', padding: '0 0 0 3px' } }, '\u2715')
        );
    }
    function extraMatchItem(url) {
        return el('div', { className: 'wl-item', style: { borderLeft: '2px solid #ff8c00', gap: '5px', padding: '4px 7px', opacity: '0.8' } },
            el('span', { style: { fontSize: '11px', flexShrink: '0' } }, '\u{1F525}'),
            el('span', { className: 'wl-url', style: { flex: '1', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis' } }, url),
            el('span', { style: { fontSize: '7px', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.3)', padding: '1px 4px', borderRadius: '2px' } }, 'AUTO'),
            el('button', { className: 'fp-extra-del', 'data-fp': url, style: { background: 'none', border: 'none', color: '#ff6680', cursor: 'pointer', fontSize: '10px', padding: '0 4px' } }, '\u2715')
        );
    }

    // If no filter, show main sites normally
    if (!filterText) {
        // Main sites
        if (dailySites.length) {
            nodes.push(...dailySites.map(mainSiteItem));
        } else {
            nodes.push(el('div', { className: 'empty-msg', style: { fontSize: '10px', border: '1px dashed var(--border)', borderRadius: '4px', padding: '10px' } }, 'No sites added — add with +SAVE'));
        }

        // Extra protected section (unchanged)
        if (extraFP.length) {
            const wrapper = el('div', { className: 'fp-extra-wrapper', style: { marginTop: '5px', padding: '5px 8px', background: 'rgba(255,140,0,0.04)', border: '1px solid rgba(255,140,0,0.15)', borderRadius: '4px' } },
                el('div', { style: { fontSize: '8px', color: '#ff8c00', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '5px' } }, '\u{1F525} Also protected (root/SSO domains)'),
                el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '5px' } }, extraFP.map(extraChip)),
                el('div', { style: { display: 'flex', gap: '4px' } },
                    el('input', { type: 'text', id: 'fpManualIn', placeholder: 'Manually add domain...', style: { flex: '1', background: '#050810', border: '1px solid rgba(255,140,0,0.3)', borderRadius: '3px', color: '#ff8c00', padding: '3px 7px', fontFamily: 'var(--mono)', fontSize: '10px', outline: 'none' } }),
                    el('button', { id: 'fpManualAddBtn', style: { background: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.4)', color: '#ff8c00', borderRadius: '3px', padding: '3px 8px', fontSize: '9px', cursor: 'pointer', fontWeight: '700' } }, '+ADD')
                )
            );
            nodes.push(wrapper);
        }
    } else {
        // ── WITH SEARCH FILTER: show both main + extra matches ──
        const allMatches = [...filteredMain, ...filteredExtra];

        if (!allMatches.length) {
            nodes.push(el('div', { className: 'empty-msg', style: { fontSize: '10px', border: '1px dashed var(--border)', borderRadius: '4px', padding: '10px', color: 'var(--muted)' } }, `\u{1F50D} कोई मेल खाती साइट नहीं मिली "${displayFilter}"`));
        } else {
            // Show main matches first
            if (filteredMain.length) nodes.push(...filteredMain.map(mainSiteItem));

            // Show extra matches with a badge
            if (filteredExtra.length) {
                if (filteredMain.length) {
                    nodes.push(el('div', { style: { marginTop: '8px', padding: '5px 0', borderTop: '1px dashed var(--border)', fontSize: '8px', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' } }, '\u{1F6E1}\uFE0F Auto-protected (root/SSO)'));
                }
                nodes.push(...filteredExtra.map(extraMatchItem));
            }
        }
    }

    // ── Render ──
    replaceContent(dList, nodes);

    // ── Attach event listeners ──
    attachDailyDelListeners(dailySites);
    attachDailyHclrListeners();
    attachFpDelListeners();
    attachFpManualListeners();
}

// ── Helper: Attach daily delete listeners ──
function attachDailyDelListeners(dailySites) {
    document.querySelectorAll('.daily-del').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.i);
            const url = btn.dataset.url || dailySites[idx];
            if (!url) return;
            dailySites.splice(idx, 1);
            chrome.storage.local.get({ fireproofSites: [], whitelist: [] }, (d) => {
                const fp = d.fireproofSites.filter(s => s !== url);
                const wl = d.whitelist.filter(s => s !== url);
                chrome.storage.local.set({ dailySites, fireproofSites: fp, whitelist: wl }, loadData);
            });
        };
    });
}

function attachDailyHclrListeners() {
    document.querySelectorAll('.daily-hclr').forEach(btn => {
        btn.onclick = () => {
            const domain = btn.dataset.url;
            chrome.history.search({ text: domain, startTime: 0, endTime: Date.now(), maxResults: 10000 }, items => {
                let n = 0;
                (items || []).forEach(item => {
                    try {
                        const hd = new URL(item.url).hostname.replace(/^www\./, '');
                        if (hd === domain || hd.endsWith('.' + domain)) { chrome.history.deleteUrl({ url: item.url }); n++; }
                    } catch(e) {}
                });
                btn.textContent = n + ' cleared'; btn.style.color = '#00ff88';
                setTimeout(() => { btn.textContent = '\u{1F5D1}'; btn.style.color = '#ff6680'; }, 2000);
            });
        };
    });
}

function attachFpDelListeners() {
    document.querySelectorAll('.fp-extra-del').forEach(btn => {
        btn.onclick = () => {
            const fp = btn.dataset.fp;
            chrome.storage.local.get({ fireproofSites: [] }, (fd) => {
                chrome.storage.local.set({ fireproofSites: fd.fireproofSites.filter(s => s !== fp) }, loadData);
            });
        };
    });
}

function attachFpManualListeners() {
    const fpAddBtn = document.getElementById('fpManualAddBtn');
    const fpInput = document.getElementById('fpManualIn');
    const doFpAdd = () => {
        if (!fpInput) return;
        let val = fpInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
        if (!val) return;
        chrome.storage.local.get({ fireproofSites: [] }, (fd) => {
            if (!fd.fireproofSites.includes(val)) {
                fd.fireproofSites.push(val);
                chrome.storage.local.set({ fireproofSites: fd.fireproofSites }, () => {
                    fpInput.value = '';
                    showToast(val + ' protected!', '#ff8c00');
                    loadData();
                });
            } else showToast('Already protected', '#ff8844');
        });
    };
    if (fpAddBtn) {
        const newBtn = fpAddBtn.cloneNode(true);
        fpAddBtn.parentNode.replaceChild(newBtn, fpAddBtn);
        newBtn.onclick = doFpAdd;
    }
    if (fpInput) {
        const newInput = fpInput.cloneNode(true);
        fpInput.parentNode.replaceChild(newInput, fpInput);
        newInput.addEventListener('keydown', e => { if (e.key === 'Enter') doFpAdd(); });
    }
}

function renderSettingsTab(d){
    const s=d.settings||{};
    const sets=[
        ['toggleGuard','historyGuard',true],['toggleNotify','notifyOnSkip',false],
        ['toggleChild','childProtection',false],['toggleIPPrivacy','ipPrivacy',true],
        ['toggleAdBlocker','adBlocker',true],['toggleNightlyClear','nightlyClear',false],
        ['toggleCookieCleaner','cookieCleaner',false],['toggleExitClear','exitClear',false],
        ['toggleFireproofDaily','fireproofDaily',true],
        ['toggleAutoDisablePayment','autoDisablePaymentSites',true],
        ['toggleFireproofPrompt','fireproofPrompt',true]
    ];
    sets.forEach(([id,key,def])=>{const el=$(id);if(el)el.checked=key in s?s[key]:def;});
    const ht=$('toggleHTTPS');if(ht)ht.checked=s.httpsForce!==false;
    if($('autoBurnSelect')&&s.autoBurnMinutes!==undefined)$('autoBurnSelect').value=String(s.autoBurnMinutes);
    if($('pinSessionSelect')&&s.pinSessionMinutes!==undefined)$('pinSessionSelect').value=String(s.pinSessionMinutes);
}

function renderStatsTab(d){
    const wk=getWeekKey();
    const ws=(d.weeklyStats||{})[wk]||{ads:0,burns:0};
    $('wAds').textContent=ws.ads||0;
    $('wTrackers').textContent=d.totalThreats||0;
    $('wBurns').textContent=ws.burns||0;
    $('wKey').textContent=wk;
    $('allAds').textContent=d.totalAds||0;
    $('allTrackers').textContent=d.totalThreats||0;
    const domList=$('domainStatsList');
    if(domList){
        const entries=Object.entries(d.domainStats||{}).sort((a,b)=>b[1]-a[1]);
        if(!entries.length){replaceContent(domList, emptyMsg('Browse to see data', {padding:'16px'}));}
        else{
            const mx=entries[0][1]||1;
            replaceContent(domList, entries.map(([dom,cnt])=>
                el('div', {className:'bar-row'},
                    el('div', {className:'bar-label'},
                        el('span', null, dom),
                        el('span', {style:{color:'var(--accent)'}}, String(cnt))
                    ),
                    el('div', {className:'bar-bg'},
                        el('div', {className:'bar-fill', style:{background:'linear-gradient(90deg,#ff4400,#ff8844)', width:Math.min(100,Math.round(cnt/mx*100))+'%'}})
                    )
                )
            ));
        }
    }
    const tdList=$('trackerDomainStatsList');
    if(tdList){
        const tEntries=Object.entries(d.trackerDomainStats||{}).sort((a,b)=>b[1]-a[1]);
        if(!tEntries.length){replaceContent(tdList, emptyMsg('Browse sites to see data'));}
        else{
            const mx=tEntries[0][1]||1;
            replaceContent(tdList, tEntries.slice(0,12).map(([dom,cnt])=>{
                const c=cnt>=10?'#ff3860':cnt>=5?'#ff8844':cnt>=2?'#ffcc00':'#00ff88';
                return el('div', {className:'bar-row'},
                    el('div', {className:'bar-label'},
                        el('span', {style:{overflow:'hidden', textOverflow:'ellipsis', maxWidth:'200px'}}, dom),
                        el('span', {style:{color:c}}, String(cnt))
                    ),
                    el('div', {className:'bar-bg'},
                        el('div', {className:'bar-fill', style:{background:c, width:Math.round(cnt/mx*100)+'%'}})
                    )
                );
            }));
        }
    }
    const payList=$('paymentSitesList');
    if(payList){
        const pSites=d.paymentSitesVisited||[];
        if(!pSites.length){
            replaceContent(payList, el('div', {style:{fontSize:'10px', color:'var(--muted)', textAlign:'center', padding:'8px'}}, 'No visits yet'));
        } else {
            replaceContent(payList, pSites.slice(0,20).map(ps=>{
                const t=ps.time?new Date(ps.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'';
                return el('div', {style:{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0', borderBottom:'1px solid var(--border)'}},
                    el('span', {style:{fontSize:'11px', color:'#ffcc00', fontFamily:'var(--mono)'}}, `\u{1F4B3} ${ps.site||''}`),
                    el('span', {style:{fontSize:'9px', color:'var(--muted)'}}, t)
                );
            }));
        }
    }
}

// -- LOAD DATA (perf) --------------------------------------------
function loadData(){
    chrome.storage.session.get({activityLogs:null},(sd)=>{
        chrome.storage.local.get({
            totalAds:0,whitelist:[],settings:{},weeklyStats:{},totalThreats:0,
            dailySites:[],fireproofSites:[],vaultSites:[],historyGuardSites:[],excludedSites:[],domainStats:{},paymentSitesVisited:[],
            trackerDomainStats:{},activityLogs:[]
        },(d)=>{
            d.activityLogs=sd.activityLogs!==null?sd.activityLogs:d.activityLogs;
            renderCounts(d);
            renderTabData(d);
            refreshDNRMonitor();
        });
    });
}

// -- storage.onChanged -- smart filtering -----------------------
const SKIP_RELOAD_KEYS = new Set(['settings', 'activityLogs', 'pinSessionUntil',
    'unlockedSites', 'vaultUnlocked', 'filterSyncStatus', 'filterSyncTime',
    'filterSyncCount', 'focusModeActive', 'focusModeUntil', 'dohProvider']);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = Object.keys(changes);
    if (keys.every(k => SKIP_RELOAD_KEYS.has(k))) return;
    if (window._rt) clearTimeout(window._rt);
    window._rt = setTimeout(loadData, 500);
});

// ---------------------------------------------------------------
// ✨ NEW: Quick Actions Handlers
// ---------------------------------------------------------------
$('disableSiteBtn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.url) return;
        try {
            const host = new URL(tabs[0].url).hostname;
            safeSendMessage({ action: 'toggleSiteDisable', hostname: host, enabled: true }, () => {
                chrome.tabs.reload(tabs[0].id);
                window.close();
            });
        } catch(e) { showToast('Invalid URL', '#ff8844'); }
    });
});

$('fixSiteBtn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.url) return;
        try {
            const host = new URL(tabs[0].url).hostname;
            safeSendMessage({ action: 'togglePageException', hostname: host, enable: true }, () => {
                chrome.tabs.reload(tabs[0].id);
                window.close();
            });
        } catch(e) { showToast('Invalid URL', '#ff8844'); }
    });
});

$('clearBreakageBtn')?.addEventListener('click', () => {
    safeSendMessage({ action: 'clearBreakageBypass' }, () => {
        showToast('🧹 Cleared all breakage bypasses', '#00ff88');
    });
});

// ---------------------------------------------------------------
// PRO FEATURES — VAULT
// ---------------------------------------------------------------
function loadVault(){
    safeSendMessage({action:'getVaultSites'},(sites)=>{
        const list=$('vaultList');if(!list)return;
        clearNode(list);
        if(!sites||!sites.length){
            const div=document.createElement('div');
            div.className='empty-msg';
            div.style.padding='12px';
            div.textContent='No vault sites';
            list.appendChild(div);
            return;
        }
        sites.forEach(({site,unlocked})=>{
            const div=document.createElement('div');
            div.style.cssText='display:flex;align-items:center;gap:7px;padding:6px 9px;border-bottom:1px solid var(--border)';
            const icon=document.createElement('span');
            icon.style.fontSize='14px';
            icon.textContent=unlocked?'🔓':'🔒';
            const label=document.createElement('span');
            label.style.cssText='flex:1;font-family:var(--mono);font-size:11px';
            label.textContent=site;
            const status=document.createElement('span');
            status.style.cssText=`font-size:9px;color:${unlocked?'#00ff88':'#ff8844'}`;
            status.textContent=unlocked?'OPEN':'LOCKED';
            const btn=document.createElement('button');
            btn.className='wl-del vault-del';
            btn.dataset.site=site;
            btn.textContent='✕';
            div.append(icon,label,status,btn);
            list.appendChild(div);
        });
        document.querySelectorAll('.vault-del').forEach(btn=>{
            btn.onclick=()=>{safeSendMessage({action:'removeVaultSite',site:btn.dataset.site},loadVault);};
        });
    });
}
$('vaultAddBtn').onclick=()=>{
    const val=$('vaultIn').value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*/,'');
    if(!val)return;
    chrome.storage.local.get({pin:''},(d)=>{
        if(!d.pin){showToast('⚠️ Set a PIN in Settings first!','#ff8844');return;}
        safeSendMessage({action:'addVaultSite',site:val},()=>{$('vaultIn').value='';loadVault();showToast(`🔐 ${val} added to vault!`);});
    });
};
$('vaultIn').addEventListener('keydown',e=>{if(e.key==='Enter')$('vaultAddBtn').click();});

// ---------------------------------------------------------------
// PRO FEATURES — COOKIE CLEANER
// ---------------------------------------------------------------
function loadCookieStats(){
    $('cookieTotal').textContent='Loading...';
    replaceContent($('cookieList'), el('div', {style:{color:'var(--muted)', fontSize:'10px', textAlign:'center', padding:'12px'}}, '\u23F3 Loading cookies...'));
    chrome.storage.local.get({fireproofSites:[],vaultSites:[],whitelist:[]},(local)=>{
        const allProtected=new Set([...local.fireproofSites,...local.vaultSites]);
        safeSendMessage({action:'getCookieStats'},(resp)=>{
            if(!resp){$('cookieTotal').textContent='Error';return;}
            $('cookieTotal').textContent=resp.total;
            const {byDomain}=resp;
            clearNode($('cookieList'));
            if(!byDomain||!byDomain.length){
                replaceContent($('cookieList'), el('div', {style:{color:'var(--green)', fontSize:'10px', textAlign:'center', padding:'12px'}}, '\u{1F36A} No cookies!'));
                return;
            }
            byDomain.forEach(({domain,count,trusted})=>{
                const isFireproof=allProtected.has(domain)||[...allProtected].some(fp=>domain===fp||domain.endsWith('.'+fp));
                const isVault=local.vaultSites.includes(domain)||local.vaultSites.some(fp=>domain.endsWith('.'+fp));
                const div=document.createElement('div');
                div.style.cssText='display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--border)';
                const icon=document.createElement('span');
                icon.style.fontSize='10px';
                icon.textContent=isVault?'🔐':isFireproof?'🛡️':trusted?'✅':'❌';
                const label=document.createElement('span');
                label.style.cssText=`flex:1;font-family:var(--mono);font-size:10px;overflow:hidden;text-overflow:ellipsis;${(trusted||isFireproof)?'color:var(--muted)':''}`;
                label.textContent=domain;
                const cnt=document.createElement('span');
                cnt.style.cssText=`font-family:var(--mono);font-size:10px;color:${(trusted||isFireproof)?'var(--muted)':'#ff8844'};min-width:20px;text-align:right`;
                cnt.textContent=String(count);
                div.append(icon,label,cnt);
                if(!trusted&&!isFireproof){
                    const btn=document.createElement('button');
                    btn.className='btn-pro btn-danger';
                    btn.style.cssText='padding:2px 6px;font-size:9px';
                    btn.dataset.dom=domain;
                    btn.textContent='DEL';
                    div.appendChild(btn);
                } else if(isFireproof||isVault) {
                    const badge=document.createElement('span');
                    badge.style.cssText='font-size:8px;color:'+(isVault?'#00d4ff':'#ff8c00')+';padding:1px 4px;border:1px solid '+(isVault?'rgba(0,212,255,0.3)':'rgba(255,140,0,0.3)')+';border-radius:3px';
                    badge.textContent=isVault?'VAULT':'SAFE';
                    div.appendChild(badge);
                }
                $('cookieList').appendChild(div);
            });
            document.querySelectorAll('[data-dom]').forEach(btn=>{
                btn.onclick=()=>{
                    btn.textContent='⏳';btn.disabled=true;
                    safeSendMessage({action:'cleanCookiesDomain',domain:btn.dataset.dom},r=>{
                        showToast(`🧹 ${r?.cleaned||0} cookies deleted`,'#ff8844');
                        setTimeout(loadCookieStats,500);
                    });
                };
            });
        });
    });
}
$('refreshCookiesBtn').onclick=loadCookieStats;
$('cleanAllCookiesBtn').onclick=()=>{
    const btn=$('cleanAllCookiesBtn');
    btn.textContent='⏳ Cleaning...';btn.disabled=true;
    safeSendMessage({action:'cleanAllCookies'},(r)=>{
        showToast(`🧹 ${r?.cleaned||0} cookies cleaned!`,'#ff8844');
        btn.textContent='🗑️ Clean All';btn.disabled=false;
        setTimeout(loadCookieStats,600);
    });
};

// ---------------------------------------------------------------
// PRO FEATURES — TIME LIMIT
// ---------------------------------------------------------------
function loadTimeLimits(){
    safeSendMessage({action:'getTimeSpent'},(data)=>{
        const list=$('timeLimitList');if(!list)return;
        if(!data||!Object.keys(data).length){
            replaceContent(list, emptyMsg('No limits set'));
            return;
        }
        replaceContent(list, Object.entries(data).map(([domain,{spent,limit,pct}])=>{
            const safePct=Math.min(100,Math.max(0,Number(pct)||0));
            const color=safePct>=90?'#ff3860':safePct>=60?'#ffcc00':'#00ff88';
            return el('div', {style:{padding:'6px 8px', borderBottom:'1px solid var(--border)'}},
                el('div', {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px'}},
                    el('span', {style:{fontFamily:'var(--mono)', fontSize:'10px'}}, domain),
                    el('div', {style:{display:'flex', gap:'5px', alignItems:'center'}},
                        el('span', {style:{fontSize:'9px', color:color}}, `${fmtSec(spent)} / ${fmtSec(limit)}`),
                        el('button', {className:'btn-pro btn-warn', style:{padding:'1px 6px', fontSize:'8px'}, 'data-dom':domain}, 'RESET'),
                        el('button', {className:'wl-del tl-del', 'data-dom':domain}, '\u2715')
                    )
                ),
                el('div', {className:'bar-bg'}, el('div', {className:'bar-fill', style:{background:color, width:safePct+'%'}}))
            );
        }));
        document.querySelectorAll('.tl-del').forEach(btn=>{
            btn.onclick=()=>safeSendMessage({action:'setTimeLimit',domain:btn.dataset.dom,minutes:0},loadTimeLimits);
        });
        document.querySelectorAll('[data-dom].btn-warn').forEach(btn=>{
            btn.onclick=()=>safeSendMessage({action:'resetTimeSpent',domain:btn.dataset.dom},loadTimeLimits);
        });
    });
}
$('timeLimitAddBtn').onclick=()=>{
    const site=$('timeLimitSite').value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*/,'');
    const mins=parseInt($('timeLimitMin').value);
    if(!site)return;
    safeSendMessage({action:'setTimeLimit',domain:site,minutes:mins},()=>{
        $('timeLimitSite').value='';
        loadTimeLimits();
        showToast(`⏱️ ${site}: ${mins}min/day set!`,'#ff8c00');
    });
};
$('timeLimitSite').addEventListener('keydown',e=>{if(e.key==='Enter')$('timeLimitAddBtn').click();});

// ---------------------------------------------------------------
// PRO FEATURES — BREACH ALERT
// ---------------------------------------------------------------
$('breachCheckBtn').onclick=async ()=>{
    const email=$('breachEmail').value.trim();
    if(!email||!email.includes('@')){showToast('⚠️ Enter a valid email','#ff8844');return;}
    const res=$('breachResult');
    const btn=$('breachCheckBtn');
    res.textContent='⏳ Checking...';res.style.color='var(--muted)';
    btn.textContent='...';btn.disabled=true;
    try {
        const r=await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,{
            headers:{'hibp-api-key':'','User-Agent':'BABASITARAM-PRO'}
        });
        btn.textContent='CHECK';btn.disabled=false;
        if(r.status===404){
            replaceContent(res, el('span', {style:{color:'#00ff88'}}, '\u2705 SAFE! No breaches found. Great!'));
        } else if(r.status===200){
            const breaches=await r.json();
            const names=breaches.map(b=>String(b.Name||'')).slice(0,5).join(', ');
            const span=el('span', {style:{color:'#ff3860'}}, `\u26A0\uFE0F ${breaches.length} breach(es) found: `, el('strong', null, names));
            if (breaches.length>5) span.append(el('br'), '...More exist!');
            replaceContent(res, span);
        } else if(r.status===401){
            replaceContent(res, el('span', {style:{color:'#ff8844'}},
                '\u26A0\uFE0F API key required for HIBP.', el('br'), 'Check manually: ',
                el('a', {href:'https://haveibeenpwned.com', target:'_blank', rel:'noopener noreferrer', style:{color:'#00d4ff'}}, 'haveibeenpwned.com')
            ));
        } else {
            replaceContent(res, el('span', {style:{color:'#ff8844'}}, `Error ${r.status} — try again later`));
        }
    } catch(e) {
        btn.textContent='CHECK';btn.disabled=false;
        replaceContent(res, el('span', {style:{color:'#ff8844'}},
            '\u26A0\uFE0F Network error. Check manually:', el('br'),
            el('a', {href:'https://haveibeenpwned.com', target:'_blank', rel:'noopener noreferrer', style:{color:'#00d4ff'}}, 'haveibeenpwned.com')
        ));
    }
};
$('breachEmail').addEventListener('keydown',e=>{if(e.key==='Enter')$('breachCheckBtn').click();});

// ---------------------------------------------------------------
// PRO FEATURES — WEEKLY REPORT
// ---------------------------------------------------------------
function loadWeeklyReport(){
    const card=$('reportCard');if(!card)return;
    replaceContent(card, el('div', {style:{color:'var(--muted)', fontSize:'10px', textAlign:'center', padding:'10px'}}, '\u23F3 Loading...'));
    safeSendMessage({action:'getWeeklyReport'},(r)=>{
        if(!r){replaceContent(card, el('div', {style:{color:'var(--muted)', textAlign:'center', padding:'10px'}}, 'Error'));return;}
        function siteListSpans(list, color) {
            if (!list.length) return ['—'];
            const out = [];
            list.forEach(([dm,c], i) => {
                if (i > 0) out.push(', ');
                out.push(el('span', {style:{color:color, fontFamily:'var(--mono)'}}, `${dm}(${c})`));
            });
            return out;
        }
        const statBox=(value,color,label)=>el('div', {style:{background:'#050810', border:'1px solid var(--border)', borderRadius:'4px', padding:'7px', textAlign:'center'}},
            el('div', {style:{fontSize:'20px', fontWeight:'bold', color:color, fontFamily:'monospace'}}, String(value)),
            el('div', {style:{fontSize:'8px', color:'var(--muted)'}}, label)
        );
        replaceContent(card,
            el('div', {style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px', marginBottom:'8px'}},
                statBox(r.adsBlocked, 'var(--accent)', 'Ads This Week'),
                statBox(r.trackersBlocked, '#ff8844', 'Trackers Total')
            ),
            el('div', {style:{fontSize:'9px', color:'var(--muted)', marginBottom:'3px'}}, '\u{1F3AF} Top Tracker Sites:'),
            el('div', {style:{fontSize:'9px', marginBottom:'6px', lineHeight:'1.6'}}, siteListSpans(r.topTrackerSites, '#ff8844')),
            el('div', {style:{fontSize:'9px', color:'var(--muted)', marginBottom:'3px'}}, '\u{1F3AF} Top Ad Sites:'),
            el('div', {style:{fontSize:'9px', marginBottom:'6px', lineHeight:'1.6'}}, siteListSpans(r.topAdSites, 'var(--accent)')),
            el('div', {style:{fontSize:'9px', color:'var(--muted)'}},
                '\u{1F525} Burns: ', el('span', {style:{color:'var(--red)'}}, String(r.burns)),
                '\u00A0|\u00A0Week: ', el('span', {style:{color:'var(--gold)'}}, r.week)
            )
        );
        window._lastReport=r;
    });
}
$('refreshReportBtn').onclick=loadWeeklyReport;
$('exportReportBtn').onclick=()=>{
    const r=window._lastReport;
    if(!r){showToast('⚠️ Refresh first','#ff8844');return;}
    const rows=[
        ['Metric','Value'],
        ['Week',r.week],['Ads Blocked',r.adsBlocked],['Trackers Blocked',r.trackersBlocked],
        ['Emergency Burns',r.burns],['All Time Ads',r.totalAllTime],
        ['',''],
        ['Top Tracker Sites','Count'],
        ...r.topTrackerSites.map(([d,c])=>[d,c]),
        ['',''],
        ['Top Ad Sites','Count'],
        ...r.topAdSites.map(([d,c])=>[d,c]),
    ];
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const a=Object.assign(document.createElement('a'),{
        href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
        download:`babasitaram-report-${r.week}.csv`
    });a.click();showToast('📊 Report exported!');
};

// -- SETTINGS CONTROLS -----------------------------------------
function saveSettings(patch){
    chrome.storage.local.get({settings:{}},(d)=>{
        const s={...d.settings,...patch};
        chrome.storage.local.set({settings:s}, () => {
            if('ipPrivacy' in patch) safeSendMessage({action:'applyIPPrivacy', enabled: patch.ipPrivacy});
            if('cookieCleaner' in patch && patch.cookieCleaner) safeSendMessage({action:'triggerCookieClean'});
        });
    });
}
[
    ['toggleGuard','historyGuard'],['toggleNotify','notifyOnSkip'],
    ['toggleChild','childProtection'],['toggleIPPrivacy','ipPrivacy'],
    ['toggleAdBlocker','adBlocker'],['toggleCookieCleaner','cookieCleaner'],
    ['toggleExitClear','exitClear'],['toggleFireproofDaily','fireproofDaily'],
    ['toggleAutoDisablePayment','autoDisablePaymentSites'],
    ['toggleFireproofPrompt','fireproofPrompt']
].forEach(([id,key])=>{const el=$(id);if(el)el.onchange=()=>saveSettings({[key]:el.checked});});
$('toggleNightlyClear').onchange=()=>{
    const en=$('toggleNightlyClear').checked;
    saveSettings({nightlyClear:en});
    safeSendMessage({action:'setNightlyClear',enabled:en});
};
const ht=$('toggleHTTPS');if(ht)ht.onchange=()=>saveSettings({httpsForce:ht.checked});
$('autoBurnSelect').onchange=()=>{const m=parseInt($('autoBurnSelect').value);saveSettings({autoBurnMinutes:m});safeSendMessage({action:'setAutoHistoryWipe',minutes:m});};
$('pinSessionSelect').onchange=()=>{const m=parseInt($('pinSessionSelect').value);saveSettings({pinSessionMinutes:m});chrome.storage.local.set({pinSessionMinutes:m});};

// -- WHITELIST / DAILY ADD (with Search) -----------------------
$('addDailyBtn').onclick=()=>{
    const raw=$('dailyIn').value.trim();
    if(!raw)return;
    let val;
    try { val=new URL(raw.includes('://')?raw:'https://'+raw).hostname.replace(/^www\./,''); } catch(e) { val=raw.toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*/,''); }
    val=val.toLowerCase().trim();
    if(!val)return;
    const parts=val.split('.');
    const multiTlds=new Set(['co.in','co.uk','co.jp','co.nz','co.za','com.au','com.br','net.in','org.in','gov.in','ac.in']);
    const twoTld=parts.slice(-2).join('.');
    const rootDomain=parts.length>2?(multiTlds.has(twoTld)?parts.slice(-3).join('.'):parts.slice(-2).join('.')):val;
    chrome.storage.local.get({dailySites:[],fireproofSites:[],whitelist:[]},(d)=>{
        if(!d.dailySites.includes(val)) d.dailySites.push(val);
        if(!d.fireproofSites.includes(val)) d.fireproofSites.push(val);
        if(rootDomain!==val && !d.fireproofSites.includes(rootDomain)) d.fireproofSites.push(rootDomain);
        if(!d.whitelist.includes(val)) d.whitelist.push(val);
        if(rootDomain!==val && !d.whitelist.includes(rootDomain)) d.whitelist.push(rootDomain);
        chrome.storage.local.set({dailySites:d.dailySites, fireproofSites:d.fireproofSites, whitelist:d.whitelist},()=>{
            $('dailyIn').value='';
            showToast(val + ' added!','#00ff88');
        });
    });
};
$('dailyIn').addEventListener('keydown',e=>{if(e.key==='Enter')$('addDailyBtn').click();});

// ✅ Real-time search filter on input — triggers reload
$('dailyIn')?.addEventListener('input', function() {
    clearTimeout(window._searchTimer);
    window._searchTimer = setTimeout(() => {
        loadData();
    }, 200);
});

$('launchDailyBtn').onclick=()=>{
    chrome.storage.local.get({dailySites:[]},(d)=>{
        if(!d.dailySites.length){showToast('⚠️ No sites saved yet!','#ff8844');return;}
        d.dailySites.forEach(url=>{
            try {
                const safe = new URL('https://'+url);
                if(safe.protocol==='https:') chrome.tabs.create({url:safe.href});
            } catch(e){}
        });
        window.close();
    });
};
$('clearAllDailyHistoryBtn').onclick=function(){
    const btn=this;
    chrome.storage.local.get({dailySites:[]},(d)=>{
        if(!d.dailySites.length){showToast('⚠️ No daily sites saved','#ff8844');return;}
        btn.textContent='⏳ Clearing...';btn.disabled=true;
        let total=0,pending=d.dailySites.length;
        d.dailySites.forEach(domain=>{
            chrome.history.search({text:domain,startTime:0,endTime:Date.now(),maxResults:10000},items=>{
                (items||[]).forEach(item=>{
                    try{const hd=new URL(item.url).hostname.replace(/^www\./,'');
                        if(hd===domain||hd.endsWith('.'+domain)){chrome.history.deleteUrl({url:item.url});total++;}
                    }catch(e){}
                });
                if(--pending===0){btn.textContent=`✅ ${total} cleared`;btn.style.color='#00ff88';btn.disabled=false;setTimeout(()=>{btn.textContent='🗑️ CLEAR ALL DAILY SITES HISTORY';btn.style.color='#ff6680';},3000);}
            });
        });
    });
};

// -- SETTINGS EXPORT / IMPORT ---------------------------------
// BUG FIX (#9): "Chrome export doesn't import in Firefox." The payload
// itself only ever held plain JS values (arrays/objects/strings), so
// there was nothing literally Chrome-specific in it — the real risk was
// that the version tag was hardcoded ('9.1', stale since 9.2) and the
// file carried no indication of which browser/build produced it, so a
// future format change on either side had no way to be detected on
// import. We now stamp a universal envelope with the extension's real
// version and the producing browser (metadata only — the importer in
// background.js ignores unknown fields and only reads `.data`, so a file
// exported from either browser opens on both).
const EXP_KEYS=['settings','whitelist','dailySites','fireproofSites','vaultSites','timeLimits','customRules','pin','pinEnabled'];
const IS_FIREFOX = typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined';
function setBackupStatus(msg,color){var el=document.getElementById('backupStatus');if(!el)return;el.textContent=msg;el.style.color=color||'var(--muted)';}
chrome.storage.local.get({lastBackupTime:0},function(d){if(d.lastBackupTime){var t=new Date(d.lastBackupTime).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});setBackupStatus('Last backup: '+t);}});
$('exportSettingsBtn')&&$('exportSettingsBtn').addEventListener('click',function(){
    chrome.storage.local.get(EXP_KEYS,function(data){
        if(chrome.runtime.lastError){showToast('Export failed','#ff3860');return;}
        var now=Date.now();
        var payload=JSON.stringify({
            app:'BABASITARAM_PRO',
            format:'universal-v1',
            version:(typeof VERSION!=='undefined'?VERSION:'9.2.4'),
            sourceBrowser: IS_FIREFOX ? 'firefox' : 'chrome',
            exported:now,
            data:data
        },null,2);
        var blob=new Blob([payload],{type:'application/json'});
        var sizeKb=(blob.size/1024).toFixed(1);
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url;
        a.download='babasitaram-backup-'+new Date(now).toISOString().slice(0,10)+'.json';
        document.body.appendChild(a);a.click();
        setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
        chrome.storage.local.set({lastBackupTime:now});
        var t=new Date(now).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        setBackupStatus('Saved: '+t+' ('+sizeKb+' KB)','#00ff88');
        showToast('Backup saved! ('+sizeKb+' KB)');
    });
});
// BUG FIX (real Firefox root cause): Firefox closes a WebExtension *popup*
// the moment a native file-picker dialog opens (the OS dialog stealing
// focus is treated as the popup losing focus, and popups auto-hide on
// blur). Chrome does not do this. That's why the import used to "fail
// silently" on Firefox — the popup document (and everything running in
// it: the file input, the pending FileReader, the queued sendMessage)
// gets torn down before/while the user is still picking a file, so the
// "change" handler either never runs or runs into a dead context.
// No amount of error-handling inside the popup can fix this — the fix is
// to not open the OS file dialog from inside the popup at all on Firefox.
// Instead, open the dedicated restore.html page in its own tab, which is
// never closed by the file dialog on either browser.
$('importSettingsBtn')&&$('importSettingsBtn').addEventListener('click',function(){
    if (IS_FIREFOX) {
        chrome.tabs.create({ url: chrome.runtime.getURL('restore.html') });
        return;
    }
    $('importFileInput')&&$('importFileInput').click();
});
$('importFileInput')&&$('importFileInput').addEventListener('change',function(e){
    var file=e.target.files[0];if(!file)return;
    setBackupStatus('Importing...','#ffcc00');
    var reader=new FileReader();
    reader.onload=function(ev){
        safeSendMessage({action:'importSettings',json:ev.target.result},function(r){
            if(r&&r.ok){
                setBackupStatus('Imported!','#00ff88');
                showToast('Settings imported!');
                setTimeout(function(){location.reload();},800);
            } else {
                var errMsg = (r && r.error) ? r.error : 'Unknown error';
                setBackupStatus('Import failed: '+errMsg,'#ff3860');
                showToast('Import failed: '+errMsg,'#ff3860');
            }
        });
    };
    reader.onerror=function(){
        setBackupStatus('Import failed: could not read file','#ff3860');
        showToast('Import failed: could not read file','#ff3860');
    };
    reader.readAsText(file);
    e.target.value='';
});

// -- CLOUD SYNC ------------------------------------------------
$('cloudPushBtn')?.addEventListener('click', () => {
    safeSendMessage({ action: 'pushToSync' }, () => showToast('☁️ Synced to cloud!'));
});
$('cloudPullBtn')?.addEventListener('click', () => {
    safeSendMessage({ action: 'pullFromSync' }, (r) => {
        if (r?.ok) { showToast('☁️ Pulled from cloud!'); setTimeout(() => location.reload(), 800); }
        else showToast('⚠️ ' + (r?.error || 'No cloud data'), '#ff8844');
    });
});

// -- LOG CONTROLS ----------------------------------------------
$('clearLogs').onclick=()=>safeSendMessage({action:'clearLogs'});
$('resetCountMonitor').onclick=()=>safeSendMessage({action:'resetCount'});
$('resetCountStats').onclick=()=>safeSendMessage({action:'resetCount'});
$('resetDomainStatsBtn').onclick=()=>safeSendMessage({action:'resetDomainStats'});
$('exportLogsBtn').onclick=()=>{
    chrome.storage.session.get({activityLogs:null},(sd)=>{
        const go=logs=>{
            if(!logs?.length){showToast('⚠️ No logs found!','#ff8844');return;}
            const csv='Timestamp,Activity\n'+logs.map(l=>{
                const msg = l.msg || l;
                const time = l.time || '';
                return `"${time}","${String(msg).replace(/,/g,';').replace(/"/g,"'")}"`;
            }).join('\n');
            const a=Object.assign(document.createElement('a'),{
                href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
                download:`babasitaram-logs-${new Date().toISOString().slice(0,10)}.csv`
            });a.click();showToast('📊 Logs exported!');
        };
        if(sd.activityLogs!==null)go(sd.activityLogs);
        else chrome.storage.local.get({activityLogs:[]},(ld)=>go(ld.activityLogs));
    });
};

// -- FIRE BUTTON -----------------------------------------------
$('fireBtn').onclick=()=>{
    $('confirmModal').style.display='flex';
};
$('confirmNo').onclick=()=>{$('confirmModal').style.display='none';};
$('confirmYes').onclick=()=>{
    $('confirmModal').style.display='none';
    chrome.tabs.create({url: chrome.runtime.getURL('burn.html')}, ()=>{
        window.close();
    });
};

// -- TABS ------------------------------------------------------
function activateTab(name){
    const tabBtn = document.querySelector(`.tab[data-tab="${name}"]`);
    if(!tabBtn) return;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    tabBtn.classList.add('active');
    const panel=$('tab-'+name);
    if(panel) panel.classList.add('active');
    if(name==='pro'){loadVault();loadTimeLimits();loadWeeklyReport();loadFilterStatus();loadCustomRules();}
    if(name==='v8'){loadFilterStatus();loadCustomRules();loadFocusStatus();}
}
document.querySelectorAll('.tab').forEach(tab=>{
    tab.onclick=()=>{
        activateTab(tab.dataset.tab);
        savePopupUIState();
        loadData();
    };
});

// ---------------------------------------------------------------
// BUG FIX (#7): "Popup Data Persistence — Data disappears when popup
// closes and reopens." All *stored* data (counts, sites, settings) was
// already safe in chrome.storage.local — but transient UI state (which
// tab you were on, half-typed search/input values) lived only in the
// popup's DOM, which Chrome/Firefox fully destroy every time the popup
// closes. We now snapshot that UI state into chrome.storage.local right
// before the popup unloads, and restore it before the first render.
// ---------------------------------------------------------------
const POPUP_UI_STATE_KEY = 'popupUIState';
const PERSISTED_INPUT_IDS = ['dailyIn','breachEmail','timeLimitSite','timeLimitMin','vaultIn','focusMinsSelect','dohProvider'];
function getActiveTabName(){
    const activeTab = document.querySelector('.tab.active');
    return activeTab ? activeTab.dataset.tab : 'monitor';
}
function savePopupUIState(){
    const state = { activeTab: getActiveTabName(), inputs: {} };
    PERSISTED_INPUT_IDS.forEach(id=>{
        const el=$(id);
        if(el && 'value' in el) state.inputs[id]=el.value;
    });
    try { chrome.storage.local.set({ [POPUP_UI_STATE_KEY]: state }); } catch(e) {}
}
function restorePopupUIState(done){
    chrome.storage.local.get({ [POPUP_UI_STATE_KEY]: null }, (d)=>{
        const state = d[POPUP_UI_STATE_KEY];
        if(state){
            if(state.activeTab) activateTab(state.activeTab);
            PERSISTED_INPUT_IDS.forEach(id=>{
                const el=$(id);
                if(el && state.inputs && state.inputs[id]!==undefined) el.value=state.inputs[id];
            });
        }
        if(done) done();
    });
}
// Popups don't reliably fire 'beforeunload'; 'pagehide' and 'visibilitychange'
// (hidden) both fire when the popup is dismissed in Chrome and Firefox.
window.addEventListener('pagehide', savePopupUIState);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') savePopupUIState(); });

// -- INIT ------------------------------------------------------
initLock();
loadSiteLock();
chrome.storage.local.get({dailySites:[], fireproofSites:[]}, (d) => {
    const multiTlds=new Set(['co.in','co.uk','co.jp','co.nz','co.za','com.au','com.br','net.in','org.in','gov.in','ac.in']);
    const SSO_MAP={'csccloud.in':['csc.gov.in','connect.csc.gov.in'],'csc.gov.in':['connect.csc.gov.in'],'paycsc.in':['csc.gov.in','connect.csc.gov.in']};
    function getRootDomain(val){
        const parts=val.split('.');
        if(parts.length<=2) return val;
        const twoTld=parts.slice(-2).join('.');
        return multiTlds.has(twoTld)?parts.slice(-3).join('.'):parts.slice(-2).join('.');
    }
    let changed=false;
    d.dailySites.forEach(url=>{
        if(!d.fireproofSites.includes(url)){d.fireproofSites.push(url);changed=true;}
        const root=getRootDomain(url);
        if(root!==url&&!d.fireproofSites.includes(root)){d.fireproofSites.push(root);changed=true;}
        const ssos=SSO_MAP[url]||SSO_MAP[root]||[];
        ssos.forEach(sso=>{if(!d.fireproofSites.includes(sso)){d.fireproofSites.push(sso);changed=true;}});
    });
    const existing=[...d.fireproofSites];
    existing.forEach(fp=>{
        const root=getRootDomain(fp);
        if(root!==fp&&!d.fireproofSites.includes(root)){d.fireproofSites.push(root);changed=true;}
        const ssos=SSO_MAP[fp]||SSO_MAP[root]||[];
        ssos.forEach(sso=>{if(!d.fireproofSites.includes(sso)){d.fireproofSites.push(sso);changed=true;}});
    });
    if(changed) chrome.storage.local.set({fireproofSites:d.fireproofSites});
});
restorePopupUIState(loadData);

// ---------------------------------------------------------------
// PRO TAB — FILTER LIST SYNC
// ---------------------------------------------------------------
function loadFilterStatus() {
    safeSendMessage({ action: 'getFilterSyncMeta' }, (d) => {
        if (chrome.runtime.lastError || !d) {
            const ss = $('filterSyncStatus');
            if (ss) { ss.textContent = '⚠️ Not synced yet'; ss.style.color = 'var(--muted)'; }
            const dc = $('dynamicRuleCount');
            if (dc) dc.textContent = '0';
            const lt = $('lastSyncTime');
            if (lt) lt.textContent = 'Never';
            return;
        }
        const ss = $('filterSyncStatus');
        if (ss) {
            if (d.status === 'ok') {
                ss.textContent = `✅ Synced — ${(d.total||0).toLocaleString()} rules`;
                ss.style.color = '#00ff88';
            } else if (d.status === 'error') {
                ss.textContent = `❌ Error: ${d.error||'unknown'}`;
                ss.style.color = '#ff3860';
            } else {
                ss.textContent = '⚠️ Not synced yet';
                ss.style.color = 'var(--muted)';
            }
        }
        const lt = $('lastSyncTime');
        if (lt) lt.textContent = d.lastSync ? new Date(d.lastSync).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Never';
        safeSendMessage({ action: 'getDynamicRuleCount' }, (r) => {
            const dc = $('dynamicRuleCount');
            if (dc) dc.textContent = r?.count ?? 0;
        });
        initFilterSyncButtons();
    });
}
function initFilterSyncButtons() {
    const btn = $('filterSyncNowBtn');
    if (btn && !btn._bound) {
        btn._bound = true;
        btn.onclick = () => {
            const bar = $('filterSyncBar'), ss = $('filterSyncStatus');
            btn.textContent = '⏳ Syncing...';
            btn.disabled = true;
            if (bar) bar.style.display = 'block';
            if (ss) { ss.textContent = '⏳ Downloading EasyList + EasyPrivacy...'; ss.style.color = '#ffcc00'; }
            let pct = 0;
            const prog = $('filterSyncProgress');
            const iv = setInterval(() => { pct = Math.min(pct + 3, 95); if (prog) prog.style.width = pct + '%'; }, 500);
            safeSendMessage({ action: 'syncFilterLists' }, () => {
                clearInterval(iv);
                btn.textContent = '⬇️ Sync Now';
                btn.disabled = false;
                if (prog) prog.style.width = '100%';
                setTimeout(() => { if (bar) bar.style.display = 'none'; if (prog) prog.style.width = '0%'; }, 800);
                loadFilterStatus();
                showToast('✅ Filter lists synced!');
            });
        };
    }
    const clrBtn = $('filterSyncClearBtn');
    if (clrBtn && !clrBtn._bound) {
        clrBtn._bound = true;
        clrBtn.onclick = () => {
            safeSendMessage({ action: 'clearDynamicRules' }, () => {
                loadFilterStatus();
                showToast('🗑️ Dynamic rules cleared');
            });
        };
    }
}

// ---------------------------------------------------------------
// PRO TAB — ELEMENT PICKER
// ---------------------------------------------------------------
function loadCustomRules() {
    safeSendMessage({ action: 'getAllCustomRules' }, (allRules) => {
        if (chrome.runtime.lastError) return;
        const list = $('customRulesList'); if (!list) return;
        const count = $('customRulesCount');
        if (!allRules || typeof allRules !== 'object' || !Object.keys(allRules).length) {
            replaceContent(list, emptyMsg('No custom rules'));
            if (count) count.textContent = '0';
            return;
        }
        const nodes = [], total = { n: 0 };
        Object.entries(allRules).forEach(([host, rules]) => {
            const ruleArr = Array.isArray(rules) ? rules : [];
            ruleArr.forEach(r => {
                if (!r || !r.selector) return;
                total.n++;
                nodes.push(el('div', {style:{display:'flex', alignItems:'center', gap:'6px', padding:'5px 8px', borderBottom:'1px solid var(--border)'}},
                    el('span', {style:{fontSize:'9px', flex:'0 0 auto', color:'#ff8c00'}}, host),
                    el('span', {style:{flex:'1', fontFamily:'var(--mono)', fontSize:'9px', color:'#00d4ff', overflow:'hidden', textOverflow:'ellipsis'}}, r.selector),
                    el('button', {className:'wl-del cr-del', 'data-host':host, 'data-sel':r.selector}, '\u2715')
                ));
            });
        });
        if (count) count.textContent = String(total.n);
        replaceContent(list, nodes.length ? nodes : emptyMsg('No custom rules'));
        document.querySelectorAll('.cr-del').forEach(btn => {
            btn.onclick = () => safeSendMessage(
                { action:'deleteCustomRule', hostname:btn.dataset.host, selector:btn.dataset.sel },
                () => { if (!chrome.runtime.lastError) loadCustomRules(); }
            );
        });
    });
}
const startPickerBtn = $('startPickerBtn');
if (startPickerBtn) {
    startPickerBtn.onclick = () => {
        safeSendMessage({ action: 'startElementPickerOnTab' }, () => {
            showToast('🎯 Picker active! Hover and click an element');
            window.close();
        });
    };
}
const clearAllRulesBtn = $('clearAllRulesBtn');
if (clearAllRulesBtn) {
    clearAllRulesBtn.onclick = () => {
        chrome.storage.local.set({ customRules: {} }, () => {
            loadCustomRules();
            showToast('🗑️ All custom rules deleted');
        });
    };
}

// ---------------------------------------------------------------
// V8: FOCUS MODE
// ---------------------------------------------------------------
let focusTimerIv = null;
function updateFocusUI(active, remaining) {
    const box=$('focusStatusBox'), cd=$('focusCountdown');
    const sb=$('focusStartBtn'), eb=$('focusStopBtn');
    if (!box) return;
    if (active && remaining>0) {
        box.style.display='block';
        if (eb) eb.style.display='block';
        if (sb) sb.textContent='🔄 Restart';
        const m=Math.floor(remaining/60),s=remaining%60;
        if (cd) cd.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    } else {
        box.style.display='none';
        if (eb) eb.style.display='none';
        if (sb) sb.textContent='START';
    }
}
function loadFocusStatus() {
    safeSendMessage({ action: 'getFocusStatus' }, (d) => {
        if (!d) return;
        updateFocusUI(d.active, d.remaining);
        if (d.active) {
            clearInterval(focusTimerIv);
            focusTimerIv = setInterval(() => {
                safeSendMessage({ action:'getFocusStatus' }, fd => { if(fd) updateFocusUI(fd.active,fd.remaining); });
            }, 1000);
        }
    });
}
const focusStartBtn2 = $('focusStartBtn');
if (focusStartBtn2) {
    focusStartBtn2.onclick = () => {
        const mins = parseInt($('focusMinsSelect').value);
        safeSendMessage({ action:'setFocusMode', minutes:mins }, () => {
            showToast(`🎯 Focus Mode: ${mins}min!`, '#ff8c00');
            loadFocusStatus();
        });
    };
}
const focusStopBtn2 = $('focusStopBtn');
if (focusStopBtn2) {
    focusStopBtn2.onclick = () => {
        clearInterval(focusTimerIv);
        safeSendMessage({ action:'setFocusMode', minutes:0 }, () => {
            showToast('Focus Mode stopped'); loadFocusStatus();
        });
    };
}

// ---------------------------------------------------------------
// V8: TAB ISOLATION
// ---------------------------------------------------------------
const tabIsoToggle = $('toggleTabIsolation');
if (tabIsoToggle) {
    chrome.storage.local.get({ settings:{} }, (d) => { tabIsoToggle.checked = d.settings?.tabIsolation||false; });
    tabIsoToggle.onchange = () => {
        saveSettings({ tabIsolation: tabIsoToggle.checked });
        safeSendMessage({ action:'setTabIsolation', enabled:tabIsoToggle.checked }, () => {
            showToast(tabIsoToggle.checked ? '🛡️ Tab Isolation ON' : '🔓 Tab Isolation OFF');
        });
    };
}

// ---------------------------------------------------------------
// V8: DNS-over-HTTPS
// ---------------------------------------------------------------
chrome.storage.local.get({ dohProvider:'off' }, (d) => {
    const sel = $('dohProvider'); if (sel) sel.value = d.dohProvider||'off';
});
const dohApplyBtn = $('dohApplyBtn');
if (dohApplyBtn) {
    dohApplyBtn.onclick = () => {
        const provider = $('dohProvider').value;
        const urls = { cloudflare:'https://cloudflare-dns.com/dns-query', google:'https://dns.google/dns-query', quad9:'https://dns.quad9.net/dns-query', off:'' };
        chrome.storage.local.set({ dohProvider: provider });
        const st = $('dohStatus');
        if (provider==='off') {
            if (st) st.textContent='🔓 Default DNS — ISP can see your traffic';
            showToast('DNS-over-HTTPS: OFF');
        } else {
            if (st) replaceContent(st,
                '\u2705 DoH: ', el('span', {style:{color:'#00d4ff', fontFamily:'var(--mono)'}}, urls[provider]||''),
                el('br'), el('span', {style:{color:'#4a6080'}}, 'Also set in Chrome settings/security')
            );
            showToast(`🔒 DoH: ${provider} set!`);
            chrome.tabs.create({ url: 'chrome://settings/security' });
        }
    };
}