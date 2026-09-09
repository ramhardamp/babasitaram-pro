// ═══════════════════════════════════════════════════════════════════
// BABASITARAM PRO v9.2.2 — content.js (Ultra-Safe Messaging)
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const isTopFrame = (window === window.top);
  const hostname = window.location.hostname;
  const isYouTube = hostname.includes('youtube.com');

  // ── ULTRA-SAFE MESSENGER ──────────────────────────────────────
  function safeSendMessage(msg, callback) {
    // Check if extension context is still alive
    if (!chrome.runtime || !chrome.runtime.id) {
      // silently fail, no error log to avoid console noise
      if (callback) callback({ error: 'context_invalid' });
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        // Check lastError even in callback
        if (chrome.runtime.lastError) {
          if (callback) callback({ error: chrome.runtime.lastError.message });
          return;
        }
        if (callback) callback(response);
      });
    } catch (e) {
      if (callback) callback({ error: e.message });
    }
  }

  // ── TRACKER LIST ─────────────────────────────────────────────────
  const TRACKER_PATTERNS = [
    'doubleclick', 'googlesyndication', 'google-analytics', 'googletagmanager',
    'googleadservices', 'facebook.com/tr', 'connect.facebook', 'ads-twitter',
    'analytics.twitter', 'adnxs', 'advertising.com', 'taboola', 'outbrain',
    'criteo', 'hotjar', 'amazon-adsystem', 'clarity.ms', 'scorecardresearch',
    'mc.yandex', 'moatads', 'analytics.tiktok', 'amplitude.com', 'mixpanel',
    'hubspot', 'pardot', 'px.ads.linkedin', 'ct.pinterest', 'segment.com',
    'heapanalytics', 'bat.bing', 'snap.licdn', 'tr.snapchat', 'pubmatic',
    'rubiconproject', 'openx.net', 'casalemedia', 'sharethrough',
    'static.ads-twitter', 'fingerprintjs', 'newrelic.com'
  ];

  const AD_SELECTORS = [
    '[class*="advert"],[class*="adsense"],[class*="adsbygoogle"]',
    '[id*="advert"],[id*="adsense"],[id*="adsbygoogle"]',
    '[class*="ad-container"],[class*="ad-wrapper"],[class*="ad-slot"]',
    '[id*="google_ads"],[class*="dfp-"],[class*="gpt-ad"]',
    'iframe[src*="doubleclick"],iframe[src*="googlesyndication"]',
    '.taboola-widget,.outbrain-widget'
  ].join(',');

  const WHITELIST = ['youtube.com', 'googleapis.com', 'ytimg.com',
    'googlevideo.com', 'gstatic.com', 'accounts.google.com'];

  const PAYMENT_KEYS = [
    'paytm', 'phonepe', 'razorpay', 'paypal', 'stripe', 'billdesk',
    'hdfc', 'sbi.co.in', 'icicibank', 'axisbank', 'kotak', 'payu',
    'instamojo', 'cashfree', 'mobikwik', 'freecharge', 'amazon.in',
    'flipkart', 'doctorgo', 'practo', 'apollo247', 'netmeds',
    'pharmeasy', '1mg.com', 'lybrate', 'tatahealth', 'healthkart'
  ];

  const LOGIN_KEYWORDS = [
    'sign in', 'login', 'log in', 'continue with', 'sign in with',
    'google', 'github', 'facebook', 'apple', 'microsoft', 'twitter',
    'oauth', 'sso', 'saml', 'use single sign', 'enter your email',
    'email address', 'username', 'password', 'auth', 'authenticate'
  ];

  let userSettings = { adBlocker: true, ipPrivacy: true, lightweightMode: false, fireproofPrompt: true };
  let lightweightActive = false;
  let adLock = false;
  let ytAdInterval = null;
  let mutationObs = null;
  let adScanInterval = null;

  // ── HELPERS ────────────────────────────────────────────────────
  const injectStyle = (css, id) => {
    const go = () => {
      const t = document.head || document.documentElement;
      if (!t) { setTimeout(go, 10); return; }
      if (id && document.getElementById(id)) return;
      const s = document.createElement('style');
      if (id) s.id = id;
      s.textContent = css;
      t.appendChild(s);
    };
    go();
  };

  const TRACKER_REGEX = new RegExp(TRACKER_PATTERNS.map(function(p){
    return p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('|'), 'i');
  const WHITELIST_REGEX = new RegExp(WHITELIST.map(function(p){
    return p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('|'), 'i');

  function isTrackerUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (WHITELIST_REGEX.test(url)) return false;
    return TRACKER_REGEX.test(url);
  }

  // ── CORE: DOM-BASED TRACKER SCANNER ────────────────────────────
  function scanPageTrackers() {
    if (!isTopFrame) return;
    let detected = new Set();
    document.querySelectorAll('script[src],img[src],iframe[src],link[href],[data-src]').forEach(el => {
      const url = el.src || el.href || el.getAttribute('data-src') || '';
      if (url && isTrackerUrl(url)) detected.add(url);
    });
    document.querySelectorAll('script:not([src])').forEach(el => {
      if (el.textContent && el.textContent.length > 50) {
        if (TRACKER_REGEX.test(el.textContent)) detected.add('inline:tracker');
      }
    });
    return detected.size;
  }

  // ── YOUTUBE AD KILLER ──────────────────────────────────────────
  const destroyYTAd = () => {
    const video = document.querySelector('video');
    const adBanner = document.querySelector('.ad-showing, .ad-interrupting');
    if (!adBanner || !video || adLock) return;
    adLock = true;
    safeSendMessage({ action: 'adDetected' });
    try {
      video.playbackRate = 16;
      video.muted = true;
      if (video.duration > 0.5 && isFinite(video.duration))
        video.currentTime = video.duration - 0.1;
    } catch (e) {}
    document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button')
      .forEach(btn => { try { btn.click(); } catch (e) {} });
    const oc = document.querySelector('.ytp-ad-overlay-close-button');
    if (oc) try { oc.click(); } catch (e) {}
    setTimeout(() => {
      safeSendMessage({ action: 'adBlocked' });
      adLock = false;
    }, 80);
  };

  // ── AD ELEMENT REMOVER ─────────────────────────────────────────
  const removeAdElements = () => {
    let count = 0;
    document.querySelectorAll(AD_SELECTORS).forEach(el => {
      if (el && (el.offsetHeight > 10 || el.offsetWidth > 10)) {
        el.remove(); count++;
      }
    });
    if (count > 0) safeSendMessage({ action: 'adBlocked' });
  };

  // ── COSMETIC RULES FACTORY ─────────────────────────────────────
  function getCosmeticRulesForDomain(host) {
    if (host.includes('youtube.com')) {
      return [`
        ytd-display-ad-renderer, ytd-promoted-sparkles-web-renderer,
        ytd-banner-promo-renderer, ytd-video-masthead-ad-v3-renderer,
        ytd-statement-banner-renderer, #masthead-ad,
        .ytp-ad-overlay-container, .ytp-ad-message-container,
        ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
        ytd-promoted-video-renderer { display: none !important; }
      `];
    }
    return [`
      [class*="ad-"],[class*="ads-"],[class*="advert"],
      [id*="ad-"],[id*="ads-"],[id*="advert"],
      [class*="sponsor-"],[class*="promo-"],
      [class*="ad-container"],[class*="ad-wrapper"],
      iframe[src*="doubleclick"],iframe[src*="googlesyndication"],
      div[id^="google_ads"],.taboola-widget,.outbrain-widget {
        display: none !important; visibility: hidden !important;
        height: 0 !important; width: 0 !important; pointer-events: none !important;
      }
    `];
  }

  // ── COSMETIC-ONLY MODE ─────────────────────────────────────────
  function injectCosmeticOnly() {
    if (document.getElementById('baba-cosmetic-only')) return;
    const baseRules = getCosmeticRulesForDomain(hostname);
    safeSendMessage(
      { action: 'getCustomRules', domain: hostname.replace(/^www\./, '') },
      (res) => {
        const custom = Array.isArray(res) ? res : [];
        const customCss = custom
          .map(sel => typeof sel === 'string' ? `${sel}{display:none!important}` : '')
          .filter(Boolean).join('\n');
        injectStyle(baseRules.join('\n') + '\n' + customCss, 'baba-cosmetic-only');
      }
    );
  }

  // ── STOP MUTATION OBSERVER ONLY ────────────────────────────────
  function disableMutationObserverOnly() {
    if (ytAdInterval)   { clearInterval(ytAdInterval);   ytAdInterval = null; }
    if (adScanInterval) { clearInterval(adScanInterval); adScanInterval = null; }
    if (mutationObs)    { mutationObs.disconnect();       mutationObs = null; }
  }

  // ── FULL BLOCKING ───────────────────────────────────────────────
  function startBlocking() {
    const styleId = isYouTube ? 'baba-yt-ads' : 'baba-global-ads';
    getCosmeticRulesForDomain(hostname).forEach(r => injectStyle(r, styleId));

    if (isYouTube) {
      ytAdInterval = setInterval(destroyYTAd, 500);
    } else if (isTopFrame) {
      let _timer = null;
      mutationObs = new MutationObserver(() => {
        if (_timer) return;
        _timer = setTimeout(() => { removeAdElements(); _timer = null; }, 800);
      });
      const init = () => {
        if (document.body) {
          mutationObs.observe(document.body, { childList: true, subtree: false });
          removeAdElements();
        } else setTimeout(init, 50);
      };
      init();
    }
  }

  // ── ANTI-FINGERPRINT ───────────────────────────────────────────
  function applyAntiFingerprint() {
    if (!isTopFrame) return;
    try {
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (p) {
        if (p === 37445) return 'Intel Open Source Technology Center';
        if (p === 37446) return 'Mesa DRI Intel(R) HD Graphics';
        return origGetParam.call(this, p);
      };
    } catch(e) {}
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch(e) {}
    try {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function (...a) {
        const data = origGetChannelData.apply(this, a);
        for (let i = 0; i < Math.min(data.length, 10); i++)
          data[i] += (Math.random() - 0.5) * 0.0000001;
        return data;
      };
    } catch(e) {}
  }

  // ── HTTPS SMART REDIRECT ───────────────────────────────────────
  if (isTopFrame && window.location.protocol === 'http:') {
    const host = hostname;
    const isLocal = ['localhost','127.0.0.1','0.0.0.0'].includes(host) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.corp') || host.endsWith('.home') ||
      host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');

    if (!isLocal) {
      const cacheKey = 'baba_https_wl';
      const cached = sessionStorage.getItem(cacheKey);
      const doRedirect = (whitelist) => {
        const clean = host.replace(/^www\./, '');
        const isWL = whitelist.some(w => {
          const wc = w.trim().toLowerCase().replace(/^www\./, '');
          return wc && (clean === wc || clean.endsWith('.' + wc));
        });
        if (!isWL) {
          try {
            const safeUrl = new URL(window.location.href);
            if (safeUrl.hostname !== host) return;
            safeUrl.protocol = 'https:';
            window.location.replace(safeUrl.toString());
          } catch(e) {}
        }
      };
      if (cached !== null) {
        doRedirect(JSON.parse(cached));
      } else {
        chrome.storage.local.get({ settings: { httpsForce: true }, whitelist: [] }, (d) => {
          if (d.settings.httpsForce === false) return;
          try { sessionStorage.setItem(cacheKey, JSON.stringify(d.whitelist || [])); } catch(e) {}
          doRedirect(d.whitelist || []);
        });
      }
      return;
    }
  }

  // ── FETCH / XHR INTERCEPT ──────────────────────────────────────
  let jsBlockCount = 0;
  if (isTopFrame) {
    const _isFireproofPage = (() => {
      const h = hostname.replace(/^www\./, '');
      return (userSettings._fireproofSites || []).some(fp => h === fp || h.endsWith('.' + fp));
    });

    const _fetch = window.fetch;
    window.fetch = function (...args) {
      if (_isFireproofPage()) return _fetch.apply(this, args);
      const url = String(typeof args[0] === 'string' ? args[0] : (args[0]?.url || ''));
      if (isTrackerUrl(url)) {
        jsBlockCount++;
        return Promise.reject(new Error('Blocked: BABASITARAM'));
      }
      return _fetch.apply(this, args);
    };

    const _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
      if (!_isFireproofPage() && typeof u === 'string' && isTrackerUrl(u)) {
        jsBlockCount++;
        return;
      }
      return _xhrOpen.apply(this, [m, u, ...r]);
    };
  }

  // ── MAIN TRACKER DETECTION ──────────────────────────────────
  function runTrackerScan() {
    if (!isTopFrame) return;
    const count = scanPageTrackers();
    if (count > 0) {
      safeSendMessage({ action: 'trackerBlocked', count });
    }
  }

  // ── PAYMENT SITE DETECTION ─────────────────────────────────────
  function detectPaymentSite() {
    const site = hostname.toLowerCase();
    if (PAYMENT_KEYS.some(p => site.includes(p))) {
      safeSendMessage({
        action: 'paymentSiteDetected', site: hostname,
        pageTitle: document.title, timestamp: Date.now()
      });
    }
  }

  // ── CLEANUP ON PAGE HIDE ───────────────────────────────────────
  window.addEventListener('pagehide', () => {
    if (ytAdInterval)   { clearInterval(ytAdInterval);   ytAdInterval = null; }
    if (adScanInterval) { clearInterval(adScanInterval); adScanInterval = null; }
    if (mutationObs)    { mutationObs.disconnect();       mutationObs = null; }
  }, { once: true });

  // ── FIREPROOF LOGIN PROMPT ──────────────────────────────────
  let promptShown = false;
  let promptObserver = null;
  let promptInterval = null;

  async function checkForLoginAndShowPrompt() {
    if (promptShown) return;
    if (!isTopFrame) return;

    const { settings = {} } = await chrome.storage.local.get(['settings']);
    if (settings.fireproofPrompt === false) return;

    const cleanHost = hostname.replace(/^www\./, '');
    const { fireproofSites = [], fireproofPromptDismissed = {} } =
      await chrome.storage.local.get(['fireproofSites', 'fireproofPromptDismissed']);

    if (fireproofSites.some(s => cleanHost === s || cleanHost.endsWith('.' + s))) return;

    const today = new Date().toISOString().slice(0,10);
    if (fireproofPromptDismissed[cleanHost] === today) return;

    if (PAYMENT_KEYS.some(p => cleanHost.includes(p))) return;

    let hasLogin = false;
    if (document.querySelector('input[type="password"]')) hasLogin = true;

    const hasEmail = document.querySelector('input[type="email"], input[name="email"], input[name="username"], input[id*="email"]');
    const hasAnyButton = document.querySelector('button, input[type="submit"], [role="button"]');
    if (hasEmail && hasAnyButton) hasLogin = true;

    const loginRegex = new RegExp(LOGIN_KEYWORDS.join('|'), 'i');
    const buttons = document.querySelectorAll('button, a, input[type="submit"], [role="button"]');
    for (const btn of buttons) {
      const txt = btn.innerText || btn.value || btn.getAttribute('aria-label') || '';
      if (loginRegex.test(txt)) {
        hasLogin = true;
        break;
      }
    }

    if (document.querySelector('[class*="oauth"], [class*="social"], [class*="provider"], [id*="oauth"]')) hasLogin = true;

    if (/auth|login|signin|oauth|sso/i.test(window.location.href)) hasLogin = true;

    if (!hasLogin) return;

    promptShown = true;
    showFireproofPromptBanner(cleanHost);
  }

  function showFireproofPromptBanner(cleanHost) {
    const banner = document.createElement('div');
    banner.id = 'baba-fireproof-prompt';
    Object.assign(banner.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#0a0e17',
      border: '2px solid #ff8c00',
      borderRadius: '12px',
      padding: '14px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      color: '#c8d8e8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: '90%',
      backdropFilter: 'blur(8px)'
    });

    const msg = document.createElement('span');
    msg.textContent = '🔥 इस साइट को Fireproof में जोड़ें? (लॉगिन सेशन सुरक्षित रहेगा)';
    msg.style.fontWeight = '500';

    const yesBtn = document.createElement('button');
    yesBtn.textContent = '✅ हाँ';
    Object.assign(yesBtn.style, {
      background: '#00ff88',
      border: 'none',
      color: '#000',
      padding: '6px 16px',
      borderRadius: '6px',
      fontWeight: 'bold',
      cursor: 'pointer',
      fontSize: '13px'
    });
    yesBtn.onclick = async () => {
      const { fireproofSites: fp = [], dailySites: ds = [], whitelist: wl = [] } =
        await chrome.storage.local.get(['fireproofSites', 'dailySites', 'whitelist']);
      if (!fp.includes(cleanHost)) fp.push(cleanHost);
      if (!ds.includes(cleanHost)) ds.push(cleanHost);
      if (!wl.includes(cleanHost)) wl.push(cleanHost);
      await chrome.storage.local.set({ fireproofSites: fp, dailySites: ds, whitelist: wl });
      banner.remove();
      const toast = document.createElement('div');
      toast.textContent = '✅ साइट Fireproof में जोड़ दी गई!';
      Object.assign(toast.style, {
        position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
        background: '#0a0e17', border: '1px solid #00ff88', color: '#00ff88',
        padding: '8px 16px', borderRadius: '8px', fontSize: '13px', zIndex: '2147483647'
      });
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    };

    const noBtn = document.createElement('button');
    noBtn.textContent = '❌ नहीं';
    Object.assign(noBtn.style, {
      background: 'transparent',
      border: '1px solid #4a6080',
      color: '#c8d8e8',
      padding: '6px 16px',
      borderRadius: '6px',
      fontWeight: 'bold',
      cursor: 'pointer',
      fontSize: '13px'
    });
    noBtn.onclick = () => banner.remove();

    const dismissCheck = document.createElement('label');
    dismissCheck.style.cssText = 'font-size:12px;color:#4a6080;display:flex;align-items:center;gap:4px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'width:14px;height:14px;accent-color:#ff8c00;';
    dismissCheck.appendChild(cb);
    dismissCheck.appendChild(document.createTextNode('🔕 आज के लिए मत पूछो'));

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      color: '#4a6080',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '0 4px'
    });
    closeBtn.addEventListener('click', () => banner.remove());

    banner.appendChild(msg);
    banner.appendChild(yesBtn);
    banner.appendChild(noBtn);
    banner.appendChild(dismissCheck);
    banner.appendChild(closeBtn);

    cb.addEventListener('change', async () => {
      if (cb.checked) {
        const { fireproofPromptDismissed: fd = {} } = await chrome.storage.local.get(['fireproofPromptDismissed']);
        fd[cleanHost] = new Date().toISOString().slice(0,10);
        await chrome.storage.local.set({ fireproofPromptDismissed: fd });
      }
    });

    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 30000);
  }

  function startLoginMonitor() {
    setTimeout(checkForLoginAndShowPrompt, 2000);
    if (promptInterval) clearInterval(promptInterval);
    promptInterval = setInterval(() => {
      checkForLoginAndShowPrompt();
      if (promptShown) clearInterval(promptInterval);
    }, 3000);

    if (promptObserver) promptObserver.disconnect();
    promptObserver = new MutationObserver(() => {
      checkForLoginAndShowPrompt();
    });
    const observerTarget = document.body || document.documentElement;
    if (observerTarget) {
      promptObserver.observe(observerTarget, { childList: true, subtree: true });
    }
  }

  // ── INITIALIZE ──────────────────────────────────────────────────
  const DEFAULT_SETTINGS = { adBlocker: true, ipPrivacy: true, lightweightMode: false, fireproofPrompt: true };
  chrome.storage.local.get({
    settings: DEFAULT_SETTINGS,
    fireproofSites: [], whitelist: [], pageExceptions: [], disabledSites: []
  }, (d) => {
    // IMPORTANT: chrome.storage's default only applies when the key is 100% missing.
    // As soon as ANY partial settings object was ever saved (e.g. one toggle flipped),
    // the other fields silently became `undefined` and every `if (userSettings.adBlocker)`
    // check below turned falsy — killing ad-block/tracker-scan/etc across all sites.
    // Merging on top of DEFAULT_SETTINGS guarantees missing fields fall back safely.
    userSettings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    userSettings._fireproofSites = [...new Set([...(d.fireproofSites||[]), ...(d.whitelist||[])])];

    const cleanHost = hostname.replace(/^www\./, '');
    const isLightweight = !!userSettings.lightweightMode;
    lightweightActive = isLightweight;
    const isPageException = (d.pageExceptions || []).some(e => {
      const c = (e || '').replace(/^www\./, '');
      return c && (cleanHost === c || cleanHost.endsWith('.' + c));
    });
    const isAlreadyDisabled = (d.disabledSites || []).some(s => cleanHost === s || cleanHost.endsWith('.' + s));

    const isPaymentSite = PAYMENT_KEYS.some(key => cleanHost.includes(key));
    if (isPaymentSite && userSettings.autoDisablePaymentSites !== false && !isAlreadyDisabled) {
      if (!sessionStorage.getItem('baba_payment_disabled')) {
        sessionStorage.setItem('baba_payment_disabled', '1');
        safeSendMessage({
          action: 'toggleSiteDisable',
          hostname: cleanHost,
          enabled: true
        }, () => {
          setTimeout(() => window.location.reload(), 200);
        });
        return;
      }
    }

    if (isAlreadyDisabled) {
      console.log('🚫 Site is DISABLED. Content script exits.');
      return;
    }

    if (userSettings.ipPrivacy !== false) applyAntiFingerprint();

    if (userSettings.adBlocker) {
      if (isLightweight || isPageException) {
        if (isPaymentSite) {
          disableMutationObserverOnly();
        } else {
          injectCosmeticOnly();
        }
      } else {
        startBlocking();
      }
    }

    if (isTopFrame) {
      setTimeout(runTrackerScan, 2000);
      setTimeout(runTrackerScan, 6000);
      setTimeout(detectPaymentSite, 1500);

      setTimeout(startLoginMonitor, 1000);

      if (userSettings.adBlocker && !isLightweight) {
        setTimeout(() => buildFloatButton(isPageException, isAlreadyDisabled), 4000);
      }
    }
  });

  // ── FLOATING BUTTON ──────────────────────────────────────────
  let _floatBtn = null;

  function buildFloatButton(isException, isDisabled) {
    if (!isTopFrame || _floatBtn) return;

    let ICON, TITLE, ACTION, TOAST, BORDER, MODE_TYPE;
    if (isDisabled) {
      MODE_TYPE = 'disabled';
      ICON = '⛔';
      TITLE = 'Extension OFF';
      ACTION = 'Enable Full Mode';
      TOAST = '🔄 Enabling Full Mode...';
      BORDER = '#ff4444';
    } else if (isException) {
      MODE_TYPE = 'cosmetic';
      ICON = '✅';
      TITLE = 'Cosmetic Mode ON';
      ACTION = 'Switch to Emergency OFF';
      TOAST = '⛔ Emergency OFF — reloading...';
      BORDER = '#27ae60';
    } else {
      MODE_TYPE = 'full';
      ICON = '🛠️';
      TITLE = 'Site broken?';
      ACTION = 'Fix it (Cosmetic Mode)';
      TOAST = '✅ Cosmetic Mode ON — reloading...';
      BORDER = '#e94560';
    }

    const hostEl = document.createElement('div');
    hostEl.id = 'baba-fix-host';
    hostEl.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;pointer-events:none;';
    const shadow = hostEl.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      #wrap {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #1a1a2e;
        border: 1px solid ${BORDER};
        border-radius: 24px;
        padding: 8px 14px 8px 10px;
        box-shadow: 0 4px 18px rgba(0,0,0,.55);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #eee;
        cursor: pointer;
        user-select: none;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity .3s ease, transform .3s ease;
      }
      #wrap.show  { opacity: 1; transform: translateY(0); }
      #wrap:hover { background: #16213e; }
      #icon  { font-size: 16px; line-height: 1; }
      #label { line-height: 1.3; }
      #label strong { display: block; color: ${BORDER}; font-size: 12px; }
      #close { margin-left: 6px; color: #888; font-size: 15px; line-height: 1; padding: 0 2px; }
      #close:hover { color: #eee; }
      #toast {
        position: fixed; bottom: 70px; right: 18px;
        background: #0f3460; color: #eee; font-size: 12px;
        padding: 8px 14px; border-radius: 12px;
        border: 1px solid ${BORDER};
        opacity: 0; transition: opacity .3s; pointer-events: none;
      }
      #toast.show { opacity: 1; }
    `;

    const wrap = document.createElement('div');
    wrap.id = 'wrap';
    const iconSpan = document.createElement('span');
    iconSpan.id = 'icon';
    iconSpan.textContent = ICON;
    const labelSpan = document.createElement('span');
    labelSpan.id = 'label';
    labelSpan.appendChild(document.createTextNode(TITLE));
    const actionStrong = document.createElement('strong');
    actionStrong.textContent = ACTION;
    labelSpan.appendChild(actionStrong);
    const closeSpan = document.createElement('span');
    closeSpan.id = 'close';
    closeSpan.title = 'Dismiss';
    closeSpan.textContent = '✕';
    wrap.append(iconSpan, labelSpan, closeSpan);

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = TOAST;

    shadow.appendChild(style);
    shadow.appendChild(wrap);
    shadow.appendChild(toast);
    document.documentElement.appendChild(hostEl);
    _floatBtn = hostEl;

    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('show')));

    wrap.addEventListener('click', (e) => {
      if (e.target.id === 'close') { dismissFloatButton(); return; }
      wrap.style.pointerEvents = 'none';
      wrap.style.opacity = '0.5';
      toast.classList.add('show');
      const cleanHost = hostname.replace(/^www\./, '');
      if (MODE_TYPE === 'full') {
        safeSendMessage({ action: 'togglePageException', hostname: cleanHost, enable: true });
      } else if (MODE_TYPE === 'cosmetic') {
        safeSendMessage({ action: 'toggleSiteDisable', hostname: cleanHost });
        safeSendMessage({ action: 'togglePageException', hostname: cleanHost, enable: false });
      } else {
        safeSendMessage({ action: 'toggleSiteDisable', hostname: cleanHost });
      }
      setTimeout(() => window.location.reload(), 900);
    });

    wrap.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const cleanHost = hostname.replace(/^www\./, '');
      safeSendMessage({
        action: 'toggleSiteDisable',
        hostname: cleanHost,
        enabled: true
      }, () => {
        toast.textContent = '⛔ Emergency OFF — reloading...';
        toast.style.borderColor = '#ff4444';
        toast.classList.add('show');
        setTimeout(() => window.location.reload(), 600);
      });
    });

    setTimeout(dismissFloatButton, 15000);
  }

  function dismissFloatButton() {
    if (!_floatBtn) return;
    _floatBtn.remove();
    _floatBtn = null;
  }

  // ── RUNTIME MESSAGE HANDLER ──────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'setLightweightMode') {
      lightweightActive = !!msg.enabled;
      if (lightweightActive) {
        disableMutationObserverOnly();
        injectCosmeticOnly();
      } else {
        const co = document.getElementById('baba-cosmetic-only');
        if (co) co.remove();
        if (userSettings.adBlocker) startBlocking();
      }
      return;
    }

    if (msg.action === 'setPageException') {
      if (msg.enabled) {
        disableMutationObserverOnly();
        injectCosmeticOnly();
      } else {
        const co = document.getElementById('baba-cosmetic-only');
        if (co) co.remove();
        if (userSettings.adBlocker) startBlocking();
      }
      return;
    }

    if (msg.action === 'disableBlockingForSite') {
      disableMutationObserverOnly();
      injectCosmeticOnly();
    }
  });

})();