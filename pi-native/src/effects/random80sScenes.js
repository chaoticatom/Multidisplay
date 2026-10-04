// Random 80s: a shuffled run of 80s scenes, each about 14 s, crossfading
// into the next:
//   wireframe - green vector shapes turning over an arcade starfield
//   memphis   - pastel Memphis-design squiggles, zigzags, dots and triangles
//   cassette  - a mixtape with spinning reels and tape winding across
//   neon      - a flickering two-tube neon sign (RAD, 1985, TOTALLY, ...)
//   blocks    - falling-block pieces stacking up and clearing rows
//   vhs       - a VHS tape: colour bars, scanlines, tracking glitches, PLAY
// Same on every cube side face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');
const stroke = require('./strokeFont');
const { FONT_3x5, drawString, textWidth } = require('./text');

const SCENE_S = 14, FADE_S = 1.2;
const NAMES = ['wireframe', 'memphis', 'cassette', 'neon', 'blocks', 'vhs'];
const st = { order: [], idx: 0, t0: 0, prev: null, cur: null, buf: null, prevBuf: null, blocks: null, word: 'RAD' };
const hash = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

function shuffle() { st.order = NAMES.slice().sort(() => Math.random() - 0.5); st.idx = 0; }

// ── Scenes draw into a plain target { W, H, set, add } ─────────────────────
function line(c, x0, y0, x1, y1, r, g, b) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
  for (let i = 0; i <= n; i++) c.add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, g, b);
}

const SHAPES = {
  cube: { v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
  pyramid: { v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], [0, -1.2, 0]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]] },
};
function wireframe(c, t) {
  const { W, H } = c;
  for (let k = 0; k < 40; k++) { // starfield rushing out
    const a = hash(k) * 6.283, d = ((hash(k + 9) + t * 0.15) % 1), x = W / 2 + Math.cos(a) * d * W * 0.7, y = H / 2 + Math.sin(a) * d * H * 0.7;
    c.add(x, y, d * 0.6, d * 0.6, d * 0.7);
  }
  const shapes = W > H * 1.5 ? [['cube', W * 0.3], ['pyramid', W * 0.7]] : [[Math.floor(t / 7) % 2 ? 'pyramid' : 'cube', W / 2]];
  for (const [name, cx] of shapes) {
    const sh = SHAPES[name], S = Math.min(W, H) * 0.22, ay = t * 0.9, ax = t * 0.6;
    const P = sh.v.map(([x, y, z]) => {
      let X = x * Math.cos(ay) + z * Math.sin(ay), Z = -x * Math.sin(ay) + z * Math.cos(ay);
      let Y = y * Math.cos(ax) - Z * Math.sin(ax); Z = y * Math.sin(ax) + Z * Math.cos(ax);
      const f = 3 / (Z + 4); return [cx + X * S * f, H / 2 + Y * S * f];
    });
    for (const [a, b] of sh.e) line(c, P[a][0], P[a][1], P[b][0], P[b][1], 0.2, 1, 0.35);
  }
  // Ground grid line.
  for (let x = 0; x < W; x += 2) c.add(x, H - 2, 0.05, 0.4, 0.1);
}

function memphis(c, t) {
  const { W, H } = c;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.98, 0.9, 0.82); // paper
  const ink = [[1, 0.35, 0.55], [0.2, 0.8, 0.85], [1, 0.85, 0.2], [0.45, 0.35, 0.9], [0.1, 0.1, 0.15]];
  const scroll = t * 4;
  for (let k = 0; k < 14; k++) {
    const col = ink[k % ink.length], x0 = ((hash(k) * W * 1.4 - scroll * (0.5 + hash(k + 3))) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2, y0 = hash(k + 5) * H;
    const kind = k % 4, s = 3 + hash(k + 7) * 5;
    if (kind === 0) for (let i = 0; i < 14; i++) c.set(x0 + i, y0 + Math.sin(i * 0.9 + t) * 2, ...col); // squiggle
    else if (kind === 1) for (let i = 0; i < 12; i++) c.set(x0 + i, y0 + (i % 4 < 2 ? i % 2 : 1 - i % 2) * 3, ...col); // zigzag
    else if (kind === 2) for (let j = -s; j <= s; j++) for (let i = -s; i <= s; i++) { if (Math.abs(i) + Math.abs(j) * 0 <= s - Math.abs(j) && j >= -s / 2) c.set(x0 + i, y0 + j, ...col); } // triangle
    else for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) c.set(x0 + i * 3, y0 + j * 3, ...col); // dot grid
  }
}

