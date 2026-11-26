// glworld.js — the WebGL world renderer: a real 3D island.
//
// The Canvas-2D painter is replaced by an actual mesh pipeline: a smooth-
// shaded terrain mesh with sun shadows baked into its vertices and a
// procedural grain texture, flat-faceted towns/trees/lighthouse, torus ring
// gates, and a low-poly 3D aeroplane lit by the same sun. Depth is real
// (a depth buffer, not painter's order), which is where the sense of volume
// the painter could never produce comes from.
//
// HUD, cockpit and banners stay on the 2D overlay canvas; this module exposes
// a project() with the same contract so the overlay can keep up.

import { groundHeight, terrainColour, WORLD, RING_COURSE, LIGHTHOUSE } from './terrain.js';

// ---------- small mat4 helpers (column-major) ----------
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}
function lookAt(eye, center, up) {
  let zx = eye[0] - center[0]; let zy = eye[1] - center[1]; let zz = eye[2] - center[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy; let xy = up[2] * zx - up[0] * zz; let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy; const yy = zz * xx - zx * xz; const yz = zx * xy - zy * xx;
  const out = new Float32Array(16);
  out[0] = xx; out[1] = yx; out[2] = zx;
  out[4] = xy; out[5] = yy; out[6] = zy;
  out[8] = xz; out[9] = yz; out[10] = zz;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}
function basisMatrix(px, py, pz, xA, yA, zA) {
  const out = new Float32Array(16);
  out[0] = xA[0]; out[1] = xA[1]; out[2] = xA[2];
  out[4] = yA[0]; out[5] = yA[1]; out[6] = yA[2];
  out[8] = zA[0]; out[9] = zA[1]; out[10] = zA[2];
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
}
const IDENTITY = basisMatrix(0, 0, 0, [1, 0, 0], [0, 1, 0], [0, 0, 1]);

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------- geometry accumulators ----------
// Flat: non-indexed triangles, face normals — crisp facets.
class FlatGeo {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  tri(a, b, c, color) {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(color[0], color[1], color[2]); }
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  box(cx, cy, cz, sx, sy, sz, color) {
    const x0 = cx - sx / 2; const x1 = cx + sx / 2;
    const y0 = cy - sy / 2; const y1 = cy + sy / 2;
    const z0 = cz - sz / 2; const z1 = cz + sz / 2;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], color); // bottom
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color); // back (-z)
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color); // front (+z)
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color); // left
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color); // right
  }
  coneY(cx, baseY, cz, radius, height, seg, color) {
    const apex = [cx, baseY + height, cz];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2; const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([cx + Math.cos(a0) * radius, baseY, cz + Math.sin(a0) * radius],
        [cx + Math.cos(a1) * radius, baseY, cz + Math.sin(a1) * radius], apex, color);
    }
  }
  cylinderY(cx, baseY, cz, r0, r1, height, seg, color) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2; const a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = [cx + Math.cos(a0) * r0, baseY, cz + Math.sin(a0) * r0];
      const b1 = [cx + Math.cos(a1) * r0, baseY, cz + Math.sin(a1) * r0];
      const t0 = [cx + Math.cos(a0) * r1, baseY + height, cz + Math.sin(a0) * r1];
      const t1 = [cx + Math.cos(a1) * r1, baseY + height, cz + Math.sin(a1) * r1];
      this.quad(b0, b1, t1, t0, color);
    }
  }
}

// ---------- shaders ----------
const MESH_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aShade;
uniform mat4 uMVP; uniform mat4 uModel; uniform vec3 uSunDir; uniform float uAmbient;
varying vec3 vCol; varying float vLight; varying vec3 vWorld; varying float vShade;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorld = wp.xyz;
  vec3 n = normalize(mat3(uModel) * aNor);
  vLight = uAmbient + (1.0 - uAmbient) * max(dot(n, uSunDir), 0.0);
  vCol = aCol; vShade = aShade;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;
