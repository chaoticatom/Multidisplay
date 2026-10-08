// Spectrum analysers for the flat panel / wall - real frequency-vs-level
// displays (an earlier set of "scenes" read as ordinary effects that moved
// to the music). Every style shows bass on the left and treble on the
// right, with the level readable at a glance, and spreads across the whole
// wall however wide it is.
//   hifi        - a hi-fi graphic EQ: segmented green/amber/red LEDs,
//                 unlit segments faintly visible, peak-hold LEDs
//   studio      - analyser software: dB grid, frequency labels, a filled
//                 curve with a bright edge and a slow peak-hold line
//   spectrogram - scrolls sideways: time across, frequency up, loudness as
//                 colour (black, purple, red, yellow, white)
//   waterfall3d - recent spectrum lines stacked into the distance
//   mirror      - bars growing up and down from a centre line, glass sheen
//   radial      - spokes round an ellipse, the full spectrum in a ring
//   particle    - bars that spray sparks off their tops
//   neon        - a smooth glowing spectrum line, mirrored
//   bounce      - each bar's peak is a ball the bar bounces up
//   bars3d      - solid shaded 3D columns
//   auto        - moves through them, about 25 s each
// The bottom 9 rows are kept clear for the now-playing ticker. Reads the
// shared display levels (ctx.ampArr / ctx.peakArr, see levels.js). y = 0 is
// the top, as for every wall effect. The classic styles are in
// spectrumWall.js.
'use strict';

const { hsl } = require('../../core');
const { FONT_3x5, drawString } = require('../text');

const SCENES = ['hifi', 'studio', 'spectrogram', 'waterfall3d', 'mirror', 'radial', 'particle', 'neon', 'bounce', 'bars3d'];
const AUTO_SECS = 25;
const TICKER_ROWS = 9;

function createV2State() { return { sceneT: 0, last: null }; }

function ampAt(arr, bands, f) {
  const x = Math.max(0, Math.min(1, f)) * (bands - 1), i = Math.floor(x), t = x - i;
  const a = arr[i] || 0, b = arr[Math.min(bands - 1, i + 1)] || 0;
  return a + (b - a) * (t * t * (3 - 2 * t));
}
function put(core, x, y, c, k = 1) { if (k > 0.004) core.setWallPixel(Math.round(x), Math.round(y), c[0] * k, c[1] * k, c[2] * k); }
function lineTo(core, x0, y0, x1, y1, c, k) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) put(core, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, k);
}
// Bass blue -> treble red, the same everywhere so styles read alike.
const bandHue = (f) => 0.62 - f * 0.62;
// n bar levels across the spectrum.
function bars(ctx, n) {
  const lv = new Float32Array(n);
  for (let i = 0; i < n; i++) lv[i] = ampAt(ctx.ampArr, ctx.bands, n > 1 ? i / (n - 1) : 0);
  return { lv };
}
// Peak markers that hold, then fall with gravity.
function heldPeaks(st, key, lv, dt) {
  let p = st[key];
  if (!p || p.v.length !== lv.length) p = st[key] = { v: new Float32Array(lv.length), hold: new Float32Array(lv.length), vel: new Float32Array(lv.length) };
  for (let i = 0; i < lv.length; i++) {
    if (lv[i] >= p.v[i]) { p.v[i] = lv[i]; p.hold[i] = 0.5; p.vel[i] = 0; }
    else if (p.hold[i] > 0) p.hold[i] -= dt;
    else { p.vel[i] += 1.6 * dt; p.v[i] = Math.max(lv[i], p.v[i] - p.vel[i] * dt); }
  }
  return p.v;
}

// ── Hi-Fi LED ───────────────────────────────────────────────────────────
function sceneHifi(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 4)), seg = 3, segs = Math.floor((area - 2) / seg);
  const { lv } = bars(ctx, n), pk = heldPeaks(st, 'hifiPk', lv, dt), slot = W / n;
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), lit = Math.round(lv[i] * segs), peak = Math.min(segs - 1, Math.round(pk[i] * segs));
    for (let s = 0; s < segs; s++) {
      const f = s / (segs - 1), c = f < 0.6 ? [0.15, 1, 0.3] : f < 0.85 ? [1, 0.75, 0.1] : [1, 0.15, 0.1];
      const on = s < lit, isPeak = s === peak && peak > 0;
      const y0 = area - 1 - s * seg;
      for (let y = y0; y > y0 - (seg - 1); y--) for (let x = x0; x <= x1; x++) put(core, x, y, c, on ? 1 : isPeak ? 0.9 : 0.07);
    }
  }
}

