// The song title from a station's ICY metadata (src/effects/radio/icyTitle.js),
// against a local fake station.
'use strict';
const assert = require('assert');
const http = require('http');
const { fetchTitle, parseStreamTitle } = require('../src/effects/radio/icyTitle');
console.log('icyTitle');

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/moved') { res.writeHead(302, { Location: '/live' }); res.end(); return; }
    if (req.url === '/plain') { res.writeHead(200); res.end(Buffer.alloc(100)); return; }
    assert.strictEqual(req.headers['icy-metadata'], '1');
    const metaint = 64, text = "StreamTitle='Daft Punk - One More Time';StreamUrl='';";
    const block = Buffer.alloc(Math.ceil(text.length / 16) * 16); block.write(text);
    res.writeHead(200, { 'icy-metaint': String(metaint) });
    // Audio arrives in odd-sized pieces, so the parser must stitch them.
    const all = Buffer.concat([Buffer.alloc(metaint, 7), Buffer.from([block.length / 16]), block, Buffer.alloc(metaint, 7)]);
    let off = 0; const iv = setInterval(() => { if (off >= all.length) { clearInterval(iv); res.end(); return; } res.write(all.subarray(off, off + 13)); off += 13; }, 1);
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.strictEqual(await fetchTitle(base + '/live'), 'Daft Punk - One More Time');
    console.log('  ok - reads the song title from the stream');
    assert.strictEqual(await fetchTitle(base + '/moved'), 'Daft Punk - One More Time');
    console.log('  ok - follows a redirect');
    assert.strictEqual(await fetchTitle(base + '/plain'), '');
    console.log('  ok - a station without titles gives none');
    assert.strictEqual(parseStreamTitle("StreamTitle='It''s ok';"), "It''s ok");
    assert.strictEqual(await fetchTitle('ftp://x'), '');
    console.log('  ok - odd input is handled');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
  server.close();
})();
