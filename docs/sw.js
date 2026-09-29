// Service Worker der Web-App: macht SNOWDOWN installierbar und nach dem ersten Besuch
// auch offline spielbar (Solo gegen Bots). Immer zuerst das Netz (neue Versionen sofort),
// der Zwischenspeicher nur, wenn keine Verbindung da ist. Server-API und fremde Seiten
// (Online-Server, Leuchtfeuer) laufen unverändert am Service Worker vorbei.
const CACHE = 'snowdown-v1';
const CORE = ['./', 'index.html', 'style.css', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('snowdown-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // Three.js und Schriften ändern sich nie: aus dem Speicher, sonst laden
  const immutable = url.pathname.includes('/vendor/') || url.pathname.includes('/fonts/');
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (immutable) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? 'index.html' : req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      throw err;
    }
  })());
});