// ── Studio analyser ─────────────────────────────────────────────────────
const LABELS = [[100, '100'], [1000, '1K'], [5000, '5K']];
function sceneStudio(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, top = 7, bot = area - 1, h = bot - top;
  // Frequency axis: the analysis covers about 30 Hz - 7 kHz on a log scale (see fft.js).
  const fx = (hz) => Math.log(hz / 30) / Math.log(7000 / 30) * (W - 1);
  for (let k = 1; k < 6; k++) { const y = Math.round(top + h * k / 6); for (let x = 0; x < W; x += 2) put(core, x, y, [0.2, 0.3, 0.45], 0.35); }
  for (const [hz, label] of LABELS) {
    const x = Math.round(fx(hz)); if (x < 0 || x >= W) continue;
    for (let y = top; y <= bot; y += 2) put(core, x, y, [0.2, 0.3, 0.45], 0.35);
    drawString(FONT_3x5, label, Math.min(W - label.length * 4, Math.max(0, x - label.length * 2)), 0, (px, py) => put(core, px, py, [0.55, 0.65, 0.8], 0.8));
  }
  const cur = Float32Array.from({ length: W }, (_, x) => ampAt(ctx.ampArr, ctx.bands, x / (W - 1)));
  const pk = heldPeaks(st, 'studioPk', cur, dt * 0.5);
  let prevY = null, prevP = null;
  for (let x = 0; x < W; x++) {
    const a = cur[x], y = bot - a * h, c = hsl(bandHue(x / (W - 1)), 0.9, 0.55);
    for (let yy = Math.ceil(y); yy <= bot; yy++) put(core, x, yy, c, 0.12 + 0.35 * (1 - (yy - y) / (bot - y + 1)));
    if (prevY !== null) lineTo(core, x - 1, prevY, x, y, [0.9, 0.95, 1], 1); else put(core, x, y, [0.9, 0.95, 1]);
    const py = bot - pk[x] * h;
    if (prevP !== null && x % 2 === 0) lineTo(core, x - 1, prevP, x, py, [1, 0.8, 0.3], 0.5);
    prevY = y; prevP = py;
  }
}

// ── Spectrogram ─────────────────────────────────────────────────────────
const HEAT = [[0, 0, 0], [0.35, 0.05, 0.5], [0.9, 0.1, 0.2], [1, 0.75, 0.1], [1, 1, 1]]; // black, purple, red, yellow, white
function heat(v) {
  const x = Math.max(0, Math.min(1, v)) * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(x)), t = x - i;
  return [0, 1, 2].map((c) => HEAT[i][c] + (HEAT[i + 1][c] - HEAT[i][c]) * t);
}
function sceneSpectrogram(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS;
  if (!st.sg || st.sg.w !== W) st.sg = { w: W, cols: Array.from({ length: W }, () => new Float32Array(area)), acc: 0, head: 0 };
  const sg = st.sg;
  sg.acc += dt * Math.max(30, W / 6); // about six seconds across the wall
  while (sg.acc >= 1) {
    sg.acc -= 1;
    const col = sg.cols[sg.head];
    for (let y = 0; y < area; y++) col[y] = ampAt(ctx.ampArr, ctx.bands, 1 - y / (area - 1)); // bass at the bottom
    sg.head = (sg.head + 1) % W;
  }
  for (let x = 0; x < W; x++) {
    const col = sg.cols[(sg.head + x) % W];
    for (let y = 0; y < area; y++) put(core, x, y, heat(col[y]));
  }
}

