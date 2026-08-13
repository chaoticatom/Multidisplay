// Direct unit tests for the shared word-cascade engine
// (pi-native/src/effects/_shared.js's wcInit/wcStep/wcTagQA/wcDecodeEntities),
// isolated from any single effect - see joke.test.js/trivia.test.js/
// otd.test.js for the full-effect integration tests.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { wcInit, wcStep, wcDrawToFace, wcTagQA, wcDecodeEntities } = require('../src/effects/_shared');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function checkFinite(core, label) {
  for (let i = 0; i < core.colBuf.length; i++) {
    const v = core.colBuf[i];
    assert.ok(Number.isFinite(v), `${label}: non-finite value ${v} at colBuf[${i}]`);
  }
}

async function main() {
  await test('wcTagQA splits question (white) / answer (amber) on the "?"', () => {
    const words = wcTagQA('Is the sky blue? Yes it is');
    assert.ok(words.length > 0);
    const qWords = words.filter((w) => 'Is the sky blue?'.includes(w.w));
    for (const w of words) {
      if (w.w === 'Is' || w.w === 'the' || w.w === 'sky' || w.w === 'blue?') {
        assert.deepStrictEqual(w.color, [1, 1, 1], `expected white for setup word "${w.w}"`);
      }
    }
    const answerWord = words.find((w) => w.w === 'Yes');
    assert.ok(answerWord, 'expected an "Yes" word after the "?"');
    assert.deepStrictEqual(answerWord.color, [1, 0.8, 0.27]);
  });

  await test('wcTagQA with no "?" tags everything as setup (white)', () => {
    const words = wcTagQA('no question mark here');
    assert.ok(words.length === 4);
    for (const w of words) assert.deepStrictEqual(w.color, [1, 1, 1]);
  });

  await test('wcInit/wcStep progressively reveal words and set done once exhausted', () => {
    const words = wcTagQA('This is a reasonably long sentence used to test the word cascade engine thoroughly across many ticks');
    const state = wcInit(words);
    assert.strictEqual(state.done, false);
    assert.strictEqual(state.idx, 0);
    let ticks = 0;
    // 0.05s steps - generous upper bound of 2000 ticks (100s of sim time)
    // to guarantee we reach done even with the longest per-word delay.
    while (!state.done && ticks < 2000) {
      wcStep(state, 0.05);
      ticks++;
    }
    assert.ok(state.done, `expected state.done after ${ticks} ticks`);
    assert.strictEqual(state.idx, words.length);
  });

  await test('wcStep + wcDrawToFace never overflows SIZE and produces finite colBuf', () => {
    const words = wcTagQA('A very long question with lots and lots and lots of words to force line wrapping across the whole face? And a long answer too with several more words after the question mark to really stress test it');
    const state = wcInit(words);
    const core = new CubeCore(64);
    for (let i = 0; i < 400; i++) {
      wcStep(state, 1 / 30);
      wcDrawToFace(core, state, 1);
    }
    checkFinite(core, 'word cascade draw');
    // maxLines should be a small positive integer derived from SIZE=64/WC_LINE_H=8.
    assert.strictEqual(state.maxLines, 8);
  });

  await test('wcDecodeEntities decodes common OpenTDB entities', () => {
    assert.strictEqual(wcDecodeEntities('&quot;Hello&quot;'), '"Hello"');
    assert.strictEqual(wcDecodeEntities("It&#039;s a test"), "It's a test");
    assert.strictEqual(wcDecodeEntities('Rock &amp; Roll'), 'Rock & Roll');
    assert.strictEqual(wcDecodeEntities('Caf&eacute;'), 'Café');
    assert.strictEqual(wcDecodeEntities('&#65;&#66;&#67;'), 'ABC');
    assert.strictEqual(wcDecodeEntities('no entities here'), 'no entities here');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll word-cascade tests passed');
  }
}

console.log('word-cascade engine: wcInit/wcStep/wcTagQA/wcDecodeEntities isolated unit tests');
main();
