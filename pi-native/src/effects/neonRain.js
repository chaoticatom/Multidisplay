// Rain: two looks (effectOptions.rain.style).
//   'colour' - neon rain in depth: far drops are short, dim and slow, near
//              ones long, bright and fast (parallax), each landing with a
//              splash ring on a wet floor that reflects them.
//   'matrix' - digital code rain: columns of glyphs falling at their own
//              speeds, white-hot heads, green trails that flicker as the
//              characters change.
// Same on every cube side face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');
const { FONT_3x5 } = require('./text');

const st = { W: 0, H: 0, drops: [], splashes: [], cols: [] };
const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((ch) => FONT_3x5.get(ch));

function newDrop(W, H, anywhere) {
  const z = Math.random(); // 0 far .. 1 near
  return { x: Math.random() * W, y: anywhere ? Math.random() * H : -Math.random() * H * 0.5, z, hue: Math.random() };
}

function colourRain(c, dt, t) {
  const W = c.W, H = c.H, floor = Math.round(H * 0.82);
  if (st.drops.length !== Math.round(W * 1.4)) st.drops = Array.from({ length: Math.round(W * 1.4) }, () => newDrop(W, H, true));
  // Night background, wet floor below.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < floor) { const v = 0.01 + (y / floor) * 0.03; c.set(x, y, v * 0.5, v * 0.6, v * 1.2); }
    else { const v = 0.025 + ((y - floor) / (H - floor)) * 0.02; c.set(x, y, v * 0.6, v * 0.7, v * 1.1); }
  }
  // Splash rings on the floor (drawn first, so drops pass in front).
  for (const s of st.splashes) {
    s.r += dt * (6 + s.z * 10); s.life -= dt * 2.2;
    const col = hsl(s.hue, 1, 0.55), a = Math.max(0, s.life) * (0.4 + s.z * 0.6);
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      c.add(s.x + Math.cos(ang) * s.r, s.y + Math.sin(ang) * s.r * 0.3, col[0] * a, col[1] * a, col[2] * a);
    }
  }
  st.splashes = st.splashes.filter((s) => s.life > 0);
  for (const d of st.drops) {
    const speed = H * (0.5 + d.z * 1.6), len = 2 + d.z * 7, bright = 0.25 + d.z * 0.85;
    d.y += speed * dt;
    const landY = floor + d.z * (H - floor - 1); // nearer drops land lower on the floor
    if (d.y >= landY) {
      st.splashes.push({ x: d.x, y: landY, r: 0.5, life: 1, z: d.z, hue: d.hue });
      Object.assign(d, newDrop(W, H, false));
      continue;
    }
    const col = hsl((d.hue + t * 0.02) % 1, 1, 0.6);
    for (let k = 0; k < len; k++) {
      const a = bright * (1 - k / len);
      c.add(d.x, d.y - k, col[0] * a, col[1] * a, col[2] * a);
      // Reflection in the wet floor, dimmer and broken up.
      const ry = 2 * landY - (d.y - k);
      if (ry < H && ry > landY && ((ry | 0) & 1)) c.add(d.x, ry, col[0] * a * 0.25, col[1] * a * 0.25, col[2] * a * 0.25);
    }
  }
}

function matrixRain(c, dt) {
  const W = c.W, H = c.H, cw = 4, ch = 6, ncol = Math.floor(W / cw);
  if (st.cols.length !== ncol) {
    st.cols = Array.from({ length: ncol }, () => ({ y: -Math.random() * H, speed: 8 + Math.random() * 18, len: 4 + Math.floor(Math.random() * 8), glyphs: Array.from({ length: Math.ceil(H / ch) + 1 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]) }));
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0, 0.012, 0.004);
  st.cols.forEach((col, i) => {
    col.y += col.speed * dt;
    const head = Math.floor(col.y / ch);
    if ((head - col.len) * ch > H) { col.y = -Math.random() * H * 0.5; col.speed = 8 + Math.random() * 18; col.len = 4 + Math.floor(Math.random() * 8); }
    if (Math.random() < dt * 6) col.glyphs[Math.floor(Math.random() * col.glyphs.length)] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    for (let k = 0; k <= col.len; k++) {
      const row = head - k; if (row < 0 || row * ch > H) continue;
      const rows = FONT_3x5.get(col.glyphs[row % col.glyphs.length]);
      const isHead = k === 0, a = isHead ? 1 : Math.pow(1 - k / (col.len + 1), 1.4);
      const r = isHead ? 0.85 : 0.05 * a, g = isHead ? 1 : 0.95 * a, b = isHead ? 0.85 : 0.25 * a;
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
        if ((rows[gy] >> (2 - gx)) & 1) c.set(i * cw + gx, row * ch + gy, r, g, b);
      }
    }
  });
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    if ((core.effectOptions?.rain?.style || 'colour') === 'matrix') matrixRain(c, dt);
    else colourRain(c, dt, t);
  },
});
