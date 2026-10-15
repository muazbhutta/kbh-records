// Copies the built site into .tmp-pages as a gh-pages branch, ready to be
// pushed. Run it after every build, before publishing.
//
//   npm run build:web
//   node scripts/stage-pages.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OUT = '.tmp-pages';

if (!fs.existsSync('dist/index.html')) {
  console.error('No dist. Build it first:  npm run build:web');
  process.exit(1);
}

const git = (...args) =>
  execFileSync('git', ['-C', OUT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync('dist', OUT, { recursive: true });

git('init', '-q');
git('checkout', '-qB', 'gh-pages');
try {
  git('config', 'user.email', execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim());
  git('config', 'user.name', execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim());
} catch {
  git('config', 'user.email', 'noreply@kbh.local');
  git('config', 'user.name', 'KBH Records');
}
git('add', '-A');
git('commit', '-q', '-m', 'Built site for GitHub Pages');

const files = git('ls-files').split('\n').filter(Boolean).length;
console.log(`Staged ${files} files in ${OUT} on branch gh-pages.`);
console.log('Now run:  node scripts/publish-to-github.mjs <your-github-name>');
