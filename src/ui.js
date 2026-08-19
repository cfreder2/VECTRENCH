// The authoring interface: prose in, level out, schematic on screen, then fly.
//
// Screens are DOM overlays over the same canvas the game renders into, so the
// design screen can show the compiled level as a live vector schematic behind
// the panel rather than as a separate widget.

import { parseProse } from './nl.js';
import { EXAMPLES, encodeSpec, decodeSpec, normalizeSpec } from './spec.js';
import { PREBUILT } from './levels.js';
import { getKey, setKey, parseProseLLM } from './llm.js';
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
    // Pre-built levels load their authored spec directly. Going through the
    // parser would re-derive numbers someone already tuned and audited, so the
    // prose box is cleared instead: what you fly is the file, not a reading of
    // a description of the file.
    const pre = $('prebuilt');
    PREBUILT.forEach((lv) => {
      const b = document.createElement('button');
      b.className = 'chip built';
      b.textContent = lv.label;
      if (lv.blurb) b.title = lv.blurb;
      b.addEventListener('click', () => {
        $('prose').value = '';
        this.setSpec(lv.spec, [`pre-built: ${lv.label}`, lv.blurb].filter(Boolean));
      });
      pre.appendChild(b);
    });

    const ex = $('examples');
    EXAMPLES.forEach((e) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = e.label;
      b.addEventListener('click', () => {
        $('prose').value = e.prose;
        this.build();
      });
      ex.appendChild(b);
    });

    $('begin').addEventListener('click', () => this.begin());
    $('build').addEventListener('click', () => this.build());
    $('fly').addEventListener('click', () => this.fly());
    $('reroll').addEventListener('click', () => this.reroll());
    $('fold').addEventListener('click', () => {
      $('sheet').classList.toggle('collapsed');
      $('fold').textContent = $('sheet').classList.contains('collapsed') ? 'EDIT' : 'SCHEMATIC';
      this.dirty = true;
    });
    $('share').addEventListener('click', () => this.share());
    $('pause').addEventListener('click', () => this.toMenu());

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
    $('crt').addEventListener('change', (e) => {
      this.rd.scanline = e.target.checked ? 0.08 : 0;
      this.rd.trail = e.target.checked ? 0.34 : 0.9;
    });

    $('apikey').value = getKey();
    $('apikey').addEventListener('change', (e) => setKey(e.target.value.trim()));
    $('usellm').addEventListener('change', () => this.build());

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

  motionState(msg) {
    const m = this.input.motion;
    const text = msg || {
      granted: 'motion: active',
      denied: 'motion: denied -- use two-finger steering',
      unavailable: 'motion: no sensor -- use two-finger steering',
    }[m] || 'motion: unknown';
    $('motionstate').textContent = text;
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
      this.controlHint = 'no tilt: one finger aims + fires, drag a second to steer';
    }
    this.show('design');
    if (!this.spec) {
      // Open on a finished level so the first tap after this one can be FLY IT.
      this.setSpec(PREBUILT[0].spec, [`pre-built: ${PREBUILT[0].label}`, PREBUILT[0].blurb]);
    } else {
      this.status(`${this.spec.name} -- ready`);
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
    $('reroll').disabled = false;
    $('share').disabled = false;
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

  async build() {
    if (this.busy) return;
    const prose = $('prose').value.trim();
    if (!prose) {
      this.report('write a description first, or pick an example', 'warn');
      return;
    }
    $('err').textContent = '';

    if ($('usellm').checked) {
      const key = $('apikey').value.trim();
      setKey(key);
      if (!key) {
        $('err').textContent = 'Add an API key, or untick USE CLAUDE to use the offline parser.';
        return;
      }
      this.busy = true;
      $('build').disabled = true;
      this.status('asking claude to design it...');
      try {
        const { spec, report } = await parseProseLLM(prose, {
          key,
          onStatus: (s) => this.status(`claude: ${s}...`),
        });
        this.setSpec(spec, report);
      } catch (err) {
        $('err').textContent = err.message;
        this.status('claude failed -- falling back to the offline parser');
        const { spec, report } = parseProse(prose);
        this.setSpec(spec, ['offline parser used instead:', ...report]);
      } finally {
        this.busy = false;
        $('build').disabled = false;
      }
      return;
    }

    const { spec, report } = parseProse(prose);
    this.setSpec(spec, report);
  }

  /** Same shape, different dice: re-rolls placement without touching the spec. */
  reroll() {
    if (!this.spec) return;
    this.spec = normalizeSpec({ ...this.spec, seed: (Math.random() * 1e9) | 0 });
    this.setSpec(this.spec, [`reseeded (${this.spec.seed})`]);
  }

  share() {
    const url = `${location.origin}${location.pathname}#lvl=${encodeSpec(this.spec)}`;
    history.replaceState(null, '', `#lvl=${encodeSpec(this.spec)}`);
    navigator.clipboard?.writeText(url).then(
      () => this.status('link copied -- the level travels in the URL'),
      () => this.status('link is in the address bar'),
    );
  }

  async fly() {
    if (!this.spec) return;
    this.audio.start();
    // Fullscreen landscape is worth asking for, and harmless when refused.
    try {
      const el = document.getElementById('stage');
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
      await screen.orientation?.lock?.('landscape');
    } catch { /* browsers may refuse either; the game plays fine regardless */ }
    if (this.input.motion === 'granted') this.input.needsCalibration = true;
    this.game.reset();
    this.show('flight');
  }

  toMenu() {
    this.show('design');
    this.status(`${this.spec.name} -- ${this.game.phase === 'won' ? 'cleared' : 'ready'}`);
    try { screen.orientation?.unlock?.(); } catch { /* not supported everywhere */ }
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
    const horizon = H * 0.62;
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
    drawText(rd, 'VECTOR CANYON SIMULATOR', W * 0.5, horizon - 18 * s, 9 * s, 1.1 * s,
      0.35, 0.6, 0.7, 0.6, 0);
  }
}
