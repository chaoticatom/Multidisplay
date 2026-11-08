// Warp: flying down an endless 3D tunnel. Every pixel looks along its own
// ray into a cylinder; the tunnel wall is textured with glowing rings and
// spiral ribs that rush past, the colours cycle, the path weaves gently so
// the vanishing point drifts, and the far end fades into a bright core.
// The flight surges with the beat. On the cube the far end of the tunnel is
// the middle of the top, and the walls rush out over its edges and down all
// four sides; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { ringUV } = require('./sceneKit');
const { hsl } = require('../core');

const st = { z: 0 };
const TAU = Math.PI * 2;
// Hue lookup table: hsl() per pixel was a large share of the frame.
const LUT = Array.from({ length: 256 }, (_, i) => hsl(i / 256, 0.9, 0.5));

// One pixel of the tunnel: r = distance from the vanishing point (in panel
// widths), ang = direction round it (-1..1).
function tunnel(r, ang, t, out) {
  const depth = 0.32 / r; // distance along the tunnel this pixel sees
  const u = (depth + st.z) * 3, v = ang * 6 + t * 0.3 + depth * 0.5; // rings along it, spiral ribs round it
  const cu = Math.cos(u * TAU), cv = Math.cos(v * TAU);
  const cu2 = cu > 0 ? cu * cu : 0, cv2 = cv > 0 ? cv * cv : 0;
  const ring = cu2 * cu2 * cu2, rib = cv2 * cv2 * cv2 * cv2 * cv2 * 0.45;
  const fog = Math.min(1, r * 3.2), hue = (u * 0.02 + t * 0.03) % 1;
  const col = LUT[Math.floor(((hue % 1) + 1) % 1 * 256) & 255];
  const k = (0.08 + 0.05 * cv * Math.cos(u * Math.PI) + ring * 0.9 + rib) * fog, core0 = Math.exp(-r * r * 140) * 0.9;
  out[0] = Math.min(1, col[0] * k + core0); out[1] = Math.min(1, col[1] * k + core0 * 0.95); out[2] = Math.min(1, col[2] * k + core0);
  return out;
}

const flat = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const W = c.W, H = c.H, S = Math.min(W, H);
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    st.z += dt * (2.2 + beat * 3);
    // The vanishing point weaves as the tunnel bends.
    const cx = W / 2 + Math.sin(t * 0.5) * S * 0.12, cy = H / 2 + Math.cos(t * 0.37) * S * 0.1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / S, dy = (y + 0.5 - cy) / S, r = Math.sqrt(dx * dx + dy * dy) + 1e-4;
      const col = tunnel(r, Math.atan2(dy, dx) / Math.PI, t, OUT);
      c.set(x, y, col[0], col[1], col[2]);
    }
  },
});

// The cube: distance from the middle of the top, running on round its edge
// and down the sides (as Light Speed does); direction = the way round.
const P = { x: 0, y: 0, z: 0 }, OUT = [0, 0, 0];
function warp(core, dt) {
  core.t += dt;
  const t = core.t, beat = core.audio && core.audio.beat ? core.audio.beat : 0;
  st.z += dt * (2.2 + beat * 3);
  const N = core.N, X = core.surfX, Y = core.surfY, Z = core.surfZ;
  for (let i = 0; i < N; i++) {
    P.x = X[i]; P.y = Y[i]; P.z = Z[i];
    const [x, y, , side, bottom] = ringUV(P);
    let r, ang;
    if (side) { r = 0.5 + y * 1.0; ang = x / 2 - 1; }
    else {
      const d = Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5));
      ang = ringUV({ x: P.x, y: 0.5, z: P.z })[0] / 2 - 1;
      r = bottom ? 1.5 + (0.5 - d) * 1.0 : d; // the bottom carries on past the sides
    }
    const c = tunnel(r * 0.55, ang, t, OUT);
    core.setLED(i, c[0], c[1], c[2]);
  }
}
warp.wall = flat.wall;
module.exports = warp;
