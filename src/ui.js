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
import { drawText } from './font.js';
import { Campaign, DISTRICTS, WEAPONS } from './campaign.js';
import { Renderer } from './renderer.js';
import { drawShip } from './entities.js';
import { Track, makeFrame } from './track.js';
import { TerrainRenderer } from './terrain.js';

const $ = (id) => document.getElementById(id);

/** '#b06fff' -> [0.69, 0.44, 1], for drawing DOM-side colors on the canvas. */
function hexRgb(css) {
  const n = parseInt(css.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * The interceptor on its stand: the actual game ship, drawn by the actual
 * game's ship renderer, with the camera walking a slow circle around it.
 */
class ShipView {
  constructor(canvas) {
    this.canvas = canvas;
    this.rd = new Renderer(canvas);
    this.basis = { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] };
    this.sized = false;
  }

  tick() {
    if (!this.canvas.isConnected) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    if (!this.sized || Math.abs(rect.width - this._w) > 2 || Math.abs(rect.height - this._h) > 2) {
      this.rd.resize(rect.width, rect.height, 400_000);
      this._w = rect.width; this._h = rect.height;
      this.sized = true;
    }
    const t = performance.now() / 1000;
    const a = t * 0.6;
    const eye = [Math.sin(a) * 44, 12 + Math.sin(t * 0.9) * 3, Math.cos(a) * 44];
    const f = [-eye[0], -eye[1] + 6, -eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const r = [f[2], 0, -f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    this.rd.beginFrame(1);
    this.rd.setCamera(eye, r, u, f, 0.9, 400);
    drawShip(this.rd, [0, 0, 0], this.basis, 0.35 + 0.15 * Math.sin(t * 3), t, 0);
    this.rd.endFrame();
  }
}

/**
 * The fly-through inside the selected square: the level's own canyon, its own
 * colors, no obstacles and nothing shooting -- terrain and motion, which is
 * what a glance can actually read. Its own little renderer on its own little
 * canvas, mounted into whichever cell is chosen.
 */
class Preview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview';
    this.rd = new Renderer(this.canvas);
    this.frame = makeFrame();
    this.lookFrame = makeFrame();
    this.eye = [0, 0, 0];
    this.look = [0, 0, 0];
    this.track = null;
    this.last = 0;
  }

  setSpec(spec) {
    this.track = new Track(spec);
    this.terrain = new TerrainRenderer(this.track);
    this.t = 150;
    this.speed = spec.speed.start;
  }

  mount(cell) {
    cell.prepend(this.canvas);
    this.sized = false;
  }

  tick() {
    if (!this.track || !this.canvas.isConnected) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - this.last) || 0.016;
    this.last = now;

    if (!this.sized) {
      const r = this.canvas.getBoundingClientRect();
      if (r.width < 4) return;
      this.rd.resize(r.width, r.height, 260_000);
      this.sized = true;
    }

    const tr = this.track;
    this.t += this.speed * dt;
    if (this.t > tr.total - 700) this.t = 150;

    const y = tr.railY(this.t) + 14;
    tr.frameAt(Math.max(1, this.t - 26), this.frame);
    tr.localToWorldF(this.frame, 0, y + 12, this.eye);
    tr.frameAt(Math.min(tr.total, this.t + 130), this.lookFrame);
    tr.localToWorldF(this.lookFrame, 0, tr.railY(this.t + 130) + 8, this.look);

    const f = [this.look[0] - this.eye[0], this.look[1] - this.eye[1], this.look[2] - this.eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const up = this.frame.u;
    const r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];

    this.rd.beginFrame(0.7);
    this.rd.setCamera(this.eye, r, u, f, 1.1, 2600);
    this.terrain.draw(this.rd, this.t, false, now, 1);
    this.rd.endFrame();
  }
}

const BURN_PIPS = 5;   // chevrons on the boost gauge
const SPEC_PIPS = 8;   // diamonds on the special gauge

