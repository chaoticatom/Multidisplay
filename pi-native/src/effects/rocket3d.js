// 3D Rocket: a glossy rocket bursts out of the display towards you, ray-
// marched per pixel. The screen is a dark glassy surface (the plane z = 0)
// with a glowing portal where the rocket comes through; it flies out,
// rolling and weaving, grows as it nears you and shoots past, then the next
// one launches.
// The rocket is a signed-distance shape: a rounded body, a nose cone, three
// swept fins, a dark nozzle and a glass porthole with a chrome rim. Painted
// red and white with glossy highlights and reflections (the portal's blue
// glow below, the dark room above), a white-hot exhaust flame fading to
// orange and red, the flame's warm light on the rocket's tail, and the
// rocket's soft shadow on the screen.
// The rocket's area is ray-marched a quarter of its rows per frame (it's the
// heavy part); the rest of the screen is drawn analytically every frame.
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1 - h); }
function norm3(x, y, z) { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; }

// A tapered capsule along the local y axis from y0 (radius r0) to y1 (r1).
function capY(x, y, z, y0, y1, r0, r1) {
  const h = clamp((y - y0) / (y1 - y0));
  return Math.hypot(x, y - (y0 + (y1 - y0) * h), z) - (r0 + (r1 - r0) * h);
}

// ---- The rocket's flight: position and orientation for a moment ----
const CYCLE = 6; // seconds per launch
const R = { pos: [0, 0, 0], f: [0, 0, 1], u: [0, 1, 0], s: [1, 0, 0], portal: [0, -0.1], bound: null, flame: 1, t: 0 };

function buildPose(t) {
  const n = Math.floor(t / CYCLE), c = (t % CYCLE) / CYCLE;
  // Each launch heads off a little differently (out to the left or right).
  const side = n % 2 ? 1 : -1, lift = 0.25 + 0.15 * Math.sin(n * 2.1);
  // Path: from behind the screen, out through the portal, towards and past you.
  const z = -1.2 + 4.3 * Math.pow(c, 1.25);
  const x = side * (0.05 + 0.35 * c * c) + 0.08 * Math.sin(t * 3.1);
  const y = -0.15 + lift * c * c + 0.06 * Math.sin(t * 2.3 + 1);
  R.pos = [x, y, z];
  // Pointing along its path (mostly at you), rolling as it flies.
  const f = norm3(side * (0.5 + 0.6 * c) + 0.12 * Math.cos(t * 3.1), 0.35 + lift * c + 0.1 * Math.cos(t * 2.3 + 1), 1.6); // three-quarter view: you see its side and its flame
  let up = Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let s = norm3(up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]);
  let u = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
  const roll = t * 2.2, cr = Math.cos(roll), sr = Math.sin(roll);
  const s2 = [s[0] * cr + u[0] * sr, s[1] * cr + u[1] * sr, s[2] * cr + u[2] * sr];
  const u2 = [u[0] * cr - s[0] * sr, u[1] * cr - s[1] * sr, u[2] * cr - s[2] * sr];
  // Local axes: y = nose direction (f), x = s2, z = u2.
  R.f = f; R.s = s2; R.u = u2;
  R.flame = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 23);
  // Where the path meets the screen (z = 0): the portal sits there.
  const c0 = Math.pow(1.2 / 4.3, 1 / 1.25);
  R.portal = [side * (0.05 + 0.35 * c0 * c0), -0.15 + lift * c0 * c0];
  R.glow = sm(0.05, 0.15, c) * (1 - sm(0.75, 1, c)) + 0.25; // the portal flares as it launches
  R.bound = [x, y, z, 1.25];
  R.t = t;
}

// World -> rocket space (nose along +y).
function toLocal(px, py, pz) {
  const x = px - R.pos[0], y = py - R.pos[1], z = pz - R.pos[2];
  return [x * R.s[0] + y * R.s[1] + z * R.s[2], x * R.f[0] + y * R.f[1] + z * R.f[2], x * R.u[0] + y * R.u[1] + z * R.u[2]];
}

