const VERSION = '2026-08-27-logos-v2';
const STATIC_CACHE = `botora-static-${VERSION}`;
const RUNTIME_CACHE = `botora-runtime-${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (key.startsWith('botora-') || key.startsWith('sanrobot-')) && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const isAppNavigation = (request) => request.mode === 'navigate' || request.destination === 'document';
const isExcludedRequest = (url, request) => (
  request.method !== 'GET'
  || url.port === '3001'
  || url.pathname.startsWith('/api/')
  || url.pathname.startsWith('/socket.io/')
  || !url.protocol.startsWith('http')
);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isExcludedRequest(url, request)) return;

  if (isAppNavigation(request)) {
    // Always try to obtain the newest application shell after a deployment.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/index.html'))
    );
    return;
  }

  // Static assets: return cached content quickly while refreshing it in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && response.type !== 'opaque') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});
