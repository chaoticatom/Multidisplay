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
//   mirror      - stereo: the left channel's bars grow up from a centre
//                 line, the right channel's down, glass sheen
//   radial      - spokes round an ellipse, the full spectrum in a ring
//   particle    - bars that spray sparks off their tops
//   neon        - stereo: two smooth glowing spectrum lines, the left
//                 channel above the centre, the right below
//   bounce      - balls flying all over the screen: rising bars kick them
//                 up and sideways; they bounce off the walls, ceiling and bars
//   bars3d      - solid shaded 3D columns
//   horizon     - Event Horizon: a gravitationally lensed black hole whose
//                 glowing accretion disk is the music
//   loom        - Light Loom: neon threads of recent moments stacked into
//                 the distance, a mirror floor below
//   helix       - Plasma Helix: left and right as two twisting light strands
//   tunnel      - Hyper Tunnel: spectrum-shaped neon rings rushing at you
//   auto        - moves through them (25 s each, or the `autoSecs` option),
//                 flowing from one into the next over a few seconds
// The bottom 9 rows are kept clear for the now-playing ticker. Reads the
// shared display levels (ctx.ampArr / ctx.peakArr, see levels.js). y = 0 is
// the top, as for every wall effect. The classic styles are in
// spectrumWall.js.
'use strict';

const { hsl } = require('../../core');
const { FONT_3x5, drawString } = require('../text');

const SCENES = ['horizon', 'loom', 'helix', 'tunnel', 'hifi', 'studio', 'spectrogram', 'waterfall3d', 'mirror', 'radial', 'particle', 'neon', 'bounce', 'bars3d'];
const AUTO_SECS = 25;
const TICKER_ROWS = 9;

function createV2State() { return { sceneT: 0, last: null, subs: {}, tmp: null }; }

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
  const L = chan(ctx, 'ampL', n), R = chan(ctx, 'ampR', n);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), hue = bandHue(i / (n - 1));
    // Left channel up, right channel down.
    for (const [lvl, dir, dim] of [[L[i] * half, -1, 1], [R[i] * half, 1, 0.85]]) {
      for (let j = 0; j <= lvl; j++) {
        const c = hsl(hue + (j / half) * 0.08, 0.9, 0.38 + 0.3 * (j / half)), k = (j + 1 > lvl ? lvl - j : 1) * dim;
        for (let x = x0; x <= x1; x++) put(core, x, dir < 0 ? mid - 1 - j : mid + j, c, k * (x === x0 ? 1.35 : 1));
      }
    }
  }
  for (let x = 0; x < W; x++) put(core, x, mid, [0.6, 0.7, 0.9], 0.15);
  channelLabels(core, mid, area);
}
// Tiny L / R marks at the left edge (stereo styles).
function channelLabels(core, mid, area) {
  if (area < 30) return;
  drawString(FONT_3x5, 'L', 1, Math.max(0, mid - 7), (x, y) => put(core, x, y, [0.5, 0.6, 0.8], 0.45));
  drawString(FONT_3x5, 'R', 1, mid + 2, (x, y) => put(core, x, y, [0.5, 0.6, 0.8], 0.45));
}
// One channel's n bar levels (falls back to the combined spectrum when the
// audio has no separate channels, e.g. the browser simulator).
function chan(ctx, key, n) {
  const arr = ctx[key] || ctx.ampArr, lv = new Float32Array(n);
  for (let i = 0; i < n; i++) lv[i] = ampAt(arr, ctx.bands, n > 1 ? i / (n - 1) : 0);
  return lv;
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
    const f = x / (W - 1), aL = ampAt(ctx.ampL || ctx.ampArr, ctx.bands, f), aR = ampAt(ctx.ampR || ctx.ampArr, ctx.bands, f), a = (aL + aR) / 2, c = hsl(bandHue(f) + Math.sin(t * 0.2) * 0.05, 1, 0.55);
    const yu = mid - aL * amp, yd = mid + aR * amp; // left channel above, right below
    // Glow: a soft halo either side of each line, then the bright core.
    for (const [y, prev] of [[yu, pu], [yd, pd]]) {
      for (let g = 1; g <= 2; g++) { put(core, x, y - g, c, 0.25 / g); put(core, x, y + g, c, 0.25 / g); }
      if (prev !== null) lineTo(core, x - 1, prev, x, y, c, 1); else put(core, x, y, c);
    }
    put(core, x, mid, c, 0.08 + a * 0.15);
    pu = yu; pd = yd;
  }
  channelLabels(core, Math.round(mid), area);
}

