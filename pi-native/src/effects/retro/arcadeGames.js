// Full-size versions of eleven Retro classics for the arcade show
// (../retroArcade.js), drawn at whatever size the wall is. Each game is
//   fn(s, T, dt, t, inp) -> score
// s: its own state object (starts empty), T: drawing target from
// retroArcade.js (W, H, set, rect, sprite, text, ctext), inp: phone
// controls { dir: 'left'|'right'|'up'|'down'|null, fire, manual }. With no
// recent phone input (manual false) each game plays itself.
// The top 7 rows are left for the score bar.
'use strict';
const { hsl } = require('../../core');
const samfoxBg = require('./samfoxBg');

const TOP = 8;
const rnd = (a, b) => a + Math.random() * (b - a);
const line = (T, x0, y0, x1, y1, c) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1; for (let i = 0; i <= n; i++) T.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c[0], c[1], c[2]); };
const disc = (T, cx, cy, r, c) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) T.set(cx + i, cy + j, c[0], c[1], c[2]); };
const steer = (inp, auto) => (inp.manual ? (inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0) : auto);

// ── Jet Pac: build the rocket, fuel it, launch ──
function jetpac(s, T, dt, t, inp) {
  const { W, H } = T, ground = H - 3;
  if (!s.init) Object.assign(s, { init: 1, x: 20, y: ground - 12, vx: 0, vy: 0, parts: 0, carry: false, part: null, aliens: [], lasers: [], phase: 'build', launchY: 0, score: 0, face: 1 });
  const ledges = [[W * 0.1, H * 0.45, W * 0.18], [W * 0.45, H * 0.6, W * 0.14], [W * 0.72, H * 0.35, W * 0.16]];
  const rx = W * 0.82;
  if (!s.part && s.phase === 'build') { const L = ledges[s.parts % 3]; s.part = { x: L[0] + L[2] / 2, y: L[1] - 6 }; }
  // Fly towards the part, then to the rocket.
  const tx = s.carry ? rx : s.part ? s.part.x : rx, ty = s.carry ? ground - 14 - s.parts * 5 : s.part ? s.part.y - 6 : ground - 10;
  const ax = steer(inp, Math.sign(tx - s.x)), ay = inp.manual ? (inp.dir === 'up' ? -1 : 0.6) : Math.sign(ty - s.y);
  s.vx += ax * 60 * dt; s.vy += ay * 60 * dt; s.vx *= 0.9; s.vy *= 0.9; s.x += s.vx * dt * 8; s.y += s.vy * dt * 8;
  s.x = Math.max(2, Math.min(W - 6, s.x)); s.y = Math.max(TOP + 2, Math.min(ground - 8, s.y)); if (ax) s.face = ax;
  if (s.phase === 'build') {
    if (!s.carry && s.part && Math.abs(s.x - s.part.x) < 4 && Math.abs(s.y - s.part.y) < 8) s.carry = true;
    if (s.carry && Math.abs(s.x - rx) < 4) { s.carry = false; s.part = null; s.parts++; s.score += 100; T.sfx && T.sfx('coin'); if (s.parts >= 3) { s.phase = 'launch'; s.launchY = 0; } }
  } else { s.launchY += dt * 18; if (s.launchY > H) { Object.assign(s, { parts: 0, phase: 'build', launchY: 0 }); s.score += 500; } }
  if (Math.random() < dt * 1.2 && s.aliens.length < 5) s.aliens.push({ x: Math.random() < 0.5 ? -4 : W + 4, y: rnd(TOP + 4, ground - 10), vx: 0, c: hsl(Math.random(), 1, 0.6) });
  for (const a of s.aliens) { a.vx = a.x < W / 2 ? 18 : -18; a.x += a.vx * dt; a.y += Math.sin(t * 3 + a.x) * 0.3; }
  if (Math.random() < dt * 3) { s.lasers.push({ x: s.x + 3, y: s.y + 3, dir: s.face, life: 0.4 }); T.sfx && T.sfx('laser'); }
  for (const l of s.lasers) { l.life -= dt; l.x += l.dir * 120 * dt; for (const a of s.aliens) if (Math.abs(a.x - l.x) < 4 && Math.abs(a.y - l.y) < 4) { a.dead = true; s.score += 25; T.sfx && T.sfx('boom'); } }
  s.lasers = s.lasers.filter((l) => l.life > 0); s.aliens = s.aliens.filter((a) => !a.dead && a.x > -8 && a.x < W + 8);
  // Draw: starry sky, yellow ground, green ledges.
  for (let k = 0; k < 30; k++) T.set((k * 37) % W, TOP + (k * 53) % (H - TOP - 6), 0.4, 0.4, 0.5);
  T.rect(0, ground, W, 3, [0.85, 0.85, 0]);
  for (const [lx, ly, lw] of ledges) T.rect(lx, ly, lw, 2, [0.1, 0.85, 0.1]);
  const ry = s.phase === 'launch' ? -s.launchY : 0;
  for (let k = 0; k < Math.min(3, s.parts); k++) T.sprite(k === 2 ? ['..x..', '.xxx.', 'xxxxx', 'xxxxx', 'xxxxx'] : ['xxxxx', 'xxxxx', 'xxxxx', 'xxxxx', 'xxxxx'], rx - 2, ground - 5 - k * 5 + ry, [0.9, 0.9, 0.95]);
  if (s.phase === 'launch') for (let k = 0; k < 6; k++) T.set(rx + rnd(-2, 2), ground + ry + k, 1, rnd(0.3, 0.8), 0);
  if (s.part && !s.carry) T.rect(s.part.x - 2, s.part.y, 5, 4, [0.9, 0.9, 0.95]);
  T.sprite(['.ww.', 'wwww', '.bb.', 'b..b'], s.x, s.y, (ch) => (ch === 'w' ? [1, 1, 1] : [0.2, 0.5, 1]));
  if (s.carry) T.rect(s.x, s.y - 4, 4, 3, [0.9, 0.9, 0.95]);
  if (ay < 0 || s.vy < -0.3) { T.set(s.x + 1, s.y + 4, 1, 0.5, 0); T.set(s.x + 2, s.y + 5, 1, 0.8, 0.2); }
  for (const a of s.aliens) T.sprite(['.x.x.', 'xxxxx', 'x.x.x'], a.x - 2, a.y - 1, a.c);
  for (const l of s.lasers) for (let k = 0; k < 6; k++) T.set(l.x - l.dir * k, l.y, hsl(k / 6, 1, 0.6)[0], hsl(k / 6, 1, 0.6)[1], hsl(k / 6, 1, 0.6)[2]);
  return s.score;
}

