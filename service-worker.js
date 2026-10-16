const CACHE='guru-shree-shell-v19.9.1';
const SHELL=['./','./index.html','./dashboard.html','./customer-view.html','./signup.html','./forgot-password.html','./firebase-config.js','./push-notifications.js','./app-config.js','./v18-i18n.js','./localize-pages.js','./assets/i18n/en.json','./assets/i18n/hi.json','./assets/i18n/gu.json','./assets/i18n/mr.json','./assets/i18n/ne.json','./assets/i18n/te.json','./ledger.js','./theme.js','./theme.css','./interest-calc.js','./interest-calc-ui.js','./backup-import.js','./recovery.js','./outbox.js','./native-shim.js','./pin-security.js','./errlog.js','./ux-pro.js','./ux-pro.css','./manifest.json','./assets/guru-shree-logo.svg','./assets/guru-shree-logo.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  if(r.mode==='navigate'){const hasToken=u.searchParams.has('token');e.respondWith(fetch(r).then(x=>{if(x.ok&&!hasToken){const copy=x.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return x;}).catch(()=>caches.match(r,{ignoreSearch:hasToken}).then(x=>x||caches.match('./index.html'))));return;}
  e.respondWith(caches.match(r).then(x=>x||fetch(r).then(y=>{caches.open(CACHE).then(c=>c.put(r,y.clone()));return y;})));
});