// ── Bounce ──────────────────────────────────────────────────────────────
// Balls fly all over the screen: a bar that jumps up under a ball kicks it
// up and sideways; gravity pulls it back; it bounces off the side walls,
// the ceiling and the tops of the bars.
function sceneBounce(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.floor(W / 5)), slot = W / n, maxH = area - 4;
  const { lv } = bars(ctx, n);
  if (!st.bb || st.bb.n !== n) {
    const count = Math.max(5, Math.min(24, Math.round(W / 12)));
    st.bb = { n, prev: new Float32Array(n), seed: 7, balls: [] };
    for (let k = 0; k < count; k++) st.bb.balls.push({ x: (k + 0.5) * W / count, y: area * 0.5, vx: (k % 2 ? 1 : -1) * (6 + k % 5 * 3), vy: 0, hue: k / count });
  }
  const bb = st.bb, rnd = () => { bb.seed = (bb.seed * 16807) % 2147483647; return bb.seed / 2147483647; };
  const top = new Float32Array(n), rise = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = Math.max(x0, Math.round((i + 1) * slot) - 2), h = lv[i] * maxH, c = hsl(bandHue(i / (n - 1)), 0.9, 0.5);
    for (let j = 0; j <= h; j++) for (let x = x0; x <= x1; x++) put(core, x, area - 1 - j, c, 0.35 + 0.45 * (j / maxH));
    top[i] = h; rise[i] = Math.max(0, (h - bb.prev[i]) / Math.max(dt, 1e-3)); bb.prev[i] = h;
  }
  const g = area * 2.2, r = 1.2;
  for (const b of bb.balls) {
    // y is height above the floor (0 = bottom of the spectrum area).
    b.vy -= g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    b.vx *= Math.exp(-dt * 0.15);
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.95; }
    if (b.x > W - 1 - r) { b.x = W - 1 - r; b.vx = -Math.abs(b.vx) * 0.95; }
    if (b.y > area - 2 - r) { b.y = area - 2 - r; b.vy = -Math.abs(b.vy) * 0.8; }
    const i = Math.max(0, Math.min(n - 1, Math.floor(b.x / slot)));
    if (b.y <= top[i] + r) {
      b.y = top[i] + r;
      // A rising bar throws it; a loud bar gives it a sideways nudge too.
      const kick = Math.min(area * 1.6, rise[i] * 1.3);
      b.vy = Math.max(Math.abs(b.vy) * 0.55, kick, lv[i] > 0.25 ? area * 0.6 * lv[i] : 0);
      if (kick > area * 0.3) b.vx += (rnd() - 0.5) * W * 0.25 + (b.vx >= 0 ? 4 : -4);
      b.vx = Math.max(-W * 0.6, Math.min(W * 0.6, b.vx));
    }
    const cx = b.x, cy = area - 1 - b.y, bc = hsl(b.hue, 0.55, 0.8);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) put(core, cx + xx, cy + yy, bc, xx && yy ? 0.4 : 1);
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

