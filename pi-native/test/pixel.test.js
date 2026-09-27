// Tests for src/drivers/pixel.js - float pixel -> panel bytes.
const assert = require('assert');
const { writePixel } = require('../src/drivers/pixel');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const px = (r, g, b, br) => { const buf = new Uint8Array(3); writePixel(buf, 0, r, g, b, br); return [...buf]; };

console.log('pixel');
test('brightness 1 maps 0-1 straight to 0-255', () => {
  assert.deepStrictEqual(px(1, 0.5, 0, 1), [255, 127, 0]);
});
test('brightness below 1 scales every channel', () => {
  assert.deepStrictEqual(px(1, 0.5, 0, 0.5), [127, 63, 0]);
});
test('brightness above 1 keeps the hue when the brightest channel would clip', () => {
  const [r, g, b] = px(1, 0.5, 0, 1.5);
  assert.strictEqual(r, 255);
  assert.ok(Math.abs(g / r - 0.5) < 0.01, 'orange must stay orange, not turn yellow');
  assert.strictEqual(b, 0);
});
test('brightness above 1 still brightens dim pixels that do not clip', () => {
  assert.deepStrictEqual(px(0.4, 0.2, 0, 1.5), [153, 76, 0]);
});
test('out-of-range inputs are clamped (negative -> 0, over-bright -> full)', () => {
  assert.deepStrictEqual(px(-0.2, 2, 0, 1), [0, 255, 0]);
});
console.log(process.exitCode ? 'Some pixel tests FAILED' : 'All pixel tests passed');
