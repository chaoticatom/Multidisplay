'use strict';
// Ghost Face 2 (src/effects/ghost3d.js): a pale 3D head with glowing eyes
// comes out of the fog and goes back in.
const assert = require('assert');
const ghost = require('../src/effects/ghost3d');

try {
  const S = 64, core = { SIZE: S, colBuf: new Float32Array(6 * S * S * 3), setFaceLED() {} };
  const at = (t) => { ghost._test.st.t = t; ghost._test.st.img = null; ghost._test.st.blink = 0; ghost(core, 0); return Float32Array.from(ghost._test.st.img); };
  const count = (img) => { let pale = 0, eye = 0; for (let i = 0; i < img.length; i += 3) { const r = img[i], g = img[i + 1], b = img[i + 2]; if (g > 0.3 && b > 0.3 && Math.abs(g - b) < 0.15) pale++; if (r > 0.7 && r > g * 2) eye++; } return { pale, eye }; };
  const out = count(at(6)), back = count(at(13.9));
  assert.ok(out.pale > 200, 'a pale face out of the screen: ' + out.pale);
  assert.ok(out.eye > 10, 'glowing eyes: ' + out.eye);
  assert.ok(back.pale < out.pale / 2, 'back in the fog at the end of the loop: ' + back.pale);
  const W = 192, H = 64, buf = new Float32Array(W * H * 3);
  ghost.wall({ wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } }, 0.016);
  assert.ok(buf[(10 * W + 2) * 3 + 2] > 0, 'fog across the whole wall');
  console.log('ghost3d ok');
} catch (e) { console.error(e); process.exitCode = 1; }
