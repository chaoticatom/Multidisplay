// Spectrum v2 for the flat panel / wall: the music as little illustrated
// 3D scenes instead of bar charts.
//   city    - a night skyline: each building is a frequency band, its
//             windows light floor by floor with the level, antenna lights
//             blink on the peaks and the moon swells with the bass
//   blocks  - an isometric landscape of shaded blocks: the newest spectrum
//             at the front, older rows rolling back into the distance
//   tubes   - glass tubes of glowing liquid with rising bubbles, the
//             liquid sloshing up with each band
//   planet  - a lit, banded planet with a tilted ring; the spectrum is a
//             corona of flares round its edge
//   auto    - moves through them, about 25 s each
// Crisp shapes on black, shaded faces, no trails. The bottom 9 rows are
// kept clear for the now-playing ticker. Reads the shared display levels
// (ctx.ampArr, see levels.js) and the music features (core.audio).
// y = 0 is the top, as for every wall effect. Version 1 is still in
// spectrumWall.js, chosen with the "Version" option.
'use strict';

const { hsl } = require('../../core');

const SCENES = ['city', 'blocks', 'tubes', 'planet'];
const AUTO_SECS = 25;
const TICKER_ROWS = 9;

function createV2State() { return { sceneT: 0, last: null, hist: [], histT: 0, smooth: null, peaks: null, hold: null }; }

function ampAt(arr, bands, f) {
  const x = Math.max(0, Math.min(1, f)) * (bands - 1), i = Math.floor(x), t = x - i;
  const a = arr[i] || 0, b = arr[Math.min(bands - 1, i + 1)] || 0;
  return a + (b - a) * (t * t * (3 - 2 * t));
}
// n levels across the spectrum, eased so shapes move smoothly.
function levels(ctx, st, n, dt) {
  if (!st.smooth || st.smooth.length !== n) st.smooth = new Float32Array(n);
  const k = 1 - Math.exp(-dt * 14);
  for (let i = 0; i < n; i++) st.smooth[i] += (ampAt(ctx.ampArr, ctx.bands, i / (n - 1)) - st.smooth[i]) * k;
  return st.smooth;
}
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function put(core, x, y, c, k = 1) { if (k > 0.004) core.setWallPixel(Math.round(x), Math.round(y), c[0] * k, c[1] * k, c[2] * k); }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// ── City ────────────────────────────────────────────────────────────────
function sceneCity(core, ctx, st, W, H, t, dt) {
  const ground = H - TICKER_ROWS - 1, au = core.audio || {};
  // Sky: deep blue fading to violet at the horizon, with a few stars.
  for (let y = 0; y < ground; y++) {
    const c = mix([0.0, 0.01, 0.05], [0.09, 0.02, 0.12], y / ground);
    for (let x = 0; x < W; x++) put(core, x, y, c);
  }
  for (let s = 0; s < 22; s++) {
    const x = Math.floor(hash(s, 1) * W), y = Math.floor(hash(s, 2) * ground * 0.6), tw = 0.35 + 0.35 * Math.sin(t * (1 + hash(s, 3) * 2) + s);
    put(core, x, y, [0.8, 0.85, 1], tw);
  }
  // Moon, swelling with the bass.
  const mr = 4 + (au.bass || 0) * 2.5, mx = W - 11, my = 9;
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const d = Math.hypot(x, y);
    if (d <= mr) { const crater = hash(x + 40, y + 40) < 0.12 ? 0.82 : 1; put(core, mx + x, my + y, [1, 0.95, 0.75], (0.75 + 0.25 * (1 - d / mr)) * crater); }
    else if (d <= mr + 2.5) put(core, mx + x, my + y, [0.5, 0.45, 0.3], 0.25 * (1 - (d - mr) / 2.5));
  }
  // Buildings: one per band, steady widths and roof styles.
  const n = 12, lv = levels(ctx, st, n, dt), maxH = ground - 6;
  let x = 0;
  for (let i = 0; i < n && x < W; i++) {
    const w = 4 + Math.floor(hash(i, 7) * 3), h = Math.round(maxH * (0.45 + hash(i, 8) * 0.5));
    const top = ground - h, lit = lv[i];
    const wall = hsl(0.66 + hash(i, 9) * 0.1, 0.35, 0.09 + hash(i, 10) * 0.05);
    for (let yy = top; yy < ground; yy++) for (let xx = x; xx < x + w && xx < W; xx++) put(core, xx, yy, wall);
    // Windows light from the ground up with the band's level.
    const floors = Math.floor((h - 2) / 2), on = Math.round(lit * floors * 1.15);
    for (let f = 0; f < floors; f++) for (let c = 0; c < Math.floor((w - 1) / 2); c++) {
      const wx = x + 1 + c * 2, wy = ground - 2 - f * 2;
      if (wx >= W) continue;
      const warm = hash(i * 31 + c, f) < 0.5 ? [1, 0.78, 0.35] : [0.55, 0.85, 1];
      if (f < on) put(core, wx, wy, warm, 0.6 + 0.4 * (f / Math.max(1, on)));
      else put(core, wx, wy, [0.15, 0.17, 0.25], 0.5);
    }
    // Antenna light on top: bright on a loud band.
    const ax = x + Math.floor(w / 2);
    put(core, ax, top - 1, [0.4, 0.4, 0.45]); put(core, ax, top - 2, [0.4, 0.4, 0.45]);
    put(core, ax, top - 3, [1, 0.15, 0.1], lit > 0.6 ? 1 : 0.18 + 0.2 * Math.max(0, Math.sin(t * 2 + i)));
    x += w + 1;
  }
  // Water line.
  for (let xx = 0; xx < W; xx++) put(core, xx, ground, [0.12, 0.1, 0.25]);
}

