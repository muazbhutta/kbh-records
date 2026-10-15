// Puts KBH Records on GitHub and switches on GitHub Pages, so the app
// has an https address that a phone will install from.
//
//   node scripts/publish-to-github.mjs MananBhutta
//
// It needs the GitHub CLI signed in as the account you want to publish
// under:
//
//   gh auth login            (choose that account)
//   gh auth status           (check which one it is)
//
// The repository has to be public: GitHub Pages is only free on a public
// repository. Nothing secret goes into it - .env is ignored, and the key
// that does ship is the publishable one every web app carries.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const REPO = 'kbh-records';
const wantedOwner = process.argv[2];

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

const quiet = (cmd, args, opts = {}) => {
  try {
    return { ok: true, out: run(cmd, args, opts) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() };
  }
};

function die(message, hint) {
  console.error(`\n${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

// ------------------------------------------------------------ who are we
const who = quiet('gh', ['api', 'user', '--jq', '.login']);
if (!who.ok) {
  die('GitHub CLI is not signed in.', 'Run:  gh auth login');
}
const owner = who.out;

if (wantedOwner && owner.toLowerCase() !== wantedOwner.toLowerCase()) {
  die(
    `Signed in as "${owner}", but you asked for "${wantedOwner}".`,
    `Switch accounts first:  gh auth login\nOr run without the name to publish as ${owner}.`,
  );
}
console.log(`Publishing as ${owner}`);

// --------------------------------------------------------- the built site
if (!fs.existsSync('dist/index.html')) die('No dist. Build it first:  npm run build:web');
if (!fs.existsSync('dist/.nojekyll')) die('dist looks unfinished. Run:  npm run build:web');

// The built index.html says which folder it expects to be served from.
const html = fs.readFileSync('dist/index.html', 'utf8');
const base = (html.match(/<script src="([^"]*)\/_expo\//) ?? ['', ''])[1];
if (base.replace(/\//g, '') !== REPO) {
  die(
    `This build is made for "${base || '/'}" but Pages will serve it from "/${REPO}".`,
    'Build the right one first:  npm run build:pages',
  );
}

// ------------------------------------------------------------- the repo
const exists = quiet('gh', ['repo', 'view', `${owner}/${REPO}`, '--json', 'name']);
if (exists.ok) {
  console.log(`Repository ${owner}/${REPO} is already there.`);
} else {
  console.log(`Creating ${owner}/${REPO} (public)...`);
  const made = quiet('gh', [
    'repo', 'create', `${owner}/${REPO}`,
    '--public',
    '--description', 'KBH Records - the cash book for KBH Construction, Jeddah.',
  ]);
  if (!made.ok) die('Could not create the repository.', made.out);
}

const url = `https://github.com/${owner}/${REPO}.git`;

// --------------------------------------------------------------- push it
console.log('Pushing the source to main...');
quiet('git', ['remote', 'remove', 'origin']);
run('git', ['remote', 'add', 'origin', url]);
const pushedMain = quiet('git', ['push', '-u', 'origin', 'main', '--force']);
if (!pushedMain.ok) die('Could not push main.', pushedMain.out);

console.log('Pushing the built site to gh-pages...');
if (!fs.existsSync('.tmp-pages/.git')) {
  die('The built-site folder is missing.', 'Run:  node scripts/stage-pages.mjs');
}
quiet('git', ['-C', '.tmp-pages', 'remote', 'remove', 'origin']);
run('git', ['-C', '.tmp-pages', 'remote', 'add', 'origin', url]);
const pushedPages = quiet('git', ['-C', '.tmp-pages', 'push', '-u', 'origin', 'gh-pages', '--force']);
if (!pushedPages.ok) die('Could not push gh-pages.', pushedPages.out);

// ------------------------------------------------------------ switch on
console.log('Switching on GitHub Pages...');
const body = JSON.stringify({ source: { branch: 'gh-pages', path: '/' } });
let pages = quiet('gh', [
  'api', '--method', 'POST', `repos/${owner}/${REPO}/pages`,
  '-H', 'Accept: application/vnd.github+json',
  '--input', '-',
], { input: body });

if (!pages.ok && /already exists/i.test(pages.out)) {
  pages = quiet('gh', [
    'api', '--method', 'PUT', `repos/${owner}/${REPO}/pages`,
    '-H', 'Accept: application/vnd.github+json',
    '--input', '-',
  ], { input: body });
}
if (!pages.ok) {
  console.error('\nCould not switch Pages on automatically:');
  console.error(pages.out);
  console.error(`Do it by hand: https://github.com/${owner}/${REPO}/settings/pages`);
  console.error('  Source: Deploy from a branch -> gh-pages -> / (root)');
}

const live = `https://${owner.toLowerCase()}.github.io/${REPO}/`;
console.log(`
Done. The first build takes a minute or two.

  Site      ${live}
  Repo      https://github.com/${owner}/${REPO}

On the phone, open that address and then:
  iPhone, Safari   Share -> Add to Home Screen
  Android, Chrome  menu  -> Install app
  Desktop Chrome   the install icon in the address bar
`);