// ── Manic Miner: collect the flashing keys, dodge the robot, watch the air ──
function manic(s, T, dt, t, inp) {
  const { W, H } = T;
  const plats = [[0, H - 3, W], [W * 0.15, H * 0.72, W * 0.35], [W * 0.55, H * 0.6, W * 0.4], [W * 0.05, H * 0.45, W * 0.3], [W * 0.4, H * 0.3, W * 0.35]];
  if (!s.init) Object.assign(s, { init: 1, x: 6, y: H - 10, vy: 0, dir: 1, on: true, air: 1, keys: plats.slice(1).map((p) => ({ x: p[0] + p[2] * 0.7, y: p[1] - 5, got: false })), robot: W * 0.6, rdir: 1, score: 0 });
  const want = s.keys.find((k) => !k.got) || null;
  const dx = steer(inp, want ? Math.sign(want.x - s.x) : s.dir);
  if (dx) s.dir = dx; s.x += dx * 22 * dt;
  const wantJump = inp.manual ? inp.dir === 'up' : want && want.y < s.y - 4 && Math.random() < dt * 3;
  if (s.on && wantJump) { s.vy = -55; s.on = false; T.sfx && T.sfx('jump'); }
  s.vy += 140 * dt; s.y += s.vy * dt; s.on = false;
  for (const [px, py, pw] of plats) if (s.vy >= 0 && s.x + 3 > px && s.x < px + pw && s.y + 6 >= py && s.y + 6 <= py + 4) { s.y = py - 6; s.vy = 0; s.on = true; }
  if (s.x < 1 || s.x > W - 5) { s.dir *= -1; s.x = Math.max(1, Math.min(W - 5, s.x)); }
  for (const k of s.keys) if (!k.got && Math.abs(k.x - s.x - 2) < 4 && Math.abs(k.y - s.y) < 6) { k.got = true; s.score += 100; T.sfx && T.sfx('coin'); }
  s.robot += s.rdir * 14 * dt; if (s.robot < W * 0.55 || s.robot > W * 0.92) s.rdir *= -1;
  s.air -= dt * 0.025; if (s.air <= 0 || s.keys.every((k) => k.got)) { s.init = 0; s.score += 200; }
  T.rect(0, TOP, W, H - TOP, [0, 0, 0.2]);
  for (const [px, py, pw] of plats) for (let x = 0; x < pw; x++) { T.set(px + x, py, 0.85, 0.1, 0.1); T.set(px + x, py + 1, (x % 4) < 2 ? 0.6 : 0.4, 0.05, 0.05); }
  for (const k of s.keys) if (!k.got) { const c = hsl((t * 2 + k.x) % 1, 1, 0.6); T.sprite(['xx.', 'x.x', '.x.'], k.x, k.y, c); }
  const walk = Math.floor(t * 8) % 2;
  T.sprite(['.xx.', '.xx.', 'xxxx', '.xx.', walk ? 'x..x' : '.xx.', walk ? 'x..x' : '.xx.'], s.x, s.y, [1, 1, 1]);
  T.sprite(['xxxx', 'x..x', 'xxxx', '.xx.', 'x..x'], s.robot, plats[2][1] - 5, [1, 1, 0]);
  T.rect(2, H - 2, (W - 4) * s.air, 1, [0.2, 1, 0.3]);
  return s.score;
}