function cassette(c, t) {
  const { W, H } = c, S = Math.min(W, H);
  const bw = Math.min(W - 4, S * 1.5), bh = bw * 0.62, x0 = (W - bw) / 2, y0 = (H - bh) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.06, 0.02, 0.08);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { // shell
    const edge = x < 1 || y < 1 || x >= bw - 1 || y >= bh - 1;
    const label = y > bh * 0.1 && y < bh * 0.62 && x > bw * 0.08 && x < bw * 0.92;
    const stripe = label && (y < bh * 0.2 ? [1, 0.4, 0.6] : y < bh * 0.27 ? [1, 0.7, 0.3] : [0.95, 0.93, 0.85]);
    const col = edge ? [0.5, 0.5, 0.55] : stripe || [0.15, 0.15, 0.18];
    c.set(x0 + x, y0 + y, ...col);
  }
  // Window and reels.
  const wy = y0 + bh * 0.42, R = bh * 0.14;
  for (let x = bw * 0.28; x < bw * 0.72; x++) for (let y = -R * 1.1; y < R * 1.1; y++) c.set(x0 + x, wy + y, 0.08, 0.06, 0.05);
  const unwind = (t % 20) / 20;
  for (const [fx, wound] of [[0.36, 1 - unwind], [0.64, unwind]]) {
    const cx = x0 + bw * fx, rr = R * (0.45 + wound * 0.55);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j);
      if (d <= rr && d > R * 0.42) c.set(cx + i, wy + j, 0.35, 0.2, 0.1); // tape
      if (d <= R * 0.42) { const a = Math.atan2(j, i) + t * 4; c.set(cx + i, wy + j, ...(Math.cos(a * 6) > 0.3 ? [0.9, 0.9, 0.9] : [0.4, 0.4, 0.42])); } // hub teeth
    }
  }
  drawString(FONT_3x5, 'MIX 85', Math.round(x0 + bw * 0.12), Math.round(y0 + bh * 0.13), (x, y) => c.set(x, y, 0.1, 0.1, 0.2));
}