// ── Event Horizon ──────────────────────────────────────────────────────
// A black hole whose glowing accretion disk is the music, with the light
// really bent by gravity: the disk behind the hole shows arched over its
// top and a thin ring wraps underneath (as in Interstellar). Treble lights
// the white-hot inner edge, bass the outer bands; the swirl races with the
// loudness, each beat sends shock rings out through the disk and makes it
// flare, and the side spinning towards you blazes brighter (Doppler).
// The bent light paths never change (the camera is still), so they're
// traced once - a few rows a frame when the style starts - and stored:
// for each pixel, where its light crosses the disk (up to twice) or which
// stars it sees. Each frame only paints the moving disk onto those paths.
const BH_STEP = 0.14, BH_STEPS = 230, BH_R_IN = 2.6;
const bhHash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function bhNoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = bhHash(xi, yi), b = bhHash(xi + 1, yi), c = bhHash(xi, yi + 1), d = bhHash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
// Traces one pixel's light (Schwarzschild-style bending) into map slot i.
function bhTrace(m, i, sx, sy) {
  const camDist = 13, elev = 0.13, ce = Math.cos(elev), se = Math.sin(elev);
  let x = 0, y = camDist * se, z = -camDist * ce;
  let dx = sx, dy = sy * ce - se, dz = sy * se + ce;
  const n = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= n; dy /= n; dz /= n;
  const hx = y * dz - z * dy, hy = z * dx - x * dz, hz = x * dy - y * dx, h2 = hx * hx + hy * hy + hz * hz;
  let hits = 0;
  m.cap[i] = 0;
  for (let k = 0; k < BH_STEPS; k++) {
    const py = y;
    x += dx * BH_STEP; y += dy * BH_STEP; z += dz * BH_STEP;
    const r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
    if (r < 1) { m.cap[i] = 1; break; }
    const acc = -1.5 * h2 / (r2 * r2 * r) * BH_STEP;
    dx += acc * x; dy += acc * y; dz += acc * z;
    if (py * y < 0 && hits < 2) {
      const f = py / (py - y), cx = x - dx * BH_STEP * (1 - f), cz = z - dz * BH_STEP * (1 - f), rr = Math.sqrt(cx * cx + cz * cz);
      if (rr > BH_R_IN && rr < m.rOut) { m.r[i * 2 + hits] = rr; m.a[i * 2 + hits] = Math.atan2(cz, cx); hits++; }
    }
    if (r > 40) break;
  }
  m.hits[i] = hits;
  // Stars where the light escapes.
  if (!m.cap[i]) { const th = Math.atan2(dz, dx), ph = Math.asin(Math.max(-1, Math.min(1, dy))), s = bhHash(Math.floor(th * 120), Math.floor(ph * 120)); m.star[i] = s > 0.996 ? (s - 0.996) * 200 : 0; }
}
const BH_HEAT = new Float32Array(3);
function bhHeat(k) { k = Math.max(0, Math.min(1.6, k)); BH_HEAT[0] = Math.min(1, k * 1.6); BH_HEAT[1] = Math.min(1, k * k * 1.2); BH_HEAT[2] = Math.max(0, Math.min(1, (k - 0.55) * 1.4 + k * k * k * 0.25)); return BH_HEAT; }
function sceneHorizon(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, N = W * area, asp = W / area, fov = 0.42;
  let m = st.bh;
  if (!m || m.N !== N) m = st.bh = { N, done: 0, rOut: 9 + 1.6 * Math.max(0, asp - 2), r: new Float32Array(N * 2), a: new Float32Array(N * 2), hits: new Uint8Array(N), cap: new Uint8Array(N), star: new Float32Array(N), img: new Float32Array(N * 3), blur: new Float32Array(N * 3), rot: 0, beat: 0, bassAvg: 0 };
  // Trace the light paths a few rows per frame until all are done.
  if (m.done < area) {
    const end = Math.min(area, m.done + Math.max(2, Math.round(1400 / W)));
    for (let y = m.done; y < end; y++) for (let x = 0; x < W; x++) bhTrace(m, y * W + x, (x + 0.5 - W / 2) / area * fov * 2, (area / 2 - y - 0.5) / area * fov * 2);
    m.done = end;
  }
  // The music: a beat from the bass jumping above its own average.
  let bass = 0; for (let i = 0; i < 6; i++) bass += ctx.ampArr[i] || 0; bass /= 6;
  let loud = 0; for (let i = 0; i < ctx.bands; i++) loud += ctx.ampArr[i] || 0; loud /= ctx.bands;
  m.bassAvg += (bass - m.bassAvg) * Math.min(1, dt * 2);
  if (bass > m.bassAvg * 1.18 + 0.05 && m.beat < 0.4) m.beat = 1; else m.beat *= Math.exp(-dt * 5);
  m.rot += dt * (0.7 + 1.6 * loud + 0.8 * m.beat);
  const beat = m.beat, rot = m.rot, img = m.img;
  for (let i = 0; i < N; i++) {
    const o = i * 3;
    if (Math.floor(i / W) >= m.done) { img[o] = img[o + 1] = img[o + 2] = 0; continue; }
    let cr = 0, cg = 0, cb = 0, alpha = 1;
    for (let h = 0; h < m.hits[i]; h++) {
      const rr = m.r[i * 2 + h], ang = m.a[i * 2 + h], u = (rr - BH_R_IN) / (m.rOut - BH_R_IN);
      const mu = ampAt(ctx.ampArr, ctx.bands, 1 - u); // inner edge = treble, outer = bass
      const swirl = bhNoise(ang * 6 + rot * 4 / Math.sqrt(rr), rr * 2.2) * 0.6 + bhNoise(ang * 18 - rot * 6, rr * 5) * 0.4;
      const ring = 0.5 + 0.5 * Math.sin(rr * 7 - t * 6 * (1 + beat));
      let I = 1.5 * (0.25 + 1.1 * mu) * (0.45 + 0.75 * swirl) * Math.pow(1 - u, 1.4) * 1.6 * (1 + 0.6 * beat * ring);
      const dop = 1 + 0.75 * Math.cos(ang) * (1.2 / Math.sqrt(rr));
      I *= dop * dop;
      const c = bhHeat(I * (0.8 + 0.4 * (1 - u))), a2 = Math.min(1, I * 1.2) * 0.9;
      cr += c[0] * alpha * a2; cg += c[1] * alpha * a2; cb += c[2] * alpha * a2 * (0.4 + 0.4 * dop);
      alpha *= 1 - a2;
    }
    if (!m.cap[i] && m.star[i] > 0) { const tw = 0.7 + 0.3 * Math.sin(t * 3 + i); cr += m.star[i] * alpha * tw; cg += m.star[i] * alpha * tw; cb += m.star[i] * alpha * tw * 1.2; }
    img[o] = cr; img[o + 1] = cg; img[o + 2] = cb;
  }
  // Glow: a soft separable blur added on top, then gentle tone mapping.
  const bl = m.blur, K = [0.06, 0.12, 0.18, 0.28, 0.18, 0.12, 0.06];
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) { let r = 0, g = 0, b = 0; for (let k = -3; k <= 3; k++) { const xx = Math.max(0, Math.min(W - 1, x + k)), o = (y * W + xx) * 3, w = K[k + 3]; r += img[o] * w; g += img[o + 1] * w; b += img[o + 2] * w; } const o = (y * W + x) * 3; bl[o] = r; bl[o + 1] = g; bl[o + 2] = b; }
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0; for (let k = -3; k <= 3; k++) { const yy = Math.max(0, Math.min(area - 1, y + k)), o = (yy * W + x) * 3, w = K[k + 3]; r += bl[o] * w; g += bl[o + 1] * w; b += bl[o + 2] * w; }
    const o = (y * W + x) * 3, tm = (v) => 1 - Math.exp(-v * 1.3);
    core.setWallPixel(x, y, tm(img[o] + r * 0.6), tm(img[o + 1] + g * 0.6), tm(img[o + 2] + b * 0.6));
  }
}

