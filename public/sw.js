// Minimal app-shell service worker (Phase 3 foundation).
// Caches static assets with stale-while-revalidate; NEVER caches Supabase
// API responses or anything under /api — those must always be live per
// architecture §6/§18 (no fake offline database sync).
const CACHE_NAME = 'rajput-shell-v1';
const SHELL_ASSETS = ['/', '/dashboard', '/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls or Supabase requests — always network, always live.
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase')) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