// ── Blocks (isometric) ──────────────────────────────────────────────────
function prism(core, cx, baseY, h, colTop, colL, colR, W) {
  // A 6-pixel-wide isometric column: diamond top, two shaded sides.
  const cy = baseY - h;
  for (let dx = -3; dx <= 2; dx++) {
    const x = cx + dx; if (x < 0 || x >= W) continue;
    const a = Math.abs(dx + 0.5), tTop = Math.round(cy - 1.5 + a * 0.5), tBot = Math.round(cy + 1.5 - a * 0.5);
    const sBot = Math.round(baseY + 1.5 - a * 0.5);
    for (let y = tTop; y <= tBot; y++) put(core, x, y, colTop);
    const side = dx < 0 ? colL : colR;
    for (let y = tBot + 1; y <= sBot; y++) put(core, x, y, side, 1 - 0.35 * (y - tBot) / Math.max(1, sBot - tBot));
  }
}
function sceneBlocks(core, ctx, st, W, H, t, dt) {
  const N = 9, ROWS = 9, area = H - TICKER_ROWS;
  const lv = levels(ctx, st, N, dt);
  st.histT += dt;
  if (st.histT > 0.12 || !st.hist.length) { st.histT = 0; st.hist.unshift(Float32Array.from(lv)); if (st.hist.length > ROWS) st.hist.pop(); }
  st.hist[0] = Float32Array.from(lv); // the front row is live
  const ox = Math.floor(W / 2), oy = Math.round(area * 0.3), maxH = area * 0.28;
  // Back to front: rows with a smaller c+r sit further away.
  for (let s = 0; s <= N + ROWS - 2; s++) {
    for (let c = 0; c < N; c++) {
      const r = s - c; if (r < 0 || r >= ROWS) continue;
      const age = ROWS - 1 - r, row = st.hist[age]; if (!row) continue;
      const h = 1 + row[c] * maxH * (1 - age * 0.06);
      const hue = 0.62 - (c / (N - 1)) * 0.62, fade = 1 - age * 0.08;
      const top = hsl(hue, 0.85, 0.55 + 0.15 * row[c]);
      prism(core, ox + (c - r) * 3, oy + (c + r) * 1.5 + 6, h, top.map((v) => v * fade), hsl(hue, 0.85, 0.32).map((v) => v * fade), hsl(hue, 0.85, 0.18).map((v) => v * fade), W);
    }
  }
}

