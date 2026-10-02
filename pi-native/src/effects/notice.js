// Notification banner drawn over whatever is showing (see /api/notify in
// src/httpApi.js): a dark band across the middle with the text scrolling
// through it, for state.notice = { text, color: '#rrggbb', until (ms) }.
'use strict';
const { FONT_5x7, drawGlyph } = require('./text');
const { defineCanvasEffect } = require('./canvas');

let scroll = 0, shown = null;

function colour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffd23d;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const banner = defineCanvasEffect({
  speed: 0,
  render(c, { dt, core }) {
    const n = core._notice;
    if (shown !== n) { shown = n; scroll = -c.W; }
    const scale = Math.max(1, Math.floor(c.H / 24));
    const band = 11 * scale, top = Math.round((c.H - band) / 2);
    const [r, g, b] = colour(n.color);
    for (let y = top; y < top + band; y++) for (let x = 0; x < c.W; x++) c.set(x, y, r * 0.08, g * 0.08, b * 0.08);
    for (let x = 0; x < c.W; x++) { c.set(x, top, r, g, b); c.set(x, top + band - 1, r, g, b); }
    const text = String(n.text).toUpperCase(), adv = FONT_5x7.adv * scale, w = text.length * adv;
    scroll += dt * 26 * scale;
    if (scroll > w) scroll = -c.W;
    const fits = w <= c.W;
    let x = fits ? Math.round((c.W - w) / 2) : -Math.floor(scroll);
    for (const ch of text) {
      if (x > c.W) break;
      drawGlyph(FONT_5x7, ch, x, top + 2 * scale, (px, py) => c.set(px, py, 1, 1, 1), { scale });
      x += adv;
    }
  },
});

function renderNotice(core, state, mode, dt) {
  const n = state.notice;
  if (!n || !n.text || Date.now() > n.until) return;
  core._notice = n;
  if (mode === 'wall') banner.wall(core, dt); else banner(core, dt);
}

module.exports = { renderNotice };
