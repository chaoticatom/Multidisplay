// Now Playing: the radio station on show - a spinning record with a glow
// that breathes with the bass, a ring of live spectrum bars around it,
// and the station name scrolling underneath. Falls back to a gentle
// "Pick a station" card when nothing is playing.
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, drawGlyph, textWidth } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const radio = require('./radio');

let spin = 0, scroll = 0;

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    c.clear();
    const st = radio.getStatus();
    const playing = st.playing && st.station;
    const bass = core.audio && core.audio.bass ? core.audio.bass : 0;
    const spec = radio.audio && radio.audio.spec;
    const S = Math.min(c.W, c.H), cx = c.W / 2, cy = S * 0.42, R = S * 0.24;
    spin += dt * (playing ? 1.6 : 0.2);
    const hue = 0.75 + 0.1 * Math.sin(t * 0.1);
    for (let y = 0; y < c.H; y++) {
      for (let x = 0; x < c.W; x++) {
        const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < R) {
          // Record: grooves, a coloured label, a highlight that turns.
          if (d < R * 0.3) { const [r, g, b] = hsl(hue, 0.8, d < R * 0.07 ? 0.05 : 0.5); c.set(x, y, r, g, b); continue; }
          const groove = 0.07 + 0.05 * ((d | 0) % 2);
          const shine = Math.max(0, Math.cos(Math.atan2(dy, dx) * 2 - spin)) * 0.12;
          c.set(x, y, groove + shine, groove + shine, groove + shine * 1.2);
        } else {
          const glow = Math.max(0, 1 - (d - R) / (R * (0.5 + bass))) * (0.25 + bass * 0.5);
          const [r, g, b] = hsl(hue, 0.9, 0.5);
          c.set(x, y, r * glow * 0.6, g * glow * 0.6, b * glow * 0.6);
        }
      }
    }
    // Spectrum ring.
    if (spec && playing) {
      const bars = 48;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const v = spec[Math.floor((Math.abs(i - bars / 2) / (bars / 2)) * (spec.length - 1) * 0.8)] || 0;
        const len = R * (0.15 + v * 0.7);
        const [r, g, b] = hsl(hue + i / bars * 0.4, 0.95, 0.55);
        for (let k = 0; k < len; k += 0.7) c.set(cx + Math.cos(a) * (R + 2 + k), cy + Math.sin(a) * (R + 2 + k), r, g, b);
      }
    }
    // Station name.
    const label = playing ? (st.station.name.replace(/^[\s-]+/, '') + (st.station.genre ? ' · ' + st.station.genre : '')).toUpperCase() : 'PICK A STATION';
    const scale = Math.max(1, Math.floor(c.H / 40));
    const y0 = Math.round(c.H - 8 * scale);
    const w = textWidth(FONT_3x5, label + '   ', scale) + FONT_3x5.adv * scale;
    const fits = textWidth(FONT_3x5, label, scale) <= c.W - 2;
    scroll = fits ? 0 : (scroll + dt * 14 * scale) % w;
    const startX = fits ? Math.round((c.W - textWidth(FONT_3x5, label, scale)) / 2) : -Math.floor(scroll);
    for (let start = startX; start < c.W; start += fits ? Infinity : w) {
      let x = start;
      for (const ch of label + (fits ? '' : '   ')) {
        if (x > c.W) break;
        x += drawGlyph(FONT_3x5, ch, x, y0, (px, py) => c.set(px, py, 0.95, 0.95, 1), { scale });
      }
    }
  },
});
