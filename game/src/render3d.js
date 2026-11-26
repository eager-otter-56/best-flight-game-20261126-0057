// render3d.js — the 3D world painter: sky, sea, heightfield island, runway,
// ring gates, trees, harbour town, lighthouse and clouds, drawn far-to-near
// through a chase camera that follows the aircraft's heading, pitch and roll.

import { groundHeight, terrainColour, WORLD, LIGHTHOUSE } from './terrain.js';

export function makeCamera(plane, chase) {
  const back = chase ? 15.5 : 0.5;
  const up = chase ? 5.2 : 1.2;
  const fx = Math.sin(plane.heading) * Math.cos(plane.pitch);
  const fy = Math.sin(plane.pitch);
  const fz = -Math.cos(plane.heading) * Math.cos(plane.pitch);
  return {
    x: plane.x - fx * back,
    y: plane.y - fy * back + up,
    z: plane.z - fz * back,
    heading: plane.heading, pitch: plane.pitch, roll: plane.roll,
    fx, fy, fz,
    // the lens opens up as speed builds, so fast flight feels fast
    fovScale: 1 + Math.max(0, Math.min(0.30, (plane.speed - 38) / 220)),
  };
}

export function project(cam, w, h, x, y, z, out) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const ch = Math.cos(cam.heading);
  const sh = Math.sin(cam.heading);
  // world -> camera: forward is -z in world when heading is 0
  let cx = dx * ch - dz * sh;
  let cz = dx * sh + dz * ch;
  let cy = dy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const ny = cy * cp - (-cz) * sp;
  const nz = cy * sp + (-cz) * cp;
  cy = ny;
  cz = -nz;
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);
  const rx = cx * cr - cy * sr;
  const ry = cx * sr + cy * cr;
  cx = rx;
  cy = ry;
  if (cz >= -2) return null;
  const f = (h * 0.92 * (cam.fovScale || 1)) / -cz;
  out.x = w / 2 + cx * f;
  out.y = h * 0.46 - cy * f;
  out.s = f;
  out.depth = -cz;
  return out;
}

const P = [{}, {}, {}, {}];

function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawSky(ctx, w, h, cam, timeOfDay) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  if (timeOfDay === 'sunset') {
    g.addColorStop(0, '#2e3a67');
    g.addColorStop(0.45, '#b8573f');
    g.addColorStop(0.75, '#f2a65a');
    g.addColorStop(1, '#ffd9a0');
  } else {
    g.addColorStop(0, '#2f6fb4');
    g.addColorStop(0.55, '#79aedd');
    g.addColorStop(1, '#cfe8f7');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // sun disc, placed by the camera heading so turns move it across the sky
  const sunA = timeOfDay === 'sunset' ? -0.7 : 0.9;
  const rel = Math.atan2(Math.sin(sunA - cam.heading), Math.cos(sunA - cam.heading));
  const sx = w / 2 + rel * w * 0.42;
  const sy = timeOfDay === 'sunset' ? h * 0.34 : h * 0.16;
  const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
  sg.addColorStop(0, 'rgba(255,244,200,0.95)');
  sg.addColorStop(0.25, 'rgba(255,220,150,0.55)');
  sg.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx - 95, sy - 95, 190, 190);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sx, sy, timeOfDay === 'sunset' ? 26 : 19, 0, Math.PI * 2);
  ctx.fill();
}

function mixColour(colour, other, f) {
  let r; let g; let b;
  if (colour.startsWith('#')) {
    const a = parseInt(colour.slice(1), 16);
    r = (a >> 16) & 255; g = (a >> 8) & 255; b = a & 255;
  } else {
    const m = colour.match(/\d+(\.\d+)?/g);
    r = +m[0]; g = +m[1]; b = +m[2];
  }
  return `rgb(${Math.round(r + (other[0] - r) * f)},${Math.round(g + (other[1] - g) * f)},${Math.round(b + (other[2] - b) * f)})`;
}

