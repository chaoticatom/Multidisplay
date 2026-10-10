// Extra HTTP endpoints, called from WsServer._handleHttp before its static
// routes. Returns true when it handled the request.
//   GET  /manifest.json, /icon-192.png, /icon-512.png  home-screen app
//   GET  /api/backup                                    download settings.json (PIN)
//   POST /api/restore                                   replace settings.json, then restart (PIN)
//   POST /api/uploadPhoto?name=                         add a photo for My Photos (PIN)
//   GET|POST /api/notify?token=&text=&secs=&color=      show a banner (notify token)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const settingsStore = require('./settingsStore');
const { PHOTO_DIR } = require('./effects/myPhotos');

const PHOTO_MAX_BYTES = 15 * 1024 * 1024, PHOTO_MAX_FILES = 40, RESTORE_MAX_BYTES = 2 * 1024 * 1024;

function notifyToken() {
  let c = {};
  try { c = JSON.parse(settingsStore.readSectionJson('notify')); } catch (e) { /* none yet */ }
  if (!c.token) { c.token = crypto.randomBytes(9).toString('base64url'); settingsStore.writeSection('notify', c); }
  return c.token;
}
function newNotifyToken() { const token = crypto.randomBytes(9).toString('base64url'); settingsStore.writeSection('notify', { token }); return token; }

// Sent with every state update, so cached: the folder is only re-read when
// its modification time changes (a photo added or removed, by the app or not).
let photoCache = null, photoMtime = -1;
function listPhotos() {
  try {
    const m = fs.statSync(PHOTO_DIR).mtimeMs;
    if (photoCache && m === photoMtime) return photoCache.slice();
    photoCache = fs.readdirSync(PHOTO_DIR).filter((f) => /\.(jpe?g|png|gif|bmp|webp)$/i.test(f)).sort();
    photoMtime = m;
    return photoCache.slice();
  } catch (e) { photoCache = null; photoMtime = -1; return []; }
}
function deletePhoto(name) {
  if (!listPhotos().includes(name)) return false;
  fs.unlinkSync(path.join(PHOTO_DIR, name));
  return true;
}

const icons = {};

