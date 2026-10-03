// Lightning Storm: a night storm. Layered clouds drift and boil, rain
// slants down, and every few seconds a branching bolt cracks from the
// cloud base to the ground - the clouds light up from inside, the whole sky
// flashes, then the glow dies away (sometimes with a second flicker). A
// strong beat in the music can trigger a strike. Same on every cube side
// face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;

const st = { bolts: [], flash: 0, next: 0.4, drops: [], W: 0, H: 0, strikeX: 0.5, flicker: 0 };

// A bolt as line segments: a jagged main channel from the cloud base down
// to the ground, with forks that split off and fade out.
function makeBolt(W, H) {
  const segs = [];
  const x0 = W * (0.15 + Math.random() * 0.7), base = H * 0.3, ground = H - 1;
  function grow(x, y, ang, len, width, depth) {
    while (y < ground && len > 0) {
      const step = 2 + Math.random() * 2.5;
      const a = ang + (Math.random() - 0.5) * 1.1;
      const nx = x + Math.sin(a) * step, ny = y + Math.cos(a) * step;
      segs.push([x, y, nx, ny, width]);
      if (depth < 2 && Math.random() < 0.13) grow(nx, ny, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), len * 0.4, width * 0.55, depth + 1);
      x = nx; y = ny; len -= step;
      ang = ang * 0.8; // keep heading downward overall
    }
  }
  grow(x0, base, (Math.random() - 0.5) * 0.4, H * 2, 1, 0);
  return { segs, life: 1, x: x0 };
}

function line(c, x0, y0, x1, y1, w, I) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    c.add(x, y, 0.85 * I, 0.9 * I, 1.0 * I); // white-blue core
    if (w > 0.6) { const g = 0.25 * I * w; c.add(x - 1, y, g * 0.6, g * 0.6, g); c.add(x + 1, y, g * 0.6, g * 0.6, g); }
  }
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H) {
      st.W = W; st.H = H;
      st.drops = Array.from({ length: Math.round(W * H / 40) }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.6 }));
    }
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    if ((st.next -= dt) <= 0 || (beat > 0.8 && st.flash < 0.2 && Math.random() < 0.3)) {
      const b = makeBolt(W, H); st.bolts.push(b); st.strikeX = b.x / W;
      st.flash = 1; st.flicker = Math.random() < 0.5 ? 0.18 : 0;
      st.next = 2 + Math.random() * 5;
    }
    st.flash = Math.max(0, st.flash - dt * 1.4);
    if (st.flicker > 0) { st.flicker -= dt; if (st.flicker <= 0) st.flash = Math.max(st.flash, 0.7); }
    const fl = st.flash * st.flash;
    // Sky and clouds.
    const cloudBase = H * 0.42;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H;
      const n = fbm(x * 0.06 + t * 0.12, y * 0.09 - t * 0.03), n2 = fbm(x * 0.03 - t * 0.05 + 7, y * 0.05 + 3);
      const dens = Math.max(0, Math.min(1, (n * 0.7 + n2 * 0.6 - 0.35) * 2.2 * (1 - Math.max(0, (y - cloudBase) / (H * 0.25)))));
      // Light from the strike: brightest in the clouds near the bolt.
      const near = Math.exp(-(((x / W - st.strikeX) / 0.35) ** 2));
      const lit = fl * (0.25 + 0.75 * near) * (0.4 + dens * 0.9);
      let r = 0.01 + v * 0.015, g = 0.012 + v * 0.02, b = 0.03 + v * 0.03;
      r += dens * 0.1; g += dens * 0.11; b += dens * 0.15; // cloud bodies, faintly lit by the city/moon
      r += lit * 0.75; g += lit * 0.8; b += lit * 1.0;
      if (y > H - 3) { const k = fl * 0.3; r = 0.01 + k * 0.4; g = 0.015 + k * 0.45; b = 0.02 + k * 0.5; } // ground
      c.set(x, y, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
    // Rain, slanting, a little brighter in a flash.
    const rb = 0.12 + fl * 0.4;
    for (const d of st.drops) {
      d.y += dt * H * 1.6 * d.s; d.x += dt * W * 0.25 * d.s;
      if (d.y > H) { d.y -= H; d.x = Math.random() * W; }
      if (d.x > W) d.x -= W;
      for (let k = 0; k < 3; k++) c.add(d.x - k * 0.3, d.y - k, rb * 0.6 * (1 - k / 3), rb * 0.7 * (1 - k / 3), rb * (1 - k / 3));
    }
    // Bolts fade fast.
    for (const b of st.bolts) {
      const I = Math.min(1, b.life * 1.6);
      for (const [x0, y0, x1, y1, w] of b.segs) line(c, x0, y0, x1, y1, w, I * (0.45 + 0.55 * w));
      b.life -= dt * 2.2;
    }
    st.bolts = st.bolts.filter((b) => b.life > 0);
  },
});
