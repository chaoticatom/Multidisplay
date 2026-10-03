// YouTube via yt-dlp (faked here): search parses results, resolve returns
// the stream URL, a missing yt-dlp gives a clear install hint.
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const yt = require('../src/youtube');
function fakeSpawn(stdout, code = 0, enoent = false) {
  return () => {
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setImmediate(() => { if (enoent) { const e = new Error('spawn yt-dlp ENOENT'); e.code = 'ENOENT'; p.emit('error', e); return; } p.stdout.emit('data', stdout); p.emit('close', code); });
    return p;
  };
}
(async () => {
  const check = async (name, fn) => { try { await fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } };
  await check('search parses yt-dlp results', async () => {
    const r = await yt.search('lofi', fakeSpawn(JSON.stringify({ entries: [{ id: 'abcDEF12345', title: 'Lofi beats', channel: 'Chill', duration: 125 }, { id: 'bad id!', title: 'x' }] })));
    assert.deepStrictEqual(r, [{ id: 'abcDEF12345', title: 'Lofi beats', channel: 'Chill', duration: 125 }]);
  });
  await check('resolve returns the stream URL', async () => {
    assert.strictEqual(await yt.resolve('abcDEF12345', fakeSpawn('https://example.googlevideo.com/v.mp4\n')), 'https://example.googlevideo.com/v.mp4');
  });
  await check('missing yt-dlp explains how to install it', async () => {
    await assert.rejects(yt.search('x', fakeSpawn('', 0, true)), /sudo apt install yt-dlp/);
  });
  await check('rejects a malformed id', async () => { await assert.rejects(yt.resolve('../../etc', fakeSpawn('')), /bad video id/); });
})();
