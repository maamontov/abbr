const VERSION = 'znat-dev-v1';
// Multiple project sites can share a GitHub Pages origin; isolate their caches.
const PREFIX = `znat:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./game.js",
  "./data/abbreviations.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener('install', event => {
  // The previous version keeps working if even one new asset fails to download.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Wait for the normal SW lifecycle: never replace code in a running game.
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Only known app files are cached; arbitrary navigations cannot grow storage.
    const response = await cache.match(event.request, { ignoreSearch: true });
    if (response) return response;
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch { return (await cache.match('./index.html')) || Response.error(); }
    }
    return fetch(event.request);
  })());
});
