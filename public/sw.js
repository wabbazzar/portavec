// Portavec service worker.
//
// Strategy:
//   - Precache the entry HTML + favicon on install. Hashed asset URLs
//     change every build so they're picked up at runtime instead.
//   - Runtime: stale-while-revalidate for in-scope same-origin GETs
//     (hashed JS/CSS bundles, the pipeline worker, public/ assets).
//   - Runtime: cache-first for Google Fonts (stable URLs).
//   - Navigation offline fallback: serve the cached shell.
//
// Bump VERSION to invalidate old caches on next activation.

const VERSION = 'v1';
const CACHE_STATIC = `portavec-static-${VERSION}`;
const CACHE_RUNTIME = `portavec-runtime-${VERSION}`;

const PRECACHE_URLS = [
    './',
    './index.html',
    './favicon.png',
];

// Scope prefix — SW controls everything at or below its own URL path.
// Use registration.scope path to match in-scope requests precisely.
const SCOPE_PATH = new URL(self.registration ? self.registration.scope : self.location.href).pathname;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_STATIC);
        await Promise.allSettled(PRECACHE_URLS.map(u => cache.add(new Request(u, { cache: 'reload' }))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(n => n !== CACHE_STATIC && n !== CACHE_RUNTIME)
                .map(n => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH)) {
        event.respondWith(staleWhileRevalidate(req));
        return;
    }
    if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(req));
        return;
    }
});

async function staleWhileRevalidate(req) {
    const staticCache = await caches.open(CACHE_STATIC);
    const runtimeCache = await caches.open(CACHE_RUNTIME);
    const cached = (await staticCache.match(req)) || (await runtimeCache.match(req));
    const network = fetch(req)
        .then(res => {
            if (res && res.ok && res.type !== 'opaque') {
                runtimeCache.put(req, res.clone()).catch(() => { });
            }
            return res;
        })
        .catch(() => null);
    const res = cached || (await network);
    if (res) return res;
    if (req.mode === 'navigate') {
        const shell = await staticCache.match('./');
        if (shell) return shell;
    }
    return Response.error();
}

async function cacheFirst(req) {
    const cache = await caches.open(CACHE_RUNTIME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => { });
        return res;
    } catch {
        return cached || Response.error();
    }
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