// ── Jet Set Willy: the mansion, room by room (stairs, rope, items, guardians) ──
const JSW_ROOMS = ['THE BATHROOM', 'MASTER BEDROOM', 'THE CHAPEL', 'THE KITCHEN', 'ON THE ROOF'];
function jsw(s, T, dt, t, inp) {
  const { W, H } = T;
  if (!s.init) Object.assign(s, { init: 1, room: 0, roomT: 0, x: 4, dir: 1, score: 0 });
  s.roomT += dt; if (s.roomT > 9) { s.roomT = 0; s.room = (s.room + 1) % JSW_ROOMS.length; s.x = 4; }
  const hue = s.room / JSW_ROOMS.length, floor = H - 4;
  const dx = steer(inp, s.dir); if (dx) s.dir = dx;
  s.x += dx * 18 * dt; if (s.x > W - 6 || s.x < 2) s.dir *= -1;
  // Willy climbs the stairs on the right half.
  const stairX = W * 0.55, onStair = s.x > stairX, y = onStair ? floor - 6 - (s.x - stairX) * 0.45 : floor - 6;
  T.rect(0, TOP, W, H - TOP, [0.02, 0.02, 0.05]);
  T.rect(0, floor, W, 4, hsl(hue, 0.8, 0.35));
  for (let x = stairX; x < W; x += 2) T.rect(x, floor - (x - stairX) * 0.45, 2, 1, hsl(hue + 0.3, 0.9, 0.55));
  // Swinging rope.
  const ropeX = W * 0.3, ang = Math.sin(t * 1.5) * 0.6;
  for (let k = 0; k < 18; k++) T.set(ropeX + Math.sin(ang) * k, TOP + 8 + Math.cos(ang) * k, 0.9, 0.9, 0.2);
  // Items (flashing) and a guardian.
  for (let k = 0; k < 4; k++) { const c = hsl((t + k * 0.25) % 1, 1, 0.6); T.sprite(['.x.', 'xxx', '.x.'], 8 + k * (W - 16) / 4, TOP + 6 + (k % 2) * 8, c); }
  const gx = W * 0.15 + (Math.sin(t * 0.8) * 0.5 + 0.5) * W * 0.3;
  T.sprite(['.xxx.', 'xx.xx', 'xxxxx', 'x.x.x'], gx, floor - 4, hsl(hue + 0.6, 1, 0.6));
  const walk = Math.floor(t * 8) % 2;
  T.sprite(['.xx.', 'xxxx', '.xx.', 'xxxx', walk ? 'x..x' : '.xx.', walk ? 'x..x' : '.xx.'], s.x, y, [1, 1, 1]);
  T.rect(0, H - 1, W, 1, [0, 0, 0]); T.ctext(JSW_ROOMS[s.room], TOP + 1, [1, 1, 0.3]);
  s.score += dt * 10;
  return Math.round(s.score);
}

// ── Deathchase: through the forest on a bike, trees rushing past ──
function deathchase(s, T, dt, t, inp) {
  const { W, H } = T, hz = Math.round(H * 0.42);
  if (!s.init) Object.assign(s, { init: 1, trees: Array.from({ length: 40 }, () => ({ x: rnd(-1.5, 1.5), z: rnd(0.1, 1) })), bx: 0, score: 0, enemy: { x: 0.3, z: 0.7 }, flash: 0 });
  const auto = Math.sin(t * 0.6) * 0.7 - s.bx;
  s.bx += steer(inp, Math.sign(auto) * 0.6) * dt * 1.2; s.bx = Math.max(-1.2, Math.min(1.2, s.bx));
  for (const tr of s.trees) { tr.z -= dt * 0.5; if (tr.z < 0.05) { tr.z = 1; tr.x = rnd(-1.5, 1.5); } }
  s.enemy.z -= dt * 0.12; s.enemy.x += Math.sin(t * 2) * dt * 0.4; if (s.enemy.z < 0.15) { s.enemy = { x: rnd(-0.8, 0.8), z: 1 }; s.score += 300; s.flash = 0.2; T.sfx && T.sfx('boom'); }
  for (let y = TOP; y < hz; y++) for (let x = 0; x < W; x++) T.set(x, y, 0.05, 0.05 + (y - TOP) / hz * 0.1, 0.15);
  for (let y = hz; y < H; y++) for (let x = 0; x < W; x++) { const p = (y - hz) / (H - hz); T.set(x, y, 0.05, 0.25 + p * 0.25, 0.05); }
  const proj = (x, z) => [W / 2 + (x - s.bx) / z * W * 0.25, hz + (1 / z) * (H - hz) * 0.18];
  [...s.trees].filter((tr) => tr.z > 0.12).sort((a, b) => b.z - a.z).forEach((tr) => {
    // Sized to the screen and capped, so a tree right beside you never swallows the view.
    const k = W / 128, [px, py] = proj(tr.x, tr.z), h = Math.min(H * 0.8, (H - hz) * 0.6 / tr.z), w = Math.max(1, Math.min(W / 8, 2.5 * k / tr.z));
    T.rect(px - w / 2, py - h, w, h, [0.35 * (1 - tr.z * 0.6), 0.2 * (1 - tr.z * 0.6), 0.08]);
    disc(T, px, py - h, Math.max(1, Math.min(Math.round(W / 6), Math.round(w * 1.6))), [0.05, 0.4 * (1 - tr.z * 0.5), 0.08]);
  });
  const [ex, ey] = proj(s.enemy.x, s.enemy.z), es = Math.max(1, Math.round(1.5 / s.enemy.z));
  T.rect(ex - es, ey - es * 2, es * 2, es * 2, [0.9, 0.2, 0.2]);
  // Handlebars and the bike's front.
  T.rect(W / 2 - 14, H - 6, 28, 2, [0.3, 0.3, 0.35]); T.rect(W / 2 - 16, H - 8, 4, 3, [0.1, 0.1, 0.1]); T.rect(W / 2 + 12, H - 8, 4, 3, [0.1, 0.1, 0.1]); T.rect(W / 2 - 2, H - 5, 4, 5, [0.5, 0.5, 0.55]);
  if (s.flash > 0) { s.flash -= dt; T.rect(0, TOP, W, 2, [1, 0.8, 0.2]); }
  s.score += dt * 15;
  return Math.round(s.score);
}

