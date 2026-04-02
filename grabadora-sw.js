/* ══════════════════════════════════════════════
   Fiscalito Grabadora — Service Worker v1
   Permite uso offline + cache de assets
   ══════════════════════════════════════════════ */

const CACHE_NAME = 'fiscalito-grabadora-v1';
const ASSETS = [
  '/grabadora.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Install: cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't cache Supabase API calls or POST requests
  if (event.request.method !== 'GET' ||
      url.hostname.includes('supabase.co') ||
      url.hostname.includes('netlify')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        // Update cache with fresh response
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // Fallback to cache if offline

      return cached || fetchPromise;
    })
  );
});

// Background sync (when supported)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-recordings') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
      })
    );
  }
});
