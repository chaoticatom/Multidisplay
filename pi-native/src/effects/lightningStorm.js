// Lightning Storm: a night storm over a dark skyline. Heavy clouds boil and
// drift, glowing from inside; rain slants down; every few seconds a jagged,
// branching bolt cracks from the cloud base to the ground - white-violet core,
// wide glow - the whole sky flashes, the skyline is lit for an instant, and it
// often flickers a second time. A strong beat in the music can call a strike.
// One definition for cube and wall (see ./surface.js).
'use strict';

const { defineFieldEffect } = require('./surface');
const { sceneUV, fbm, hash2, vnoise, clamp, smooth } = require('./sceneKit');

const st = { bolts: [], flash: 0, next: 1, cool: 0, w: 1 };
// A bolt as segments in scene units: a jagged channel down, with forks.
function makeBolt(w) {
  const segs = [], x0 = w * (0.15 + Math.random() * 0.7), base = 0.3, ground = 0.86;
  (function grow(x, y, len, width, depth) {
    let cx = x, cy = y;
    const steps = depth ? 5 : 14;
    for (let i = 0; i < steps && cy < ground; i++) {
      const nx = cx + (Math.random() - 0.5) * 0.09 * (depth ? 0.8 : 1), ny = Math.min(ground, cy + len / steps * (0.7 + Math.random() * 0.6));
      segs.push([cx, cy, nx, ny, width]);
      if (!depth && Math.random() < 0.28) grow(nx, ny, len * 0.35, width * 0.55, 1);
      cx = nx; cy = ny;
    }
  })(x0, base, ground - base, 1, 0);
  return { segs, life: 0.32 + Math.random() * 0.15, age: 0, x0, re: Math.random() < 0.5 };
}
function segDist(px, py, s) {
  const vx = s[2] - s[0], vy = s[3] - s[1], l2 = vx * vx + vy * vy || 1e-9, k = clamp(((px - s[0]) * vx + (py - s[1]) * vy) / l2);
  const dx = px - s[0] - vx * k, dy = py - s[1] - vy * k; return Math.sqrt(dx * dx + dy * dy);
}

module.exports = defineFieldEffect({
  fine: true,
  speed: 1,
  frame({ dt, core, flat }) {
    st.w = flat && core && core.wallW && core.wallH ? core.wallW / core.wallH : 1;
    st.next -= dt; st.cool -= dt;
    const beat = core && core.audio && core.audio.active && core.audio.beat > 0.85 && st.cool <= 0;
    if (st.next <= 0 || beat) { st.bolts.push(makeBolt(st.w)); st.flash = 1; st.next = 2 + Math.random() * 5; st.cool = 0.8; }
    for (const b of st.bolts) { b.age += dt; if (b.re && b.age > 0.16 && b.age < 0.2) st.flash = Math.max(st.flash, 0.7); }
    st.bolts = st.bolts.filter((b) => b.age < b.life);
    st.flash *= Math.exp(-dt * 7);
  },
  pixel(p, { t, core }) {
    const [x, y] = sceneUV(p, core), f = st.flash;
    // Clouds: two drifting layers, lit from inside near a strike.
    const c = fbm(x * 2.2 + t * 0.05, y * 4 - t * 0.02, 4), c2 = fbm(x * 4 - t * 0.08, y * 6, 3);
    const dens = smooth(0.35, 0.75, c * 0.7 + c2 * 0.3) * (1 - smooth(0.35, 0.6, y));
    let lit = 0; for (const b of st.bolts) lit = Math.max(lit, Math.exp(-Math.abs(x - b.x0) * 3) * (1 - b.age / b.life));
    let r = 0.012 + 0.02 * (1 - y), g = 0.015 + 0.024 * (1 - y), b = 0.03 + 0.045 * (1 - y);
    const cl = dens * (0.07 + f * 0.3 + lit * 0.45);
    r += cl * 0.85; g += cl * 0.85; b += cl * 1.05;
    r += f * 0.07; g += f * 0.07; b += f * 0.11; // the sky flash
    // Rain: slanted streaks.
    const rx = x * 70 + y * 18, col = Math.floor(rx), ph = (y * 3 + t * 2.2 + hash2(col, 3) * 10) % 1;
    if (hash2(col, 9) > 0.55 && ph < 0.12 && Math.abs(rx - col - 0.5) < 0.18) { const k = 0.12 + f * 0.4; r += k; g += k; b += k * 1.2; }
    // The bolts: a white-violet core and a wide glow.
    for (const bo of st.bolts) {
      const fade = 1 - bo.age / bo.life;
      for (const s of bo.segs) { const d = segDist(x, y, s); if (d > 0.06) continue; const core2 = Math.exp(-((d / (0.007 * s[4])) ** 2)) * 1.4, glow = Math.exp(-d / 0.02) * 0.3 * s[4]; const k = (core2 + glow) * fade; r += k * 0.85; g += k * 0.8; b += k; }
    }
    // The skyline: dark buildings and a few lit windows, caught by the flash.
    const bw = Math.floor(x * 14), bh = 0.8 + 0.1 * hash2(bw, 1);
    if (y > bh) {
      const win = hash2(Math.floor(x * 90), Math.floor(y * 90)) > 0.9 && hash2(bw, 5) > 0.3 ? 0.25 : 0;
      const k = 0.01 + f * 0.25; return [k * 0.8 + win, k * 0.85 + win * 0.8, k + win * 0.4];
    }
    return [Math.min(1.3, r), Math.min(1.3, g), Math.min(1.3, b)];
  },
});
