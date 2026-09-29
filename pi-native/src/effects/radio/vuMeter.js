// Stereo LED-style VU meter, shared by the cube (spectrum.js) and wall
// (spectrumWall.js) renderers. Segmented bars (green -> yellow -> red),
// unlit segments faintly visible like a real LED meter, and a peak-hold
// segment. Levels come from ffmpegAudio.js's stereo VU (ctx.vu =
// [left, right, leftPeak, rightPeak]); callers without it fall back to a
// mono level from the bass bands.
'use strict';
const { hsl } = require('../../core');

function vuLevels(ctx) {
  if (ctx.vu && ctx.vu.length === 4) return ctx.vu;
  let lvl = 0;
  for (let b = 0; b < Math.min(8, ctx.bands); b++) lvl += ctx.amp(b);
  lvl = Math.min(1, lvl / 4);
  return [lvl, lvl, lvl, lvl];
}

function segColour(frac) {
  return frac < 0.6 ? hsl(0.33, 1, 0.42) : frac < 0.85 ? hsl(0.13, 1, 0.45) : hsl(0.0, 1, 0.45);
}

// One vertical meter in columns x0..x1 (inclusive), rows 0..H-1 (row 0 =
// bottom of the meter as the caller's plot sees it).
function drawMeter(plot, x0, x1, H, level, peak) {
  const seg = H >= 32 ? 4 : H >= 16 ? 3 : 2; // segment pitch incl. 1-row gap
  const nSeg = Math.floor(H / seg);
  const lit = Math.round(level * nSeg), pk = Math.min(nSeg - 1, Math.round(peak * nSeg) - 1);
  for (let s = 0; s < nSeg; s++) {
    const frac = (s + 0.5) / nSeg;
    const c = segColour(frac);
    const k = s < lit ? 1 : s === pk && peak > 0.02 ? 0.9 : 0.07;
    for (let dy = 0; dy < seg - 1; dy++) {
      const y = s * seg + dy;
      for (let x = x0; x <= x1; x++) plot(x, y, c[0] * k, c[1] * k, c[2] * k);
    }
  }
}

module.exports = { vuLevels, drawMeter, segColour };
