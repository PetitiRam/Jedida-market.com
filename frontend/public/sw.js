// Registered from index.html. Kept intentionally minimal: this does NOT
// cache API responses or attempt to serve the app shell offline (the site
// has live marketplace/wallet data — stale cached HTML would be actively
// wrong). Its job is narrower and load-bearing for two things:
//   1. Chrome/Edge/Android require an active service worker with a fetch
//      handler before they'll offer "Install app" / add-to-home-screen at all.
//   2. When a navigation request fails outright (no connectivity), show the
//      branded offline page instead of the browser's default dinosaur/error
//      page, and get the user back on the live site the moment they're back.

const CACHE_NAME = 'jedida-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
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
  if (event.request.mode !== 'navigate') return; // only guard page navigations

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL)
    )
  );
});
