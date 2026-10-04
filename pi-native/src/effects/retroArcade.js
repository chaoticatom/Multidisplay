// Retro (flat panel / wall): an arcade cabinet show across the whole wall.
// Games rotate (or one is pinned); each opens with a CRT switch-on and its
// title, plays itself attract-mode style, and between games the cabinet
// flashes INSERT COIN and a high-score table. Invaders, Pac-Man and OutRun
// are drawn at the wall's full size; the other eleven classics (from
// ./retro/games.js, which draw a 64x64 picture) sit in the middle with
// cabinet side panels showing the score.
//
// Options (effectOptions.retro): selectedGame (-1 auto, 0-13), rotate
// (seconds), autoGames (pool), screen ('crt' | 'clean' | 'lcd' | 'zx'),
// hud (true/false), attract (true/false), trans ('crt' | 'wipe' | 'cut').
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { drawRetroGame } = require('./retro/games');
const { retroDrawTitle } = require('./retro/title');
const GAME_KEYS = ['jetpac', 'manic', 'outrun', 'invaders', 'jsw', 'deathchase', 'rtype', 'wolf3d', 'quake2', 'samfox', 'tamagotchi', 'aticatac', 'donkeykong', 'pacman'];
const { FONT_3x5, drawString, textWidth } = require('./text');

const NAMES = ['JET PAC', 'MANIC MINER', 'OUTRUN', 'INVADERS', 'JET SET WILLY', 'DEATHCHASE', 'R-TYPE', 'WOLFENSTEIN 3D', 'QUAKE 2', 'SAM FOX SP', 'TAMAGOTCHI', 'ATIC ATAC', 'DONKEY KONG', 'PAC-MAN'];
const OLD_STATE = () => [
  { name: 'jetpac', t: 0, playerX: 10, playerY: 20, jetY: 0, fuel: [], aliens: [], rocketParts: 0, phase: 'build', partX: 50, partY: 55, carryPart: false, laserT: 0, laserDir: 1, phaseT: 0, launchT: 0 },
  { name: 'manic', t: 0, playerX: 5, playerY: 5, dir: 1, jumpT: 0, jumping: false, platforms: [[0, 10, 63], [15, 20, 40], [30, 30, 55], [5, 40, 35], [20, 50, 60]], items: Array.from({ length: 6 }, (_, i) => ({ x: 8 + i * 9, y: [10, 20, 30, 40, 50][i % 5] - 5, collected: false })), enemyX: [20, 40] },
  null, null,
  { name: 'jsw', t: 0, playerX: 10, playerY: 10, dir: 1, jumpT: 0, jumping: false, room: 0, roomT: 0 },
  { name: 'deathchase', t: 0, speed: 0, treeOff: 0, bikeX: 32, leanDir: 0, enemyX: 20, enemyZ: 40, hit: false, hitT: 0, bullets: [], fireT: 0 },
  { name: 'rtype', t: 0, shipX: 10, shipY: 32, bullets: [], enemies: Array.from({ length: 5 }, (_, i) => ({ x: 50 + i * 12, y: 15 + i * 8, alive: true, type: i % 3, phase: i * 2 })), chargeT: 0, scrollX: 0, bossHP: 20, bossX: 55 },
  { name: 'wolf3d', t: 0, posX: 2.5, posY: 2.5, dirA: 0, gunFrame: 0, fireT: 0 },
  { name: 'quake2', t: 0, posX: 3, posY: 3, dirA: 0.5, bobT: 0, muzzleT: 0, enemies: [] },
  { name: 'samfox', t: 0, cards: [], dealT: 0, phase: 'deal', resultT: 0, hand: 'PAIR' },
  { name: 'tamagotchi', t: 0 },
  { name: 'aticatac', t: 0, playerX: 32, playerY: 32, dir: 0, room: 0, roomT: 0, enemies: [], keys: 0, score: 0, health: 100, doorT: 0, attacking: false, attackT: 0, items: [] },
  { name: 'donkeykong', t: 0, marioX: 10, marioY: 8, marioVY: 0, jumping: false, dir: 1, barrels: [], barrelT: 0, score: 0, level: 0, hammer: false, hammerT: 0, lives: 3 },
  null,
];
const DEFAULT_AUTO = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13];
const HISCORES = [['ACE', 12500], ['SAM', 9900], ['JED', 8250], ['ZOE', 7400], ['MAX', 5100]];
const LCD = [[0.06, 0.22, 0.06], [0.19, 0.38, 0.19], [0.55, 0.67, 0.06], [0.61, 0.74, 0.06]];
const ZX = [[0, 0, 0], [0, 0, 0.84], [0.84, 0, 0], [0.84, 0, 0.84], [0, 0.84, 0], [0, 0.84, 0.84], [0.84, 0.84, 0], [0.84, 0.84, 0.84], [0, 0, 1], [1, 0, 0], [1, 0, 1], [0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1]];

