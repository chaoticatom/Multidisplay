// Timer visuals for a flat panel / wall (the cube versions in alarms.js draw
// on the four side faces). One canvas, core.wallBuf, wallW x wallH:
//   sunrise(core, p, startPct, giant) - sky from night to day with a sun
//       rising from below the bottom edge (p 0..1; run backwards it's the
//       wind-down sunset)
//   countdown(core, "mm:ss")          - small digits at the bottom
//   message(core, text, level)        - centred, word-wrapped, shadowed
'use strict';
const { drawString, textWidth, FONT_3x5, FONT_5x7, wallPlot } = require('./text');

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (t) => t * t * (3 - 2 * t);
const NIGHT_TOP = [0.01, 0.01, 0.05], DAY_TOP = [0.16, 0.36, 0.8];
const NIGHT_LOW = [0.05, 0.02, 0.08], DAWN_LOW = [0.9, 0.3, 0.08], DAY_LOW = [1.0, 0.78, 0.5];

function clear(core) { if (core.wallBuf) core.wallBuf.fill(0); }

function sunrise(core, p, startPct = 5, giant = false) {
  const W = core.wallW, H = core.wallH;
  if (!W || !H) return;
  p = Math.max(0, Math.min(1, p));
  const lowCol = p < 0.5 ? mix3(NIGHT_LOW, DAWN_LOW, smooth(p * 2)) : mix3(DAWN_LOW, DAY_LOW, smooth(p * 2 - 1));
  const topCol = mix3(NIGHT_TOP, DAY_TOP, smooth(Math.max(0, p * 1.3 - 0.3)));
  const R = Math.min(W, H) * (giant ? 0.42 : 0.15) * (1 + 0.15 * p);
  const cx = W / 2, cy = H + R - p * (H * 0.55 + R); // below the bottom edge -> ~45% up
  const sunCol = mix3([1, 0.35, 0.05], [1, 0.95, 0.75], smooth(p));
  const starFade = Math.max(0, 1 - p * 2.5);
  const floor = 0; // the brightness ramp (startPct..100%) is applied at push time
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1 || 1);
    const sky = mix3(topCol, lowCol, Math.pow(v, 1.6 - p * 0.6));
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let r = sky[0], g = sky[1], b = sky[2];
      const glow = Math.max(0, 1 - d / (R * 3.2));
      const gl = glow * glow * (0.55 + 0.45 * p);
      r += sunCol[0] * gl; g += sunCol[1] * gl * 0.8; b += sunCol[2] * gl * 0.5;
      if (d < R) { const e = Math.min(1, (R - d) / 1.5); r = mix(r, sunCol[0], e); g = mix(g, sunCol[1], e); b = mix(b, sunCol[2], e); }
      if (starFade > 0 && v < 0.6) {
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (h % 97 === 0) { const tw = starFade * (0.5 + 0.5 * Math.sin(Date.now() / 600 + h)); r += tw * 0.6; g += tw * 0.6; b += tw * 0.7; }
      }
      core.setWallPixel(x, y, Math.min(1, r + floor), Math.min(1, g + floor), Math.min(1, b + floor));
    }
  }
}

function countdown(core, str) {
  const W = core.wallW, H = core.wallH;
  if (!W || !H) return;
  const x = Math.round((W - textWidth(FONT_3x5, str)) / 2), y = H - FONT_3x5.h - 2;
  drawString(FONT_3x5, str, x + 1, y + 1, wallPlot(core, 0, 0, 0));
  drawString(FONT_3x5, str, x, y, wallPlot(core, 0.85, 0.85, 0.9));
}

// Greedy word wrap to lines no wider than maxW pixels.
function wrap(font, text, maxW, scale) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textWidth(font, t, scale) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function message(core, text, level = 1) {
  const W = core.wallW, H = core.wallH;
  if (!W || !H || !text) return;
  const clean = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\w\s!.,?:'-]/g, '').trim();
  if (!clean) return;
  let scale = 2, lines = wrap(FONT_5x7, clean, W - 4, 2);
  if (lines.length * 8 * 2 > H - 10 || lines.some((l) => textWidth(FONT_5x7, l, 2) > W - 2)) { scale = 1; lines = wrap(FONT_5x7, clean, W - 2, 1); }
  const lineH = (FONT_5x7.h + 2) * scale;
  let y = Math.round((H - lines.length * lineH) / 2);
  const c = Math.max(0, Math.min(1, level));
  for (const line of lines) {
    const x = Math.round((W - textWidth(FONT_5x7, line, scale)) / 2);
    // A dark outline keeps it readable on the bright sun as well as the sky.
    drawString(FONT_5x7, line, x, y, wallPlot(core, c, c * 0.55, c * 0.12), { scale, outline: wallPlot(core, 0.04, 0.01, 0) });
    y += lineH;
  }
}

module.exports = { sunrise, countdown, message, clear, wrap };
