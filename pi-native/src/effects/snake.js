// Snake: play from your phone (arrow pad on the Play tab), or watch it
// play itself - after 8 s without a tap the snake steers on autopilot
// toward the food. Options (effectOptions.snake): dir ('up'|'down'|
// 'left'|'right') and press (a counter bumped on every tap, so the same
// direction twice still registers).
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, drawString, textWidth } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const { tempo } = require('./audioFeatures');

const CELL = 4;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const g = { cols: 0, rows: 0, body: [], dir: [1, 0], food: null, acc: 0, lastPress: -1, manualUntil: 0, dead: 0, best: 0, now: 0 };

function reset(cols, rows) {
  g.cols = cols; g.rows = rows;
  const y = rows >> 1;
  g.body = [[4, y], [3, y], [2, y]]; g.dir = [1, 0]; g.dead = 0;
  placeFood();
}
function placeFood() {
  for (let i = 0; i < 500; i++) {
    const f = [Math.floor(Math.random() * g.cols), Math.floor(Math.random() * g.rows)];
    if (!g.body.some((b) => b[0] === f[0] && b[1] === f[1])) { g.food = f; return; }
  }
}
const blocked = (x, y) => x < 0 || y < 0 || x >= g.cols || y >= g.rows || g.body.slice(0, -1).some((b) => b[0] === x && b[1] === y);
function autopilot() {
  const [hx, hy] = g.body[0];
  const opts = Object.values(DIRS).filter(([dx, dy]) => !(dx === -g.dir[0] && dy === -g.dir[1]) && !blocked(hx + dx, hy + dy));
  if (!opts.length) return;
  opts.sort((a, b) => (Math.abs(hx + a[0] - g.food[0]) + Math.abs(hy + a[1] - g.food[1])) - (Math.abs(hx + b[0] - g.food[0]) + Math.abs(hy + b[1] - g.food[1])));
  g.dir = opts[0];
}
function step() {
  if (g.dead > 0) { g.dead -= 1; if (g.dead === 0) reset(g.cols, g.rows); return; }
  if (g.now > g.manualUntil) autopilot();
  const nx = g.body[0][0] + g.dir[0], ny = g.body[0][1] + g.dir[1];
  if (blocked(nx, ny)) { g.best = Math.max(g.best, g.body.length - 3); g.dead = 12; return; }
  g.body.unshift([nx, ny]);
  if (nx === g.food[0] && ny === g.food[1]) placeFood(); else g.body.pop();
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const cols = Math.floor(c.W / CELL), rows = Math.floor(c.H / CELL);
    if (cols !== g.cols || rows !== g.rows || !g.body.length) reset(cols, rows);
    g.now = t;
    const o = (core.effectOptions && core.effectOptions.snake) || {};
    if (o.press !== undefined && o.press !== g.lastPress) {
      if (g.lastPress !== -1 && DIRS[o.dir]) {
        const d = DIRS[o.dir];
        if (!(d[0] === -g.dir[0] && d[1] === -g.dir[1])) g.dir = d;
        g.manualUntil = t + 8;
      }
      g.lastPress = o.press;
    }
    g.acc += dt * tempo(core); // to the music
    const every = Math.max(0.05, 0.13 - g.body.length * 0.0015);
    while (g.acc > every) { g.acc -= every; step(); }
    c.clear();
    const ox = Math.floor((c.W - cols * CELL) / 2), oy = Math.floor((c.H - rows * CELL) / 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if ((x + y) % 2) for (let i = 0; i < CELL; i++) for (let j = 0; j < CELL; j++) c.set(ox + x * CELL + i, oy + y * CELL + j, 0.02, 0.025, 0.04);
    const cell = (x, y, r, gr, b, inset = 0) => { for (let i = inset; i < CELL - inset; i++) for (let j = inset; j < CELL - inset; j++) c.set(ox + x * CELL + i, oy + y * CELL + j, r, gr, b); };
    const pulse = 0.6 + 0.4 * Math.sin(t * 8);
    if (g.food) cell(g.food[0], g.food[1], 1 * pulse, 0.2 * pulse, 0.35 * pulse);
    const flash = g.dead > 0 && g.dead % 2;
    g.body.forEach(([x, y], i) => {
      const [r, gr, b] = flash ? [1, 0.2, 0.2] : hsl(0.33 + i * 0.012, 0.9, i === 0 ? 0.6 : 0.45 - Math.min(0.2, i * 0.004));
      cell(x, y, r, gr, b, i === 0 ? 0 : 0.5 > 1 ? 1 : 0);
    });
    const score = String(g.body.length - 3);
    drawString(FONT_3x5, score, c.W - textWidth(FONT_3x5, score) - 1, 1, (x, y) => c.add(x, y, 0.5, 0.5, 0.6));
  },
});
