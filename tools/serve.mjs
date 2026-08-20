// The local server: serves the game, and designs levels with Claude.
//
// Designing a level from prose used to be a fixed grammar in the page, and then
// a model called from the page with the player's own API key. Both are gone.
// The parser could only understand the adjectives it had been taught, and
// nobody is pasting an API key into a game. What is left is the thing that
// actually works: run this on your own machine, and it hands the description to
// the `claude` you already have installed, on the subscription you already pay
// for.
//
// The agent is not asked for a blob of JSON. It is pointed at the authoring
// guide, told where to write, and given the same gate the shipped levels pass,
// so it can check its own work and fix what it got wrong. What lands in
// levels/custom is a level somebody could actually fly.
//
//   node tools/serve.mjs [--port 8000]
//
// Nothing here ships to the web. On GitHub Pages these routes do not exist, the
// game finds no custom levels, and the pre-built ones are all there is.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CUSTOM = join(ROOT, 'levels', 'custom');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj));

/** Filenames come from prose, so they are built rather than trusted. */
const slug = (s) => (String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'untitled').slice(0, 40);

function customLevels() {
  if (!existsSync(CUSTOM)) return [];
  return readdirSync(CUSTOM).filter((f) => f.endsWith('.json')).sort().map((file) => {
    try {
      const raw = JSON.parse(readFileSync(join(CUSTOM, file), 'utf8'));
      return {
        file,
        label: String(raw.name || file.replace(/\.json$/, '')).toUpperCase(),
        blurb: String(raw.blurb || ''),
        spec: raw,
        at: statSync(join(CUSTOM, file)).mtimeMs,
      };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.at - a.at);
}

const GUIDE = `You are designing a level for VECTRENCH, a rails shooter set in a canyon.

Read docs/LEVELS.md first. It documents the whole spec format: every field, its
range, what it does to the level, and the rules the compiler enforces. Read
levels/proving-ground.json and levels/reactor.json to see what a finished,
tuned level looks like.

Write the level as JSON to the path you are given. It must have "name", a short
"blurb" describing it in one or two sentences, "seed", "speed", "finale" and
"sections". Then check it:

    node tools/levels.mjs <the file you wrote>

That prints JSON. If "ok" is false, read "problems", fix the file and run it
again. Keep going until it passes. The usual failures are a level that is too
short (lengthen the sections), bulkheads that did not fit (a section needs 2600
units of length per bulkhead), or a shape too tight to survive a re-roll (widen
it or thin the obstacles).

Design to the description you are given, not to the safest level you can think
of. The description is the brief; the gate is only there to keep it flyable.
When it passes, reply with one short sentence describing what you built.`;

function design(prose, res) {
  mkdirSync(CUSTOM, { recursive: true });
  const started = Date.now();
  const name = slug(prose.split(/[.,\n]/)[0] || 'custom');
  const file = join('levels', 'custom', `${name}-${Date.now().toString(36)}.json`);
  const prompt = `${GUIDE}\n\nWrite the level to: ${file}\n\nThe description to build:\n\n${prose}`;

  const args = ['-p', prompt,
    '--allowedTools', 'Read Grep Glob Write Edit Bash(node tools/levels.mjs:*)',
    '--output-format', 'json'];
  const child = spawn('claude', args, { cwd: ROOT });

  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => sendJson(res, 500, {
    error: e.code === 'ENOENT'
      ? 'the `claude` command was not found -- install Claude Code and sign in, then restart this server'
      : String(e),
  }));
  child.on('close', () => {
    const full = join(ROOT, file);
    if (!existsSync(full)) {
      let why = 'the agent did not write a level';
      try { why = JSON.parse(out).result || why; } catch { /* keep the default */ }
      return sendJson(res, 502, { error: why, stderr: err.slice(-400) });
    }
    // The server checks the file itself rather than taking the agent's word.
    const check = spawn(process.execPath, ['tools/levels.mjs', file], { cwd: ROOT });
    let cout = '';
    check.stdout.on('data', (d) => { cout += d; });
    check.on('close', () => {
      let verdict = null;
      try { verdict = JSON.parse(cout); } catch { /* fall through */ }
      let said = '';
      try { said = JSON.parse(out).result || ''; } catch { /* optional */ }
      const level = customLevels().find((l) => file.endsWith(l.file));
      if (!verdict || !verdict.ok) {
        return sendJson(res, 422, {
          error: 'the level it wrote does not pass the flyability gate',
          problems: verdict ? verdict.problems : ['could not be read'],
          said,
        });
      }
      sendJson(res, 200, {
        ok: true, file, said, check: verdict, level,
        seconds: Math.round((Date.now() - started) / 1000),
      });
    });
  });
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/levels') return sendJson(res, 200, { levels: customLevels() });

  if (url.pathname === '/api/design' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      let prose = '';
      try { prose = String(JSON.parse(body).prose || '').trim(); } catch { /* handled below */ }
      if (prose.length < 8) return sendJson(res, 400, { error: 'describe the level you want, in a sentence or two' });
      design(prose, res);
    });
    return;
  }

  // Static files, and nothing above the repo.
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const path = normalize(join(ROOT, rel));
  if (!path.startsWith(ROOT + sep) && path !== ROOT) return send(res, 403, 'no', 'text/plain');
  try {
    const body = readFileSync(statSync(path).isDirectory() ? join(path, 'index.html') : path);
    send(res, 200, body, TYPES[extname(path)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`VECTRENCH on http://localhost:${PORT}/`);
  console.log('  open that on your phone using this machine\'s address on the network.');
  console.log('  DESIGN A NEW LEVEL runs `claude` here; levels land in levels/custom/.');
});
