// Ghost Face 2: the Ghost Face in true 3D, ray-marched per pixel. A pale,
// gaunt head with hollow eye sockets and glowing eyes, a skull-like nose
// cavity and a long gaping mouth, its ragged shroud trailing back into the
// screen, drifts out of the fog towards you, sways and stares (the eyes
// wander and blink; often only its glowing eyes peer out of the fog first),
// now and then lunges at you with a glitch, then
// sinks back into the screen. ~22 s loop, most of it out of the screen.
// Each visit the face is slightly different (head shape, eyes, mouth,
// cheeks, skin tint, eye colour) and seen differently (where it comes out,
// which way it's turned, its tilt and sway).
// Now and then pairs of eyes glow in the far fog, away from the ghost.
// Each visit also brings one scare (in turn, all in 3D): glossy eyeballs
// floating out of the dark before it appears, hands pushing out through the
// screen as if it were rubber, the screen shattering into glass shards when
// it lunges, or a big spider dropping down on its thread right in front of
// you. They're
// placed and sized from the screen's shape, so they work on one panel or a
// wall of several.
// Shading: lit from below by its own eye glow and the fog, a cold rim of
// light round its edges (ghostly translucency), deep shadow in the sockets
// and mouth, the eyes' glow halo, and depth fog that swallows it near the
// screen. The screen is drifting fog (the plane z = 0).
// The head's area is ray-marched a quarter of its rows per frame (the heavy
// part); the fog around it is drawn every frame.
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1 - h); }
function smax(a, b, k) { return -smin(-a, -b, k); }
function norm3(x, y, z) { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; }
// Ellipsoid (approximate distance).
function ell(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
// Math.hypot is slow in V8; these run millions of times a second.
const len2 = (a, b) => Math.sqrt(a * a + b * b), len3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);

const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---- Pose: where the head is, which way it looks, the face's state ----
const LOOP = 22;
const SKINS = [[0.8, 0.9, 0.88], [0.88, 0.88, 0.8], [0.72, 0.86, 0.95], [0.85, 0.8, 0.9], [0.78, 0.92, 0.8], [0.68, 0.72, 0.7], [0.9, 0.85, 0.85], [0.6, 0.75, 0.68]];
const EYES = [[1.2, 0.12, 0.05], [0.2, 1.1, 0.25], [0.35, 0.6, 1.2], [1.1, 0.65, 0.05], [0.95, 1.0, 1.1]];
const G = { pos: [0, 0, 0], peek: 0, yaw: 0, pitch: 0, roll: 0, mouth: 0.6, glow: 1, eye: EYES[0], look: [0, 0], glitch: 0, t: 0 };
const st = { t: 0, frame: 0, img: null, w: 0, h: 0, aspect: 1, blink: 0, nextBlink: 2, look: [0, 0], lookTo: [0, 0], nextLook: 1, lastCycle: -1 };

function buildPose(t, dt) {
  const n = Math.floor(t / LOOP), c = (t % LOOP) / LOOP;
  if (n !== st.lastCycle) {
    // A slightly different face, and a different view of it, every visit
    // (picked from the loop number, so it's repeatable).
    st.lastCycle = n; G.eye = EYES[n % EYES.length];
    const r = (k, a, b) => a + (b - a) * hash(n * 7 + 3, k);
    // Mouth style: 0 a tall scream, 1 a wide grin, 2 a small round "O".
    const style = Math.floor(r(16, 0, 2.999));
    G.F = { w: r(1, 0.28, 0.4), l: r(2, 0.38, 0.52), gap: r(3, 0.11, 0.16), eye: r(4, 0.8, 1.35), cheek: r(7, 0.05, 0.11), skin: SKINS[Math.floor(r(8, 0, SKINS.length - 0.001))],
      style, mw: style === 1 ? r(5, 0.16, 0.2) : style === 2 ? r(5, 0.06, 0.08) : r(5, 0.09, 0.13), mh: style === 1 ? r(6, 0.35, 0.5) : style === 2 ? r(6, 0.55, 0.75) : r(6, 0.9, 1.3),
      asym: r(17, -1, 1) * 0.25, // one eye socket lower and bigger than the other
      brow: r(18, 0.04, 0.09), chin: r(19, -0.04, 0.08), veins: r(20, 0, 1) < 0.5 ? r(21, 0.4, 1) : 0 };
    // How far it may roam each side (a wide wall: far), measured where it
    // hovers (z ~ 1, nearer you, so perspective spreads it out).
    const halfW = Math.max(0, (st.aspect || 1) / 2 * FOV * (CAM_Z - 1.1) / CAM_Z - 0.85);
    G.V = { x: r(9, -1, 1) * Math.max(0.3, halfW), drift: r(15, -0.3, 0.3) * halfW, y: r(10, -0.04, 0.1), yaw: r(11, -0.45, 0.45), roll: r(12, -0.15, 0.15), pitch: r(13, -0.14, 0.06), sway: r(14, 0.6, 1.4) };
  }
  const F = G.F, V = G.V;
  // On most visits just its eyes peer out of the fog first (0-14%); then out
  // of the screen (to 28%), hover and stare (to 88%) with a lunge in the
  // middle, back in (88-100%).
  SC.kind = KINDS[n % KINDS.length];
  const peeks = SC.kind !== 'eyes' && hash(n, 21) < 0.7, late = peeks || SC.kind === 'eyes'; // eyeball visits: the ghost waits until they've gone
  G.peek = peeks ? sm(0.01, 0.05, c) * (1 - sm(0.12, 0.17, c)) : 0;
  const out = sm(late ? 0.14 : 0, late ? 0.28 : 0.16, c) * (1 - sm(0.88, 1, c));
  const lungeT = (c - 0.52) / 0.045, lunge = lungeT > 0 && lungeT < 1 ? Math.sin(lungeT * Math.PI) ** 0.6 : 0;
  const home = (st.aspect || 1) > 1.5 ? 1 : 1 - 0.6 * out; // on a panel it drifts to the middle; on a wall it stays where it came out
  G.pos = [V.x * home + V.drift * (c - 0.5) + V.sway * (0.12 * Math.sin(t * 0.6) + 0.05 * Math.sin(t * 1.7)), V.y * home - 0.05 + 0.06 * Math.sin(t * 0.9), -1.0 + 2.0 * out + 0.9 * lunge];
  G.yaw = V.yaw * (1 - 0.5 * lunge) + V.sway * (0.25 * Math.sin(t * 0.45) + 0.1 * Math.sin(t * 1.3)); G.pitch = V.pitch + 0.08 * Math.sin(t * 0.7); G.roll = V.roll + 0.12 * Math.sin(t * 0.5 + 1);
  G.mouth = 0.55 + 0.25 * Math.sin(t * 0.8) + 0.35 * lunge; // gapes wider as it lunges
  G.glitch = lunge > 0.3 ? lunge : 0;
  // Blinks (the eye glow snaps off) and wandering eyes.
  st.nextBlink -= dt; if (st.nextBlink <= 0 && st.blink <= 0) { st.blink = 0.18; st.nextBlink = 2 + Math.random() * 4; }
  if (st.blink > 0) st.blink -= dt;
  st.nextLook -= dt; if (st.nextLook <= 0) { st.lookTo = [Math.random() * 1.6 - 0.8, Math.random() * 1.0 - 0.5]; st.nextLook = 0.7 + Math.random() * 2; }
  st.look[0] += (st.lookTo[0] - st.look[0]) * Math.min(1, dt * 12); st.look[1] += (st.lookTo[1] - st.look[1]) * Math.min(1, dt * 12);
  G.look = st.look;
  G.glow = (st.blink > 0 ? 0.05 : 1) * (0.8 + 0.2 * Math.sin(t * 2.3)) * (1 + 0.6 * lunge);
  // Rotation (yaw, pitch, roll) as a matrix, world -> head.
  const cy = Math.cos(G.yaw), sy = Math.sin(G.yaw), cp = Math.cos(G.pitch), sp = Math.sin(G.pitch), cr = Math.cos(G.roll), sr = Math.sin(G.roll);
  G.m = [cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr, -cy * sr + sy * sp * cr, cp * cr, sr * sy + cy * sp * cr, sy * cp, -sp, cy * cp];
  G.t = t;
  G.bound = [G.pos[0], G.pos[1] - 0.1, G.pos[2] - 0.2, 1.05];
  buildScare(n, c, t); // after the ghost's placed: some scares start from where it is
  buildBgEyes(t);
  G.hidden = false;
}

