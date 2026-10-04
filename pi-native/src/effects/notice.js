// Notification banner drawn over whatever is showing (see /api/notify in
// src/httpApi.js): a dark band across the middle with the text scrolling
// through it, for state.notice = { text, color: '#rrggbb', until (ms) }.
// style 'note' (a message sent from the phone) is a sticky note instead:
// it drops in, sways gently, wraps the text over a few lines and lifts
// away at the end.
'use strict';
const { FONT_5x7, FONT_3x5, drawGlyph, drawString, textWidth } = require('./text');
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
    // Compare by content: the render worker gets a fresh copy of the state
    // every second, so the object itself changes even for the same notice.
    const k = n.text + '|' + n.until;
    if (shown !== k) { shown = k; scroll = -c.W; }
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

// Greedy word wrap to lines of at most `max` characters.
function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const w = word.length > max ? word.slice(0, max) : word;
    if (!line) line = w; else if (line.length + 1 + w.length <= max) line += ' ' + w; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

let noteT = 0, noteFor = null;
const note = defineCanvasEffect({
  speed: 0,
  render(c, { dt, core }) {
    const n = core._notice;
    const k = n.text + '|' + n.until; // by content - see the banner above
    if (noteFor !== k) { noteFor = k; noteT = 0; }
    noteT += dt;
    const left = (n.until - Date.now()) / 1000;
    // Pick the font that fits: 5x7 for short notes, 3x5 for longer ones.
    const margin = 4, inner = Math.min(c.W, 64) - margin * 2 - 4;
    let font = FONT_5x7, lines = wrap(String(n.text).toUpperCase(), Math.floor(inner / FONT_5x7.adv));
    if (lines.length > 4) { font = FONT_3x5; lines = wrap(String(n.text).toUpperCase(), Math.floor(inner / FONT_3x5.adv)).slice(0, 7); }
    const lineH = font.h + 2, w = Math.min(c.W - 2, inner + 6), h = lines.length * lineH + 7;
    // Drop in with a little bounce, lift away in the last half second.
    const ease = (t) => 1 - Math.pow(1 - Math.min(1, t), 3);
    const inT = ease(noteT / 0.6), bounce = Math.sin(Math.min(1, noteT / 0.6) * Math.PI) * 3;
    const outT = left < 0.5 ? (0.5 - Math.max(0, left)) / 0.5 : 0;
    const restY = Math.round((c.H - h) / 2);
    const y0 = Math.round(-h + (restY + h) * inT - bounce * (1 - inT) - outT * (restY + h + 4));
    const sway = Math.round(Math.sin(noteT * 1.3) * 1.2);
    const x0 = Math.round((c.W - w) / 2) + sway;
    const [r, g, b] = colour(n.color);
    // Shadow, paper, darker folded corner.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.set(x0 + x + 1, y0 + y + 1, 0, 0, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fold = x + (h - 1 - y) < 4;
      const shade = 0.55 + 0.12 * (y / h);
      if (x + (h - 1 - y) < 2) continue; // the cut corner
      c.set(x0 + x, y0 + y, r * (fold ? 0.35 : shade), g * (fold ? 0.35 : shade), b * (fold ? 0.35 : shade));
    }
    // Pin at the top.
    c.set(x0 + Math.floor(w / 2), y0, 1, 0.2, 0.2); c.set(x0 + Math.floor(w / 2), y0 + 1, 0.7, 0.1, 0.1);
    let ty = y0 + 4;
    for (const line of lines) {
      const tx = x0 + Math.round((w - textWidth(font, line)) / 2);
      drawString(font, line, tx, ty, (px, py) => c.set(px, py, 0.08, 0.06, 0.12));
      ty += lineH;
    }
  },
});

function renderNotice(core, state, mode, dt) {
  const n = state.notice;
  if (!n || !n.text || Date.now() > n.until) return;
  core._notice = n;
  const fx = n.style === 'note' ? note : banner;
  if (mode === 'wall') fx.wall(core, dt); else fx(core, dt);
}

module.exports = { renderNotice };
