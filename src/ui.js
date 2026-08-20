// The front of the game: pick a level, fly it, or describe a new one.
//
// Screens are DOM overlays over the same canvas the game renders into, so the
// menu can show the chosen level as a live vector schematic behind the panel
// rather than as a separate widget.
//
// Designing a level happens on the local server, not here -- the page posts the
// description and gets back a finished level. Served from GitHub Pages there is
// no server to post to, the button says so, and the pre-built levels are all
// there is.

import { decodeSpec, normalizeSpec } from './spec.js';
import { PREBUILT } from './levels.js';
import { drawSchematic } from './hud.js';
import { drawText } from './font.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(rd, input, audio, game) {
    this.rd = rd;
    this.input = input;
    this.audio = audio;
    this.game = game;
    this.screen = 'boot';
    this.spec = null;
    this.busy = false;
    this.dirty = true;
    this.controlHint = '';
    this.bindAll();
    this.loadFromHash();
  }

  // --- screens -----------------------------------------------------------

  show(name) {
    this.screen = name;
    this.dirty = true;
    for (const id of ['boot', 'design', 'flight']) {
      $(id).classList.toggle('on', id === name);
    }
    // Only the flight screen wants the canvas swallowing gestures.
    this.rd.canvas.style.pointerEvents = name === 'flight' ? 'auto' : 'none';
  }

  status(msg) {
    $('statusline').textContent = this.controlHint ? `${msg}  --  ${this.controlHint}` : msg;
  }

  report(lines, cls = '') {
    const el = $('report');
    el.className = cls;
    el.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines);
  }

  // --- wiring ------------------------------------------------------------

  bindAll() {
    this.buttons = [];
    for (const lv of PREBUILT) this.addLevel(lv, $('prebuilt'));

    $('fly').addEventListener('click', () => this.fly());
    $('full').addEventListener('click', () => this.goFullscreen());
    $('designbtn').addEventListener('click', () => this.design());

    for (const ev of ['gamepadconnected', 'gamepaddisconnected']) {
      window.addEventListener(ev, () => setTimeout(() => this.padState(), 60));
    }

    $('begin').addEventListener('click', () => this.begin());
    $('pause').addEventListener('click', () => this.toMenu());

    // The launcher. pointerdown rather than click so it fires on touch-down
    // like every other control in flight, and so holding it does not repeat.
    $('msl').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.launchMissiles();
    });
    // Both of these are held, not tapped: the ship is on edge for exactly as
    // long as ROLL is down, and the burn runs for as long as BURN is down and
    // there is anything left in the tank. They are buttons of their own so that
    // touch-and-hold anywhere else is still nothing but the gun.
    const hold = (id, set) => {
      const el = $(id);
      const go = (on) => (e) => {
        e.preventDefault();
        set(on);
        if (on) el.setPointerCapture?.(e.pointerId);
      };
      el.addEventListener('pointerdown', go(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        el.addEventListener(ev, go(false));
      }
    };
    hold('roll', (on) => {
      this.input.rollHeld = on;
      $('roll').classList.toggle('on', on);
    });
    hold('burn', (on) => { this.input.boostHeld = on; });

    $('calibrate').addEventListener('click', async () => {
      if (this.input.motion !== 'granted') await this.input.requestMotion();
      const ok = this.input.calibrate();
      this.motionState(ok ? 'calibrated -- hold the phone as you just did' : null);
    });
    $('sens').addEventListener('input', (e) => {
      this.input.sensitivity = +e.target.value;
      $('sensval').textContent = (+e.target.value).toFixed(1);
    });
    $('invx').addEventListener('change', (e) => { this.input.invertX = e.target.checked; });
    $('invy').addEventListener('change', (e) => { this.input.invertY = e.target.checked; });
    $('mute').addEventListener('change', (e) => this.audio.setMuted(e.target.checked));
    $('music').addEventListener('change', (e) => this.audio.setMusicEnabled(e.target.checked));
    $('crt').addEventListener('change', (e) => {
      this.rd.scanline = e.target.checked ? 0.08 : 0;
      this.rd.trail = e.target.checked ? 0.34 : 0.9;
    });

    // A tap anywhere on the canvas after a run returns to the menu.
    this.rd.canvas.addEventListener('pointerdown', () => {
      if (this.screen === 'flight' && this.game.phase !== 'flying') {
        const wait = this.game.phase === 'dead' ? this.game.deathTimer : this.game.winTimer;
        if (wait > 1.4) this.toMenu();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.screen === 'flight') this.toMenu();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && this.screen === 'design') this.fly();
    });
  }

  padState() {
    const name = this.input.padName;
    $('padstate').textContent = name
      ? `gamepad: ${name} -- left stick flies, triggers fire, shoulders launch`
      : 'gamepad: none';
  }

  motionState(msg) {
    const m = this.input.motion;
    const text = msg || {
      granted: 'motion: active',
      denied: 'motion: denied -- use two-finger steering',
      unavailable: 'motion: no sensor -- use two-finger steering',
    }[m] || 'motion: unknown';
    $('motionstate').textContent = text;
  }

  /**
   * The launcher button doubles as the cooldown clock, so it is refreshed from
   * the game each frame -- but only written when the text or state actually
   * changed, because a DOM write per frame for a label that changes once a
   * second is a frame cost for nothing.
   */
  syncBurnButton() {
    const g = this.game;
    // The button is the gauge: how much burn is in the tank, and lit while it
    // is actually being spent.
    const text = g.boost <= 0.05 ? 'EMPTY' : `BURN ${g.boost.toFixed(1)}`;
    if (text !== this._burnText) { $('burn').textContent = text; this._burnText = text; }
    const cls = g.burning ? 'on' : g.boost <= 0.05 ? 'cooling' : '';
    if (cls !== this._burnCls) { $('burn').className = cls; this._burnCls = cls; }
  }

  syncMissileButton() {
    const g = this.game;
    if (this.screen !== 'flight' || g.phase !== 'flying') return;
    const ready = g.missileCooldown <= 0;
    const locks = g.locks ? g.locks.length : 0;
    const text = ready
      ? (locks ? `MISSILES ${locks}` : 'MISSILES')
      : `${g.missileCooldown.toFixed(1)}s`;
    const cls = ready ? (locks ? 'armed' : '') : 'cooling';
    if (text !== this._mslText) { $('msl').textContent = text; this._mslText = text; }
    if (cls !== this._mslCls) { $('msl').className = cls; this._mslCls = cls; }
  }

  /** First real gesture: unlock audio and ask for the motion sensor. */
  async begin() {
    this.audio.start();
    $('bootnote').textContent = 'requesting motion access...';
    await this.input.requestMotion();
    this.motionState();
    // Embedded frames and desktops often have no usable tilt sensor. Say so
    // where the player will actually read it, not only inside a details pane.
    if (this.input.motion !== 'granted') {
      this.controlHint = 'no tilt: drag one finger to steer, touch with a second to fire';
    }
    this.show('design');
    this.loadCustom();
    if (!this.spec) {
      // Open on a finished level, so the next tap can be FLY.
      this.buttons[0].click();
    } else {
      this.status(`${this.spec.name} -- ready`);
    }
  }

  /**
   * Fullscreen, and stay the way up the player is already holding the phone.
   *
   * Locking is deliberately whichever orientation they are in when they ask,
   * rather than one the game prefers: it reads fine both ways, and the one
   * thing that does not read fine is the layout turning over mid-flight.
   */
  async goFullscreen() {
    const el = document.getElementById('stage');
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch { /* refused; the lock below may still work */ }
    const type = (screen.orientation && screen.orientation.type)
      || (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary');
    try {
      await screen.orientation?.lock?.(type.startsWith('landscape') ? 'landscape' : 'portrait');
      this.status(`full screen, locked ${type.startsWith('landscape') ? 'landscape' : 'portrait'}`);
    } catch {
      this.status('full screen (this browser will not lock the orientation)');
    }
  }

  loadFromHash() {
    const m = location.hash.match(/lvl=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try {
      this.setSpec(decodeSpec(m[1]), ['loaded from link']);
      $('prose').value = '';
    } catch {
      /* a broken link is not worth an error message on the title screen */
    }
  }

  setSpec(spec, report) {
    this.spec = normalizeSpec(spec);
    this.game.load(this.spec);
    $('fly').disabled = false;
    const lv = this.game.level;
    const counts = [
      `${lv.obstacles.length} obstacles`,
      `${lv.enemies.filter((e) => e.kind === 'turret').length} surface turrets`,
      `${lv.enemies.filter((e) => e.kind === 'wallgun').length} wall guns`,
      `${lv.enemies.filter((e) => e.kind === 'emplacement').length} emplacements`,
      `${lv.drones.reduce((a, d) => a + d.n, 0)} drones`,
      `${lv.seals.length} seals`,
    ].join(', ');
    this.report([...report, '', `REALIZED: ${counts}`], 'ok');
    this.dirty = true;
    this.status(`${this.spec.name} -- ${Math.round(this.game.track.total)} units`);
  }

  /** One button on the shelf. The chosen one stays lit, so the shelf is the state. */
  addLevel(lv, into) {
    const b = document.createElement('button');
    b.className = 'chip built';
    b.textContent = lv.label;
    if (lv.blurb) b.title = lv.blurb;
    b.addEventListener('click', () => {
      for (const o of this.buttons) o.classList.toggle('on', o === b);
      this.setSpec(lv.spec, [lv.label, lv.blurb].filter(Boolean));
    });
    into.appendChild(b);
    this.buttons.push(b);
    return b;
  }

  /**
   * Levels designed on this machine, if there is a machine to ask.
   *
   * The published page has no server behind it, so this 404s there and the
   * shelf is simply the pre-built levels -- which is the intended shape of the
   * thing, not a degraded one.
   */
  async loadCustom(selectNewest = false) {
    let levels = [];
    try {
      const r = await fetch('/api/levels');
      if (!r.ok) throw new Error('no server');
      ({ levels } = await r.json());
      this.local = true;
    } catch {
      this.local = false;
      $('designnote').textContent =
        'Designing a level runs Claude on your own machine. Clone the repo, run '
        + '`node tools/serve.mjs`, and open it from there -- the published page cannot do it.';
      $('designbtn').disabled = true;
      return;
    }
    const row = $('custom');
    row.textContent = '';
    this.buttons = this.buttons.filter((b) => b.parentElement !== row);
    $('customrow').hidden = levels.length === 0;
    let first = null;
    for (const lv of levels) first = this.addLevel(lv, row) || first;
    if (selectNewest && row.firstChild) row.firstChild.click();
  }

  /**
   * Hand the description to the agent and wait. It reads the authoring guide,
   * writes the level, and runs the same flyability gate the shipped levels
   * pass, fixing what it got wrong -- so this takes a minute or two and what
   * comes back is a level, not a draft.
   */
  async design() {
    if (this.busy) return;
    const prose = $('prose').value.trim();
    if (prose.length < 8) {
      this.report('describe the level you want first -- a sentence or two is plenty', 'warn');
      return;
    }
    this.busy = true;
    $('designbtn').disabled = true;
    const started = Date.now();
    const tick = setInterval(() => {
      this.status(`claude is designing it -- ${Math.round((Date.now() - started) / 1000)}s`);
    }, 1000);
    this.report('reading the authoring guide, writing the level, then checking it is flyable.\n'
      + 'this takes a minute or two.', '');
    try {
      const r = await fetch('/api/design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prose }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        this.report([data.error || 'the design failed', ...(data.problems || [])], 'warn');
        this.status('design failed');
        return;
      }
      await this.loadCustom(true);
      this.report([data.said || '', '',
        `${data.check.name}: ${data.check.seconds}s, ${data.check.sections} sections, `
        + `${data.check.obstacles} obstacles, ${data.check.bulkheads} bulkheads, `
        + `${data.check.guns} guns. saved to ${data.file}.`].filter(Boolean), 'ok');
    } catch (err) {
      this.report(`could not reach the design server: ${err.message}`, 'warn');
    } finally {
      clearInterval(tick);
      this.busy = false;
      $('designbtn').disabled = !this.local;
    }
  }

  async fly() {
    if (!this.spec) return;
    this.audio.start();
    // Fullscreen is worth asking for and harmless when refused. Orientation is
    // not asked for at all: the game reads either way up, and pinning it fought
    // whichever way the player was already holding the phone.
    try {
      const el = document.getElementById('stage');
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch { /* browsers may refuse; the game plays fine regardless */ }
    if (this.input.motion === 'granted') this.input.recalibrate();
    this.game.reset();
    this.audio.musicStart();
    this.show('flight');
  }

  toMenu() {
    this.audio.musicStop();
    this.show('design');
    this.status(`${this.spec.name} -- ${this.game.phase === 'won' ? 'cleared' : 'ready'}`);
  }

  /**
   * Drawn on the canvas behind the design panel. The schematic is static, so it
   * is only re-rendered when something actually changed; the boot grid animates
   * and always draws.
   */
  drawBackdrop() {
    const rd = this.rd;
    if (this.screen === 'design' && !this.dirty) return;
    this.dirty = false;
    rd.beginFrame(1);
    if (this.screen === 'design' && this.game.track) {
      drawSchematic(rd, this.game.track, this.game.level, 1, this.freeBand());
    } else if (this.screen === 'boot') {
      this.drawBootGrid();
    }
    rd.endFrame();
  }

  /**
   * The canvas region the design panel is not covering, in device pixels. The
   * schematic fits itself to this so it is never drawn behind the sheet.
   */
  freeBand() {
    const rd = this.rd;
    const r = rd.canvas.getBoundingClientRect();
    const k = rd.height / Math.max(1, r.height);
    const sheet = document.getElementById('sheet').getBoundingClientRect();
    const top = document.getElementById('topbar').getBoundingClientRect();
    const y0 = (top.bottom - r.top) * k + 8 * rd.scale;
    const y1 = (sheet.top - r.top) * k - 6 * rd.scale;
    if (y1 - y0 < 80 * rd.scale) {
      // Panel is too tall to leave a usable band; use the whole canvas and let
      // the sheet sit over it rather than squeezing the plots into nothing.
      return { y0: rd.height * 0.06, y1: rd.height * 0.94 };
    }
    return { y0, y1 };
  }

  /** A slow perspective grid under the title, so the boot screen is not dead. */
  drawBootGrid() {
    const rd = this.rd;
    const W = rd.width, H = rd.height, s = rd.scale;
    const t = performance.now() / 1000;
    // The horizon is placed under the boot copy rather than at a fixed fraction
    // of the height. That copy is DOM: how tall it is depends on font size and
    // where it wraps, and on a narrow screen it reaches well past 0.62 -- which
    // is what put grid lines through the text and the caption through the
    // button. Measure it, the same way the schematic measures the sheet.
    const r = rd.canvas.getBoundingClientRect();
    const k = H / Math.max(1, r.height);
    const note = document.getElementById('bootnote').getBoundingClientRect();
    const horizon = Math.min(H * 0.8,
      Math.max(H * 0.62, (note.bottom - r.top) * k + 30 * s));
    for (let i = 0; i < 22; i++) {
      const k = ((i / 22) + (t * 0.06 % (1 / 22))) % 1;
      const y = horizon + (H - horizon) * k * k;
      const a = (1 - k) * 0.35;
      rd.line2(0, y, W, y, 1 * s, 0.3, 0.7, 0.85, a, a);
    }
    for (let i = -9; i <= 9; i++) {
      const x = W * 0.5 + i * W * 0.075;
      rd.line2(W * 0.5 + i * 8 * s, horizon, x * 1.6 - W * 0.3, H, 1 * s,
        0.3, 0.7, 0.85, 0.05, 0.3);
    }
    drawText(rd, 'VECTOR CANYON SIMULATOR', W * 0.5, horizon - 11 * s, 9 * s, 1.1 * s,
      0.35, 0.6, 0.7, 0.6, 0);
  }
}
