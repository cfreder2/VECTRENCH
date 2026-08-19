// Vector display renderer.
//
// Every visible thing in this game is a glowing line segment. Segments are
// transformed and near-clipped on the CPU, then emitted as screen-space quads
// into one big buffer and drawn in a single additive pass. Additive blending is
// order independent, so there is no depth buffer and no sorting -- which is
// both faster and exactly how a real vector display behaves.
//
// The scene renders into a persistent framebuffer that is only partially faded
// each frame. That leftover light is the phosphor trail: it costs one quad and
// does most of the work of selling speed.

const MAX_SEG = 24000;
const FLOATS_PER_VERT = 7; // x y u r g b a
const NEAR = 1.2;

const LINE_VS = `
precision highp float;
attribute vec2 aPos;
attribute float aU;
attribute vec4 aColor;
uniform vec2 uRes;
varying float vU;
varying vec4 vColor;
void main() {
  vU = aU;
  vColor = aColor;
  vec2 ndc = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

// Bright thin core plus a wide exponential halo. The halo is what makes
// crossing lines bloom into each other instead of just overlapping.
const LINE_FS = `
precision highp float;
varying float vU;
varying vec4 vColor;
void main() {
  float d = abs(vU);
  float core = smoothstep(1.0, 0.0, d * 3.1);
  float halo = exp(-d * 3.4) * 0.42;
  float a = core + halo;
  gl_FragColor = vec4(vColor.rgb * vColor.a * a, a);
}`;

const QUAD_VS = `
precision highp float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FADE_FS = `
precision highp float;
uniform float uFade;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uFade); }`;