// ── R-Type: scrolling cave, wave-flying enemies, charged beam, a boss ──
function rtype(s, T, dt, t, inp) {
  const { W, H } = T;
  if (!s.init) Object.assign(s, { init: 1, sx: 0, y: H / 2, en: [], shots: [], booms: [], charge: 0, beam: 0, score: 0 });
  s.sx += dt * 20;
  const cave = (x) => [TOP + 3 + Math.abs(Math.sin((x + s.sx) * 0.05)) * 6 + Math.sin((x + s.sx) * 0.13) * 2, H - 4 - Math.abs(Math.sin((x + s.sx) * 0.04 + 1)) * 6];
  const near = s.en.reduce((b, e) => (!b || e.x < b.x ? e : b), null);
  const dy = inp.manual ? (inp.dir === 'up' ? -1 : inp.dir === 'down' ? 1 : 0) : near ? Math.sign(near.y - s.y) : 0;
  s.y = Math.max(TOP + 8, Math.min(H - 10, s.y + dy * 30 * dt));
  if (Math.random() < dt * 1.5) s.en.push({ x: W + 4, y0: rnd(TOP + 12, H - 12), ph: Math.random() * 6, c: hsl(Math.random(), 1, 0.55) });
  for (const e of s.en) { e.x -= 22 * dt; e.y = e.y0 + Math.sin(t * 3 + e.ph) * 6; }
  s.charge += dt; if (s.charge > 2.5) { s.charge = 0; s.beam = 0.3; T.sfx && T.sfx('laser'); }
  if (Math.random() < dt * 5) s.shots.push({ x: 18, y: s.y });
  for (const b of s.shots) { b.x += 90 * dt; for (const e of s.en) if (Math.abs(e.x - b.x) < 4 && Math.abs(e.y - b.y) < 4) { e.dead = true; b.dead = true; s.booms.push({ x: e.x, y: e.y, t: 0.3 }); s.score += 50; T.sfx && T.sfx('boom'); } }
  if (s.beam > 0) { s.beam -= dt; for (const e of s.en) if (Math.abs(e.y - s.y) < 4) { e.dead = true; s.booms.push({ x: e.x, y: e.y, t: 0.3 }); s.score += 50; } }
  s.shots = s.shots.filter((b) => !b.dead && b.x < W); s.en = s.en.filter((e) => !e.dead && e.x > -6);
  for (let k = 0; k < 40; k++) { const x = ((k * 53 - s.sx * (1 + k % 3)) % W + W) % W; T.set(x, TOP + (k * 29) % (H - TOP), 0.3, 0.3, 0.4); }
  for (let x = 0; x < W; x++) { const [a, b] = cave(x); for (let y = TOP; y < a; y++) T.set(x, y, 0.45 - (a - y) * 0.03, 0.4 - (a - y) * 0.03, 0.35); for (let y = b; y < H; y++) T.set(x, y, 0.35, 0.3, 0.25); }
  for (const e of s.en) T.sprite(['.xx.', 'x..x', 'xxxx', '.xx.'], e.x - 2, e.y - 2, e.c);
  for (const b of s.shots) T.rect(b.x, b.y, 3, 1, [1, 1, 0.4]);
  if (s.beam > 0) for (let x = 18; x < W; x++) { T.set(x, s.y, 0.6, 1, 1); T.set(x, s.y - 1, 0.2, 0.6, 1); T.set(x, s.y + 1, 0.2, 0.6, 1); }
  for (const b of s.booms) { b.t -= dt; disc(T, b.x, b.y, Math.round((0.3 - b.t) * 10), [1, b.t * 3, 0]); } s.booms = s.booms.filter((b) => b.t > 0);
  T.sprite(['xx......', '.xxxxx..', 'xxxxwxxx', '.xxxxx..', 'xx......'], 8, s.y - 2, (ch) => (ch === 'w' ? [0.4, 1, 1] : [0.85, 0.85, 0.9]));
  if (s.charge > 1.5) disc(T, 17, s.y, 1 + Math.round((s.charge - 1.5) * 2), [0.3, 0.7, 1]);
  return s.score;
}

