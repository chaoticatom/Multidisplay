// Tests for src/effects/audioFeatures.js ("React to music").
const assert = require('assert');
const { createFeatureState, updateFeatures, reactDt, pulseBuffer, BASS_END, MID_END } = require('../src/effects/audioFeatures');
const { BAND_COUNT } = require('../src/effects/radio/fft');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const spec = (bass, mid, treble) => { const s = new Float32Array(BAND_COUNT); s.fill(bass, 0, BASS_END); s.fill(mid, BASS_END, MID_END); s.fill(treble, MID_END); return s; };

console.log('audioFeatures');
test('no audio: inactive, and React to music changes nothing', () => {
  const f = updateFeatures(createFeatureState(), null, 1 / 60);
  assert.strictEqual(f.active, false);
  assert.strictEqual(reactDt(f, 0.016, 1), 0.016);
  const buf = new Float32Array([0.5, 0.5]); pulseBuffer(f, buf, 1); assert.deepStrictEqual([...buf], [0.5, 0.5]);
});
test('bass/mid/treble come from the right parts of the spectrum', () => {
  const f = updateFeatures(createFeatureState(), spec(0.8, 0.3, 0.1), 1 / 60);
  assert.ok(Math.abs(f.bass - 0.8) < 1e-6 && Math.abs(f.mid - 0.3) < 1e-6 && Math.abs(f.treble - 0.1) < 1e-6);
});
test('a kick after quiet bass fires a beat that then decays', () => {
  const f = createFeatureState();
  for (let i = 0; i < 60; i++) updateFeatures(f, spec(0.2, 0.2, 0.2), 1 / 60);
  updateFeatures(f, spec(0.9, 0.2, 0.2), 1 / 60);
  assert.strictEqual(f.beat, 1);
  for (let i = 0; i < 10; i++) updateFeatures(f, spec(0.2, 0.2, 0.2), 1 / 60);
  assert.ok(f.beat < 0.4);
});
test('steady loud bass is not a stream of beats', () => {
  const f = createFeatureState();
  let beats = 0;
  for (let i = 0; i < 180; i++) { updateFeatures(f, spec(0.8, 0.3, 0.3), 1 / 60); if (f.beat === 1) beats++; }
  assert.ok(beats <= 1, `${beats} beats`);
});
test('with music, effects run faster on bass and the frame pulses', () => {
  const f = updateFeatures(createFeatureState(), spec(0.8, 0.5, 0.4), 1 / 60);
  assert.ok(reactDt(f, 0.016, 1) > 0.016);
  const buf = new Float32Array([0.5]); pulseBuffer(f, buf, 1); assert.ok(buf[0] !== 0.5);
});
console.log(process.exitCode ? 'Some audioFeatures tests FAILED' : 'All audioFeatures tests passed');
