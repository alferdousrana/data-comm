/* DataComm Academy service worker.
 * - App shell: precached, cache-first (versioned; bump VERSION on every release).
 * - Course data (data/*.json): stale-while-revalidate in a separate cache that survives app updates.
 * - Navigations: network-first, falling back to the cached index.html, then offline.html.
 * All paths are relative to the service-worker scope, so it works under /repo-name/ on GitHub Pages.
 * User progress is stored in IndexedDB, never in these caches, so updates cannot erase it.
 */
const VERSION = '2026.10.14-2';
const SHELL_CACHE = `dca-shell-${VERSION}`;
const CONTENT_CACHE = 'dca-content-v1';
const FONT_CACHE = 'dca-fonts-v1';

const SHELL = [
  './', './index.html', './offline.html', './manifest.webmanifest',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png',
  './css/tokens.css', './css/base.css', './css/layout.css', './css/components.css', './css/lessons.css',
  './js/app.js', './js/router.js', './js/state.js',
  './js/storage/db.js', './js/storage/repo.js',
  './js/firebase/config.js', './js/firebase/client.js',
  './js/sync/engine.js',
  './js/lessons/content.js',
  './js/quizzes/mcq-engine.js',
  './js/evaluation/rubric-evaluator.js', './js/evaluation/ai-client.js',
  './js/numerics/formulas.js', './js/numerics/generators.js',
  './js/simulators/linecoding.js', './js/simulators/render.js', './js/simulators/widgets.js',
  './js/revision/scheduler.js', './js/gamification/rules.js',
  './js/ui/dom.js', './js/ui/diagrams.js', './js/ui/feedback.js',
  './js/ui/pages/welcome.js', './js/ui/pages/dashboard.js', './js/ui/pages/course.js', './js/ui/pages/lesson.js',
  './js/ui/pages/practice.js', './js/ui/pages/mcq.js', './js/ui/pages/written.js', './js/ui/pages/exam.js',
  './js/ui/pages/results.js', './js/ui/pages/revision.js', './js/ui/pages/achievements.js', './js/ui/pages/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dca-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
  if (event.data?.type === 'precache-shell') caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {});
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(SHELL_CACHE);
        c.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && url.pathname.includes('/data/')) {
    event.respondWith(staleWhileRevalidate(req, CONTENT_CACHE));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Offline and not cached yet: answer with empty CSS so the page silently uses system fonts.
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE, () => new Response('', { status: 200, headers: { 'Content-Type': url.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2' } })));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
        return res;
      } catch {
        return new Response('Offline and not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
  }
  // Other origins (Firebase, Firestore): browser default — never cached here.
});

async function staleWhileRevalidate(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  const res = await net;
  if (!res && fallback) return fallback();
  return res || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
}