// ── Raycaster shared by Wolfenstein 3D and Quake 2 ──
const MAP = ['########', '#......#', '#.##.#.#', '#.#..#.#', '#...##.#', '#.#....#', '#...#..#', '########'];
const wall = (x, y) => MAP[Math.floor(y)] && MAP[Math.floor(y)][Math.floor(x)] === '#';
function raycast(s, T, dt, t, inp, look) {
  const { W, H } = T;
  if (!s.init) Object.assign(s, { init: 1, x: 1.5, y: 1.5, a: 0, fire: 0, score: 0 });
  // Walk the corridors: turn away from walls, or follow the phone.
  const turn = inp.manual ? (inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0) : (wall(s.x + Math.cos(s.a) * 0.6, s.y + Math.sin(s.a) * 0.6) ? 1 : Math.sin(t * 0.3) * 0.2);
  s.a += turn * dt * 1.6;
  const fwd = inp.manual ? (inp.dir === 'up' ? 1 : inp.dir === 'down' ? -1 : 0) : 1;
  const nx = s.x + Math.cos(s.a) * dt * 1.1 * fwd, ny = s.y + Math.sin(s.a) * dt * 1.1 * fwd;
  if (!wall(nx, s.y)) s.x = nx; if (!wall(s.x, ny)) s.y = ny;
  if (Math.random() < dt * 0.8 || (inp.manual && inp.fire)) { s.fire = 0.15; s.score += 100; T.sfx && T.sfx('boom'); }
  const viewH = H - TOP, fov = 1.0;
  for (let x = 0; x < W; x++) {
    const ra = s.a + (x / W - 0.5) * fov, dx = Math.cos(ra), dy = Math.sin(ra);
    let d = 0, side = 0;
    for (; d < 12; d += 0.03) { const px = s.x + dx * d, py = s.y + dy * d; if (wall(px, py)) { side = Math.abs(px - Math.round(px)) < Math.abs(py - Math.round(py)) ? 0 : 1; break; } }
    const pd = d * Math.cos(ra - s.a), h = Math.min(viewH, viewH / Math.max(0.2, pd)), y0 = TOP + (viewH - h) / 2;
    const hitX = s.x + dx * d, hitY = s.y + dy * d, u = side ? hitX % 1 : hitY % 1;
    for (let y = TOP; y < H; y++) {
      let c;
      if (y < y0) c = look.ceil(y, viewH);
      else if (y > y0 + h) c = look.floor(y, viewH);
      else { const v = (y - y0) / h; c = look.wall(u, v, side); const f = Math.max(0.25, 1 - pd / look.fog); c = [c[0] * f, c[1] * f, c[2] * f]; }
      T.set(x, y, c[0], c[1], c[2]);
    }
  }
  // Weapon at the bottom centre, muzzle flash when firing.
  look.gun(T, W, H, s.fire > 0);
  s.fire = Math.max(0, s.fire - dt);
  return s.score;
}
const WOLF = {
  fog: 9,
  ceil: () => [0.22, 0.22, 0.24], floor: () => [0.35, 0.35, 0.38],
  wall: (u, v, side) => { const brick = (Math.floor(v * 6) % 2 ? (u * 4 + 0.5) % 1 : (u * 4) % 1) < 0.08 || (v * 6) % 1 < 0.1; const k = side ? 0.75 : 1; return brick ? [0.15 * k, 0.15 * k, 0.3 * k] : [0.25 * k, 0.3 * k, 0.75 * k]; },
  gun: (T, W, H, fire) => { T.rect(W / 2 - 3, H - 9, 6, 9, [0.3, 0.3, 0.32]); T.rect(W / 2 - 1, H - 12, 2, 4, [0.2, 0.2, 0.22]); T.rect(W / 2 - 5, H - 4, 10, 4, [0.85, 0.65, 0.5]); if (fire) disc(T, W / 2, H - 14, 2, [1, 0.85, 0.3]); },
};
const QUAKE = {
  fog: 6,
  ceil: (y, vh) => [0.12, 0.07, 0.04], floor: (y, vh) => [0.28, 0.16, 0.08],
  wall: (u, v, side) => { const panel = (u * 3) % 1 < 0.06 || (v * 4) % 1 < 0.06; const rust = 0.8 + 0.2 * Math.sin(u * 40 + v * 23); const k = side ? 0.7 : 1; return panel ? [0.2 * k, 0.12 * k, 0.06 * k] : [0.5 * rust * k, 0.3 * rust * k, 0.15 * k]; },
  gun: (T, W, H, fire) => { T.rect(W / 2 - 5, H - 7, 10, 7, [0.35, 0.33, 0.3]); T.rect(W / 2 - 2, H - 11, 4, 5, [0.25, 0.24, 0.22]); T.rect(W / 2 - 1, H - 13, 2, 2, [0.6, 0.5, 0.2]); if (fire) disc(T, W / 2, H - 15, 3, [1, 0.6, 0.1]); T.text('100', 2, H - 6, [1, 0.8, 0.2]); },
};
const wolf3d = (s, T, dt, t, inp) => raycast(s, T, dt, t, inp, WOLF);
const quake2 = (s, T, dt, t, inp) => raycast(s, T, dt, t, inp, QUAKE);

