// "AI Art": shows pixel art the AI made (see src/ai.js). The art lives in
// state.effectOptions.ai_art.art, so it reaches the render worker like any
// other option: { w, h, palette: ['#rrggbb'...], frames: [[row strings]],
// fps }. Each row character is a palette index in hex (0-f); '.' is off.
//
// Presentation: the picture floats gently on a dark backdrop with a soft
// glow in its own colours, casts a shadow, and when it's scaled up enough
// each art pixel is drawn as a small bevelled tile (lit top-left) so it
// reads like a physical mosaic. Same on every cube side face; fills a flat
// panel. Until the AI has drawn something, a shaded pixel heart beats.
'use strict';
const { defineCanvasEffect } = require('./canvas');

// 16x16 heart with a highlight; frame 2 darkens the outline and dims the
// shine for a heartbeat pulse.
const DEFAULT_ART = {
  w: 16, h: 16, fps: 2.2,
  palette: ['#5a0a1e', '#b0123c', '#ff2d64', '#ff8fb0', '#ffffff'],
  frames: [
    ['................', '................', '...1111..1111...', '..122221122221..', '.12333222222221.', '.12342222222221.', '.12322222222221.', '.12222222222221.', '..122222222221..', '...1222222221...', '....12222221....', '.....122221.....', '......1221......', '.......11.......', '................', '................'],
    ['................', '................', '...0000..0000...', '..022220022220..', '.02222222222220.', '.02232222222220.', '.02222222222220.', '.02222222222220.', '..022222222220..', '...0222222220...', '....02222220....', '.....022220.....', '......0220......', '.......00.......', '................', '................'],
  ],
};

function parseColour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const cache = { src: null, pal: [], avg: [0.3, 0.1, 0.3] };
function current(core) {
  const art = (core.effectOptions && core.effectOptions.ai_art && core.effectOptions.ai_art.art) || DEFAULT_ART;
  if (cache.src !== art) {
    cache.src = art; cache.pal = (art.palette || []).map(parseColour);
    // Average colour of the picture, for the backdrop glow.
    let r = 0, g = 0, b = 0, n = 0;
    for (const row of art.frames[0] || []) for (const ch of row) { const c = ch !== '.' && cache.pal[parseInt(ch, 16)]; if (c) { r += c[0]; g += c[1]; b += c[2]; n++; } }
    cache.avg = n ? [r / n, g / n, b / n] : [0.3, 0.1, 0.3];
  }
  const n = art.frames.length;
  const f = n > 1 ? Math.floor(core.t * (art.fps || 4)) % n : 0;
  return { art, rows: art.frames[f], pal: cache.pal, avg: cache.avg };
}
function pixel(rows, pal, x, y) {
  const ch = (rows[y] || '')[x];
  if (!ch || ch === '.') return null;
  return pal[parseInt(ch, 16)] || null;
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const { art, rows, pal, avg } = current(core);
    const W = c.W, H = c.H;
    const scale = Math.max(1, Math.floor(Math.min((W - 4) / art.w, (H - 6) / art.h)));
    const aw = art.w * scale, ah = art.h * scale;
    const bob = scale >= 3 ? Math.round(Math.sin(t * 1.4) * 1.2) : 0;
    const ox = Math.floor((W - aw) / 2), oy = Math.floor((H - ah) / 2) + bob - 1;
    // Backdrop: near-black with a slow glow in the picture's colours.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - W / 2) / W, (y - H / 2) / H);
      const gl = Math.max(0, 0.55 - d) * (0.28 + 0.07 * Math.sin(t * 0.8));
      c.set(x, y, 0.01 + avg[0] * gl, 0.01 + avg[1] * gl, 0.02 + avg[2] * gl);
    }
    // Shadow below/right of the picture.
    const so = Math.max(1, Math.round(scale * 0.6)) + Math.max(0, -bob);
    for (let ay = 0; ay < art.h; ay++) for (let ax = 0; ax < art.w; ax++) {
      if (!pixel(rows, pal, ax, ay)) continue;
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
        const x = ox + ax * scale + i + so, y = oy + ay * scale + j + so, o = c.get(x, y);
        if (o) c.set(x, y, o[0] * 0.35, o[1] * 0.35, o[2] * 0.35);
      }
    }
    // The art: bevelled tiles when there's room, plain pixels otherwise.
    for (let ay = 0; ay < art.h; ay++) for (let ax = 0; ax < art.w; ax++) {
      const col = pixel(rows, pal, ax, ay); if (!col) continue;
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
        // Embossed: light only where the shape's edge faces up/left, shade
        // where it faces down/right, so the picture looks raised off the
        // backdrop without a waffle pattern across flat areas.
        let sh = 1;
        if (scale >= 2) {
          const edgeW = Math.max(1, Math.floor(scale / 3));
          if (j < edgeW && !pixel(rows, pal, ax, ay - 1)) sh = 1.3;
          else if (i < edgeW && !pixel(rows, pal, ax - 1, ay)) sh = 1.18;
          else if (j >= scale - edgeW && !pixel(rows, pal, ax, ay + 1)) sh = 0.6;
          else if (i >= scale - edgeW && !pixel(rows, pal, ax + 1, ay)) sh = 0.72;
        }
        c.set(ox + ax * scale + i, oy + ay * scale + j, Math.min(1, col[0] * sh), Math.min(1, col[1] * sh), Math.min(1, col[2] * sh));
      }
    }
  },
});
module.exports.DEFAULT_ART = DEFAULT_ART;