function quadHash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function drawTerrain(ctx, w, h, cam, timeOfDay = 'day') {
  const RANGE = 3000;
  const STEP = 120;
  const fogRGB = timeOfDay === 'sunset' ? [240, 178, 138] : [178, 205, 228];
  const cx0 = Math.round(cam.x / STEP) * STEP;
  const cz0 = Math.round(cam.z / STEP) * STEP;
  const quads = [];
  for (let gx = -RANGE; gx < RANGE; gx += STEP) {
    for (let gz = -RANGE; gz < RANGE; gz += STEP) {
      const x = cx0 + gx;
      const z = cz0 + gz;
      const dx = x - cam.x;
      const dz = z - cam.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > RANGE * RANGE * 1.2) continue;
      quads.push({ x, z, d2 });
    }
  }
  quads.sort((a, b) => b.d2 - a.d2);
  const pt = [{}, {}, {}, {}];
  for (const q of quads) {
    const corners = [
      [q.x, q.z], [q.x + STEP, q.z], [q.x + STEP, q.z + STEP], [q.x, q.z + STEP],
    ];
    let ok = true;
    let hSum = 0;
    for (let i = 0; i < 4; i++) {
      const [vx, vz] = corners[i];
      const vh = Math.max(groundHeight(vx, vz), -6);
      hSum += vh;
      if (!project(cam, w, h, vx, vh, vz, pt[i])) { ok = false; break; }
    }
    if (!ok) continue;
    const hC = groundHeight(q.x + STEP / 2, q.z + STEP / 2);
    const slope = Math.abs(groundHeight(q.x + STEP, q.z) - groundHeight(q.x, q.z)) / STEP
      + Math.abs(groundHeight(q.x, q.z + STEP) - groundHeight(q.x, q.z)) / STEP;
    // directional sun shading: faces turned toward the low sun catch more light
    const sunSlope = (groundHeight(q.x + STEP, q.z) - groundHeight(q.x - STEP, q.z)) / (STEP * 2);
    const jitter = 0.94 + quadHash(q.x, q.z) * 0.12;
    const shade = Math.max(0.62, Math.min(1.14, (1 - slope * 0.30 - sunSlope * 0.55 + (hSum / 4) * 0.0004) * jitter));
    ctx.globalAlpha = 1;
    const base = shadeColour(terrainColour(hC, slope, q.x, q.z), shade);
    // aerial perspective: distance melts into the horizon haze
    const fogF = Math.min(0.62, Math.sqrt(q.d2) / 3400 * 0.72);
    poly(ctx, pt, mixColour(base, fogRGB, fogF));
    // sea sparkle: a lighter skim on open water far away
    if (hC < 2 && q.d2 > 900000) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function shadeColour(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f);
  const g = Math.min(255, ((n >> 8) & 255) * f);
  const b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function drawRunway(ctx, w, h, cam, t) {
  const rw = WORLD.runway;
  const half = rw.length / 2;
  const hw = rw.width / 2;
  const y = rw.elevation + 0.4;
  const corners = [
    [rw.x - hw, rw.z - half], [rw.x + hw, rw.z - half],
    [rw.x + hw, rw.z + half], [rw.x - hw, rw.z + half],
  ];
  const pts = [{}, {}, {}, {}];
  for (let i = 0; i < 4; i++) if (!project(cam, w, h, corners[i][0], y, corners[i][1], pts[i])) return;
  poly(ctx, pts, '#3c4147');
  ctx.strokeStyle = 'rgba(240,240,230,0.9)';
  ctx.lineWidth = Math.max(1, pts[0].s * 0.8);
  // centreline dashes
  const a = {};
  const b = {};
  for (let z = -half + 40; z < half - 40; z += 90) {
    if (project(cam, w, h, rw.x, y, rw.z + z, a) && project(cam, w, h, rw.x, y, rw.z + z + 42, b)) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // threshold bars at both ends
  for (const endZ of [-half + 14, half - 14]) {
    for (let bx = -hw + 5; bx < hw - 4; bx += 9) {
      const p1 = {};
      const p2 = {};
      if (project(cam, w, h, rw.x + bx, y, rw.z + endZ, p1) && project(cam, w, h, rw.x + bx + 4.5, y, rw.z + endZ, p2)) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = Math.max(1, p1.s * 1.6);
        ctx.stroke();
      }
    }
  }
  // edge lights, amber and lit
  const blink = 0.65 + 0.35 * Math.sin(t * 3);
  for (let z = -half; z <= half; z += 75) {
    for (const side of [-hw - 3, hw + 3]) {
      const p = {};
      if (project(cam, w, h, rw.x + side, y + 1, rw.z + z, p)) {
        ctx.fillStyle = `rgba(255,190,80,${blink})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, p.s * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // PAPI lights beside the near threshold: two white, two red when on glidepath
  for (let i = 0; i < 4; i++) {
    const p = {};
    if (project(cam, w, h, rw.x - hw - 12, y + 1.5, rw.z + half - 60 - i * 6, p)) {
      ctx.fillStyle = i < 2 ? '#ffffff' : '#ff4444';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.4, p.s * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawRing(ctx, w, h, cam, ring, state, t) {
  // A gate is a glowing torus facing the course direction (roughly toward the
  // next gate); drawn as two projected circles with radial spokes.
  const segs = 26;
  const pulse = state === 'next' ? 1 + 0.05 * Math.sin(t * 5) : 1;
  const colour = state === 'done' ? '#57e389' : state === 'next' ? '#ffb63d' : '#e8eef4';
  const inner = [];
  const outer = [];
  const tmp = {};
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const lx = Math.cos(a) * ring.r * pulse;
    const ly = Math.sin(a) * ring.r * pulse;
    if (!project(cam, w, h, ring.x + lx, ring.y + ly, ring.z, tmp)) return;
    inner.push({ x: tmp.x, y: tmp.y, s: tmp.s });
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, inner[0].s * 2.6);
  ctx.shadowColor = colour;
  ctx.shadowBlur = state === 'next' ? 16 : 5;
  ctx.beginPath();
  inner.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, inner[0].s * 0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  inner.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

export function drawScenery(ctx, w, h, cam, trees, town) {
  const items = [];
  for (const tr of trees) items.push({ kind: 'tree', x: tr.x, z: tr.z, y: tr.h, s: tr.s });
  for (const b of town) items.push({ kind: 'house', ...b, y: b.h });
  items.push({ kind: 'lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, y: LIGHTHOUSE.base });
  for (const it of items) {
    const dx = it.x - cam.x;
    const dz = it.z - cam.z;
    it.d2 = dx * dx + dz * dz;
  }
  items.sort((a, b) => b.d2 - a.d2);
  const p = {};
  for (const it of items) {
    if (it.d2 > 4200 * 4200 || it.d2 < 30 * 30) continue;
    if (!project(cam, w, h, it.x, it.y, it.z, p)) continue;
    const s = p.s;
    if (it.kind === 'tree') {
      const th = 26 * it.s * s;
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(p.x - s * 0.8, p.y - th * 0.35, s * 1.6, th * 0.35);
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - th);
      ctx.lineTo(p.x - th * 0.34, p.y - th * 0.3);
      ctx.lineTo(p.x + th * 0.34, p.y - th * 0.3);
      ctx.closePath();
      ctx.fill();
    } else if (it.kind === 'house') {
      const bw = it.w * s;
      const bh = it.tall * s;
      ctx.fillStyle = it.hue > 0.5 ? '#cfc4ae' : '#b8c4cc';
      ctx.fillRect(p.x - bw / 2, p.y - bh, bw, bh);
      ctx.fillStyle = '#8a4b38';
      ctx.beginPath();
      ctx.moveTo(p.x - bw * 0.62, p.y - bh);
      ctx.lineTo(p.x, p.y - bh * 1.35);
      ctx.lineTo(p.x + bw * 0.62, p.y - bh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,214,120,0.9)';
      const win = Math.max(1.5, s * 2.2);
      ctx.fillRect(p.x - bw * 0.28, p.y - bh * 0.62, win, win);
      ctx.fillRect(p.x + bw * 0.14, p.y - bh * 0.62, win, win);
    } else {
      const lh = 64 * s;
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(p.x - s * 3, p.y - lh, s * 6, lh);
      ctx.fillStyle = '#c33f31';
      ctx.fillRect(p.x - s * 3, p.y - lh * 0.78, s * 6, lh * 0.16);
      ctx.fillRect(p.x - s * 3, p.y - lh * 0.45, s * 6, lh * 0.16);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(p.x, p.y - lh - s * 2, Math.max(2, s * 2.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawClouds(ctx, w, h, cam, clouds, timeOfDay) {
  const p = {};
  const sorted = [...clouds].sort((a, b) => {
    const da = (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2;
    const db = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2;
    return db - da;
  });
  for (const c of sorted) {
    if (!project(cam, w, h, c.x, c.y, c.z, p)) continue;
    const r = c.s * p.s;
    if (r < 6 || r > 900) continue;
    ctx.fillStyle = timeOfDay === 'sunset' ? 'rgba(255,196,160,0.75)' : 'rgba(255,255,255,0.82)';
    for (const [ox, oy, orad] of [[0, 0, 1], [-0.55, 0.12, 0.66], [0.55, 0.1, 0.7], [0.1, -0.18, 0.6]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * r, p.y + oy * r * 0.4, r * orad, r * orad * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
