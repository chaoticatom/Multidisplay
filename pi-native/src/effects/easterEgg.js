// Easter Egg: the hidden secret-image reveal (size button sequence
// 8,8,16,64 within 2s) - a raw RGB888 crossfade between two images.
//
// img1.bin/img2.bin are the two embedded 64x64 RGB888 images.
// Crossfade timing: 15s holding image 1, 3s
// crossfade, 15s holding image 2, 3s crossfade back, repeat. Shown
// identically on all 6 faces.
const fs = require('fs');
const path = require('path');

const img1 = fs.readFileSync(path.join(__dirname, 'easterEgg', 'img1.bin'));
const img2 = fs.readFileSync(path.join(__dirname, 'easterEgg', 'img2.bin'));

const CYCLE_SEC = 36; // 15+3+15+3
let startT = -1;

function easterEgg(core, dt) {
  core.t += dt;
  if (startT < 0) startT = core.t;
  const phase = (core.t - startT) % CYCLE_SEC;
  const alpha = phase < 15 ? 0.0
    : phase < 18 ? (phase - 15) / 3.0
      : phase < 33 ? 1.0
        : 1.0 - (phase - 33) / 3.0;

  const S = core.SIZE;
  if (S !== 64) {
    // Images are baked at 64x64 (matches PANEL_SIZE everywhere else in
    // this project) - no resampling logic exists for other sizes.
    throw new Error(`easterEgg effect is hardcoded for SIZE=64, got ${S}`);
  }

  for (let face = 0; face < 6; face++) {
    const faceMap = core.faceMap[face];
    for (let y = 0; y < S; y++) {
      // img1.bin/img2.bin are standard top-down RGB888 (row 0 = top of
      // the image) but
      // faceMap's row 0 is the BOTTOM (matching cube.js's Y-up 3D
      // convention, same as every other effect that blits a top-down
      // image buffer - see e.g. neo.js's title-card blit or apod.js's
      // image sampling, both of which flip the destination/source row
      // the same way). Without the flip - a real report - the easter
      // egg displayed upside down.
      const fy = S - 1 - y;
      for (let x = 0; x < S; x++) {
        const led = faceMap[fy * S + x];
        if (led < 0) continue;
        const pi = (y * S + x) * 3;
        const r1 = img1[pi], g1 = img1[pi + 1], b1 = img1[pi + 2];
        const r2 = img2[pi], g2 = img2[pi + 1], b2 = img2[pi + 2];
        const r = (r1 * (1 - alpha) + r2 * alpha) / 255;
        const g = (g1 * (1 - alpha) + g2 * alpha) / 255;
        const b = (b1 * (1 - alpha) + b2 * alpha) / 255;
        core.setLED(led, r, g, b);
      }
    }
  }
}

module.exports = easterEgg;
