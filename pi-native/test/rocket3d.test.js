'use strict';
// 3D Rocket (src/effects/rocket3d.js): a red-and-white rocket with a hot
// flame flies out of the portal, and it moves.
const assert = require('assert');
const rocket = require('../src/effects/rocket3d');

try {
  const S = 64, core = { SIZE: S, colBuf: new Float32Array(6 * S * S * 3), setFaceLED() {} };
  rocket._test.st.t = 4.6; rocket._test.st.img = null;
  rocket(core, 0);
  const img = rocket._test.st.img;
  let red = 0, white = 0, hot = 0, blue = 0;
  for (let i = 0; i < img.length; i += 3) {
    const r = img[i], g = img[i + 1], b = img[i + 2];
    if (r > 0.35 && r > g * 2.2 && r > b * 2.2) red++;
    if (r > 0.25 && Math.abs(r - g) < 0.1 && Math.abs(g - b) < 0.15) white++;
    if (r > 0.9 && g > 0.4 && b < g) hot++;
    if (b > 0.4 && b > r * 2) blue++;
  }
  assert.ok(red > 40, 'red paint: ' + red);
  assert.ok(white > 15, 'white body: ' + white);
  assert.ok(hot > 3, 'a hot flame: ' + hot);
  assert.ok(blue > 10, 'the portal glows: ' + blue);
  const before = Float32Array.from(img);
  for (let i = 0; i < 8; i++) rocket(core, 0.1);
  let diff = 0; for (let i = 0; i < img.length; i++) diff += Math.abs(img[i] - before[i]);
  assert.ok(diff > 20, 'it moves');
  const W = 192, H = 64, buf = new Float32Array(W * H * 3);
  rocket.wall({ wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } }, 0.016);
  assert.ok(buf[(10 * W + 2) * 3 + 2] > 0, 'the screen is drawn at the far edges');
  console.log('rocket3d ok');
} catch (e) { console.error(e); process.exitCode = 1; }
