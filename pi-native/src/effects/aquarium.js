// Aquarium: a tank of tropical fish. Fish of a few kinds swim along at their
// own depths and speeds, tails flicking, turning now and then; bubbles rise
// from the sand to the surface; weed sways on the floor and light ripples
// down through the water. On the cube the tank wraps round the four sides
// (fish swim from one side round onto the next) and the top is the water
// surface seen from below, rippling with light; fills a flat panel.
'use strict';
const { defineCanvasEffect, fillTop } = require('./canvas');
const { hsl } = require('../core');

const KINDS = [
  { len: 9, h: 5, body: [1, 0.5, 0.05], stripe: [1, 1, 1] }, // clownfish
  { len: 7, h: 5, body: [0.15, 0.45, 1], stripe: [1, 0.9, 0.1] }, // blue tang
  { len: 6, h: 3, body: [0.2, 0.9, 0.9], stripe: [1, 0.2, 0.3] }, // neon tetra
  { len: 11, h: 7, body: [1, 0.85, 0.2], stripe: [0.2, 0.1, 0.05] }, // angelfish
];
const st = { W: 0, H: 0, fish: [], bubbles: [], weed: [] };
const rnd = (a, b) => a + Math.random() * (b - a);

function populate(W, H, wrap) {
  st.W = W; st.H = H;
  const n = Math.round(W / 64 * 6);
  st.fish = Array.from({ length: n }, () => {
    const k = KINDS[Math.floor(Math.random() * KINDS.length)], dir = Math.random() < 0.5 ? 1 : -1;
    return { k, x: rnd(0, W), y: rnd(H * 0.15, H * 0.75), dir, speed: rnd(6, 14), phase: rnd(0, 6), turnIn: rnd(4, 14), wrap };
  });
  st.weed = Array.from({ length: Math.round(W / 9) }, () => ({ x: rnd(0, W), h: rnd(H * 0.15, H * 0.4), hue: rnd(0.25, 0.4), ph: rnd(0, 6) }));
  st.bubbles = [];
}

function drawFish(c, f, t) {
  const { len, h, body, stripe } = f.k, sc = c.H / 64;
  const L = len * sc, Hh = h * sc, tail = Math.sin(t * 8 + f.phase) * 1.2 * sc;
  for (let i = -L / 2 - 3 * sc; i <= L / 2; i++) {
    const u = (i + L / 2) / L; // 0 tail end .. 1 nose
    let half;
    if (u < 0) half = (-u * L / (3 * sc)) * Hh * 0.55; // the tail fin, fanning out
    else half = Math.sin(Math.min(1, u) * Math.PI) * Hh / 2 + (u < 0.2 ? 0.4 : 0);
    for (let j = -half; j <= half; j++) {
      const x = f.x + i * f.dir, y = f.y + j + (u < 0 ? tail * (-u) : 0);
      const band = u > 0.25 && u < 0.35 || (u > 0.6 && u < 0.67 && len > 8);
      const shade = 0.55 + 0.45 * (1 - Math.abs(j) / (half + 0.5)) - (j > 0 ? 0.15 : 0);
      const col = band ? stripe : body;
      c.set(x, y, col[0] * shade, col[1] * shade, col[2] * shade);
    }
  }
  c.set(f.x + (L / 2 - 1.5 * sc) * f.dir, f.y - Hh * 0.15, 0.02, 0.02, 0.02); // the eye
}

const tank = defineCanvasEffect({
  panorama: true,
  caps: surfaceTop,
  render(c, { t, dt }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H) populate(W, H, !!c.wrap);
    const wx = (x) => (c.wrap ? ((x % W) + W) % W : x);
    // Water: lighter blue near the surface, deep at the floor, with light rays.
    const floor = H * 0.86;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H;
      let r = 0.01 + 0.03 * (1 - v), g = 0.06 + 0.12 * (1 - v), b = 0.14 + 0.2 * (1 - v);
      const ray = Math.max(0, Math.sin(x * 0.11 + Math.sin(t * 0.4 + x * 0.03) * 2 + y * 0.04)) ** 8 * 0.06 * (1 - v);
      r += ray; g += ray * 1.2; b += ray * 1.2;
      if (y > floor) { const s = 0.18 + 0.05 * Math.sin(x * 1.7 + y * 3.1); r = s; g = s * 0.85; b = s * 0.55; } // sand
      c.set(x, y, r, g, b);
    }
    // Weed swaying.
    for (const w of st.weed) for (let k = 0; k < w.h; k++) {
      const x = w.x + Math.sin(t * 1.2 + w.ph + k * 0.15) * k * 0.12, [r, g, b] = hsl(w.hue, 0.7, 0.18 + 0.1 * (k / w.h));
      c.set(wx(x), floor - k, r, g, b); c.set(wx(x + 1), floor - k, r * 0.6, g * 0.6, b * 0.6);
    }
    // Fish.
    for (const f of st.fish) {
      f.x += f.dir * f.speed * dt; f.y += Math.sin(t * 0.6 + f.phase) * dt * 2;
      if ((f.turnIn -= dt) <= 0) { f.dir = -f.dir; f.turnIn = rnd(6, 16); }
      if (c.wrap) f.x = wx(f.x);
      else if (f.x < -10 || f.x > W + 10) f.dir = f.x < 0 ? 1 : -1;
      drawFish(c, f, t);
      if (c.wrap && (f.x < 8 || f.x > W - 8)) { const x0 = f.x; f.x = f.x < 8 ? f.x + W : f.x - W; drawFish(c, f, t); f.x = x0; } // across the seam
    }
    // Bubbles rising to the surface.
    if (Math.random() < dt * W / 30) st.bubbles.push({ x: rnd(0, W), y: floor, r: rnd(0.6, 1.6) * H / 64, w: rnd(0, 6) });
    for (const b of st.bubbles) {
      b.y -= dt * (10 + b.r * 6); const x = b.x + Math.sin(t * 3 + b.w) * 1.2;
      c.add(wx(x), b.y, 0.25, 0.35, 0.45); if (b.r > 1.1) { c.add(wx(x + 1), b.y, 0.12, 0.18, 0.22); c.add(wx(x), b.y - 1, 0.12, 0.18, 0.22); }
    }
    st.bubbles = st.bubbles.filter((b) => b.y > 0);
  },
});

// The cube's top: the water's surface from below - bright, shifting caustic
// light. The bottom is the sand.
function surfaceTop(core, face, t) {
  if (face === 5) { fillTop(core, 0.16, 0.14, 0.09, 5); return; }
  const X = core.surfX, Z = core.surfZ, cb = core.colBuf;
  for (const i of core.faceMap[4]) {
    if (i < 0) continue;
    const x = X[i] * 9, z = Z[i] * 9;
    const c1 = Math.sin(x + Math.sin(z * 1.3 + t * 0.9) * 1.4 + t * 0.6), c2 = Math.sin(z * 1.1 + Math.sin(x * 0.9 - t * 0.7) * 1.5 - t * 0.5);
    const caustic = Math.pow(Math.max(0, 1 - Math.abs(c1 + c2) * 0.6), 4), o = i * 3;
    cb[o] = 0.04 + caustic * 0.35; cb[o + 1] = 0.16 + caustic * 0.55; cb[o + 2] = 0.3 + caustic * 0.6;
  }
}

module.exports = tank;
