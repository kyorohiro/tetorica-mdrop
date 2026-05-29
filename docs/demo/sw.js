const APP_VERSION = "0.6.3";
const CACHE_PREFIX = "tetorica-mdrop-";
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192x192.png",
  "./icon-512x512.png",
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

//
// 更新ボタンで明示的に切り替えたい場合
//self.addEventListener("install", (event) => {
//  event.waitUntil(
//    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
//  );
//});
//


self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys.map((key) => {
        if (!key.startsWith(CACHE_PREFIX)) return Promise.resolve();
        if (key === CACHE_NAME) return Promise.resolve();
        return caches.delete(key);
      })
    );

    await clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  //const isDemoAsset = url.pathname.includes("/demo/");
  //if (!isDemoAsset) return;

  const isHtmlRequest =
    event.request.mode === "navigate" ||
    event.request.destination === "document";

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response?.ok) {
            const cloned = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(event.request, cloned);
              })
            );
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response?.ok) {
          const cloned = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
              return cache.put(event.request, cloned);
            })
          );
        }
        return response;
      });
    })
  );
});