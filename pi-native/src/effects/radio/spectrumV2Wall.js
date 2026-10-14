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
//   chrome      - Chrome Sea: the spectrum as a ray-traced liquid-chrome
//                 landscape rolling towards you (time into the distance),
//                 mirroring a synthwave sky whose sun swells with the bass;
//                 loud crests glow in their band's colour
//   auto        - moves through them (25 s each, or the `autoSecs` option),
//                 morphing from one to the next over a few seconds
// The bottom 9 rows are kept clear for the now-playing ticker. Reads the
// shared display levels (ctx.ampArr / ctx.peakArr, see levels.js). y = 0 is
// the top, as for every wall effect. The classic styles are in
// spectrumWall.js.
'use strict';

const { hsl } = require('../../core');
const { FONT_3x5, drawString } = require('../text');

const SCENES = ['chrome', 'hifi', 'studio', 'spectrogram', 'waterfall3d', 'mirror', 'radial', 'particle', 'neon', 'bounce', 'bars3d'];
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

// ── Chrome Sea ─────────────────────────────────────────────────────────
// A height field: across = frequency (bass left), into the screen = time
// (the newest sound at the front, flowing away to the horizon), height =
// loudness. Each pixel traces its sight line onto it; the surface is liquid
// chrome, so it shows the sky reflected - a deep violet gradient, a striped
// synthwave sun on the horizon that swells with the bass, faint stars - with
// a bright sun glint, colour by frequency, glowing crests where it's loud,
// and haze towards the horizon. Every other column is traced and the gaps
// filled from their neighbours (unless they differ), to stay light on the Pi.
const CH_N = 48, CH_M = 40; // bands across x rows into the distance
const SKY_OUT = [0, 0, 0], TR = [0, 0, 0];
const BAND_COL = Array.from({ length: 64 }, (_, i) => hsl(bandHue(i / 63), 1, 0.5));
function sceneChrome(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS;
  if (!st.ch) st.ch = { h: new Float32Array(CH_N * CH_M), acc: 0, bass: 0, img: null, w: 0 };
  const ch = st.ch, hist = ch.h;
  // The front row eases towards the live spectrum (no popping); 30 times a
  // second it's pushed back and a new front row starts.
  if (!ch.live) ch.live = new Float32Array(CH_N);
  // Snaps up with each beat, settles back gently (so it's lively without
  // twitching); quiet bands are pushed down and loud ones up for contrast,
  // and a bass kick throws a ridge right across the sea.
  if (!ch.tgt) ch.tgt = new Float32Array(CH_N);
  for (let i = 0; i < CH_N; i++) ch.tgt[i] = ampAt(ctx.ampArr, ctx.bands, i / (CH_N - 1));
  const up = Math.min(1, dt * 30), down = Math.min(1, dt * 5);
  let lowNow = 0; for (let i = 0; i < 6; i++) lowNow += ch.tgt[i]; lowNow /= 6;
  ch.lowAvg = (ch.lowAvg || lowNow) + (lowNow - (ch.lowAvg || lowNow)) * Math.min(1, dt * 2);
  const kick = Math.max(0, lowNow - ch.lowAvg * 1.15) * 1.6;
  for (let i = 0; i < CH_N; i++) {
    const raw = ch.tgt[i], tv = Math.min(1.2, Math.pow(raw, 1.35) * 1.25 + kick * (1 - i / CH_N * 0.5));
    ch.live[i] += (tv - ch.live[i]) * (tv > ch.live[i] ? up : down);
  }
  ch.acc += dt;
  let bass = 0;
  for (let i = 0; i < 6; i++) bass += ctx.ampArr[i] || 0;
  ch.bass += (bass / 6 - ch.bass) * Math.min(1, dt * 8);
  while (ch.acc > 1 / 30) {
    ch.acc -= 1 / 30;
    hist.copyWithin(CH_N, 0, CH_N * (CH_M - 1)); // row 0 = now; older rows move back
  }
  hist.set(ch.live); // the front row follows the music every frame
  const frac = ch.acc * 30; // smooth scroll between rows
  const asp = W / area;
  // Height at (u across 0..1, v depth 0..1) - bilinear, gently smoothed.
  const hAt = (u, v) => {
    const x = Math.max(0, Math.min(CH_N - 1.001, u * (CH_N - 1))), zz = Math.max(0, Math.min(CH_M - 1.001, v * (CH_M - 1) + frac));
    const xi = x | 0, zi = zz | 0, fx = x - xi, fz = zz - zi, o = zi * CH_N + xi;
    const a = hist[o] + (hist[o + 1] - hist[o]) * fx, b = hist[o + CH_N] + (hist[o + CH_N + 1] - hist[o + CH_N]) * fx;
    return (a + (b - a) * fz) * 0.36 * (1 - 0.3 * v);
  };
  // Camera: low over the front edge, looking towards the horizon.
  const SEA = 3; // how far the sea reaches (to the horizon's haze)
  const camY = 0.42, camZ = -0.2, pitch = -0.24, fov = 1.15, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const sunR = 0.1 + 0.06 * ch.bass; // the sun, on the horizon in the middle
  const SKY_TOP = [0.03, 0.01, 0.09], SKY_MID = [0.28, 0.04, 0.35], SKY_LOW = [0.95, 0.28, 0.32];
  const sky = (dx, dy) => {
    // dy: ray's upward slope; the horizon is dy = 0.
    const k = Math.max(0, Math.min(1, dy * 3.2));
    let r = k < 0.35 ? SKY_LOW[0] + (SKY_MID[0] - SKY_LOW[0]) * (k / 0.35) : SKY_MID[0] + (SKY_TOP[0] - SKY_MID[0]) * ((k - 0.35) / 0.65);
    let g = k < 0.35 ? SKY_LOW[1] + (SKY_MID[1] - SKY_LOW[1]) * (k / 0.35) : SKY_MID[1] + (SKY_TOP[1] - SKY_MID[1]) * ((k - 0.35) / 0.65);
    let b = k < 0.35 ? SKY_LOW[2] + (SKY_MID[2] - SKY_LOW[2]) * (k / 0.35) : SKY_MID[2] + (SKY_TOP[2] - SKY_MID[2]) * ((k - 0.35) / 0.65);
    // The sun: a striped disc (stripes widen towards the bottom), glow round it.
    const sx = dx, sy = dy - 0.05, d = Math.sqrt(sx * sx + sy * sy);
    if (d < sunR) {
      const stripe = sy < 0 ? (Math.sin((sy * 110) + t * 2) > -0.2 + sy * 9 ? 1 : 0) : 1;
      const yy = (sy + sunR) / (2 * sunR);
      if (stripe) { r = 1.0; g = 0.85 - 0.55 * (1 - yy); b = 0.25 - 0.15 * (1 - yy); }
    }
    const glow = Math.exp(-Math.max(0, d - sunR) * 14) * (0.3 + 0.4 * ch.bass);
    r += glow * 1.0; g += glow * 0.35; b += glow * 0.25;
    // Stars, twinkling, high up.
    if (dy > 0.18) { const si = Math.floor((dx + 3) * 90) * 131 + Math.floor(dy * 90); const h2 = Math.sin(si * 12.9898) * 43758.5453 % 1; if (h2 > 0.985) { const tw = 0.5 + 0.5 * Math.sin(t * 3 + si); r += 0.5 * tw; g += 0.5 * tw; b += 0.6 * tw; } }
    SKY_OUT[0] = r; SKY_OUT[1] = g; SKY_OUT[2] = b;
    return SKY_OUT; // reused - no garbage (collector pauses showed as stutter on the Pi)
  };
  if (!ch.img || ch.w !== W * area) { ch.img = new Float32Array(W * area * 3); ch.w = W * area; }
  const img = ch.img;
  // Per-frame caches: the haze colour at the horizon for each column.
  if (!ch.hz || ch.hz.length !== W * 3) ch.hz = new Float32Array(W * 3);
  for (let px = 0; px < W; px++) { const c = sky((px + 0.5 - W / 2) / area * fov, 0.01); ch.hz[px * 3] = c[0]; ch.hz[px * 3 + 1] = c[1]; ch.hz[px * 3 + 2] = c[2]; }
  const HZ = [0, 0, 0], hzCol = (px) => { HZ[0] = ch.hz[px * 3]; HZ[1] = ch.hz[px * 3 + 1]; HZ[2] = ch.hz[px * 3 + 2]; return HZ; };
  const trace = (px, py) => {
    // Screen -> ray (aspect-correct; the sea spans the screen's width).
    const sx = (px + 0.5 - W / 2) / area * fov, sy = (area / 2 - py - 0.5) / area * fov;
    const dyc = sy * cp + sp, dzc = cp - sy * sp; // pitched view
    const dxw = sx / asp; // the sea is 1 wide whatever the wall's width: spread across it
    let tt = 0.02, hit = false, x = 0, y = 0, z = 0;
    for (let i = 0; i < 32; i++) {
      x = 0.5 + dxw * tt; y = camY + dyc * tt; z = camZ + dzc * tt;
      if (z > SEA || x < -0.05 || x > 1.05 || y < -0.05) break;
      const h = hAt(x, Math.max(0, z) / SEA);
      if (y <= h) { // refine between the last two steps
        let lo = tt - 0.04, hi = tt;
        for (let k = 0; k < 4; k++) { const mid = (lo + hi) / 2, ym = camY + dyc * mid, hm = hAt(0.5 + dxw * mid, Math.max(0, camZ + dzc * mid) / SEA); if (ym <= hm) hi = mid; else lo = mid; }
        tt = hi; x = 0.5 + dxw * tt; y = camY + dyc * tt; z = camZ + dzc * tt; hit = true; break;
      }
      tt += 0.014 + tt * 0.055;
    }
    if (!hit) { const s2 = sky(sx, dyc); TR[0] = s2[0]; TR[1] = s2[1]; TR[2] = s2[2]; return TR; }
    // Normal from the height field; reflect the ray into the sky.
    const v = z / SEA, e = 0.012, hx = (hAt(x + e, v) - hAt(x - e, v)) / (2 * e), hzz = (hAt(x, v + e) - hAt(x, v - e)) / (2 * e * SEA);
    let nx = -hx * 2.5, ny = 1, nz = -hzz * 2.5; const nn = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nn; ny /= nn; nz /= nn;
    let rx = dxw, ry = dyc, rz = dzc; const rn = Math.sqrt(rx * rx + ry * ry + rz * rz); rx /= rn; ry /= rn; rz /= rn;
    const dd = rx * nx + ry * ny + rz * nz, ox = rx - 2 * dd * nx, oy = ry - 2 * dd * ny;
    const rf = sky(ox * asp, Math.max(0.0, oy)), rf0 = rf[0], rf1 = rf[1], rf2 = rf[2];
    const fres = 0.35 + 0.65 * Math.pow(1 - Math.max(0, -dd), 4);
    const hgt = hAt(x, v) / 0.36, c = BAND_COL[Math.max(0, Math.min(63, Math.round(x * 63)))];
    const crest = Math.pow(Math.min(1, hgt * 1.3), 3) * 1.3; // loud crests glow in their colour
    const fog = Math.min(1, Math.max(0, (v - 0.35) / 0.65)) ** 1.5, hzc = hzCol(px);
    const tint = 0.25 + 0.75 * Math.min(1, hgt * 1.8);
    // Chrome tinted by the band's colour - deep in the troughs, bright on the crests.
    let r = rf0 * fres * (0.25 + 0.75 * c[0] * tint) + c[0] * crest * 0.7;
    let g = rf1 * fres * (0.25 + 0.75 * c[1] * tint) + c[1] * crest * 0.7;
    let b = rf2 * fres * (0.25 + 0.75 * c[2] * tint) + c[2] * crest * 0.7;
    // Faint neon grid lines across the sea, floating with it.
    const gl = Math.max(0, 1 - Math.abs(((v * CH_M - frac) % 4 + 4) % 4 - 2) * 2.5) * 0.12 * (1 - fog);
    r += gl * 0.4; g += gl * 0.15; b += gl * 0.6;
    TR[0] = r + (hzc[0] - r) * fog; TR[1] = g + (hzc[1] - g) * fog; TR[2] = b + (hzc[2] - b) * fog;
    return TR;
  };
  // The whole picture every frame (half the rows per frame made it judder).
  // To keep it light: trace every other pixel on every other row, then fill
  // the gaps by blending neighbours - except where they differ (an edge, a
  // crest, the sun), where those pixels are traced too.
  const put3 = (o, c) => { img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const near = (a2, b2) => Math.abs(img[a2] - img[b2]) + Math.abs(img[a2 + 1] - img[b2 + 1]) + Math.abs(img[a2 + 2] - img[b2 + 2]) < 0.2;
  for (let py = 0; py < area; py += 2) {
    const row = py * W;
    for (let px = 0; px < W; px += 2) put3((row + px) * 3, trace(px, py));
    for (let px = 1; px < W; px += 2) {
      const o = (row + px) * 3, l = o - 3, r2 = px + 1 < W ? o + 3 : o - 3;
      if (near(l, r2)) { img[o] = (img[l] + img[r2]) / 2; img[o + 1] = (img[l + 1] + img[r2 + 1]) / 2; img[o + 2] = (img[l + 2] + img[r2 + 2]) / 2; } else put3(o, trace(px, py));
    }
  }
  for (let py = 1; py < area; py += 2) {
    const row = py * W, up = (py - 1) * W, dn = (py + 1 < area ? py + 1 : py - 1) * W;
    for (let px = 0; px < W; px++) {
      const o = (row + px) * 3, a2 = (up + px) * 3, b2 = (dn + px) * 3;
      if (near(a2, b2)) { img[o] = (img[a2] + img[b2]) / 2; img[o + 1] = (img[a2 + 1] + img[b2 + 1]) / 2; img[o + 2] = (img[a2 + 2] + img[b2 + 2]) / 2; } else put3(o, trace(px, py));
    }
  }
  for (let py = 0; py < area; py++) for (let px = 0; px < W; px++) { const o = (py * W + px) * 3; core.setWallPixel(px, py, img[o], img[o + 1], img[o + 2]); }
}

const RENDER = { chrome: sceneChrome, hifi: sceneHifi, studio: sceneStudio, spectrogram: sceneSpectrogram, waterfall3d: sceneWaterfall3d, mirror: sceneMirror, radial: sceneRadial, particle: sceneParticle, neon: sceneNeon, bounce: sceneBounce, bars3d: sceneBars3d };

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
  // next one sweeps in across the wall with a soft edge while the old one
  // fades out behind it.
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
  const old = st.tmp, p = k * 1.6 - 0.3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // A soft, slightly wavy edge sweeping from left to right.
    const edge = (x / W) * 0.6 + 0.08 * Math.sin(y * 0.35 + t * 3), m0 = Math.max(0, Math.min(1, (p - edge) / 0.3 + 0.5)), m = m0 * m0 * (3 - 2 * m0);
    const o = (y * W + x) * 3;
    buf[o] = old[o] + (buf[o] - old[o]) * m; buf[o + 1] = old[o + 1] + (buf[o + 1] - old[o + 1]) * m; buf[o + 2] = old[o + 2] + (buf[o + 2] - old[o + 2]) * m;
  }
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
