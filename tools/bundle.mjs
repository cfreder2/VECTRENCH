// Bundles the game into one self-contained HTML file.
//
// There is no build step in normal development -- the game runs from source as
// ES modules -- so this exists only to produce a single file that can be opened
// from anywhere, including a host that serves one page and nothing else.
//
// It is a concatenator, not a real bundler: modules are emitted in dependency
// order into one scope with imports and exports stripped. That works because the
// module graph is small and acyclic, and it is checked rather than assumed --
// any top-level name declared in two modules aborts the build unless it has an
// explicit rename here.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const DIST = join(here, '..', 'dist');

// Dependency order. One entry is load-order-sensitive rather than merely tidy:
// game.js reads CANYON from terrain.js at definition time, and top-level const
// is not hoisted, so terrain.js must already be evaluated.
const ORDER = [
  'math.js', 'collide.js', 'font.js', 'renderer.js',
  'spec.js', 'levels.js',
  'track.js', 'level.js', 'terrain.js', 'entities.js',
  'hud.js', 'music.js', 'audio.js', 'input.js',
  'game.js', 'ui.js', 'main.js',
];

// The one genuine collision: a glyph table and a grid step both called G.
const RENAMES = {
  'font.js': { G: 'GLYPHS' },
  'track.js': { G: 'GRID' },
};

const stripImports = (s) =>
  s.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;/gm, '');

const stripExports = (s) =>
  s.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:class|function|const|let|var)\b)/gm, '');

const declaredNames = (s) => {
  const out = new Set();
  const re = /^(?:export\s+)?(?:const|let|var|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return out;
};

const seen = new Map();
const parts = [];

for (const name of ORDER) {
  let code = stripImports(readFileSync(join(SRC, name), 'utf8'));

  for (const [from, to] of Object.entries(RENAMES[name] ?? {})) {
    code = code.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }

  for (const decl of declaredNames(code)) {
    if (seen.has(decl)) {
      console.error(`collision: ${decl} declared in both ${seen.get(decl)} and ${name}`);
      console.error('Add a rename to RENAMES in tools/bundle.mjs, then rebuild.');
      process.exit(1);
    }
    seen.set(decl, name);
  }

  parts.push(`// ---- ${name} ${'-'.repeat(Math.max(0, 62 - name.length))}\n${stripExports(code).trim()}`);
}

const script = parts.join('\n\n');
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

if (!html.includes('<script type="module" src="./src/main.js"></script>')) {
  console.error('index.html no longer has the expected module tag; bundler needs updating.');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

// 1. Standalone: a complete document, openable straight from disk.
//
// The replacement must go through a function. The bundled code contains the
// two-character sequence dollar-backtick (inside a RegExp template literal),
// and a string replacement treats that as "everything before the match" -- which
// silently splices the document head into the middle of a function body and
// yields a 170 KB file that looks fine and does not parse.
const TAG = '<script type="module" src="./src/main.js"></script>';
const standalone = html.replace(TAG, () => `<script type="module">\n${script}\n</script>`);
writeFileSync(join(DIST, 'vectrench.html'), standalone);

// 2. Fragment: title, styles, body content and script only, for a host that
//    supplies its own document shell.
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, '')
  .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
  .trim();
const fragment = `<title>${title}</title>\n${style}\n${body}\n<script type="module">\n${script}\n</script>\n`;
writeFileSync(join(DIST, 'artifact.html'), fragment);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`bundled ${ORDER.length} modules, ${seen.size} top-level names`);
console.log(`  dist/vectrench.html  ${kb(standalone)}`);
console.log(`  dist/artifact.html   ${kb(fragment)}`);