const HP = [0, 0, 0]; // reused (this runs millions of times a second)
function toHead(px, py, pz) {
  const x = px - G.pos[0], y = py - G.pos[1], z = pz - G.pos[2], m = G.m;
  HP[0] = m[0] * x + m[1] * y + m[2] * z; HP[1] = m[3] * x + m[4] * y + m[5] * z; HP[2] = m[6] * x + m[7] * y + m[8] * z;
  return HP;
}

// The ghost. mat: 0 skin, 1 inside (sockets, nose, mouth), 2 shroud, 3 teeth.
const H = { mat: 0, depth: 0 };
function sdfHead(x, y, z, want) {
  // Far away: a cheap enclosing shape is close enough to step by (a ball
  // round the head, a cone round the shroud) - most ray steps are far out.
  if (!want) {
    const bh = len3(x, y + 0.08, z) - 0.66;
    const zc = clamp(z, -1.85, 0.1), bs = len3(x, y + 0.2 * clamp(-zc / 1.6), z - zc) - (0.5 + 0.38 * clamp(-zc / 1.6));
    const b = Math.min(bh, bs);
    if (b > 0.12) return b;
  }
  // Skull: a tall egg and a long jaw.
  const F = G.F;
  let d = ell(x, y - 0.05, z, F.w, F.l, 0.38);
  d = smin(d, ell(x, y + 0.28 + F.chin, z + 0.02, 0.24, 0.3 + F.chin + 0.08 * G.mouth, 0.3), 0.12); // jaw, stretched by the gaping mouth (and the face's chin)
  // The face's details only matter near the front of the face - skipped
  // elsewhere (they were most of the cost).
  let holes = 1e9, teeth = 1e9;
  if (z > 0 && d < 0.1 && Math.abs(x) < 0.42) {
    d = smax(d, -ell(x - (F.w - 0.1) * Math.sign(x), y + 0.15, z - 0.2, F.cheek, 0.16, 0.12), 0.06); // hollow cheeks
    d = smin(d, ell(x, y - 0.13, z - 0.27, 0.27, F.brow, 0.08), 0.06); // brow ridge (heavier on some faces)
    // Eye sockets, nose cavity, mouth - carved out.
    const ex = Math.abs(x) - F.gap;
    const lop = 1 + F.asym * Math.sign(x); // lopsided: one socket bigger and lower
    const socket = ell(ex, y - 0.04 + 0.04 * F.asym * Math.sign(x), z - 0.33, 0.095 * F.eye * lop, 0.085 * F.eye * lop, 0.13);
    const nose = ell(x, y + 0.1 + 0.6 * Math.abs(x), z - 0.36, 0.035, 0.06, 0.08);
    // The mouth: a long scream, narrower at the top, a deep throat behind it.
    const mw = F.mw + 0.02 * Math.sin(G.t * 0.7), mh = (0.06 + 0.13 * G.mouth) * F.mh;
    const my = -(0.36 + mh * 0.3); // its centre
    const pinch = F.style === 0 ? 1 - 0.3 * clamp((y - my) / mh) : 1; // a scream narrows towards the top
    const grin = F.style === 1 ? 0.06 * (x / mw) * (x / mw) : 0; // a grin's corners curl up
    const mouth = Math.min(ell(x / pinch, y - my - grin, z - 0.3, mw, mh, 0.16), ell(x, y - my - grin, z - 0.05, mw * 0.8, mh * 0.85, 0.3));
    holes = Math.min(socket, nose, mouth);
    d = smax(d, -holes, 0.025);
    // Jagged teeth along the top and bottom of the mouth: pointed, uneven.
    if (Math.abs(x) < mw * 0.9 && Math.abs(y - my) < mh * 1.1) {
      const tw = 0.034, tx = ((x % tw) + tw * 1.5) % tw - tw / 2, ti = Math.round(x / tw);
      const len = 0.03 + 0.018 * hash(ti, 5) + 0.012 * G.mouth, edge = Math.sqrt(clamp(1 - (x / mw) ** 2));
      const top = my + grin + mh * 0.92 * edge * pinch, bot = my + grin - mh * 0.92 * edge;
      const zt = 0.3 + 0.13 * edge - 0.02;
      const up = ell(tx, y - (top - len * 0.5), z - zt, 0.013 * (1 - clamp((top - y) / len) * 0.7), len * 0.6, 0.016);
      const dn = ell(tx, y - (bot + len * 0.45), z - zt, 0.012 * (1 - clamp((y - bot) / len) * 0.7), len * 0.55, 0.015);
      teeth = Math.min(up, dn);
      d = Math.min(d, teeth);
    }
  }
  // The shroud: ragged cloth from behind the head back into the screen.
  const back = clamp(-(z + 0.1) / 1.6);
  const wave = back > 0 ? (0.05 * Math.sin(y * 9 + G.t * 2) + 0.04 * Math.sin(x * 11 - G.t * 1.6)) * back : 0;
  const shroud = len2(x * (1 - 0.25 * back), (y - 0.05 + 0.25 * back) * 0.9) - (0.36 + 0.3 * back + wave);
  const shroudD = Math.max(shroud, z - 0.05 + 0.5 * Math.max(0, y - 0.2), -z - 1.8);
  d = smin(d, shroudD, 0.08);
  if (want) { H.mat = teeth < 0.006 ? 3 : holes < 0.02 ? 1 : shroudD < d + 0.01 && z < -0.05 ? 2 : 0; H.depth = z; }
  return d;
}
function sdf(px, py, pz, want) { toHead(px, py, pz); return sdfHead(HP[0], HP[1], HP[2], want); }

