// Offline support. Serves from cache instantly, then refreshes the cache in the
// background, so a new deploy shows up on the next launch.
// Bump VERSION when you add/rename files.
const VERSION = 'zit-v40';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/pimple.js',
  'js/fx.js',
  'js/ear.js',
  'js/steps.js',
  'js/supplies.js',
  'js/tools.js',
  'js/faces.js',
  'js/facescene.js',
  'js/salon.js',
  'js/extras.js',
  'js/hairsalon.js',
  'js/levels.js',
  'js/skin.js',
  'js/audio.js',
  'js/haptics.js',
  'js/storage.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