// ── 3D waterfall ────────────────────────────────────────────────────────
function sceneWaterfall3d(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, ROWS = 14, pts = Math.max(24, Math.floor(W / 3));
  if (!st.wf || st.wf.pts !== pts) st.wf = { pts, hist: [], acc: 0 };
  const wf = st.wf;
  wf.acc += dt;
  const row = Float32Array.from({ length: pts }, (_, i) => ampAt(ctx.ampArr, ctx.bands, i / (pts - 1)));
  if (wf.acc > 0.08 || !wf.hist.length) { wf.acc = 0; wf.hist.unshift(row); if (wf.hist.length > ROWS) wf.hist.pop(); } else wf.hist[0] = row;
  // Oldest at the back (higher, narrower, dimmer), newest at the front.
  for (let j = wf.hist.length - 1; j >= 0; j--) {
    const d = j / (ROWS - 1), base = area - 2 - d * area * 0.45, inset = d * W * 0.12, scale = 1 - d * 0.5, r = wf.hist[j], k = 1 - d * 0.8;
    let px = null, py = null;
    for (let i = 0; i < pts; i++) {
      const x = inset + (i / (pts - 1)) * (W - 1 - 2 * inset), y = base - r[i] * area * 0.5 * scale;
      if (j === 0) for (let yy = Math.ceil(y) + 1; yy <= base; yy++) put(core, x, yy, hsl(bandHue(i / (pts - 1)), 0.9, 0.4), 0.25);
      if (px !== null) lineTo(core, px, py, x, y, hsl(bandHue(i / (pts - 1)), 0.9, 0.55 + 0.2 * r[i]), k);
      px = x; py = y;
    }
  }
}

// ── Mirror ──────────────────────────────────────────────────────────────
function sceneMirror(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 4)), mid = Math.floor(area / 2), half = mid - 1, slot = W / n;
  const { lv } = bars(ctx, n);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), h = lv[i] * half, hue = bandHue(i / (n - 1));
    for (let j = 0; j <= h; j++) {
      const c = hsl(hue + (j / half) * 0.08, 0.9, 0.38 + 0.3 * (j / half)), k = j + 1 > h ? h - j : 1;
      for (let x = x0; x <= x1; x++) { const sheen = x === x0 ? 1.35 : 1; put(core, x, mid - 1 - j, c, k * sheen); put(core, x, mid + j, c, k * 0.75 * sheen); }
    }
  }
  for (let x = 0; x < W; x++) put(core, x, mid, [0.6, 0.7, 0.9], 0.15);
}

// ── Radial ──────────────────────────────────────────────────────────────
function sceneRadial(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, cx = (W - 1) / 2, cy = (area - 1) / 2;
  const ry0 = area * 0.18, spanY = area * 0.3, rx0 = W > area * 1.5 ? W * 0.3 : ry0, spanX = W > area * 1.5 ? W * 0.17 : spanY;
  const n = Math.max(64, Math.round(W / 1.5)), rot = t * 0.1;
  for (let i = 0; i < n; i++) {
    // Bass at the top, treble at the bottom, mirrored left/right.
    const f = Math.abs((i / n) * 2 - 1), a = ampAt(ctx.ampArr, ctx.bands, 1 - f), ang = rot + (i / n) * Math.PI * 2 - Math.PI / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang), c = hsl(bandHue(1 - f), 0.9, 0.55);
    for (let r = 0; r <= a; r += 0.04) put(core, cx + ca * (rx0 + r * spanX), cy + sa * (ry0 + r * spanY), c, 0.5 + 0.5 * r);
    put(core, cx + ca * rx0, cy + sa * ry0, [0.4, 0.5, 0.7], 0.5);
  }
}

// ── Particle ────────────────────────────────────────────────────────────
function sceneParticle(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 4)), slot = W / n, maxH = area - 4;
  if (!st.pt) st.pt = { sparks: [], seed: 13 };
  const pt = st.pt, rnd = () => { pt.seed = (pt.seed * 16807) % 2147483647; return pt.seed / 2147483647; };
  const { lv } = bars(ctx, n);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), h = lv[i] * maxH, c = hsl(bandHue(i / (n - 1)), 0.9, 0.5);
    for (let j = 0; j <= h; j++) for (let x = x0; x <= x1; x++) put(core, x, area - 1 - j, c, 0.35 + 0.5 * (j / maxH));
    if (rnd() < lv[i] * lv[i] * dt * 25) pt.sparks.push({ x: x0 + rnd() * (x1 - x0 + 1), y: area - 1 - h, vy: -(10 + lv[i] * 30), vx: (rnd() - 0.5) * 6, hue: bandHue(i / (n - 1)), life: 0.8 });
  }
  if (pt.sparks.length > 800) pt.sparks.splice(0, pt.sparks.length - 800);
  for (let k = pt.sparks.length - 1; k >= 0; k--) {
    const p = pt.sparks[k]; p.life -= dt; p.y += p.vy * dt; p.x += p.vx * dt; p.vy += 8 * dt;
    if (p.life <= 0) { pt.sparks.splice(k, 1); continue; }
    put(core, p.x, p.y, hsl(p.hue, 0.6, 0.75), p.life / 0.8);
  }
}