// The two eyes' glowing pupils, deep in the sockets (head space).
function eyeDist(px, py, pz) {
  const h = toHead(px, py, pz);
  const lx = G.look[0] * 0.025, ly = G.look[1] * 0.02;
  const gp = G.F.gap;
  const as = G.F.asym * 0.04;
  return Math.min(len3(h[0] - gp - lx, h[1] - 0.04 + as - ly, h[2] - 0.27), len3(h[0] + gp - lx, h[1] - 0.04 - as - ly, h[2] - 0.27)) - 0.028 * G.F.eye;
}

// ---- Scares: one per visit, in turn ----
const KINDS = ['eyes', 'hands', 'shatter', 'spider'];
const SC = { kind: null, eyes: [], hands: [], shards: [], crack: 0, impact: [0, 0], spider: 0, sp: [0, 0, 0], twitch: 0, boxes: [] };
// Visible half-width/height of the scene at depth z.
const halfW = (z) => (st.aspect || 1) / 2 * FOV * (CAM_Z - z) / CAM_Z, halfH = (z) => FOV / 2 * (CAM_Z - z) / CAM_Z;
function buildScare(n, c, t) {
  const asp = st.aspect || 1, r = (k) => hash(n * 13 + 5, k);
  SC.eyes = []; SC.hands = []; SC.shards = []; SC.crack = 0; SC.spider = 0;
  if (SC.kind === 'eyes') {
    // Eyeballs float out of the dark (0-17% of the visit), turn to look at you, sink back.
    const count = Math.max(4, Math.min(18, Math.round(3 + 2.5 * asp)));
    for (let i = 0; i < count; i++) {
      const a0 = 0.005 + 0.05 * r(i * 7 + 1), life = sm(a0, a0 + 0.04, c) * (1 - sm(0.12 + 0.03 * r(i * 7 + 2), 0.17, c));
      if (life <= 0) continue;
      const zt = 0.15 + 0.9 * r(i * 7 + 3), z = -0.25 + (zt + 0.25) * life;
      const look = sm(a0 + 0.03, a0 + 0.07, c);
      // (Not right at a wide wall's ends: perspective stretches them there.)
      SC.eyes.push({ x: (r(i * 7 + 4) * 2 - 1) * (halfW(z) - 0.15) * (asp > 2 ? 0.85 : 1), y: (r(i * 7 + 5) * 2 - 1) * (halfH(z) - 0.15), z, rad: (0.06 + 0.07 * r(i * 7 + 6)) * life, lx: (1 - look) * (r(i * 7 + 8) - 0.5) * 1.6, ly: (1 - look) * (r(i * 7 + 9) - 0.5) * 1.2 });
    }
  } else if (SC.kind === 'hands') {
    // Hands press out through the screen (30-52%), sliding down a little, then sink back.
    const amt = sm(0.3, 0.36, c) * (1 - sm(0.47, 0.52, c));
    if (amt > 0) {
      const count = asp > 2.5 ? 3 + (r(1) < 0.5 ? 1 : 0) : 2, w = halfW(0);
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1;
        let x = asp > 2.5 ? (-w + 0.4 + (2 * w - 0.8) * (i + 0.5) / count) : side * (0.45 + 0.1 * r(i + 3));
        if (asp > 2.5 && Math.abs(x - G.pos[0]) < 0.6) x += 0.7 * Math.sign(x - G.pos[0] || 1); // not right behind the ghost
        SC.hands.push({ x, y: -0.05 + 0.25 * (r(i + 5) - 0.5) - 0.12 * sm(0.36, 0.5, c), a: side * (0.15 + 0.2 * r(i + 7)), amt: amt * (0.8 + 0.2 * r(i + 9)) });
      }
    }
  } else if (SC.kind === 'shatter') {
    // When it lunges (peak at ~54%), the screen cracks and glass flies out at you.
    const since = (c - 0.545) * LOOP;
    if (since > 0) {
      SC.crack = 1 - sm(0.82, 0.9, c);
      if (!SC.impactFor || SC.impactFor !== n) { SC.impactFor = n; SC.impact = [G.pos[0], G.pos[1]]; }
      if (since < 2.2) {
        const count = Math.min(30, Math.round(14 + 4 * asp));
        for (let i = 0; i < count; i++) {
          const a = i / count * 6.283 + r(i * 5 + 1), sp = 0.4 + 0.9 * r(i * 5 + 2);
          const tt = since;
          SC.shards.push({ x: SC.impact[0] + Math.cos(a) * sp * tt * 0.7, y: SC.impact[1] + Math.sin(a) * sp * tt * 0.6 - 0.25 * tt * tt, z: 0.05 + (0.8 + 1.4 * r(i * 5 + 3)) * tt,
            s: (0.05 + 0.08 * r(i * 5 + 4)) * (1 - sm(1.6, 2.2, tt)), ax: tt * (3 + 5 * r(i * 5 + 5)), ay: tt * (2 + 6 * r(i * 5 + 6)) });
        }
      }
    }
  } else if (SC.kind === 'spider') {
    // A spider drops down on its thread close in front of you (40-64%),
    // bounces, twitches, hangs there - then shoots back up.
    const down = sm(0.4, 0.45, c), up = sm(0.6, 0.64, c);
    SC.spider = down * (1 - up);
    if (SC.spider > 0) {
      const z = 1.45, top = halfH(z) + 0.5, bob = 0.04 * Math.sin(t * 7) * Math.exp(-(c - 0.45) * 30 * (c > 0.45 ? 1 : 0)) + 0.015 * Math.sin(t * 1.3);
      const w = halfW(z) - 0.35;
      let x = asp > 2 ? clamp(G.pos[0] + (r(3) < 0.5 ? -1 : 1) * (0.9 + 0.4 * r(4)), -w, w) : clamp(G.pos[0] * 0.3 + (r(3) - 0.5) * 0.4, -w, w);
      const hang = 0.05 + 0.15 * r(5);
      SC.sp = [x, mix(top, hang, down) + (top - hang) * up * 1.4 + bob, z];
      SC.twitch = t;
    }
  }
}