// ── Drawing helpers on a W x H float buffer ──
function target(buf, W, H) {
  const set = (x, y, r, g, b) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c[0], c[1], c[2]); };
  const sprite = (rows, x, y, c, s = 1) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') rect(x + i * s, y + j * s, s, s, typeof c === 'function' ? c(ch) : c); }));
  const text = (str, x, y, c) => drawString(FONT_3x5, String(str), x, y, (px, py) => set(px, py, c[0], c[1], c[2]));
  const ctext = (str, y, c) => text(str, Math.round((W - textWidth(FONT_3x5, String(str))) / 2), y, c);
  return { W, H, buf, set, rect, sprite, text, ctext };
}

// ── Invaders: animated aliens, shields, explosions, a player that aims ──
const INV_A = [['..x..x..', '...xx...', '..xxxx..', '.xx.xx.x', 'xxxxxxxx', 'x.xxxx.x', 'x.x..x.x', '..x..x..'], ['..x..x..', 'x..xx..x', 'x.xxxx.x', 'xxx.xxxx', 'xxxxxxxx', '.xxxxxx.', '..x..x..', '.x....x.']];
const INV_B = [['...xx...', '..xxxx..', '.xxxxxx.', 'xx.xx.xx', 'xxxxxxxx', '..x..x..', '.x.xx.x.', 'x.x..x.x'], ['...xx...', '..xxxx..', '.xxxxxx.', 'xx.xx.xx', 'xxxxxxxx', '.x.xx.x.', 'x......x', '.x....x.']];
function invaders(s, T, dt, t, inp = {}) {
  const { W, H } = T, cols = Math.max(4, Math.min(8, Math.floor((W - 8) / 11))), top = 9;
  if (!s.alive || s.cols !== cols) { s.cols = cols; s.alive = Array.from({ length: 4 }, () => Array(cols).fill(true)); s.x = 4; s.y = top; s.dir = 1; s.t = 0; s.frame = 0; s.shots = []; s.bombs = []; s.booms = []; s.px = W / 2; s.score = s.score || 0; }
  s.t += dt;
  if (s.t > 0.45) { s.t = 0; s.frame ^= 1; s.x += s.dir * 2; if (s.x > W - cols * 11 - 2 || s.x < 2) { s.dir *= -1; s.y += 2; } }
  let tx = null; s.alive.forEach((row) => row.forEach((a, i) => { if (a) tx = s.x + i * 11 + 4; }));
  if (inp.manual) s.px = Math.max(3, Math.min(W - 4, s.px + (inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0) * 50 * dt));
  else if (tx !== null) s.px += Math.sign(tx - s.px) * Math.min(Math.abs(tx - s.px), 40 * dt);
  if ((inp.manual ? inp.fire || inp.dir === 'up' : Math.random() < dt * 2.5) && s.shots.length < 2) { s.shots.push({ x: s.px, y: H - 10 }); T.sfx && T.sfx('laser'); }
  if (Math.random() < dt * 1.6) { const live = []; s.alive.forEach((row, j) => row.forEach((a, i) => a && live.push([i, j]))); if (live.length) { const [i, j] = live[Math.floor(Math.random() * live.length)]; s.bombs.push({ x: s.x + i * 11 + 4, y: s.y + j * 9 + 8 }); } }
  for (const b of s.shots) { b.y -= 70 * dt; s.alive.forEach((row, j) => row.forEach((a, i) => { const ax = s.x + i * 11, ay = s.y + j * 9; if (a && b.x >= ax && b.x < ax + 8 && b.y >= ay && b.y < ay + 8) { row[i] = false; b.dead = true; s.booms.push({ x: ax, y: ay, t: 0.3 }); s.score += [40, 30, 20, 10][j]; T.sfx && T.sfx('boom'); } })); }
  s.shots = s.shots.filter((b) => !b.dead && b.y > top);
  for (const b of s.bombs) b.y += 30 * dt; s.bombs = s.bombs.filter((b) => b.y < H - 4);
  if (!s.alive.some((r) => r.some(Boolean)) || s.y > H - 30) s.alive = null;
  const shieldN = Math.max(2, Math.floor(W / 32));
  for (let k = 0; k < shieldN; k++) T.sprite(['.xxxxxx.', 'xxxxxxxx', 'xxxxxxxx', 'xx....xx'], Math.round((k + 0.5) * W / shieldN) - 4, H - 16, [0.1, 0.9, 0.3]);
  const cols4 = [[1, 0.3, 0.4], [1, 0.5, 1], [0.4, 1, 0.5], [0.3, 0.9, 1]];
  if (s.alive) s.alive.forEach((row, j) => row.forEach((a, i) => { if (a) T.sprite((j < 2 ? INV_A : INV_B)[s.frame], s.x + i * 11, s.y + j * 9, cols4[j]); }));
  for (const b of s.booms) { b.t -= dt; const k = Math.max(0, b.t / 0.3); T.sprite(['x..x..x.', '.x.x.x..', '..xxx...', 'xxx.xxx.', '..xxx...', '.x.x.x..', 'x..x..x.'], b.x, b.y, [k, k * 0.9, k * 0.4]); }
  s.booms = s.booms.filter((b) => b.t > 0);
  T.sprite(['...x...', '..xxx..', 'xxxxxxx', 'xxxxxxx'], s.px - 3, H - 8, [0.2, 1, 0.3]);
  for (const b of s.shots) T.rect(b.x, b.y, 1, 3, [1, 1, 1]);
  for (const b of s.bombs) T.set(b.x + ((b.y | 0) % 2), b.y, 1, 0.8, 0.2);
  return s.score;
}