const SW_JS = `const OFFLINE = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Multidisplay</title>'
  + '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#06070d;color:#dfe7ff;font:16px system-ui;text-align:center">'
  + '<div><div style="font-size:48px">\\u{1F4A1}</div><h2>Can\\u2019t reach the display</h2><p>Check the Pi is on and your phone is on the same Wi-Fi.</p>'
  + '<button onclick="location.reload()" style="padding:12px 22px;border-radius:14px;border:0;background:#5b7cff;color:#fff;font-size:16px">Try again</button></div>';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } })));
});
`;
async function icon(size, maskable = false) {
  const key = size + (maskable ? 'm' : '');
  if (icons[key]) return icons[key];
  const { Jimp } = require('jimp');
  const img = new Jimp({ width: size, height: size, color: 0x07091aff });
  // An LED grid: rounded dots in a violet-to-cyan sweep.
  // Maskable icons keep the art inside the central safe zone (phones crop
  // them to circles/squircles).
  const pad = maskable ? size * 0.14 : 0;
  const n = 8, cell = (size - pad * 2) / n, r = cell * 0.36;
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const t = (gx + gy) / (2 * n - 2);
    const col = [Math.round(180 * (1 - t) + 40 * t), Math.round(80 * (1 - t) + 220 * t), 255];
    const cx = pad + (gx + 0.5) * cell, cy = pad + (gy + 0.5) * cell;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.setPixelColor(((col[0] << 24) | (col[1] << 16) | (col[2] << 8) | 255) >>> 0, x, y);
    }
  }
  icons[key] = await img.getBuffer('image/png');
  return icons[key];
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (d) => { n += d.length; if (n > max) { reject(new Error('too large')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { try { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); } catch (e) { /* client gone */ } };

// server: the WsServer (state, _broadcast, _stateMsg, pinCfg). auth(req): PIN + same-origin check.
function handle(server, req, res, auth) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method === 'GET' && p === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(JSON.stringify({
      id: '/', name: 'LED Multidisplay', short_name: 'Multidisplay', description: 'Control your LED cube and panels',
      start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
      background_color: '#06070d', theme_color: '#06070d',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }));
    return true;
  }
  // Service worker: needed for "Install app". It only adds an offline page
  // (shown when the Pi can't be reached) - everything else always comes
  // fresh from the Pi, as the page is designed to.
  if (req.method === 'GET' && p === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
    res.end(SW_JS);
    return true;
  }
  const im = /^\/(?:icon-(192|512)|icon-maskable-(512)|apple-touch-icon)\.png$/.exec(p);
  if (req.method === 'GET' && im) {
    icon(Number(im[1] || im[2] || 180), !!im[2]).then((buf) => { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }); res.end(buf); })
      .catch(() => { res.writeHead(500).end(); });
    return true;
  }
  if (p === '/api/notify' && (req.method === 'GET' || req.method === 'POST')) {
    const done = (params) => {
      if (params.get('token') !== notifyToken()) { json(res, 401, { ok: false, error: 'bad token' }); return; }
      const text = (params.get('text') || '').slice(0, 140);
      if (!text) { json(res, 400, { ok: false, error: 'text is required' }); return; }
      const secs = Math.max(2, Math.min(300, Number(params.get('secs')) || 15));
      const color = /^#?[0-9a-f]{6}$/i.test(params.get('color') || '') ? '#' + params.get('color').replace('#', '') : '#ffd23d';
      server.state.notice = { text, color, until: Date.now() + secs * 1000 };
      server._broadcast(server._stateMsg());
      json(res, 200, { ok: true });
    };
    if (req.method === 'GET') done(url.searchParams);
    else readBody(req, 16384).then((b) => {
      let params = new URLSearchParams(url.search);
      const s = b.toString('utf8');
      try { const o = JSON.parse(s); for (const [k, v] of Object.entries(o)) params.set(k, String(v)); } catch (e) { params = new URLSearchParams(url.search + '&' + s); }
      done(params);
    }).catch(() => json(res, 400, { ok: false }));
    return true;
  }
  if (!p.startsWith('/api/backup') && !p.startsWith('/api/restore') && !p.startsWith('/api/uploadPhoto')) return false;
  const denied = auth(req);
  if (denied) { json(res, denied, { ok: false, error: denied === 401 ? 'Control PIN required' : 'Cross-origin request refused' }); return true; }
  if (req.method === 'GET' && p === '/api/backup') {
    let body = '{}';
    try { body = fs.readFileSync(settingsStore.storePath(), 'utf8'); } catch (e) { /* nothing saved yet */ }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="multidisplay-backup.json"', 'Cache-Control': 'no-store' });
    res.end(body);
    return true;
  }
  if (req.method === 'POST' && p === '/api/restore') {
    readBody(req, RESTORE_MAX_BYTES).then((b) => {
      const data = JSON.parse(b.toString('utf8'));
      if (!data || typeof data !== 'object' || !data.sections || typeof data.sections !== 'object') throw new Error('not a Multidisplay backup');
      settingsStore.replaceStore(data);
      json(res, 200, { ok: true });
      console.warn('[backup] settings restored - restarting to load them');
      setTimeout(() => process.exit(75), 800); // systemd restarts the service (Restart=on-failure)
    }).catch((e) => json(res, 400, { ok: false, error: e.message }));
    return true;
  }
  if (req.method === 'POST' && p === '/api/uploadPhoto') {
    const ext = (/\.(jpe?g|png|gif|bmp|webp)$/i.exec(url.searchParams.get('name') || '') || ['.jpg'])[0].toLowerCase();
    readBody(req, PHOTO_MAX_BYTES).then((b) => {
      if (b.length < 32) throw new Error('empty file');
      fs.mkdirSync(PHOTO_DIR, { recursive: true });
      fs.writeFileSync(path.join(PHOTO_DIR, `${Date.now()}${ext}`), b);
      const all = listPhotos();
      while (all.length > PHOTO_MAX_FILES) fs.unlinkSync(path.join(PHOTO_DIR, all.shift()));
      server._broadcast(server._stateMsg());
      json(res, 200, { ok: true, count: listPhotos().length });
    }).catch((e) => json(res, 400, { ok: false, error: e.message === 'too large' ? 'Photo is over 15 MB' : e.message }));
    return true;
  }
  json(res, 404, { ok: false });
  return true;
}

module.exports = { handle, notifyToken, newNotifyToken, listPhotos, deletePhoto };
