// Builds the site for GitHub Pages, which serves a project from a folder
// rather than the root of the address, and stages it ready to push.
//
//   npm run build:pages
//
// For the ordinary build - the one the Wi-Fi link serves - use
// `npm run build:web`, which has no folder in front of it.
import { execFileSync } from 'node:child_process';

const REPO = process.env.KBH_REPO ?? 'kbh-records';
const base = `/${REPO}`;

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });

console.log(`Building for a site hosted at ${base}/\n`);
run('npx', ['expo', 'export', '--platform', 'web'], { KBH_BASE_URL: base });
run('node', ['scripts/finish-web-build.mjs'], { KBH_BASE_URL: base });
run('node', ['scripts/stage-pages.mjs']);