// ── Pac-Man: an outlined maze, chomping, ghosts that chase, power pills ──
const MAZE = ['################################', '#..............##..............#', '#.####.#######.##.#######.####.#', '#o####.#######.##.#######.####o#', '#..............................#', '#.####.##.###########.##.####..#', '#......##.............##.......#', '######.#####.##..##.#####.######', '#............#....#............#', '#.####.#####.#....#.#####.####.#', '#o..##.......######.......##..o#', '###.##.##.############.##.##.###', '#......##.....##.....##........#', '#.##########.####.##########.###', '#..............................#', '################################'];
// A square maze for single panels (16 x 14 cells), so the game fills a 64x64 screen.
const MAZE_SQ = ['################', '#o.....##.....o#', '#.##.#.##.#.##.#', '#..............#', '#.##.######.##.#', '#....#....#....#', '####.#.##.#.####', '#......##......#', '#.###.####.###.#', '#...#......#...#', '###.#.####.#.###', '#..............#', '#o####.##.####o#', '################'];
let M = MAZE; // the maze in use (set per frame from the screen's shape)
const open = (x, y) => M[y] && M[y][x] && M[y][x] !== '#';
function stepMover(m, smart, tx, ty) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(m.x + dx, m.y + dy) && !(dx === -m.dx && dy === -m.dy));
  const ch = dirs.length ? dirs : [[-m.dx, -m.dy]];
  let best = ch[Math.floor(Math.random() * ch.length)];
  if (smart) { let bd = 1e9; for (const d of ch) { const dd = Math.hypot(m.x + d[0] - tx, m.y + d[1] - ty); if (dd < bd && Math.random() > 0.15) { bd = dd; best = d; } } }
  m.dx = best[0]; m.dy = best[1]; m.x += m.dx; m.y += m.dy;
}
function pacman(s, T, dt, t, inp = {}) {
  const square = T.W / (T.H - 8) < 1.6, want = square ? MAZE_SQ : MAZE;
  if (s.maze !== want) { s.maze = want; s.dots = null; }
  M = want;
  if (!s.dots) {
    s.dots = M.map((r) => [...r].map((c) => (c === '.' ? 1 : c === 'o' ? 2 : 0))); s.x = 1; s.y = 3; s.dx = 1; s.dy = 0; s.t = 0; s.power = 0; s.score = s.score || 0;
    const gx = square ? 6 : 14, gy = square ? 5 : 8;
    s.ghosts = [[1, 0.2, 0.2], [1, 0.6, 0.9], [0.3, 1, 1], [1, 0.7, 0.2]].map((col, i) => ({ x: gx + i, y: gy, col, dx: i % 2 ? 1 : -1, dy: 0 }));
  }
  s.t += dt;
  if (s.t > 0.14) {
    s.t = 0;
    let tx = s.x, ty = s.y, bd = 1e9; s.dots.forEach((r, y) => r.forEach((d, x) => { if (d) { const dd = Math.abs(x - s.x) + Math.abs(y - s.y); if (dd < bd) { bd = dd; tx = x; ty = y; } } }));
    const PD = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[inp.manual ? inp.dir : ''];
    if (PD && open(s.x + PD[0], s.y + PD[1])) { s.dx = PD[0]; s.dy = PD[1]; s.x += s.dx; s.y += s.dy; }
    else if (inp.manual) { if (open(s.x + s.dx, s.y + s.dy)) { s.x += s.dx; s.y += s.dy; } }
    else stepMover(s, true, tx, ty);
    const d = s.dots[s.y][s.x]; if (d) { s.score += d === 2 ? 50 : 10; if (d === 2) { s.power = 6; T.sfx && T.sfx('coin'); } else if (T.sfx) T.sfx('waka'); s.dots[s.y][s.x] = 0; }
    for (const g of s.ghosts) stepMover(g, s.power <= 0, s.x, s.y);
    if (!s.dots.some((r) => r.some(Boolean))) s.dots = null;
    if (!s.dots) return s.score;
  }
  s.power -= dt;
  const cols = M[0].length, rows = M.length;
  const C = Math.max(2, Math.floor(Math.min(T.W / cols, (T.H - 8) / rows))), ox = Math.floor((T.W - cols * C) / 2), oy = 8 + Math.floor((T.H - 8 - rows * C) / 2);
  M.forEach((r, y) => [...r].forEach((c, x) => {
    const X = ox + x * C, Y = oy + y * C;
    if (c === '#') {
      T.rect(X, Y, C, C, [0.02, 0.02, 0.22]);
      for (let k = 0; k < C; k++) { if (open(x, y - 1)) T.set(X + k, Y, 0.2, 0.3, 1); if (open(x, y + 1)) T.set(X + k, Y + C - 1, 0.2, 0.3, 1); if (open(x - 1, y)) T.set(X, Y + k, 0.2, 0.3, 1); if (open(x + 1, y)) T.set(X + C - 1, Y + k, 0.2, 0.3, 1); }
    }
    const d = s.dots[y][x]; if (d === 1) T.set(X + (C >> 1), Y + (C >> 1), 1, 0.8, 0.7); if (d === 2 && Math.sin(t * 8) > 0) T.rect(X + 1, Y + 1, Math.max(1, C - 2), Math.max(1, C - 2), [1, 0.8, 0.7]);
  }));
  const mouth = Math.abs(Math.sin(t * 14)), ang = Math.atan2(s.dy, s.dx), R = C * 0.6 + 0.4, cx = ox + s.x * C + C / 2, cy = oy + s.y * C + C / 2;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { if (i * i + j * j > R * R) continue; let a = Math.atan2(j, i) - ang; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) < mouth * 0.8 && (i || j)) continue; T.set(cx + i - 0.5, cy + j - 0.5, 1, 0.9, 0.1); }
  for (const g of s.ghosts) {
    const col = s.power > 0 ? (s.power < 2 && Math.sin(t * 16) > 0 ? [1, 1, 1] : [0.2, 0.3, 1]) : g.col;
    if (C >= 4) T.sprite(['.xxx.', 'xxxxx', 'xwxwx', 'xxxxx', 'x.x.x'], ox + g.x * C - 0.5, oy + g.y * C - 1, (ch) => (ch === 'w' ? [1, 1, 1] : col));
    else T.rect(ox + g.x * C, oy + g.y * C, C, C, col);
  }
  return s.score;
}

