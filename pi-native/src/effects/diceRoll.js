// Dice Roll: 1-3 real 3D dice seen from above a felt table. A roll throws
// them in from the side: they tumble end over end (every face you see is
// the actual cube turning), bounce with a moving shadow, slow down and come
// to rest showing the rolled number. With more than one die the total
// shows below.
// Options (effectOptions.dice): rollToken (bumped by Roll Dice), autoRoll,
// count (1-3), colour ('ivory' | 'red' | 'black' | 'blue').
'use strict';
const { defineCanvasEffect } = require('./canvas');
const stroke = require('./strokeFont');
const { FONT_3x5, drawGlyph, textWidth } = require('./text');

const ROLL_S = 2.4, AUTO_S = 4;
const COLOURS = { ivory: [[0.95, 0.93, 0.86], [0.08, 0.08, 0.1]], red: [[0.85, 0.12, 0.15], [1, 1, 1]], black: [[0.12, 0.12, 0.14], [1, 1, 1]], blue: [[0.15, 0.35, 0.9], [1, 1, 1]] };
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const st = { dice: [], t0: -10, lastToken: undefined, lastAuto: 0 };
const roll = () => 1 + Math.floor(Math.random() * 6);

// 3x3 rotation matrices (row-major arrays of 9).
const mul = (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; };
const rotX = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function rotAxis([x, y, z], t) { // Rodrigues
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
// Local face numbers: +z 1, -z 6, +x 2, -x 5, +y 3, -y 4 (opposites add to 7).
// The rotation that turns face v towards the viewer (+z).
const FACE_UP = { 1: [1, 0, 0, 0, 1, 0, 0, 0, 1], 6: rotX(Math.PI), 2: rotY(-Math.PI / 2), 5: rotY(Math.PI / 2), 3: rotX(Math.PI / 2), 4: rotX(-Math.PI / 2) };
function faceOf(axis, sign) { return axis === 2 ? (sign > 0 ? 1 : 6) : axis === 0 ? (sign > 0 ? 2 : 5) : (sign > 0 ? 3 : 4); }
const LIGHT = (() => { const l = [-0.45, -0.55, 0.7], n = Math.hypot(...l); return l.map((v) => v / n); })();

function startRoll(n, t) {
  st.t0 = t;
  st.dice = Array.from({ length: n }, (_, i) => {
    const ax = [Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.4], al = Math.hypot(...ax) || 1;
    const value = roll();
    return { value, axis: ax.map((v) => v / al), turns: (2.5 + Math.random() * 2) * Math.PI * 2, rest: mul(rotZ((Math.random() - 0.5) * 0.9), FACE_UP[value]), delay: i * 0.12, from: Math.random() < 0.5 ? -1 : 1, drift: (Math.random() - 0.5) * 0.5 };
  });
}

// Orthographic ray cast of a cube (half-size 1 in local space) rotated by M,
// centred at (cx, cy) with half-width h pixels, 2x2 supersampled.
function drawDie3D(c, cx, cy, h, M, col, pipCol) {
  const reach = Math.ceil(h * 1.75) + 1;
  for (let y = Math.floor(cy - reach); y <= cy + reach; y++) for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
    let ar = 0, ag = 0, ab = 0, cov = 0;
    // Inside the cube's inscribed circle every sample hits: one is enough.
    // Only edge pixels get the 2x2 supersampling.
    const interior = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < h - 1.5;
    const ns = interior ? 1 : 2;
    for (let sy = 0; sy < ns; sy++) for (let sx = 0; sx < ns; sx++) {
      // World ray: origin above the table at this sample, looking down -z.
      const off = interior ? 0.5 : 0.25;
      const wx = (x + off + sx * 0.5 - cx) / h, wy = (y + off + sy * 0.5 - cy) / h;
      // Into local space (M is a rotation, so its transpose inverts it).
      const ox = M[0] * wx + M[3] * wy + M[6] * 3, oy = M[1] * wx + M[4] * wy + M[7] * 3, oz = M[2] * wx + M[5] * wy + M[8] * 3;
      const dx = -M[6], dy = -M[7], dz = -M[8];
      let tn = -Infinity, tf = Infinity, axis = -1, sign = 0;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let miss = false;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (Math.abs(o[k]) > 1) { miss = true; break; } continue; }
        let t1 = (-1 - o[k]) / d[k], t2 = (1 - o[k]) / d[k];
        let s1 = -1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s1 = 1; }
        if (t1 > tn) { tn = t1; axis = k; sign = s1; }
        if (t2 < tf) tf = t2;
      }
      if (miss || tn > tf || axis < 0) continue;
      const hp = [o[0] + d[0] * tn, o[1] + d[1] * tn, o[2] + d[2] * tn];
      const u = hp[(axis + 1) % 3], v = hp[(axis + 2) % 3];
      // World-space normal for lighting.
      const nl = [0, 0, 0]; nl[axis] = sign;
      const nw = [M[0] * nl[0] + M[1] * nl[1] + M[2] * nl[2], M[3] * nl[0] + M[4] * nl[1] + M[5] * nl[2], M[6] * nl[0] + M[7] * nl[1] + M[8] * nl[2]];
      const lam = Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
      const spec = Math.pow(Math.max(0, nw[2] * 0.6 + lam * 0.4), 18) * 0.35;
      const edge = Math.min(1 - Math.abs(u), 1 - Math.abs(v));
      const bevel = edge < 0.1 ? 0.75 + edge * 2.5 : 1;
      let r = col[0], g = col[1], b = col[2];
      for (const [px, py] of PIPS[faceOf(axis, sign)]) {
        const pd = Math.hypot(u - px * 0.5, v - py * 0.5);
        if (pd < 0.19) { const k = Math.min(1, (0.19 - pd) / 0.05); r += (pipCol[0] - r) * k; g += (pipCol[1] - g) * k; b += (pipCol[2] - b) * k; }
      }
      const sh = (0.3 + 0.8 * lam) * bevel;
      ar += Math.min(1, r * sh + spec); ag += Math.min(1, g * sh + spec); ab += Math.min(1, b * sh + spec); cov++;
    }
    if (!cov) continue;
    const o2 = c.get(x, y); if (!o2) continue;
    const k = cov / (ns * ns);
    c.set(x, y, o2[0] * (1 - k) + (ar / cov) * k, o2[1] * (1 - k) + (ag / cov) * k, o2[2] * (1 - k) + (ab / cov) * k);
  }
}