// Now and then a pair of eyes opens in the far fog, away from the ghost,
// blinks, and fades (not while the eyeballs are out). A few at a time on a
// wall, one on a panel.
const BGE = [];
const BGE_COLS = [[1.1, 0.1, 0.04], [1.0, 0.75, 0.1], [0.3, 1.0, 0.3], [0.9, 0.95, 1.0], [0.3, 0.5, 1.1]];
function buildBgEyes(t) {
  BGE.length = 0;
  if (SC.kind === 'eyes' && SC.eyes.length) return;
  const asp = st.aspect || 1, slots = Math.max(1, Math.min(5, Math.round(asp * 0.7)));
  for (let k = 0; k < slots; k++) {
    const per = 7 + 3 * k, cyc = Math.floor(t / per), f = (t / per) - cyc, rr = (j) => hash(cyc * 31 + k * 7, j);
    if (rr(1) < 0.45) continue; // not every time
    const a = sm(0.1, 0.25, f) * (1 - sm(0.55, 0.7, f));
    if (a <= 0) continue;
    const z = 0, w = halfW(z) - 0.2, hgt = halfH(z) - 0.15;
    let x = (rr(2) * 2 - 1) * w; const y = (rr(3) * 2 - 1) * hgt;
    if (Math.abs(x - G.pos[0]) < 0.7 && !G.hidden && G.pos[2] > -0.5) x += (x < G.pos[0] ? -0.8 : 0.8); // not behind the ghost
    const blink = Math.abs(f - (0.3 + 0.2 * rr(4))) < 0.012 ? 0 : 1;
    BGE.push({ x, y, gap: 0.035 + 0.035 * rr(5), r2: 0.0004 + 0.0005 * rr(6), a: a * blink * (0.6 + 0.4 * rr(7)), c: BGE_COLS[Math.floor(rr(8) * BGE_COLS.length)] });
  }
}

// Bounding spheres of what's showing (for the screen boxes and quick rejects).
function scareSpheres() {
  const out = [];
  for (const e of SC.eyes) out.push([e.x, e.y, e.z, e.rad + 0.02]);
  for (const h of SC.hands) out.push([h.x, h.y + 0.05, 0.15, 0.55]);
  if (SC.shards.length) { let mx = 0, my = 0, mz = 0; for (const s of SC.shards) { mx += s.x; my += s.y; mz += s.z; } const k = SC.shards.length; mx /= k; my /= k; mz /= k; let rr = 0; for (const s of SC.shards) rr = Math.max(rr, len3(s.x - mx, s.y - my, s.z - mz) + s.s * 1.5); out.push([mx, my, mz, rr]); }
  if (SC.spider > 0) out.push([SC.sp[0], SC.sp[1], SC.sp[2], 0.42 * SPS]);
  return out;
}

