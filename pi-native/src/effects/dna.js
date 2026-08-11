// Ported verbatim (math unchanged) from effects-motion.js's effectDNA().
// The browser fades the trail via `plTransActive?0:0.82` (plTransActive is
// a playlist-crossfade flag from ui.js) - pi-native has no playlist engine
// yet, so that's always false, same as the always-false default in the
// browser outside of an active playlist transition.
const { hsl } = require('../core');

function effectDNA(core, dt) {
  core.t += dt * 0.55;
  const { SIZE, colBuf, N, faceMap, t } = core;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.82;

  const STRANDS = 2; // Classic double helix
  const RADIUS = SIZE * 0.36;
  const TURNS = 4; // Full turns across the panel height

  // ── Side panels: double helix with rungs ──
  for (let face = 0; face < 4; face++) {
    const faceHue = face * 0.25;

    for (let y = 0; y < SIZE; y++) {
      const progress = y / SIZE;
      for (let s = 0; s < STRANDS; s++) {
        const ang = progress * Math.PI * 2 * TURNS + t * 1.4 + s * Math.PI;
        const uc = SIZE / 2 + Math.cos(ang) * RADIUS;
        const ui = Math.round(uc);
        if (ui < 0 || ui >= SIZE) continue;

        const hue = (faceHue + progress * 0.5 + t * 0.06 + s * 0.5) % 1;
        const bright = 0.95;
        const [r, g, b] = hsl(hue, 1, bright);
        core.setFaceLED(face, ui, y, r, g, b);

        for (let d = 1; d <= 3; d++) {
          const fade = Math.pow(1 - d / 4, 2) * 0.7;
          const [rg, gg, bg] = hsl(hue, 0.9, fade);
          core.setFaceLED(face, ui - d, y, rg, gg, bg);
          core.setFaceLED(face, ui + d, y, rg, gg, bg);
        }
      }

      if (y % 3 === 0) {
        const ang0 = progress * Math.PI * 2 * TURNS + t * 1.4;
        const u0 = SIZE / 2 + Math.cos(ang0) * RADIUS;
        const u1 = SIZE / 2 + Math.cos(ang0 + Math.PI) * RADIUS;
        const uMin = Math.round(Math.min(u0, u1));
        const uMax = Math.round(Math.max(u0, u1));
        const rungHue = (faceHue + progress * 0.5 + t * 0.06 + 0.5) % 1;
        for (let u = uMin; u <= uMax; u++) {
          if (u < 0 || u >= SIZE) continue;
          const frac = (u - uMin) / Math.max(1, uMax - uMin);
          const bright = Math.sin(frac * Math.PI) * 0.8;
          const [rr, gr, br] = hsl(rungHue, 1, bright);
          core.setFaceLED(face, u, y, rr, gr, br);
        }
      }
    }

    for (let y = 0; y < SIZE; y++) {
      const pulse = 0.3 + 0.3 * Math.sin(t * 2 + face + y * 0.1);
      const [re, ge, be] = hsl((faceHue + t * 0.05) % 1, 1, pulse);
      core.setFaceLED(face, 0, y, re, ge, be);
      core.setFaceLED(face, SIZE - 1, y, re, ge, be);
    }
  }

  // ── Top panel: double helix end-on view — looking down the axis ──
  const cx2 = SIZE / 2, cy2 = SIZE / 2;
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      const dx = u - cx2, dy = v - cy2;
      const rad = Math.sqrt(dx * dx + dy * dy);
      const ang2 = Math.atan2(dy, dx);

      for (let s = 0; s < STRANDS; s++) {
        const armAng = ang2 - t * 1.4 - s * Math.PI;
        const targetRad = RADIUS * (0.5 + 0.5 * Math.sin(armAng * TURNS * 2));
        const dist = Math.abs(rad - targetRad);
        if (dist < SIZE * 0.08) {
          const bright = Math.pow(1 - dist / (SIZE * 0.08), 2) * 0.9;
          const hue = (ang2 / (Math.PI * 2) + t * 0.08 + s * 0.5) % 1;
          const [r, g, b] = hsl((hue + 1) % 1, 1, bright);
          const idx = faceMap[4][v * SIZE + u];
          if (idx >= 0) {
            colBuf[idx * 3] = Math.max(colBuf[idx * 3], r);
            colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], g);
            colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], b);
          }
        }
      }

      if (rad < SIZE * 0.06) {
        const bright = (1 - rad / (SIZE * 0.06)) * 0.8;
        const [r, g, b] = hsl((t * 0.1) % 1, 0.5, bright);
        const idx = faceMap[4][v * SIZE + u];
        if (idx >= 0) {
          colBuf[idx * 3] = Math.max(colBuf[idx * 3], r);
          colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], g);
          colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], b);
        }
      }
    }
  }
}

module.exports = effectDNA;
