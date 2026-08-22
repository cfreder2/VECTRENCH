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
import { Campaign, DISTRICTS, WEAPONS } from './campaign.js';

const $ = (id) => document.getElementById(id);

/** '#b06fff' -> [0.69, 0.44, 1], for drawing DOM-side colors on the canvas. */
function hexRgb(css) {
  const n = parseInt(css.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
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
    this.buildRack();
    this.refreshCampaign();
    // Campaign levels live in the grid; the shelf keeps training and customs.
    const inGrid = new Set(DISTRICTS.map((d) => d.level).filter(Boolean));
    for (const lv of PREBUILT) {
      if (!inGrid.has(lv.spec.name)) this.addLevel(lv, $('prebuilt'));
    }

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
    // An iPhone has no Fullscreen API for anything that is not a video, so this
    // used to skip silently and then report success. What actually works there
    // is the home screen: the page is already marked as app-capable, so opened
    // from an icon it runs without Safari's chrome, which is the real thing.
    if (!el.requestFullscreen) {
      this.status(navigator.standalone
        ? 'already full screen -- you are running it from the home screen'
        : 'this browser has no full screen. On iPhone: Share, then ADD TO HOME SCREEN, and open it from there');
      return;
    }
    try {
      if (!document.fullscreenElement) await el.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      this.status('the browser refused full screen');
      return;
    }
    const type = (screen.orientation && screen.orientation.type)
      || (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary');
    const want = type.startsWith('landscape') ? 'landscape' : 'portrait';
    try {
      await screen.orientation?.lock?.(want);
      this.status(`full screen, locked ${want}`);
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
      b.style.borderColor = d.css + '55';
      const lv = d.level ? PREBUILT.find((l) => l.spec.name === d.level) : null;
      if (d.center) {
        b.innerHTML = `<span class="dname" style="color:${d.css}">${d.name}</span>
          <span class="dsub" id="citadelsub"></span>`;
        b.addEventListener('click', () => {
          this.status(this.campaign.wardensDown()
            ? 'the citadel is not built yet -- soon'
            : `sealed -- ${this.campaign.clearedCount()} of ${DISTRICTS.filter((x) => x.level && !x.center).length} wardens down`);
        });
      } else if (lv) {
        b.innerHTML = `<span class="dname" style="color:${d.css}">${d.name}</span>
          <span class="dsub">${lv.label}</span>`;
        b.addEventListener('click', () => {
          for (const o of this.buttons) o.classList.toggle('on', o === b);
          this.setSpec(lv.spec, [d.name, lv.blurb].filter(Boolean));
        });
        this.buttons.push(b);
      } else {
        b.classList.add('locked');
        b.innerHTML = `<span class="dname" style="color:${d.css}">${d.name}</span>
          <span class="dsub">offline</span>`;
        b.addEventListener('click', () => this.status(`${d.name.toLowerCase()} is not built yet`));
      }
      this.cells[d.id] = { el: b, district: d };
      grid.appendChild(b);
    }
    this.refreshCampaign();
  }

  /** The eight weapon slots: earned ones equip, the rest say how to earn. */
  buildRack() {
    const rack = $('rack');
    this.slots = {};
    for (const [key, w] of Object.entries(WEAPONS)) {
      const b = document.createElement('button');
      b.className = 'wslot';
      b.textContent = w.name;
      b.addEventListener('click', () => {
        if (this.campaign.equip(key)) {
          this.refreshCampaign();
          this.status(`${w.name} fitted`);
        } else {
          const holder = DISTRICTS.find((d) => {
            const lv = d.level && PREBUILT.find((l) => l.spec.name === d.level);
            return lv && lv.spec.boss && lv.spec.boss.weapon === key;
          });
          this.status(holder
            ? `${w.name.toLowerCase()} -- beat the ${holder.name.toLowerCase()} warden to take it`
            : `${w.name.toLowerCase()} -- its warden is not built yet`);
        }
      });
      this.slots[key] = b;
      rack.appendChild(b);
    }
  }

  /** Cleared badges, the Citadel's count, and the rack's states -- from truth. */
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
    for (const [key, b] of Object.entries(this.slots || {})) {
      const earned = c.weapons.includes(key);
      b.classList.toggle('locked', !earned);
      b.classList.toggle('on', c.equipped === key);
      b.style.background = c.equipped === key ? WEAPONS[key].css : '';
      b.style.borderColor = earned ? WEAPONS[key].css : '';
      b.style.color = c.equipped === key ? '#04140b' : earned ? WEAPONS[key].css : '';
    }
    $('racknote').textContent = c.weapons.length
      ? `fitted: ${WEAPONS[c.equipped].name} -- hold SPECIAL in flight`
      : 'beat a warden to take its weapon';
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
    try {
      const el = document.getElementById('stage');
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch { /* browsers may refuse; the game plays fine regardless */ }
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
    // The design screen redraws every frame now: the ship on it is alive.
    if (this.screen === 'design') this.dirty = false;
    else if (!this.dirty) return;
    else this.dirty = false;
    rd.beginFrame(1);
    if (this.screen === 'design' && this.game.track) {
      const band = this.freeBand();
      const strip = 64 * rd.scale;
      if (band.y1 - band.y0 > 190 * rd.scale) {
        this.drawShipCard(band.y0, strip);
        band.y0 += strip;
      }
      drawSchematic(rd, this.game.track, this.game.level, 1, band);
    } else if (this.screen === 'boot') {
      this.drawBootGrid();
    }
    rd.endFrame();
  }

  /**
   * Your ship, on the shelf above the map: the interceptor in top view, the
   * fitted special worn as its trim. A hangar, four lines wide.
   */
  drawShipCard(y0, h) {
    const rd = this.rd;
    const s = rd.scale;
    const cx = rd.width * 0.5;
    const cy = y0 + h * 0.52;
    const t = performance.now() / 1000;
    const sway = Math.sin(t * 1.4) * 3 * s;
    const wkey = this.campaign.equipped;
    const wc = wkey ? hexRgb(WEAPONS[wkey].css) : [0.35, 0.6, 0.7];

    const S = 1.35 * s;
    const N = [cx + sway, cy - 15 * S];
    const L = [cx + sway - 13 * S, cy + 11 * S];
    const R = [cx + sway + 13 * S, cy + 11 * S];
    const T = [cx + sway, cy + 6 * S];
    for (const [a, b] of [[N, L], [L, T], [T, R], [R, N]]) {
      rd.line2(a[0], a[1], b[0], b[1], 1.8 * s, 0.45, 0.95, 1, 0.95, 0.95);
    }
    // The engine, flickering; the wingtips, in the weapon's color.
    const jet = (6 + Math.sin(t * 23) * 2.5) * S;
    rd.line2(T[0] - 3 * S, T[1] + 2 * S, T[0] - 3 * S, T[1] + jet, 1.4 * s, 1, 0.72, 0.2, 0.8, 0.1);
    rd.line2(T[0] + 3 * S, T[1] + 2 * S, T[0] + 3 * S, T[1] + jet, 1.4 * s, 1, 0.72, 0.2, 0.8, 0.1);
    for (const W of [L, R]) {
      rd.line2(W[0], W[1], W[0], W[1] - 5 * S, 2.4 * s, wc[0], wc[1], wc[2], wkey ? 1 : 0.35, wkey ? 1 : 0.35);
    }

    drawText(rd, 'INTERCEPTOR', cx - 100 * s, cy + 3 * s, 9 * s, 1.1 * s, 0.35, 0.6, 0.7, 0.9, 1);
    const label = wkey ? WEAPONS[wkey].name : 'NO SPECIAL';
    drawText(rd, label, cx + 100 * s, cy + 3 * s, 9 * s, 1.1 * s, wc[0], wc[1], wc[2], wkey ? 1 : 0.5);
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
  }
}
