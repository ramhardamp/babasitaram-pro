/* ============================================================
   BSRPRO Digital Khata - native bridge shim (Android APK)
   ROOT CAUSE this fixes: this app is plain HTML (no @capacitor/core bundle), and the
   Android native-bridge.js does NOT fill `Capacitor.Plugins`. So `Capacitor.Plugins.App`
   and `Capacitor.Plugins.BsrSmsScheduler` were undefined in the APK -> the JS Back
   listener was never registered and the SMS plugin always looked "unavailable".
   This file builds the plugin proxies from the bridge's own nativePromise/addListener and
   registers ONE Back-button listener for every page. Browsers (no Capacitor) are unaffected.
   ============================================================ */
(function (w) {
  'use strict';
  var cap = w.Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function') return;      // normal browser / PWA: do nothing
  if (w.__bsrNativeShim) return; w.__bsrNativeShim = true;
  cap.Plugins = cap.Plugins || {};

  function proxy(name) {
    return new Proxy({}, {
      get: function (_t, m) {
        if (m === 'then' || typeof m === 'symbol') return undefined;   // never look like a Promise
        if (m === 'addListener') {
          return function (eventName, cb) {
            var h = cap.addListener(name, eventName, cb);               // bridge-provided
            return Promise.resolve(h);
          };
        }
        return function (opts) { return cap.nativePromise(name, String(m), opts || {}); };
      }
    });
  }
  ['App', 'BsrSmsScheduler', 'BsrBiometric', 'BsrContactsPicker', 'BsrPushNotifications'].forEach(function (n) { if (!cap.Plugins[n]) cap.Plugins[n] = proxy(n); });

  /* ---- ONE Back-button owner for all pages ---- */
  var App = cap.Plugins.App;
  function pageName() { var p = String(w.location.pathname || '').split('/').pop().toLowerCase(); return p || 'index.html'; }
  function exitApp() { try { App.exitApp(); } catch (e) { /* nothing else we can do */ } }

  App.addListener('backButton', function () {
    var consumed = false;
    try {
      if (typeof w.__nativeAndroidBack === 'function') {
        consumed = !!w.__nativeAndroidBack();                           // dashboard: modal -> screen history -> exit dialog
      } else if (pageName() === 'index.html') {
        consumed = false;                                               // login is the root: leave the app
      } else if (w.history.length > 1) {
        w.history.back(); consumed = true;                              // signup / forgot-password -> previous page
      } else {
        w.location.href = 'index.html'; consumed = true;
      }
    } catch (e) { consumed = false; }
    if (!consumed) exitApp();
  });
})(window);
