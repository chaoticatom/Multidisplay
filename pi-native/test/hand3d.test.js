'use strict';
// 3D Hand (src/effects/hand3d.js): the hand is drawn in skin tones in the
// middle of the view, the portal glows round the wrist, and it moves.
const assert = require('assert');
const hand3d = require('../src/effects/hand3d');

try {
  const S = 64, core = { SIZE: S, colBuf: new Float32Array(6 * S * S * 3), setFaceLED() {} };
  hand3d._test.st.t = 2.5; hand3d._test.st.img = null;
  hand3d(core, 0);
  const img = hand3d._test.st.img, px = (x, y) => { const o = (y * S + x) * 3; return [img[o], img[o + 1], img[o + 2]]; };
  let skin = 0, blue = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [r, g, b] = px(x, y);
    if (r > 0.25 && r > g && g > b) skin++;
    if (b > 0.4 && b > r * 2) blue++;
  }
  assert.ok(skin > 300, 'a hand in skin tones: ' + skin + ' px');
  assert.ok(blue > 20, 'the portal glows: ' + blue + ' px');
  const before = Float32Array.from(img);
  for (let i = 0; i < 8; i++) hand3d(core, 0.25);
  let diff = 0; for (let i = 0; i < img.length; i++) diff += Math.abs(img[i] - before[i]);
  assert.ok(diff > 20, 'it moves');
  // The wall: the whole width is drawn (the screen beyond the hand's square).
  const W = 192, H = 64, buf = new Float32Array(W * H * 3);
  hand3d.wall({ wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } }, 0.016);
  assert.ok(buf[(10 * W + 2) * 3 + 2] > 0, 'the screen is drawn at the far edges');
  console.log('hand3d ok');
} catch (e) { console.error(e); process.exitCode = 1; }