// ── Neon ────────────────────────────────────────────────────────────────
function sceneNeon(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, mid = (area - 1) / 2, amp = mid - 2;
  let pu = null, pd = null;
  for (let x = 0; x < W; x++) {
    const f = x / (W - 1), a = ampAt(ctx.ampArr, ctx.bands, f), c = hsl(bandHue(f) + Math.sin(t * 0.2) * 0.05, 1, 0.55);
    const yu = mid - a * amp, yd = mid + a * amp;
    // Glow: a soft halo either side of each line, then the bright core.
    for (const [y, prev] of [[yu, pu], [yd, pd]]) {
      for (let g = 1; g <= 2; g++) { put(core, x, y - g, c, 0.25 / g); put(core, x, y + g, c, 0.25 / g); }
      if (prev !== null) lineTo(core, x - 1, prev, x, y, c, 1); else put(core, x, y, c);
    }
    put(core, x, mid, c, 0.08 + a * 0.15);
    pu = yu; pd = yd;
  }
}

// ── Bounce ──────────────────────────────────────────────────────────────
function sceneBounce(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 5)), slot = W / n, maxH = area - 4;
  const { lv } = bars(ctx, n);
  if (!st.bn || st.bn.y.length !== n) st.bn = { y: new Float32Array(n), v: new Float32Array(n), prev: new Float32Array(n) };
  const bn = st.bn;
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), h = lv[i] * maxH, c = hsl(bandHue(i / (n - 1)), 0.9, 0.5);
    for (let j = 0; j <= h; j++) for (let x = x0; x <= x1; x++) put(core, x, area - 1 - j, c, 0.4 + 0.5 * (j / maxH));
    // The ball sits on the bar; a rising bar throws it up, gravity brings it back.
    bn.v[i] -= area * 2.5 * dt; bn.y[i] += bn.v[i] * dt;
    if (bn.y[i] <= h + 1) {
      const kick = Math.min(area * 1.4, Math.max(0, (h - bn.prev[i]) / Math.max(dt, 1e-3)) * 1.2);
      bn.y[i] = h + 1; bn.v[i] = Math.max(-bn.v[i] * 0.35, kick);
    }
    if (bn.y[i] > maxH + 2) { bn.y[i] = maxH + 2; bn.v[i] = Math.min(0, bn.v[i]); } // stays on screen
    bn.prev[i] = h;
    const cxB = (x0 + x1) / 2, cyB = area - 1 - bn.y[i] - 1, bc = hsl(bandHue(i / (n - 1)), 0.5, 0.8);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) put(core, cxB + xx, cyB + yy, bc, xx && yy ? 0.4 : 1);
  }
}

// ── 3D bars ─────────────────────────────────────────────────────────────
function sceneBars3d(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 6)), slot = W / n, depth = 3, maxH = area - depth - 3;
  const { lv } = bars(ctx, n);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = Math.round(i * slot), w = Math.max(2, Math.round(slot) - depth - 1), h = Math.round(lv[i] * maxH), base = area - 1, hue = bandHue(i / (n - 1));
    const front = hsl(hue, 0.85, 0.48), side = hsl(hue, 0.85, 0.28), top = hsl(hue, 0.7, 0.72);
    for (let j = 0; j <= h; j++) for (let x = x0; x < x0 + w; x++) put(core, x, base - j, front, 0.7 + 0.3 * (j / maxH));
    for (let d = 1; d <= depth; d++) {
      for (let j = 0; j <= h; j++) put(core, x0 + w - 1 + d, base - j - d, side);
      for (let x = x0; x < x0 + w; x++) put(core, x + d, base - h - d, top);
    }
  }
}

const RENDER = { hifi: sceneHifi, studio: sceneStudio, spectrogram: sceneSpectrogram, waterfall3d: sceneWaterfall3d, mirror: sceneMirror, radial: sceneRadial, particle: sceneParticle, neon: sceneNeon, bounce: sceneBounce, bars3d: sceneBars3d };

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') { st.sceneT += dt; name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length]; }
  if (st.last !== name) { for (const k of Object.keys(st)) if (k !== 'sceneT') delete st[k]; st.last = name; }
  RENDER[name](core, ctx, st, W, H, t, dt);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
