// Service worker: makes CAPAS installable and keeps it opening on a weak signal.
// Your own files: network first (updates arrive right away), cached copy as the fallback.
// Libraries and fonts from CDNs: cached copy first, they never change at a given version.
// Map tiles are left to the browser.

const VERSION = '202611241322';
const CACHE = 'capas-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/theme.css', 'css/style.css', 'css/ar.css',
  'js/theme.js', 'js/data.js', 'js/art.js', 'js/store.js', 'js/media.js', 'js/core.js', 'js/card.js',
  'js/map.js', 'js/ar.js', 'js/thumbs.js', 'js/stage.js', 'js/objects.js', 'js/avatar.js', 'js/wall.js', 'js/collection.js', 'js/create.js', 'js/main.js', 'js/three-layer.js',
  'assets/icon-192.png',
];
const CDNS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
    );
  } else if (CDNS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
  }
});
