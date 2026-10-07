const VERSION='20261008-6',CORE='dafeiyu-core-'+VERSION,ASSETS='dafeiyu-assets-20261007-4';
const SHELL=['./','index.html','style.css','app.js','physics.mjs','gesture.mjs','motion.mjs','manifest.webmanifest','credits.txt','assets/animations.json','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png','assets/voice/manifest.json',...['head-01','head-02','head-03','head-04','idle-01','idle-02','idle-03','idle-04','idle-05','idle-06','work-01','work-02','done-01','done-02','attention-01','attention-02'].map(id=>'assets/voice/'+id+'.mp3')];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dafeiyu-')&&key!==CORE&&key!==ASSETS).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(async()=>await caches.match(event.request)||await caches.match(new URL('./',self.location).href)));return;
  }
  const immutable=url.pathname.endsWith('.webp')||url.pathname.includes('/assets/voice/')&&url.pathname.endsWith('.mp3'),cacheName=immutable?ASSETS:CORE;
  // Small voice files are also precached in the new shell; animations keep their existing cache.
  if(immutable&&url.pathname.endsWith('.mp3')){
    event.respondWith(caches.open(CORE).then(cache=>cache.match(event.request)).then(hit=>hit||caches.open(ASSETS).then(cache=>cache.match(event.request))).then(hit=>hit||fetch(event.request)));return;
  }
  event.respondWith(caches.open(cacheName).then(cache=>cache.match(event.request)).then(hit=>hit||fetch(event.request).then(async response=>{
    if(response.ok){try{const cache=await caches.open(cacheName);await cache.put(event.request,response.clone());}catch{}}return response;
  })));
});