// ── Sam Fox SP: the photo on one side, the poker table on the other ──
let sfImg = null;
const SUITS = [['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'], ['..x..', '.xxx.', 'xxxxx', '.xxx.', '..x..'], ['..x..', '.xxx.', 'xxxxx', '..x..', '.xxx.'], ['..x..', 'x.x.x', 'xxxxx', '..x..', '.xxx.']];
function samfox(s, T, dt, t) {
  const { W, H } = T;
  if (!sfImg) { const raw = Buffer.from(samfoxBg, 'base64'); sfImg = new Float32Array(raw.length); for (let i = 0; i < raw.length; i++) sfImg[i] = raw[i] / 255; }
  if (!s.init) Object.assign(s, { init: 1, round: -1, score: 0 });
  const round = Math.floor(t / 8); if (round !== s.round) { if (s.round >= 0 && T.sfx) T.sfx('blip'); s.round = round; s.cards = Array.from({ length: 5 }, () => ({ v: Math.floor(Math.random() * 13), s: Math.floor(Math.random() * 4) })); s.score += 50; }
  // Wide wall: photo on the left, the table beside it. Single panel: the
  // photo is the whole background and the cards sit over it, as in the original.
  const side = W >= 96, tableX = side ? 64 : 0, tw = W - tableX;
  for (let y = 0; y < Math.min(64, H); y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 3; T.set(x + (side ? 0 : Math.floor((W - 64) / 2)), y + H - 64, sfImg[i], sfImg[i + 1], sfImg[i + 2]); }
  if (side) for (let y = TOP; y < H; y++) for (let x = tableX; x < W; x++) { const f = 0.14 + 0.03 * Math.sin(x * 0.4 + y * 0.3); T.set(x, y, 0, f, f * 0.35); }
  const cw = Math.max(7, Math.min(11, Math.floor((tw - 6) / 5.6))), ch = Math.round(cw * 1.4), gap = Math.max(1, Math.floor((tw - 5 * cw) / 6));
  const VAL = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  s.cards.forEach((c, i) => {
    const dealt = (t % 8) > i * 0.35;
    if (!dealt) return;
    const x = tableX + gap + i * (cw + gap), y = side ? Math.round(TOP + (H - TOP - ch) / 2) : H - ch - 2, red = c.s < 2;
    T.rect(x - 1, y - 1, cw + 2, ch + 2, [0.1, 0.1, 0.1]);
    T.rect(x, y, cw, ch, [0.97, 0.97, 0.95]);
    T.text(VAL[c.v], x + 1, y + 1, red ? [0.85, 0.1, 0.1] : [0.05, 0.05, 0.1]);
    T.sprite(SUITS[c.s], x + Math.floor((cw - 5) / 2), y + ch - 7, red ? [0.85, 0.1, 0.1] : [0.05, 0.05, 0.1]);
  });
  if (side) for (let k = 0; k < 4; k++) disc(T, tableX + 6 + k * 5, H - 4, 2, [[0.9, 0.1, 0.1], [0.1, 0.3, 0.9], [0.1, 0.7, 0.2], [0.9, 0.9, 0.9]][k]);
  return s.score;
}

