/* Arcadia – Service Worker: macht die Seite installierbar und offline spielbar.
   Seiten (HTML): erst Netz, bei Offline aus dem Speicher → Updates kommen sofort an.
   Dateien (JS, CSS, Bilder, Schriften): sofort aus dem Speicher, im Hintergrund aktualisiert.
   Die Online-Bestenliste (/api) wird nie gespeichert. */
const CACHE = 'arcadia-v10';
const PAGES = ['/', '/snake/', '/flug/', '/dino/', '/block/', '/solitaire/', '/vier/', '/ttt/', '/fruit/', '/stack/', '/up/', '/rekorde/'];
const FILES = ['/arcadia.js', '/scene.js', '/vendor/three.min.js', '/snake/game.js', '/snake/levels.js', '/snake/style.css',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-64.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all([...PAGES, ...FILES].map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;

  // Seiten: Netz zuerst, damit Updates sofort da sind
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(stripSearch(url), copy)); return res;
    }).catch(() => caches.match(stripSearch(url)).then((r) => r || caches.match(url.pathname.replace(/\/?$/, '/'))).then((r) => r || caches.match('/'))));
    return;
  }
  // Dateien: sofort aus dem Speicher, dann im Hintergrund frisch holen
  // Schlüssel mit ?v=…: eine neue Version ist ein neuer Eintrag und kommt sofort aus dem Netz
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit || c.match(stripSearch(url)));
    return hit || net;
  })));
});
// Adresse ohne ?v=… (für Seiten und als Notlösung offline)
function stripSearch(url) { return url.origin + url.pathname; }
