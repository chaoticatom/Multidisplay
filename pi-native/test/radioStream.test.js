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

if (!process.exitCode) console.log('\nAll radioStream tests passed');
