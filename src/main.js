// Bootstrap: build the pieces, size the canvas, run the loop.

import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { drawText } from './font.js';

const canvas = document.getElementById('c');

function fail(msg) {
  document.body.innerHTML =
    `<div style="padding:2em;font-family:monospace;color:#6fe6ff;line-height:1.7">
      <h2 style="letter-spacing:.2em;font-weight:400">VECTRENCH</h2>
      <p>${msg}</p>
      <p style="color:#5b8494">This game needs WebGL. Try a current Chrome, Safari or Firefox.</p>
    </div>`;
}

let rd;
try {
  rd = new Renderer(canvas);
} catch (err) {
  fail(err.message);
  throw err;
}

const input = new Input(canvas);
const audio = new Audio();
const game = new Game(rd, input, audio);
const ui = new UI(rd, input, audio, game);

let cssW = 0;
let cssH = 0;

function resize() {
  const r = canvas.getBoundingClientRect();
  cssW = Math.max(1, r.width);
  cssH = Math.max(1, r.height);
  // Cap total pixels rather than devicePixelRatio: what costs frames is the
  // fragment count, and phones vary wildly in ratio for the same screen size.
  rd.resize(cssW, cssH, 2_100_000);
  if (ui) ui.dirty = true;
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
let fps = 60;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000) || 0.016;
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  input.update(dt, cssW, cssH);

  if (ui.screen === 'flight' && game.track) {
    game.update(dt, cssW, cssH);
    game.draw();
    ui.syncMissileButton();
    ui.syncBurnButton();
    ui.syncSpecButton();
  } else {
    ui.drawBackdrop();
  }

  if (window.__vectrenchDebug) {
    drawText(rd, `${fps.toFixed(0)} FPS  ${rd.segCount} SEG`,
      rd.width - 10, rd.height - 8, 9 * rd.scale, 1 * rd.scale, 0.4, 1, 0.6, 0.8, 1);
    rd.flush();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Exposed for the smoke test and for anyone poking at it in a console.
window.__vectrench = { rd, input, audio, game, ui };
