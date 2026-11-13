// Offline support. Serves from cache instantly, then refreshes the cache in the
// background, so a new deploy shows up on the next launch.
// Bump VERSION when you add/rename files.
const VERSION = 'zit-v117';
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
  'js/scalp.js',
  'body/scalp1.jpg',
  'body/scalp2.jpg',
  'body/scalp3.jpg',
  'hair/long.jpg',
  'hair/pony.jpg',
  'hair/bun.jpg',
  'hair/curly.jpg',
  'hair/short.jpg',
  'body/ear1.jpg',
  'body/ear2.jpg',
  'body/ear3.jpg',
  'body/back1.jpg',
  'body/back2.jpg',
  'body/back3.jpg',
  'body/shoulder1.jpg',
  'body/shoulder2.jpg',
  'body/shoulder3.jpg',
  'faces/girl1.jpg',
  'faces/girl1s.jpg',
  'faces/girl2s.jpg',
  'faces/girl3s.jpg',
  'faces/girl4s.jpg',
  'faces/girl5s.jpg',
  'faces/girl6s.jpg',
  'faces/girl7s.jpg',
  'faces/girl8s.jpg',
  'faces/girl9s.jpg',
  'faces/girl10s.jpg',
  'faces/girl11s.jpg',
  'faces/girl12s.jpg',
  'faces/girl13s.jpg',
  'faces/girl1c.jpg',
  'faces/girl2c.jpg',
  'faces/girl3c.jpg',
  'faces/girl4c.jpg',
  'faces/girl5c.jpg',
  'faces/girl6c.jpg',
  'faces/girl7c.jpg',
  'faces/girl8c.jpg',
  'faces/girl9c.jpg',
  'faces/girl10c.jpg',
  'faces/girl11c.jpg',
  'faces/girl12c.jpg',
  'faces/girl13c.jpg',
  'faces/girl2.jpg',
  'faces/girl3.jpg',
  'faces/girl4.jpg',
  'faces/girl5.jpg',
  'faces/girl6.jpg',
  'faces/girl7.jpg',
  'faces/girl8.jpg',
  'faces/girl9.jpg',
  'faces/girl10.jpg',
  'faces/girl11.jpg',
  'faces/girl12.jpg',
  'faces/girl13.jpg',
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
