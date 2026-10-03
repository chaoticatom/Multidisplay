// A small vector font for large, smooth text: digits and capitals drawn as
// anti-aliased strokes (lines and curves) instead of scaled-up pixels, so a
// clock filling a wall keeps clean, round shapes. Glyphs live in a 4 x 6
// box (y down). Used by the clock; small text still uses the pixel fonts.
'use strict';

function arc(cx, cy, rx, ry, a0, a1, steps = 14) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}
const ell = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, 0, 360, 24);

const G = {
  0: [ell(2, 3, 2, 3)],
  1: [[[0.9, 1.1], [2, 0], [2, 6]], [[0.9, 6], [3.1, 6]]],
  2: [[...arc(2, 1.6, 2, 1.6, -180, 30), [0, 6], [4, 6]]],
  3: [arc(2, 1.5, 1.9, 1.5, -160, 90), arc(2, 4.5, 2, 1.5, -90, 160)],
  4: [[[3, 6], [3, 0], [0, 4.2], [4, 4.2]]],
  5: [[[3.8, 0], [0.4, 0], [0.2, 2.9]], arc(2, 4.2, 2, 1.8, -138, 150)],
  6: [arc(2, 3.2, 2, 2.9, -55, -180), arc(2, 4.3, 2, 1.7, 180, 540, 24)],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [ell(2, 1.5, 1.7, 1.5), ell(2, 4.5, 2, 1.5)],
  9: [ell(2, 1.7, 2, 1.7), [[4, 1.7], [3.7, 4], [2.6, 6]]],
  ':': [[[0.5, 1.8], [0.5, 1.81]], [[0.5, 4.2], [0.5, 4.21]]],
  '.': [[[0.5, 5.8], [0.5, 5.81]]],
  ',': [[[0.6, 5.6], [0.2, 6.6]]],
  '/': [[[3.6, 0], [0.4, 6]]],
  '-': [[[0.6, 3.2], [3.4, 3.2]]],
  '+': [[[0.6, 3.2], [3.4, 3.2]], [[2, 1.8], [2, 4.6]]],
  "'": [[[1, 0], [1, 1.4]]],
  '%': [[[3.8, 0], [0.2, 6]], ell(0.9, 1, 0.7, 0.9), ell(3.1, 5, 0.7, 0.9)],
  '!': [[[1, 0], [1, 4]], [[1, 5.8], [1, 5.81]]],
  '?': [[...arc(2, 1.5, 1.8, 1.5, -170, 90), [2, 4]], [[2, 5.8], [2, 5.81]]],
  '&': [[[4, 6], [0.6, 2], ...arc(1.6, 1.2, 1, 1.2, 180, 360), [0.4, 4.2], ...arc(1.7, 4.8, 1.3, 1.2, 180, 60), [3.8, 3.2]]],
  A: [[[0, 6], [2, 0], [4, 6]], [[0.7, 4], [3.3, 4]]],
  B: [[[0, 6], [0, 0], [2.6, 0], ...arc(2.6, 1.5, 1.4, 1.5, -90, 90), [0, 3]], [[0, 3], [2.7, 3], ...arc(2.7, 4.5, 1.3, 1.5, -90, 90), [0, 6]]],
  C: [arc(2.2, 3, 2.1, 3, -45, -315)],
  D: [[[1.8, 0], [0, 0], [0, 6], [1.8, 6], ...arc(1.8, 3, 2.2, 3, 90, -90)]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[...arc(2.2, 3, 2.1, 3, -40, -320), [4.2, 3.3], [2.4, 3.3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  J: [[[4, 0], ...arc(2, 4.4, 2, 1.6, 0, 180)]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.5], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.6], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [ell(2, 3, 2, 3)],
  P: [[[0, 6], [0, 0], [2.6, 0], ...arc(2.6, 1.6, 1.4, 1.6, -90, 90), [0, 3.2]]],
  R: [[[0, 6], [0, 0], [2.6, 0], ...arc(2.6, 1.6, 1.4, 1.6, -90, 90), [0, 3.2]], [[2, 3.2], [4, 6]]],
  S: [[...arc(2, 1.5, 2, 1.5, -20, -270), ...arc(2, 4.5, 2, 1.5, -90, 160)]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], ...arc(2, 4.2, 2, 1.8, 180, 0), [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Q: [ell(2, 3, 2, 3), [[2.6, 4.4], [4.2, 6.2]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
};
const ADV = { ':': 1.6, '.': 1.6, ',': 1.6, "'": 2, '!': 2.2, ' ': 3 };
const advance = (ch) => ADV[ch] ?? 5.2;

function textWidth(text, h) { const k = h / 6; let w = 0; for (const ch of text) w += advance(ch) * k; return w - 1.2 * k; }

// Draws `text` with its top-left at (x, y), cap height h pixels, stroke
// `weight` pixels, brighten-only through c.get/c.set (c = canvas.js-style
// target with get(x,y) -> [r,g,b] | null).
function drawText(c, text, x, y, h, col, weight = Math.max(1.2, h / 7)) {
  const k = h / 6, r = weight / 2;
  for (const ch of String(text).toUpperCase()) {
    const strokes = G[ch];
    if (strokes) {
      const segs = [];
      for (const st of strokes) for (let i = 0; i + 1 < st.length; i++) segs.push([x + st[i][0] * k, y + st[i][1] * k, x + st[i + 1][0] * k, y + st[i + 1][1] * k]);
      const x0 = Math.floor(x - r - 1), x1 = Math.ceil(x + 4.4 * k + r + 1), y0 = Math.floor(y - r - 1), y1 = Math.ceil(y + 6 * k + r + 1);
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        let d = Infinity;
        for (const [ax, ay, bx, by] of segs) {
          const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
          const e = Math.hypot(px - ax - dx * t, py - ay - dy * t);
          if (e < d) d = e;
        }
        const cover = Math.max(0, Math.min(1, r + 0.5 - d));
        if (cover <= 0) continue;
        const o = c.get(px, py); if (!o) continue;
        c.set(px, py, Math.max(o[0], col[0] * cover), Math.max(o[1], col[1] * cover), Math.max(o[2], col[2] * cover));
      }
    }
    x += advance(ch) * k;
  }
}

module.exports = { drawText, textWidth };
