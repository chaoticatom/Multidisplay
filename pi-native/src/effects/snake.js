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
    // Board: dark with a faint checker and a soft vignette.
    for (let y = 0; y < rows * CELL; y++) for (let x = 0; x < cols * CELL; x++) {
      const chk = ((Math.floor(x / CELL) + Math.floor(y / CELL)) % 2) ? 0.012 : 0;
      const v = 1 - Math.hypot(x / (cols * CELL) - 0.5, y / (rows * CELL) - 0.5) * 0.9;
      c.set(ox + x, oy + y, (0.01 + chk) * v, (0.02 + chk * 1.4) * v, (0.03 + chk * 1.8) * v);
    }
    // Rounded, shaded blob of a given size centred in a cell (px,py = pixel centre).
    const blob = (px, py, rad, col, gloss) => {
      for (let j = Math.floor(py - rad - 1); j <= py + rad + 1; j++) for (let i = Math.floor(px - rad - 1); i <= px + rad + 1; i++) {
        const u = (i + 0.5 - px) / rad, v = (j + 0.5 - py) / rad, d2 = u * u + v * v;
        if (d2 > 1) continue;
        const z = Math.sqrt(1 - d2), lam = Math.max(0, -u * 0.5 - v * 0.6 + z * 0.62);
        const spec = Math.pow(Math.max(0, 2 * lam * z - 0.62), 16) * gloss;
        const sh = 0.3 + 0.85 * lam;
        c.set(i, j, Math.min(1, col[0] * sh + spec), Math.min(1, col[1] * sh + spec), Math.min(1, col[2] * sh + spec));
      }
    };
    const centre = (x, y) => [ox + x * CELL + CELL / 2, oy + y * CELL + CELL / 2];
    if (g.food) {
      // A shiny apple that bobs gently, with a little leaf.
      const [fx, fy] = centre(g.food[0], g.food[1]), bob = Math.sin(t * 5) * 0.4;
      blob(fx, fy + bob, CELL * 0.62, [1, 0.12, 0.15], 0.9);
      c.set(Math.round(fx), Math.round(fy + bob - CELL * 0.65), 0.2, 0.85, 0.25);
    }
    const flash = g.dead > 0 && g.dead % 2;
    // Body: draw tail to head; join each segment to the next so it's one
    // continuous snake, tapering a little towards the tail.
    for (let i = g.body.length - 1; i >= 0; i--) {
      const [x, y] = g.body[i], [px, py] = centre(x, y);
      const col = flash ? [1, 0.2, 0.2] : hsl(0.33 + i * 0.01, 0.85, 0.48);
      const rad = CELL * (i === 0 ? 0.62 : 0.55 - Math.min(0.15, i * 0.004));
      if (i > 0) {
        const [nx, ny] = g.body[i - 1];
        if (Math.abs(nx - x) + Math.abs(ny - y) === 1) { const [qx, qy] = centre(nx, ny); blob((px + qx) / 2, (py + qy) / 2, rad * 0.95, col, 0.35); }
      }
      blob(px, py, rad, col, i === 0 ? 0.7 : 0.4);
    }
    // Eyes on the head, looking where it's going.
    if (g.body.length) {
      const [hx, hy] = centre(g.body[0][0], g.body[0][1]), [dx, dy] = g.dir;
      for (const s of [-1, 1]) {
        const ex = Math.round(hx + dx * 0.8 - dy * s * 1), ey = Math.round(hy + dy * 0.8 + dx * s * 1);
        c.set(ex, ey, 1, 1, 1);
      }
    }
    const score = String(g.body.length - 3);
    drawString(FONT_3x5, score, c.W - textWidth(FONT_3x5, score) - 1, 1, (x, y) => c.add(x, y, 0.5, 0.5, 0.6));
  },
});