const WORDS = ['RAD', '1985', 'TOTALLY', 'NEON', 'ARCADE', 'AWESOME'];
function neon(c, t) {
  const { W, H } = c;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const brick = ((y % 6 === 0) || ((x + (Math.floor(y / 6) % 2) * 5) % 10 === 0)) ? 0.012 : 0.03; c.set(x, y, brick * 1.2, brick * 0.6, brick * 0.8); }
  const word = st.word;
  let h = Math.min(H * 0.42, (W - 6) / (word.length * 0.95)), w = stroke.textWidth(word, h);
  if (w > W - 4) { h *= (W - 4) / w; w = stroke.textWidth(word, h); }
  const flick = Math.sin(t * 37) > 0.97 || (t % 6 > 5.6 && Math.sin(t * 80) > 0) ? 0.25 : 1;
  const x0 = Math.round((W - w) / 2), y0 = Math.round(H * 0.5 - h / 2);
  // The stroke font is costly, so the sign (glow + tube) is drawn once per
  // word into a cached image and only blitted with the flicker each frame.
  const key = word + '|' + W + '|' + H;
  if (!st.neonCache || st.neonCache.key !== key) {
    const img = new Float32Array(W * H * 3);
    const tgt = { W, H, set(x, y, r, g, b) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = Math.max(img[o], r); img[o + 1] = Math.max(img[o + 1], g); img[o + 2] = Math.max(img[o + 2], b); },
      add(x, y, r, g, b) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] += r; img[o + 1] += g; img[o + 2] += b; },
      get(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const o = (y * W + x) * 3; return [img[o], img[o + 1], img[o + 2]]; } };
    const glow = { ...tgt, set: tgt.add };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) stroke.drawText(glow, word, x0 + dx, y0 + dy, h, [0.25, 0.04, 0.15]);
    stroke.drawText(tgt, word, x0, y0, h, [1, 0.35, 0.8]);
    st.neonCache = { key, img };
  }
  const img = st.neonCache.img;
  for (let i = 0, n = W * H; i < n; i++) {
    const o = i * 3; if (!img[o] && !img[o + 1] && !img[o + 2]) continue;
    c.add(i % W, Math.floor(i / W), img[o] * flick, img[o + 1] * flick, img[o + 2] * flick);
  }
  const sub = 'OPEN', sx = Math.round((W - textWidth(FONT_3x5, sub)) / 2);
  drawString(FONT_3x5, sub, sx, Math.min(H - 6, y0 + Math.round(h) + 3), (x, y) => c.set(x, y, 0.2, 0.9 * (0.6 + 0.4 * Math.sin(t * 3)), 1));
}

const PIECES = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]]];
const PCOL = [[0.2, 0.9, 1], [1, 0.9, 0.2], [0.75, 0.3, 1], [0.3, 1, 0.4], [1, 0.3, 0.3], [0.3, 0.45, 1], [1, 0.6, 0.15]];
function blocks(c, t, dt) {
  const { W, H } = c, B = 4, cols = Math.floor(W / B), rows = Math.floor(H / B);
  let s = st.blocks;
  if (!s || s.cols !== cols || s.rows !== rows) s = st.blocks = { cols, rows, g: new Array(cols * rows).fill(-1), p: null, acc: 0 };
  const fits = (p, ox, oy) => p.cells.every(([x, y]) => { const X = x + ox, Y = y + oy; return X >= 0 && X < cols && Y < rows && (Y < 0 || s.g[Y * cols + X] < 0); });
  if (!s.p) { const k = Math.floor(Math.random() * 7); s.p = { cells: PIECES[k], k, x: Math.floor(Math.random() * (cols - 3)), y: -2 }; if (!fits(s.p, s.p.x, s.p.y + 1)) s.g.fill(-1); }
  s.acc += dt;
  while (s.acc > 0.12) {
    s.acc -= 0.12;
    if (fits(s.p, s.p.x, s.p.y + 1)) s.p.y++;
    else {
      s.p.cells.forEach(([x, y]) => { if (y + s.p.y >= 0) s.g[(y + s.p.y) * cols + x + s.p.x] = s.p.k; });
      for (let y = rows - 1; y >= 0; y--) if (s.g.slice(y * cols, y * cols + cols).every((v) => v >= 0)) { s.g.splice(y * cols, cols); s.g.unshift(...new Array(cols).fill(-1)); y++; }
      s.p = null; break;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.02, 0.02, 0.05);
  const cell = (X, Y, k) => { const col = PCOL[k]; for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) { const sh = (i === 0 || j === 0) ? 1.3 : (i === B - 1 || j === B - 1) ? 0.55 : 1; c.set(X * B + i, Y * B + j, Math.min(1, col[0] * sh), Math.min(1, col[1] * sh), Math.min(1, col[2] * sh)); } };
  for (let i = 0; i < s.g.length; i++) if (s.g[i] >= 0) cell(i % cols, Math.floor(i / cols), s.g[i]);
  if (s.p) s.p.cells.forEach(([x, y]) => { if (y + s.p.y >= 0) cell(x + s.p.x, y + s.p.y, s.p.k); });
}

