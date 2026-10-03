// Word Clock: the classic letter-grid clock - the time is spelled out by
// lighting words ("IT IS HALF PAST TEN"), to the nearest five minutes,
// with the rest of the letters faintly visible. The lit words shimmer
// through a slow rainbow. Same grid on every cube side face; scaled to
// fill a flat wall.
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, drawGlyph } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const { music } = require('./audioFeatures');

const GRID = ['ITLISASAMPM', 'ACQUARTERDC', 'TWENTYFIVEX', 'HALFSTENFTO', 'PASTERUNINE', 'ONESIXTHREE', 'FOURFIVETWO', 'EIGHTELEVEN', 'SEVENTWELVE', 'TENSEOCLOCK'];
const W = {
  IT: [0, 0, 2], IS: [0, 3, 2], A: [1, 0, 1], QUARTER: [1, 2, 7], TWENTY: [2, 0, 6], FIVE_M: [2, 6, 4], HALF: [3, 0, 4], TEN_M: [3, 5, 3], TO: [3, 9, 2], PAST: [4, 0, 4],
  H9: [4, 7, 4], H1: [5, 0, 3], H6: [5, 3, 3], H3: [5, 6, 5], H4: [6, 0, 4], H5: [6, 4, 4], H2: [6, 8, 3], H8: [7, 0, 5], H11: [7, 5, 6], H7: [8, 0, 5], H12: [8, 5, 6], H10: [9, 0, 3], OCLOCK: [9, 5, 6],
};

function litWords(date) {
  const m5 = Math.floor(date.getMinutes() / 5) * 5;
  let h = date.getHours() % 12;
  const words = ['IT', 'IS'];
  const mins = m5 > 30 ? 60 - m5 : m5;
  if (mins === 5) words.push('FIVE_M'); else if (mins === 10) words.push('TEN_M'); else if (mins === 15) words.push('A', 'QUARTER');
  else if (mins === 20) words.push('TWENTY'); else if (mins === 25) words.push('TWENTY', 'FIVE_M'); else if (mins === 30) words.push('HALF');
  if (m5 === 0) words.push('OCLOCK'); else words.push(m5 > 30 ? 'TO' : 'PAST');
  if (m5 > 30) h = (h + 1) % 12;
  words.push('H' + (h === 0 ? 12 : h));
  return words;
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    c.clear();
    const beat = music(core).beat; // lit words glow on the beat
    const on = new Set();
    for (const w of litWords(new Date())) { const [r, col, n] = W[w]; for (let i = 0; i < n; i++) on.add(r * 11 + col + i); }
    // Letters spread evenly over the whole canvas (11 columns x 10 rows), so
    // the grid fills a square panel instead of a narrow block in the middle.
    const cw = c.W / 11, ch = c.H / 10;
    const scale = Math.max(1, Math.floor(Math.min(cw / 4, ch / 6)));
    for (let r = 0; r < 10; r++) {
      for (let col = 0; col < 11; col++) {
        const lit = on.has(r * 11 + col);
        const [cr, cg, cb] = lit ? hsl(t * 0.03 + col * 0.02 + r * 0.03, 0.85, 0.55 + beat * 0.25) : [0.05, 0.05, 0.07];
        const x = Math.round(col * cw + (cw - 3 * scale) / 2), y = Math.round(r * ch + (ch - 5 * scale) / 2);
        drawGlyph(FONT_3x5, GRID[r][col], x, y, (px, py) => c.set(px, py, cr, cg, cb), { scale });
      }
    }
  },
});
module.exports.litWords = litWords;
