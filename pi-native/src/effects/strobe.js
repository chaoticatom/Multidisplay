// Ported verbatim (math unchanged) from effects-physics.js's effectStrobe()
// - "Strobe Flash". The browser reads pattern/colour overrides off
// `_peTargetOpts` (a per-face Panel Editor override) when present, else
// falls back to the plain `strobeMode`/`strobeColor` module vars set by the
// sidebar's strobe-mode-btn/strobe-color click handlers; pi-native has no
// Panel Editor, so this always reads straight from
// core.effectOptions.strobe.{pattern,color} (falling back to the browser's
// own defaults 'all'/'white' when unset), matching the plain-module-var
// path. Speed is core.effectOptions.strobe.speed (the #strobe-speed
// slider), default 8, same as the browser's default value="8".
const { hsl } = require('../core');

let strobeT = 0, strobeOn = false, strobePhase = 0, strobeBeat = 0;

function effectStrobe(core, dt) {
  const { N, SIZE, faceMap, colBuf } = core;
  core.t += dt;
  const opts = core.effectOptions?.strobe || {};
  const mode = opts.pattern || 'all';
  const sc = opts.color || 'white';
  const speed = Number(opts.speed ?? 8);
  const period = 1 / Math.max(0.2, speed);
  strobeT += dt;
  if (strobeT >= period) { strobeT %= period; strobeOn = !strobeOn; strobePhase = (strobePhase + 1) % 2; strobeBeat++; }

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;
  if (!strobeOn) return;

  const COLMAP = { white: [1, 1, 1], red: [1, 0.05, 0.05], green: [0.05, 1, 0.05], blue: [0.1, 0.2, 1], cyan: [0.1, 1, 1] };
  const baseCol = COLMAP[sc] || [1, 1, 1];
  const multi = (sc === 'multi');
  const hue = multi ? ((strobeBeat * 0.13) % 1) : 0;
  const col = (u, v, faceMod) => {
    if (multi) return hsl((hue + faceMod) % 1, 1, 0.5);
    return baseCol;
  };

  if (mode === 'all') {
    for (let f = 0; f < 6; f++) {
      const [r, g, b] = col(0, 0, f * 0.16);
      for (let j = 0; j < SIZE * SIZE; j++) { const idx = faceMap[f][j]; if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; } }
    }
  } else if (mode === 'checker') {
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
        if ((u + v) % 2 === strobePhase) {
          const [r, g, b] = col(u, v, f * 0.16);
          const idx = faceMap[f][v * SIZE + u];
          if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; }
        }
      }
    }
  } else if (mode === 'faces') {
    const fIdx = strobeBeat % 6;
    const [r, g, b] = col(0, 0, fIdx * 0.16);
    for (let j = 0; j < SIZE * SIZE; j++) { const idx = faceMap[fIdx][j]; if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; } }
  } else if (mode === 'rings') {
    const ring = strobeBeat % Math.ceil(SIZE / 2);
    for (let f = 0; f < 6; f++) {
      const [r, g, b] = col(0, 0, f * 0.16);
      for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
        if (Math.round(Math.min(u, SIZE - 1 - u, v, SIZE - 1 - v)) === ring) {
          const idx = faceMap[f][v * SIZE + u];
          if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; }
        }
      }
    }
  } else if (mode === 'diagonal') {
    const offset = (strobeBeat * 3) % (SIZE * 2);
    for (let f = 0; f < 6; f++) {
      const [r, g, b] = col(0, 0, f * 0.16);
      for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
        if (((u + v + offset) % (SIZE / 2 | 0)) < (SIZE / 4 | 0)) {
          const idx = faceMap[f][v * SIZE + u];
          if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; }
        }
      }
    }
  } else if (mode === 'scanline') {
    const line = strobeBeat % SIZE;
    for (let f = 0; f < 6; f++) {
      const [r, g, b] = col(0, 0, f * 0.16);
      for (let u = 0; u < SIZE; u++) {
        const idx = faceMap[f][line * SIZE + u];
        if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; }
        if (line > 0) { const i2 = faceMap[f][(line - 1) * SIZE + u]; if (i2 >= 0) { colBuf[i2 * 3] = r * 0.6; colBuf[i2 * 3 + 1] = g * 0.6; colBuf[i2 * 3 + 2] = b * 0.6; } }
        if (line < SIZE - 1) { const i3 = faceMap[f][(line + 1) * SIZE + u]; if (i3 >= 0) { colBuf[i3 * 3] = r * 0.6; colBuf[i3 * 3 + 1] = g * 0.6; colBuf[i3 * 3 + 2] = b * 0.6; } }
      }
    }
  } else if (mode === 'burst') {
    for (let f = 0; f < 6; f++) {
      if ((strobeBeat + f * 2) % 6 < 2) {
        const [r, g, b] = col(0, 0, f * 0.16);
        for (let j = 0; j < SIZE * SIZE; j++) { const idx = faceMap[f][j]; if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; } }
      }
    }
  } else if (mode === 'spiral') {
    const step = strobeBeat % (SIZE * 2);
    for (let f = 0; f < 6; f++) {
      const [r, g, b] = col(0, 0, f * 0.16);
      for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
        const ang = Math.atan2(v - SIZE / 2, u - SIZE / 2);
        const rad = Math.sqrt((u - SIZE / 2) ** 2 + (v - SIZE / 2) ** 2);
        if (Math.round((ang / (Math.PI * 2) * SIZE + rad + step)) % 4 === 0) {
          const idx = faceMap[f][v * SIZE + u];
          if (idx >= 0) { colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b; }
        }
      }
    }
  }
}

module.exports = effectStrobe;
