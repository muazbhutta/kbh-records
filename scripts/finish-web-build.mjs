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

// The worker names three addresses, and only in these three places, so
// that hosting the app in a folder is a matter of rewriting three lines
// rather than hunting for quoted paths through the code.
let sw = fs.readFileSync(`${DIST}/sw.js`, 'utf8');
const rewrites = [
  [
    "const CORE = ['/', '/index.html', '/manifest.json', '/favicon.ico'];",
    `const CORE = ${JSON.stringify([at('/'), at('/index.html'), at('/manifest.json'), at('/favicon.ico')])};`,
  ],
  ["const PAGE = '/index.html';", `const PAGE = '${at('/index.html')}';`],
  ["const ROOT = '/';", `const ROOT = '${at('/')}';`],
];
for (const [from, to] of rewrites) {
  if (!sw.includes(from)) {
    throw new Error(
      `sw.js no longer contains the line this build rewrites:\n  ${from}\n` +
        'Put it back, or teach scripts/finish-web-build.mjs the new wording. ' +
        'Leaving it unrewritten would serve the app the wrong paths.',
    );
  }
  sw = sw.replace(from, to);
}
fs.writeFileSync(`${DIST}/sw.js`, sw);

// ------------------------------------------------- the icons in the font
// The Ionicons file this app ships is cut down to the symbols it uses, so
// an icon named in the code but missing from that list draws nothing at
// all - a blank square, on a screen nobody looked at twice. It happened
// once, to the Projects screen, and it is invisible until somebody opens
// the page. So the build counts them.
//
// Run `npm run fonts` after naming a new icon.
const USED = 'assets/fonts/icons-used.json';
if (fs.existsSync(USED)) {
  const inFont = new Set(JSON.parse(fs.readFileSync(USED, 'utf8')));
  const glyphs = JSON.parse(
    fs.readFileSync(
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
      'utf8',
    ),
  );

  // Every quoted string in the code that is an Ionicons name. Reading
  // only what follows `name=` misses an icon chosen inside an
  // expression - name={edit ? 'a' : 'b'} - and that icon then prints as
  // a blank square. It happened, so this looks everywhere.
  const named = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/['"`]([a-z][a-z0-9-]{2,})['"`]/g)) {
          if (glyphs[m[1]] !== undefined) named.add(m[1]);
        }
      }
    }
  };
  walk('src');
  walk('app');

  const missing = [...named].filter((n) => !inFont.has(n)).sort();
  if (missing.length > 0) {
    throw new Error(
      'These icons are used but are not in the font this build ships, so they ' +
        'would draw as blank squares:\n  ' +
        missing.join('\n  ') +
        '\nRun `npm run fonts` and build again.',
    );
  }
}

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
            // updateViaCache 'none' so the worker file itself is always
            // asked of the network. Left to the ordinary cache it can be
            // ten minutes stale, and on a phone where the app is never
            // really closed it can be stale far longer than that: the
            // laptop had the new version and the phone had last week's.
            .register('${at('/sw.js')}', { scope: '${at('/')}', updateViaCache: 'none' })
            .then(function (reg) {
              // Ask again whenever the app is brought back up, which on a
              // phone is the only moment it reliably gets a chance.
              var ask = function () {
                if (document.visibilityState === 'visible') reg.update();
              };
              document.addEventListener('visibilitychange', ask);
              window.addEventListener('focus', ask);
              setInterval(ask, 60 * 60 * 1000);
            })
            .catch(function () {});

          // A new worker has taken over, so the page is running the old
          // code against the new. Reload once - the guard is there so a
          // reload cannot start another.
          var reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          });
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
