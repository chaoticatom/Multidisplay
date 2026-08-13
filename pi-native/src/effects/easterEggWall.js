// Wall-mode counterpart to easterEgg.js. The cube variant shows the exact
// same 64x64 crossfading image identically on all 6 faces (there's no
// per-face variation to preserve), so the wall adaptation is a genuine
// spatial one, not a "same content" shortcut: the two embedded 64x64
// RGB888 images are sampled (nearest-neighbour) across the WHOLE stitched
// wallW x wallH canvas, the same way gradientWashWall.js samples its
// nx/ny wave across the canvas instead of one cube face - so on a
// multi-panel wall the picture is one continuous stretched image, not the
// image tiled/repeated per panel. Same crossfade timing/phases as the cube
// version and the firmware original (15s hold / 3s fade / 15s hold / 3s
// fade back).
const fs = require('fs');
const path = require('path');

const img1 = fs.readFileSync(path.join(__dirname, 'easterEgg', 'img1.bin'));
const img2 = fs.readFileSync(path.join(__dirname, 'easterEgg', 'img2.bin'));

const CYCLE_SEC = 36; // 15+3+15+3
let startT = -1;

function effectEasterEggWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  if (startT < 0) startT = core.t;
  const phase = (core.t - startT) % CYCLE_SEC;
  const alpha = phase < 15 ? 0.0
    : phase < 18 ? (phase - 15) / 3.0
      : phase < 33 ? 1.0
        : 1.0 - (phase - 33) / 3.0;

  const IS = 64; // source images are baked at 64x64, same as easterEgg.js
  for (let y = 0; y < wallH; y++) {
    const sv = Math.min(IS - 1, Math.floor((y / wallH) * IS));
    for (let x = 0; x < wallW; x++) {
      const su = Math.min(IS - 1, Math.floor((x / wallW) * IS));
      const pi = (sv * IS + su) * 3;
      const r1 = img1[pi], g1 = img1[pi + 1], b1 = img1[pi + 2];
      const r2 = img2[pi], g2 = img2[pi + 1], b2 = img2[pi + 2];
      const r = (r1 * (1 - alpha) + r2 * alpha) / 255;
      const g = (g1 * (1 - alpha) + g2 * alpha) / 255;
      const b = (b1 * (1 - alpha) + b2 * alpha) / 255;
      core.setWallPixel(x, y, r, g, b);
    }
  }
}

module.exports = effectEasterEggWall;