// ── Tubes ───────────────────────────────────────────────────────────────
function sceneTubes(core, ctx, st, W, H, t, dt) {
  const n = 8, lv = levels(ctx, st, n, dt), bottom = H - TICKER_ROWS - 2, topY = 3, inner = bottom - topY - 1;
  const slot = W / n, tw = Math.max(4, Math.floor(slot) - 2);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(i * slot + (slot - tw) / 2), x1 = x0 + tw - 1;
    const hue = 0.62 - (i / (n - 1)) * 0.62, liquid = hsl(hue, 0.95, 0.5), glow = hsl(hue, 0.6, 0.8);
    // Glass: thin outline with a highlight down the left side.
    for (let y = topY; y <= bottom; y++) { put(core, x0 - 1, y, [0.35, 0.4, 0.5], 0.5); put(core, x1 + 1, y, [0.35, 0.4, 0.5], 0.35); }
    for (let x = x0; x <= x1; x++) put(core, x, bottom + 1, [0.35, 0.4, 0.5], 0.5);
    put(core, x0 - 1, topY - 1, [0.6, 0.65, 0.75], 0.5); put(core, x1 + 1, topY - 1, [0.6, 0.65, 0.75], 0.5);
    // Liquid with a sloshing surface.
    const level = lv[i] * inner;
    for (let x = x0; x <= x1; x++) {
      const slosh = Math.sin(t * 5 + i * 1.3 + (x - x0) * 0.9) * 0.6 * lv[i];
      const surf = bottom - level - slosh;
      for (let y = bottom; y > surf; y--) put(core, x, y, liquid, 0.55 + 0.35 * ((bottom - y) / Math.max(1, level)));
      put(core, x, Math.floor(surf), glow, 0.9);
    }
    // Bubbles rising through the liquid, faster when it's loud.
    for (let b = 0; b < 3; b++) {
      const speed = 6 + lv[i] * 14, ph = (t * speed + hash(i, b) * 40) % Math.max(1, level);
      const by = bottom - ph, bx = x0 + 1 + Math.floor(hash(i, b + 9) * (tw - 2));
      if (level > 3 && by > bottom - level + 1) put(core, bx, by, [1, 1, 1], 0.55);
    }
    put(core, x0, topY + 2, [1, 1, 1], 0.25); // glass glint
  }
}

// ── Planet ──────────────────────────────────────────────────────────────
function scenePlanet(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, cx = (W - 1) / 2, cy = (area - 1) / 2, au = core.audio || {};
  const R = Math.min(W, area) * 0.25, n = 64, lv = levels(ctx, st, n, dt);
  // Starfield behind.
  for (let s = 0; s < 30; s++) put(core, hash(s, 11) * W, hash(s, 12) * area, [0.7, 0.8, 1], 0.2 + 0.25 * Math.sin(t + s));
  const tilt = 0.3, ringA = R * 1.75, ringB = ringA * tilt;
  // The ring is the spectrum: its dots lift with their band (bass at the
  // front and back, treble at the sides), coloured from blue to orange.
  const ringPx = (front) => {
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2, sy = Math.sin(a);
      if ((sy > 0) !== front) continue;
      const lvl = ampAt(lv, n, Math.abs(Math.cos(a))), lift = lvl * R * 0.55;
      const x = cx + Math.cos(a) * ringA, y = cy + sy * ringB - lift;
      const c = hsl(0.62 - lvl * 0.55, 0.9, 0.55);
      put(core, x, y, c, 0.55 + 0.45 * lvl);
      if (lift > 1.5) put(core, x, cy + sy * ringB, c, 0.18); // its resting place on the ring
    }
  };
  ringPx(false);
  // Planet: lit from the upper left, bands drifting, brighter on the beat.
  const lx = -0.55, ly = -0.45, lz = 0.7;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    const u = (x - cx) / R, v = (y - cy) / R, d2 = u * u + v * v; if (d2 > 1) continue;
    const z = Math.sqrt(1 - d2), lam = Math.max(0, u * lx + v * ly + z * lz);
    const lat = v + Math.sin(u * 3 + t * 0.4) * 0.06, bandsK = 0.5 + 0.5 * Math.sin(lat * 9 + t * 0.2);
    const c = mix(hsl(0.58, 0.6, 0.35), hsl(0.07, 0.7, 0.5), bandsK);
    const k = 0.08 + lam * (0.9 + 0.25 * (au.beat || 0)) + Math.pow(1 - z, 4) * 0.25;
    put(core, x, y, c, Math.min(1.2, k));
  }
  ringPx(true);
}

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') { st.sceneT += dt; name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length]; }
  if (st.last !== name) { st.last = name; st.hist = []; st.smooth = null; }
  if (name === 'city') sceneCity(core, ctx, st, W, H, t, dt);
  else if (name === 'blocks') sceneBlocks(core, ctx, st, W, H, t, dt);
  else if (name === 'tubes') sceneTubes(core, ctx, st, W, H, t, dt);
  else scenePlanet(core, ctx, st, W, H, t, dt);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
