'use strict';
// The flow morph between effects (src/effects/transition.js): starts as the
// old picture, ends exactly as the new one, and in between the shapes are
// moved (not just faded). It's the default transition.
const assert = require('assert');
const { flowMorph, STYLES } = require('../src/effects/transition');
const prefs = require('../src/prefs');
try {
  const W = 64, H = 32, n = W * H * 3, old = new Float32Array(n), neu = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; if (Math.abs(x - 16) < 4) old[o] = 1; if (Math.abs(x - 48) < 4) neu[o + 2] = 1; }
  const at = (k) => { const b = Float32Array.from(neu); flowMorph(b, old, W, H, k); return b; };
  const k0 = at(0), k1 = at(1), mid = at(0.5);
  let e0 = 0, e1 = 0; for (let i = 0; i < n; i++) { e0 += Math.abs(k0[i] - old[i]); e1 += Math.abs(k1[i] - neu[i]); }
  assert.ok(e0 < 1e-3 && e1 < 1e-3, 'starts as the old picture, ends as the new');
  // Mid-way, red has moved off its column (carried by the flow) - not a plain fade.
  let moved = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; if (mid[o] > 0.05 && Math.abs(x - 16) >= 5) moved++; }
  assert.ok(moved > 10, 'shapes flow mid-way: ' + moved);
  assert.strictEqual(STYLES[0], 'seamless'); assert.ok(STYLES.includes('morph'));
  assert.strictEqual(prefs.clean(null).transition.style, 'seamless');
  assert.strictEqual(prefs.clean({ transition: { style: 'fade', secs: 0.4 } }).transition.style, 'seamless', 'the old default moves to seamless once');
  assert.strictEqual(prefs.clean({ transition: { style: 'wipe', secs: 1, v3: true } }).transition.style, 'wipe', 'a chosen style stays');
  assert.strictEqual(prefs.clean({ transition: { style: 'slide', secs: 0.8 } }).transition.style, 'slide', 'a chosen style is kept');
  console.log('flowMorph ok');
} catch (e) { console.error(e); process.exitCode = 1; }
