// 3D Hand: a realistic hand reaching out of the display towards you,
// ray-marched per pixel. The screen is a dark glassy surface (the plane
// z = 0); a glowing portal ripples where the forearm comes through it, and
// the hand pushes out, opens and closes its fingers and turns a little,
// then sinks back in.
// The hand is a signed-distance shape: a rounded palm, three tapering
// segments per finger and two for the thumb, blended smoothly into the
// wrist and forearm. Shading: a warm key light from the upper left, a cool
// glow from the portal below, skin that goes redder in shadow (light
// scattering under the skin) and glows at thin edges (finger sides),
// soft creases at the knuckles, pale nails, a soft gloss, ambient
// occlusion between the fingers, and the hand's soft shadow on the screen.
// The hand's area is ray-marched a quarter of its rows per frame (it's the
// heavy part);
// the rest of the screen is drawn analytically every frame.
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1 - h); }

// Capsule from a to b with radii ra..rb (a tapered cone with round ends).
function capsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

// ---- The hand's pose for a moment: joint positions (built each frame) ----
// Hand space: x right, y up, z towards the viewer; the palm faces the viewer.
// Fingers: [base x, base y, length, splay angle, radius]; thumb separate.
const FINGERS = [[-0.205, 0.34, 0.6, 0.2, 0.088], [-0.07, 0.4, 0.68, 0.06, 0.092], [0.07, 0.38, 0.64, -0.06, 0.088], [0.2, 0.31, 0.5, -0.22, 0.078]];
const SEG = [0.45, 0.31, 0.24]; // phalanx share of the finger's length
const pose = { segs: [], palm: null, arm: null, bound: null, push: 0, portal: [0, -0.55] };

function buildPose(t) {
  // Reach out and back every ~9 s; the fingers curl and spread, and wave.
  const cyc = (t % 9) / 9;
  const push = sm(0, 0.35, cyc) * (1 - sm(0.75, 1, cyc)); // 0 inside the screen .. 1 fully out
  const curl = 0.35 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.37), spread = 0.6 + 0.4 * Math.sin(t * 0.9 + 1);
  const rotY = 0.35 * Math.sin(t * 0.5), rotZ = 0.12 * Math.sin(t * 0.7 + 2);
  const cz = 0.15 + 1.05 * push; // how far the palm is out of the screen
  const cy = Math.cos(rotY), sy = Math.sin(rotY), cr = Math.cos(rotZ), sr = Math.sin(rotZ);
  // Hand space -> world: rotate (roll, then turn), then lift out of the screen.
  const W = (x, y, z) => {
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    return [x1 * cy + z * sy, y1 - 0.3, -x1 * sy + z * cy + cz];
  };
  const segs = [];
  FINGERS.forEach(([bx, by, len, ang, r], fi) => {
    const a = ang * (0.4 + spread);
    let x = bx, y = by, z = 0, dirA = a, bend = 0;
    for (let k = 0; k < 3; k++) {
      bend += curl * (k === 0 ? 0.55 : 0.9) * (1 + 0.15 * fi); // curls towards the viewer, then down
      const l = len * SEG[k];
      const nx = x + Math.sin(dirA) * Math.cos(bend) * l, ny = y + Math.cos(dirA) * Math.cos(bend) * l, nz = z + Math.sin(bend) * l;
      const ra = r * (1 - 0.13 * k), rb = r * (1 - 0.13 * (k + 1)) * (k === 2 ? 0.92 : 1);
      segs.push({ a: W(x, y, z), b: W(nx, ny, nz), ra, rb, tip: k === 2, joint: k });
      x = nx; y = ny; z = nz;
    }
  });
  // Thumb: from the lower side of the palm, out and up.
  {
    const tb = curl * 0.7;
    let x = -0.18, y = -0.1, z = 0.03;
    const dirs = [[-0.55, 0.45, 0.35], [-0.25, 0.75, 0.3 + tb * 0.5], [0.05, 0.8, 0.35 + tb]];
    const lens = [0.32, 0.26, 0.22];
    for (let k = 0; k < 3; k++) {
      const d = dirs[k], n = Math.hypot(d[0], d[1], d[2]), l = lens[k];
      const nx = x + d[0] / n * l, ny = y + d[1] / n * l, nz = z + d[2] / n * l;
      segs.push({ a: W(x, y, z), b: W(nx, ny, nz), ra: [0.13, 0.1, 0.09][k], rb: [0.105, 0.092, 0.082][k], tip: k === 2, joint: k });
      x = nx; y = ny; z = nz;
    }
  }
  pose.segs = segs;
  pose.palm = { c: W(0, 0.12, 0), cy, sy, cr, sr, cz }; // palm centre + the rotation
  pose.arm = { a: W(0, -0.3, -0.05), b: [0, -0.55, -1.2] }; // forearm back into the screen
  pose.push = push;
  // Where the forearm passes through the screen: the portal is centred there.
  const A = pose.arm.a, B = pose.arm.b, f = A[2] / (A[2] - B[2]);
  pose.portal = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
  pose.W = W;
}

