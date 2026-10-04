// Wolfenstein 3D and Quake 2 for the Retro arcade show: a grid raycaster
// (DDA, like the originals) with textured walls, sprite enemies that walk,
// get shot and fall, the weapon in hand, and each game's own status bar.
//   wolf3d / quake2: fn(s, T, dt, t, inp) -> score   (see arcadeGames.js)
'use strict';

const TOP = 8;
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v) => Math.max(0, Math.min(1, v));

// ── Maps: # grey stone, B blue stone, F banner, D door / M metal, P tech panel, L light strip ──
const WOLF_MAP = [
  '################',
  '#......#.......#',
  '#.BBB..D..FF...#',
  '#.B.........#..#',
  '#.B..#####..#..#',
  '#....#...D..#..#',
  '##D###...#..F..#',
  '#........#.....#',
  '#..FF....##D####',
  '#..........#...#',
  '#.BBBB.....D...#',
  '#......#...#...#',
  '#..##..#...###.#',
  '#..##..D.......#',
  '#......#.......#',
  '################',
];
const QUAKE_MAP = [
  'MMMMMMMMMMMMMMMM',
  'M......P.......M',
  'M.MMM..L..MMP..M',
  'M.M.........M..M',
  'M.P..MMMMM..L..M',
  'M....M...L..M..M',
  'MMLMMM...M..P..M',
  'M........M.....M',
  'M..PP....MMLMMMM',
  'M..........M...M',
  'M.MMLM.....P...M',
  'M......M...M...M',
  'M..MM..M...MMP.M',
  'M..ML..L.......M',
  'M......M.......M',
  'MMMMMMMMMMMMMMMM',
];

// ── Wall textures: (cell, u, v, side) -> [r, g, b], u/v in 0..1 ──
function stone(u, v, tint) {
  const row = Math.floor(v * 8), off = row % 2 ? 0.5 : 0, col = Math.floor(u * 4 + off);
  const mortar = (v * 8) % 1 < 0.12 || (u * 4 + off) % 1 < 0.08;
  const n = 0.75 + 0.35 * hash(col + row * 7, row) + 0.08 * hash(Math.floor(u * 16), Math.floor(v * 16));
  if (mortar) return [tint[0] * 0.45, tint[1] * 0.45, tint[2] * 0.45];
  return [tint[0] * n, tint[1] * n, tint[2] * n];
}
const WOLF_TEX = {
  '#': (u, v) => stone(u, v, [0.48, 0.48, 0.5]),
  B: (u, v) => stone(u, v, [0.22, 0.28, 0.62]),
  F: (u, v) => {
    // A red banner hanging on grey stone, with a gold emblem in a white disc.
    if (u < 0.2 || u > 0.8) return stone(u, v, [0.48, 0.48, 0.5]);
    if (v < 0.1 || v > 0.92) return [0.75, 0.6, 0.2];
    const dx = (u - 0.5) * 2.4, dy = (v - 0.45) * 2;
    const r = Math.hypot(dx, dy);
    if (r < 0.32) return Math.abs(dx) < 0.08 || Math.abs(dy + 0.05) < 0.07 && Math.abs(dx) < 0.25 ? [0.9, 0.72, 0.15] : [0.95, 0.95, 0.92];
    return [0.68, 0.08, 0.08];
  },
  D: (u, v) => {
    // Steel sliding door: grooves and a handle.
    const groove = (u * 6) % 1 < 0.1;
    const k = groove ? 0.55 : 0.85 + 0.1 * Math.sin(v * 30);
    if (u > 0.78 && u < 0.86 && v > 0.45 && v < 0.55) return [0.2, 0.2, 0.25];
    return [0.32 * k, 0.5 * k, 0.6 * k];
  },
};
const QUAKE_TEX = {
  M: (u, v) => {
    // Rusty riveted metal panels.
    const pu = (u * 2) % 1, pv = (v * 2) % 1, edge = pu < 0.06 || pv < 0.06;
    const rivet = (Math.abs(pu - 0.12) < 0.05 || Math.abs(pu - 0.88) < 0.05) && (Math.abs(pv - 0.12) < 0.05 || Math.abs(pv - 0.88) < 0.05);
    const rust = 0.7 + 0.3 * hash(Math.floor(u * 12), Math.floor(v * 12)) + 0.15 * Math.sin(u * 37 + v * 19);
    if (rivet) return [0.75, 0.6, 0.45];
    if (edge) return [0.18, 0.12, 0.08];
    return [0.42 * rust, 0.28 * rust, 0.16 * rust];
  },
  P: (u, v) => {
    // Tech panel: dark metal with a grille and small green status lights.
    if (v > 0.25 && v < 0.75 && u > 0.2 && u < 0.8) { const slat = (v * 12) % 1 < 0.5; return slat ? [0.14, 0.14, 0.12] : [0.28, 0.27, 0.22]; }
    if (v > 0.82 && v < 0.88 && (u * 5) % 1 < 0.4) return [0.2, 0.95, 0.3];
    return [0.33, 0.3, 0.25];
  },
  L: (u, v) => {
    // A glowing light strip set in metal.
    if (v > 0.4 && v < 0.6) return [1, 0.82, 0.45];
    return QUAKE_TEX.M(u, v);
  },
};

