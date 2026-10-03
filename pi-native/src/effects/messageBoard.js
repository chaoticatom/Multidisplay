// Message Board: your own message scrolling in big letters, in a choice
// of styles. Options (effectOptions.message): text, style (neon | rainbow
// | retro | fire), speed (0.3-3). Wraps around all four cube side faces.
'use strict';
const { hsl } = require('../core');
const { FONT_5x7, drawGlyph } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const { music } = require('./audioFeatures');

let scroll = 0;

function colourFor(style, x, y, t, H) {
  if (style === 'rainbow') return hsl(x * 0.006 - t * 0.15, 0.95, 0.55);
  if (style === 'retro') return [1, 0.62, 0.1];
  if (style === 'fire') { const f = y / H; return [1, 0.25 + 0.6 * (1 - f), 0.05 * (1 - f)]; }
  return hsl(0.86 + 0.05 * Math.sin(t * 2), 1, 0.6); // neon pink
}

module.exports = defineCanvasEffect({
  panorama: true,
  render(c, { t, dt, core }) {
    const o = (core.effectOptions && core.effectOptions.message) || {};
    const text = (typeof o.text === 'string' && o.text.trim() ? o.text.trim() : 'HELLO!').toUpperCase().slice(0, 120) + '   ';
    const style = o.style || 'neon', speed = Math.max(0.3, Math.min(3, Number(o.speed) || 1));
    const scale = Math.max(1, Math.floor(c.H / 20));
    const gh = 7 * scale, top = Math.round((c.H - gh) / 2);
    const adv = FONT_5x7.adv * scale, tileW = text.length * adv;
    scroll = (scroll + dt * 22 * scale * speed) % tileW;
    // Background: dim, slow, so the letters pop.
    for (let y = 0; y < c.H; y++) {
      const bg = style === 'retro' ? (y % 2 ? 0.0 : 0.03) : 0.025;
      for (let x = 0; x < c.W; x++) c.set(x, y, bg * 0.6, bg * 0.5, bg);
    }
    const glow = style === 'neon' || style === 'rainbow';
    for (let start = -Math.floor(scroll); start < c.W; start += tileW) {
      let x = start;
      for (const ch of text) {
        if (x > c.W) break;
        if (x + adv >= 0) {
          drawGlyph(FONT_5x7, ch, x, top, (px, py) => {
            const [r0, g0, b0] = colourFor(style, px, py - top, t, gh), k = 1 + music(core).beat * 0.5; // pulses on the beat
            const r = Math.min(1, r0 * k), g = Math.min(1, g0 * k), b = Math.min(1, b0 * k);
            c.set(px, py, r, g, b);
            if (glow) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.add(px + dx * scale, py + dy * scale, r * 0.12, g * 0.12, b * 0.12);
          }, { scale });
        }
        x += adv;
      }
    }
  },
});
