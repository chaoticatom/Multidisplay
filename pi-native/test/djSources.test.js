'use strict';
// Auto-DJ sources and hook-up: YouTube playlist/search parsing, settings,
// and the radio treating 'dj:' as a station.
const assert = require('assert');
const { EventEmitter } = require('events');
const { youtubeTracks } = require('../src/dj/sources');
const prefs = require('../src/prefs');

const fakeSpawn = (json) => () => { const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; setImmediate(() => { p.stdout.emit('data', JSON.stringify(json)); p.emit('close', 0); }); return p; };

(async () => {
  try {
    const list = await youtubeTracks('90s house', fakeSpawn({ entries: [{ id: 'abcdefghijk', title: 'Song One', duration: 240 }, { id: 'bad id!', title: 'x' }, { id: 'zzzzzzzzzzz', title: 'Too long mix', duration: 3600 }] }));
    assert.deepStrictEqual(list, [{ kind: 'yt', id: 'abcdefghijk', title: 'Song One' }], 'valid ids, songs under 10 minutes');
    assert.deepStrictEqual(prefs.clean(null).dj, { source: 'both', youtube: '', mixBeats: 'auto', quick: false, style: 'auto', endless: true });
    assert.deepStrictEqual(prefs.clean({ dj: { source: 'youtube', youtube: ' https://youtube.com/playlist?list=X ', mixBeats: 64 } }).dj, { source: 'youtube', youtube: 'https://youtube.com/playlist?list=X', mixBeats: 64, quick: false, style: 'auto', endless: true });
    assert.strictEqual(prefs.clean({ dj: { source: 'spotify', mixBeats: 7 } }).dj.source, 'both');
    // The radio launches the Auto-DJ for 'dj:' (no spawned ffmpeg), and stops it.
    const { RadioAudio } = require('../src/effects/radio/ffmpegAudio');
    const spawned = [];
    const audio = new RadioAudio((cmd) => { spawned.push(cmd); const p = new EventEmitter(); p.stdin = Object.assign(new EventEmitter(), { writable: true, write() { return true; }, end() {} }); p.stderr = new EventEmitter(); p.kill = () => {}; return p; });
    audio.ensure('dj:');
    assert.ok(audio.dj && audio.decodeProc && audio.decodeProc.isDj, 'the Auto-DJ is running');
    assert.ok(!spawned.includes('ffmpeg'), 'no station decode for the Auto-DJ');
    audio.ensure(null);
    assert.strictEqual(audio.dj.status.state, 'stopped');
    audio.close();
    console.log('djSources ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
