// Spectrum v2 for the flat panel / wall: clean, easy-to-read graphics.
// Crisp solid shapes on black, smooth colour gradients, anti-aliased edges
// and peak markers that hold and then fall. No trails or particles: a
// first version with glow trails and sparks read as messy on the panel.
//   bars   - wide bars with a gentle floor reflection
//   mirror - bars growing up and down from a centre line, bass in the middle
//   ring   - spokes round a core that swells with the bass
//   wave   - a filled spectrum curve with a bright edge
//   auto   - moves through them, about 25 s each
// The bottom 9 rows are kept clear for the now-playing ticker. Reads the
// shared display levels (ctx.ampArr / ctx.peakArr, see levels.js) and the
// music features (core.audio). y = 0 is the top, as for every wall effect.
// Version 1 is still in spectrumWall.js, chosen with the "Version" option.
'use strict';

const { hsl } = require('../../core');

const SCENES = ['bars', 'mirror', 'ring', 'wave'];
const AUTO_SECS = 25;
const TICKER_ROWS = 9;
const PEAK_HOLD = 0.45, PEAK_FALL = 1.4; // seconds held; screen-heights per second squared

function createV2State() { return { sceneT: 0, peaks: null, hold: null, vel: null, last: null }; }

// Smooth level at f = 0..1 across the bands.
function ampAt(arr, bands, f) {
  const x = Math.max(0, Math.min(1, f)) * (bands - 1), i = Math.floor(x), t = x - i;
  const a = arr[i] || 0, b = arr[Math.min(bands - 1, i + 1)] || 0;
  return a + (b - a) * (t * t * (3 - 2 * t));
}

// Colour by height: deep blue at the floor through cyan and green to a warm
// top - the same ramp in every scene, so levels read at a glance.
function ramp(v, t) {
  return hsl(0.62 - Math.max(0, Math.min(1, v)) * 0.62 + Math.sin(t * 0.1) * 0.03, 0.95, 0.42 + 0.18 * v);
}

function put(core, x, y, c, k) { if (k > 0.004) core.setWallPixel(x, y, c[0] * k, c[1] * k, c[2] * k); }

// Peak markers: jump up with the level, hold, then fall with gravity.
function stepPeaks(st, n, levels, dt) {
  if (!st.peaks || st.peaks.length !== n) { st.peaks = new Float32Array(n); st.hold = new Float32Array(n); st.vel = new Float32Array(n); }
  for (let i = 0; i < n; i++) {
    if (levels[i] >= st.peaks[i]) { st.peaks[i] = levels[i]; st.hold[i] = PEAK_HOLD; st.vel[i] = 0; continue; }
    if (st.hold[i] > 0) { st.hold[i] -= dt; continue; }
    st.vel[i] += PEAK_FALL * dt;
    st.peaks[i] = Math.max(levels[i], st.peaks[i] - st.vel[i] * dt);
  }
}

// One bar from y=base upwards (dir -1) or downwards (dir +1), `h` pixels
// tall with a soft fractional tip.
function bar(core, x0, x1, base, dir, h, maxH, t, dim) {
  const whole = Math.floor(h), frac = h - whole;
  for (let j = 0; j <= whole; j++) {
    const k = (j === whole ? frac : 1) * dim;
    if (k <= 0) continue;
    const c = ramp(j / maxH, t);
    for (let x = x0; x <= x1; x++) put(core, x, base + dir * j, c, k);
  }
}

function levelsFor(ctx, n, mirrored) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = mirrored ? Math.abs((i + 0.5) / n - 0.5) * 2 : i / (n - 1);
    out[i] = ampAt(ctx.ampArr, ctx.bands, f);
  }
  return out;
}

function sceneBars(core, ctx, st, W, H, t, dt) {
  const n = W >= 48 ? 16 : 8, slot = W / n, bw = Math.max(1, Math.round(slot) - 1);
  const floor = H - TICKER_ROWS - 6, maxH = floor - 3; // 5 rows under the floor for the reflection
  const lv = levelsFor(ctx, n, false);
  stepPeaks(st, n, lv, dt);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = x0 + bw - 1, h = lv[i] * maxH;
    bar(core, x0, x1, floor, -1, h, maxH, t, 1);
    bar(core, x0, x1, floor + 1, 1, Math.min(5, h * 0.18), maxH, t, 0.16); // reflection
    const py = Math.round(floor - st.peaks[i] * maxH) - 1;
    for (let x = x0; x <= x1; x++) put(core, x, py, [1, 1, 1], 0.85);
  }
}