// Palm: a rounded slab in hand space (so it turns with the hand).
function palmDist(px, py, pz) {
  const P = pose.palm;
  let x = px - P.c[0], y = py - P.c[1], z = pz - P.c[2];
  // world -> hand: undo the turn, then the roll
  const x1 = x * P.cy - z * P.sy, z1 = x * P.sy + z * P.cy;
  const x2 = x1 * P.cr + y * P.sr, y2 = -x1 * P.sr + y * P.cr;
  const qx = Math.abs(x2) - 0.2 + 0.04 * y2, qy = Math.abs(y2 + 0.02) - 0.26, qz = Math.abs(z1 + 0.01 * x2 * x2) - 0.035;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  let d = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - 0.07;
  d += 0.025 * Math.exp(-(x2 * x2 + (y2 - 0.05) * (y2 - 0.05)) / 0.02) * (z1 > 0 ? 1 : 0); // the hollow of the palm
  d -= 0.035 * Math.exp(-((x2 + 0.12) ** 2 + (y2 + 0.12) ** 2) / 0.012) * (z1 > 0 ? 1 : 0); // the pad at the base of the thumb
  return d;
}

// The whole hand. Returns the distance; `hit` gets which part is nearest
// (for nails and knuckle creases).
const hit = { seg: -1, h: 0 };
function sdf(px, py, pz, want) {
  let d = palmDist(px, py, pz);
  const A = pose.arm;
  d = smin(d, capsule(px, py, pz, A.a[0], A.a[1], A.a[2], A.b[0], A.b[1], A.b[2], 0.16, 0.2), 0.12);
  let best = 1e9, bi = -1;
  for (let i = 0; i < pose.segs.length; i++) {
    const s = pose.segs[i];
    const c = capsule(px, py, pz, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.ra, s.rb);
    if (c < best) { best = c; bi = i; }
    d = smin(d, c, s.joint === 0 ? 0.1 : 0.03);
  }
  if (want) {
    hit.seg = best < d + 0.03 ? bi : -1;
    if (bi >= 0) {
      const s = pose.segs[bi], bax = s.b[0] - s.a[0], bay = s.b[1] - s.a[1], baz = s.b[2] - s.a[2];
      hit.h = clamp(((px - s.a[0]) * bax + (py - s.a[1]) * bay + (pz - s.a[2]) * baz) / (bax * bax + bay * bay + baz * baz));
    }
  }
  return d;
}

// ---- Camera ----
const CAM_Z = 3.4, FOV = 2.85; // the viewer, in front of the screen
const SKIN = [0.93, 0.68, 0.55];
const KEY = norm3(-0.75, 0.55, 0.38), KEY_COL = [1.0, 0.92, 0.82];
function norm3(x, y, z) { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; }

