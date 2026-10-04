// DNA: a 3D double helix turning in space. Two backbones of glossy beads
// spiral round each other, joined by colour-coded base-pair rungs (A-T in
// one pair of colours, G-C in another). Everything is projected with depth,
// so the far strand is smaller, dimmer and passes behind the near one; the
// helix drifts gently and pulses with the beat, with faint particles
// floating past. Same on every cube side face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');

const PAIRS = [[[0.2, 0.6, 1], [1, 0.75, 0.15]], [[1, 0.25, 0.35], [0.3, 0.95, 0.45]]]; // A-T, G-C
const STRAND = [[0.85, 0.35, 1], [0.25, 0.85, 1]];
const LIGHT = (() => { const l = [-0.5, -0.6, 0.62], n = Math.hypot(...l); return l.map((v) => v / n); })();
const hash = (i) => { const s = Math.sin(i * 91.7) * 43758.5453; return s - Math.floor(s); };

function bead(c, x, y, R, col, fog) {
  for (let j = Math.floor(y - R - 1); j <= y + R + 1; j++) for (let i = Math.floor(x - R - 1); i <= x + R + 1; i++) {
    const u = (i + 0.5 - x) / R, v = (j + 0.5 - y) / R, d2 = u * u + v * v;
    if (d2 > 1) continue;
    const z = Math.sqrt(1 - d2), lam = Math.max(0, u * LIGHT[0] + v * LIGHT[1] + z * LIGHT[2]);
    const spec = Math.pow(Math.max(0, 2 * lam * z - LIGHT[2]), 20) * 0.8;
    const sh = (0.25 + 0.85 * lam) * fog, edge = Math.min(1, (1 - d2) * R * 0.8);
    const o = c.get(i, j); if (!o) continue;
    c.set(i, j, o[0] * (1 - edge) + Math.min(1, col[0] * sh + spec * fog) * edge, o[1] * (1 - edge) + Math.min(1, col[1] * sh + spec * fog) * edge, o[2] * (1 - edge) + Math.min(1, col[2] * sh + spec * fog) * edge);
  }
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const W = c.W, H = c.H, S = Math.min(W, H);
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    // Background: deep blue with drifting particles.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.max(0, 1 - Math.abs(x - W / 2) / (W * 0.6));
      c.set(x, y, 0.005 + v * 0.015, 0.01 + v * 0.025, 0.03 + v * 0.05);
    }
    for (let k = 0; k < 30; k++) {
      const px = hash(k) * W, py = ((hash(k + 50) * H - t * (2 + hash(k + 9) * 4)) % H + H) % H, b = 0.08 + hash(k + 3) * 0.12;
      c.add(px, py, b * 0.5, b * 0.7, b);
    }
    // The helix runs top to bottom; each step is a pair of points opposite each other.
    const radius = S * 0.26 * (1 + beat * 0.1), turn = t * 0.9, steps = Math.round(H / 2.6);
    const items = [];
    for (let s = -1; s <= steps + 1; s++) {
      const y = (s / steps) * H + Math.sin(t * 0.6) * 1.5;
      const a = s * 0.42 + turn, tilt = Math.sin(t * 0.3) * 0.25;
      for (let strand = 0; strand < 2; strand++) {
        const ang = a + strand * Math.PI;
        const z = Math.sin(ang); // -1 far .. 1 near
        const x = W / 2 + Math.cos(ang) * radius + (y - H / 2) * tilt;
        items.push({ kind: 'bead', x, y, z, strand, s });
      }
      if (s % 2 === 0) items.push({ kind: 'rung', s, y, a, tilt });
    }
    // Draw back to front.
    const keyZ = (it) => (it.kind === 'bead' ? it.z : 0);
    items.sort((p, q) => keyZ(p) - keyZ(q));
    for (const it of items) {
      if (it.kind === 'rung') {
        const pair = PAIRS[Math.floor(hash(it.s) * 2)], flip = hash(it.s + 7) < 0.5;
        const x1 = W / 2 + Math.cos(it.a) * radius + (it.y - H / 2) * it.tilt, x2 = W / 2 + Math.cos(it.a + Math.PI) * radius + (it.y - H / 2) * it.tilt;
        const n = Math.ceil(Math.abs(x2 - x1)) + 1;
        for (let k = 0; k <= n; k++) {
          const f = k / n, x = x1 + (x2 - x1) * f, z = Math.sin(it.a) * (1 - 2 * f);
          const col = (f < 0.5) !== flip ? pair[0] : pair[1], fog = 0.35 + 0.4 * (z + 1) / 2;
          c.set(x, it.y, col[0] * fog, col[1] * fog, col[2] * fog);
          c.set(x, it.y + 1, col[0] * fog * 0.5, col[1] * fog * 0.5, col[2] * fog * 0.5);
        }
      } else {
        const fog = 0.4 + 0.6 * (it.z + 1) / 2, R = S * (0.035 + 0.025 * (it.z + 1) / 2);
        bead(c, it.x, it.y, R, STRAND[it.strand], fog);
      }
    }
  },
});