function vhs(c, t) {
  const { W, H } = c;
  const bars = [[0.75, 0.75, 0.75], [0.75, 0.75, 0], [0, 0.75, 0.75], [0, 0.75, 0], [0.75, 0, 0.75], [0.75, 0, 0], [0, 0, 0.75]];
  const glitchY = (t * 23) % H, glitchOn = Math.sin(t * 1.7) > 0.6;
  for (let y = 0; y < H; y++) {
    const shift = glitchOn && Math.abs(y - glitchY) < 3 ? Math.round((hash(Math.floor(t * 30) + y) - 0.5) * 8) : 0;
    const scan = y % 2 ? 0.75 : 1;
    for (let x = 0; x < W; x++) {
      const bx = Math.max(0, Math.min(W - 1, x + shift)), col = bars[Math.floor(bx / W * 7)];
      // Chromatic offset: red sampled one pixel left.
      const colL = bars[Math.floor(Math.max(0, bx - 1) / W * 7)];
      const noise = (hash(x * 13 + y * 7 + Math.floor(t * 24)) - 0.5) * 0.12;
      c.set(x, y, Math.max(0, (colL[0] + noise) * scan), Math.max(0, (col[1] + noise) * scan), Math.max(0, (col[2] + noise) * scan));
    }
  }
  // On-screen display.
  const osd = Math.floor(t * 1.5) % 2 ? 'PLAY >' : 'PLAY';
  for (let y = 1; y < 8; y++) for (let x = 1; x < textWidth(FONT_3x5, 'PLAY >') + 3; x++) c.set(x, y, 0, 0, 0);
  drawString(FONT_3x5, osd, 2, 2, (x, y) => c.set(x, y, 1, 1, 1));
  const clock = '00:' + String(Math.floor(t % 60)).padStart(2, '0');
  drawString(FONT_3x5, clock, W - textWidth(FONT_3x5, clock) - 2, H - 7, (x, y) => c.set(x, y, 1, 1, 1));
}

const SCENES = { wireframe, memphis, cassette, neon, blocks, vhs };

module.exports = defineCanvasEffect({
  render(c, { t, dt }) {
    const W = c.W, H = c.H, n = W * H * 3;
    if (!st.buf || st.buf.length !== n) { st.buf = new Float32Array(n); st.prevBuf = new Float32Array(n); shuffle(); st.t0 = t; st.cur = st.order[0]; }
    if (t - st.t0 > SCENE_S) {
      st.prev = st.cur; st.idx++; if (st.idx >= st.order.length) shuffle();
      st.cur = st.order[st.idx]; st.t0 = t; st.word = WORDS[Math.floor(Math.random() * WORDS.length)];
    }
    const target = (b) => ({
      W, H,
      set(x, y, r, g, bb) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; b[o] = r; b[o + 1] = g; b[o + 2] = bb; },
      add(x, y, r, g, bb) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; b[o] += r; b[o + 1] += g; b[o + 2] += bb; },
      get(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const o = (y * W + x) * 3; return [b[o], b[o + 1], b[o + 2]]; },
    });
    const local = t - st.t0;
    st.buf.fill(0); SCENES[st.cur](target(st.buf), t, dt);
    const fade = st.prev && local < FADE_S ? local / FADE_S : 1;
    if (fade < 1) { st.prevBuf.fill(0); SCENES[st.prev](target(st.prevBuf), t, 0); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      let r = st.buf[o], g = st.buf[o + 1], b = st.buf[o + 2];
      if (fade < 1) { r = r * fade + st.prevBuf[o] * (1 - fade); g = g * fade + st.prevBuf[o + 1] * (1 - fade); b = b * fade + st.prevBuf[o + 2] * (1 - fade); }
      c.set(x, y, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
  },
});
module.exports.getStatus = () => ({ scene: st.cur });