// ── Light shared by Light Loom, Plasma Helix and Hyper Tunnel ─────────────
// They draw additive glowing light into a float buffer (glowDot), then
// lightOut() adds a soft bloom, tone-maps it and puts it on the wall.
function lightBuf(st, W, area) { if (!st.fb || st.fb.length !== W * area * 3) { st.fb = new Float32Array(W * area * 3); st.fb2 = new Float32Array(W * area * 3); } st.fb.fill(0); return st.fb; }
function glowDot(fb, W, area, x, y, c, k, rad) {
  const r = rad > 1.1 ? 3 : 2, x0 = Math.round(x), y0 = Math.round(y), inv = 1 / (rad * rad);
  for (let dy = -r; dy <= r; dy++) {
    const py = y0 + dy; if (py < 0 || py >= area) continue;
    for (let dx = -r; dx <= r; dx++) {
      const px = x0 + dx; if (px < 0 || px >= W) continue;
      const d2 = (px - x) * (px - x) + (py - y) * (py - y), w = k * Math.exp(-d2 * inv);
      if (w < 0.004) continue;
      const o = (py * W + px) * 3; fb[o] += c[0] * w; fb[o + 1] += c[1] * w; fb[o + 2] += c[2] * w;
    }
  }
}
const LK = [0.06, 0.12, 0.18, 0.28, 0.18, 0.12, 0.06];
function lightOut(core, st, W, area, bloom) {
  const fb = st.fb, bl = st.fb2;
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) { let r = 0, g = 0, b = 0; for (let k = -3; k <= 3; k++) { const o = (y * W + Math.max(0, Math.min(W - 1, x + k))) * 3, w = LK[k + 3]; r += fb[o] * w; g += fb[o + 1] * w; b += fb[o + 2] * w; } const o = (y * W + x) * 3; bl[o] = r; bl[o + 1] = g; bl[o + 2] = b; }
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0; for (let k = -3; k <= 3; k++) { const o = (Math.max(0, Math.min(area - 1, y + k)) * W + x) * 3, w = LK[k + 3]; r += bl[o] * w; g += bl[o + 1] * w; b += bl[o + 2] * w; }
    const o = (y * W + x) * 3;
    core.setWallPixel(x, y, 1 - Math.exp(-(fb[o] + r * bloom) * 1.4), 1 - Math.exp(-(fb[o + 1] + g * bloom) * 1.4), 1 - Math.exp(-(fb[o + 2] + b * bloom) * 1.4));
  }
}
// The last ~1.5 s of spectra (64 bands, 30 a second), newest first; and a beat.
function history(st, ctx, dt) {
  if (!st.hs) st.hs = { rows: [], acc: 0, beat: 0, avg: 0 };
  const hs = st.hs;
  hs.acc += dt;
  if (hs.acc >= 1 / 30 || !hs.rows.length) {
    hs.acc = 0;
    const row = hs.rows.length >= 48 ? hs.rows.pop() : new Float32Array(64);
    for (let i = 0; i < 64; i++) row[i] = ampAt(ctx.ampArr, ctx.bands, i / 63);
    hs.rows.unshift(row);
  }
  let bass = 0; for (let i = 0; i < 6; i++) bass += ctx.ampArr[i] || 0; bass /= 6;
  hs.avg += (bass - hs.avg) * Math.min(1, dt * 2);
  if (bass > hs.avg * 1.18 + 0.05 && hs.beat < 0.4) hs.beat = 1; else hs.beat *= Math.exp(-dt * 6);
  return hs;
}
const histAt = (hs, age, f) => { const r = hs.rows[Math.min(hs.rows.length - 1, Math.max(0, Math.round(age * 30)))]; return ampAt(r, 64, f); };
const HUE = (h, s, l) => hsl(((h % 1) + 1) % 1, s, l);

