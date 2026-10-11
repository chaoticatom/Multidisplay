'use strict';
// Ghost Face 2 (src/effects/ghost3d.js): a pale 3D head with glowing eyes
// comes out of the fog and goes back in.
const assert = require('assert');
const ghost = require('../src/effects/ghost3d');

try {
  const S = 64, core = { SIZE: S, colBuf: new Float32Array(6 * S * S * 3), setFaceLED() {} };
  const at = (t) => { ghost._test.st.t = t; ghost._test.st.img = null; ghost._test.st.blink = 0; ghost(core, 0); return Float32Array.from(ghost._test.st.img); };
  const count = (img) => { let pale = 0, eye = 0; for (let i = 0; i < img.length; i += 3) { const r = img[i], g = img[i + 1], b = img[i + 2]; if (g > 0.3 && b > 0.3 && Math.abs(g - b) < 0.15) pale++; if (r > 0.7 && r > g * 2) eye++; } return { pale, eye }; };
  const out = count(at(6)), back = count(at(21.95));
  assert.ok(out.pale > 200, 'a pale face out of the screen: ' + out.pale);
  assert.ok(out.eye > 10, 'glowing eyes: ' + out.eye);
  assert.ok(back.pale < out.pale / 2, 'back in the fog at the end of the loop: ' + back.pale);
  const W = 192, H = 64, buf = new Float32Array(W * H * 3);
  ghost.wall({ wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } }, 0.016);
  assert.ok(buf[(10 * W + 2) * 3 + 2] > 0, 'fog across the whole wall');
  // One scare per visit, in turn: eyeballs, hands, shatter, skull.
  const { SC } = ghost._test;
  ghost._test.st.lastCycle = -1; ghost._test.buildPose(2.2, 0);
  assert.strictEqual(SC.kind, 'eyes'); assert.ok(SC.eyes.length >= 4, 'eyeballs float out: ' + SC.eyes.length);
  ghost._test.buildPose(22 + 0.4 * 22, 0); assert.strictEqual(SC.kind, 'hands'); assert.ok(SC.hands.length >= 2, 'hands push out');
  ghost._test.buildPose(44 + 0.56 * 22, 0); assert.strictEqual(SC.kind, 'shatter'); assert.ok(SC.shards.length > 10 && SC.crack > 0, 'the screen shatters');
  ghost._test.buildPose(66 + 0.55 * 22, 0); assert.strictEqual(SC.kind, 'skull'); assert.ok(SC.skull > 0.5 && ghost._test.G.hidden, 'a skull in the ghost\'s place');
  // Drawn: the skull's turn shows bone-white pixels on a single panel.
  const sk = at(66 + 0.555 * 22); let bone = 0; for (let i = 0; i < sk.length; i += 3) if (sk[i] > 0.6 && sk[i + 1] > 0.6 && sk[i + 2] > 0.5) bone++;
  assert.ok(bone > 80, 'the skull is drawn: ' + bone);
  console.log('ghost3d ok');
} catch (e) { console.error(e); process.exitCode = 1; }