export class UI {
  constructor(rd, input, audio, game) {
    this.rd = rd;
    this.input = input;
    this.audio = audio;
    this.game = game;
    this.screen = 'boot';
    this.campaign = new Campaign();
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
    this.buildGrid();
    this.buildTraining();
    this.refreshCampaign();

    $('fly').addEventListener('click', () => this.fly());
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
    // Held, not tapped: the burn runs for as long as this is down and there is
    // anything left in the tank. It is a button of its own so that touch-and-
    // hold anywhere else is still nothing but the gun. There is no roll button
    // any more -- double tap and hold does that, on the side you ask for, which
    // a single button in a fixed corner could never do.
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
    hold('burn', (on) => { this.input.boostHeld = on; });
    // The special is held exactly like the burn: down is firing, up is saved.
    hold('spec', (on) => { this.input.specialBtn(on); });
    // The roll buttons: hold one and the ship goes over on that side; a quick
    // second press within the window is the barrel roll, that way. The press
    // starts the knife immediately either way -- both moves begin identically,
    // so nothing is lost by not waiting to find out which one it is.
    const rollTaps = { '-1': 0, '1': 0 };
    const rollBtn = (id, dir) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        const now = performance.now();
        if (now - rollTaps[dir] < 340) this.input.requestBarrel(dir);
        rollTaps[dir] = now;
        this.input.rollBtn(dir, true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        el.addEventListener(ev, (e) => { e.preventDefault(); this.input.rollBtn(dir, false); });
      }
    };
    rollBtn('lr', -1);
    rollBtn('rr', 1);
    $('rollmode').addEventListener('change', (e) => {
      this.input.rollMode = e.target.checked ? 'buttons' : 'gestures';
      $('rollrow').hidden = !e.target.checked;
    });

