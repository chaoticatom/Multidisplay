// Warp: flying down an endless 3D tunnel. Every pixel looks along its own
// ray into a cylinder; the tunnel wall is textured with glowing rings and
// spiral ribs that rush past, the colours cycle, the path weaves gently so
// the vanishing point drifts, and the far end fades into a bright core.
// The flight surges with the beat. Same on every cube side face; fills a
// flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');

const st = { z: 0 };
const TAU = Math.PI * 2;
// Hue lookup table: hsl() per pixel was a large share of the frame.
const LUT = Array.from({ length: 256 }, (_, i) => hsl(i / 256, 0.9, 0.5));

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const W = c.W, H = c.H, S = Math.min(W, H);
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    st.z += dt * (2.2 + beat * 3);
    // The vanishing point weaves as the tunnel bends.
    const cx = W / 2 + Math.sin(t * 0.5) * S * 0.12, cy = H / 2 + Math.cos(t * 0.37) * S * 0.1;
    const twist = t * 0.3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / S, dy = (y + 0.5 - cy) / S;
      const r = Math.sqrt(dx * dx + dy * dy) + 1e-4;
      const depth = 0.32 / r; // distance along the tunnel this pixel sees
      const ang = Math.atan2(dy, dx) / Math.PI; // -1..1
      const u = (depth + st.z) * 3, v = ang * 6 + twist + depth * 0.5; // rings along it, spiral ribs round it
      // Each cosine once, and powers as multiplications (this runs per pixel).
      const cu = Math.cos(u * TAU), cv = Math.cos(v * TAU);
      const cu2 = cu > 0 ? cu * cu : 0, cv2 = cv > 0 ? cv * cv : 0;
      const ring = cu2 * cu2 * cu2;
      const rib = cv2 * cv2 * cv2 * cv2 * cv2 * 0.45;
      const fog = Math.min(1, r * 3.2); // far = dim
      const hue = (u * 0.02 + t * 0.03) % 1;
      const col = LUT[Math.floor(((hue % 1) + 1) % 1 * 256) & 255], cr = col[0], cg = col[1], cb = col[2];
      const panel = 0.08 + 0.05 * cv * Math.cos(u * Math.PI); // faint panelling between ribs
      let k = (panel + ring * 0.9 + rib) * fog;
      // The bright light at the end of the tunnel.
      const core0 = Math.exp(-r * r * 140) * 0.9;
      c.set(x, y, Math.min(1, cr * k + core0), Math.min(1, cg * k + core0 * 0.95), Math.min(1, cb * k + core0));
    }
  },
});