function sceneMirror(core, ctx, st, W, H, t, dt) {
  const n = W >= 48 ? 16 : 8, slot = W / n, bw = Math.max(1, Math.round(slot) - 1);
  const area = H - TICKER_ROWS, mid = Math.floor(area / 2), maxH = mid - 3;
  const lv = levelsFor(ctx, n, true);
  stepPeaks(st, n, lv, dt);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot), x1 = x0 + bw - 1, h = lv[i] * maxH;
    bar(core, x0, x1, mid - 1, -1, h, maxH, t, 1);
    bar(core, x0, x1, mid, 1, h, maxH, t, 1);
    const p = Math.round(st.peaks[i] * maxH) + 1;
    for (let x = x0; x <= x1; x++) { put(core, x, mid - 1 - p, [1, 1, 1], 0.8); put(core, x, mid + p, [1, 1, 1], 0.8); }
  }
}

function sceneRing(core, ctx, st, W, H, t, dt) {
  const n = 32, area = H - TICKER_ROWS, cx = (W - 1) / 2, cy = (area - 1) / 2;
  const R = Math.min(W, area) / 2 - 2.5, au = core.audio || {};
  const r0 = R * (0.3 + 0.06 * (au.bass || 0)), span = R - r0;
  const lv = levelsFor(ctx, n, true);
  stepPeaks(st, n, lv, dt);
  const rot = t * 0.15;
  // Core disc, softly lit.
  const coreC = hsl(0.62 + Math.sin(t * 0.1) * 0.03, 0.8, 0.45);
  for (let y = Math.floor(cy - r0); y <= cy + r0; y++) for (let x = Math.floor(cx - r0); x <= cx + r0; x++) {
    const d = Math.hypot(x - cx, y - cy) / (r0 - 1.5);
    if (d < 1) put(core, x, y, coreC, 0.1 + 0.25 * (au.bass || 0) * (1 - d));
  }
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), len = lv[i] * span;
    for (let r = 0; r <= len; r += 0.5) put(core, Math.round(cx + ca * (r0 + r)), Math.round(cy + sa * (r0 + r)), ramp(r / span, t), 1);
    const pr = r0 + st.peaks[i] * span + 1.5;
    put(core, Math.round(cx + ca * pr), Math.round(cy + sa * pr), [1, 1, 1], 0.8);
  }
}

function sceneWave(core, ctx, st, W, H, t, dt) {
  const floor = H - TICKER_ROWS - 1, maxH = floor - 2;
  const lv = levelsFor(ctx, W, false);
  for (let x = 0; x < W; x++) {
    const h = lv[x] * maxH, top = floor - h, whole = Math.floor(h);
    // Fill: dim gradient, so the bright edge carries the shape.
    for (let j = 0; j < whole; j++) put(core, x, floor - j, ramp(j / maxH, t), 0.18 + 0.3 * (j / Math.max(1, h)));
    // Edge: anti-aliased across the two pixels the curve sits between.
    const ty = Math.floor(top), f = top - ty, c = ramp(h / maxH, t);
    put(core, x, ty, [Math.min(1, c[0] + 0.35), Math.min(1, c[1] + 0.35), Math.min(1, c[2] + 0.35)], 1 - f);
    put(core, x, ty + 1, [Math.min(1, c[0] + 0.35), Math.min(1, c[1] + 0.35), Math.min(1, c[2] + 0.35)], f + 0.4);
  }
}

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') { st.sceneT += dt; name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length]; }
  if (st.last !== name) { st.last = name; st.peaks = null; }
  if (name === 'bars') sceneBars(core, ctx, st, W, H, t, dt);
  else if (name === 'mirror') sceneMirror(core, ctx, st, W, H, t, dt);
  else if (name === 'ring') sceneRing(core, ctx, st, W, H, t, dt);
  else sceneWave(core, ctx, st, W, H, t, dt);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
