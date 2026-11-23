// Service worker Studio Pas Foto — cache-first agar jalan tanpa internet
const SHELL = 'pasfoto-shell-v1';
const ENGINE = 'pasfoto-engine-v1'; // model AI (±65 MB) disimpan terpisah, tidak dihapus saat update
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'engine/bgr.mjs', 'engine/worker.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('pasfoto-') && k !== SHELL && k !== ENGINE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isEngine = req.url.includes('/engine/data/');
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) {
      // perbarui file aplikasi di belakang layar saat online
      if (!isEngine) fetch(req).then((r) => r.ok && caches.open(SHELL).then((c) => c.put(req, r))).catch(() => {});
      return hit;
    }
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(isEngine ? ENGINE : SHELL); c.put(req, r.clone()); }
      return r;
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
