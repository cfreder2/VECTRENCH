// Input: tilt to fly, touch to shoot -- or a controller, or a keyboard.
//
// Steering reads the gravity vector rather than gyroscope rate, because an
// on-rails ship wants an *absolute* control: where you hold the phone is where
// the ship sits, and letting go re-centres it. Rate control would drift.
//
// Device motion arrives in device axes, which do not rotate with the screen, so
// everything is rotated into screen space by screen.orientation.angle before
// use. Neutral is whatever posture the player calibrated in, not "flat".

import { clamp, TAU } from './math.js';

// Tilt away from neutral, in degrees, that counts as full deflection. The two
// axes are not the same number on purpose: rolling a phone left and right is
// free, but pitching it forward and back tips the screen away from your face,
// so people simply will not do it as far. Asking for the same tilt on both is
// what made climbing feel unresponsive when steering left and right did not.
//
// Angles, not gravity components. Reading the components straight off the
// accelerometer only works near flat: gravity has a fixed length, so the
// further the phone is tipped up the less each component moves, and held
// upright the pitch component is at its limit and stops responding at all --
// tipping the top toward you and away from you both shrink it, so the ship
// could be flown one way and not the other. The angle between where the phone
// is now and where it was calibrated has no such dead spot.
const FULL_TILT_X = 21.5 * (Math.PI / 180);
const FULL_TILT_Y = 16.6 * (Math.PI / 180);
const DEADZONE = 0.05;
const PAD_DEADZONE = 0.14;   // sticks rest a little off centre, and they wear
// Tap timings, which are the difference between a gesture that works under a
// thumb and one that only works in a test. 260ms was tight: firing happens on
// the way down, so people hold a moment longer than they think they do, and a
// triple tap had to land three touches inside 720ms.
const TAP_TIME = 340;        // ms: longer than this and it is a held trigger
const TAP_SLOP = 30;         // px a tap may travel and still be a tap
const TAP_WINDOW = 480;      // ms between taps going down, hold time excluded

// Calibration waits for stillness: this many consecutive readings within this
// tolerance, or this many readings total before it settles for what it has.
// DeviceMotion runs near 60Hz, so 20 readings is about a third of a second.
const STEADY_TOL = 0.35;
const STEADY_READINGS = 20;
const STEADY_GIVE_UP = 150;

