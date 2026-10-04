// Pac-Man with the arcade rules, for the Retro show (../retroArcade.js).
//   - the ghosts start in the house in the middle and come out through its
//     door one at a time (Pac-Man can't use the door)
//   - out of the house they alternate between scattering to their corners
//     and chasing, each in its own way: Blinky heads straight for Pac-Man,
//     Pinky aims ahead of him, Inky cuts in from the side, Clyde gives up
//     when he gets close
//   - a power pill turns them blue: they run away (flashing just before it
//     wears off); a blue ghost Pac-Man catches becomes a pair of eyes that
//     races back to the house, then comes out again
//   - a ghost that catches Pac-Man costs a life; after three it starts over
// pacman(s, T, dt, t, inp) -> score. Plays itself unless the phone pad is used.
'use strict';

// '#' wall, '.' dot, 'o' power pill, '-' ghost-house door, ' ' empty, 'H' inside the house.
const SQUARE = [
  '################',
  '#o.....##.....o#',
  '#.##.#.##.#.##.#',
  '#..............#',
  '#.##.##--##.##.#',
  '#....#HHHH#....#',
  '####.######.####',
  '#......##......#',
  '#.###.####.###.#',
  '#...#......#...#',
  '###.#.####.#.###',
  '#..............#',
  '#o####.##.####o#',
  '################',
];
const WIDE = [
  '################################',
  '#..............##..............#',
  '#.####.#######.##.#######.####.#',
  '#o####.#######.##.#######.####o#',
  '#..............................#',
  '#.####.##.###########.##.####..#',
  '#......##.............##.......#',
  '######.#####.##--##.#####.######',
  '#............#HHHH#............#',
  '#.####.#####.#HHHH#.#####.####.#',
  '#o..##.......######.......##..o#',
  '###.##.##.############.##.##.###',
  '#......##.....##.....##........#',
  '#.##########.####.##########.###',
  '#..............................#',
  '################################',
];
const COLOURS = [[1, 0.15, 0.15], [1, 0.6, 0.85], [0.3, 1, 1], [1, 0.65, 0.2]]; // Blinky, Pinky, Inky, Clyde
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FRIGHT_S = 7, SPEED = { pac: 4.2, ghost: 3.8, fright: 2.4, eyes: 9, house: 2 };

function setup(s, maze) {
  s.maze = maze; s.w = maze[0].length; s.h = maze.length;
  s.dots = maze.map((r) => [...r].map((c) => (c === '.' ? 1 : c === 'o' ? 2 : 0)));
  s.left = s.dots.flat().filter(Boolean).length;
  // The house: its door cells, and the cells inside.
  s.door = []; s.inside = [];
  maze.forEach((r, y) => [...r].forEach((c, x) => { if (c === '-') s.door.push([x, y]); if (c === 'H') s.inside.push([x, y]); }));
  s.doorOut = [s.door[0][0], s.door[0][1] - 1]; // the corridor cell just above the door
  s.pacStart = maze === SQUARE ? [7, 11] : [15, 14];
  s.corners = [[s.w - 2, 1], [1, 1], [s.w - 2, s.h - 2], [1, s.h - 2]];
}
function resetActors(s) {
  s.pac = { x: s.pacStart[0], y: s.pacStart[1], dx: -1, dy: 0, p: 0, want: null };
  s.ghosts = COLOURS.map((col, i) => {
    const [hx, hy] = s.inside[Math.min(s.inside.length - 1, i % s.inside.length)];
    return { i, col, x: hx, y: hy, dx: 0, dy: -1, p: 0, mode: 'house', wait: 1.5 + i * 3.5 };
  });
  s.fright = 0; s.chain = 0; s.dying = 0; s.modeT = 0;
}