const MESH_FS = `
precision mediump float;
varying vec3 vCol; varying float vLight; varying vec3 vWorld; varying float vShade;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uCamPos; uniform sampler2D uTex; uniform float uTexAmt;
uniform vec3 uTint; uniform float uAlpha; uniform float uFlat;
void main() {
  vec3 base = vCol * uTint;
  float grain = texture2D(uTex, vWorld.xz * 0.013).r;
  base *= 1.0 + (grain - 0.5) * uTexAmt;
  float li = mix(vLight, 1.0, uFlat);
  vec3 c = base * li * vShade;
  float d = distance(vWorld, uCamPos);
  float f = smoothstep(uFogNear, uFogFar, d);
  gl_FragColor = vec4(mix(c, uFogColor, f), uAlpha);
}`;
const SKY_VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
varying vec3 vDir;
void main() { vDir = aPos; vec4 p = uMVP * vec4(aPos, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
precision mediump float;
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol;
void main() {
  vec3 d = normalize(vDir);
  float t = pow(max(d.y, 0.0), 0.38);
  vec3 c = mix(uHorizon, uTop, t);
  if (d.y < 0.0) c = uHorizon;
  // forward-scatter glow hugging the horizon, strongest toward the sun
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-5));
  float toward = 0.35 + 0.65 * max(dot(dxz, sxz), 0.0);
  c += uSunCol * pow(max(1.0 - abs(d.y), 0.0), 6.0) * 0.13 * toward;
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 600.0) * 1.4 + pow(s, 10.0) * 0.20);
  gl_FragColor = vec4(c, 1.0);
}`;
const SPRITE_VS = `
attribute vec3 aPos; attribute vec2 aUV;
varying vec2 vUV;
uniform mat4 uVP;
void main() { vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); }`;
const SPRITE_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex; uniform vec3 uTint; uniform float uAlpha;
void main() {
  vec4 tx = texture2D(uTex, vUV);
  gl_FragColor = vec4(uTint, tx.a * uAlpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function makeTexture(gl, size, painter) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  painter(cv.getContext('2d'), size);
  const tx = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tx;
}

// ---------- world geometry builders ----------
const SUN_DAY = (() => {
  const el = 0.60; const az = 0.9;
  const v = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

function buildTerrain() {
  const EXT = 3520; const SEG = 176; const step = (EXT * 2) / SEG;
  const pos = []; const nor = []; const col = []; const shade = []; const idx = [];
  const sunXZ = Math.hypot(SUN_DAY[0], SUN_DAY[2]);
  const sunSlope = SUN_DAY[1] / sunXZ;
  const sunDX = SUN_DAY[0] / sunXZ; const sunDZ = SUN_DAY[2] / sunXZ;
  for (let j = 0; j <= SEG; j++) {
    for (let i = 0; i <= SEG; i++) {
      const x = -EXT + i * step;
      const z = -EXT + j * step;
      const h = groundHeight(x, z);
      const dhx = (groundHeight(x + step, z) - groundHeight(x - step, z)) / (2 * step);
      const dhz = (groundHeight(x, z + step) - groundHeight(x, z - step)) / (2 * step);
      let nx = -dhx; let ny = 1; let nz = -dhz;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const slope = Math.hypot(dhx, dhz);
      const c = hexRGB(terrainColour(h, slope, x, z));
      // jitter so the bands do not read as flat paint
      const j1 = 0.94 + ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.12;
      let sh = 1;
      if (h > 2) {
        for (let k = 1; k <= 11; k++) {
          const d = k * 48;
          if (groundHeight(x + sunDX * d, z + sunDZ * d) > h + d * sunSlope) { sh = 0.64; break; }
        }
      }
      pos.push(x, h, z); nor.push(nx, ny, nz);
      col.push(c[0] * j1, c[1] * j1, c[2] * j1); shade.push(sh);
    }
  }
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i; const b = a + 1; const c = a + SEG + 1; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, nor, col, shade, idx };
}

function buildStatic(trees, town) {
  const g = new FlatGeo();
  // runway strip on its bench, with dashes and thresholds
  const rw = WORLD.runway;
  const asphalt = hexRGB('#33373c'); const white = hexRGB('#e8e8e8');
  const zA = rw.z - rw.length / 2; const zB = rw.z + rw.length / 2;
  const x0 = rw.x - rw.width / 2; const x1 = rw.x + rw.width / 2;
  const segLen = 57.5;
  for (let z = zA; z < zB; z += segLen) {
    g.quad([x0, 14.3, z + segLen], [x1, 14.3, z + segLen], [x1, 14.3, z], [x0, 14.3, z], asphalt);
  }
  for (let z = zA + 40; z < zB - 30; z += 46) {
    g.quad([rw.x - 0.9, 14.42, z + 15], [rw.x + 0.9, 14.42, z + 15], [rw.x + 0.9, 14.42, z], [rw.x - 0.9, 14.42, z], white);
  }
  for (const zEnd of [zA + 6, zB - 22]) {
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      const bx = rw.x + k * 8;
      g.quad([bx - 2.4, 14.42, zEnd + 16], [bx + 2.4, 14.42, zEnd + 16], [bx + 2.4, 14.42, zEnd], [bx - 2.4, 14.42, zEnd], white);
    }
  }
  // harbour town: flat-faceted blocks with prism roofs
  const walls = ['#e8e0cc', '#dfd3b8', '#e5d7c5', '#d9c9a8', '#e2d8c8'].map(hexRGB);
  const roofs = ['#a5502f', '#8a4a34', '#7a4a3a', '#96502e'].map(hexRGB);
  for (const b of town) {
    const wall = walls[Math.floor(b.hue * walls.length) % walls.length];
    const roof = roofs[Math.floor(b.hue * roofs.length) % roofs.length];
    const y0 = b.h - 1; const y1 = b.h + b.tall;
    g.box(b.x, (y0 + y1) / 2, b.z, b.w, b.tall + 1, b.d, wall);
    const rh = b.tall * 0.30; const hw = b.w / 2; const hd = b.d / 2;
    g.quad([b.x - hw, y1, b.z - hd], [b.x - hw, y1, b.z + hd], [b.x, y1 + rh, b.z + hd], [b.x, y1 + rh, b.z - hd], roof);
    g.quad([b.x + hw, y1, b.z + hd], [b.x + hw, y1, b.z - hd], [b.x, y1 + rh, b.z - hd], [b.x, y1 + rh, b.z + hd], roof);
    g.tri([b.x - hw, y1, b.z - hd], [b.x, y1 + rh, b.z - hd], [b.x + hw, y1, b.z - hd], roof);
    g.tri([b.x + hw, y1, b.z + hd], [b.x, y1 + rh, b.z + hd], [b.x - hw, y1, b.z + hd], roof);
  }
  // pines: trunk and two cones, greens varied per tree
  const trunk = hexRGB('#6b4a2f');
  trees.forEach((tr, i) => {
    const v = 0.9 + (i % 5) * 0.07;
    const green = hexRGB('#2f6b2f').map((c) => Math.min(1, c * v));
    const green2 = hexRGB('#3a7d33').map((c) => Math.min(1, c * v));
    g.box(tr.x, tr.h + 2.2 * tr.s, tr.z, 1.1 * tr.s, 4.6 * tr.s, 1.1 * tr.s, trunk);
    g.coneY(tr.x, tr.h + 3.4 * tr.s, tr.z, 5.6 * tr.s, 10.5 * tr.s, 7, green);
    g.coneY(tr.x, tr.h + 8.8 * tr.s, tr.z, 3.8 * tr.s, 7.6 * tr.s, 7, green2);
  });
  // lighthouse: white tower, red band, dark lamp room
  const lh = LIGHTHOUSE;
  g.cylinderY(lh.x, lh.base, lh.z, 5.4, 4.0, 25, 12, hexRGB('#eef0ee'));
  g.cylinderY(lh.x, lh.base + 10, lh.z, 4.85, 4.55, 5.5, 12, hexRGB('#c33f2e'));
  g.cylinderY(lh.x, lh.base + 25, lh.z, 2.7, 2.7, 3.6, 8, hexRGB('#2c3138'));
  g.coneY(lh.x, lh.base + 28.6, lh.z, 3.4, 2.6, 8, hexRGB('#2c3138'));
  return g;
}

function buildAircraft() {
  const g = new FlatGeo();
  const cream = hexRGB('#ece7db'); const orange = hexRGB('#d8542e');
  const darkOrange = hexRGB('#b23f1e'); const glass = hexRGB('#2c5a78');
  g.box(0, 0, -6, 2.3, 2.5, 6, cream);          // nose section
  g.box(0, 0.1, 0, 2.8, 3.0, 6.4, cream);       // cabin section
  g.box(0, 0.45, 5.9, 1.7, 1.9, 5.6, cream);    // tail cone
  g.box(0, -0.35, -0.2, 2.86, 0.55, 7.6, orange); // cheatline shell
  g.box(0, 1.78, -2.6, 2.1, 1.0, 3.6, glass);   // canopy
  g.box(0, 1.85, -0.7, 23.6, 0.55, 3.4, orange); // main wing
  g.box(-11.6, 1.85, -0.7, 1.0, 0.6, 3.4, cream);
  g.box(11.6, 1.85, -0.7, 1.0, 0.6, 3.4, cream);
  g.box(0, 0.75, 8.3, 8.6, 0.4, 2.3, orange);   // tailplane
  g.box(0, 2.1, 8.3, 0.5, 2.9, 2.5, darkOrange); // fin
  // spinner cone (apex forward)
  const dark = hexRGB('#33383e');
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2; const a1 = ((i + 1) / 10) * Math.PI * 2;
    g.tri([0, 0, -10.6],
      [Math.cos(a1) * 0.62, Math.sin(a1) * 0.62, -9.0],
      [Math.cos(a0) * 0.62, Math.sin(a0) * 0.62, -9.0], dark);
  }
  const gear = new FlatGeo();
  const wheel = hexRGB('#22252a');
  gear.box(-1.6, -2.3, -0.9, 0.3, 2.4, 0.3, dark);
  gear.box(1.6, -2.3, -0.9, 0.3, 2.4, 0.3, dark);
  for (const sx of [-1.6, 1.6]) {
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2; const a1 = ((i + 1) / 10) * Math.PI * 2;
      const p = (a, xx) => [xx, -3.55 + Math.cos(a) * 0.9, -0.9 + Math.sin(a) * 0.9];
      gear.quad(p(a0, sx - 0.26), p(a1, sx - 0.26), p(a1, sx + 0.26), p(a0, sx + 0.26), wheel);
    }
  }
  const blades = new FlatGeo();
  blades.box(0, 0, 0, 0.34, 5.8, 0.14, dark);
  const disc = new FlatGeo();
  for (let i = 0; i < 18; i++) {
    const a0 = (i / 18) * Math.PI * 2; const a1 = ((i + 1) / 18) * Math.PI * 2;
    disc.tri([0, 0, 0], [Math.cos(a0) * 2.9, Math.sin(a0) * 2.9, 0], [Math.cos(a1) * 2.9, Math.sin(a1) * 2.9, 0], hexRGB('#2a2c30'));
  }
  return { body: g, gear, blades, disc };
}

function buildRingGeo() {
  const g = new FlatGeo();
  const white = [1, 1, 1];
  const R = 1; const tube = 0.040; const SEG = 26; const TSEG = 7;
  const pt = (i, j) => {
    const th = (i / SEG) * Math.PI * 2; const ph = (j / TSEG) * Math.PI * 2;
    const rr = R + tube * Math.cos(ph);
    return [rr * Math.cos(th), rr * Math.sin(th), tube * Math.sin(ph)];
  };
  for (let i = 0; i < SEG; i++) for (let j = 0; j < TSEG; j++) {
    g.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), white);
  }
  return g;
}

function buildSkyGeo() {
  const pos = [];
  const LON = 24; const LAT = 12;
  const pt = (i, j) => {
    const th = (i / LON) * Math.PI * 2; const ph = (j / LAT) * Math.PI - Math.PI / 2;
    return [Math.cos(th) * Math.cos(ph), Math.sin(ph), -Math.sin(th) * Math.cos(ph)];
  };
  for (let i = 0; i < LON; i++) for (let j = 0; j < LAT; j++) {
    const a = pt(i, j); const b = pt(i + 1, j); const c = pt(i + 1, j + 1); const d = pt(i, j + 1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return new Float32Array(pos);
}

// ---------- the renderer ----------
function translation(x, y, z) { return basisMatrix(x, y, z, [1, 0, 0], [0, 1, 0], [0, 0, 1]); }
function rotZ(a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return basisMatrix(0, 0, 0, [c, s, 0], [-s, c, 0], [0, 0, 1]);
}
function scaleBasis(xA, yA, zA, s) { return [xA.map((v) => v * s), yA.map((v) => v * s), zA.map((v) => v * s)]; }

const TOD = {
  day: {
    sun: SUN_DAY, ambient: 0.50, fog: [0.75, 0.86, 0.95], fogNear: 500, fogFar: 4600,
    skyTop: [0.13, 0.36, 0.66], skyHor: [0.75, 0.86, 0.95], sunCol: [1.0, 0.9, 0.65], cloud: [1, 1, 1],
  },
  sunset: {
    sun: (() => { const v = [-0.63, 0.14, -0.75]; const l = Math.hypot(...v); return v.map((c) => c / l); })(),
    ambient: 0.40, fog: [0.98, 0.62, 0.36], fogNear: 350, fogFar: 5200,
    skyTop: [0.16, 0.20, 0.38], skyHor: [0.98, 0.62, 0.36], sunCol: [1.0, 0.62, 0.35], cloud: [1.0, 0.78, 0.66],
  },
};

export function createGLWorld(canvas, { trees, town, clouds }) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return null;
  // the terrain index buffer needs 32-bit indices (WebGL1 extension)
  if (!gl.getExtension('OES_element_index_uint')) return null;
  const W = canvas.width; const H = canvas.height;

  let meshProg; let skyProg; let spriteProg;
  try {
    meshProg = program(gl, MESH_VS, MESH_FS);
    skyProg = program(gl, SKY_VS, SKY_FS);
    spriteProg = program(gl, SPRITE_VS, SPRITE_FS);
  } catch (e) {
    return null;
  }
  const MU = {};
  for (const n of ['uMVP', 'uModel', 'uSunDir', 'uAmbient', 'uFogColor', 'uFogNear', 'uFogFar', 'uCamPos', 'uTex', 'uTexAmt', 'uTint', 'uAlpha', 'uFlat']) MU[n] = gl.getUniformLocation(meshProg, n);
  const MA = {};
  for (const n of ['aPos', 'aNor', 'aCol', 'aShade']) MA[n] = gl.getAttribLocation(meshProg, n);
  const SU = {};
  for (const n of ['uMVP', 'uTop', 'uHorizon', 'uSunDir', 'uSunCol']) SU[n] = gl.getUniformLocation(skyProg, n);
  const SA = gl.getAttribLocation(skyProg, 'aPos');
  const PU = {};
  for (const n of ['uVP', 'uTex', 'uTint', 'uAlpha']) PU[n] = gl.getUniformLocation(spriteProg, n);
  const PA = { aPos: gl.getAttribLocation(spriteProg, 'aPos'), aUV: gl.getAttribLocation(spriteProg, 'aUV') };

  function uploadMesh(geo, shadeArr, idxArr) {
    const n = geo.pos.length / 3;
    const shade = shadeArr || new Array(n).fill(1);
    const mk = (arr, type) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return b;
    };
    const m = { pos: mk(geo.pos), nor: mk(geo.nor), col: mk(geo.col), shade: mk(shade), count: idxArr ? idxArr.length : n, idx: null };
    if (idxArr) {
      m.idx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idxArr), gl.STATIC_DRAW);
    }
    return m;
  }
  const terrainData = buildTerrain();
  const terrainMesh = uploadMesh(terrainData, terrainData.shade, terrainData.idx);
  const staticMesh = uploadMesh(buildStatic(trees, town));
  const ac = buildAircraft();
  const acMesh = uploadMesh(ac.body);
  const gearMesh = uploadMesh(ac.gear);
  const bladeMesh = uploadMesh(ac.blades);
  const discMesh = uploadMesh(ac.disc);
  const ringMesh = uploadMesh(buildRingGeo());
  const seaGeo = new FlatGeo();
  seaGeo.quad([-7200, 0.7, 7200], [7200, 0.7, 7200], [7200, 0.7, -7200], [-7200, 0.7, -7200], hexRGB('#17617f'));
  const seaMesh = uploadMesh(seaGeo);
  const blobGeo = new FlatGeo();
  blobGeo.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 0, 0]);
  const blobMesh = uploadMesh(blobGeo);
  const skyPos = buildSkyGeo();
  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, skyPos, gl.STATIC_DRAW);

  const grainTex = makeTexture(gl, 128, (c2, s) => {
    const img = c2.createImageData(s, s);
    let seed = 777;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 104 + Math.floor(rnd() * 48);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
  });
  const cloudTex = makeTexture(gl, 256, (c2, s) => {
    c2.clearRect(0, 0, s, s);
    const blobs = [[0.5, 0.55, 0.34], [0.3, 0.6, 0.24], [0.7, 0.6, 0.26], [0.42, 0.45, 0.22], [0.6, 0.44, 0.2], [0.5, 0.66, 0.26]];
    for (const [bx, by, br] of blobs) {
      const g = c2.createRadialGradient(bx * s, by * s, 2, bx * s, by * s, br * s);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c2.fillStyle = g;
      c2.fillRect(0, 0, s, s);
    }
  });
  gl.bindTexture(gl.TEXTURE_2D, cloudTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const cloudPos = gl.createBuffer();
  const cloudUV = gl.createBuffer();
  const cloudPosArr = new Float32Array(clouds.length * 18 * 3);
  const cloudUVArr = new Float32Array(clouds.length * 18 * 2);

  let lastVP = null; let lastCamPos = [0, 0, 0]; let lastFwd = [0, 0, -1];

  function bindMesh(m) {
    const bind = (buf, loc, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bind(m.pos, MA.aPos, 3); bind(m.nor, MA.aNor, 3); bind(m.col, MA.aCol, 3); bind(m.shade, MA.aShade, 1);
    if (m.idx) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  }
  function drawMesh(m, model, vp, opts) {
    bindMesh(m);
    gl.uniformMatrix4fv(MU.uMVP, false, multiply(vp, model));
    gl.uniformMatrix4fv(MU.uModel, false, model);
    gl.uniform3fv(MU.uTint, opts.tint || [1, 1, 1]);
    gl.uniform1f(MU.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
    gl.uniform1f(MU.uFlat, opts.flat || 0);
    gl.uniform1f(MU.uTexAmt, opts.texAmt || 0);
    if (m.idx) gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }

  function draw({ plane, camPlane, timeOfDay, ringStatus, t }) {
    const tod = TOD[timeOfDay] || TOD.day;
    const h = camPlane.heading; const cpt = camPlane.pitch;
    const cf = [Math.sin(h) * Math.cos(cpt), Math.sin(cpt), -Math.cos(h) * Math.cos(cpt)];
    const eye = [plane.x - cf[0] * 30, plane.y - cf[1] * 30 + 7.5, plane.z - cf[2] * 30];
    const center = [plane.x + cf[0] * 40, plane.y + cf[1] * 40, plane.z + cf[2] * 40];
    let rx = -cf[2]; let rz = cf[0];
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const A = camPlane.roll * 0.55;
    const up = [rx * Math.sin(A), Math.cos(A), rz * Math.sin(A)];
    const view = lookAt(eye, center, up);
    const fovScale = 1 + Math.max(0, Math.min(0.30, (plane.speed - 38) / 220));
    const fovY = 2 * Math.atan(Math.tan(0.541) / fovScale);
    const vp = multiply(perspective(fovY, W / H, 0.5, 12000), view);
    lastVP = vp; lastCamPos = eye; lastFwd = cf;
    // camera basis for billboards
    const camRight = [view[0], view[4], view[8]];
    const camUp = [view[1], view[5], view[9]];

    gl.viewport(0, 0, W, H);
    gl.clearColor(tod.fog[0], tod.fog[1], tod.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // sky dome (depth pinned to the far plane)
    gl.useProgram(skyProg);
    gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(SA);
    gl.vertexAttribPointer(SA, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(SU.uMVP, false, multiply(vp, translation(eye[0], eye[1], eye[2])));
    gl.uniform3fv(SU.uTop, tod.skyTop); gl.uniform3fv(SU.uHorizon, tod.skyHor);
    gl.uniform3fv(SU.uSunDir, tod.sun); gl.uniform3fv(SU.uSunCol, tod.sunCol);
    gl.drawArrays(gl.TRIANGLES, 0, skyPos.length / 3);
    gl.depthMask(true); gl.depthFunc(gl.LESS);

    // lit meshes
    gl.useProgram(meshProg);
    gl.uniform3fv(MU.uSunDir, tod.sun);
    gl.uniform1f(MU.uAmbient, tod.ambient);
    gl.uniform3fv(MU.uFogColor, tod.fog);
    gl.uniform1f(MU.uFogNear, tod.fogNear); gl.uniform1f(MU.uFogFar, tod.fogFar);
    gl.uniform3fv(MU.uCamPos, eye);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, grainTex);
    gl.uniform1i(MU.uTex, 0);

    drawMesh(terrainMesh, IDENTITY, vp, { texAmt: 0.5 });
    // the sea is opaque: distance fog melts it into the horizon colour,
    // which is what keeps the horizon seamless at sunset
    drawMesh(seaMesh, IDENTITY, vp, { texAmt: 0.15, flat: 0.15, alpha: 1 });
    drawMesh(staticMesh, IDENTITY, vp, { texAmt: 0.12 });

    // aeroplane ground shadow
    const agl = plane.y - groundHeight(plane.x, plane.z);
    if (agl < 260) {
      const alpha = Math.max(0, 0.40 - agl * 0.0014);
      const rgt = [Math.cos(plane.heading), 0, Math.sin(plane.heading)];
      const back = [Math.sin(plane.heading), 0, -Math.cos(plane.heading)];
      const m = basisMatrix(plane.x, groundHeight(plane.x, plane.z) + 0.4, plane.z,
        rgt.map((v) => v * 30), [0, 1, 0], back.map((v) => v * 13));
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawMesh(blobMesh, m, vp, { flat: 1, alpha });
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    // ring gates
    RING_COURSE.forEach((ring, i) => {
      const prev = RING_COURSE[Math.max(0, i - 1)];
      const next = RING_COURSE[Math.min(RING_COURSE.length - 1, i + 1)];
      let dx = next.x - prev.x; let dy = next.y - prev.y; let dz = next.z - prev.z;
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      let xx = dz; let xz = -dx; // cross([0,1,0], dir) = (dir.z, 0, -dir.x)... use (dz, 0, -dx)
      const xl = Math.hypot(xx, xz) || 1; xx /= xl; xz /= xl;
      const xA = [xx, 0, xz];
      const yAc = [
        dy * xA[2] - dz * xA[1],
        dz * xA[0] - dx * xA[2],
        dx * xA[1] - dy * xA[0],
      ];
      const st = ringStatus[i];
      const pulse = st === 'next' ? 1 + 0.05 * Math.sin(t * 5) : 1;
      const s = ring.r * pulse;
      const tint = st === 'done' ? [0.34, 0.89, 0.54] : st === 'next' ? [1.0, 0.71, 0.24] : [0.72, 0.78, 0.84];
      const m = basisMatrix(ring.x, ring.y, ring.z,
        xA.map((v) => v * s), yAc.map((v) => v * s), [dx * s, dy * s, dz * s]);
      drawMesh(ringMesh, m, vp, { tint, flat: 0.45 });
    });

    // the aeroplane, posed by attitude (nose first, path follows)
    const att = plane.att !== undefined ? plane.att : plane.pitch;
    const ph = plane.heading;
    const f = [Math.sin(ph) * Math.cos(att), Math.sin(att), -Math.cos(ph) * Math.cos(att)];
    let arx = -f[2]; let arz = f[0];
    const al = Math.hypot(arx, arz) || 1; arx /= al; arz /= al;
    const r0 = [arx, 0, arz];
    const u0 = [
      r0[1] * f[2] - r0[2] * f[1],
      r0[2] * f[0] - r0[0] * f[2],
      r0[0] * f[1] - r0[1] * f[0],
    ];
    const cr = Math.cos(plane.roll); const sr = Math.sin(plane.roll);
    const rP = r0.map((v, i) => v * cr - u0[i] * sr);
    const uP = u0.map((v, i) => v * cr + r0[i] * sr);
    const acModel = basisMatrix(plane.x, plane.y, plane.z, rP, uP, f.map((v) => -v));
    drawMesh(acMesh, acModel, vp, { texAmt: 0.05 });
    if (plane.gearDown) drawMesh(gearMesh, acModel, vp, { texAmt: 0.05 });
    const propBase = multiply(acModel, translation(0, 0.1, -9.9));
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawMesh(discMesh, multiply(acModel, translation(0, 0.1, -10.05)), vp, { flat: 1, alpha: 0.18 });
    gl.depthMask(true); gl.disable(gl.BLEND);
    drawMesh(bladeMesh, multiply(propBase, rotZ(t * 42)), vp, { texAmt: 0 });

    // clouds: camera-facing sprite quads, far to near
    const sorted = [...clouds].sort((a, b) =>
      ((b.x - eye[0]) ** 2 + (b.z - eye[2]) ** 2) - ((a.x - eye[0]) ** 2 + (a.z - eye[2]) ** 2));
    let vp3 = 0; let vu2 = 0;
    const blobs = [[0, 0, 1], [-0.42, -0.05, 0.68], [0.44, -0.03, 0.74]];
    for (const c of sorted) {
      for (const [ox, oy, os] of blobs) {
        const cxp = c.x + camRight[0] * ox * c.s + camUp[0] * oy * c.s;
        const cyp = c.y + camRight[1] * ox * c.s + camUp[1] * oy * c.s;
        const czp = c.z + camRight[2] * ox * c.s + camUp[2] * oy * c.s;
        const rw2 = c.s * 0.55 * os; const rh2 = c.s * 0.24 * os;
        const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
        for (const [sx, sy, u, v] of corners) {
          cloudPosArr[vp3++] = cxp + camRight[0] * sx * rw2 + camUp[0] * sy * rh2;
          cloudPosArr[vp3++] = cyp + camRight[1] * sx * rw2 + camUp[1] * sy * rh2;
          cloudPosArr[vp3++] = czp + camRight[2] * sx * rw2 + camUp[2] * sy * rh2;
          cloudUVArr[vu2++] = u; cloudUVArr[vu2++] = v;
        }
      }
    }
    gl.useProgram(spriteProg);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudPos);
    gl.bufferData(gl.ARRAY_BUFFER, cloudPosArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(PA.aPos);
    gl.vertexAttribPointer(PA.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudUV);
    gl.bufferData(gl.ARRAY_BUFFER, cloudUVArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(PA.aUV);
    gl.vertexAttribPointer(PA.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(PU.uVP, false, vp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    gl.uniform1i(PU.uTex, 0);
    gl.uniform3fv(PU.uTint, tod.cloud);
    gl.uniform1f(PU.uAlpha, 0.85);
    gl.drawArrays(gl.TRIANGLES, 0, vp3 / 3);
    gl.depthMask(true); gl.disable(gl.BLEND);

    return true;
  }

  function project(x, y, z, out) {
    if (!lastVP) return null;
    const m = lastVP;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const depth = (x - lastCamPos[0]) * lastFwd[0] + (y - lastCamPos[1]) * lastFwd[1] + (z - lastCamPos[2]) * lastFwd[2];
    if (w < 1.5 || depth < 2) return null;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    out.x = (cx / w + 1) / 2 * W;
    out.y = (1 - (cy / w + 1) / 2) * H;
    out.s = (H * 0.92) / depth;
    out.depth = depth;
    return out;
  }

  return { draw, project };
}
