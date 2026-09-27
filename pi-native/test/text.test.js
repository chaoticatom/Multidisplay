// Tests for src/effects/text.js - the shared bitmap-text primitives every
// text-drawing effect goes through. Run with `npm test`.
const assert = require('assert');
const { blitGlyph, drawGlyph, drawString, textWidth, drawLinesCentered, drawMarquee, FONT_3x5, FONT_5x7, FONT_5x7_BLANK, FONT_MOON } = require('../src/effects/text');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Collects plotted pixels as "x,y" strings.
function collector() {
  const px = [];
  const plot = (x, y) => px.push(`${x},${y}`);
  return { px, plot, set: () => new Set(px) };
}

// An asymmetric 3x3 test glyph ("r"-ish): top row full, then left column.
//   ###
//   #..
//   #..
const GLYPH = [0b111, 0b100, 0b100];

console.log('text');

test('blitGlyph plots exactly the lit bits, MSB = leftmost column', () => {
  const c = collector();
  blitGlyph(GLYPH, 3, 3, 10, 20, 1, c.plot);
  assert.deepStrictEqual(c.set(), new Set(['10,20', '11,20', '12,20', '10,21', '10,22']));
});

test('flipY reverses row order within the glyph cell', () => {
  const c = collector();
  blitGlyph(GLYPH, 3, 3, 0, 0, 1, c.plot, false, true);
  assert.deepStrictEqual(c.set(), new Set(['0,2', '1,2', '2,2', '0,1', '0,0']));
});

test('flipX reverses column order within the glyph cell', () => {
  const c = collector();
  blitGlyph(GLYPH, 3, 3, 0, 0, 1, c.plot, true, false);
  assert.deepStrictEqual(c.set(), new Set(['0,0', '1,0', '2,0', '2,1', '2,2']));
});

test('scale expands every lit bit into a scale x scale block', () => {
  const c = collector();
  blitGlyph([0b1], 1, 1, 5, 5, 3, c.plot);
  assert.strictEqual(c.px.length, 9);
  assert.ok(c.set().has('5,5') && c.set().has('7,7'));
});

test('empty/undefined rows are skipped without error', () => {
  const c = collector();
  blitGlyph([0, undefined, 0b1], 1, 3, 0, 0, 1, c.plot);
  assert.deepStrictEqual(c.px, ['0,2']);
});

test('drawGlyph returns the scaled advance, even for a missing glyph', () => {
  const c = collector();
  assert.strictEqual(drawGlyph(FONT_3x5, 'A', 0, 0, c.plot, { scale: 2 }), 8);
  assert.ok(c.px.length > 0);
  const miss = collector();
  assert.strictEqual(drawGlyph(FONT_3x5, '☃', 0, 0, miss.plot), 4); // snowman: not in PIXEL_FONT
  assert.strictEqual(miss.px.length, 0);
});

test('font lookup rules are preserved per font', () => {
  // 5x7 falls back to '?', the BLANK variant draws nothing.
  const q = collector(); drawGlyph(FONT_5x7, '☃', 0, 0, q.plot);
  const qq = collector(); drawGlyph(FONT_5x7, '?', 0, 0, qq.plot);
  assert.deepStrictEqual(q.set(), qq.set());
  const blank = collector(); drawGlyph(FONT_5x7_BLANK, '☃', 0, 0, blank.plot);
  assert.strictEqual(blank.px.length, 0);
  // The moon font adds '%' on top of PIXEL_FONT.
  const pct = collector(); drawGlyph(FONT_MOON, '%', 0, 0, pct.plot);
  assert.ok(pct.px.length > 0);
});

test('drawString advances by font.adv and honours maxX', () => {
  const c = collector();
  assert.strictEqual(drawString(FONT_3x5, 'AAA', 0, 0, c.plot), 12);
  const cut = collector();
  assert.strictEqual(drawString(FONT_3x5, 'AAAA', 0, 0, cut.plot, { maxX: 5 }), 8); // stops after crossing 5
  assert.ok(![...cut.set()].some((p) => Number(p.split(',')[0]) >= 8));
});

test('textWidth excludes the trailing inter-glyph gap', () => {
  assert.strictEqual(textWidth(FONT_3x5, 'AB'), 7);
  assert.strictEqual(textWidth(FONT_3x5, 'AB', 2), 14);
});

test('drawLinesCentered centers each line and the whole block', () => {
  const c = collector();
  drawLinesCentered(FONT_3x5, ['I'], 11, 11, c.plot, { ox: 100, oy: 200 });
  const xs = [...c.set()].map((p) => Number(p.split(',')[0]));
  const ys = [...c.set()].map((p) => Number(p.split(',')[1]));
  assert.strictEqual(Math.min(...xs), 104); // (11 - 3) / 2 = 4, plus ox
  assert.strictEqual(Math.min(...ys), 203); // round((11 - 6) / 2) = 3 (rounds 2.5 up), plus oy
});

test('drawMarquee tiles the label across the width and tolerates an empty label', () => {
  const c = collector();
  drawMarquee(FONT_3x5, 'I', 0, 0, 20, c.plot);
  const xs = new Set([...c.set()].map((p) => Number(p.split(',')[0])));
  assert.ok(xs.has(1) && xs.has(5) && xs.has(17)); // 'I' repeated every 4px
  drawMarquee(FONT_3x5, '', 0, 0, 20, c.plot); // must return, not spin forever
});

console.log(process.exitCode ? 'Some text tests FAILED' : 'All text tests passed');
