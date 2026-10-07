const VERSION='20261007-4',CORE='dafeiyu-core-'+VERSION,ASSETS='dafeiyu-assets-'+VERSION;
const SHELL=['./','index.html','style.css','app.js','physics.mjs','gesture.mjs','manifest.webmanifest','credits.txt','assets/animations.json','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dafeiyu-')&&key!==CORE&&key!==ASSETS).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||await caches.match(new URL('./',self.location).href)));return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(async response=>{
    if(response.ok){try{const cache=await caches.open(url.pathname.includes('/assets/')?ASSETS:CORE);await cache.put(event.request,response.clone());}catch{}}return response;
  })));
});