// ── Sprites (enemies) as rows; letters are colours ──
const WOLF_GUARD = [
  ['...hhh...', '..hhhhh..', '..sssss..', '..s.s.s..', '...sss...', '.bbbbbbb.', 'bbbbbbbbb', 'b.bbbbb.b', 's.bbbbb.s', '..bbbbb..', '..kk.kk..', '..kk.kk..', '.kkk.kkk.'],
  ['...hhh...', '..hhhhh..', '..sssss..', '..s.s.s..', '...sss...', '.bbbbbbbg', 'bbbbbbbgg', 'b.bbbbb..', 's.bbbbb..', '..bbbbb..', '..kk.kk..', '..kk..kk.', '.kkk..kkk'],
];
const WOLF_DEAD = ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...hhh...', '.sssbbbb.', 'rbbbbbbbr', 'rrbbbbbkr', 'rrrrrrrrr'];
const WOLF_COL = { h: [0.45, 0.32, 0.15], s: [0.95, 0.72, 0.55], b: [0.55, 0.42, 0.22], k: [0.15, 0.1, 0.06], g: [0.2, 0.2, 0.22], r: [0.6, 0.05, 0.05] };
const STROGG = [
  ['...mmm...', '..mrmrm..', '..mmmmm..', '...mmm...', '.ggggggg.', 'ggggggggw', 'g.ggggg.w', 'm.ggggg.m', '..ggggg..', '..gg.gg..', '..mm.mm..', '..mm.mm..', '.mmm.mmm.'],
  ['...mmm...', '..mrmrm..', '..mmmmm..', '...mmm...', '.ggggggg.', 'gggggggww', 'g.ggggg..', 'm.ggggg..', '..ggggg..', '..gg.gg..', '..mm..mm.', '..mm..mm.', '.mmm..mmm'],
];
const STROGG_DEAD = ['.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '...mmm...', '.mmggggg.', 'rggggggmr', 'rrggggggr', 'rrrrrrrrr'];
const STROGG_COL = { m: [0.5, 0.48, 0.42], r: [1, 0.15, 0.1], g: [0.35, 0.42, 0.3], w: [0.3, 0.3, 0.32] };

function makeLook(kind) {
  if (kind === 'wolf') {
    return {
      map: WOLF_MAP, tex: WOLF_TEX, fog: 0,
      ceil: () => [0.22, 0.22, 0.22], floor: () => [0.44, 0.44, 0.44], // the original's flat colours
      sprite: WOLF_GUARD, dead: WOLF_DEAD, col: WOLF_COL, barH: 9,
    };
  }
  return {
    map: QUAKE_MAP, tex: QUAKE_TEX, fog: 7,
    // Textured brown floor tiles and dark metal ceiling, both cast per pixel.
    ceil: (fx, fy) => { const e = (fx % 1 < 0.06) || (fy % 1 < 0.06); return e ? [0.06, 0.05, 0.04] : [0.16, 0.13, 0.1]; },
    floor: (fx, fy) => { const e = (fx * 2 % 1 < 0.06) || (fy * 2 % 1 < 0.06); const n = 0.8 + 0.2 * hash(Math.floor(fx * 2), Math.floor(fy * 2)); return e ? [0.12, 0.08, 0.05] : [0.34 * n, 0.22 * n, 0.12 * n]; },
    sprite: STROGG, dead: STROGG_DEAD, col: STROGG_COL, barH: 9,
  };
}

const solid = (map, x, y) => { const r = map[Math.floor(y)]; const c = r && r[Math.floor(x)]; return c && c !== '.' ? c : ''; };

function play(kind, s, T, dt, t, inp) {
  const L = makeLook(kind), map = L.map, { W, H } = T, view0 = TOP, viewH = H - TOP - L.barH;
  if (!s.init) Object.assign(s, { init: 1, x: 1.5, y: 1.5, a: 0, fire: 0, score: 0, health: 100, ammo: 99, lives: 3, enemies: [], face: 0, turnTo: null });
  // Keep a few enemies about.
  while (s.enemies.length < 4) {
    const ex = 1 + Math.floor(Math.random() * 14) + 0.5, ey = 1 + Math.floor(Math.random() * 14) + 0.5;
    if (!solid(map, ex, ey) && Math.hypot(ex - s.x, ey - s.y) > 3) s.enemies.push({ x: ex, y: ey, a: Math.random() * 6.28, dead: 0 });
  }
  // Movement: follow the phone, or roam the corridors turning at walls.
  let turn = 0, fwd = 1;
  if (inp.manual) { turn = inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0; fwd = inp.dir === 'up' ? 1 : inp.dir === 'down' ? -1 : 0; }
  else {
    const ahead = solid(map, s.x + Math.cos(s.a) * 0.8, s.y + Math.sin(s.a) * 0.8);
    if (ahead && s.turnTo === null) {
      const opts = [-Math.PI / 2, Math.PI / 2, Math.PI].map((d) => s.a + d).filter((a) => !solid(map, s.x + Math.cos(a) * 1, s.y + Math.sin(a) * 1));
      s.turnTo = opts.length ? opts[Math.floor(Math.random() * opts.length)] : s.a + Math.PI;
    }
    if (s.turnTo !== null) { const d = s.turnTo - s.a; turn = Math.sign(d); fwd = 0.2; if (Math.abs(d) < 0.08) { s.a = s.turnTo; s.turnTo = null; } }
  }
  s.a += turn * dt * 2.2;
  const nx = s.x + Math.cos(s.a) * dt * 1.4 * fwd, ny = s.y + Math.sin(s.a) * dt * 1.4 * fwd;
  if (!solid(map, nx, s.y)) s.x = nx; if (!solid(map, s.x, ny)) s.y = ny;
  // Enemies wander; shoot the one in front.
  for (const e of s.enemies) {
    if (e.dead) { e.dead += dt; continue; }
    const ex = e.x + Math.cos(e.a) * dt * 0.5, ey = e.y + Math.sin(e.a) * dt * 0.5;
    if (solid(map, ex, ey)) e.a += Math.PI / 2 + Math.random(); else { e.x = ex; e.y = ey; }
  }
  s.enemies = s.enemies.filter((e) => e.dead < 3);
  let target = null;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
    let da = Math.atan2(dy, dx) - s.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.12 && d < 7) target = e;
  }
  if ((target && Math.random() < dt * 3 && !inp.manual) || (inp.manual && inp.fire)) {
    s.fire = 0.12; s.ammo = Math.max(0, s.ammo - 1);
    if (target) { target.dead = 0.001; s.score += kind === 'wolf' ? 100 : 150; if (T.sfx) T.sfx('boom'); } else if (T.sfx) T.sfx('laser');
  }
  if (Math.random() < dt * 0.15) s.health = Math.max(15, s.health - 5);
  s.face = Math.floor(t * 1.5) % 3;

  // ── Walls (DDA per column) ──
  const fov = 0.66, dirX = Math.cos(s.a), dirY = Math.sin(s.a), plX = -dirY * fov, plY = dirX * fov;
  const zbuf = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const cam = 2 * x / W - 1, rx = dirX + plX * cam, ry = dirY + plY * cam;
    let mx = Math.floor(s.x), my = Math.floor(s.y);
    const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
    const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
    let sdx = (rx < 0 ? s.x - mx : mx + 1 - s.x) * ddx, sdy = (ry < 0 ? s.y - my : my + 1 - s.y) * ddy;
    let side = 0, cell = '';
    for (let k = 0; k < 64 && !cell; k++) { if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; } cell = solid(map, mx, my); }
    const dist = side === 0 ? sdx - ddx : sdy - ddy;
    zbuf[x] = dist;
    const lineH = viewH / Math.max(0.05, dist), y0 = view0 + (viewH - lineH) / 2;
    let wallX = side === 0 ? s.y + dist * ry : s.x + dist * rx; wallX -= Math.floor(wallX);
    const tex = L.tex[cell] || L.tex[Object.keys(L.tex)[0]];
    for (let y = view0; y < view0 + viewH; y++) {
      let c;
      if (y >= y0 && y < y0 + lineH) {
        c = tex(wallX, (y - y0) / lineH, side);
        const shade = side ? 0.72 : 1; // the originals darken one side
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
        if (L.fog) { const f = clamp(1 - dist / L.fog); c = [c[0] * f, c[1] * f, c[2] * f]; }
      } else {
        // Floor and ceiling: flat for Wolfenstein, cast and textured for Quake.
        const rowDist = viewH / Math.max(0.5, Math.abs(2 * (y - view0) - viewH));
        const fx = s.x + rowDist * rx, fy = s.y + rowDist * ry;
        c = y < y0 ? L.ceil(fx, fy) : L.floor(fx, fy);
        if (L.fog) { const f = clamp(1 - rowDist / L.fog); c = [c[0] * f, c[1] * f, c[2] * f]; }
      }
      T.set(x, y, c[0], c[1], c[2]);
    }
  }
  // ── Sprites, far to near, clipped by the wall depths ──
  const inv = 1 / (plX * dirY - dirX * plY);
  const vis = s.enemies.map((e) => ({ e, d: (e.x - s.x) ** 2 + (e.y - s.y) ** 2 })).sort((a, b) => b.d - a.d);
  for (const { e } of vis) {
    const sx = e.x - s.x, sy = e.y - s.y;
    const tx = inv * (dirY * sx - dirX * sy), ty = inv * (-plY * sx + plX * sy);
    if (ty <= 0.1) continue;
    const scrX = (W / 2) * (1 + tx / ty), size = Math.abs(viewH / ty);
    const rows = e.dead ? L.dead : L.sprite[Math.floor(t * 4) % 2], sw = rows[0].length, sh = rows.length;
    const pw = size * sw / sh, x0 = scrX - pw / 2, y0 = view0 + (viewH - size) / 2;
    for (let px = Math.max(0, Math.floor(x0)); px < Math.min(W, x0 + pw); px++) {
      if (ty >= zbuf[px]) continue;
      const u = Math.floor((px - x0) / pw * sw);
      for (let py = Math.max(view0, Math.floor(y0)); py < Math.min(view0 + viewH, y0 + size); py++) {
        const ch = rows[Math.floor((py - y0) / size * sh)][u];
        if (!ch || ch === '.') continue;
        let c = L.col[ch];
        if (L.fog) { const f = clamp(1 - ty / L.fog); c = [c[0] * f, c[1] * f, c[2] * f]; }
        T.set(px, py, c[0], c[1], c[2]);
      }
    }
  }
  // ── Weapon ──
  const gx = Math.round(W / 2), gy = view0 + viewH, bob = Math.round(Math.abs(Math.sin(t * 6)) * (fwd ? 1 : 0));
  if (kind === 'wolf') {
    if (s.fire > 0) { for (let k = 0; k < 6; k++) T.set(gx + (k % 3) - 1, gy - 12 - Math.floor(k / 3), 1, 0.85 - k * 0.08, 0.3); }
    T.rect(gx - 1, gy - 10 + bob, 3, 4, [0.25, 0.25, 0.28]); // barrel
    T.rect(gx - 2, gy - 7 + bob, 5, 3, [0.35, 0.35, 0.38]); // slide
    T.rect(gx - 3, gy - 4 + bob, 7, 4, [0.95, 0.72, 0.55]); // hand
  } else {
    T.set(gx, view0 + Math.floor(viewH / 2), 1, 1, 1); T.set(gx - 2, view0 + Math.floor(viewH / 2), 0.8, 0.8, 0.8); T.set(gx + 2, view0 + Math.floor(viewH / 2), 0.8, 0.8, 0.8); // crosshair
    T.rect(gx + 2, gy - 8 + bob, 6, 8, [0.32, 0.3, 0.27]); T.rect(gx + 3, gy - 10 + bob, 3, 3, [0.25, 0.24, 0.22]);
    T.set(gx + 4, gy - 10 + bob, 1, 0.75, 0.2);
    if (s.fire > 0) for (let k = 0; k < 5; k++) T.set(gx + 4 + (k % 2), gy - 12 - k, 1, 0.8 - k * 0.12, 0.2);
  }
  s.fire = Math.max(0, s.fire - dt);
  // ── Status bar ──
  const by = H - L.barH;
  if (kind === 'wolf') {
    T.rect(0, by, W, L.barH, [0.0, 0.0, 0.45]);
    for (let x = 0; x < W; x++) { T.set(x, by, 0.2, 0.2, 0.7); }
    const fields = [['FL', '1'], ['SCORE', String(s.score)], ['LIVES', String(s.lives)], null, ['HEALTH', s.health + '%'], ['AMMO', String(s.ammo)]];
    const slot = W / fields.length;
    fields.forEach((f, i) => {
      const cx = Math.round(i * slot);
      if (!f) {
        // BJ's face, glancing left and right.
        const fx = cx + Math.round(slot / 2) - 3, fyy = by + 1;
        T.rect(fx, fyy, 7, 7, [0.95, 0.72, 0.55]); T.rect(fx, fyy, 7, 2, [0.75, 0.6, 0.25]);
        const look = [-1, 0, 1][s.face];
        T.set(fx + 2 + look, fyy + 3, 0.2, 0.3, 0.8); T.set(fx + 4 + look, fyy + 3, 0.2, 0.3, 0.8); T.rect(fx + 2, fyy + 5, 3, 1, [0.6, 0.25, 0.2]);
        return;
      }
      T.text(f[1], cx + 1, by + 2, [1, 1, 1]);
    });
  } else {
    T.rect(0, by, W, L.barH, [0.16, 0.1, 0.05]);
    const groups = [['+', s.health], ['A', 50], ['=', s.ammo]], slot = W / 3;
    groups.forEach(([icon, n], i) => {
      const cx = Math.round(i * slot + 3);
      T.text(icon, cx, by + 2, [0.9, 0.85, 0.7]);
      T.text(String(n), cx + 6, by + 2, n < 30 ? [1, 0.25, 0.15] : [1, 0.7, 0.1]);
    });
  }
  return s.score;
}

module.exports = {
  wolf3d: (s, T, dt, t, inp) => play('wolf', s, T, dt, t, inp),
  quake2: (s, T, dt, t, inp) => play('quake', s, T, dt, t, inp),
};
