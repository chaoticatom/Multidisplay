// Ported verbatim (math unchanged) from effects-motion.js's effectRain(),
// including both rain styles - now that the sidebar's Style buttons
// (panel-rain, "Colour"/"Matrix") are wired via core.effectOptions.rain.style
// (see wsServer.js's setEffectOption / app.js), matching the browser's
// plain `rainStyle` module variable set by ui.js's rain-style-btn clicks.
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

// Matrix rain state - per-face, per-column streams, plus the top panel
// (index 6, matching effects-motion.js's matrixStreams[6]).
let matrixStreams = null;
function initMatrixStreams(SIZE) {
  matrixStreams = [];
  for (let face = 0; face < 4; face++) {
    matrixStreams[face] = [];
    for (let u = 0; u < SIZE; u++) {
      matrixStreams[face][u] = {
        head: SIZE - 1 + Math.floor(Math.random() * SIZE * 1.5),
        speed: 0.4 + Math.random() * 0.7,
        len: Math.floor(SIZE * 0.25 + Math.random() * SIZE * 0.45),
      };
    }
  }
}

function effectRainMatrix(core, dt) {
  const { SIZE, faceMap, colBuf } = core;
  if (!matrixStreams || matrixStreams.length === 0 || matrixStreams[0].length !== SIZE) initMatrixStreams(SIZE);

  // v=0=bottom, v=SIZE-1=top. Head starts at top (SIZE-1), falls toward bottom (0).
  // ── 4 SIDE FACES ──
  for (let face = 0; face < 4; face++) {
    for (let u = 0; u < SIZE; u++) {
      const stream = matrixStreams[face][u];
      stream.head -= stream.speed * dt * SIZE;
      if (stream.head + stream.len < 0) {
        stream.head = SIZE - 1 + Math.floor(Math.random() * SIZE * 0.8);
        stream.speed = 0.4 + Math.random() * 0.7;
        stream.len = Math.floor(SIZE * 0.25 + Math.random() * SIZE * 0.45);
      }
      const headV = Math.floor(stream.head);
      for (let v = 0; v < SIZE; v++) {
        const dist = v - headV;
        if (dist < 0 || dist > stream.len) continue;
        const idx = faceMap[face][v * SIZE + u];
        if (idx < 0) continue;
        const isHead = dist === 0;
        if (isHead) {
          colBuf[idx * 3] = 0.7; colBuf[idx * 3 + 1] = 1.0; colBuf[idx * 3 + 2] = 0.7;
        } else {
          const frac = 1 - dist / stream.len;
          const bright = Math.pow(frac, 1.8) * 0.9;
          const flicker = 0.7 + Math.random() * 0.3;
          colBuf[idx * 3] = Math.max(colBuf[idx * 3], bright * 0.05);
          colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], bright * flicker);
          colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], bright * 0.05);
        }
      }
    }
  }

  // ── TOP PANEL — streams fall along v axis (same direction, inward) ──
  if (!matrixStreams[6]) {
    matrixStreams[6] = [];
    for (let u = 0; u < SIZE; u++) {
      matrixStreams[6][u] = {
        head: SIZE - 1 + Math.floor(Math.random() * SIZE * 1.5),
        speed: 0.35 + Math.random() * 0.6,
        len: Math.floor(SIZE * 0.2 + Math.random() * SIZE * 0.4),
      };
    }
  }
  for (let u = 0; u < SIZE; u++) {
    const stream = matrixStreams[6][u];
    stream.head -= stream.speed * dt * SIZE;
    if (stream.head + stream.len < 0) {
      stream.head = SIZE - 1 + Math.floor(Math.random() * SIZE * 0.8);
      stream.speed = 0.35 + Math.random() * 0.6;
      stream.len = Math.floor(SIZE * 0.2 + Math.random() * SIZE * 0.4);
    }
    const headV = Math.floor(stream.head);
    for (let v = 0; v < SIZE; v++) {
      const dist = v - headV;
      if (dist < 0 || dist > stream.len) continue;
      const idx = faceMap[4][v * SIZE + u];
      if (idx < 0) continue;
      const isHead = dist === 0;
      if (isHead) {
        colBuf[idx * 3] = 0.7; colBuf[idx * 3 + 1] = 1.0; colBuf[idx * 3 + 2] = 0.7;
      } else {
        const frac = 1 - dist / stream.len;
        const bright = Math.pow(frac, 1.8) * 0.85;
        const flicker = 0.7 + Math.random() * 0.3;
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], bright * 0.05);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], bright * flicker);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], bright * 0.05);
      }
    }
  }
}

function effectRain(core, dt) {
  core.t += dt;
  const { N, SIZE, colBuf } = core;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.78;

  const style = core.effectOptions?.rain?.style || 'colour';
  if (style === 'matrix') { effectRainMatrix(core, dt); return; }

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
