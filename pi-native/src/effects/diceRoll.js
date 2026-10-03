// Dice Roll, redesigned: 1-3 rounded dice on a felt table, with soft
// anti-aliased edges, shading, a highlight and a drop shadow. A roll makes
// them tumble - spinning, bouncing and flicking through faces - then settle
// with a little bounce; with more than one die the total shows below.
// Options (effectOptions.dice): rollToken (bumped by Roll Dice), autoRoll,
// count (1-3), colour ('ivory' | 'red' | 'black' | 'blue').
'use strict';
const { defineCanvasEffect } = require('./canvas');
const stroke = require('./strokeFont');
const { FONT_3x5, drawGlyph, textWidth } = require('./text');

const ROLL_S = 1.3, AUTO_S = 4;
const COLOURS = { ivory: [[0.95, 0.93, 0.86], [0.08, 0.08, 0.1]], red: [[0.85, 0.12, 0.15], [1, 1, 1]], black: [[0.12, 0.12, 0.14], [1, 1, 1]], blue: [[0.15, 0.35, 0.9], [1, 1, 1]] };
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const st = { dice: [], t0: -10, lastToken: undefined, lastAuto: 0 };
const roll = () => 1 + Math.floor(Math.random() * 6);

function startRoll(n, t) {
  st.t0 = t;
  st.dice = Array.from({ length: n }, (_, i) => ({ value: roll(), spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6), delay: i * 0.08, face: roll() }));
}

function drawDie(c, cx, cy, size, ang, value, col, pipCol) {
  const half = size / 2, rad = size * 0.18, ca = Math.cos(-ang), sa = Math.sin(-ang);
  const reach = half * 1.45 + 2;
  // Shadow, offset down-right.
  for (let y = Math.floor(cy - reach); y <= cy + reach + 3; y++) for (let x = Math.floor(cx - reach); x <= cx + reach + 3; x++) {
    const sx = x - cx - size * 0.08, sy = y - cy - size * 0.1, d = Math.hypot(sx, sy);
    const k = Math.max(0, 1 - d / (half * 1.35)) * 0.55, o = c.get(x, y);
    if (o && k > 0) c.set(x, y, o[0] * (1 - k), o[1] * (1 - k), o[2] * (1 - k));
  }
  for (let y = Math.floor(cy - reach); y <= cy + reach; y++) for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
    const dx = x - cx, dy = y - cy, lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
    // Signed distance to a rounded square: smooth anti-aliased rim.
    const qx = Math.abs(lx) - (half - rad), qy = Math.abs(ly) - (half - rad);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
    const cover = Math.max(0, Math.min(1, 0.5 - sd));
    if (cover <= 0) continue;
    // Lighting: brighter towards the top-left, a soft bevel near the edge.
    const light = 0.82 + 0.25 * (-(lx + ly) / size) + (sd > -size * 0.08 ? -0.12 : 0.05);
    let r = col[0] * light, g = col[1] * light, b = col[2] * light;
    for (const [px, py] of PIPS[value]) {
      const pd = Math.hypot(lx - px * size * 0.26, ly - py * size * 0.26), pr = size * 0.095;
      const pc = Math.max(0, Math.min(1, pr + 0.5 - pd));
      if (pc > 0) { r = r * (1 - pc) + pipCol[0] * pc; g = g * (1 - pc) + pipCol[1] * pc; b = b * (1 - pc) + pipCol[2] * pc; }
    }
    const o = c.get(x, y); if (!o) continue;
    c.set(x, y, o[0] * (1 - cover) + Math.min(1, r) * cover, o[1] * (1 - cover) + Math.min(1, g) * cover, o[2] * (1 - cover) + Math.min(1, b) * cover);
  }
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const o = (core.effectOptions && core.effectOptions.dice) || {};
    const n = Math.max(1, Math.min(3, Number(o.count) || 2));
    if (!st.dice.length || st.dice.length !== n) startRoll(n, t);
    if (o.rollToken !== undefined && o.rollToken !== st.lastToken) { if (st.lastToken !== undefined) startRoll(n, t); st.lastToken = o.rollToken; }
    if (o.autoRoll && t - st.t0 > AUTO_S + ROLL_S) startRoll(n, t);
    const [col, pipCol] = COLOURS[o.colour] || COLOURS.ivory;
    // Felt table: green with a soft vignette.
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      const v = 1 - Math.hypot((x - c.W / 2) / c.W, (y - c.H / 2) / c.H) * 1.1;
      const n2 = ((x * 7 + y * 13) % 5) * 0.004;
      c.set(x, y, 0.02 + n2, (0.16 + n2) * v + 0.02, (0.07 + n2) * v);
    }
    const totalH = n > 1 ? Math.max(5, Math.round(c.H * 0.16)) : 0;
    const size = Math.min((c.W - 6) / (n * 1.35), (c.H - totalH - 6) * 0.62);
    const elapsed = t - st.t0;
    let settled = true;
    st.dice.forEach((d, i) => {
      const e = Math.max(0, elapsed - d.delay), p = Math.min(1, e / ROLL_S);
      if (p < 1) settled = false;
      // Bounce: decaying hops; spin slows to a stop; faces flick while rolling.
      const hop = Math.abs(Math.sin(p * Math.PI * 3.5)) * (1 - p) * size * 0.7;
      const ang = d.spin * (1 - p) * (1 - p) * 0.6;
      if (p < 0.85 && Math.floor(e * 14) !== d.lastFlick) { d.lastFlick = Math.floor(e * 14); d.face = roll(); }
      const face = p < 0.85 ? d.face : d.value;
      const slot = (i + 0.5) / n, cx = c.W * slot + (1 - p) * Math.sin(e * 7 + i) * size * 0.25;
      const cy = (c.H - totalH) / 2 - hop;
      drawDie(c, cx, cy, size * (1 + (1 - p) * 0.08), ang, face, col, pipCol);
    });
    if (n > 1 && settled) {
      const s = 'TOTAL ' + st.dice.reduce((a, d) => a + d.value, 0), y = c.H - totalH;
      if (totalH >= 9) stroke.drawText(c, s, Math.round((c.W - stroke.textWidth(s, totalH - 2)) / 2), y, totalH - 2, [0.95, 0.85, 0.4]);
      else { let x = Math.round((c.W - textWidth(FONT_3x5, s)) / 2); for (const ch of s) x += drawGlyph(FONT_3x5, ch, x, y, (px, py) => c.set(px, py, 0.95, 0.85, 0.4)); }
    }
  },
});
module.exports.getStatus = () => (st.dice.length ? { values: st.dice.map((d) => d.value) } : null);