// ── OutRun: a pseudo-3D road with curves, kerbs, palms, sunset, the Ferrari ──
function outrun(s, T, dt, t, inp = {}) {
  const { W, H } = T;
  s.speed = Math.min(1, (s.speed || 0) + dt * 0.3); s.z = (s.z || 0) + dt * 40 * (0.5 + s.speed); s.score = (s.score || 0) + dt * 120;
  const hz = Math.round(H * 0.34);
  for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) { const v = y / hz; T.set(x, y, 0.2 + v * 0.8, 0.3 + v * 0.35, 0.8 - v * 0.3); }
  const sunX = W * 0.75, sunR = Math.min(8, H * 0.13);
  for (let j = -sunR; j <= sunR; j++) for (let i = -sunR; i <= sunR; i++) if (i * i + j * j < sunR * sunR && hz - 4 + j < hz) T.set(sunX + i, hz - 4 + j, 1, 0.75 - j * 0.02, 0.3);
  for (let x = 0; x < W; x++) { const h = 3 + Math.abs(Math.sin(x * 0.11 + 2)) * 5; for (let y = hz - h; y < hz; y++) T.set(x, y, 0.15, 0.1, 0.3); }
  s.steer = inp.manual ? Math.max(-1, Math.min(1, (s.steer || 0) + (inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0) * dt * 2)) : Math.sin(t * 0.7);
  const curve = Math.sin(s.z * 0.004) * 1.4, sway = s.steer * W * 0.08;
  for (let y = hz; y < H; y++) {
    const p = (y - hz) / (H - hz), z = 1 / (p + 0.02), seg = Math.floor(s.z * 0.05 + z * 2), stripe = seg % 2;
    const cx = W / 2 + curve * (1 - p) * (1 - p) * W * 0.47 - sway * p, roadW = 3 + p * W * 0.55, rumble = roadW * 0.12;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - cx);
      let c = stripe ? [0.25, 0.75, 0.25] : [0.2, 0.65, 0.2];
      if (d < roadW) c = stripe ? [0.42, 0.42, 0.45] : [0.38, 0.38, 0.4];
      if (d >= roadW && d < roadW + rumble) c = stripe ? [1, 1, 1] : [0.95, 0.15, 0.15];
      if (d < Math.max(0.5, roadW * 0.03) && stripe) c = [1, 1, 1];
      T.set(x, y, c[0], c[1], c[2]);
    }
    if (seg % 6 === 0 && stripe) { const k = Math.max(1, Math.round(p * 3)); for (const side of [-1, 1]) { const px = cx + side * (roadW + 10 + p * 20); T.rect(px, y - 6 * k, k, 6 * k, [0.5, 0.3, 0.1]); T.rect(px - 2 * k, y - 7 * k, 5 * k, k, [0.1, 0.7, 0.2]); } }
  }
  T.sprite(['....xxxxxx....', '..xxwwwwwwxx..', '.xxxxxxxxxxxx.', 'xxrrxxxxxxrrxx', 'bb..........bb'], W / 2 - 7, H - 9, (ch) => (ch === 'w' ? [0.6, 0.85, 1] : ch === 'r' ? [1, 0.9, 0.2] : ch === 'b' ? [0.1, 0.1, 0.1] : [0.95, 0.1, 0.12]));
  return Math.round(s.score);
}
const NEW_GAMES = { ...require('./retro/arcadeGames'), 2: outrun, 3: invaders, 13: pacman };

