/**
 * KBH Records — the small worker that lets the app be installed and lets
 * it open when the phone has no signal.
 *
 * What it keeps: the app itself — the page, its code, its fonts and
 * pictures. What it never keeps: anything from Supabase. Money, people
 * and bill photos are always fetched fresh, so nobody is ever shown a
 * balance that was true an hour ago.
 */

const VERSION = 'kbh-v5';
const SHELL = `${VERSION}-shell`;

// The two addresses this worker has to name. The build rewrites them
// when the app is hosted in a folder rather than at the root.
const PAGE = '/kbh-records/index.html';
const ROOT = '/kbh-records/';

// The picture the phone shows beside a notification.
const ICON = '/kbh-records/icons/icon-192.png';

// Enough to open the app with nothing else available.
const CORE = ["/kbh-records/","/kbh-records/index.html","/kbh-records/manifest.json","/kbh-records/favicon.ico"];

// How long to wait for the page before falling back to the kept copy.
const PAGE_WAIT_MS = 3000;

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

  // A page request. The page is a thousand bytes and it names the code
  // it needs by hash, so it must be the live one whenever there is a
  // line: a kept page from before a release points at code that has
  // since been replaced, and the app would open blank. So: ask the
  // network, and fall back to the kept page only when the network does
  // not answer within a few seconds, or at all. The weight of the app -
  // its code and fonts - still comes from the keep either way, which is
  // what makes opening it quick.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await withTimeout(fetch(request), PAGE_WAIT_MS);
          if (response.ok) {
            const copy = response.clone();
            caches
              .open(SHELL)
              .then((cache) => cache.put(PAGE, copy))
              .catch(() => {});
          }
          return response;
        } catch (err) {
          const kept = (await caches.match(PAGE)) ?? (await caches.match(ROOT));
          if (kept) return kept;
          throw err;
        }
      })(),
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

/** A fetch that gives up, so a stalled connection is not a locked door. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * A notification from the office's side of the books.
 *
 * The ticket is already recorded by the time this arrives; this only
 * makes the phone say so. If the message cannot be read for any reason
 * the phone is still told something, because a silent failure here
 * looks exactly like nothing having happened.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {};
  }

  const title = data.title || 'KBH Records';
  const options = {
    body: data.body || 'Something was recorded.',
    icon: ICON,
    badge: ICON,
    // One notification per ticket: a second buzz for the same thing is
    // noise, and a phone left off all morning should not wake up to
    // forty of them.
    tag: data.tag || 'kbh',
    renotify: true,
    data: { entryId: data.entryId || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Tapping it opens the app - on the entry itself when there is one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const entryId = event.notification.data && event.notification.data.entryId;
  const target = entryId ? ROOT + 'entry/' + entryId : ROOT;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Already open somewhere: bring that one forward rather than
      // opening a second copy of the app.
      for (const client of windows) {
        if (client.url.indexOf(ROOT) !== -1 && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
