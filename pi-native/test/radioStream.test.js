// Internet radio streams (src/effects/radio/ffmpegAudio.js): ffmpeg is told to
// reconnect after a dropped connection, and segmented (HLS) stations such as
// the BBC start with a bigger cushion so they don't stutter (a real report).
const assert = require('assert');
const { streamOptions, segmentedStream } = require('../src/effects/radio/ffmpegAudio');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}

test('http(s) stations reconnect; debug tones and YouTube do not', () => {
  assert.ok(streamOptions('https://ice1.somafm.com/groovesalad-128-mp3').includes('-reconnect'));
  assert.deepStrictEqual(streamOptions('debugloop:aevalsrc=sin(1)'), []);
  assert.deepStrictEqual(streamOptions('https://rr1.googlevideo.com/x'), []);
});

test('segmented stations are recognised', () => {
  assert.ok(segmentedStream('https://as-hls-ww-live.akamaized.net/pool_904/live/ww/bbc_radio_two/bbc_radio_two.isml/bbc_radio_two-audio%3d96000.norewind.m3u8'));
  assert.ok(segmentedStream('http://stream.live.vc.bbcmedia.co.uk/bbc_radio_two'));
  assert.ok(!segmentedStream('https://ice1.somafm.com/groovesalad-128-mp3'));
});

test('Show the time draws on the cube top, over the record', () => {
  // A real report: the record on the top face was drawn after the time.
  const { CubeCore } = require('../src/core');
  const { EFFECTS } = require('../src/effects');
  const top = (clock) => {
    const c = new CubeCore(64); c.effectOptions = { radio: { clock, spectrumOn: true } };
    EFFECTS.radio(c, 1 / 30); EFFECTS.radio(c, 1 / 30);
    let n = 0; for (const i of c.faceMap[4]) if (i >= 0 && c.colBuf[i * 3] > 0.95 && c.colBuf[i * 3 + 1] > 0.85 && c.colBuf[i * 3 + 2] > 0.8) n++;
    return n;
  };
  assert.ok(top(true) > top(false) + 20, 'white digits on the top face');
});

if (!process.exitCode) console.log('\nAll radioStream tests passed');