const cell = (s, x, y) => (s.maze[y] && s.maze[y][x]) || '#';
// Pac-Man can't enter walls, the door or the house; ghosts may use the door
// and house when leaving or returning.
function walkable(s, x, y, who) {
  const c = cell(s, x, y);
  if (c === '#') return false;
  if (c === '-' || c === 'H') return who.mode === 'leave' || who.mode === 'eyes' || who.mode === 'house';
  return true;
}
// First step on the shortest path from (x,y) to any cell where goal() is true.
function bfsDir(s, x, y, who, goal, avoidReverse) {
  const q = [[x, y, -1]], seen = new Set([x + ',' + y]);
  while (q.length) {
    const [cx, cy, first] = q.shift();
    if (first >= 0 && goal(cx, cy)) return first;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (first < 0 && avoidReverse && DIRS[d][0] === -who.dx && DIRS[d][1] === -who.dy && (who.dx || who.dy)) continue;
      if (!walkable(s, nx, ny, who) || seen.has(nx + ',' + ny)) continue;
      seen.add(nx + ',' + ny); q.push([nx, ny, first < 0 ? d : first]);
    }
  }
  return -1;
}
// Ghost turn at a cell: toward a target, never reversing (like the arcade).
function towards(s, g, tx, ty) {
  let best = -1, bd = Infinity;
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DIRS[d];
    if (dx === -g.dx && dy === -g.dy && (g.dx || g.dy)) continue;
    if (!walkable(s, g.x + dx, g.y + dy, g)) continue;
    const dd = (g.x + dx - tx) ** 2 + (g.y + dy - ty) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  if (best < 0) for (let d = 0; d < 4; d++) if (walkable(s, g.x + DIRS[d][0], g.y + DIRS[d][1], g)) { best = d; break; }
  return best;
}
function ghostTarget(s, g) {
  const P = s.pac;
  if (g.mode === 'eyes') return s.inside[0];
  if (g.mode === 'leave') return s.doorOut;
  if (g.mode === 'scatter') return s.corners[g.i];
  if (g.i === 0) return [P.x, P.y];
  if (g.i === 1) return [P.x + P.dx * 4, P.y + P.dy * 4];
  if (g.i === 2) { const b = s.ghosts[0]; const ax = P.x + P.dx * 2, ay = P.y + P.dy * 2; return [2 * ax - b.x, 2 * ay - b.y]; }
  return (g.x - P.x) ** 2 + (g.y - P.y) ** 2 > 36 ? [P.x, P.y] : s.corners[3];
}

function stepActor(s, a, speed, dt, onCell) {
  a.p += speed * dt;
  while (a.p >= 1) {
    a.p -= 1; a.x += a.dx; a.y += a.dy;
    onCell(a);
  }
}

