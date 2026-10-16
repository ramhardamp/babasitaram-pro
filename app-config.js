/* ============================================================
   BSR PRO Digital Khata - runtime config (single source)
   appVersion  -> scripts/sync-version.mjs package.json se likhta hai (haath se edit mat karo)
   productionWebUrl -> sirf Capacitor/APK ya file:// ke liye fallback.
   Browser/GitHub Pages par link current page ke folder se nikalta hai,
   isliye repo rename / owner change par code badalna nahi padta.
   ============================================================ */
(function (g) {
  var CFG = {
    appVersion: '19.9.1',
    appId: 'com.bsrpro.digitalkhata',
    // Loan interest rule: 'legacy' (purana, DEFAULT - history nahi badalti) | 'timeline' (repayment ke baad kam principal par byaj)
    interestMode: 'legacy',
    // Automatic/background SMS (SEND_SMS) in the Android APK. DEFAULT true.
    // Browser/PWA can never send automatically: there Share Hisaab opens the SMS composer instead.
    // For a Play-Store-safe build (no SEND_SMS permission) build with ENABLE_DIRECT_SMS=false.
    directSms: true,
    // EmailJS (public client-side keys). Dono pages yahin se padhte hain - alag-alag copy nahi.
    emailjs: { publicKey: 'zVakeKYOCR5og-jon', serviceId: 'service_zyavovm', welcomeTemplateId: 'template_w0qs21r', txnTemplateId: 'template_vhuakzs' },
    productionWebUrl: 'https://ramhardamp.github.io/babasitaram-pro-v2/'
  };
  function isLocalHost(h) { return !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
  // Web base URL (hamesha trailing "/" ke saath)
  CFG.webBaseUrl = function () {
    try {
      var l = g.location;
      if ((l.protocol === 'https:' || l.protocol === 'http:') && !isLocalHost(l.hostname)) {
        return l.origin + l.pathname.replace(/[^\/]*$/, '');
      }
    } catch (e) { /* fallback neeche */ }
    return CFG.productionWebUrl;
  };
  CFG.pageUrl = function (file) { return CFG.webBaseUrl() + String(file).replace(/^\/+/, ''); };
  g.APP_CONFIG = CFG;
})(window);