// Composite: vignette plus a faint scanline. Deliberately gentle -- the glow
// already carries the CRT read, and heavy post turns thin lines to mush.
const BLIT_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uScan;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * 0.75;
  float scan = 1.0 - uScan * (0.5 - 0.5 * cos(vUv.y * uRes.y * 3.14159));
  gl_FragColor = vec4(c * vig * scan, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    };
    let gl = canvas.getContext('webgl2', opts);
    this.gl2 = !!gl;
    if (!gl) {
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) throw new Error('WebGL is not available on this device.');
      if (!gl.getExtension('OES_element_index_uint')) {
        throw new Error('WebGL is too limited on this device.');
      }
    }
    this.gl = gl;

    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.fadeProg = program(gl, QUAD_VS, FADE_FS);
    this.blitProg = program(gl, QUAD_VS, BLIT_FS);

    this.uRes = gl.getUniformLocation(this.lineProg, 'uRes');
    this.uFade = gl.getUniformLocation(this.fadeProg, 'uFade');
    this.uTex = gl.getUniformLocation(this.blitProg, 'uTex');
    this.uBlitRes = gl.getUniformLocation(this.blitProg, 'uRes');
    this.uScan = gl.getUniformLocation(this.blitProg, 'uScan');

    this.aPos = gl.getAttribLocation(this.lineProg, 'aPos');
    this.aU = gl.getAttribLocation(this.lineProg, 'aU');
    this.aColor = gl.getAttribLocation(this.lineProg, 'aColor');
    this.aQuad = gl.getAttribLocation(this.fadeProg, 'aPos');
    this.aQuadBlit = gl.getAttribLocation(this.blitProg, 'aPos');

    this.verts = new Float32Array(MAX_SEG * 4 * FLOATS_PER_VERT);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);

    const idx = new Uint32Array(MAX_SEG * 6);
    for (let i = 0; i < MAX_SEG; i++) {
      const v = i * 4;
      const o = i * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v;
      idx[o + 4] = v + 2;
      idx[o + 5] = v + 3;
    }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();

    this.segCount = 0;
    this.dropped = 0;
    this.width = 0;
    this.height = 0;
    this.scanline = 0.08;
    this.trail = 0.34;

    // Camera state, written by setCamera.
    this.ex = 0; this.ey = 0; this.ez = 0;
    this.rx = 1; this.ry = 0; this.rz = 0;
    this.ux = 0; this.uy = 1; this.uz = 0;
    this.fx = 0; this.fy = 0; this.fz = 1;
    this.focal = 500;
    this.cx = 0;
    this.cy = 0;
    this.far = 1200;
    this.fogNear = 240;
  }

  resize(cssW, cssH, maxPixels = 2_100_000) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.round(cssW * dpr));
    let h = Math.max(1, Math.round(cssH * dpr));
    const px = w * h;
    if (px > maxPixels) {
      const k = Math.sqrt(maxPixels / px);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cx = w * 0.5;
    this.cy = h * 0.5;
  }

  /** Pixels per CSS pixel, so HUD line widths stay physically consistent. */
  get scale() {
    return this.height / 720;
  }

  setCamera(eye, right, up, fwd, fovY, far) {
    this.ex = eye[0]; this.ey = eye[1]; this.ez = eye[2];
    this.rx = right[0]; this.ry = right[1]; this.rz = right[2];
    this.ux = up[0]; this.uy = up[1]; this.uz = up[2];
    this.fx = fwd[0]; this.fy = fwd[1]; this.fz = fwd[2];
    this.focal = this.height * 0.5 / Math.tan(fovY * 0.5);
    this.far = far;
    this.fogNear = far * 0.2;
  }

  beginFrame(fade = this.trail) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(this.fadeProg);
    gl.uniform1f(this.uFade, fade);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aQuad);
    gl.vertexAttribPointer(this.aQuad, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.segCount = 0;
    this.dropped = 0;
  }

  endFrame() {
    this.flush();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uTex, 0);
    gl.uniform2f(this.uBlitRes, this.width, this.height);
    gl.uniform1f(this.uScan, this.scanline);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aQuadBlit);
    gl.vertexAttribPointer(this.aQuadBlit, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  flush() {
    if (this.segCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.lineProg);
    gl.uniform2f(this.uRes, this.width, this.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts.subarray(0, this.segCount * 4 * FLOATS_PER_VERT));
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aU);
    gl.vertexAttribPointer(this.aU, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.drawElements(gl.TRIANGLES, this.segCount * 6, gl.UNSIGNED_INT, 0);
    this.segCount = 0;
  }

  /**
   * Screen-space segment. Colours are per-endpoint so callers can fade a line
   * into the distance without splitting it.
   */
  line2(x0, y0, x1, y1, w, r, g, b, a0, a1) {
    if (this.segCount >= MAX_SEG) {
      this.dropped++;
      return;
    }
    // Reject offscreen work early; the margin covers the halo.
    const m = w * 3 + 4;
    if ((x0 < -m && x1 < -m) || (x0 > this.width + m && x1 > this.width + m)) return;
    if ((y0 < -m && y1 < -m) || (y0 > this.height + m && y1 > this.height + m)) return;

    let dx = x1 - x0;
    let dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    // Widen the quad well past the core so the halo has room, and cap the ends
    // so zero-length segments still render as round dots.
    const hw = w * 2.3 + 0.75;
    const px = -dy * hw;
    const py = dx * hw;
    const ex = dx * hw * 0.55;
    const ey = dy * hw * 0.55;
    const ax = x0 - ex;
    const ay = y0 - ey;
    const bx = x1 + ex;
    const by = y1 + ey;

    const v = this.verts;
    let o = this.segCount * 4 * FLOATS_PER_VERT;
    v[o] = ax + px; v[o + 1] = ay + py; v[o + 2] = 1; v[o + 3] = r; v[o + 4] = g; v[o + 5] = b; v[o + 6] = a0; o += 7;
    v[o] = ax - px; v[o + 1] = ay - py; v[o + 2] = -1; v[o + 3] = r; v[o + 4] = g; v[o + 5] = b; v[o + 6] = a0; o += 7;
    v[o] = bx - px; v[o + 1] = by - py; v[o + 2] = -1; v[o + 3] = r; v[o + 4] = g; v[o + 5] = b; v[o + 6] = a1; o += 7;
    v[o] = bx + px; v[o + 1] = by + py; v[o + 2] = 1; v[o + 3] = r; v[o + 4] = g; v[o + 5] = b; v[o + 6] = a1;
    this.segCount++;
  }

  /** World-space point to view space. Returns depth; writes sx/sy on success. */
  project(x, y, z, out) {
    const dx = x - this.ex;
    const dy = y - this.ey;
    const dz = z - this.ez;
    const vz = dx * this.fx + dy * this.fy + dz * this.fz;
    if (vz < NEAR) return vz;
    const vx = dx * this.rx + dy * this.ry + dz * this.rz;
    const vy = dx * this.ux + dy * this.uy + dz * this.uz;
    const k = this.focal / vz;
    out[0] = this.cx + vx * k;
    out[1] = this.cy - vy * k;
    return vz;
  }

  /** Depth attenuation: things emerge out of the dark rather than popping in. */
  fogAt(vz) {
    if (vz >= this.far) return 0;
    if (vz <= this.fogNear) return 1;
    const t = 1 - (vz - this.fogNear) / (this.far - this.fogNear);
    return t * t;
  }

  /**
   * World-space segment. Handles the near plane by clipping rather than
   * skipping, so walls stay attached as they sweep past the camera.
   */
  line3(x0, y0, z0, x1, y1, z1, w, r, g, b, a = 1) {
    let ax = x0 - this.ex, ay = y0 - this.ey, az = z0 - this.ez;
    let bx = x1 - this.ex, by = y1 - this.ey, bz = z1 - this.ez;
    let az_ = ax * this.fx + ay * this.fy + az * this.fz;
    let bz_ = bx * this.fx + by * this.fy + bz * this.fz;

    if (az_ < NEAR && bz_ < NEAR) return;
    if (az_ > this.far && bz_ > this.far) return;

    if (az_ < NEAR) {
      const t = (NEAR - az_) / (bz_ - az_);
      ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t;
      az_ = NEAR;
    } else if (bz_ < NEAR) {
      const t = (NEAR - bz_) / (az_ - bz_);
      bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t;
      bz_ = NEAR;
    }

    const fa = this.fogAt(az_) * a;
    const fb = this.fogAt(bz_) * a;
    if (fa < 0.004 && fb < 0.004) return;

    const ka = this.focal / az_;
    const kb = this.focal / bz_;
    const sx0 = this.cx + (ax * this.rx + ay * this.ry + az * this.rz) * ka;
    const sy0 = this.cy - (ax * this.ux + ay * this.uy + az * this.uz) * ka;
    const sx1 = this.cx + (bx * this.rx + by * this.ry + bz * this.rz) * kb;
    const sy1 = this.cy - (bx * this.ux + by * this.uy + bz * this.uz) * kb;
    this.line2(sx0, sy0, sx1, sy1, w, r, g, b, fa, fb);
  }

  /** A world-space point drawn as a screen-sized dot (stars, sparks, tracers). */
  dot3(x, y, z, w, r, g, b, a = 1) {
    const p = _tmp;
    const vz = this.project(x, y, z, p);
    if (vz < NEAR || vz > this.far) return;
    const f = this.fogAt(vz) * a;
    if (f < 0.004) return;
    this.line2(p[0], p[1], p[0], p[1], w, r, g, b, f, f);
  }
}

const _tmp = [0, 0];
