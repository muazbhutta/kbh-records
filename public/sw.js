/**
 * KBH Records — the small worker that lets the app be installed and lets
 * it open when the phone has no signal.
 *
 * What it keeps: the app itself — the page, its code, its fonts and
 * pictures. What it never keeps: anything from Supabase. Money, people
 * and bill photos are always fetched fresh, so nobody is ever shown a
 * balance that was true an hour ago.
 */

const VERSION = 'kbh-v1';
const SHELL = `${VERSION}-shell`;

// Enough to open the app with nothing else available.
const CORE = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never come between the app and its database.
  if (url.origin !== self.location.origin) return;

  // A page request: try the network, fall back to the one page this app
  // is made of, so every address still opens with no signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit ?? caches.match('/')),
        ),
    );
    return;
  }

  // Code, fonts and pictures: serve what is kept, and quietly keep
  // whatever is new. Their names carry a hash, so they never go stale.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        }),
    ),
  );
});
