/* BSRPRO Digital Khata - lightweight on-device error log (Phase 1: crash visibility).
   Koi data bahar nahi bhejta. Sirf localStorage me last 40 errors (message + file:line + time) rakhta hai.
   Settings -> Theme & App Health me dekh/copy/clear kar sakte hain. Crashlytics ke liye google-services.json chahiye (docs/PRO-ROADMAP.md). */
(function(){
  'use strict';
  var KEY='bsp_errlog',MAX=40;
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch(e){return []}}
  function write(a){try{localStorage.setItem(KEY,JSON.stringify(a.slice(-MAX)))}catch(e){}}
  function clip(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n)+'…':s}
  function add(kind,msg,where){
    var a=read(),last=a[a.length-1],m=clip(msg,300);
    if(last&&last.m===m&&last.k===kind){last.n=(last.n||1)+1;last.t=Date.now()}
    else a.push({t:Date.now(),k:kind,m:m,w:clip(where,160),n:1});
    write(a);
  }
  window.addEventListener('error',function(e){add('error',e.message||'Script error',(e.filename||'')+':'+(e.lineno||0))});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;add('promise',(r&&r.message)||r||'Unhandled rejection',(r&&r.stack||'').split('\n')[1]||'')});
  window.ErrLog={
    list:read,
    clear:function(){try{localStorage.removeItem(KEY)}catch(e){}},
    text:function(){return read().map(function(x){return new Date(x.t).toISOString()+' ['+x.k+'] '+x.m+(x.w?' @ '+x.w:'')+(x.n>1?' x'+x.n:'')}).join('\n')||'No errors logged'}
  };
})();
