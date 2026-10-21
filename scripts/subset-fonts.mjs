// Cuts the app's fonts down to the letters it actually shows.
//
//   node scripts/subset-fonts.mjs
//
// The Inter files that ship with @expo-google-fonts carry every script
// Google supports - Cyrillic, Greek, Vietnamese - about 335 KB each, and
// the app downloads four of them before it draws anything. KBH Records
// writes English and Saudi riyal figures, so the rest is weight a phone
// on site pays for and never sees. Arabic and Urdu names are not in Inter
// at all; they already fall through to the system font.
//
// Ionicons is the same story: a 381 KB file holding thousands of symbols,
// of which this app shows a few dozen.
//
// Needs Python with fonttools:  pip install fonttools brotli
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'assets/fonts';
fs.mkdirSync(OUT, { recursive: true });

// Latin letters, digits, the punctuation the app prints, the riyal and
// the few marks the copy uses: the minus in "− SAR 60.00", the arrow in
// the change history, the dot between facts, the en dash in a date range.
const TEXT =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  ' .,:;!?\'"()[]{}+-*/\\|_=<>@#$%^&~`' +
  ' ·–—‘’“”…−→←×÷' +
  '✓✔©®€£¥₹﷼ـ';

const INTER = '100Thin 200ExtraLight 300Light 400Regular 500Medium 600SemiBold 700Bold 800ExtraBold 900Black';

/** The weights the app actually asks for. */
const WANTED = ['400Regular', '500Medium', '600SemiBold', '700Bold'];

const py = (args) =>
  execFileSync('python', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const kb = (f) => Math.round(fs.statSync(f).size / 1024);

console.log('Inter — keeping only the letters this app prints\n');

let before = 0;
let after = 0;

for (const weight of WANTED) {
  const src = `node_modules/@expo-google-fonts/inter/${weight}/Inter_${weight}.ttf`;
  if (!fs.existsSync(src)) {
    console.error(`  missing ${src}`);
    process.exit(1);
  }
  const dest = path.join(OUT, `Inter_${weight}.ttf`);

  py([
    '-m', 'fontTools.subset', src,
    `--text=${TEXT}`,
    '--layout-features=kern,liga,calt,tnum,lnum',
    '--no-hinting',
    '--desubroutinize',
    '--drop-tables+=DSIG',
    `--output-file=${dest}`,
  ]);

  before += kb(src);
  after += kb(dest);
  console.log(`  Inter_${weight.padEnd(12)} ${String(kb(src)).padStart(4)} KB -> ${String(kb(dest)).padStart(3)} KB`);
}

// ------------------------------------------------------------- Ionicons
// Every icon the app names, gathered from the source.
//
// This looks at every quoted string in the code and keeps the ones that
// are Ionicons names. That is blunter than reading the `name=` on each
// icon, and deliberately so: an icon chosen in the middle of an
// expression -
//
//   name={edit ? 'create-outline' : 'add-circle-outline'}
//
// - is invisible to anything that only reads what follows `name=`, and
// the icon then prints as a blank square that nobody notices until they
// open the page. That happened. A handful of extra glyphs costs a few
// hundred bytes; a missing one costs a hole in the screen.
function iconsUsed(glyphMap) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.(tsx?|ts)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/['"`]([a-z][a-z0-9-]{2,})['"`]/g)) {
          if (glyphMap[m[1]] !== undefined) names.add(m[1]);
        }
      }
    }
  };
  walk('src');
  walk('app');
  return names;
}

const glyphMap = JSON.parse(
  fs.readFileSync(
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
    'utf8',
  ),
);

const used = iconsUsed(glyphMap);
const points = [...used].filter((n) => glyphMap[n] !== undefined).map((n) => glyphMap[n]);
console.log(`\nIonicons — ${points.length} of ${Object.keys(glyphMap).length} symbols are used\n`);

const vendorFonts = 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts';
// A previous run leaves the untouched original here; always subset from
// that one, never from a file this script has already cut down.
const originalIonicons = `${vendorFonts}/Ionicons.full.ttf`;
if (!fs.existsSync(originalIonicons)) {
  fs.copyFileSync(`${vendorFonts}/Ionicons.ttf`, originalIonicons);
}
const ioniconsSrc = originalIonicons;
const ioniconsOut = path.join(OUT, 'Ionicons.ttf');

py([
  '-m', 'fontTools.subset', ioniconsSrc,
  `--unicodes=${points.map((c) => `U+${c.toString(16).toUpperCase()}`).join(',')}`,
  '--no-hinting',
  '--drop-tables+=DSIG',
  `--output-file=${ioniconsOut}`,
]);

before += kb(ioniconsSrc);
after += kb(ioniconsOut);
console.log(`  Ionicons${' '.repeat(10)} ${String(kb(ioniconsSrc)).padStart(4)} KB -> ${String(kb(ioniconsOut)).padStart(3)} KB`);

// Keep the list beside the font, so a missing icon is easy to explain.
fs.writeFileSync(
  path.join(OUT, 'icons-used.json'),
  `${JSON.stringify([...used].filter((n) => glyphMap[n] !== undefined).sort(), null, 2)}\n`,
);

// @expo/vector-icons asks for its own copy of Ionicons by name, from deep
// inside node_modules, and offers no way to point it elsewhere. So the
// small file is put where it looks, rather than fighting it.
fs.copyFileSync(ioniconsOut, `${vendorFonts}/Ionicons.ttf`);

console.log(`\n  ${before} KB  ->  ${after} KB   (${Math.round((1 - after / before) * 100)}% less to download)`);
console.log(`\nWritten to ${OUT}/, and into @expo/vector-icons.`);
console.log('An npm install puts the big Ionicons back; run this again after one.');
