// Countdown: days, hours, minutes and seconds to a date you choose, with
// its name above ("BIRTHDAY", "HOLIDAY"...). A ring of lights fills as the
// final day runs out; at zero the display bursts into confetti and shows
// "IT'S TIME" for ten minutes, then "DONE". Same on every cube side face;
// fills a flat panel.
// Options (effectOptions.countdown): target ('YYYY-MM-DDTHH:MM', local
// time), label.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');
const stroke = require('./strokeFont');
const { FONT_3x5, FONT_5x7, drawString, textWidth } = require('./text');

const st = { confetti: [] };
const pad = (n) => String(n).padStart(2, '0');

function centred(c, font, text, y, col) {
  drawString(font, text, Math.round((c.W - textWidth(font, text)) / 2), y, (x, yy) => c.set(x, yy, col[0], col[1], col[2]));
}
function big(c, text, y, h, col) {
  let w = stroke.textWidth(text, h);
  if (w > c.W - 4) { h *= (c.W - 4) / w; w = stroke.textWidth(text, h); }
  stroke.drawText(c, text, Math.round((c.W - w) / 2), y, h, col);
  return h;
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const o = (core.effectOptions && core.effectOptions.countdown) || {};
    const W = c.W, H = c.H;
    const target = o.target ? new Date(o.target) : null;
    const label = String(o.label || 'COUNTDOWN').toUpperCase().slice(0, 16);
    // Background: deep blue fading to violet.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.01 + y / H * 0.03, 0.01, 0.04 + y / H * 0.04);
    if (!target || isNaN(target)) {
      centred(c, FONT_3x5, 'SET A DATE', Math.round(H / 2) - 6, [0.8, 0.8, 0.9]);
      centred(c, FONT_3x5, 'IN OPTIONS', Math.round(H / 2) + 2, [0.5, 0.5, 0.6]);
      return;
    }
    const left = Math.round((target - Date.now()) / 1000);
    const titleCol = hsl((t * 0.03) % 1, 0.8, 0.65);
    centred(c, FONT_3x5, label, 2, titleCol);
    if (left > 0) {
      const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
      const glow = 0.85 + 0.15 * Math.sin(t * 2);
      if (d > 0) {
        const bh = Math.max(9, Math.round(H * 0.34));
        big(c, String(d), Math.round(H * 0.18), bh, [glow, glow * 0.85, 0.4]);
        centred(c, FONT_3x5, d === 1 ? 'DAY' : 'DAYS', Math.round(H * 0.18 + bh + 2), [0.7, 0.7, 0.8]);
        centred(c, FONT_5x7, `${pad(h)}:${pad(m)}:${pad(s)}`, H - 10, [0.5, 0.85, 1]);
      } else {
        // Final day: big clock and a ring of lights that fills as it runs out.
        const bh = Math.max(9, Math.round(H * 0.3));
        big(c, h > 0 ? `${h}:${pad(m)}` : `${m}:${pad(s)}`, Math.round(H / 2 - bh / 2), bh, [glow, 0.6 * glow, 0.3]);
        if (h > 0) centred(c, FONT_3x5, pad(s), Math.round(H / 2 + bh / 2 + 3), [0.6, 0.6, 0.7]);
        const frac = 1 - left / 86400, n = 48, R = Math.min(W, H) * 0.46;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2, lit = i / n < frac;
          const col = lit ? hsl(i / n * 0.15, 1, 0.55) : [0.06, 0.06, 0.1];
          c.set(W / 2 + Math.cos(a) * R * (W / Math.min(W, H)) * 0.95, H / 2 + Math.sin(a) * R, col[0], col[1], col[2]);
        }
      }
      st.confetti.length = 0;
      return;
    }
    // Zero: confetti and the message.
    if (left > -600) {
      if (st.confetti.length < W * 1.2) for (let k = 0; k < 4; k++) st.confetti.push({ x: Math.random() * W, y: -2, vy: 8 + Math.random() * 14, vx: (Math.random() - 0.5) * 6, col: hsl(Math.random(), 1, 0.6) });
      for (const p of st.confetti) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > H) { p.y = -2; p.x = Math.random() * W; } c.set(p.x, p.y, p.col[0], p.col[1], p.col[2]); }
      const pulse = 0.7 + 0.3 * Math.sin(t * 6);
      big(c, "IT'S TIME", Math.round(H * 0.38), Math.max(9, Math.round(H * 0.22)), [pulse, pulse * 0.8, 0.3]);
    } else {
      centred(c, FONT_5x7, 'DONE', Math.round(H / 2) - 3, [0.6, 0.6, 0.7]);
    }
  },
});
