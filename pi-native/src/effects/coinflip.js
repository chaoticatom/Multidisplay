// Coin Flip: a real 3D coin. It's tossed up spinning end over end (you see
// the faces, the reeded edge and the light glinting as it turns), grows as
// it comes towards you, lands, wobbles flat and shows the result - gold
// heads or silver tails, each with an embossed letter - then a running
// tally. Ray-cast per pixel, 2x2 supersampled, viewed from slightly in
// front so a flat coin reads as a tilted disc. Same on every cube side face;
// fills a flat panel. Option: effectOptions.coinflip.speed.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const stroke = require('./strokeFont');
const { FONT_3x5, FONT_5x7, drawString, textWidth } = require('./text');

const TOSS_S = 1.5, WOBBLE_S = 0.9, SHOW_S = 2.4, HALF_T = 0.085, VIEW_TILT = 0.62;
const st = { phase: 'toss', t0: null, result: 'H', heads: 0, tails: 0, turns: 0 };
const LIGHT = (() => { const l = [-0.5, -0.6, 0.65], n = Math.hypot(...l); return l.map((v) => v / n); })();
const METAL = { H: { base: [1.0, 0.76, 0.28], dark: [0.55, 0.36, 0.08] }, T: { base: [0.82, 0.85, 0.9], dark: [0.42, 0.45, 0.52] } };

// The letter as a 7x7 mask (from the 5x7 font, padded) for embossing.
const MASK = {};
for (const ch of ['H', 'T']) {
  const g = FONT_5x7.get(ch), m = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) m.push(x >= 1 && x <= 5 && (g[y] >> (5 - x)) & 1 ? 1 : 0); // rows are 5-bit masks, MSB = left
  MASK[ch] = m;
}
const maskAt = (ch, u, v) => { // u,v in -1..1 across the coin face
  const gx = Math.floor((u / 0.95 + 0.5) * 7), gy = Math.floor((v / 0.95 + 0.5) * 7);
  return gx < 0 || gy < 0 || gx > 6 || gy > 6 ? 0 : MASK[ch][gy * 7 + gx];
};

function newToss(t) {
  st.phase = 'toss'; st.t0 = t;
  st.result = Math.random() < 0.5 ? 'H' : 'T';
  st.turns = 4 + Math.floor(Math.random() * 3); // whole flips, so it lands on the right side
}

// Coin orientation: rotation about x by `a` (flip), about y by `w` (wobble),
// then the fixed view tilt. Returns a row-major 3x3.
function orient(a, w) {
  const ca = Math.cos(a), sa = Math.sin(a), cw = Math.cos(w), sw = Math.sin(w), cv = Math.cos(VIEW_TILT), sv = Math.sin(VIEW_TILT);
  const A = [1, 0, 0, 0, ca, -sa, 0, sa, ca], W = [cw, 0, sw, 0, 1, 0, -sw, 0, cw], V = [1, 0, 0, 0, cv, -sv, 0, sv, cv];
  const mul = (p, q) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(p[i * 3] * q[j] + p[i * 3 + 1] * q[3 + j] + p[i * 3 + 2] * q[6 + j]); return r; };
  return mul(V, mul(W, A));
}