// The rocket. mat (when wanted): 0 white paint, 1 red paint, 2 nozzle, 3 glass, 4 chrome.
const M = { id: 0 };
function sdfLocal(x, y, z, want) {
  const body = capY(x, y, z, -0.42, 0.42, 0.155, 0.17);
  const nose = capY(x, y, z, 0.42, 0.88, 0.17, 0.025);
  let d = smin(body, nose, 0.04);
  const nozzle = Math.max(capY(x, y, z, -0.56, -0.42, 0.115, 0.1), -(Math.hypot(x, z) - 0.075)); // hollow bell
  d = Math.min(d, nozzle);
  // Three swept fins round the tail.
  let fin = 1e9;
  const a = Math.atan2(z, x), r = Math.hypot(x, z);
  const k = Math.round(a / (2 * Math.PI / 3)) * (2 * Math.PI / 3), ang = a - k; // into the nearest fin's frame
  const fx = r * Math.cos(ang), fz = r * Math.sin(ang);
  {
    const lx = fx - 0.28, ly = y + 0.32 - (fx - 0.17) * 0.8; // swept back
    const qx = Math.abs(lx) - 0.115, qy = Math.abs(ly) - 0.15 + 0.3 * (lx + 0.115), qz = Math.abs(fz) - 0.026;
    fin = (Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.012) * 0.8;
  }
  d = smin(d, fin, 0.02);
  if (want) {
    // Porthole on the local +z side.
    const wd = Math.hypot(x, y - 0.18);
    if (d === nozzle || nozzle < 0.004) M.id = 2;
    else if (fin < body - 0.005 && fin < nose) M.id = 1;
    else if (z > 0.05 && wd < 0.06) M.id = 3;
    else if (z > 0.05 && wd < 0.078) M.id = 4;
    else if (y > 0.5 || (y > -0.08 && y < 0.02) || y < -0.33) M.id = 1; // red nose, band and tail
    else M.id = 0;
  }
  return d;
}
function sdf(px, py, pz, want) { const l = toLocal(px, py, pz); return sdfLocal(l[0], l[1], l[2], want); }

// Distance to the exhaust flame (behind the nozzle, along local -y), for its glow.
function flameDist(px, py, pz) {
  const l = toLocal(px, py, pz), len = 0.85 * R.flame;
  return capY(l[0], l[1], l[2], -0.56 - len, -0.5, 0.02, 0.1) + 0.02 * Math.sin(l[1] * 40 + R.t * 50);
}

// ---- Camera, lights, the screen ----
const CAM_Z = 3.4, FOV = 2.85;
const KEY = norm3(-0.6, 0.65, 0.45), KEY_COL = [1.0, 0.95, 0.88];

