// Draw: finger-paint on the phone and it appears live on the display.
// The phone keeps the picture and sends it here:
//   applyOps({ image })  - the whole picture: base64 RGB bytes, w x h
//   applyOps({ ops })    - brush dabs as they're drawn: [x, y, 0xRRGGBB, size]
//                          (size 0 = eraser dab of size 1..)
//   applyOps({ clear })  - wipe it
// Saved drawings live in drawings.json (written by the main thread, see
// wsCommands.js saveDrawing); with the "Slideshow" option the effect shows
// them in turn instead of the live picture. Like radio/video, this module
// is a per-thread singleton: wsServer relays the commands to the render
// worker (see its effectCommandRelay).
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'drawings.json');
const MAX = 256;

let W = 64, H = 64, pix = new Uint8Array(W * H * 3);

function resize(w, h) {
  w = Math.max(1, Math.min(MAX * 6, w | 0)); h = Math.max(1, Math.min(MAX * 6, h | 0));
  if (w === W && h === H) return;
  W = w; H = h; pix = new Uint8Array(W * H * 3);
}

function decodeImage(b64, w, h) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  return buf.length === w * h * 3 ? buf : null;
}

function applyOps(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (Number.isFinite(msg.w) && Number.isFinite(msg.h)) resize(msg.w, msg.h);
  if (msg.clear) pix.fill(0);
  if (msg.image) { const b = decodeImage(msg.image, W, H); if (b) pix.set(b); }
  if (Array.isArray(msg.ops)) {
    for (const op of msg.ops.slice(0, 4000)) {
      if (!Array.isArray(op)) continue;
      const [x, y, col, size] = op, s = Math.max(1, Math.min(6, size | 0) || 1);
      const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
      const x0 = Math.round(x - (s - 1) / 2), y0 = Math.round(y - (s - 1) / 2);
      for (let yy = y0; yy < y0 + s; yy++) for (let xx = x0; xx < x0 + s; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = (yy * W + xx) * 3; pix[i] = r; pix[i + 1] = g; pix[i + 2] = b;
      }
    }
  }
}

// Saved drawings, re-read when the file changes.
let saved = [], savedMtime = 0;
function loadSaved() {
  try {
    const m = fs.statSync(FILE).mtimeMs;
    if (m !== savedMtime) { savedMtime = m; const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); saved = Array.isArray(j) ? j : []; }
  } catch (e) { saved = []; savedMtime = 0; }
  return saved;
}

let showT = 0, showIdx = 0, showBuf = null, showFor = null;
function currentPicture(opts, dt) {
  if (!opts || !opts.slideshow) return { buf: pix, w: W, h: H };
  const list = loadSaved();
  if (!list.length) return { buf: pix, w: W, h: H };
  showT += dt;
  const secs = Math.max(3, Math.min(600, Number(opts.secs) || 10));
  if (showT > secs || !showBuf) { if (showBuf) showIdx++; showT = 0; showFor = null; }
  const d = list[showIdx % list.length];
  if (showFor !== d) { showFor = d; showBuf = decodeImage(d.image, d.w, d.h); }
  return showBuf ? { buf: showBuf, w: d.w, h: d.h } : { buf: pix, w: W, h: H };
}

function sample(p, X, Y, OW, OH) {
  // Nearest pixel when the picture and the target differ in size.
  const sx = Math.min(p.w - 1, Math.floor(X * p.w / OW)), sy = Math.min(p.h - 1, Math.floor(Y * p.h / OH));
  const i = (sy * p.w + sx) * 3;
  return [p.buf[i] / 255, p.buf[i + 1] / 255, p.buf[i + 2] / 255];
}

function drawCube(core, dt) {
  const p = currentPicture(core.effectOptions && core.effectOptions.draw, dt), S = core.SIZE;
  // The same picture on each side face; face rows run bottom-up (see text.js).
  for (let face = 0; face < 4; face++) for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const c = sample(p, u, S - 1 - v, S, S); core.setFaceLED(face, u, v, c[0], c[1], c[2]);
  }
}
function drawWall(core, dt) {
  if (!core.wallW) return;
  const p = currentPicture(core.effectOptions && core.effectOptions.draw, dt);
  for (let y = 0; y < core.wallH; y++) for (let x = 0; x < core.wallW; x++) {
    const c = sample(p, x, y, core.wallW, core.wallH); core.setWallPixel(x, y, c[0], c[1], c[2]);
  }
}

drawCube.wall = drawWall;
drawCube.applyOps = applyOps;
drawCube.getStatus = () => ({ w: W, h: H, saved: loadSaved().length });
drawCube.FILE = FILE;
module.exports = drawCube;