function drawCoin(c, cx, cy, R, M, up) {
  // `up` is which letter is on the coin's +z face; the -z face shows the other.
  const down = up === 'H' ? 'T' : 'H';
  const reach = Math.ceil(R * 1.15) + 1;
  for (let y = Math.floor(cy - reach); y <= cy + reach; y++) for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
    let ar = 0, ag = 0, ab = 0, cov = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const wx = (x + 0.25 + sx * 0.5 - cx) / R, wy = (y + 0.25 + sy * 0.5 - cy) / R;
      const o = [M[0] * wx + M[3] * wy + M[6] * 3, M[1] * wx + M[4] * wy + M[7] * 3, M[2] * wx + M[5] * wy + M[8] * 3];
      const d = [-M[6], -M[7], -M[8]];
      // Caps (slab in z) and the round side (quadratic in x,y).
      let tz1 = -Infinity, tz2 = Infinity, capSign = 0;
      if (Math.abs(d[2]) > 1e-9) { let a = (-HALF_T - o[2]) / d[2], b = (HALF_T - o[2]) / d[2]; capSign = a < b ? -1 : 1; tz1 = Math.min(a, b); tz2 = Math.max(a, b); }
      else if (Math.abs(o[2]) > HALF_T) continue;
      const A = d[0] * d[0] + d[1] * d[1], B = 2 * (o[0] * d[0] + o[1] * d[1]), C = o[0] * o[0] + o[1] * o[1] - 1;
      let ts1 = -Infinity, ts2 = Infinity;
      if (A > 1e-9) { const disc = B * B - 4 * A * C; if (disc < 0) continue; const q = Math.sqrt(disc); ts1 = (-B - q) / (2 * A); ts2 = (-B + q) / (2 * A); }
      else if (C > 0) continue;
      const tn = Math.max(tz1, ts1), tf = Math.min(tz2, ts2);
      if (tn > tf) continue;
      const hp = [o[0] + d[0] * tn, o[1] + d[1] * tn, o[2] + d[2] * tn];
      let nl, r, g, b;
      if (tz1 >= ts1) {
        // A face: metal, raised rim, embossed letter.
        // capSign < 0: the ray met the z = -HALF_T cap first (the back face).
        const back = capSign < 0, face = back ? down : up, met = METAL[face];
        const u = hp[0], v = back ? -hp[1] : hp[1]; // keep the letter upright on both sides
        const rr = Math.hypot(u, v);
        nl = [0, 0, back ? -1 : 1];
        let tint = 1;
        if (rr > 0.84) { const k = (rr - 0.84) / 0.16; tint = 1.15 - k * 0.35; } // raised rim, bevelled outward
        else if (rr > 0.78) tint = 0.7; // groove inside the rim
        else {
          const m = maskAt(face, u * 1.05, v * 1.05), sh = maskAt(face, u * 1.05 - 0.12, v * 1.05 - 0.12);
          tint = m ? 1.22 : sh ? 0.68 : 0.92 + 0.08 * Math.sin(rr * 30); // letter, its shadow, fine engraving rings
        }
        r = met.base[0] * tint; g = met.base[1] * tint; b = met.base[2] * tint;
      } else {
        // The edge: reeded (fine ridges), darker metal.
        const ang = Math.atan2(hp[1], hp[0]);
        const ridge = 0.75 + 0.25 * Math.sin(ang * 60);
        const met = METAL[up];
        nl = [hp[0], hp[1], 0];
        r = met.dark[0] * ridge * 1.3; g = met.dark[1] * ridge * 1.3; b = met.dark[2] * ridge * 1.3;
      }
      const nw = [M[0] * nl[0] + M[1] * nl[1] + M[2] * nl[2], M[3] * nl[0] + M[4] * nl[1] + M[5] * nl[2], M[6] * nl[0] + M[7] * nl[1] + M[8] * nl[2]];
      const lam = Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
      // Metal: strong highlight where the reflected light points at us.
      const refZ = 2 * lam * nw[2] - LIGHT[2];
      const spec = Math.pow(Math.max(0, refZ), 14) * 0.9;
      const sh = 0.45 + 0.7 * lam;
      ar += Math.min(1, r * sh + spec); ag += Math.min(1, g * sh + spec * 0.95); ab += Math.min(1, b * sh + spec * 0.85); cov++;
    }
    if (!cov) continue;
    const o2 = c.get(x, y); if (!o2) continue;
    const k = cov / 4;
    c.set(x, y, o2[0] * (1 - k) + (ar / cov) * k, o2[1] * (1 - k) + (ag / cov) * k, o2[2] * (1 - k) + (ab / cov) * k);
  }
}

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const o = (core.effectOptions && core.effectOptions.coinflip) || {};
    const sp = Math.max(0.25, Number(o.speed) || 1);
    if (st.t0 === null) newToss(t);
    let e = (t - st.t0) * sp;
    if (st.phase === 'toss' && e > TOSS_S) { st.phase = 'wobble'; }
    if (st.phase === 'wobble' && e > TOSS_S + WOBBLE_S) { st.phase = 'show'; if (st.result === 'H') st.heads++; else st.tails++; }
    if (st.phase === 'show' && e > TOSS_S + WOBBLE_S + SHOW_S) { newToss(t); e = 0; }

    // Table: dark blue-grey with a soft pool of light.
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      const v = Math.max(0, 1 - Math.hypot((x - c.W / 2) / c.W, (y - c.H * 0.55) / c.H) * 1.6);
      c.set(x, y, 0.015 + v * 0.06, 0.02 + v * 0.07, 0.04 + v * 0.1);
    }
    const tallyH = Math.max(6, Math.round(c.H * 0.14));
    const R0 = Math.min(c.W, c.H - tallyH) * 0.3;
    const cx = c.W / 2, rest = (c.H - tallyH) * 0.55;
    // Flip angle: whole turns during the toss, ending flat with the result up.
    const endA = st.result === 'H' ? 0 : Math.PI;
    let a = endA, w = 0, lift = 0;
    if (st.phase === 'toss') {
      const p = e / TOSS_S;
      a = endA + (1 - p) * st.turns * Math.PI * 2;
      lift = 4 * p * (1 - p); // up and back down
    } else if (st.phase === 'wobble') {
      const p = (e - TOSS_S) / WOBBLE_S;
      w = Math.sin(p * Math.PI * 5) * 0.35 * (1 - p) * (1 - p); // settling wobble
      lift = Math.abs(Math.sin(p * Math.PI * 2)) * 0.08 * (1 - p);
    }
    const R = R0 * (1 + lift * 0.45), cy = rest - lift * (c.H - tallyH) * 0.32;
    // Shadow on the table, smaller and fainter while it's in the air.
    const sR = R0 * (1 - lift * 0.35);
    for (let y = Math.floor(rest + R0 * 0.25 - sR); y <= rest + R0 * 0.25 + sR; y++) for (let x = Math.floor(cx - sR * 1.1); x <= cx + sR * 1.1; x++) {
      const dd = Math.hypot((x - cx) / (sR * 1.05), (y - rest - R0 * 0.25) / (sR * 0.55)), k = Math.max(0, 1 - dd * dd) * 0.6 * (1 - lift * 0.6), px = c.get(x, y);
      if (px && k > 0) c.set(x, y, px[0] * (1 - k), px[1] * (1 - k), px[2] * (1 - k));
    }
    drawCoin(c, cx, cy, R, orient(a, w), 'H');

    // Result and tally.
    if (st.phase === 'show') {
      const word = st.result === 'H' ? 'HEADS' : 'TAILS', col = st.result === 'H' ? [1, 0.8, 0.3] : [0.75, 0.82, 1];
      const h = Math.max(7, Math.round(c.H * 0.13));
      if (h >= 9) stroke.drawText(c, word, Math.round((c.W - stroke.textWidth(word, h)) / 2), 2, h, col);
      else drawString(FONT_5x7, word, Math.round((c.W - textWidth(FONT_5x7, word)) / 2), 2, (x, y) => c.set(x, y, col[0], col[1], col[2]));
    }
    const tally = `H ${st.heads}  T ${st.tails}`, ty = c.H - FONT_3x5.h - 2;
    drawString(FONT_3x5, tally, Math.round((c.W - textWidth(FONT_3x5, tally)) / 2), ty, (x, y) => c.set(x, y, 0.75, 0.78, 0.85));
  },
});
module.exports.getStatus = () => ({ heads: st.heads, tails: st.tails, last: st.result });