// ── Light Loom ──────────────────────────────────────────────────────────
// Glowing neon threads, one per recent moment of the music, stacked into
// the distance like a landscape of light; nearer threads hide those behind,
// a mirror-black floor reflects them, stars above.
function sceneLoom(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, fb = lightBuf(st, W, area), hs = history(st, ctx, dt);
  const N = 16, horizon = area * 0.3, floor = area * 0.9;
  if (!st.mask || st.mask.length !== W) st.mask = new Float32Array(W);
  const mask = st.mask; mask.fill(area);
  for (let k = 0; k < N; k++) {
    const age = k * 0.07, z = 1 + k * 0.55, base = horizon + (floor - horizon) / z, sc = (area * 0.55) / z;
    const hue = 0.78 - k * 0.025 + 0.08 * Math.sin(t * 0.4), fade = Math.exp(-k * 0.16) * (1 + 0.5 * hs.beat * (k < 3 ? 1 : 0));
    let prev = null;
    for (let x = 0; x < W; x++) {
      const f = 0.5 + (x - W / 2) / W * (z * 0.55), inside = f >= 0 && f <= 1;
      const a = inside ? histAt(hs, age, f) : 0.02, y = base - a * sc * (0.6 + 0.4 * Math.exp(-((f - 0.5) ** 2) * 6));
      if (y < mask[x]) {
        const col = HUE(hue + (inside ? f * 0.25 : 0), 1, 0.55), kk = fade * (0.35 + 1.1 * a) * (inside ? 1 : 0.25);
        glowDot(fb, W, area, x, y, col, 0.9 * kk, 0.8);
        if (prev !== null && Math.abs(prev - y) > 1) for (let q = 1; q < Math.abs(prev - y); q++) glowDot(fb, W, area, x - 0.5, prev + Math.sign(y - prev) * q, col, 0.6 * kk, 0.7);
        const ry = floor + (floor - y) * 0.35; if (ry < area) glowDot(fb, W, area, x, ry, col, 0.12 * kk, 1.2);
        mask[x] = y;
      }
      prev = y;
    }
  }
  for (let i = 0; i < W * 0.15; i++) { const x = (i * 97) % W, y = (i * 53) % Math.max(1, Math.floor(horizon * 0.9)), o = (y * W + x) * 3, b = 0.15 + 0.12 * Math.sin(t * 3 + i); fb[o] += 0.6 * b; fb[o + 1] += 0.6 * b; fb[o + 2] += 0.9 * b; }
  lightOut(core, st, W, area, 0.7);
}

