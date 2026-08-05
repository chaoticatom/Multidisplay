// Faithful port of the ESP32 firmware's standaloneRenderEasterEgg()
// (standalone.h) - itself a native port of ui.js's hidden secret-image
// reveal (size button sequence 8,8,16,64 within 2s). Ported from the
// firmware's version rather than the browser's directly, since this is the
// same "no browser in the loop" rendering problem this whole pi-native
// project exists to solve, and the firmware's version is already a clean,
// simple, proven reference for it (raw RGB888 crossfade, no DOM/canvas
// involved) - unlike the weather effect, there was no reason to instead
// transcribe the (more complex, browser-only) original.
//
// img1.bin/img2.bin are the exact same embedded 64x64 RGB888 images as
// firmware/src/easter_egg_images.h's EASTER_EGG_IMG1/IMG2 (extracted
// programmatically from that header, verified byte-for-byte against a
// spot check of the source - see git history for the extraction script).
// Same crossfade timing as the firmware: 15s holding image 1, 3s
// crossfade, 15s holding image 2, 3s crossfade back, repeat. Shown
// identically on all 6 faces, matching the firmware's per-face loop (not
// the browser's single-panel-only reveal, which has no equivalent concept
// here - there's no "one active panel view" without a browser UI).
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
      for (let x = 0; x < S; x++) {
        const led = faceMap[y * S + x];
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
