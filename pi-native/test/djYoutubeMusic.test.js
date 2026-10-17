'use strict';
// Auto-DJ + YouTube Music: proper names, music search first, radio (similar
// songs), the library picker and the fetch-once cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const src = require('../src/dj/sources');

// A fake yt-dlp: answers by the URL it's asked for; "downloads" write a file.
function fakeYt(answers, calls) {
  return (cmd, args) => {
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    const url = args[args.length - 1]; calls.push({ cmd, args, url });
    setImmediate(() => {
      if (cmd === 'ffmpeg') { fs.writeFileSync(url, Buffer.alloc(60000)); p.emit('close', 0); return; } // the download: writes its output file
      if (args.includes('-g')) { p.stdout.emit('data', 'https://media.example/audio?id=' + url.match(/v=([\w-]+)/)[1] + '\n'); p.emit('close', 0); return; }
      const key = Object.keys(answers).find((k) => url.includes(k));
      if (!key) { p.stderr.emit('data', 'ERROR: nope'); p.emit('close', 1); return; }
      p.stdout.emit('data', JSON.stringify(answers[key])); p.emit('close', 0);
    });
    return p;
  };
}

(async () => {
  try {
    assert.strictEqual(src.prettyTitle({ title: 'Blinding Lights', channel: 'The Weeknd - Topic' }), 'The Weeknd – Blinding Lights');
    assert.strictEqual(src.prettyTitle({ title: 'Daft Punk - One More Time (Official Video)', channel: 'Daft Punk' }), 'Daft Punk - One More Time');
    // A search asks YouTube Music for songs first.
    const songs = { entries: [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'song000000' + i, title: 'Song ' + i, channel: 'Artist - Topic', duration: 200 })) };
    let calls = [];
    const t = await src.youtubeTracks('house', fakeYt({ 'music.youtube.com/search': songs }, calls));
    assert.strictEqual(t.length, 6); assert.strictEqual(t[0].title, 'Artist – Song 1');
    assert.ok(calls[0].url.startsWith('https://music.youtube.com/search?q=house'));
    // Radio: YouTube's mix for a song, without the song itself.
    calls = [];
    const r = await src.youtubeRadio('abcdefghijk', fakeYt({ 'list=RDAMVMabcdefghijk': { entries: [{ id: 'abcdefghijk', title: 'Seed' }, { id: 'zzzzzzzzzz1', title: 'Like it' }] } }, calls));
    assert.deepStrictEqual(r.map((x) => x.id), ['zzzzzzzzzz1']);
    // The fetch-once cache: a second ask doesn't download again; Premium format first.
    calls = [];
    fs.rmSync(src.CACHE_DIR, { recursive: true, force: true });
    const spawn = fakeYt({}, calls);
    const f1 = await src.fetchYoutube('cachetest01', spawn), f2 = await src.fetchYoutube('cachetest01', spawn);
    assert.strictEqual(f1, f2); assert.strictEqual(calls.filter((c) => c.cmd === 'ffmpeg').length, 1, 'downloaded once');
    assert.ok(calls[0].args.includes('bestaudio[ext=m4a]/bestaudio/best'), 'best audio-only stream');
    assert.ok(/\.mka$/.test(f1), 'saved as Matroska: ' + f1);
    const inp = await src.inputFor({ kind: 'yt', id: 'cachetest01' }, spawn);
    assert.strictEqual(inp.url, f1, 'playback reads the cached file');
    // Half-finished pieces never count as the song.
    fs.writeFileSync(require('path').join(src.CACHE_DIR, 'partialtest.m4a.part-Frag2'), 'x');
    fs.writeFileSync(require('path').join(src.CACHE_DIR, 'partialtest.m4a.ytdl'), 'x');
    calls = []; const f3 = await src.fetchYoutube('partialtest', fakeYt({}, calls));
    assert.ok(/partialtest\.mka$/.test(f3) && calls.some((c) => c.cmd === 'ffmpeg'), 'pieces ignored, the song downloaded: ' + f3);
    src.dropCached('partialtest'); assert.ok(!fs.readdirSync(src.CACHE_DIR).some((f) => f.startsWith('partialtest')), 'dropped with its pieces');
    // Only the last few are kept.
    for (let i = 0; i < 7; i++) await src.fetchYoutube('cachetrim0' + i, spawn);
    assert.ok(fs.readdirSync(src.CACHE_DIR).length <= 5, 'old ones deleted');
    fs.rmSync(src.CACHE_DIR, { recursive: true, force: true });
    console.log('  ok - YouTube Music: names, search, radio, fetch-once cache');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
