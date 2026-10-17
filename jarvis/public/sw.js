// Jarvis voor DeMIX: service worker. Bewaart de app-bestanden zodat Jarvis snel start; data komt altijd vers van de server.
const CACHE = 'jarvis-v1';
const BESTANDEN = ['/', '/index.html', '/style.css', '/app.js', '/util.js', '/data.js', '/kern.js', '/store-demo.js', '/store-supabase.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BESTANDEN)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const isPagina = e.request.mode === 'navigate';
  // Netwerk eerst, cache als je offline bent
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && !isPagina) { const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie)); }
    return r;
  }).catch(() => caches.match(isPagina ? '/index.html' : e.request).then(r => r || Response.error())));
});