function drawShadow(c, cx, cy, rad, strength) {
  const R = Math.ceil(rad * 1.6);
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    const d = Math.hypot(x - cx, y - cy) / rad, k = Math.max(0, 1 - d * d) * strength, o = c.get(x, y);
    if (o && k > 0) c.set(x, y, o[0] * (1 - k), o[1] * (1 - k), o[2] * (1 - k));
  }
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const o = (core.effectOptions && core.effectOptions.dice) || {};
    const n = Math.max(1, Math.min(3, Number(o.count) || 2));
    if (!st.dice.length || st.dice.length !== n) startRoll(n, t);
    if (o.rollToken !== undefined && o.rollToken !== st.lastToken) { if (st.lastToken !== undefined) startRoll(n, t); st.lastToken = o.rollToken; }
    if (o.autoRoll && t - st.t0 > AUTO_S + ROLL_S) startRoll(n, t);
    const [col, pipCol] = COLOURS[o.colour] || COLOURS.ivory;
    // Felt table: green with a soft vignette.
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      const v = 1 - Math.hypot((x - c.W / 2) / c.W, (y - c.H / 2) / c.H) * 1.1;
      const n2 = ((x * 7 + y * 13) % 5) * 0.004;
      c.set(x, y, 0.02 + n2, (0.16 + n2) * v + 0.02, (0.07 + n2) * v);
    }
    const totalH = n > 1 ? Math.max(5, Math.round(c.H * 0.16)) : 0;
    const size = Math.min((c.W - 6) / (n * 1.55), (c.H - totalH - 6) * 0.55);
    const elapsed = t - st.t0;
    let settled = true;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const placed = st.dice.map((d, i) => {
      const e = Math.max(0, elapsed - d.delay), p = Math.min(1, e / ROLL_S);
      if (p < 1) settled = false;
      // Thrown in from the side, sliding to its spot; decaying bounces.
      const restX = c.W * (i + 0.5) / n, restY = (c.H - totalH) / 2;
      const cx = restX + d.from * (1 - ease(p)) * c.W * 0.55;
      const cy = restY + d.drift * (1 - ease(p)) * c.H * 0.5;
      const hop = Math.abs(Math.sin(Math.sqrt(p) * Math.PI * 3)) * Math.pow(1 - p, 1.4);
      // Tumble: spin about a random axis, slowing to a stop on the result.
      const M = mul(d.rest, rotAxis(d.axis, d.turns * Math.pow(1 - p, 2.2)));
      return { cx, cy, hop, M, h: (size / 2) * (1 + hop * 0.3) };
    });
    for (const q of placed) drawShadow(c, q.cx + q.hop * size * 0.35, q.cy + q.hop * size * 0.45, size * 0.62, 0.55 * (1 - q.hop * 0.5));
    for (const q of placed) drawDie3D(c, q.cx, q.cy - q.hop * size * 0.15, q.h * 0.82, q.M, col, pipCol);
    if (n > 1 && settled) {
      const s = 'TOTAL ' + st.dice.reduce((a, d) => a + d.value, 0), y = c.H - totalH;
      if (totalH >= 9) stroke.drawText(c, s, Math.round((c.W - stroke.textWidth(s, totalH - 2)) / 2), y, totalH - 2, [0.95, 0.85, 0.4]);
      else { let x = Math.round((c.W - textWidth(FONT_3x5, s)) / 2); for (const ch of s) x += drawGlyph(FONT_3x5, ch, x, y, (px, py) => c.set(px, py, 0.95, 0.85, 0.4)); }
    }
  },
});
module.exports.getStatus = () => (st.dice.length ? { values: st.dice.map((d) => d.value) } : null);
