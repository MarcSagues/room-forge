// RoomForge service worker (P8-05). The template of `out/sw.js`: write-service-worker.mjs puts the
// precache manifest of the build in front of it, so every build with different files is a different
// worker, which the browser installs next to the old one and the page offers to switch to.
//
// - Precache (install): the HTML of each page and every file of `/_next/static/`, all of this build.
// - Navigations: network first; offline, the precached page of the same path (query ignored).
// - Other precached files (`/_next/static/*`, whose names carry a hash, `/theme-init.js`): cache
//   first, from this build's precache.
// - `/assets/*` (catalog models, thumbnails): cache first, kept in a cache capped by size.
// - Anything else (RSC payloads, other origins) is left to the browser.
//
// A new worker waits until the page asks it to take over (`SKIP_WAITING`), after the person chose to
// reload; it never takes over a tab on its own. Kill switch: see DEPLOYMENT §9.

/** @type {{ version: string, urls: string[] }} */
const MANIFEST = self.__RF_PRECACHE__;
const PRECACHE = `roomforge-precache-${MANIFEST.version}`;
const PRECACHED = new Set(MANIFEST.urls);
const ASSETS = 'roomforge-assets-v1';
/** Bytes of catalog assets kept offline; the oldest go first past it. */
const ASSET_CACHE_BYTES = 50 * 1024 * 1024;
const SIZE_HEADER = 'x-roomforge-size';

/** A response the Cache API and a navigation can both take: redirects followed and forgotten. */
async function storable(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function precache() {
  const cache = await caches.open(PRECACHE);
  await Promise.all(
    MANIFEST.urls.map(async (url) => {
      // `reload`: the HTTP cache may still hold the previous build's pages.
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(`precache: ${url} answered ${response.status}`);
      await cache.put(url, await storable(response));
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('roomforge-precache-') && key !== PRECACHE) await caches.delete(key);
      }
      // The first worker controls the open tab at once, so it works offline without a reload.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage(MANIFEST.version);
});

/** `/editor` → `/editor/`: the export has trailing slashes, the cache keys too. */
function pageKey(pathname) {
  if (pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname)) return pathname;
  return `${pathname}/`;
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(PRECACHE);
    const key = pageKey(new URL(request.url).pathname);
    const page =
      (await cache.match(key, { ignoreSearch: true })) ?? (await cache.match('/404.html'));
    if (page) return page;
    throw error;
  }
}

async function staticFile(request, pathname) {
  const cached = await (await caches.open(PRECACHE)).match(pathname);
  return cached ?? fetch(request);
}

/** Drops the oldest assets until the cache is within its size (keys come in insertion order). */
async function trimAssets(cache) {
  const keys = await cache.keys();
  const sizes = await Promise.all(
    keys.map(async (key) => Number((await cache.match(key))?.headers.get(SIZE_HEADER) ?? 0)),
  );
  let total = sizes.reduce((sum, size) => sum + size, 0);
  for (let i = 0; i < keys.length && total > ASSET_CACHE_BYTES; i += 1) {
    await cache.delete(keys[i]);
    total -= sizes[i];
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status !== 200) return response;
  const body = await response.clone().blob();
  if (body.size <= ASSET_CACHE_BYTES) {
    const headers = new Headers(response.headers);
    headers.set(SIZE_HEADER, String(body.size));
    await cache.put(request, new Response(body, { status: 200, headers }));
    await trimAssets(cache);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (PRECACHED.has(url.pathname)) event.respondWith(staticFile(request, url.pathname));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
});