// ── Tamagotchi: the egg-shaped toy, its pet on the LCD, care meters ──
function tamagotchi(s, T, dt, t) {
  const { W, H } = T, cx = W / 2, cy = (H + TOP) / 2, ry = (H - TOP) / 2 - 1, rx = ry * 0.85;
  if (!s.init) Object.assign(s, { init: 1, happy: 3, food: 3, score: 0, mood: 0 });
  s.mood += dt; if (s.mood > 6) { s.mood = 0; s.happy = 1 + Math.floor(Math.random() * 4); s.food = 1 + Math.floor(Math.random() * 4); s.score += 10; }
  for (let y = TOP; y < H; y++) for (let x = 0; x < W; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) { const k = 0.75 + 0.25 * (1 - d); T.set(x, y, 0.95 * k, 0.35 * k, 0.55 * k); } }
  const lw = Math.round(rx * 1.1), lh = Math.round(ry * 0.9), lx = Math.round(cx - lw / 2), ly = Math.round(cy - lh / 2) - 2;
  T.rect(lx - 1, ly - 1, lw + 2, lh + 2, [0.2, 0.2, 0.25]); T.rect(lx, ly, lw, lh, [0.62, 0.72, 0.5]);
  const hop = Math.abs(Math.sin(t * 3)) * 2, px = lx + lw / 2 - 4 + Math.sin(t * 0.7) * (lw / 2 - 6), py = ly + lh - 9 - hop;
  T.sprite(['..xxxx..', '.xxxxxx.', 'xx.xx.xx', 'xxxxxxxx', 'xx....xx', '.xxxxxx.', '.x....x.'], px, py, [0.12, 0.14, 0.1]);
  for (let k = 0; k < 3; k++) disc(T, cx - 6 + k * 6, ly + lh + 5, 1, [0.95, 0.9, 0.3]);
  // Care meters on the sides when there's room.
  if (W >= 96) {
    T.text('HAPPY', 2, TOP + 2, [1, 0.5, 0.7]); for (let k = 0; k < 4; k++) T.sprite(['.x.x.', 'xxxxx', '.xxx.', '..x..'], 2 + k * 6, TOP + 9, k < s.happy ? [1, 0.2, 0.4] : [0.25, 0.1, 0.15]);
    T.text('FOOD', W - 18, TOP + 2, [1, 0.8, 0.3]); for (let k = 0; k < 4; k++) T.sprite(['.xxx.', 'xxxxx', 'xxxxx', '.xxx.'], W - 26 + k * 6, TOP + 9, k < s.food ? [1, 0.7, 0.2] : [0.25, 0.18, 0.05]);
  }
  return s.score;
}

// ── Atic Atac: a castle room from above, the knight, monsters and food ──
function aticatac(s, T, dt, t, inp) {
  const { W, H } = T, x0 = 4, y0 = TOP + 2, rw = W - 8, rh = H - TOP - 4;
  if (!s.init) Object.assign(s, { init: 1, x: W / 2, y: (H + TOP) / 2, room: 0, roomT: 0, mons: [], food: null, score: 0, energy: 1 });
  s.roomT += dt; if (s.roomT > 10) { s.roomT = 0; s.room++; s.mons = []; s.food = null; }
  if (!s.food) s.food = { x: rnd(x0 + 6, x0 + rw - 8), y: rnd(y0 + 6, y0 + rh - 8) };
  if (s.mons.length < 3 && Math.random() < dt) s.mons.push({ x: rnd(x0 + 4, x0 + rw - 6), y: rnd(y0 + 4, y0 + rh - 6), c: hsl(Math.random(), 1, 0.6) });
  const tgt = s.food;
  let mx = inp.manual ? (inp.dir === 'left' ? -1 : inp.dir === 'right' ? 1 : 0) : Math.sign(tgt.x - s.x), my = inp.manual ? (inp.dir === 'up' ? -1 : inp.dir === 'down' ? 1 : 0) : Math.sign(tgt.y - s.y);
  s.x = Math.max(x0 + 3, Math.min(x0 + rw - 6, s.x + mx * 22 * dt)); s.y = Math.max(y0 + 3, Math.min(y0 + rh - 6, s.y + my * 22 * dt));
  if (Math.abs(s.x - tgt.x) < 4 && Math.abs(s.y - tgt.y) < 4) { s.food = null; s.score += 150; s.energy = Math.min(1, s.energy + 0.3); T.sfx && T.sfx('coin'); }
  for (const m of s.mons) { m.x += Math.sign(s.x - m.x) * 8 * dt + Math.sin(t * 4 + m.y) * 0.3; m.y += Math.sign(s.y - m.y) * 8 * dt; if (Math.abs(m.x - s.x) < 3 && Math.abs(m.y - s.y) < 3) { m.dead = true; s.energy -= 0.1; s.score += 50; } }
  s.mons = s.mons.filter((m) => !m.dead); if (s.energy <= 0) s.init = 0;
  const wallC = hsl((s.room * 0.17) % 1, 0.7, 0.45);
  T.rect(0, TOP, W, H - TOP, [0, 0, 0]);
  for (let x = x0; x < x0 + rw; x++) { T.set(x, y0, ...wallC); T.set(x, y0 + rh - 1, ...wallC); }
  for (let y = y0; y < y0 + rh; y++) { T.set(x0, y, ...wallC); T.set(x0 + rw - 1, y, ...wallC); }
  for (const [dx, dy] of [[rw / 2, 0], [rw / 2, rh - 1], [0, rh / 2], [rw - 1, rh / 2]]) T.rect(x0 + dx - 2, y0 + dy - 2, 5, 5, [0.6, 0.35, 0.1]);
  if (s.food) T.sprite(['.xx.', 'xxxx', 'xxxx', '.xx.'], s.food.x, s.food.y, [0.9, 0.6, 0.2]);
  for (const m of s.mons) T.sprite(['x.x', 'xxx', '.x.'], m.x, m.y, m.c);
  T.sprite(['.x.', 'xxx', 'xxx', 'x.x'], s.x, s.y, [1, 1, 1]);
  T.rect(x0 + 1, H - 2, (rw - 2) * Math.max(0, s.energy), 1, [0.9, 0.2, 0.2]);
  return s.score;
}