function boxD(x, y, z, bx, by, bz) { const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz; return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); }
function capD(px, py, ax, ay, bx, by, r) { const bax = bx - ax, bay = by - ay, pax = px - ax, pay = py - ay; const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay)); return len2(pax - bax * h, pay - bay * h) - r; }
// A hand's outline on the screen plane (2D distance; < 0 inside).
function hand2d(x, y, H2) {
  const c = Math.cos(H2.a), s = Math.sin(H2.a), u = (x - H2.x) * c - (y - H2.y) * s, v = (x - H2.x) * s + (y - H2.y) * c;
  let d = ell(u, v + 0.07, 0, 0.17, 0.2, 1);
  for (let f = 0; f < 4; f++) { const fx = -0.12 + f * 0.08, top = 0.42 - Math.abs(f - 1.5) * 0.05; d = Math.min(d, capD(u, v, fx, 0.08, fx, top, 0.034)); }
  return Math.min(d, capD(u, v, -0.16, -0.03, -0.33, 0.15, 0.04));
}
// How far the rubbery screen bulges out at (x, y).
function bulge(x, y) {
  let h = 0;
  for (const H2 of SC.hands) { const d = hand2d(x, y, H2); h = Math.max(h, H2.amt * (0.28 * sm(0.12, -0.02, d) + 0.2 * Math.sqrt(clamp(-d * 4)) + 0.05 * Math.exp(-Math.max(0, d) * 6))); }
  return h;
}
// The spider, hanging head down, facing you. SPS: its size.
const SPS = 0.85;
function spiderD(x, y, z, want) {
  x = (x - SC.sp[0]) / SPS; y = (y - SC.sp[1]) / SPS; z = (z - SC.sp[2]) / SPS;
  let d = ell(x, y - 0.1, z, 0.15, 0.19, 0.14); // abdomen (up)
  const ceph = ell(x, y + 0.14, z - 0.02, 0.1, 0.1, 0.085); // head-and-body (down)
  d = smin(d, ceph, 0.03);
  if (want) SPM.part = 0;
  // Eight legs: two segments each, knees up and out, feet reaching down; they twitch.
  const ax = Math.abs(x), sgn = x < 0 ? -1 : 1, tw = SC.twitch;
  let legs = 1e9;
  if (ax < 0.5 && y > -0.55 && y < 0.3) for (let i = 0; i < 4; i++) {
    const tj = 0.04 * Math.sin(tw * (9 + i * 3) + i * 1.7 + sgn) * (Math.sin(tw * 1.1 + i) > 0.6 ? 1 : 0.2);
    const hy = -0.17 + i * 0.03, ky = 0.02 + 0.06 * i - 0.12 + tj, fy = -0.42 + 0.17 * i + tj * 1.5;
    const kx = 0.22 + 0.025 * i, fx = 0.34 + 0.03 * i - 0.06 * (i === 0 ? 1 : 0);
    legs = Math.min(legs, capR(ax, y, z, 0.06, hy, 0.02, kx, ky, 0.07, 0.02), capR(ax, y, z, kx, ky, 0.07, fx, fy, 0.1, 0.013));
  }
  d = Math.min(d, legs);
  // Fangs and a cluster of eyes.
  const fang = Math.min(capR(ax, y, z, 0.03, -0.22, 0.06, 0.035, -0.29, 0.08, 0.014));
  d = Math.min(d, fang);
  if (want) {
    const ey = Math.min(len3(ax - 0.035, y + 0.17, z - 0.085), len3(ax - 0.015, y + 0.2, z - 0.09)) - 0.017;
    SPM.part = ey < 0.008 ? 2 : (legs < d + 0.003 || fang < d + 0.003) ? 1 : 0;
    SPM.lx = x; SPM.ly = y; SPM.lz = z;
  }
  return d * SPS;
}
const SPM = { part: 0, lx: 0, ly: 0, lz: 0 };
function capR(px, py, pz, ax, ay, az, bx, by, bz, r) { const bax = bx - ax, bay = by - ay, baz = bz - az, pax = px - ax, pay = py - ay, paz = pz - az; const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)); return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r; }
function shardD(x, y, z, s) {
  const qx = x - s.x, qy = y - s.y, qz = z - s.z;
  const c1 = Math.cos(s.ay), s1 = Math.sin(s.ay), c2 = Math.cos(s.ax), s2 = Math.sin(s.ax);
  const u = qx * c1 - qz * s1, w = qx * s1 + qz * c1, v = qy * c2 - w * s2, w2 = qy * s2 + w * c2;
  return Math.max(boxD(u, v, w2, s.s, s.s * 0.8, 0.008), (u + v * 0.6) - s.s * 0.7); // a broken corner: a triangle-ish piece
}
// The scare objects (not the rubber screen): distance, and which one (SM.id).
const SM = { id: 0, ref: null };
function scareD(x, y, z, want) {
  let d = 1e9;
  for (const e of SC.eyes) { const de = len3(x - e.x, y - e.y, z - e.z) - e.rad; if (de < d) { d = de; if (want) { SM.id = 1; SM.ref = e; } } }
  for (const s of SC.shards) { if (s.s <= 0) continue; const ds = shardD(x, y, z, s); if (ds < d) { d = ds; if (want) SM.id = 2; } }
  if (SC.spider > 0) { const dk = spiderD(x, y, z, false); if (dk < d) { d = dk; if (want) SM.id = 3; } }
  return d;
}

