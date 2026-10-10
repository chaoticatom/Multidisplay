// Ghost Face 2: the Ghost Face in true 3D, ray-marched per pixel. A pale,
// gaunt head with hollow eye sockets and glowing eyes, a skull-like nose
// cavity and a long gaping mouth, its ragged shroud trailing back into the
// screen, drifts out of the fog towards you, sways and stares (the eyes
// wander and blink), now and then lunges at you with a static glitch, then
// sinks back into the screen. ~14 s loop; a new eye colour each time.
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
function ell(x, y, z, rx, ry, rz) { const k0 = Math.hypot(x / rx, y / ry, z / rz), k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz)); return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz); }

const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---- Pose: where the head is, which way it looks, the face's state ----
const LOOP = 14;
const EYES = [[1.2, 0.12, 0.05], [0.2, 1.1, 0.25], [0.35, 0.6, 1.2], [1.1, 0.65, 0.05], [0.95, 1.0, 1.1]];
const G = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, mouth: 0.6, glow: 1, eye: EYES[0], look: [0, 0], glitch: 0, t: 0 };
const st = { t: 0, frame: 0, img: null, size: 0, blink: 0, nextBlink: 2, look: [0, 0], lookTo: [0, 0], nextLook: 1, lastCycle: -1 };

function buildPose(t, dt) {
  const n = Math.floor(t / LOOP), c = (t % LOOP) / LOOP;
  if (n !== st.lastCycle) { st.lastCycle = n; G.eye = EYES[n % EYES.length]; }
  // Out of the screen (0-25%), hover and stare (25-80%) with a lunge in the
  // middle, back in (80-100%).
  const out = sm(0, 0.25, c) * (1 - sm(0.8, 1, c));
  const lungeT = (c - 0.52) / 0.07, lunge = lungeT > 0 && lungeT < 1 ? Math.sin(lungeT * Math.PI) ** 0.6 : 0;
  G.pos = [0.12 * Math.sin(t * 0.6) + 0.05 * Math.sin(t * 1.7), -0.05 + 0.06 * Math.sin(t * 0.9), -1.0 + 2.0 * out + 0.9 * lunge];
  G.yaw = 0.35 * Math.sin(t * 0.45) + 0.1 * Math.sin(t * 1.3); G.pitch = -0.08 + 0.08 * Math.sin(t * 0.7); G.roll = 0.12 * Math.sin(t * 0.5 + 1);
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
}