// ── Donkey Kong: sloped girders, ladders, rolling barrels, Mario climbing ──
function donkeykong(s, T, dt, t, inp) {
  const { W, H } = T, n = 4, gap = (H - TOP - 6) / n;
  const girderY = (k, x) => TOP + 6 + (n - k) * gap - (k % 2 ? x / W : 1 - x / W) * 3; // k = 0 bottom
  const ladderX = (k) => (k % 2 ? W * 0.85 : W * 0.15);
  if (!s.init) Object.assign(s, { init: 1, lvl: 0, x: 8, climb: 0, barrels: [], bt: 0, score: 0, jump: 0 });
  const goingRight = s.lvl % 2 === 0, lx = ladderX(s.lvl);
  if (s.climb > 0) { s.climb += dt * 0.6; if (s.climb >= 1) { s.climb = 0; s.lvl++; s.score += 100; if (s.lvl >= n) { s.lvl = 0; s.x = 8; s.score += 500; } } }
  else {
    const dx = steer(inp, goingRight ? 1 : -1); s.x += dx * 20 * dt;
    if (Math.abs(s.x - lx) < 2 && (!inp.manual || inp.dir === 'up')) s.climb = 0.01;
  }
  s.x = Math.max(2, Math.min(W - 6, s.x));
  s.bt += dt; if (s.bt > 1.8) { s.bt = 0; s.barrels.push({ x: W * 0.2, k: n - 1, fall: 0 }); }
  for (const b of s.barrels) {
    if (b.fall > 0) { b.fall += dt * 2; if (b.fall >= 1) { b.fall = 0; b.k--; } }
    else { b.x += (b.k % 2 ? 1 : -1) * 28 * dt * -1; if ((b.k % 2 === 0 && b.x < 4) || (b.k % 2 === 1 && b.x > W - 6)) b.fall = 0.01; }
    if (b.k === s.lvl && !s.climb && Math.abs(b.x - s.x) < 4 && !s.jump) { s.jump = 0.5; T.sfx && T.sfx('jump'); }
  }
  s.barrels = s.barrels.filter((b) => b.k >= 0);
  if (s.jump > 0) { s.jump -= dt; if (s.jump <= 0) s.score += 100; }
  T.rect(0, TOP, W, H - TOP, [0, 0, 0]);
  for (let k = 0; k < n; k++) for (let x = 0; x < W; x++) { const y = girderY(k, x); T.set(x, y, 0.9, 0.15, 0.3); T.set(x, y + 1, (x % 4) < 2 ? 0.7 : 0.4, 0.1, 0.2); }
  for (let k = 0; k < n - 1; k++) { const x = ladderX(k); for (let y = girderY(k + 1, x); y < girderY(k, x); y++) { T.set(x - 2, y, 0.3, 0.8, 1); T.set(x + 2, y, 0.3, 0.8, 1); if (Math.round(y) % 2 === 0) T.set(x, y, 0.3, 0.8, 1); } }
  // DK on top, Pauline above.
  T.sprite(['.xxxx.', 'xxxxxx', 'x.xx.x', 'xxxxxx', 'xx..xx'], 4, girderY(n - 1, 4) - 6, [0.6, 0.3, 0.1]);
  T.sprite(['.x.', 'xxx', 'x.x'], W * 0.5, girderY(n - 1, W * 0.5) - 5, [1, 0.5, 0.8]);
  for (const b of s.barrels) { const y = b.fall > 0 ? girderY(b.k, b.x) + b.fall * gap : girderY(b.k, b.x); T.sprite(['.xx.', 'xxxx', '.xx.'], b.x, y - 3, [0.8, 0.5, 0.2]); }
  const my = s.climb > 0 ? girderY(s.lvl, s.x) - s.climb * gap : girderY(s.lvl, s.x) - (s.jump > 0 ? Math.sin(s.jump * Math.PI * 2) * 4 : 0);
  T.sprite(['.rr.', 'rrrr', '.ss.', 'bbbb', 'b..b'], s.x, my - 5, (ch) => (ch === 'r' ? [1, 0.1, 0.1] : ch === 's' ? [1, 0.75, 0.55] : [0.2, 0.3, 1]));
  return s.score;
}

const fps = require('./fps'); // the full raycaster versions of Wolfenstein 3D and Quake 2
module.exports = { 0: jetpac, 1: manic, 4: jsw, 5: deathchase, 6: rtype, 7: fps.wolf3d, 8: fps.quake2, 9: samfox, 10: tamagotchi, 11: aticatac, 12: donkeykong };
