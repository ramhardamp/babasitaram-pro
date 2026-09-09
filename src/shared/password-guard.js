// Site Lock Protection - All Sites (except whitelist)
(function () {
    // Only run in top frame to avoid locking small iframes within whitelisted sites
    if (window.self !== window.top) return;

    function init() {
        chrome.storage.local.get(['lockAllSites', 'pin', 'whitelist', 'fireproofSites', 'unlockedSites'], (data) => {
            if (!data.lockAllSites || !data.pin) return;

            const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, '');

            // Check whitelist
            const allSafe=[...(data.whitelist||[]),...(data.fireproofSites||[])];const isWhitelisted=allSafe.some(d => {
                const clean = d.trim().toLowerCase().replace(/^www\./, '');
                return clean && (currentHost === clean || currentHost.endsWith('.' + clean));
            });

            if (isWhitelisted) return;

            // Core extension pages should not be locked
            if (currentHost.includes('chrome-extension')) return;

            const unlockedSites = data.unlockedSites || [];
            // Check if this site or its parent domain is unlocked
            const isUnlocked = unlockedSites.some(s => currentHost === s || currentHost.endsWith('.' + s));

            if (!isUnlocked) {
                renderLockScreen(data.pin, currentHost);
            }
        });
    }

    // VALIDATION FIX (#4/#5): built entirely with createElement/textContent/
    // style.cssText — no innerHTML assignment and no createContextualFragment
    // call anywhere in this function, so there's nothing for Chrome Web
    // Store's or AMO's automated scanners to flag, and no string of HTML is
    // ever parsed (the CSS below is plain text assigned to a <style> node's
    // textContent, which never parses as markup).
    function renderLockScreen(savedPass, host) {
        const logoUrl = chrome.runtime.getURL('icon.png');

        // Block interaction immediately.
        document.title = 'BABA SITARAM SHIELD';
        while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
        document.body.style.cssText = 'background:#000;';

        setTimeout(() => {
            while (document.body.firstChild) document.body.removeChild(document.body.firstChild);

            const style = document.createElement('style');
            style.textContent =
                '*{margin:0;padding:0;box-sizing:border-box;}' +
                'body{background:#000;font-family:Arial,sans-serif;overflow:hidden;height:100vh;display:flex;align-items:center;justify-content:center;}' +
                '.bg{position:fixed;inset:0;background:radial-gradient(circle at center,#1a0510 0%,#000 100%);}' +
                '.container{position:relative;z-index:10;background:rgba(15,15,15,0.98);padding:50px 40px;border-radius:24px;text-align:center;box-shadow:0 0 80px rgba(255,68,0,0.25);max-width:420px;width:95%;border:1px solid rgba(255,136,0,0.2);backdrop-filter:blur(10px);}' +
                '.img-box{position:relative;width:160px;height:160px;margin:0 auto 25px;}' +
                '.ring{position:absolute;inset:-5px;border:3px solid transparent;border-top-color:#ff4400;border-radius:50%;animation:spin 4s linear infinite;}' +
                '.ring:nth-child(2){inset:-15px;border-top-color:#00d4ff;animation-duration:6s;animation-direction:reverse;}' +
                '@keyframes spin{to{transform:rotate(360deg);}}' +
                '.img-box img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid #ff4400;box-shadow:0 0 30px rgba(255,68,0,0.5);}' +
                '.lock-icon{font-size:42px;margin-bottom:10px;filter:drop-shadow(0 0 10px #ff4400);}' +
                'h1{color:#ff4400;font-size:32px;letter-spacing:3px;text-shadow:0 0 20px rgba(255,68,0,0.5);font-weight:900;margin-bottom:8px;}' +
                '.sub{color:#ffaa00;font-size:13px;margin-bottom:20px;text-transform:uppercase;letter-spacing:1px;font-weight:bold;}' +
                '.site-tag{color:#00d4ff;font-weight:bold;font-size:13px;background:rgba(0,212,255,0.1);padding:10px;border-radius:6px;border:1px solid rgba(0,212,255,0.2);margin-bottom:20px;display:inline-block;max-width:100%;word-break:break-all;}' +
                'input{width:100%;padding:16px;background:rgba(5,5,5,0.9);border:1px solid #333;border-radius:8px;color:#fff;font-size:16px;margin-bottom:12px;outline:none;text-align:center;transition:0.3s;}' +
                'input:focus{border-color:#ff4400;box-shadow:0 0 15px rgba(255,68,0,0.3);}' +
                '.err{color:#ff3860;font-size:12px;margin-bottom:12px;min-height:18px;font-weight:bold;}' +
                'button{width:100%;background:linear-gradient(135deg,#ff4400,#ff6600);color:#000;border:none;padding:16px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:bold;letter-spacing:2px;box-shadow:0 4px 15px rgba(255,68,0,0.4);transition:0.2s;}' +
                'button:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(255,68,0,0.6);}' +
                '.mantra{font-size:12px;color:rgba(255,136,0,0.5);margin-top:20px;font-style:italic;}';

            const bg = document.createElement('div');
            bg.className = 'bg';

            const ring1 = document.createElement('div');
            ring1.className = 'ring';
            const ring2 = document.createElement('div');
            ring2.className = 'ring';
            const logoImg = document.createElement('img');
            logoImg.src = logoUrl;
            const imgBox = document.createElement('div');
            imgBox.className = 'img-box';
            imgBox.appendChild(ring1);
            imgBox.appendChild(ring2);
            imgBox.appendChild(logoImg);

            const lockIcon = document.createElement('div');
            lockIcon.className = 'lock-icon';
            lockIcon.textContent = '🔒';

            const h1 = document.createElement('h1');
            h1.textContent = 'SITE LOCKED';

            const sub = document.createElement('div');
            sub.className = 'sub';
            sub.textContent = 'BABASITARAM SHIELD ACTIVE';

            const siteTag = document.createElement('div');
            siteTag.className = 'site-tag';
            siteTag.textContent = '📍 ' + host;

            const input = document.createElement('input');
            input.type = 'password';
            input.id = 'lockInput';
            input.placeholder = 'Enter Password';
            input.autofocus = true;

            const err = document.createElement('div');
            err.className = 'err';
            err.id = 'lockErr';

            const btn = document.createElement('button');
            btn.id = 'unlockBtn';
            btn.textContent = 'UNLOCK SYSTEM';

            const mantra = document.createElement('div');
            mantra.className = 'mantra';
            mantra.textContent = '"श्री राम जय राम जय जय राम"';

            const container = document.createElement('div');
            container.className = 'container';
            container.appendChild(imgBox);
            container.appendChild(lockIcon);
            container.appendChild(h1);
            container.appendChild(sub);
            container.appendChild(siteTag);
            container.appendChild(input);
            container.appendChild(err);
            container.appendChild(btn);
            container.appendChild(mantra);

            document.body.appendChild(style);
            document.body.appendChild(bg);
            document.body.appendChild(container);

            function handleUnlock() {
                const val = input.value;
                if (!val) {
                    err.textContent = "⚠️ Enter password";
                    return;
                }
                if (val === savedPass) {
                    chrome.storage.local.get(['unlockedSites'], (res) => {
                        const list = res.unlockedSites || [];
                        const cleanHost = host.toLowerCase().replace(/^www\./, '');
                        if (!list.includes(cleanHost)) list.push(cleanHost);
                        chrome.storage.local.set({ unlockedSites: list }, () => {
                            window.location.reload();
                        });
                    });
                } else {
                    err.textContent = "❌ Wrong Password";
                    input.value = '';
                    input.focus();
                    setTimeout(() => err.textContent = '', 2000);
                }
            }

            btn.addEventListener('click', handleUnlock);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUnlock(); });
        }, 50);
    }

    // Safety check for extension context
    try {
        if (chrome.runtime && chrome.runtime.id) {
            init();
        }
    } catch (e) { }
})();
