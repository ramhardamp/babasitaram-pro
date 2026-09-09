// -------------------------------------------------------------------
// BABASITARAM PRO — Restore Backup (standalone page)
//
// WHY THIS FILE EXISTS: Firefox closes a WebExtension *popup* the instant
// a native file-picker dialog opens (it treats the OS dialog stealing
// window focus as the popup losing focus, and popups auto-hide on blur).
// Chrome does not do this. That's the actual cause of "Firefox import
// fails silently" — the popup, and everything running in it (the
// FileReader, the pending sendMessage call), gets torn down before the
// user even finishes picking a file.
//
// The fix is architectural, not a guard/try-catch: move the whole restore
// flow out of the popup and into a normal extension page opened in its
// own tab. Regular extension tabs are not popups and are never closed by
// the OS file dialog on either browser, so this works identically on
// Chrome and Firefox.
// -------------------------------------------------------------------

const $ = id => document.getElementById(id);

// Same guard as popup.js: never let a torn-down extension context throw.
function safeSendMessage(msg, callback) {
    if (!chrome.runtime?.id) return;
    try {
        chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) { if (callback) callback(undefined); return; }
            if (callback) callback(response);
        });
    } catch (e) { /* extension context invalidated mid-call */ }
}

const dropZone = $('dropZone');
const fileInput = $('fileInput');
const fileNameEl = $('fileName');
const importBtn = $('importBtn');
const statusEl = $('status');

let pendingFile = null;

function setStatus(msg, color) {
    statusEl.textContent = msg;
    statusEl.style.color = color || 'var(--muted)';
}

function selectFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        setStatus('⚠️ Please choose a .json backup file', '#ff8844');
        return;
    }
    pendingFile = file;
    fileNameEl.textContent = '📄 ' + file.name;
    importBtn.disabled = false;
    setStatus('');
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => selectFile(e.target.files[0]));

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    selectFile(file);
});

importBtn.addEventListener('click', () => {
    if (!pendingFile) return;
    importBtn.disabled = true;
    setStatus('⏳ Reading file...', '#ffcc00');
    const reader = new FileReader();
    reader.onload = (ev) => {
        setStatus('⏳ Importing...', '#ffcc00');
        safeSendMessage({ action: 'importSettings', json: ev.target.result }, (r) => {
            if (r && r.ok) {
                setStatus('✅ Settings imported! You can close this tab now.', '#00ff88');
                importBtn.textContent = 'IMPORTED ✓';
            } else {
                const errMsg = (r && r.error) ? r.error : 'No response from extension — try again';
                setStatus('❌ Import failed: ' + errMsg, '#ff3860');
                importBtn.disabled = false;
            }
        });
    };
    reader.onerror = () => {
        setStatus('❌ Could not read the file', '#ff3860');
        importBtn.disabled = false;
    };
    reader.readAsText(pendingFile);
});