function toHead(px, py, pz) {
  const x = px - G.pos[0], y = py - G.pos[1], z = pz - G.pos[2], m = G.m;
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

// The ghost. mat: 0 skin, 1 inside (sockets, nose, mouth), 2 shroud.
const H = { mat: 0 };
function sdfHead(x, y, z, want) {
  // Skull: a tall egg, gaunt cheeks, a long jaw.
  let d = ell(x, y - 0.05, z, 0.34, 0.44, 0.38);
  d = smin(d, ell(x, y + 0.28, z + 0.02, 0.24, 0.3 + 0.08 * G.mouth, 0.3), 0.12); // jaw, stretched by the gaping mouth
  d = smax(d, -ell(x - 0.24 * Math.sign(x), y + 0.15, z - 0.2, 0.08, 0.16, 0.12), 0.06); // hollow cheeks
  // Brow ridge.
  d = smin(d, ell(x, y - 0.13, z - 0.27, 0.27, 0.06, 0.08), 0.06);
  // Eye sockets, nose cavity, mouth - carved out.
  const ex = Math.abs(x) - 0.13;
  const socket = ell(ex, y - 0.04, z - 0.33, 0.095, 0.085, 0.13);
  const nose = ell(x, y + 0.1 + 0.6 * Math.abs(x), z - 0.36, 0.035, 0.06, 0.08);
  const mw = 0.11 + 0.02 * Math.sin(G.t * 0.7), mh = 0.06 + 0.13 * G.mouth;
  const jag = 0.012 * Math.sin(x * 70); // jagged teeth round the mouth's edge
  const mouth = ell(x, y + 0.36 + mh * 0.3, z - 0.3, mw, mh, 0.16) + jag;
  const holes = Math.min(socket, nose, mouth);
  d = smax(d, -holes, 0.025);
  // The shroud: ragged cloth from behind the head back into the screen.
  const back = clamp(-(z + 0.1) / 1.6);
  const wave = 0.05 * Math.sin(y * 9 + G.t * 2) * back + 0.04 * Math.sin(x * 11 - G.t * 1.6) * back;
  const shroud = Math.hypot(x * (1 - 0.25 * back), (y - 0.05 + 0.25 * back) * 0.9) - (0.36 + 0.3 * back + wave);
  const shroudD = Math.max(shroud, z - 0.05 + 0.5 * Math.max(0, y - 0.2), -z - 1.8);
  d = smin(d, shroudD, 0.08);
  if (want) H.mat = holes < 0.02 ? 1 : shroudD < d + 0.01 && z < -0.05 ? 2 : 0;
  return d;
}
function sdf(px, py, pz, want) { const h = toHead(px, py, pz); return sdfHead(h[0], h[1], h[2], want); }

// The two eyes' glowing pupils, deep in the sockets (head space).
function eyeDist(px, py, pz) {
  const h = toHead(px, py, pz);
  const lx = G.look[0] * 0.025, ly = G.look[1] * 0.02;
  return Math.min(Math.hypot(h[0] - 0.13 - lx, h[1] - 0.04 - ly, h[2] - 0.27), Math.hypot(h[0] + 0.13 - lx, h[1] - 0.04 - ly, h[2] - 0.27)) - 0.028;
}

// ---- The screen: drifting fog ----
const CAM_Z = 3.4, FOV = 2.6;
function fogColour(x, y, t) {
  const f = noise(x * 2.2 + t * 0.15, y * 2.2 - t * 0.05) * 0.6 + noise(x * 5 - t * 0.3, y * 5 + t * 0.1) * 0.4;
  const v = 0.03 + 0.11 * f * f;
  const glow = Math.exp(-Math.hypot(x - G.pos[0], y - G.pos[1]) * 1.4) * 0.06 * (0.5 + 0.5 * G.glow); // the eyes' light on the fog
  return [v * 0.75 + glow * G.eye[0] * 0.5, v * 0.9 + glow * G.eye[1] * 0.5, v * 1.0 + glow * G.eye[2] * 0.5];
}

const SKIN = [0.8, 0.9, 0.88], SHROUD = [0.55, 0.62, 0.66];
function shadePixel(sx, sy, t) {
  const oz = CAM_Z;
  let dx = sx * FOV, dy = sy * FOV, dz = -CAM_Z;
  const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  const B = G.bound, bx = B[0], by = B[1], bz = B[2] - oz, tb = bx * dx + by * dy + bz * dz;
  const miss = bx * bx + by * by + bz * bz - tb * tb > B[3] * B[3];
  const tPlane = -oz / dz;
  let tt = miss ? tPlane : Math.max(0, tb - B[3]), hitIt = false, eyeMin = 1e9;
  if (!miss) {
    for (let i = 0; i < 44 && tt < tPlane; i++) {
      const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
      const ed = eyeDist(px, py, pz); if (ed < eyeMin) eyeMin = ed;
      const d = sdf(px, py, pz, false);
      if (d < 0.002) { hitIt = true; break; }
      tt += Math.max(0.003, Math.min(d, Math.max(ed, 0.015)) * 0.7);
    }
  }
  // Eye glow (a halo round each pupil, seen even outside the sockets).
  const eg = eyeMin < 1e8 ? Math.exp(-Math.max(0, eyeMin) * 40) * G.glow : 0;
  const E = G.eye;
  let col;
  if (!hitIt) {
    col = fogColour(dx * tPlane, dy * tPlane, t);
  } else {
    const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
    sdf(px, py, pz, true);
    const mat = H.mat;
    const e = 0.003;
    const a1 = sdf(px + e, py - e, pz - e), a2 = sdf(px - e, py - e, pz + e), a3 = sdf(px - e, py + e, pz - e), a4 = sdf(px + e, py + e, pz + e);
    let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4;
    const nn = Math.hypot(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
    // Horror lighting: from below (the eyes and fog), cold, plus a weak top light.
    const below = clamp(-ny * 0.7 + nz * 0.5), top = clamp(ny * 0.6 + nz * 0.3) * 0.25;
    const ndv = clamp(-(nx * dx + ny * dy + nz * dz));
    const rim = Math.pow(1 - ndv, 2.5); // ghostly glow round the edges
    let ao = 0;
    for (let i = 1; i <= 3; i++) { const h = 0.035 * i; ao += (h - sdf(px + nx * h, py + ny * h, pz + nz * h)) / h / i; }
    ao = clamp(1 - ao * 0.7);
    const base = mat === 2 ? SHROUD : SKIN;
    const lit = (0.06 + 0.65 * below + top) * ao * (mat === 1 ? 0.15 : 1);
    // Eye light spills onto the face round the sockets.
    const h = toHead(px, py, pz), spill = Math.exp(-(Math.hypot(Math.abs(h[0]) - 0.13, h[1] - 0.04) ** 2) / 0.02) * 0.5 * G.glow;
    col = [0, 1, 2].map((k) => base[k] * lit + rim * [0.35, 0.5, 0.55][k] * (mat === 1 ? 0.1 : 1) + spill * E[k] * 0.35);
    // The cloth fades out towards the screen; and near the screen the fog swallows it all.
    const fade = sm(-0.05, 0.6, pz) * (mat === 2 ? sm(-1.2, -0.3, h[2]) * 0.8 + 0.2 : 1);
    const fog = fogColour(px, py, t);
    col = [mix(fog[0], col[0], fade), mix(fog[1], col[1], fade), mix(fog[2], col[2], fade)];
  }
  return [col[0] + eg * E[0], col[1] + eg * E[1], col[2] + eg * E[2]];
}

const PASSES = 4;
function render(S, dt) {
  const first = !st.img || st.size !== S;
  if (first) { st.img = new Float32Array(S * S * 3); st.size = S; st.frame = 0; }
  buildPose(st.t, dt);
  if (first) { for (let k = 0; k < PASSES; k++) renderRows(S, k); return; }
  renderRows(S, st.frame++ % PASSES);
}
function renderRows(S, pass) {
  for (let y = pass; y < S; y += PASSES) for (let x = 0; x < S; x++) {
    const c = shadePixel((x + 0.5) / S - 0.5, 0.5 - (y + 0.5) / S, st.t), o = (y * S + x) * 3;
    st.img[o] = c[0]; st.img[o + 1] = c[1]; st.img[o + 2] = c[2];
  }
}
// The static glitch during a lunge: whole rows jump sideways.
function glitchShift(y) { return G.glitch > 0 && hash(y, Math.floor(st.t * 20)) < 0.25 * G.glitch ? Math.round((hash(y + 99, Math.floor(st.t * 20)) - 0.5) * 10 * G.glitch) : 0; }

function ghost3dWall(core, dt) {
  if (!core.wallW) return;
  st.t += dt;
  const W = core.wallW, Hh = core.wallH, S = Hh, x0 = Math.floor((W - S) / 2);
  render(S, dt);
  for (let y = 0; y < Hh; y++) {
    const gs = glitchShift(y);
    for (let x = 0; x < W; x++) {
      const xi = x - x0 - gs;
      if (xi >= 0 && xi < S) { const o = (y * S + xi) * 3; core.setWallPixel(x, y, st.img[o], st.img[o + 1], st.img[o + 2]); continue; }
      const c = fogColour(((x - x0) + 0.5) / S * FOV - FOV / 2, (0.5 - (y + 0.5) / S) * FOV, st.t);
      core.setWallPixel(x, y, c[0], c[1], c[2]);
    }
  }
}

function ghost3d(core, dt) {
  st.t += dt;
  const S = core.SIZE;
  render(S, dt);
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
ghost3d._test = { st, buildPose, G };
module.exports = ghost3d;
