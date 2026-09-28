/* Mien service worker: makes the app work offline after the first visit.
 * - navigations: network first, cached copy when offline
 * - hashed build assets, MediaPipe WASM and the face model: cache first
 * - everything else same-origin: stale-while-revalidate
 * HEAD requests (used to probe for the self-hosted model) are answered from the cache when possible.
 */
const CACHE = "mien-v1";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg", "./icons/apple-touch-icon.png"];
const MODEL_CDN = "storage.googleapis.com";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === "HEAD" && url.origin === location.origin) {
    event.respondWith(headFromCache(req));
    return;
  }
  if (req.method !== "GET") return;
  if (url.origin !== location.origin) {
    if (url.hostname === MODEL_CDN) event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  const p = url.pathname;
  if (p.includes("/assets/") || p.includes("/mediapipe/") || p.includes("/models/")) event.respondWith(cacheFirst(req));
  else event.respondWith(staleWhileRevalidate(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match("./index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function headFromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  if (hit) return new Response(null, { status: 200, headers: hit.headers });
  try {
    return await fetch(req);
  } catch {
    return new Response(null, { status: 504 });
  }
}