const st = { W: 0, H: 0, buf: null, small: new Float32Array(64 * 64 * 3), old: OLD_STATE(), fresh: {}, cur: -1, phase: 'play', phaseT: 0, gameT: 0, hi: 12500, score: 0, poolPos: 0 };

module.exports = defineCanvasEffect({
  render(c, { dt, core }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H) { st.W = W; st.H = H; st.buf = new Float32Array(W * H * 3); }
    const o = (core.effectOptions && core.effectOptions.retro) || {};
    const T = target(st.buf, W, H), t = (st.clock = (st.clock || 0) + dt);
    T.sfx = (name) => { if (core.sfx) core.sfx.push(name); };
    st.buf.fill(0);
    // Phone controls (the arrow pad in the Retro options): taps bump o.press;
    // a game is in manual mode for 8 s after the last tap.
    if (o.press !== undefined && o.press !== st.lastPress) { if (st.lastPress !== undefined) { st.manualUntil = t + 8; st.dir = o.dir; st.fireUntil = o.dir === 'fire' ? t + 0.3 : st.fireUntil; } st.lastPress = o.press; }
    const manual = t < (st.manualUntil || 0);
    const inp = { dir: manual && st.dir !== 'fire' ? st.dir : null, fire: t < (st.fireUntil || 0), manual };
    const sel = Number.isInteger(o.selectedGame) ? o.selectedGame : -1;
    const pool = Array.isArray(o.autoGames) && o.autoGames.length ? o.autoGames : DEFAULT_AUTO;
    const rotate = Math.max(4, Number(o.rotate) || 8), attract = o.attract !== false, hud = o.hud !== false;
    st.phaseT += dt;
    if (sel >= 0) { if (st.cur !== sel) { st.cur = sel; st.phase = 'play'; st.phaseT = 0; st.score = 0; } }
    else {
      if (st.cur < 0 || !pool.includes(st.cur)) { st.cur = pool[0]; st.phase = 'play'; st.phaseT = 0; }
      if (st.phase === 'play' && st.phaseT > rotate) { st.phase = attract ? 'coin' : 'next'; st.phaseT = 0; if (attract) T.sfx('coin'); }
      if (st.phase === 'coin' && st.phaseT > 2.5) { st.phase = 'scores'; st.phaseT = 0; }
      if ((st.phase === 'scores' && st.phaseT > 3) || st.phase === 'next') { st.cur = pool[(pool.indexOf(st.cur) + 1) % pool.length]; st.phase = 'play'; st.phaseT = 0; st.score = 0; T.sfx('start'); }
    }
    if (st.phase === 'coin') {
      T.ctext('INSERT COIN', Math.round(H / 2) - 8, Math.sin(t * 6) > 0 ? [1, 0.85, 0.2] : [0.4, 0.3, 0.05]);
      T.ctext('1 CREDIT 1 PLAY', Math.round(H / 2) + 2, [0.6, 0.6, 0.8]);
    } else if (st.phase === 'scores') {
      T.ctext('HIGH SCORES', 3, [1, 0.3, 0.5]);
      const cols = [[1, 0.85, 0.2], [0.4, 1, 0.5], [0.3, 0.9, 1], [1, 0.5, 1], [0.9, 0.9, 0.9]];
      const list = HISCORES.map(([n, s]) => [n, s]); if (st.hi > list[0][1]) list.unshift(['YOU', st.hi]);
      list.slice(0, 5).forEach(([n, s], i) => T.ctext(`${i + 1}. ${n} ${String(s).padStart(5, '0')}`, 13 + i * Math.floor((H - 14) / 5), cols[i]));
    } else {
      const fn = NEW_GAMES[st.cur];
      if (fn) {
        const s = st.fresh[st.cur] || (st.fresh[st.cur] = {});
        // Games run at two-thirds speed: closer to the originals' pace on the panels.
        const gdt = dt * 0.65;
        st.score = fn(s, T, gdt, (st.gameClock = (st.gameClock || 0) + gdt), inp) || 0;
      } else {
        // A classic: its 64x64 picture in the middle, cabinet side panels around it.
        const S = 64, game = st.old[st.cur]; game.t += dt;
        st.small.fill(0); drawRetroGame(game, dt, st.small, S);
        const ox = Math.floor((W - S) / 2), oy = Math.floor((H - S) / 2);
        for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) { const i = (v * S + (S - 1 - u)) * 3; T.set(ox + u, oy + v, st.small[i], st.small[i + 1], st.small[i + 2]); }
        if (ox >= 12) {
          for (let y = 0; y < H; y++) for (const side of [0, 1]) for (let x = 0; x < ox; x++) { const X = side ? W - 1 - x : x, k = 0.04 + 0.03 * Math.sin(y * 0.3 + t); T.set(X, y, k * 1.6, k * 0.4, k * 2); }
          st.score = (st.score || 0) + dt * 37;
          if (hud) { T.text('1UP', 3, 4, [1, 0.3, 0.3]); T.text(String(Math.round(st.score)).padStart(5, '0'), 2, 11, [1, 1, 1]); T.text('HI', W - 11, 4, [1, 0.85, 0.2]); T.text(String(st.hi).padStart(5, '0'), W - ox + 2, 11, [1, 1, 1]); }
        }
      }
      st.hi = Math.max(st.hi, Math.round(st.score));
      if (hud && fn) { T.rect(0, 0, W, 7, [0, 0, 0]); T.text((W >= 100 ? '1UP ' : '') + String(Math.round(st.score)).padStart(5, '0'), 1, 1, [1, 0.3, 0.3]); const hs = 'HI ' + String(st.hi).padStart(5, '0'); T.text(hs, W - textWidth(FONT_3x5, hs) - 1, 1, [1, 1, 1]); }
      // The game's splash screen for its first two seconds, centred.
      if (st.phaseT < 2) {
        const S = 64; st.small.fill(0); retroDrawTitle(st.small, S, GAME_KEYS[st.cur], t);
        T.rect(0, 0, W, H, [0, 0, 0]);
        const ox = Math.floor((W - S) / 2), oy = Math.floor((H - S) / 2);
        for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) { const i = (v * S + u) * 3; T.set(ox + u, oy + v, st.small[i], st.small[i + 1], st.small[i + 2]); } // the pictures are stored top row first
      }
      // Switch-on effect.
      if (st.phaseT < 0.6 && o.trans !== 'cut') {
        const k = st.phaseT / 0.6;
        if (o.trans === 'wipe') { const edge = Math.round(k * W); for (let y = 0; y < H; y++) for (let x = edge; x < W; x++) T.set(x, y, 0, 0, 0); }
        else { const half = Math.max(1, Math.round(k * k * H / 2)); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (Math.abs(y - H / 2) > half) T.set(x, y, 0, 0, 0); else if (k < 0.25) T.set(x, y, 1, 1, 1); } }
      }
    }
    // Screen style, then out to the panels.
    const style = o.screen || 'crt';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3; let r = st.buf[i], g = st.buf[i + 1], b = st.buf[i + 2];
      if (style === 'lcd') { const L = r * 0.3 + g * 0.59 + b * 0.11, q = LCD[Math.min(3, Math.floor(L * 4))]; r = q[0]; g = q[1]; b = q[2]; }
      else if (style === 'zx') { let best = 0, bd = 9; for (let k = 0; k < ZX.length; k++) { const d = (ZX[k][0] - r) ** 2 + (ZX[k][1] - g) ** 2 + (ZX[k][2] - b) ** 2; if (d < bd) { bd = d; best = k; } } [r, g, b] = ZX[best]; }
      else if (style === 'crt') { const sc = y % 2 ? 0.72 : 1; r = Math.min(1, r * 1.1) * sc; g = Math.min(1, g * 1.1) * sc; b = Math.min(1, b * 1.15) * sc; }
      c.set(x, y, r, g, b);
    }
  },
});
module.exports.getStatus = () => ({ game: NAMES[st.cur] || '', phase: st.phase });