function screenColour(x, y, t, shadow) {
  const r = Math.hypot(x - R.portal[0], (y - R.portal[1]) * 1.6);
  const ring = Math.exp(-((r - 0.45) ** 2) / 0.006) * R.glow;
  const ripple = 0.5 + 0.5 * Math.sin(r * 18 - t * 5);
  const fall = Math.exp(-r * 1.5);
  const grid = (Math.abs(((x * 12) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((y * 12) % 1 + 1) % 1 - 0.5) > 0.46) ? 0.012 : 0;
  const cr = 0.02 + grid + fall * ripple * 0.05 + ring * 0.15, cg = 0.025 + grid + fall * ripple * 0.11 + ring * 0.55, cb = 0.04 + grid + fall * ripple * 0.18 + ring * 0.85;
  const sh = 1 - 0.4 * shadow;
  return [cr * sh, cg * sh, cb * sh];
}

// What a reflection sees: the dark room above, the portal's blue glow below.
function envColour(dy) { const b = sm(0.2, -0.8, dy); return [0.04 + 0.1 * b, 0.05 + 0.35 * b, 0.07 + 0.55 * b]; }

const PAINT = [[0.92, 0.92, 0.9], [0.85, 0.08, 0.06], [0.16, 0.15, 0.15], [0.08, 0.14, 0.25], [0.75, 0.76, 0.8]];
const GLOSS = [60, 60, 25, 120, 90], REFL = [0.12, 0.12, 0.25, 0.5, 0.65];

function shadePixel(sx, sy, t) {
  const oz = CAM_Z;
  let dx = sx * FOV, dy = sy * FOV, dz = -CAM_Z;
  const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  const B = R.bound, bx = B[0], by = B[1], bz = B[2] - oz, tb = bx * dx + by * dy + bz * dz;
  const miss = bx * bx + by * by + bz * bz - tb * tb > B[3] * B[3];
  const tPlane = -oz / dz;
  let tt = miss ? tPlane : Math.max(0, tb - B[3]), hitIt = false, glowMin = 1e9;
  if (!miss) {
    for (let i = 0; i < 64 && tt < tPlane; i++) {
      const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
      const fd = flameDist(px, py, pz);
      if (fd < glowMin) glowMin = fd;
      const d = sdf(px, py, pz, false);
      if (d < 0.002) { hitIt = true; break; }
      tt += Math.max(0.003, Math.min(d, Math.max(fd, 0.02)) * 0.6); // careful steps (the swept fins), smaller near the flame for its glow
    }
  }
  // The flame's glow: white-hot core, orange, then red.
  const g = glowMin < 1e8 ? Math.exp(-Math.max(0, glowMin) * 16) * R.flame : 0;
  const flame = [g * 1.6, g * g * 1.1 + g * 0.25, g * g * g * 0.9];
  let col;
  if (!hitIt) {
    const px = dx * tPlane, py = dy * tPlane;
    let shadow = 0;
    if (!miss && R.pos[2] > -0.3) {
      let k = 1, s = 0.05;
      for (let i = 0; i < 12 && s < 3; i++) {
        const d = sdf(px + KEY[0] * s, py + KEY[1] * s, KEY[2] * s, false);
        k = Math.min(k, 8 * d / s); s += clamp(d, 0.05, 0.4);
        if (k < 0.01) break;
      }
      shadow = 1 - clamp(k);
    }
    col = screenColour(px, py, t, shadow);
  } else {
    const px = dx * tt, py = dy * tt, pz = oz + dz * tt;
    sdf(px, py, pz, true);
    const id = M.id;
    const e = 0.002;
    const a1 = sdf(px + e, py - e, pz - e), a2 = sdf(px - e, py - e, pz + e), a3 = sdf(px - e, py + e, pz - e), a4 = sdf(px + e, py + e, pz + e);
    let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4;
    const nn = Math.hypot(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
    const ndl = clamp(nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
    const vx = -dx, vy = -dy, vz = -dz, ndv = clamp(nx * vx + ny * vy + nz * vz);
    const hx = KEY[0] + vx, hy = KEY[1] + vy, hz = KEY[2] + vz, hn = Math.hypot(hx, hy, hz);
    const spec = Math.pow(clamp((nx * hx + ny * hy + nz * hz) / hn), GLOSS[id]) * (id === 2 ? 0.3 : 1.1);
    // Reflection direction, for the environment.
    const rdy = dy - 2 * (dx * nx + dy * ny + dz * nz) * ny;
    const env = envColour(rdy), fres = REFL[id] + (1 - REFL[id]) * Math.pow(1 - ndv, 5) * 0.6;
    // The flame's warm light on the tail.
    const l = toLocal(px, py, pz), tail = Math.exp(-Math.max(0, l[1] + 0.5) * 6) * R.flame;
    const base = PAINT[id];
    col = [0, 1, 2].map((k) => {
      const diff = base[k] * (0.1 + 0.9 * ndl * KEY_COL[k]);
      return mix(diff, env[k], fres) + spec * KEY_COL[k] + tail * [0.5, 0.25, 0.05][k] * base[k];
    });
    // Behind the screen, the rocket is hidden by the screen except through the portal.
    if (pz < 0) {
      const pr = Math.hypot(px - R.portal[0], (py - R.portal[1]) * 1.6);
      const through = sm(0.45, 0.38, pr);
      const sc = screenColour(px, py, t, 0);
      col = [mix(sc[0], col[0] * 0.8 + 0.05, through), mix(sc[1], col[1] * 0.8 + 0.2, through), mix(sc[2], col[2] * 0.8 + 0.3, through)];
    }
  }
  return [col[0] + flame[0], col[1] + flame[1], col[2] + flame[2]];
}

const st = { t: 0, frame: 0, img: null, size: 0 };
// A quarter of the rows each frame (interleaved), to spread the work.
const PASSES = 4;
function render(S) {
  if (!st.img || st.size !== S) { st.img = new Float32Array(S * S * 3); st.size = S; st.frame = 0; for (let k = 0; k < PASSES; k++) renderRows(S, k); return; }
  renderRows(S, st.frame++ % PASSES);
}
function renderRows(S, pass) {
  buildPose(st.t);
  for (let y = pass; y < S; y += PASSES) for (let x = 0; x < S; x++) {
    const c = shadePixel((x + 0.5) / S - 0.5, 0.5 - (y + 0.5) / S, st.t), o = (y * S + x) * 3;
    st.img[o] = c[0]; st.img[o + 1] = c[1]; st.img[o + 2] = c[2];
  }
}

function rocket3dWall(core, dt) {
  if (!core.wallW) return;
  st.t += dt;
  const W = core.wallW, H = core.wallH, S = H, x0 = Math.floor((W - S) / 2);
  render(S);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= x0 && x < x0 + S) { const o = (y * S + (x - x0)) * 3; core.setWallPixel(x, y, st.img[o], st.img[o + 1], st.img[o + 2]); continue; }
    const c = screenColour((((x - x0) + 0.5) / S - 0.5) * FOV, (0.5 - (y + 0.5) / S) * FOV, st.t, 0); // the same screen-plane units as the ray-marched square
    core.setWallPixel(x, y, c[0], c[1], c[2]);
  }
}

function rocket3d(core, dt) {
  st.t += dt;
  const S = core.SIZE;
  render(S);
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const o = ((S - 1 - v) * S + u) * 3;
    core.setFaceLED(0, u, v, st.img[o], st.img[o + 1], st.img[o + 2]);
  }
}

rocket3d.wall = rocket3dWall;
rocket3d._test = { st, buildPose, shadePixel, R };
module.exports = rocket3d;