// Shades a scare at one pixel, if one is in front of what's there already
// (base colour, at ray distance tBase). Returns true when it drew.
const KEY = norm3(-0.4, 0.6, 0.7);
function shadeScare(sx, sy, base, tBase, sph) {
  const oz = CAM_Z;
  let dx = sx * FOV, dy = sy * FOV, dz = -CAM_Z;
  const n = len3(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  let t0 = Infinity, t1 = 0;
  for (const S of sph) { const bx = S[0], by = S[1], bz = S[2] - oz, tb = bx * dx + by * dy + bz * dz, q = bx * bx + by * by + bz * bz - tb * tb; if (q < S[3] * S[3]) { const h = Math.sqrt(S[3] * S[3] - q); t0 = Math.min(t0, tb - h); t1 = Math.max(t1, tb + h); } }
  if (t0 === Infinity || t0 > tBase) return false;
  let tt = Math.max(0, t0), hit = false, rubber = false;
  const tEnd = Math.min(tBase, t1, -oz / dz + 0.01), hands = SC.hands.length > 0;
  for (let i = 0; i < 48 && tt < tEnd; i++) {
    const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
    let d = scareD(px, py, pz, false);
    if (hands && pz < 0.7) { const h = bulge(px, py); if (h > 0.004) { const dh = (pz - h) * 0.5; if (dh < d) { d = dh; if (d < 0.002) { rubber = true; } } } }
    if (d < 0.002) { hit = true; break; }
    tt += Math.max(0.004, d * 0.85);
  }
  if (!hit) return false;
  const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
  let nx, ny, nz, e = 0.003;
  if (rubber) { nx = -(bulge(px + e, py) - bulge(px - e, py)) / (2 * e); ny = -(bulge(px, py + e) - bulge(px, py - e)) / (2 * e); nz = 1; }
  else {
    scareD(px, py, pz, true);
    const a1 = scareD(px + e, py - e, pz - e), a2 = scareD(px - e, py - e, pz + e), a3 = scareD(px - e, py + e, pz - e), a4 = scareD(px + e, py + e, pz + e);
    nx = a1 - a2 - a3 + a4; ny = -a1 - a2 + a3 + a4; nz = -a1 + a2 - a3 + a4;
  }
  const nn = len3(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
  const ndl = clamp(nx * KEY[0] + ny * KEY[1] + nz * KEY[2]), ndv = clamp(-(nx * dx + ny * dy + nz * dz));
  const hx = KEY[0] - dx, hy = KEY[1] - dy, hz = KEY[2] - dz, hn = len3(hx, hy, hz), hdot = clamp((nx * hx + ny * hy + nz * hz) / hn);
  const rim = Math.pow(1 - ndv, 3);
  let r, g, b;
  if (rubber) {
    // The screen stretched over hands: dark and glossy, like wet rubber.
    const sp = Math.pow(hdot, 30) * 0.7, lit = 0.03 + 0.25 * ndl;
    r = 0.14 * lit + sp + rim * 0.12; g = 0.13 * lit + sp + rim * 0.14; b = 0.16 * lit + sp + rim * 0.18;
    const k = sm(0.0, 0.06, bulge(px, py)); r = mix(base[0], r, k); g = mix(base[1], g, k); b = mix(base[2], b, k);
  } else if (SM.id === 1) {
    // An eyeball: veined white, a red iris and black pupil looking where it looks, wet highlights.
    const E2 = SM.ref, ex = (px - E2.x) / E2.rad, ey = (py - E2.y) / E2.rad, ez = (pz - E2.z) / E2.rad;
    const lz = Math.sqrt(clamp(1 - E2.lx * E2.lx * 0.3 - E2.ly * E2.ly * 0.3)), dot = ex * E2.lx * 0.55 + ey * E2.ly * 0.55 + ez * lz;
    const vein = Math.max(0, 1 - Math.abs(noise(ex * 6 + 9, ey * 6) - 0.5) * 16) * sm(0.55, 0.2, dot);
    let cr = 0.85 - vein * 0.25, cg = 0.8 - vein * 0.6, cb = 0.72 - vein * 0.6, em = 0;
    if (dot > 0.8) { cr = 0.7; cg = 0.1; cb = 0.04; em = 0.35; }
    if (dot > 0.93) { cr = 0.01; cg = 0.01; cb = 0.01; em = 0; }
    const lit = 0.06 + 0.8 * ndl, sp = Math.pow(hdot, 120) * 1.4;
    r = cr * lit + sp + em * 0.9; g = cg * lit + sp + em * 0.06; b = cb * lit + sp + em * 0.03;
  } else if (SM.id === 2) {
    // Glass: dark, see-through, bright edges and glints.
    const sp = Math.pow(hdot, 100) * 1.6;
    r = base[0] * 0.5 + 0.08 + rim * 0.5 + sp; g = base[1] * 0.5 + 0.12 + rim * 0.7 + sp; b = base[2] * 0.5 + 0.16 + rim * 0.85 + sp;
  } else {
    // The spider: glossy black, a red hourglass on its belly, glinting red eyes.
    spiderD(px, py, pz, true);
    const lit = 0.04 + 0.4 * ndl, sp = Math.pow(hdot, 60) * 0.9;
    r = 0.04 * lit + sp + rim * 0.15; g = 0.035 * lit + sp + rim * 0.16; b = 0.045 * lit + sp + rim * 0.22;
    if (SPM.part === 2) { r = 1.0; g = 0.08; b = 0.04; }
    else if (SPM.part === 0 && SPM.lz > 0.05) {
      const hx = Math.abs(SPM.lx), hy = SPM.ly - 0.1, hour = hx < 0.055 - Math.abs(hy) * 0.45 + 0.012 && Math.abs(hy) < 0.11;
      if (hour) { r = 0.75 * (0.3 + 0.7 * ndl) + sp; g = 0.03; b = 0.02; }
    } else if (SPM.part === 1) { const hair = 0.5 + 0.5 * Math.sin(SPM.ly * 160); r += 0.03 * hair; g += 0.03 * hair; b += 0.03 * hair; } // bristly legs
  }
  base[0] = r; base[1] = g; base[2] = b;
  return true;
}

// ---- The screen: drifting fog ----
const CAM_Z = 3.4, FOV = 1.9; // close in: the ghost fills most of the height
const FOG = [0, 0, 0], OUT = [0, 0, 0], RIM = [0.35, 0.5, 0.55], FOG_EYE = [0, 0, 0];
function fogColour(x, y, t) {
  const f = noise(x * 2.2 + t * 0.15, y * 2.2 - t * 0.05) * 0.6 + noise(x * 5 - t * 0.3, y * 5 + t * 0.1) * 0.4;
  const v = 0.004 + 0.028 * f * f; // dark, so the ghost stands out
  const glow = G.hidden ? 0 : Math.exp(-len2(x - G.pos[0], y - G.pos[1]) * 1.4) * 0.04 * (0.5 + 0.5 * G.glow); // the eyes' light on the fog
  let pe = 0;
  if (G.peek > 0) { // just the eyes, glowing in the fog before it comes out
    const s = 0.75, ex = Math.abs(x - G.pos[0]) - G.F.gap * s, ey = y - G.pos[1] - 0.06 * s;
    pe = Math.exp(-(ex * ex + ey * ey * 1.6) / 0.0016) * G.peek * G.glow * 1.3 + Math.exp(-(ex * ex + ey * ey) / 0.02) * G.peek * G.glow * 0.12;
  }
  // Pairs of eyes glowing in the far fog now and then (see buildBgEyes).
  for (const be of BGE) {
    const ex = Math.abs(x - be.x) - be.gap, ey = y - be.y, d2 = ex * ex + ey * ey * 3;
    if (d2 < 0.02) { const k = be.a * (Math.exp(-d2 / be.r2) * 1.1 + Math.exp(-d2 / (be.r2 * 8)) * 0.15); FOG_EYE[0] += k * be.c[0]; FOG_EYE[1] += k * be.c[1]; FOG_EYE[2] += k * be.c[2]; }
  }
  let ck = 0;
  if (SC.crack > 0) { // the cracked screen round where it hit
    const cx = x - SC.impact[0], cy = y - SC.impact[1], rr = len2(cx, cy), a = Math.atan2(cy, cx);
    ck = SC.crack * (Math.max(0, 1 - Math.abs(Math.sin(a * 7 + noise(rr * 5, a * 2) * 2.5)) * 14) * sm(1.1, 0.05, rr) + Math.max(0, 1 - Math.abs(Math.sin(rr * 22)) * 10) * sm(0.35, 0.05, rr) * 0.5);
  }
  FOG[0] = v * 0.75 + glow * G.eye[0] * 0.5 + pe * G.eye[0] + ck * 0.55 + FOG_EYE[0]; FOG[1] = v * 0.9 + glow * G.eye[1] * 0.5 + pe * G.eye[1] + ck * 0.65 + FOG_EYE[1]; FOG[2] = v * 1.0 + glow * G.eye[2] * 0.5 + pe * G.eye[2] + ck * 0.75 + FOG_EYE[2];
  FOG_EYE[0] = FOG_EYE[1] = FOG_EYE[2] = 0;
  return FOG; // reused - copy it if you need to keep it
}

const SHROUD = [0.55, 0.62, 0.66], TEETH = [0.68, 0.64, 0.5], THROAT = [0.45, 0.08, 0.1];
function shadePixel(sx, sy, t) {
  const oz = CAM_Z;
  let dx = sx * FOV, dy = sy * FOV, dz = -CAM_Z;
  const n = len3(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  const B = G.bound, bx = B[0], by = B[1], bz = B[2] - oz, tb = bx * dx + by * dy + bz * dz;
  const miss = bx * bx + by * by + bz * bz - tb * tb > B[3] * B[3];
  const tPlane = -oz / dz;
  let tt = miss ? tPlane : Math.max(0, tb - B[3]), hitIt = false, eyeMin = 1e9;
  if (!miss) {
    for (let i = 0; i < 30 && tt < tPlane; i++) {
      const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
      const d = sdf(px, py, pz, false);
      let ed = 1e9;
      if (d < 0.25) { ed = eyeDist(px, py, pz); if (ed < eyeMin) eyeMin = ed; } // the eyes' glow only matters near the head
      if (d < 0.002) { hitIt = true; break; }
      tt += Math.max(0.005, Math.min(d, Math.max(ed, 0.02)) * 0.9);
    }
  }
  // Eye glow (a halo round each pupil, seen even outside the sockets).
  const eg = eyeMin < 1e8 ? Math.exp(-Math.max(0, eyeMin) * 40) * G.glow : 0;
  const E = G.eye;
  let col;
  st.lastT = hitIt ? tt : tPlane;
  if (!hitIt) {
    const f = fogColour(dx * tPlane, dy * tPlane, t);
    OUT[0] = f[0] + eg * E[0]; OUT[1] = f[1] + eg * E[1]; OUT[2] = f[2] + eg * E[2];
    return OUT;
  } else {
    const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
    sdf(px, py, pz, true);
    const mat = H.mat;
    const e = 0.003;
    const a1 = sdf(px + e, py - e, pz - e), a2 = sdf(px - e, py - e, pz + e), a3 = sdf(px - e, py + e, pz - e), a4 = sdf(px + e, py + e, pz + e);
    let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4;
    const nn = len3(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
    // Horror lighting: from below (the eyes and fog), cold, plus a weak top light.
    const below = clamp(-ny * 0.7 + nz * 0.5), top = clamp(ny * 0.6 + nz * 0.3) * 0.25;
    const ndv = clamp(-(nx * dx + ny * dy + nz * dz));
    const rim = Math.pow(1 - ndv, 2.5); // ghostly glow round the edges
    // Cheap occlusion: surfaces facing away from you (the sides of the
    // sockets, the jaw's underside) darken. (A proper occlusion test cost
    // three more distance evaluations per pixel - too slow on the Pi.)
    const ao = 0.55 + 0.45 * clamp(nz * 1.2 + 0.2);
    let base = mat === 2 ? SHROUD : mat === 3 ? TEETH : mat === 1 ? THROAT : G.F.skin;
    if (mat === 0 && G.F.veins > 0) { // dark veins creeping over the skin
      const hh = toHead(px, py, pz), v = Math.max(0, 1 - Math.abs(noise(hh[0] * 9 + 3, hh[1] * 9) - 0.5) * 14) * G.F.veins;
      if (v > 0) base = [base[0] * (1 - 0.55 * v), base[1] * (1 - 0.7 * v), base[2] * (1 - 0.6 * v)];
    }
    // Inside (throat, sockets) gets darker the deeper it goes.
    const lit = (0.06 + 0.65 * below + top) * ao * (mat === 1 ? 0.5 * sm(0.05, 0.3, H.depth) + 0.04 : 1);
    // Eye light spills onto the face round the sockets.
    const h = toHead(px, py, pz).slice(), spill = Math.exp(-(len2(Math.abs(h[0]) - G.F.gap, h[1] - 0.04) ** 2) / 0.02) * 0.5 * G.glow;
    const gleam = mat === 3 ? 0.1 * Math.pow(clamp(nz), 6) : 0; // a glint on the teeth
    const rk = rim * (mat === 1 ? 0.1 : 1);
    col = [base[0] * lit + rk * RIM[0] + spill * E[0] * 0.35 + gleam, base[1] * lit + rk * RIM[1] + spill * E[1] * 0.35 + gleam, base[2] * lit + rk * RIM[2] + spill * E[2] * 0.35 + gleam];
    // The cloth fades out towards the screen; and near the screen the fog swallows it all.
    const fade = sm(-0.05, 0.6, pz) * (mat === 2 ? sm(-1.2, -0.3, h[2]) * 0.8 + 0.2 : 1);
    const fog = fogColour(px, py, t);
    col = [mix(fog[0], col[0], fade), mix(fog[1], col[1], fade), mix(fog[2], col[2], fade)];
  }
  OUT[0] = col[0] + eg * E[0]; OUT[1] = col[1] + eg * E[1]; OUT[2] = col[2] + eg * E[2];
  return OUT; // reused
}

// The picture (the whole screen: a wall's full width) is built a quarter of
// the rows per frame into a back buffer, all at one moment (the pose is
// fixed for the four frames), and shown only when it's complete - mixing
// rows from different moments tore the image whenever the ghost moved
// quickly. Only pixels near the ghost are ray-marched; the rest is fog.
const PASSES = 4;
function render(Wr, Hr, dt) {
  const first = !st.img || st.w !== Wr || st.h !== Hr;
  st.pdt = (st.pdt || 0) + dt; st.aspect = Wr / Hr;
  if (first) { st.img = new Float32Array(Wr * Hr * 3); st.back = new Float32Array(Wr * Hr * 3); st.w = Wr; st.h = Hr; st.frame = 0; st.lastCycle = -1; }
  const pass = first ? 0 : st.frame++ % PASSES;
  if (pass === 0) {
    buildPose(st.t, st.pdt); st.pdt = 0; st.rt = st.t;
    // The ghost's box on screen (its bounding sphere, projected, plus room for the eye glow).
    const B = G.bound, k = CAM_Z / ((CAM_Z - B[2]) * FOV), cx = B[0] * k * Hr + Wr / 2, r = (B[3] * k + 0.05) * Hr;
    st.bx0 = Math.max(0, Math.floor(cx - r)); st.bx1 = Math.min(Wr, Math.ceil(cx + r));
    if (G.pos[2] < -0.45) st.bx1 = st.bx0; // still behind the screen (the fog hides it; peeking eyes are drawn with the fog): nothing to ray-march
    // Where the spider's thread runs on screen (column, and the row it ends at).
    if (SC.spider > 0) { const k3 = CAM_Z / ((CAM_Z - SC.sp[2]) * FOV); st.thread = [Math.max(0, Math.min(Wr - 1, Math.round(SC.sp[0] * k3 * Hr + Wr / 2))), Math.round((0.5 - (SC.sp[1] + 0.24 * SPS) * k3) * Hr)]; } else st.thread = null;
    // The scares' boxes on screen.
    st.sph = scareSpheres(); st.sboxes = [];
    for (const S of st.sph) { const k2 = CAM_Z / ((CAM_Z - S[2]) * FOV); if (k2 <= 0) continue; const c2 = S[0] * k2 * Hr + Wr / 2, r2 = S[3] * k2 * Hr + 1; st.sboxes.push([Math.max(0, Math.floor(c2 - r2)), Math.min(Wr, Math.ceil(c2 + r2))]); }
  }
  if (first) { for (let q = 0; q < PASSES; q++) renderRows(Wr, Hr, q); st.img.set(st.back); return; }
  renderRows(Wr, Hr, pass);
  if (pass === PASSES - 1) { const tmp = st.img; st.img = st.back; st.back = tmp; }
}
// Near the ghost, only every other pixel is ray-marched; those between are
// the average of their neighbours unless the two differ (an edge, an eye),
// where they're ray-marched too - about half the rays for the same look.
function renderRows(Wr, Hr, pass) {
  const B = st.back;
  for (let y = pass; y < Hr; y += PASSES) {
    const sy = 0.5 - (y + 0.5) / Hr, row = y * Wr;
    for (let x = 0; x < Wr; x++) {
      const sx = (x + 0.5 - Wr / 2) / Hr, o = (row + x) * 3;
      const inBox = x >= st.bx0 && x < st.bx1;
      if (inBox && ((x - st.bx0) & 1)) continue; // filled in below
      if (!inBox && (x & 1) && x > 0 && !(x - 1 >= st.bx0 && x - 1 < st.bx1)) { B[o] = B[o - 3]; B[o + 1] = B[o - 2]; B[o + 2] = B[o - 1]; continue; } // fog is soft: half resolution is plenty
      const c = inBox ? shadePixel(sx, sy, st.rt) : fogColour(sx * FOV, sy * FOV, st.rt);
      B[o] = c[0]; B[o + 1] = c[1]; B[o + 2] = c[2];
    }
    for (let x = st.bx0 + 1; x < st.bx1; x += 2) {
      const o = (row + x) * 3, l = o - 3, r = x + 1 < Wr ? o + 3 : o - 3;
      const diff = Math.abs(B[l] - B[r]) + Math.abs(B[l + 1] - B[r + 1]) + Math.abs(B[l + 2] - B[r + 2]);
      if (diff < 0.12) { B[o] = (B[l] + B[r]) / 2; B[o + 1] = (B[l + 1] + B[r + 1]) / 2; B[o + 2] = (B[l + 2] + B[r + 2]) / 2; }
      else { const c = shadePixel((x + 0.5 - Wr / 2) / Hr, 0.5 - (y + 0.5) / Hr, st.rt); B[o] = c[0]; B[o + 1] = c[1]; B[o + 2] = c[2]; }
    }
    // Scares on top, where they're in front of the ghost.
    if (st.sboxes && st.sboxes.length) {
      for (let x = 0; x < Wr; x++) {
        let inS = false; for (const bx of st.sboxes) if (x >= bx[0] && x < bx[1]) { inS = true; break; }
        if (!inS) continue;
        const sx = (x + 0.5 - Wr / 2) / Hr, o = (row + x) * 3;
        let tBase = Infinity;
        if (x >= st.bx0 && x < st.bx1) { shadePixel(sx, sy, st.rt); tBase = st.lastT; }
        PX[0] = B[o]; PX[1] = B[o + 1]; PX[2] = B[o + 2];
        if (shadeScare(sx, sy, PX, tBase, st.sph)) { B[o] = PX[0]; B[o + 1] = PX[1]; B[o + 2] = PX[2]; }
      }
    }
    // The spider's silk thread, from the top down to it.
    if (SC.spider > 0 && st.thread && y < st.thread[1]) { const o = (row + st.thread[0]) * 3; B[o] += 0.12; B[o + 1] += 0.13; B[o + 2] += 0.15; }
  }
}
const PX = [0, 0, 0];
// The static glitch during a lunge: whole rows jump sideways.
function glitchShift(y) { return G.glitch > 0 && hash(y, Math.floor(st.t * 20)) < 0.25 * G.glitch ? Math.round((hash(y + 99, Math.floor(st.t * 20)) - 0.5) * 10 * G.glitch) : 0; }

function ghost3dWall(core, dt) {
  if (!core.wallW) return;
  st.t += dt;
  const W = core.wallW, Hh = core.wallH;
  render(W, Hh, dt);
  for (let y = 0; y < Hh; y++) {
    const gs = glitchShift(y);
    for (let x = 0; x < W; x++) {
      const xi = Math.max(0, Math.min(W - 1, x - gs)), o = (y * W + xi) * 3;
      core.setWallPixel(x, y, st.img[o], st.img[o + 1], st.img[o + 2]);
    }
  }
}

function ghost3d(core, dt) {
  st.t += dt;
  const S = core.SIZE;
  render(S, S, dt);
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  // The same ghost on each side face; face rows run bottom-up (see text.js).
  for (let f = 0; f < 4; f++) for (let v = 0; v < S; v++) {
    const y = S - 1 - v, gs = glitchShift(y);
    for (let u = 0; u < S; u++) {
      const xi = Math.max(0, Math.min(S - 1, u - gs)), o = (y * S + xi) * 3;
      core.setFaceLED(f, u, v, st.img[o], st.img[o + 1], st.img[o + 2]);
    }
  }
}

ghost3d.wall = ghost3dWall;
ghost3d._test = { st, buildPose, G, SC };
module.exports = ghost3d;
