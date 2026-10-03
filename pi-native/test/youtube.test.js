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
// A blocked first attempt is retried with other YouTube clients.
(async () => {
  let calls = 0;
  const { EventEmitter } = require('events');
  const spawn = () => { calls++; const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setImmediate(() => { if (calls < 2) { p.stderr.emit('data', 'ERROR: [youtube] abc: The page needs to be reloaded.'); p.emit('close', 1); } else { p.stdout.emit('data', 'https://x/v.mp4'); p.emit('close', 0); } }); return p; };
  try { const u = await require('../src/youtube').resolve('abcDEF12345', spawn); require('assert').strictEqual(u, 'https://x/v.mp4'); console.log('  ok - retries with another client after a block'); }
  catch (e) { console.error('  FAIL - retry', e.message); process.exitCode = 1; }
})();

// Seek offset and real-time pacing ride on the stream URL.
{
  const { inputOptions } = require('../src/youtube');
  const a = inputOptions('https://r1.googlevideo.com/v?x=1#mdss=95');
  assert.deepStrictEqual(a, { url: 'https://r1.googlevideo.com/v?x=1', opts: ['-re', '-ss', '95'] });
  assert.deepStrictEqual(inputOptions('http://radio.example/stream'), { url: 'http://radio.example/stream', opts: [] });
  assert.deepStrictEqual(inputOptions('https://r1.googlevideo.com/v#mdss=0').opts, ['-re']);
}

// Signing in with a cookies.txt passes --cookies to yt-dlp.
{
  const os = require('os'), fs = require('fs'), path = require('path');
  const f = path.join(os.tmpdir(), 'ytc-' + process.pid + '.txt');
  process.env.YT_COOKIE_FILE = f;
  delete require.cache[require.resolve('../src/youtube')];
  const yt = require('../src/youtube');
  assert.throws(() => yt.saveCookies('hello'));
  yt.saveCookies('.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc\n');
  assert.strictEqual(yt.signedIn(), true);
  let seen = null;
  const { EventEmitter } = require('events');
  const fake = (cmd, args) => { seen = args; const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; setImmediate(() => { p.stdout.emit('data', '{"entries":[]}'); p.emit('close', 0); }); return p; };
  yt.search('x', fake).then(() => {
    assert.deepStrictEqual(seen.slice(0, 2), ['--cookies', f]);
    yt.signOut();
    assert.strictEqual(yt.signedIn(), false);
    delete process.env.YT_COOKIE_FILE;
  }).catch((e) => { console.error(e); process.exitCode = 1; });
}
