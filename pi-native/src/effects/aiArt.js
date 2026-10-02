// "AI Art": shows pixel art the AI made (see src/ai.js). The art lives in
// state.effectOptions.ai_art.art, so it reaches the render worker like any
// other option: { w, h, palette: ['#rrggbb'...], frames: [[row strings]],
// fps }. Each row character is a palette index in hex (0-f); '.' is off.
// The picture is scaled up to fill each cube face, or the whole flat wall.
'use strict';

const DEFAULT_ART = {
  w: 8, h: 8, fps: 2,
  palette: ['#ff3d7f', '#ffd23d'],
  frames: [
    ['........', '.00..00.', '00000000', '00000000', '.000000.', '..0000..', '...00...', '........'],
    ['........', '.11..11.', '11111111', '11111111', '.111111.', '..1111..', '...11...', '........'],
  ],
};

function parseColour(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const cache = { src: null, pal: [] };
function current(core) {
  const art = (core.effectOptions && core.effectOptions.ai_art && core.effectOptions.ai_art.art) || DEFAULT_ART;
  if (cache.src !== art) { cache.src = art; cache.pal = (art.palette || []).map(parseColour); }
  const n = art.frames.length;
  const f = n > 1 ? Math.floor(core.t * (art.fps || 4)) % n : 0;
  return { art, rows: art.frames[f], pal: cache.pal };
}
function pixel(rows, pal, x, y) {
  const ch = (rows[y] || '')[x];
  if (!ch || ch === '.') return null;
  return pal[parseInt(ch, 16)] || null;
}

function aiArt(core, dt) {
  core.t += dt;
  const { art, rows, pal } = current(core);
  const S = core.SIZE;
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < S; v++) {
      const y = Math.floor(((S - 1 - v) * art.h) / S); // faces count v upwards
      for (let u = 0; u < S; u++) {
        const c = pixel(rows, pal, Math.floor((u * art.w) / S), y);
        if (c) core.setFaceLED(face, u, v, c[0], c[1], c[2]); else core.setFaceLED(face, u, v, 0, 0, 0);
      }
    }
  }
}

aiArt.wall = function aiArtWall(core, dt) {
  core.t += dt;
  if (!core.wallW) return;
  const { art, rows, pal } = current(core);
  const W = core.wallW, H = core.wallH;
  const scale = Math.min(W / art.w, H / art.h);
  const ox = (W - art.w * scale) / 2, oy = (H - art.h * scale) / 2;
  for (let y = 0; y < H; y++) {
    const ay = Math.floor((y - oy) / scale);
    for (let x = 0; x < W; x++) {
      const ax = Math.floor((x - ox) / scale);
      const c = ax >= 0 && ay >= 0 && ax < art.w && ay < art.h ? pixel(rows, pal, ax, ay) : null;
      if (c) core.setWallPixel(x, y, c[0], c[1], c[2]); else core.setWallPixel(x, y, 0, 0, 0);
    }
  }
};

module.exports = aiArt;
module.exports.DEFAULT_ART = DEFAULT_ART;
