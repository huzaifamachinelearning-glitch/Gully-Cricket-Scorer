const CACHE_NAME = 'gullyscore-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/icon.svg',
  './manifest.json',
  './js/cloud/config.js',
  './js/cloud/sync.js',
  './js/state/state.js',
  './js/features/sound.js',
  './js/screens/roster-setup.js',
  './js/screens/opening-selection.js',
  './js/engine/scoring-engine.js',
  './js/engine/over-transition.js',
  './js/features/player-management.js',
  './js/ui/render.js',
  './js/ui/main.js'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise = fetch(e.request).then(res=>{
        if(res && res.ok && e.request.url.startsWith(self.location.origin)){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(()=> cached);
      return cached || fetchPromise;
    })
  );
});