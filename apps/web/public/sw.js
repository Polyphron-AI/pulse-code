/*
 * Pulse Code service worker.
 *
 * Exists so the app is installable on Android and survives a dropped
 * connection, and deliberately does no more than that: Pulse Code is a live
 * client against a server that owns all state, so the cache holds the app
 * shell and nothing else. Anything that could serve a stale bundle against a
 * newer server is avoided — navigations always try the network first.
 *
 * The version arrives as the `?v=` search param on the script URL (see
 * `serviceWorkerScriptUrl` in ../src/pwa/serviceWorkerSupport.ts). A new app
 * version changes the script URL, which is what makes the browser fetch and
 * install this worker again instead of reusing the byte-identical old one.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "0.0.0";
const SHELL_CACHE = `pulse-code-shell:${VERSION}`;
const ASSET_CACHE = `pulse-code-assets:${VERSION}`;
const CACHE_PREFIX = "pulse-code-";

/** The navigation fallback. Kept under its own key because every route maps to it. */
const SHELL_KEY = "/index.html";

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/apple-touch-icon.png",
  "/favicon-32x32.png",
];

/*
 * Backend paths that must never be intercepted. Mirrors
 * DEV_PROXIED_PATH_PREFIXES in packages/shared/src/devProxy.ts, which a test in
 * ../src/pwa/serviceWorkerSupport.test.ts asserts against so the two cannot
 * drift. A cached `/api` response would hand the UI a stale read model, and
 * `/ws` is the socket the whole app runs on.
 */
const BYPASS_PREFIXES = ["/api", "/oauth", "/.well-known", "/ws"];

function isBypassed(pathname) {
  return BYPASS_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Content-hashed build output. Immutable, so it can be served from cache without revalidating. */
function isImmutableAsset(pathname) {
  return pathname.startsWith("/assets/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, because one missing icon must not fail the install and
      // leave the app without a worker at all.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // Offline during install: the runtime handlers will fill this in.
          }
        }),
      );
      try {
        const response = await fetch("/", { cache: "reload" });
        if (response.ok) await cache.put(SHELL_KEY, response);
      } catch {
        // Same as above — a shell-less worker still beats no worker.
      }
    })(),
  );
  // No skipWaiting here on purpose: the client shows an update prompt and posts
  // SKIP_WAITING when the user accepts, so a reload never happens under them.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_KEY, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * Everything else same-origin: icons, the manifest, wasm. Answer from cache
 * when there is one and refresh in the background, so a repeat launch paints
 * without waiting on the network.
 */
async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const revalidate = (async () => {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })();

  if (!cached) return revalidate;

  // The response is already settled, so keep the refresh alive past it or the
  // browser is free to kill the worker mid-flight.
  event.waitUntil(revalidate.catch(() => {}));
  return cached;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url.pathname)) return;
  // Streams and range requests are not cacheable in any useful way.
  if (request.headers.has("range")) return;
  if ((request.headers.get("accept") || "").includes("text/event-stream")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});
