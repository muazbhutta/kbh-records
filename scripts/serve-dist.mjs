// Serves the built web app (dist/) to the whole local network, so a phone
// on the same Wi-Fi can open it.
//
//   npx expo export --platform web      # build first
//   node scripts/serve-dist.mjs         # then serve
//
// It prints the address to type into the phone. Nothing is uploaded
// anywhere: the files stay on this computer and the phone fetches them
// over the Wi-Fi, so this only works while this computer is awake and on
// the same network.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 5050);

// The build is made for the folder it will be hosted in, so serve it from
// that same folder here; otherwise nothing it asks for is where it looks.
const BASE = (JSON.parse(fs.readFileSync('app.json', 'utf8')).expo?.experiments?.baseUrl ?? '')
  .replace(/\/$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error('No dist folder. Build it first:  npx expo export --platform web');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (BASE) {
    if (url === BASE || url === '/' || url === '') {
      res.writeHead(302, { Location: `${BASE}/` }).end();
      return;
    }
    if (!url.startsWith(`${BASE}/`)) {
      res.writeHead(404).end('Not here. The app lives at ' + BASE + '/');
      return;
    }
    url = url.slice(BASE.length) || '/';
  }

  let file = path.join(ROOT, url);

  // Keep the request inside dist, whatever it asks for.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('No');
    return;
  }

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  // Every address the app invents belongs to the same single page.
  if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html');

  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const addresses = Object.entries(nets)
    .flatMap(([name, list]) => (list ?? []).map((n) => ({ name, ...n })))
    .filter((n) => n.family === 'IPv4' && !n.internal);

  console.log('\nKBH Records is being served from this computer.\n');
  console.log(`  On this computer:  http://localhost:${PORT}${BASE}/`);
  for (const a of addresses) {
    console.log(`  On the Wi-Fi:      http://${a.address}:${PORT}${BASE}/   (${a.name})`);
  }
  console.log('\nOpen the Wi-Fi address on the phone. Stop with Ctrl+C.\n');
});
