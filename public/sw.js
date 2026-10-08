// SalesPulse service worker — deliberately minimal. This app is a live
// accountability tool; showing a stale cached task/project list would be
// actively misleading, so API requests are never cached, always going
// straight to the network. The service worker exists mainly to satisfy
// PWA installability (Chrome/Android requires a registered SW with a fetch
// handler) and to keep the app shell (static JS/CSS/icons) available for an
// instant reload if the network blips.

const CACHE_NAME = "salespulse-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API calls — always live, never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for everything else (HTML pages, static assets), with a
  // cache fallback for offline resilience — the shell still loads, even if
  // there's nothing meaningful to show without a network connection.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok && request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
