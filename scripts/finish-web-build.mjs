// Turns the plain web export into something a person installs on a phone
// or a desktop, and makes it survive on GitHub Pages.
//
// Expo's single-page export writes its own index.html, so the manifest
// and the Apple tags go in afterwards. `npm run build:web` runs this
// straight after the export.
import fs from 'node:fs';

const DIST = 'dist';
const FILE = `${DIST}/index.html`;

if (!fs.existsSync(FILE)) {
  console.error('No dist/index.html. Run: npx expo export --platform web');
  process.exit(1);
}

// Where the site will live. "" means the root of a domain; "/kbh-records"
// means a folder under one, which is how GitHub Pages serves a project.
const BASE = (process.env.KBH_BASE_URL ?? '').replace(/\/$/, '');
const at = (p) => `${BASE}${p}`;

// ------------------------------------------------- the manifest and worker
// Both ship from public/ with root paths; they have to agree with the
// folder the site actually sits in.
const manifest = JSON.parse(fs.readFileSync(`${DIST}/manifest.json`, 'utf8'));
manifest.id = at('/');
manifest.start_url = at('/');
manifest.scope = at('/');
manifest.icons = manifest.icons.map((i) => ({ ...i, src: at(i.src) }));
manifest.shortcuts = (manifest.shortcuts ?? []).map((s) => ({
  ...s,
  url: at(s.url),
  icons: (s.icons ?? []).map((i) => ({ ...i, src: at(i.src) })),
}));
fs.writeFileSync(`${DIST}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

let sw = fs.readFileSync(`${DIST}/sw.js`, 'utf8');
sw = sw.replace(
  "const CORE = ['/', '/index.html', '/manifest.json', '/favicon.ico'];",
  `const CORE = ${JSON.stringify([at('/'), at('/index.html'), at('/manifest.json'), at('/favicon.ico')])};`,
);
sw = sw.replace(/caches\.match\('\/index\.html'\)/g, `caches.match('${at('/index.html')}')`);
sw = sw.replace(/cache\.put\('\/index\.html', copy\)/g, `cache.put('${at('/index.html')}', copy)`);
sw = sw.replace(/caches\.match\('\/'\)/g, `caches.match('${at('/')}')`);
fs.writeFileSync(`${DIST}/sw.js`, sw);

// -------------------------------------------------------------- the head
const HEAD = `
    <meta name="description" content="The cash book for KBH Construction, Jeddah: money given out, what it was spent on, and the bill for every expense." />

    <!-- Installing on Android and on a desktop -->
    <link rel="manifest" href="${at('/manifest.json')}" />
    <meta name="application-name" content="KBH Records" />

    <!-- Installing on an iPhone, which ignores the manifest -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="KBH" />
    <link rel="apple-touch-icon" href="${at('/icons/apple-touch-icon.png')}" />
    <link rel="icon" type="image/png" sizes="192x192" href="${at('/icons/icon-192.png')}" />

    <style>
      /* The app is a tool, not a document: a long press should not offer
         to select and copy half the screen. */
      body { -webkit-tap-highlight-color: transparent; background-color: #F5F7FA; }
    </style>
`;

// A worker needs a secure page - https, or localhost. Over the office
// Wi-Fi on a plain http address the browser refuses it, and the app just
// runs without it.
const SCRIPT = `
    <script>
      if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', function () {
          navigator.serviceWorker
            .register('${at('/sw.js')}', { scope: '${at('/')}' })
            .catch(function () {});
        });
      }
    </script>
`;

let html = fs.readFileSync(FILE, 'utf8');

if (!html.includes('rel="manifest"')) {
  // The phone's notch and home bar: let the app run edge to edge.
  html = html.replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
  );
  html = html.replace('</head>', `${HEAD}  </head>`);
  html = html.replace('</body>', `${SCRIPT}  </body>`);
  fs.writeFileSync(FILE, html);
}

// --------------------------------------------------------- GitHub Pages
// Pages has no rewrite rules, so an address like /reports would be a dead
// end. It does serve 404.html for anything it cannot find, and this app is
// one page that reads the address itself, so a copy of index.html there
// makes every address work.
fs.copyFileSync(FILE, `${DIST}/404.html`);

// Without this, Pages runs Jekyll, which refuses to serve any folder
// whose name starts with an underscore - and all the app's code lives in
// _expo.
fs.writeFileSync(`${DIST}/.nojekyll`, '');

// ------------------------------------------------------------- check it
const missing = [
  'manifest.json', 'sw.js', '404.html', '.nojekyll',
  'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
].filter((f) => !fs.existsSync(`${DIST}/${f}`));

if (missing.length) {
  console.error('MISSING from dist:', missing.join(', '));
  console.error('Icons live in public/ - rebuild them with: npm run icons');
  process.exit(1);
}

console.log(`Finished for base "${BASE || '/'}":`);
console.log('  manifest, apple icons, offline worker, 404 fallback, .nojekyll');
