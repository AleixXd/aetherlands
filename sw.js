/* Aetherlands — Service Worker: offline + actualización en segundo plano */
const CACHE = "aetherlands-v5";
const FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./css/style.css",
  "./js/lib/three.min.js",
  "./js/lib/GLTFLoader.js",
  "./js/lib/SkeletonUtils.js",
  "./js/utils/BufferGeometryUtils.js",
  "./js/utils/glb.js",
  "./js/core/config.js",
  "./js/core/utils.js",
  "./js/core/data.js",
  "./js/core/input.js",
  "./js/core/sound.js",
  "./js/core/save.js",
  "./js/core/cloud.js",
  "./js/core/settings.js",
  "./js/net.js",
  "./js/postfx.js",
  "./js/world.js",
  "./js/build.js",
  "./js/effects.js",
  "./js/enemies.js",
  "./js/inventory.js",
  "./js/quests.js",
  "./js/caves.js",
  "./js/castle.js",
  "./js/player.js",
  "./js/ui.js",
  "./js/game.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
