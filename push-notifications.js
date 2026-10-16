/* BSR Pro push notification opt-in. Requires native BsrPushNotifications + Firebase Android app config. */
(function (g) {
  'use strict';
  const KEY = 'bsp_push_enabled';
  const TOKEN_KEY = 'bsp_push_token';
  function plugin() { return g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.BsrPushNotifications; }
  function currentUser() { try { return g.firebase && firebase.auth().currentUser; } catch (_) { return null; } }
  function db() { try { return g.firebase && firebase.firestore(); } catch (_) { return null; } }
  function updateUI(enabled, label) {
    const state = document.getElementById('pushNotificationState');
    const toggle = document.getElementById('pushNotificationsToggle');
    if (state) state.textContent = label || (enabled ? 'ON' : 'OFF');
    if (toggle) { toggle.classList.toggle('on', !!enabled); toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false'); }
  }
  async function enable() {
    const p = plugin(), user = currentUser(), database = db();
    if (!p || typeof p.register !== 'function') throw new Error('Push notifications need the Android APK with the native push plugin.');
    if (!user || !database) throw new Error('Please sign in before enabling push notifications.');
    const result = await p.register();
    if (!result || !result.token) throw new Error('Android did not return an FCM token. Check Firebase Android configuration.');
    await database.collection('users').doc(user.uid).collection('pushTokens').doc(result.token).set({ token: result.token, platform: 'android', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    localStorage.setItem(TOKEN_KEY, result.token); localStorage.setItem(KEY, '1'); updateUI(true);
    return true;
  }
  async function disable() {
    const user = currentUser(), database = db(), token = localStorage.getItem(TOKEN_KEY), p = plugin();
    if (user && database && token) await database.collection('users').doc(user.uid).collection('pushTokens').doc(token).delete().catch(function (e) { console.warn('Push token cleanup pending:', e); });
    if (p && typeof p.unregister === 'function') await p.unregister();
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(KEY); updateUI(false); return false;
  }
  async function sendTest() {
    if (localStorage.getItem(KEY) !== '1') throw new Error('Enable push notifications first.');
    if (!g.firebase || typeof firebase.functions !== 'function') throw new Error('Firebase Functions SDK is not loaded.');
    const result = await firebase.functions().httpsCallable('sendTestPush')({});
    const data = result && result.data || {};
    if (!data.sent) throw new Error(data.reason === 'no_registered_devices' ? 'No registered device token found.' : 'Test push was not sent.');
    if (typeof g.toast === 'function') g.toast('Test push sent to ' + data.sent + ' device(s)', 'success');
    return data;
  }
  async function toggle() {
    try {
      if (localStorage.getItem(KEY) === '1') { await disable(); if (typeof g.toast === 'function') g.toast('Push notifications disabled', 'success'); }
      else { await enable(); if (typeof g.toast === 'function') g.toast('Push notifications enabled', 'success'); }
    } catch (e) { console.warn('Push notification setup failed:', e); if (typeof g.toast === 'function') g.toast(e.message || 'Push notification setup failed', 'error'); updateUI(false, 'Not configured'); }
  }
  g.BsrPushNotifications = { enable, disable, toggle, sendTest, isEnabled: function () { return localStorage.getItem(KEY) === '1'; } };
  g.togglePushNotifications = toggle;
  g.sendTestPushNotification = async function () { try { await sendTest(); } catch (e) { console.warn('Push test failed:', e); if (typeof g.toast === 'function') g.toast(e.message || 'Push test failed', 'error'); } };
  document.addEventListener('DOMContentLoaded', function () { updateUI(localStorage.getItem(KEY) === '1'); });
})(window);