// ── Plasma Helix ────────────────────────────────────────────────────────
// The left and right channels as two glowing strands twisting round each
// other, swelling with the music; light bridges where they cross, and
// sparks thrown off on the beat.
function scenePlasmaHelix(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, fb = lightBuf(st, W, area), hs = history(st, ctx, dt), mid = area * 0.5;
  const L = ctx.ampL || ctx.ampArr, R = ctx.ampR || ctx.ampArr, bands = ctx.bands;
  st.ph = (st.ph || 0) + dt * (2 + 3 * hs.beat);
  for (let x = 0; x < W; x += 0.5) {
    const f = x / (W - 1), ph = f * Math.PI * (W / area) * 1.6 - st.ph;
    for (let s2 = 0; s2 < 2; s2++) {
      const A = s2 ? R : L, off = s2 ? Math.PI : 0, a = ampAt(A, bands, f), r = area * (0.12 + 0.3 * a), y = mid + Math.sin(ph + off) * r, depth = Math.cos(ph + off);
      glowDot(fb, W, area, x, y, HUE((s2 ? 0.92 : 0.55) + f * 0.15, 1, 0.55), (0.55 + 0.45 * depth) * (0.6 + a) * 0.7, 0.8 + 0.3 * (depth + 1));
      if (!s2 && Math.abs(Math.sin(ph)) < 0.06) for (let yy = mid - r; yy <= mid + r; yy += 1) glowDot(fb, W, area, x, yy, HUE(0.75 + f * 0.2, 0.8, 0.6), 0.07 * a, 0.5);
    }
  }
  if (!st.sp) st.sp = [];
  if (hs.beat > 0.95) for (let i = 0; i < Math.round(W / 6); i++) st.sp.push({ x: Math.random() * W, y: mid + (Math.random() - 0.5) * area * 0.6, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.7, hue: Math.random() });
  for (let i = st.sp.length - 1; i >= 0; i--) { const p = st.sp[i]; p.life -= dt; if (p.life <= 0) { st.sp.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; glowDot(fb, W, area, p.x, p.y, HUE(p.hue, 1, 0.7), 0.8 * p.life, 0.7); }
  lightOut(core, st, W, area, 0.8);
}

// ── Hyper Tunnel ────────────────────────────────────────────────────────
// Neon rings shaped by the spectrum rush out of the centre towards you,
// forming a tunnel of light; it bulges on the beat.
function sceneTunnel(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, fb = lightBuf(st, W, area), hs = history(st, ctx, dt);
  const cx = W / 2, cy = area / 2, R0 = Math.min(W, area) * 0.08, wide = Math.min(2.2, W / area * 0.9);
  st.zp = (st.zp || 0) + dt * (0.35 + 0.4 * hs.beat);
  for (let k = 0; k < 14; k++) {
    const zf = ((k / 14) + st.zp) % 1, s = 1 / (1.2 - zf * 1.05) * (1 + 0.25 * hs.beat * zf), hue = (k * 0.09 + t * 0.1) % 1, age = (1 - zf) * 1.2;
    for (let a = 0; a < 6.283; a += 0.025) {
      const f = Math.abs(((a / 6.283) * 2) % 2 - 1), m = histAt(hs, age, f), rr = R0 * s * (1 + 0.45 * m);
      glowDot(fb, W, area, cx + Math.cos(a) * rr * wide, cy + Math.sin(a) * rr, HUE(hue + f * 0.3, 1, 0.55), (0.03 + zf * zf * 0.8) * (0.4 + m), 0.6 + zf * 0.9);
    }
  }
  lightOut(core, st, W, area, 0.8);
}

const RENDER = { horizon: sceneHorizon, loom: sceneLoom, helix: scenePlasmaHelix, tunnel: sceneTunnel, hifi: sceneHifi, studio: sceneStudio, spectrogram: sceneSpectrogram, waterfall3d: sceneWaterfall3d, mirror: sceneMirror, radial: sceneRadial, particle: sceneParticle, neon: sceneNeon, bounce: sceneBounce, bars3d: sceneBars3d };

// Each style keeps its own state (st.subs[name]), so two can be drawn in
// the same frame while one morphs into the next.
function sub(st, name) { return st.subs[name] || (st.subs[name] = {}); }

function renderSpectrumV2Wall(core, ctx, scene, st, autoSecs) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  if (!st.subs) st.subs = {};
  if (SCENES.includes(scene)) {
    if (st.last !== scene) { st.subs[scene] = {}; st.last = scene; }
    RENDER[scene](core, ctx, sub(st, scene), W, H, t, dt);
    return;
  }
  // Auto: each style for `hold` seconds; over the last `morph` seconds the
  // next one melts in (flow morph) while both keep moving to the music.
  const hold = [10, 25, 60, 120].includes(Number(autoSecs)) ? Number(autoSecs) : AUTO_SECS;
  const morph = Math.min(3, hold * 0.3);
  st.sceneT += dt;
  const i = Math.floor(st.sceneT / hold), local = st.sceneT - i * hold;
  const a = SCENES[i % SCENES.length], b = SCENES[(i + 1) % SCENES.length];
  if (st.last !== a) { if (st.last !== null && st.last !== a && st.morphTo !== a) st.subs[a] = {}; st.last = a; st.morphTo = null; }
  if (local < hold - morph) { RENDER[a](core, ctx, sub(st, a), W, H, t, dt); return; }
  if (st.morphTo !== b) { st.subs[b] = {}; st.morphTo = b; } // the next style starts fresh as it arrives
  const k = (local - (hold - morph)) / morph, buf = core.wallBuf;
  RENDER[a](core, ctx, sub(st, a), W, H, t, dt);
  if (!st.tmp || st.tmp.length !== buf.length) st.tmp = new Float32Array(buf.length);
  st.tmp.set(buf); buf.fill(0);
  RENDER[b](core, ctx, sub(st, b), W, H, t, dt);
  // The two flow into each other (see transition.js flowMorph): shapes melt
  // along one swirl while the new style shows through where both are bright.
  require('../transition').flowMorph(buf, st.tmp, W, H, k);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