function pacman(s, T, dt, t, inp) {
  const square = T.W / (T.H - 8) < 1.6, maze = square ? SQUARE : WIDE;
  if (s.maze !== maze || !s.ghosts) { setup(s, maze); resetActors(s); s.score = s.score || 0; s.lives = 3; }
  const P = s.pac, sfx = (n) => T.sfx && T.sfx(n);
  // Scatter 6 s, chase 18 s, repeating.
  s.modeT += dt;
  const chaseMode = (s.modeT % 24) > 6 ? 'chase' : 'scatter';
  if (s.fright > 0) { s.fright -= dt; if (s.fright <= 0) { s.chain = 0; for (const g of s.ghosts) if (g.mode === 'fright') g.mode = chaseMode; } }

  if (s.dying > 0) {
    s.dying -= dt;
    if (s.dying <= 0) { s.lives--; if (s.lives <= 0) { setup(s, maze); s.score = 0; s.lives = 3; } resetActors(s); }
  } else {
    // ── Pac-Man ──
    const PD = { left: 1, right: 0, up: 3, down: 2 };
    if (inp.manual && PD[inp.dir] !== undefined) P.want = PD[inp.dir];
    const pacOnCell = (a) => {
      const d = s.dots[a.y] && s.dots[a.y][a.x];
      if (d) {
        s.dots[a.y][a.x] = 0; s.left--; s.score += d === 2 ? 50 : 10;
        if (d === 2) { s.fright = FRIGHT_S; s.chain = 0; for (const g of s.ghosts) if (g.mode === 'chase' || g.mode === 'scatter') { g.mode = 'fright'; g.dx = -g.dx; g.dy = -g.dy; } sfx('coin'); }
        else sfx('waka');
        if (s.left <= 0) { setup(s, maze); resetActors(s); sfx('start'); }
      }
      // Choose the next direction at each cell.
      let d2 = -1;
      if (inp.manual) d2 = P.want !== null && walkable(s, a.x + DIRS[P.want][0], a.y + DIRS[P.want][1], a) ? P.want : DIRS.findIndex(([dx, dy]) => dx === a.dx && dy === a.dy);
      else {
        // Autopilot: chase blue ghosts nearby, run from dangerous ones, otherwise eat the nearest dot.
        const danger = s.ghosts.filter((g) => (g.mode === 'chase' || g.mode === 'scatter') && Math.abs(g.x - a.x) + Math.abs(g.y - a.y) < 4);
        const prey = s.ghosts.filter((g) => g.mode === 'fright' && Math.abs(g.x - a.x) + Math.abs(g.y - a.y) < 8);
        if (prey.length) d2 = bfsDir(s, a.x, a.y, a, (x, y) => prey.some((g) => g.x === x && g.y === y));
        else if (danger.length) {
          let bd = -1;
          for (let d = 0; d < 4; d++) { const nx = a.x + DIRS[d][0], ny = a.y + DIRS[d][1]; if (!walkable(s, nx, ny, a)) continue; const dist = Math.min(...danger.map((g) => Math.abs(g.x - nx) + Math.abs(g.y - ny))); if (dist > bd) { bd = dist; d2 = d; } }
        } else d2 = bfsDir(s, a.x, a.y, a, (x, y) => s.dots[y] && s.dots[y][x] > 0);
      }
      if (d2 >= 0 && walkable(s, a.x + DIRS[d2][0], a.y + DIRS[d2][1], a)) { a.dx = DIRS[d2][0]; a.dy = DIRS[d2][1]; }
      else if (!walkable(s, a.x + a.dx, a.y + a.dy, a)) { a.dx = 0; a.dy = 0; }
    };
    if (!P.dx && !P.dy) pacOnCell(P); // standing still: pick a way to go
    stepActor(s, P, SPEED.pac, dt, pacOnCell);

    // ── Ghosts ──
    for (const g of s.ghosts) {
      if (g.mode === 'house') { g.wait -= dt; g.bob = Math.sin(t * 6 + g.i) * 0.3; if (g.wait <= 0) { g.mode = 'leave'; g.p = 0; } continue; }
      const speed = g.mode === 'eyes' ? SPEED.eyes : g.mode === 'fright' ? SPEED.fright : g.mode === 'leave' ? SPEED.house : SPEED.ghost;
      const onCell = (a) => {
        if (a.mode === 'leave' && a.x === s.doorOut[0] && a.y === s.doorOut[1]) a.mode = s.fright > 0 ? 'fright' : chaseMode;
        if (a.mode === 'eyes' && cell(s, a.x, a.y) === 'H') { a.mode = 'house'; a.wait = 1.5; a.dx = 0; a.dy = -1; a.p = 0; return; }
        if (a.mode === 'chase' || a.mode === 'scatter') a.mode = chaseMode;
        let d;
        if (a.mode === 'fright') {
          // Run: the turn that ends up furthest from Pac-Man, with a little randomness.
          let bd = -1; d = -1;
          for (let k = 0; k < 4; k++) { const [dx, dy] = DIRS[k]; if (dx === -a.dx && dy === -a.dy) continue; if (!walkable(s, a.x + dx, a.y + dy, a)) continue; const dist = (a.x + dx - P.x) ** 2 + (a.y + dy - P.y) ** 2 + Math.random() * 4; if (dist > bd) { bd = dist; d = k; } }
          if (d < 0) d = towards(s, a, P.x, P.y);
        } else if (a.mode === 'eyes' || a.mode === 'leave') {
          const goal = a.mode === 'eyes' ? (x, y) => cell(s, x, y) === 'H' : (x, y) => x === s.doorOut[0] && y === s.doorOut[1];
          d = bfsDir(s, a.x, a.y, a, goal, false);
        } else { const [tx, ty] = ghostTarget(s, a); d = towards(s, a, tx, ty); }
        if (d >= 0) { a.dx = DIRS[d][0]; a.dy = DIRS[d][1]; } else { a.dx = -a.dx; a.dy = -a.dy; }
      };
      if (g.p === 0 && (!g.dx && !g.dy || !walkable(s, g.x + g.dx, g.y + g.dy, g))) onCell(g);
      stepActor(s, g, speed, dt, onCell);
    }
    // ── Catching ──
    const px = P.x + P.dx * P.p, py = P.y + P.dy * P.p;
    for (const g of s.ghosts) {
      if (g.mode === 'house' || g.mode === 'eyes' || g.mode === 'leave') continue;
      const gx = g.x + g.dx * g.p, gy = g.y + g.dy * g.p;
      if (Math.abs(gx - px) + Math.abs(gy - py) < 0.7) {
        if (g.mode === 'fright') { g.mode = 'eyes'; s.chain++; s.score += 100 * Math.pow(2, s.chain); sfx('boom'); }
        else { s.dying = 1.2; sfx('boom'); break; }
      }
    }
  }

  // ── Draw ──
  const C = Math.max(2, Math.floor(Math.min(T.W / s.w, (T.H - 8) / s.h))), ox = Math.floor((T.W - s.w * C) / 2), oy = 8 + Math.floor((T.H - 8 - s.h * C) / 2);
  const isWall = (x, y) => cell(s, x, y) === '#';
  s.maze.forEach((r, y) => [...r].forEach((c, x) => {
    const X = ox + x * C, Y = oy + y * C;
    if (c === '#') {
      T.rect(X, Y, C, C, [0.02, 0.02, 0.2]);
      for (let k = 0; k < C; k++) {
        if (!isWall(x, y - 1)) T.set(X + k, Y, 0.2, 0.3, 1); if (!isWall(x, y + 1)) T.set(X + k, Y + C - 1, 0.2, 0.3, 1);
        if (!isWall(x - 1, y)) T.set(X, Y + k, 0.2, 0.3, 1); if (!isWall(x + 1, y)) T.set(X + C - 1, Y + k, 0.2, 0.3, 1);
      }
    } else if (c === '-') T.rect(X, Y + Math.floor(C / 2), C, 1, [1, 0.7, 0.8]); // the pink door
    const d = s.dots[y][x];
    if (d === 1) T.set(X + (C >> 1), Y + (C >> 1), 1, 0.8, 0.7);
    if (d === 2 && Math.sin(t * 8) > 0) T.rect(X + (C > 3 ? 1 : 0), Y + (C > 3 ? 1 : 0), Math.max(1, C - 2), Math.max(1, C - 2), [1, 0.8, 0.7]);
  }));
  // Pac-Man (shrinking away when caught).
  const pR = (C * 0.6 + 0.4) * (s.dying > 0 ? s.dying / 1.2 : 1), pcx = ox + (P.x + P.dx * P.p) * C + C / 2, pcy = oy + (P.y + P.dy * P.p) * C + C / 2;
  const mouth = s.dying > 0 ? (1 - s.dying / 1.2) * 3 : Math.abs(Math.sin(t * 14)), ang = Math.atan2(P.dy || 0, P.dx || -1);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    if (i * i + j * j > pR * pR) continue;
    let a = Math.atan2(j, i) - ang; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < mouth * 0.8 && (i || j)) continue;
    T.set(pcx + i - 0.5, pcy + j - 0.5, 1, 0.9, 0.1);
  }
  // Ghosts.
  for (const g of s.ghosts) {
    const gx = ox + (g.x + g.dx * g.p) * C, gy = oy + (g.y + g.dy * g.p + (g.mode === 'house' ? g.bob || 0 : 0)) * C - (C >= 4 ? 1 : 0);
    const flashing = g.mode === 'fright' && s.fright < 2 && Math.sin(t * 16) > 0;
    const body = g.mode === 'fright' ? (flashing ? [1, 1, 1] : [0.15, 0.25, 1]) : g.col;
    if (C >= 4) {
      const look = g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0;
      if (g.mode !== 'eyes') T.sprite(['.xxx.', 'xxxxx', 'xxxxx', 'xxxxx', 'x.x.x'], gx - 0.5, gy, body);
      const eye = g.mode === 'fright' ? [1, 0.8, 0.8] : [1, 1, 1];
      T.set(gx + 0.5 + look, gy + 1, eye[0], eye[1], eye[2]); T.set(gx + 2.5 + look, gy + 1, eye[0], eye[1], eye[2]);
      if (g.mode !== 'fright') { T.set(gx + 0.5 + look + (look > 0 ? 0 : 0), gy + 2, 0.1, 0.2, 0.9); T.set(gx + 2.5 + look, gy + 2, 0.1, 0.2, 0.9); }
    } else if (g.mode !== 'eyes') T.rect(gx, gy, C, C, body);
    else T.set(gx + 1, gy + 1, 1, 1, 1);
  }
  // Lives along the bottom-left.
  for (let k = 0; k < s.lives - 1; k++) T.rect(ox + 1 + k * 4, T.H - 2, 2, 2, [1, 0.9, 0.1]);
  return s.score;
}

module.exports = { pacman, SQUARE, WIDE };