    $('calibrate').addEventListener('click', async () => {
      if (this.input.motion !== 'granted') await this.input.requestMotion();
      const ok = this.input.calibrate();
      this.motionState(ok ? 'calibrated -- hold the phone as you just did' : null);
    });
    $('sens').addEventListener('input', (e) => {
      this.input.sensitivity = +e.target.value;
      $('sensval').textContent = (+e.target.value).toFixed(1);
    });
    $('paintlock').addEventListener('change', (e) => { this.game.paintToLock = e.target.checked; });
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
    // The button is the gauge, and the gauge is chevrons: five of them, lit from
    // the left as the tank fills. A word would have to be read; a row of arrows
    // is a fuel bar you take in without looking away from the canyon.
    const lit = Math.round(Math.max(0, Math.min(1, g.boost / 2.4)) * BURN_PIPS);
    if (lit !== this._burnPips) {
      $('burn').innerHTML = Array.from({ length: BURN_PIPS }, (_, i) =>
        `<b class="${i < lit ? 'lit' : ''}">\u276f</b>`).join('');
      this._burnPips = lit;
    }
    const cls = g.burning ? 'on' : lit === 0 ? 'cooling' : '';
    if (cls !== this._burnCls) { $('burn').className = cls; this._burnCls = cls; }
  }

  /**
   * The special's button is its gauge: a row of diamonds in the weapon's
   * color, whole ones lit, and the partial one the trickle is still earning
   * left dark. Lit solid while the weapon is live.
   */
  syncSpecButton() {
    const g = this.game;
    const has = !!g.special;
    if (has !== this._specHas) {
      $('spec').style.display = has ? '' : 'none';
      this._specHas = has;
    }
    if (!has) return;
    const whole = Math.floor(Math.max(0, g.diamonds ?? 0) + 1e-6);
    if (whole !== this._specPips) {
      $('spec').innerHTML = Array.from({ length: SPEC_PIPS }, (_, i) =>
        `<b class="${i < whole ? 'lit' : ''}">◆</b>`).join('');
      this._specPips = whole;
    }
    const cls = g.specialOn ? 'on' : whole === 0 ? 'cooling' : '';
    if (cls !== this._specCls) { $('spec').className = cls; this._specCls = cls; }
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
    // The title theme, from the first screen that follows a tap -- the tap is
    // what the browser's autoplay rules were waiting for. ANTHEM is the
    // campaign's opening music; a run swaps to its own song, and the menu
    // takes this back up on return.
    this.audio.musicStart('anthem');
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
    this._entered = true;
  }

  /**
   * Fullscreen, and stay the way up the player is already holding the phone.
   *
   * Locking is deliberately whichever orientation they are in when they ask,
   * rather than one the game prefers: it reads fine both ways, and the one
   * thing that does not read fine is the layout turning over mid-flight.
   */
  /**
   * Full screen, attempted every way the platform might spell it, and then
   * VERIFIED against what the document says -- iPhones in particular will
   * take the call, reject the promise, and leave you exactly where you were,
   * and a handler that swallows that has a button that "does nothing".
   * When nothing works, the honest answer is the home screen: the page is a
   * proper web app now, so opened from an icon it runs without any chrome.
   */
  async enterFullscreen() {
    if (navigator.standalone
      || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) {
      return 'standalone';
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) return 'in';
    const el = document.getElementById('stage');
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      try { await req.call(el, { navigationUI: 'hide' }); } catch {
        // Some engines choke on the options dictionary; ask again plainly.
        try { await req.call(el); } catch { /* verified below */ }
      }
      await new Promise((r) => setTimeout(r, 150));
      if (document.fullscreenElement || document.webkitFullscreenElement) return 'in';
    }
    return 'no';
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
    // Selecting a level auditions its song, right there on the menu -- the
    // music is part of what you are choosing. Gated behind the first entry so
    // the boot's automatic selection does not talk over the title theme.
    if (this._entered) this.audio.musicStart(this.spec.music);
    this.dirty = true;
    this.status(`${this.spec.name} -- ${Math.round(this.game.track.total)} units`);
  }

  /**
   * The 3x3: eight districts around the edge, the Citadel sealed in the
   * center. A cell with a level selects it like any shelf button; a cell
   * without one is the map being honest about what is still coming.
   */
  buildGrid() {
    const grid = $('grid');
    this.cells = {};
    for (const d of DISTRICTS) {
      const b = document.createElement('button');
      b.className = 'cell' + (d.center ? ' center' : '');
      const lv = d.level ? PREBUILT.find((l) => l.spec.name === d.level) : null;
      if (d.center) {
        b.innerHTML = `<span class="dname">${d.name}</span>
          <span class="dsub" id="citadelsub"></span>`;
        b.addEventListener('click', () => {
          this.status(this.campaign.wardensDown()
            ? 'the citadel is not built yet -- soon'
            : `sealed -- ${this.campaign.clearedCount()} of ${DISTRICTS.filter((x) => x.level && !x.center).length} wardens down`);
        });
      } else if (lv) {
        b.innerHTML = `<span class="dname">${d.name}</span>
          <span class="dsub">${lv.label}</span>`;
        b.addEventListener('click', () => {
          for (const o of this.buttons) o.classList.toggle('on', o === b);
          this.setSpec(lv.spec, [d.name, lv.blurb].filter(Boolean));
          this.showPreview(b);
        });
        this.buttons.push(b);
      } else {
        b.classList.add('locked');
        b.innerHTML = `<span class="dname">${d.name}</span>
          <span class="dsub">offline</span>`;
        b.addEventListener('click', () => this.status(`${d.name.toLowerCase()} is not built yet`));
      }
      this.cells[d.id] = { el: b, district: d };
      grid.appendChild(b);
    }
    this.refreshCampaign();
  }

  /**
   * TRAIN: one small button that steps through the training levels --
   * PROVING GROUND first, SHAKEDOWN after -- selecting each for FLY. The
   * grid stays the campaign's; training does not need a square of its own.
   */
  buildTraining() {
    const inGrid = new Set(DISTRICTS.map((d) => d.level).filter(Boolean));
    this.trainLevels = PREBUILT.filter((lv) => !inGrid.has(lv.spec.name));
    this.trainIdx = -1;
    $('train').addEventListener('click', () => {
      if (!this.trainLevels.length) return;
      this.trainIdx = (this.trainIdx + 1) % this.trainLevels.length;
      const lv = this.trainLevels[this.trainIdx];
      for (const o of this.buttons) o.classList.remove('on');
      this.setSpec(lv.spec, [lv.label, lv.blurb].filter(Boolean));
      this.status(`${lv.label} -- training. FLY when ready`);
    });

    // The loadout button: the machine gun, until a warden hands over better.
    // With one or more specials earned it steps through them, gun included.
    $('wbtn').addEventListener('click', () => {
      const cycle = [null, ...this.campaign.weapons];
      const at = cycle.indexOf(this.campaign.equipped);
      this.campaign.equip(cycle[(at + 1) % cycle.length]);
      this.refreshCampaign();
    });

    // Everything that is not selecting-and-flying lives behind SETUP.
    $('setup').addEventListener('click', () => {
      const x = $('extras');
      x.hidden = !x.hidden;
      $('setup').textContent = x.hidden ? 'SETUP' : 'CLOSE';
    });
  }

  /** The chosen square starts flying its level. One preview, moved around. */
  showPreview(cell) {
    try {
      if (!this.preview) this.preview = new Preview();
    } catch {
      return;   // no second WebGL context: the menu works fine without it
    }
    this.preview.setSpec(this.spec);
    this.preview.mount(cell);
  }

  /** Cleared badges, the Citadel's count, and the rack -- all from truth.
   *  The rack holds only what has been TAKEN: an unearned weapon is not a
   *  greyed-out spoiler, it is nothing at all until its warden falls. */
  refreshCampaign() {
    const c = this.campaign;
    for (const { el, district } of Object.values(this.cells || {})) {
      if (district.level) el.classList.toggle('cleared', c.isCleared(district.level));
    }
    const sub = $('citadelsub');
    if (sub) {
      const total = DISTRICTS.filter((d) => d.level && !d.center).length;
      sub.textContent = c.wardensDown() ? 'UNSEALED' : `SEALED ${c.clearedCount()}/${total}`;
    }
    // One loadout button. MACHINE GUN and disabled until anything better
    // exists; from the first earned weapon on, it cycles.
    const w = $('wbtn');
    w.disabled = c.weapons.length === 0;
    const eq = c.equipped && WEAPONS[c.equipped];
    w.textContent = eq ? eq.name : 'MACHINE GUN';
    w.style.borderColor = eq ? eq.css : '';
    w.style.color = eq ? eq.css : '';
  }

  /** One button on the shelf. The chosen one stays lit, so the shelf is the state. */
  addLevel(lv, into) {
    $('customfold').hidden = false;
    const b = document.createElement('button');
    b.className = 'chip built';
    b.textContent = lv.label;
    if (lv.blurb) b.title = lv.blurb;
    b.addEventListener('click', () => {
      for (const o of this.buttons) o.classList.toggle('on', o === b);
      this.setSpec(lv.spec, [lv.label, lv.blurb].filter(Boolean));
    });
    if (this.campaign.isCleared(lv.spec.name)) b.classList.add('cleared');
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
      // Hide it rather than grey it out: on the published page there is no
      // server to design with, so the whole panel is noise.
      $('designpanel').hidden = true;
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
    try { await this.enterFullscreen(); } catch { /* the game plays fine regardless */ }
    if (this.input.motion === 'granted') this.input.recalibrate();
    this.game.special = this.campaign.equipped;
    this.game.reset();
    this.audio.musicStart(this.spec.music);
    this.show('flight');
  }

  toMenu() {
    this.audio.musicStart('anthem');
    if (this.game.phase === 'won' && this.spec) {
      const got = this.campaign.markCleared(this.spec);
      this.refreshCampaign();
      this.show('design');
      this.status(got.weapon
        ? `warden down -- ${WEAPONS[got.weapon].name} is yours`
        : `${this.spec.name} -- cleared`);
      return;
    }
    this.show('design');
    this.status(`${this.spec.name} -- ready`);
  }

  /**
   * Drawn on the canvas behind the design panel. The schematic is static, so it
   * is only re-rendered when something actually changed; the boot grid animates
   * and always draws.
   */
  drawBackdrop() {
    const rd = this.rd;
    if (this.screen === 'design') {
      if (this.preview) this.preview.tick();
      if (!this.shipView) {
        try { this.shipView = new ShipView($('shipview')); } catch { this.shipView = false; }
      }
      if (this.shipView) this.shipView.tick();
    }
    this.dirty = false;
    rd.beginFrame(1);
    // Both idle screens get the slow grid; the level itself is previewed
    // inside the selected square, where a glance can actually read it.
    if (this.screen === 'design' || this.screen === 'boot') {
      this.drawBootGrid();
    }
    rd.endFrame();
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
  }
}
