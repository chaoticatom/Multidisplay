// Ported verbatim (math unchanged) from effects-motion.js's effectRain().
// Only the plumbing changed (core.* instead of bare globals), plus one
// deliberate scope cut: the browser version has a second "Matrix" rain
// style, gated behind `typeof rainStyle!=='undefined' && rainStyle==='matrix'`
// - rainStyle is set by a sidebar radio button pi-native's control page
// doesn't have yet, so rainStyle is always undefined here and that branch
// is dead code that was never reachable without the missing UI. Left out
// entirely rather than ported-but-unreachable; the always-reachable colour
// rain mode below is untouched.
const { hsl } = require('../core');

let rainDrops = [];
function resetRain(core) {
  const SIZE = core.SIZE;
  rainDrops = [];
  const nDrops = Math.max(16, SIZE * 2.5) | 0;
  for (let face = 0; face < 4; face++)
    for (let d = 0; d < nDrops; d++) {
      rainDrops.push({
        face, col: Math.random() * SIZE | 0,
        y: Math.random() * SIZE, speed: 0.35 + Math.random() * 0.9,
        hue: Math.random(), len: 5 + Math.random() * SIZE * 0.22,
        bright: 0.7 + Math.random() * 0.3, wide: Math.random() < 0.15,
      });
    }
}

function effectRain(core, dt) {
  core.t += dt;
  const { N, SIZE, colBuf } = core;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.78;

  if (!rainDrops.length || rainDrops[0]._size !== SIZE) {
    resetRain(core);
    rainDrops.forEach((d) => { d._size = SIZE; });
  }

  for (const d of rainDrops) {
    d.y -= d.speed * dt * (SIZE * 0.48);
    if (d.y < -d.len) { d.y = SIZE + d.len; d.col = Math.random() * SIZE | 0; d.hue = Math.random(); d.wide = Math.random() < 0.15; }

    for (let k = 0; k < d.len; k++) {
      const vy = Math.round(d.y + k);
      if (vy < 0 || vy >= SIZE) continue;
      const fade = Math.pow(1 - k / d.len, 1.2) * d.bright;
      const h = (d.hue + k / d.len * 0.15) % 1;
      const [r, g, b] = hsl(h, 1, fade * 0.95);
      core.setFaceLED(d.face, d.col, vy, r, g, b);
      if (d.wide) {
        core.setFaceLED(d.face, d.col - 1, vy, r * 0.5, g * 0.5, b * 0.5);
        core.setFaceLED(d.face, d.col + 1, vy, r * 0.5, g * 0.5, b * 0.5);
      }
      if (vy === 0 && k < 4) {
        const sp = fade * 0.8;
        for (let s = -4; s <= 4; s++) {
          const sf = Math.max(0, 1 - Math.abs(s) / 4) * sp * 0.5;
          core.setFaceLED(d.face, d.col + s, 0, ...hsl(h, 1, sf));
        }
      }
    }
    const [rh, gh, bh] = hsl(d.hue, 0.3, d.bright * 1.0);
    core.setFaceLED(d.face, d.col, Math.round(d.y), rh, gh, bh);
  }

  // Occasional full-column chromatic flash
  if (Math.random() < dt * 0.8) {
    const face = Math.random() * 4 | 0, col = Math.random() * SIZE | 0, hue = Math.random();
    for (let y = 0; y < SIZE; y++) {
      const b2 = Math.pow(Math.random(), 1.5) * 0.85;
      const [r, g, b] = hsl((hue + y / SIZE * 0.3) % 1, 0.9, b2);
      core.setFaceLED(face, col, y, r, g, b);
    }
  }
}

module.exports = effectRain;
