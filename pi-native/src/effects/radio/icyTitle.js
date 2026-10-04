// The song now playing, from the station's own stream: most internet radio
// sends it as Shoutcast/Icecast ("ICY") metadata when asked with the
// `Icy-MetaData: 1` header - a "StreamTitle='Artist - Song';" block every
// icy-metaint bytes of audio. fetchTitle() reads up to the first block and
// disconnects, so it costs one metaint's worth of audio (8-32 KB).
// Resolves to the title, or '' when the station doesn't send one.
'use strict';

const http = require('http');
const https = require('https');

const MAX_METAINT = 256 * 1024;

function parseStreamTitle(block) {
  const m = /StreamTitle='((?:[^']|'(?!;))*)';/.exec(block);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 120);
}

function fetchTitle(url, { timeoutMs = 8000, redirects = 3, get = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, req) => { if (done) return; done = true; try { req && req.destroy(); } catch (e) { /* closed */ } resolve(v); };
    let u;
    try { u = new URL(url); } catch (e) { resolve(''); return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { resolve(''); return; }
    const doGet = get || (u.protocol === 'https:' ? https.get : http.get);
    const req = doGet(u, { headers: { 'Icy-MetaData': '1', 'User-Agent': 'Multidisplay' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        done = true; try { req.destroy(); } catch (e) { /* closed */ }
        fetchTitle(new URL(res.headers.location, u).href, { timeoutMs, redirects: redirects - 1, get }).then(resolve);
        return;
      }
      const metaint = parseInt(res.headers['icy-metaint'], 10);
      if (res.statusCode !== 200 || !(metaint > 0 && metaint <= MAX_METAINT)) { finish('', req); return; }
      let skip = metaint, need = -1, meta = Buffer.alloc(0);
      res.on('data', (chunk) => {
        let off = 0;
        while (off < chunk.length && !done) {
          if (skip > 0) { const n = Math.min(skip, chunk.length - off); skip -= n; off += n; continue; }
          if (need < 0) { need = chunk[off] * 16; off++; if (need === 0) { finish('', req); return; } continue; }
          const n = Math.min(need - meta.length, chunk.length - off);
          meta = Buffer.concat([meta, chunk.subarray(off, off + n)]); off += n;
          if (meta.length >= need) { finish(parseStreamTitle(meta.toString('utf8')), req); return; }
        }
      });
      res.on('end', () => finish('', req));
      res.on('error', () => finish('', req));
    });
    req.on('error', () => finish('', req));
    req.on('socket', (sock) => { if (sock.unref) sock.unref(); }); // never keeps the process alive
    req.setTimeout(timeoutMs, () => finish('', req));
  });
}

module.exports = { fetchTitle, parseStreamTitle };