// The screen behind (z = 0): dark glass, a faint pixel grid, the portal's
// glow and ripples, and the hand's soft shadow (approximate, from above-left).
function screenColour(x, y, t, shadow) {
  const r = Math.hypot(x - pose.portal[0], (y - pose.portal[1]) * 1.6);
  const ring = Math.exp(-((r - 0.5 - 0.06 * pose.push) ** 2) / 0.006) * (0.55 + 0.45 * pose.push);
  const ripple = 0.5 + 0.5 * Math.sin(r * 18 - t * 4);
  const fall = Math.exp(-r * 1.6);
  const grid = (Math.abs(((x * 12) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((y * 12) % 1 + 1) % 1 - 0.5) > 0.46) ? 0.012 : 0;
  let cr = 0.02 + grid + fall * ripple * 0.05 + ring * 0.15, cg = 0.025 + grid + fall * ripple * 0.11 + ring * 0.55, cb = 0.04 + grid + fall * ripple * 0.18 + ring * 0.85;
  const sh = 1 - 0.65 * shadow;
  return [cr * sh, cg * sh, cb * sh];
}

// Ray-march one pixel. (sx, sy) in screen units. Returns [r, g, b].
function shadePixel(sx, sy, t) {
  const ox = 0, oy = 0, oz = CAM_Z;
  let dx = sx * FOV, dy = sy * FOV, dz = -CAM_Z;
  const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
  // Quick reject: the ray misses the hand's bounding sphere.
  const B = pose.bound, bx = B[0] - ox, by = B[1] - oy, bz = B[2] - oz, tb = bx * dx + by * dy + bz * dz;
  const miss = bx * bx + by * by + bz * bz - tb * tb > B[3] * B[3];
  const tPlane = -oz / dz; // where the ray meets the screen
  let tt = miss ? tPlane : Math.max(0, tb - B[3]), hitHand = false;
  if (!miss) {
    for (let i = 0; i < 40 && tt < tPlane; i++) {
      const px = ox + dx * tt, py = oy + dy * tt, pz = oz + dz * tt;
      if (pz < 0) break;
      const d = sdf(px, py, pz, false);
      if (d < 0.002) { hitHand = true; break; }
      tt += d * 0.9;
    }
  }
  if (!hitHand) {
    const px = ox + dx * tPlane, py = oy + dy * tPlane;
    // Soft shadow: march from the screen point towards the key light.
    let shadow = 0;
    if (!miss || Math.hypot(px - B[0], py - B[1]) < B[3] * 2) {
      let k = 1, s = 0.05;
      for (let i = 0; i < 12 && s < 2.2; i++) {
        const d = sdf(px + KEY[0] * s, py + KEY[1] * s, KEY[2] * s, false);
        k = Math.min(k, 8 * d / s); s += clamp(d, 0.04, 0.3);
        if (k < 0.01) break;
      }
      shadow = 1 - clamp(k);
    }
    return screenColour(px, py, t, shadow);
  }
  const px = ox + dx * tt, py = oy + dy * tt, pz = oz + dz * tt;
  sdf(px, py, pz, true);
  const seg = hit.seg >= 0 ? pose.segs[hit.seg] : null, along = hit.h;
  // Normal (tetrahedral gradient).
  const e = 0.003;
  const a1 = sdf(px + e, py - e, pz - e), a2 = sdf(px - e, py - e, pz + e), a3 = sdf(px - e, py + e, pz - e), a4 = sdf(px + e, py + e, pz + e);
  let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4;
  const nn = Math.hypot(nx, ny, nz) || 1; nx /= nn; ny /= nn; nz /= nn;
  // Ambient occlusion: how open the space is just off the surface.
  let ao = 0;
  for (let i = 1; i <= 3; i++) { const h = 0.03 * i; ao += (h - sdf(px + nx * h, py + ny * h, pz + nz * h)) / h / i; }
  ao = clamp(1 - ao * 0.6);
  // Lighting.
  const ndl = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
  const wrap = clamp((ndl + 0.35) / 1.35); // soft wrap (skin isn't hard plastic)
  const vx = -dx, vy = -dy, vz = -dz;
  const hx = KEY[0] + vx, hy = KEY[1] + vy, hz = KEY[2] + vz, hn = Math.hypot(hx, hy, hz);
  const spec = Math.pow(clamp((nx * hx + ny * hy + nz * hz) / hn), 28) * 0.18;
  const fres = Math.pow(1 - clamp(nx * vx + ny * vy + nz * vz), 3);
  const portal = clamp(-ny * 0.6 + 0.4) * Math.exp(-pz * 1.2); // cool glow from the portal below
  // Skin: redder where the light fades (scattering), a translucent glow at
  // thin edges, creases at the knuckles, nails at the fingertips.
  let r = SKIN[0], g = SKIN[1], b = SKIN[2];
  const shadowTint = 1 - wrap;
  g *= 1 - 0.28 * shadowTint; b *= 1 - 0.38 * shadowTint;
  if (seg) {
    const crease = seg.joint > 0 ? Math.exp(-((along - 0.04) ** 2) / 0.003) : 0;
    const k = 1 - 0.25 * crease; r *= k; g *= k * 0.95; b *= k * 0.93;
    if (seg.tip && along > 0.62 && nz < 0.2) { r = mix(r, 0.97, 0.5); g = mix(g, 0.8, 0.5); b = mix(b, 0.76, 0.5); } // nails (on the back)
    if (seg.tip && along > 0.7) { r *= 1.04; g *= 0.94; b *= 0.94; } // pinker fingertips
  }
  const lit = 0.12 + 0.95 * wrap * ao;
  let cr = r * (lit * KEY_COL[0]) + portal * 0.05 * ao, cg = g * (lit * KEY_COL[1]) + portal * 0.22 * ao, cb = b * (lit * KEY_COL[2]) + portal * 0.32 * ao;
  cr += fres * 0.22 * ao + spec; cg += fres * 0.1 * ao + spec * 0.95; cb += fres * 0.08 * ao + spec * 0.9; // edge glow, gloss
  // Where the forearm meets the screen it fades into the portal's light.
  const sink = sm(0.25, 0, pz);
  return [mix(cr, 0.15, sink), mix(cg, 0.6, sink), mix(cb, 0.9, sink)];
}

// Bounding sphere round everything (for the quick reject).
function updateBound() {
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  const add = (p, r) => { mnx = Math.min(mnx, p[0] - r); mny = Math.min(mny, p[1] - r); mnz = Math.min(mnz, p[2] - r); mxx = Math.max(mxx, p[0] + r); mxy = Math.max(mxy, p[1] + r); mxz = Math.max(mxz, p[2] + r); };
  for (const s of pose.segs) { add(s.a, s.ra); add(s.b, s.rb); }
  add(pose.palm.c, 0.4); add(pose.arm.a, 0.2); add(pose.arm.b, 0.2);
  const c = [(mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2];
  pose.bound = [c[0], c[1], c[2], Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) / 2];
}

const st = { t: 0, frame: 0, img: null, size: 0 };
// Renders the S x S view into st.img, a quarter of the rows each frame
// (interleaved: every 4th row), so the heavy ray-marching is spread out.
const PASSES = 4;
function render(S) {
  if (!st.img || st.size !== S) { st.img = new Float32Array(S * S * 3); st.size = S; st.frame = 0; for (let k = 0; k < PASSES; k++) renderRows(S, k); return; }
  renderRows(S, st.frame++ % PASSES);
}
function renderRows(S, pass) {
  buildPose(st.t); updateBound();
  for (let y = pass; y < S; y += PASSES) for (let x = 0; x < S; x++) {
    const c = shadePixel((x + 0.5) / S - 0.5, 0.5 - (y + 0.5) / S, st.t), o = (y * S + x) * 3;
    st.img[o] = c[0]; st.img[o + 1] = c[1]; st.img[o + 2] = c[2];
  }
}

function hand3dWall(core, dt) {
  if (!core.wallW) return;
  st.t += dt;
  const W = core.wallW, H = core.wallH, S = H, x0 = Math.floor((W - S) / 2);
  render(S);
  // Outside the hand's square: the screen and the portal's ripples spreading out.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= x0 && x < x0 + S) { const o = (y * S + (x - x0)) * 3; core.setWallPixel(x, y, st.img[o], st.img[o + 1], st.img[o + 2]); continue; }
    const c = screenColour((((x - x0) + 0.5) / S - 0.5) * FOV, (0.5 - (y + 0.5) / S) * FOV, st.t, 0); // the same screen-plane units as the ray-marched square
    core.setWallPixel(x, y, c[0], c[1], c[2]);
  }
}

function hand3d(core, dt) {
  st.t += dt;
  const S = core.SIZE;
  render(S);
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  // The front face shows the hand; the sides show the screen's glow.
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const o = ((S - 1 - v) * S + u) * 3;
    core.setFaceLED(0, u, v, st.img[o], st.img[o + 1], st.img[o + 2]);
  }
}

hand3d.wall = hand3dWall;
hand3d._test = { st, buildPose, updateBound, shadePixel, pose, sdf };
module.exports = hand3d;
