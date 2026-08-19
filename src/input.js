// Input: tilt to fly, touch to shoot.
//
// Steering reads the gravity vector rather than gyroscope rate, because an
// on-rails ship wants an *absolute* control: where you hold the phone is where
// the ship sits, and letting go re-centres it. Rate control would drift.
//
// Device motion arrives in device axes, which do not rotate with the screen, so
// everything is rotated into screen space by screen.orientation.angle before
// use. Neutral is whatever posture the player calibrated in, not "flat".

import { clamp } from './math.js';

// Deviation from neutral, in m/s^2, that counts as full deflection. The two
// axes are not the same number on purpose: rolling a phone left and right is
// free, but pitching it forward and back tips the screen away from your face,
// so people simply will not do it as far. Asking for the same tilt on both is
// what made climbing feel unresponsive when steering left and right did not.
const FULL_TILT_X = 3.6;
const FULL_TILT_Y = 2.8;
const DEADZONE = 0.05;

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
    this.aimX = 0;
    this.aimY = 0;
    this.firing = false;
    this.justPressed = false;
    this.holdTime = 0;
    this.motion = 'unavailable';   // unavailable | granted | denied
    this.invertX = false;
    this.invertY = false;
    this.sensitivity = 1;

    this.gx = 0; this.gy = 0;      // filtered gravity, screen space
    this.nx = 0; this.ny = 0;      // calibrated neutral
    this.hasReading = false;
    this.needsCalibration = true;

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
      this.keys.add(e.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.primary = null;
      this.firing = false;
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

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || (a.x === null && a.y === null)) return;
    // Rotate device axes into screen axes.
    const deg = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const r = (deg * Math.PI) / 180;
    const cs = Math.cos(r), sn = Math.sin(r);
    const dx = a.x || 0, dy = a.y || 0;
    const sx = dx * cs + dy * sn;
    const sy = -dx * sn + dy * cs;
    // Low-pass: gravity is the slow part of the signal; hand shake is the fast part.
    const k = this.hasReading ? 0.18 : 1;
    this.gx += (sx - this.gx) * k;
    this.gy += (sy - this.gy) * k;
    this.hasReading = true;
    if (this.needsCalibration) this.calibrate();
  }

  /** Adopts the current posture as neutral. */
  calibrate() {
    if (!this.hasReading) return false;
    this.nx = this.gx;
    this.ny = this.gy;
    this.needsCalibration = false;
    return true;
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.primary === null) {
      this.primary = e.pointerId;
      this.aimX = p[0];
      this.aimY = p[1];
      this.firing = true;
      this.justPressed = true;
      this.holdTime = 0;
    } else if (this.stick === null && this.motion !== 'granted') {
      // No tilt available: a second finger becomes a relative stick.
      this.stick = e.pointerId;
      this.stickOrigin = [p[0], p[1]];
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this._pos(e);
    this.pointers.set(e.pointerId, p);
    if (e.pointerId === this.primary) {
      this.aimX = p[0];
      this.aimY = p[1];
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.primary) {
      this.primary = null;
      this.firing = false;
      this.holdTime = 0;
      // Promote any remaining finger so a two-finger release keeps working.
      for (const id of this.pointers.keys()) {
        if (id !== this.stick) { this.primary = id; this.firing = true; break; }
      }
    }
    if (e.pointerId === this.stick) this.stick = null;
  }

  /** Called once per frame, before the game reads steering. */
  update(dt, viewW, viewH) {
    if (this.firing) this.holdTime += dt;

    let sx = 0;
    let sy = 0;

    if (this.motion === 'granted' && this.hasReading && !this.needsCalibration) {
      sx = shape(clamp(((this.gx - this.nx) / FULL_TILT_X) * this.sensitivity, -1.4, 1.4));
      sy = shape(clamp((-(this.gy - this.ny) / FULL_TILT_Y) * this.sensitivity, -1.4, 1.4));
    }

    if (this.stick !== null && this.pointers.has(this.stick)) {
      const p = this.pointers.get(this.stick);
      const range = Math.min(viewW, viewH) * 0.22;
      sx = clamp((p[0] - this.stickOrigin[0]) / range, -1, 1);
      sy = clamp((this.stickOrigin[1] - p[1]) / range, -1, 1);
    }

    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.has('arrowleft') || k.has('a')) kx -= 1;
    if (k.has('arrowright') || k.has('d')) kx += 1;
    if (k.has('arrowup') || k.has('w')) ky += 1;
    if (k.has('arrowdown') || k.has('s')) ky -= 1;
    if (kx || ky) { sx = kx; sy = ky; }

    // Keep the crosshair on screen even before the first touch.
    if (this.primary === null && this.aimX === 0 && this.aimY === 0) {
      this.aimX = viewW * 0.5;
      this.aimY = viewH * 0.45;
    }

    this.steerX = this.invertX ? -sx : sx;
    this.steerY = this.invertY ? -sy : sy;
  }

  /** True once per press. */
  takePress() {
    const v = this.justPressed;
    this.justPressed = false;
    return v;
  }

  keyPressed(key) { return this.keys.has(key); }
}
