// terrain.js — the island world of Sky Harbor Run: an analytic heightfield,
// a flattened runway strip, a ring course, trees, a harbour town and a lighthouse.
// Everything is generated from a fixed seed so every pilot flies the same island.

export const WORLD = {
  islandRadius: 4200,
  seaLevel: 0,
  runway: { x: 0, z: 1750, length: 1150, width: 46, headingDeg: 0, elevation: 14 },
};

const ridges = [
  { x: -900, z: -700, r: 1250, h: 430 },
  { x: 350, z: -1250, r: 1000, h: 520 },
  { x: 1150, z: -250, r: 850, h: 330 },
  { x: -350, z: 250, r: 700, h: 210 },
  { x: -1650, z: 350, r: 800, h: 260 },
  { x: 800, z: 750, r: 650, h: 150 },
];

function gauss(x, z, cx, cz, r) {
  const dx = x - cx;
  const dz = z - cz;
  const d2 = (dx * dx + dz * dz) / (r * r);
  return Math.exp(-d2 * 2.2);
}

function hashNoise(x, z) {
  const s = Math.sin(x * 0.011 + z * 0.017) * Math.cos(z * 0.013 - x * 0.007);
  const t = Math.sin(x * 0.045 - z * 0.031) * 0.5;
  return s * 26 + t * 9;
}

// Height of the ground in metres at world (x, z). The sea is 0 and dry land
// rises out of it; the runway bench is carved perfectly flat.
export function groundHeight(x, z) {
  const d = Math.hypot(x, z);
  const falloff = Math.max(0, 1 - Math.pow(d / WORLD.islandRadius, 3));
  let h = -34 + falloff * 60;
  for (const r of ridges) h += r.h * gauss(x, z, r.x, r.z, r.r) * Math.min(1, falloff + 0.25);
  h += hashNoise(x, z) * Math.max(0, Math.min(1, falloff * 1.6));
  const rw = WORLD.runway;
  const along = Math.abs(z - rw.z);
  const across = Math.abs(x - rw.x);
  const bench = Math.max(0, 1 - Math.max(along / (rw.length / 2 + 190), across / (rw.width / 2 + 150)));
  const flat = Math.min(1, bench * 3);
  return h * (1 - flat) + rw.elevation * flat;
}

// Colour band for a height/slope pair — one painterly style from reef to snow.
export function terrainColour(h, slope, x, z) {
  if (h < 2) return '#1d6f8e';
  if (h < 9) return '#3d9db4';
  if (h < 16) return '#d9c184';
  if (slope > 0.62) return '#8a7a63';
  if (h < 120) return (Math.sin(x * 0.02) + Math.cos(z * 0.023) > 0.6) ? '#69a84f' : '#5c9a45';
  if (h < 260) return '#4c7d3a';
  if (h < 545) return '#7d7466';
  return '#e8ecf0';
}

// The eight gates of the Ring Runner course, in flying order.
export const RING_COURSE = [
  { x: 0, z: 700, y: 120, r: 62 },
  { x: -420, z: -150, y: 210, r: 62 },
  { x: -980, z: -780, y: 330, r: 66 },
  { x: -250, z: -1350, y: 430, r: 66 },
  { x: 620, z: -1150, y: 390, r: 66 },
  { x: 1150, z: -300, y: 300, r: 62 },
  { x: 700, z: 450, y: 190, r: 62 },
  { x: 150, z: 1150, y: 110, r: 62 },
];

export function buildTrees() {
  const trees = [];
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 640; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 250 + rnd() * 3400;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = groundHeight(x, z);
    if (h > 20 && h < 300 && Math.abs(x) > 130) trees.push({ x, z, h, s: 0.7 + rnd() * 0.9 });
  }
  return trees;
}

export function buildTown() {
  const blocks = [];
  let seed = 987654;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 46; i++) {
    const x = -620 + rnd() * 420;
    const z = 2050 + rnd() * 620;
    const h = groundHeight(x, z);
    if (h < 4) continue;
    blocks.push({ x, z, h, w: 22 + rnd() * 26, d: 22 + rnd() * 26, tall: 12 + rnd() * 30, hue: rnd() });
  }
  return blocks;
}

export const LIGHTHOUSE = { x: 2350, z: 2350, base: 0 };
LIGHTHOUSE.base = Math.max(6, groundHeight(LIGHTHOUSE.x, LIGHTHOUSE.z));

export function buildClouds() {
  const clouds = [];
  let seed = 424242;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rnd() - 0.5) * 9000,
      z: (rnd() - 0.5) * 9000,
      y: 620 + rnd() * 420,
      s: 260 + rnd() * 420,
    });
  }
  return clouds;
}