/** Deadzone plus a mild expo curve: precise near centre, quick at the edges. */
function shape(v) {
  const s = Math.sign(v);
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const t = (a - DEADZONE) / (1 - DEADZONE);
  // Weighted toward linear: the old curve gave a third of the deflection for
  // half the tilt, which reads as the ship ignoring you rather than as finesse.
  return s * (t * t * 0.35 + t * 0.65);
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.steerX = 0;
    this.steerY = 0;
    this.firing = false;
    this.justPressed = false;
    this.missilePressed = false;
    this.holdTime = 0;
    this.rolling = false;          // the ship is turning onto its side
    this.rollDir = 1;              // which way it goes over: -1 left, 1 right
    this.barrelReq = 0;            // a double tap let go of, waiting to be taken
    this._double = null;           // the second tap of a pair, still down
    this._lastPress = null;
    this.boosting = false;         // the burn is open
    this.boostHeld = false;        // the BURN button is down
    this.specialPressed = false;   // the special was asked for, once
    this.boostHeld = false;
    this.motion = 'unavailable';   // unavailable | granted | denied
    this.padName = '';             // the controller in use, if there is one
    this._padFiring = false;
    this._padMissile = false;
    this.invertX = false;
    // Tilting the top of the phone away from you climbs. It is the default
    // because it is how people hold a thing they are flying, and it is the
    // one everybody reaches for the toggle to get.
    this.invertY = true;
    this.sensitivity = 1;

    this.gx = 0; this.gy = 0; this.gz = 0;   // filtered gravity, screen space
    this.nx = 0; this.ny = 0; this.nz = 1;   // calibrated neutral, a unit vector
    this.hasReading = false;
    this.needsCalibration = true;
    this._steady = 0;              // consecutive still readings, while calibrating
    this._waited = 0;              // readings since calibration was asked for
    this._lastRaw = [0, 0, 0];
    this._angle = 0;            // screen rotation the neutral is expressed in

    this.keys = new Set();
    this.pointers = new Map();
    this.primary = null;
    this.stick = null;             // second finger, used when tilt is unavailable
    this.stickOrigin = [0, 0];

    this._onMotion = this._onMotion.bind(this);
    this.bind();
  }

  bind() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', (e) => this._down(e), opts);
    c.addEventListener('pointermove', (e) => this._move(e), opts);
    c.addEventListener('pointerup', (e) => this._up(e), opts);
    c.addEventListener('pointercancel', (e) => this._up(e), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Stop the browser from treating a fast tap-drag as a scroll or zoom.
    c.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    c.addEventListener('touchmove', (e) => e.preventDefault(), opts);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      const k = e.key.toLowerCase();
      // Missiles are edge-triggered: holding the key is not a stream of salvos.
      if ((k === 'shift' || k === 'm' || k === 'enter') && !this.keys.has(k)) {
        this.launchMissiles();
      }
      if (k === 'x' && !this.keys.has(k)) this.toggleSpecial();

      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.primary = null;
      this.stick = null;
      this.firing = false;
      this.rolling = false;
      this.boosting = false;
      this.boostHeld = false;
      this._double = null;
      this._lastPress = null;
    });
  }

  /**
   * Must be called from a user gesture: iOS gates device motion behind an
   * explicit permission prompt that only a real tap can open.
   */
  async requestMotion() {
    const DME = window.DeviceMotionEvent;
    if (!DME) {
      this.motion = 'unavailable';
      return this.motion;
    }
    try {
      if (typeof DME.requestPermission === 'function') {
        const res = await DME.requestPermission();
        this.motion = res === 'granted' ? 'granted' : 'denied';
      } else {
        this.motion = 'granted';
      }
    } catch {
      this.motion = 'denied';
    }
    if (this.motion === 'granted') {
      window.addEventListener('devicemotion', this._onMotion);
      this.needsCalibration = true;
    }
    return this.motion;
  }

  /**
   * The screen's rotation away from the device's natural one, in degrees.
   *
   * `window.orientation` is the old spelling of this and it counts the other
   * way round, so it has to be negated rather than used as a spare. Reading
   * the angle with `||` also quietly fell through to it whenever the angle was
   * zero, which is the one value that is falsy and also completely normal.
   */
  _screenAngle() {
    const o = typeof screen !== 'undefined' && screen.orientation;
    if (o && Number.isFinite(o.angle)) return o.angle;
    return Number.isFinite(window.orientation) ? -window.orientation : 0;
  }

  /**
   * The screen turned under us: the phone was rolled far enough for the OS to
   * re-lay the page out.
   *
   * Getting there means physically rolling the phone through forty-five
   * degrees, which is the bank gesture, so the controls swing hard and then
   * invert the instant the layout flips. Nothing can tell those two intentions
   * apart while it is happening -- so stop steering and take the new posture
   * as neutral, which is what the player means by turning the phone anyway.
   * Carrying the old neutral across instead reads correctly for exactly one
   * frame and then leaves it ninety degrees wrong for the rest of the run.
   */
  _reframe(deg) {
    this._angle = deg;
    this.recalibrate();
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || (a.x === null && a.y === null)) return;
    // Rotate device axes into screen axes. Turning the vector the same way the
    // screen turned, not the opposite way: at zero the two are identical, which
    // is why this read correctly in portrait and inverted both axes in
    // landscape -- and flipped the controls the moment the phone rotated.
    const deg = this._screenAngle();
    if (deg !== this._angle) this._reframe(deg);
    const r = (deg * Math.PI) / 180;
    const cs = Math.cos(r), sn = Math.sin(r);
    const dx = a.x || 0, dy = a.y || 0;
    const sx = dx * cs - dy * sn;
    const sy = dx * sn + dy * cs;
    // The screen rotates about z, so z comes through untouched -- and it has to
    // come through: two components describe the tilt only while the phone is
    // near flat, and the whole point is that it is not.
    // Some devices have been known to leave z out. Gravity has a known length,
    // so it can be recovered from the other two rather than losing pitch.
    const sz = a.z == null
      ? Math.sqrt(Math.max(0, 9.81 * 9.81 - dx * dx - dy * dy))
      : a.z;
    // Low-pass: gravity is the slow part of the signal; hand shake is the fast part.
    const k = this.hasReading ? 0.18 : 1;
    this.gx += (sx - this.gx) * k;
    this.gy += (sy - this.gy) * k;
    this.gz += (sz - this.gz) * k;
    this.hasReading = true;
    if (this.needsCalibration) this._settle(sx, sy, sz);
  }

  /**
   * Adopts neutral once the phone has stopped moving.
   *
   * Calibration is asked for at the moment a run starts -- which is also the
   * moment the game goes fullscreen, so the player is very often part way
   * through turning the phone. Taking the next reading as neutral froze a
   * posture nobody was holding, and every run after that fought it. Wait for
   * the pose to be still instead, and give up waiting rather than never
   * steering at all.
   */
  _settle(sx, sy, sz) {
    const moved = Math.hypot(sx - this._lastRaw[0], sy - this._lastRaw[1], sz - this._lastRaw[2]);
    this._lastRaw[0] = sx;
    this._lastRaw[1] = sy;
    this._lastRaw[2] = sz;
    this._waited++;
    this._steady = moved > STEADY_TOL ? 0 : this._steady + 1;
    if (this._steady >= STEADY_READINGS || this._waited >= STEADY_GIVE_UP) {
      this.calibrate();
    }
  }

  /** Adopts the current posture as neutral. */
  calibrate() {
    if (!this.hasReading) return false;
    // Stored as a direction, because that is all it is: how the phone was
    // pointed, not how hard gravity was pulling on it.
    const l = Math.hypot(this.gx, this.gy, this.gz) || 1;
    this.nx = this.gx / l;
    this.ny = this.gy / l;
    this.nz = this.gz / l;
    this.needsCalibration = false;
    this._steady = 0;
    this._waited = 0;
    return true;
  }

  /** Asks for a fresh neutral, taken as soon as the phone is held still. */
  recalibrate() {
    this.needsCalibration = true;
    this._steady = 0;
    this._waited = 0;
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /**
   * Two taps, and then it depends what you do with the second one.
   *
   * Let it go and the ship barrel rolls; keep holding and it stays on its edge
   * until you lift. One tap is still only the gun, and still fires on the way
   * down, so neither gesture costs a shot.
   *
   * The run is timed press to press. Timed release to release -- which is what
   * this did first -- the gap between two taps includes however long the second
   * was held, so a pair of unhurried 300ms taps 400ms apart measured 700ms and
   * never counted. It worked with 40ms taps in a test and not under a thumb.
   */
  _press(x, w, id, at) {
    // One convention, stated once: -1 is left, 1 is right, matching shipX.
    // Whether that means a positive or a negative roll angle is the game's
    // business, not this file's -- flipping it here as well as there is how
    // the dodge ended up going the opposite way from the tap.
    const dir = x < w * 0.5 ? -1 : 1;
    if (this._lastPress && this._lastPress.dir === dir
        && at - this._lastPress.at < TAP_WINDOW) {
      this._double = { dir, id, at };
    }
    this._lastPress = { dir, at };
  }

  _down(e) {
    e.preventDefault();
    // Capture is a nicety -- it keeps a finger that slides off the canvas
    // attached to the game. It can also throw, and a throw here would happen
    // before the trigger is armed, which costs the player the shot they were
    // taking. Never worth that.
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* not captured */ }
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    // With tilt, a touch anywhere is purely a trigger -- there is nothing to
    // aim, so there is no reason to make the player put their finger anywhere
    // in particular. Without tilt the first finger has to fly the ship, so it
    // steers and does not shoot; anything after it shoots.
    if (this.motion !== 'granted' && this.stick === null) {
      this.stick = e.pointerId;
      this.stickOrigin = [p[0], p[1]];
    } else if (this.primary === null) {
      this.primary = e.pointerId;
      this.firing = true;
      this.justPressed = true;
      this.holdTime = 0;
      const now = performance.now();
      this._tapFrom = [p[0], p[1], now];
      this._press(p[0], this.canvas.getBoundingClientRect().width || 1, e.pointerId, now);
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this._pos(e));
  }

  _up(e) {
    const at = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.stick) this.stick = null;
    if (e.pointerId === this.primary) {
      // A tap is a touch that went down and came up quickly without travelling.
      // Anything longer is the trigger being held, which is not a gesture.
      // The second tap of a pair: let go quickly and it is a barrel roll, hold
      // it and it was the knife edge, which ends here.
      const d = this._double;
      if (d && d.id === e.pointerId) {
        const f = this._tapFrom;
        const still = f && at && Math.hypot(at[0] - f[0], at[1] - f[1]) < TAP_SLOP;
        if (still && performance.now() - d.at < TAP_TIME) this.barrelReq = d.dir;
        this._double = null;
        this._lastPress = null;
      }
      this.primary = null;
      this.firing = false;
      this.holdTime = 0;
    }
    // Promote a remaining finger, so lifting one of two never leaves the ship
    // unsteered or the trigger stuck down.
    if (this.stick === null && this.motion !== 'granted') {
      for (const [id, p] of this.pointers) {
        this.stick = id;
        this.stickOrigin = [p[0], p[1]];
        if (id === this.primary) { this.primary = null; this.firing = false; }
        break;
      }
    }
    if (this.primary === null) {
      for (const id of this.pointers.keys()) {
        if (id === this.stick) continue;
        this.primary = id;
        this.firing = true;
        break;
      }
    }
  }

  /** Called once per frame, before the game reads steering. */
  update(dt, viewW, viewH) {
    if (this.firing) this.holdTime += dt;
    // Going on edge is its own control, never the trigger. Touch-and-hold is
    // the gun and stays the gun: it is the best thing about flying this, and a
    // roll that borrowed it would be a roll that cost you the shot you were
    // taking. So it is a button you hold, a key, or a face button on a pad.
    this.rolling = false;
    this.boosting = this.boostHeld;
    if (Math.abs(this.steerX) > 0.15) this.rollDir = Math.sign(this.steerX);
    // The second tap starts the roll the instant it lands, not once it has
    // been held long enough to prove it is a hold. Waiting for that put 340ms
    // of nothing between the press and the ship moving, and the ship then took
    // another 280 to get over: two thirds of a second to go on edge.
    //
    // Nothing is lost by starting early. Let go quickly and the roll it has
    // already begun carries on into the full turn of a barrel roll; keep
    // holding and it stops at the edge. Both gestures start the same way, which
    // is also how they look.
    if (this._double) {
      this.rolling = true;
      this.rollDir = this._double.dir;
    }

    let sx = 0;
    let sy = 0;

    if (this.motion === 'granted' && this.hasReading && !this.needsCalibration) {
      const l = Math.hypot(this.gx, this.gy, this.gz) || 1;
      const ux = this.gx / l, uy = this.gy / l, uz = this.gz / l;
      // Pitch is where the phone points within the plane of the screen's up
      // and out axes, taken as an angle. Read as gravity's up-the-screen
      // component instead -- which is what this used to do -- it stops
      // responding when the phone is held upright, because that component is
      // then at its limit and tipping either way only shrinks it.
      const pitch = Math.atan2(uy, uz) - Math.atan2(this.ny, this.nz);
      // Bank is how far the across-the-screen axis has dipped out of level.
      // That is the same gesture at every posture: dropping the left edge of a
      // flat phone and banking an upright one both put gravity along it, which
      // rotation about a fixed screen axis does not -- held upright, the axis
      // a player banks around is not the one they roll around when it is flat.
      const bank = Math.asin(clamp(ux, -1, 1)) - Math.asin(clamp(this.nx, -1, 1));
      const wrap = (a) => (a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a);
      sx = shape(clamp((wrap(bank) / FULL_TILT_X) * this.sensitivity, -1.4, 1.4));
      sy = shape(clamp((-wrap(pitch) / FULL_TILT_Y) * this.sensitivity, -1.4, 1.4));
      // Inverting is a tilt setting -- it sits under TILT SENSITIVITY on the
      // panel and it is a statement about how you hold the phone. Applied at
      // the end instead, as it used to be, it also turned the arrow keys
      // upside down, which nobody ever wanted.
      if (this.invertX) sx = -sx;
      if (this.invertY) sy = -sy;
    }

    if (this.stick !== null && this.pointers.has(this.stick)) {
      const p = this.pointers.get(this.stick);
      const range = Math.min(viewW, viewH) * 0.22;
      sx = clamp((p[0] - this.stickOrigin[0]) / range, -1, 1);
      sy = clamp((this.stickOrigin[1] - p[1]) / range, -1, 1);
    }

    // A controller, if one is plugged in. The standard mapping is what both an
    // Xbox and a PlayStation pad report through a browser, so one set of
    // indices covers both. It takes over from the tilt only while it is being
    // used, so a pad sitting idle on the desk does not pin the ship.
    const pad = this._pad();
    this.padName = pad ? pad.id.replace(/\s*\([^)]*\)\s*/g, '').trim() : '';
    if (pad) {
      const stick = (v) => (Math.abs(v) < PAD_DEADZONE ? 0
        : (v - Math.sign(v) * PAD_DEADZONE) / (1 - PAD_DEADZONE));
      const px = stick(pad.axes[0] || 0);
      const py = stick(-(pad.axes[1] || 0));
      if (px || py) { sx = px; sy = py; }
      const held = (...i) => i.some((n) => pad.buttons[n] && pad.buttons[n].pressed);
      // Either trigger or the bottom face button fires; either shoulder or the
      // right face button launches, on the press rather than the hold.
      const fire = held(7, 6, 0);
      if (fire && !this.firing) this.justPressed = true;
      if (fire) this.firing = true;
      else if (this._padFiring) this.firing = false;
      this._padFiring = fire;
      const launch = held(5, 4, 1);
      if (launch && !this._padMissile) this.launchMissiles();
      this._padMissile = launch;
      if (held(2)) this.rolling = true;                 // X / Square: on edge
      if (held(3)) this.boosting = true;                // Y / Triangle: burn
    }

    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.has('arrowleft') || k.has('a')) kx -= 1;
    if (k.has('arrowright') || k.has('d')) kx += 1;
    if (k.has('arrowup') || k.has('w')) ky += 1;
    if (k.has('arrowdown') || k.has('s')) ky -= 1;
    if (kx || ky) { sx = kx; sy = ky; }
    if (k.has(' ')) { if (!this.firing) this.justPressed = true; this.firing = true; }
    if (k.has('q') || k.has('e') || k.has('control')) this.rolling = true;
    if (k.has('b')) this.boosting = true;

    this.steerX = sx;
    this.steerY = sy;
  }

  /** True once per special toggle request, from the button or a key. */
  takeSpecial() {
    const v = this.specialPressed;
    this.specialPressed = false;
    return v;
  }

  /** Requests the special weapon toggled. Button and keyboard both land here. */
  toggleSpecial() {
    this.specialPressed = true;
  }

  /** True once per missile request, from the button, a key, or a call. */
  takeMissile() {
    const v = this.missilePressed;
    this.missilePressed = false;
    return v;
  }

  /** A double tap, once. Returns -1 or 1 for the side, or 0 for nothing. */
  takeBarrel() {
    const v = this.barrelReq;
    this.barrelReq = 0;
    return v;
  }

  /** The burn is held, not fired: this is the button being down. */
  boost(on = true) {
    this.boostHeld = on;
  }

  /** Requests a salvo. The on-screen button and the keyboard both land here. */
  launchMissiles() {
    this.missilePressed = true;
  }

  /** The first connected pad, or null. Polled rather than evented: the API
   *  only refreshes button state when you ask for it. */
  _pad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  /** True once per press. */
  takePress() {
    const v = this.justPressed;
    this.justPressed = false;
    return v;
  }

  keyPressed(key) { return this.keys.has(key); }
}
