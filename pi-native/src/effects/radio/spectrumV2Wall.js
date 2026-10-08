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
//   ocean   - layered moonlit waves; bass rolls at one end, treble chops
//             at the other
//   fireworks - rockets launch on the beats and burst in each band's colour
//   monitor - a heart monitor: a glowing trace that spikes on every beat,
//             with the beats per minute
//   auto    - moves through them, about 25 s each
// Crisp shapes on black, shaded faces, no trails. The bottom 9 rows are
// kept clear for the now-playing ticker. Reads the shared display levels
// (ctx.ampArr, see levels.js) and the music features (core.audio).
// y = 0 is the top, as for every wall effect. Version 1 is still in
// spectrumWall.js, chosen with the "Version" option.
'use strict';

const { hsl } = require('../../core');

const SCENES = ['city', 'blocks', 'tubes', 'planet', 'ocean', 'fireworks', 'monitor'];
const { FONT_3x5, drawString } = require('../text');
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
  for (let s = 0; s < Math.max(22, Math.round(W / 3)); s++) {
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
  const n = Math.max(12, Math.ceil(W / 5.5)), lv = levels(ctx, st, n, dt), maxH = ground - 6; // enough buildings to fill a wide wall
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
  // A single panel gets the isometric view; a wide wall gets a front-on
  // landscape that runs its whole width (isometric would only grow taller).
  const wide = W > H * 1.5, ROWS = 9, area = H - TICKER_ROWS;
  const N = wide ? Math.max(9, Math.min(160, Math.floor((W - ROWS * 2 - 4) / 4))) : 9;
  const lv = levels(ctx, st, N, dt);
  if (st.hist.length && st.hist[0].length !== N) st.hist = [];
  st.histT += dt;
  if (st.histT > 0.12 || !st.hist.length) { st.histT = 0; st.hist.unshift(Float32Array.from(lv)); if (st.hist.length > ROWS) st.hist.pop(); }
  st.hist[0] = Float32Array.from(lv); // the front row is live
  const draw = (c, r, x, baseY, maxH) => {
    const age = ROWS - 1 - r, row = st.hist[age]; if (!row) return;
    const h = 1 + row[c] * maxH * (1 - age * 0.06);
    const hue = 0.62 - (c / (N - 1)) * 0.62, fade = 1 - age * 0.08;
    const top = hsl(hue, 0.85, 0.55 + 0.15 * row[c]);
    prism(core, x, baseY, h, top.map((v) => v * fade), hsl(hue, 0.85, 0.32).map((v) => v * fade), hsl(hue, 0.85, 0.18).map((v) => v * fade), W);
  };
  if (wide) {
    // Back rows first, each a little higher and to the right.
    const maxH = area * 0.45, front = area - 4, x0 = 4;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < N; c++) draw(c, r, x0 + c * 4 + (ROWS - 1 - r) * 2, front - (ROWS - 1 - r) * 2.2, maxH);
    return;
  }
  const ox = Math.floor(W / 2), oy = Math.round(area * 0.3), maxH = area * 0.28;
  // Back to front: rows with a smaller c+r sit further away.
  for (let s2 = 0; s2 <= N + ROWS - 2; s2++) {
    for (let c = 0; c < N; c++) {
      const r = s2 - c; if (r < 0 || r >= ROWS) continue;
      draw(c, r, ox + (c - r) * 3, oy + (c + r) * 1.5 + 6, maxH);
    }
  }
}

// ── Tubes ───────────────────────────────────────────────────────────────
function sceneTubes(core, ctx, st, W, H, t, dt) {
  const n = Math.max(8, Math.min(48, Math.round(W / 8))), lv = levels(ctx, st, n, dt), bottom = H - TICKER_ROWS - 2, topY = 3, inner = bottom - topY - 1;
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
  for (let s = 0; s < Math.max(30, Math.round(W / 2)); s++) put(core, hash(s, 11) * W, hash(s, 12) * area, [0.7, 0.8, 1], 0.2 + 0.25 * Math.sin(t + s));
  const ringA = Math.max(R * 1.75, W * 0.46), tilt = Math.min(0.3, (R * 0.55) / ringA * 1.6), ringB = ringA * tilt; // the ring spans a wide wall
  // The ring is the spectrum: its dots lift with their band (bass at the
  // front and back, treble at the sides), coloured from blue to orange.
  const ringPx = (front) => {
    const K = Math.max(160, Math.round(ringA * 5));
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2, sy = Math.sin(a);
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

// ── Ocean ───────────────────────────────────────────────────────────────
function sceneOcean(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(16, Math.round(W / 4)), lv = levels(ctx, st, n, dt);
  for (let y = 0; y < area; y++) { const c = mix([0.0, 0.01, 0.05], [0.04, 0.05, 0.16], y / area); for (let x = 0; x < W; x++) put(core, x, y, c); }
  for (let s2 = 0; s2 < Math.max(20, Math.round(W / 3)); s2++) put(core, hash(s2, 21) * W, hash(s2, 22) * area * 0.4, [0.8, 0.85, 1], 0.25 + 0.25 * Math.sin(t * 1.5 + s2));
  const mx = Math.round(W * 0.78), my = Math.round(area * 0.18), mr = 4;
  for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) if (x * x + y * y <= mr * mr) put(core, mx + x, my + y, [1, 0.96, 0.8], 0.9);
  // Three layers, back to front; each column's swell follows its band.
  const layers = [[0.42, [0.05, 0.12, 0.35], 0.5], [0.58, [0.03, 0.22, 0.45], 0.75], [0.76, [0.02, 0.35, 0.5], 1]];
  layers.forEach(([base, col, depth], L) => {
    const by = area * base;
    for (let x = 0; x < W; x++) {
      const a = ampAt(lv, n, x / (W - 1));
      const y = by - Math.sin(x * (0.12 + L * 0.05) + t * (1.2 + L * 0.5) + L) * (1 + a * 3 * depth) - a * area * 0.16 * depth;
      const top = Math.round(y);
      for (let yy = Math.max(0, top); yy < area; yy++) put(core, x, yy, col, 0.7 + 0.3 * ((yy - top) < 2 ? 1 : 0.6));
      put(core, x, top, a > 0.45 ? [0.85, 0.95, 1] : mix(col, [0.6, 0.85, 1], 0.6), a > 0.45 ? 0.9 : 0.7); // crest, foam on the loud ones
      // Moonlight glinting off the water under the moon.
      if (Math.abs(x - mx) < 3 + L && hash(x, Math.floor(t * 6) + L) < 0.35) put(core, x, top + 1 + L, [1, 0.95, 0.75], 0.6);
    }
  });
}

// ── Fireworks ───────────────────────────────────────────────────────────
function sceneFireworks(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, au = core.audio || {}, n = 8, lv = levels(ctx, st, n, dt);
  if (!st.fw) st.fw = { rockets: [], sparks: [], wait: 0, seed: 7 };
  const fw = st.fw, rnd = () => { fw.seed = (fw.seed * 16807) % 2147483647; return fw.seed / 2147483647; };
  // Launch on a beat, or every so often while the music is loud.
  fw.wait -= dt;
  const level = lv.reduce((a, b) => a + b, 0) / n;
  if (((au.beat || 0) > 0.8 && !fw.latch) || fw.wait <= 0) {
    fw.latch = true; fw.wait = 0.8 - level * 0.5;
    let band = 0; for (let i = 1; i < n; i++) if (lv[i] > lv[band]) band = i;
    for (let k = 0; k < Math.max(1, Math.round(W / 96)); k++) fw.rockets.push({ x: (0.08 + 0.84 * rnd()) * W, y: area, vy: -(area * 1.1 + rnd() * area * 0.4), hue: 0.62 - (band / (n - 1)) * 0.62 + rnd() * 0.7, size: 0.5 + lv[band], burstY: area * (0.15 + rnd() * 0.3) });
  }
  if ((au.beat || 0) < 0.5) fw.latch = false;
  for (let i = fw.rockets.length - 1; i >= 0; i--) {
    const r = fw.rockets[i];
    r.y += r.vy * dt; r.vy += area * 0.9 * dt;
    put(core, r.x, r.y, [1, 0.85, 0.6]); put(core, r.x, r.y + 1, [0.8, 0.4, 0.1], 0.5);
    if (r.y <= r.burstY || r.vy >= 0) {
      const count = Math.round(24 + r.size * 20), speed = area * (0.35 + r.size * 0.25);
      for (let k = 0; k < count; k++) { const a = (k / count) * Math.PI * 2, sp = speed * (0.6 + 0.4 * rnd()); fw.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, hue: r.hue + (rnd() - 0.5) * 0.06, life: 1.6 + rnd() * 0.6, max: 2.2 }); }
      fw.rockets.splice(i, 1);
    }
  }
  if (fw.sparks.length > 900) fw.sparks.splice(0, fw.sparks.length - 900);
  for (let i = fw.sparks.length - 1; i >= 0; i--) {
    const p = fw.sparks[i];
    p.life -= dt; if (p.life <= 0) { fw.sparks.splice(i, 1); continue; }
    p.vx *= Math.pow(0.35, dt); p.vy = p.vy * Math.pow(0.35, dt) + area * 0.35 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y < area) put(core, p.x, p.y, hsl(p.hue, 0.95, 0.55 + 0.35 * (p.life / p.max)), Math.min(1, 0.35 + p.life / 0.8));
  }
}

// ── Monitor ─────────────────────────────────────────────────────────────
// The shape of one heartbeat on the trace (P wave, QRS spike, T wave).
const BEAT_SHAPE = [0, -1, -1.5, -1, 0, 0, 1, -9, 5, 0, 0, -1, -2, -2, -1, 0];
function sceneMonitor(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, au = core.audio || {}, base = Math.round(area * 0.62), lv = levels(ctx, st, 8, dt);
  if (!st.ecg || st.ecg.trace.length !== W) st.ecg = { trace: new Float32Array(W), age: new Float32Array(W).fill(99), x: 0, acc: 0, beat: -1, beats: [], latch: false, lastBeat: 0 };
  const e = st.ecg, level = lv.reduce((a, b) => a + b, 0) / 8;
  // Grid.
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) if (x % 8 === 0 || y % 8 === 0) put(core, x, y, [0, 0.35, 0.18], 0.4);
  // A beat starts a spike; with no beats detected, a steady pulse while music plays.
  const now = t;
  if (((au.beat || 0) > 0.8 && !e.latch) || (now - e.lastBeat > 1.2 && level > 0.15 && !(au.beat > 0))) {
    e.latch = true; e.beat = 0; e.lastBeat = now; e.beats.push(now);
  }
  if ((au.beat || 0) < 0.5) e.latch = false;
  e.beats = e.beats.filter((b) => now - b < 10);
  // Sweep: write the trace at the cursor, about four seconds per screen width (min 64 px/s).
  e.acc += dt * Math.max(64, W / 4);
  while (e.acc >= 1) {
    e.acc -= 1;
    let v = (hash(e.x, Math.floor(now * 20)) - 0.5) * level * 1.2;
    if (e.beat >= 0) { v += BEAT_SHAPE[e.beat] * (0.6 + level * 0.8) * (area / 55); e.beat++; if (e.beat >= BEAT_SHAPE.length) e.beat = -1; }
    e.trace[e.x] = v; e.age[e.x] = 0;
    e.x = (e.x + 1) % W;
  }
  for (let x = 0; x < W; x++) e.age[x] += dt;
  // Trace: bright at the cursor, fading behind it; a gap just ahead.
  let prev = null;
  for (let k = W - 1; k >= 0; k--) {
    const x = (e.x - 1 - k + W * 2) % W, age = e.age[x];
    if (age > 3.8) { prev = null; continue; }
    const y = base + e.trace[x], b = Math.max(0, 1 - age / 4);
    if (prev !== null && Math.abs(prev - y) > 1) { const lo = Math.min(prev, y), hi = Math.max(prev, y); for (let yy = Math.round(lo); yy <= Math.round(hi); yy++) put(core, x, yy, [0.3, 1, 0.5], b); }
    put(core, x, y, [0.45, 1, 0.6], b);
    prev = y;
  }
  put(core, e.x, base + e.trace[(e.x - 1 + W) % W], [1, 1, 1], 1); // the bright head
  // Beats per minute, top right.
  const bpm = e.beats.length > 1 ? Math.round((e.beats.length - 1) / (e.beats[e.beats.length - 1] - e.beats[0]) * 60) : 0;
  const label = (bpm ? bpm : '--') + ' BPM';
  drawString(FONT_3x5, label, W - label.length * 4 - 2, 2, (x, y) => put(core, x, y, [0.45, 1, 0.6], 0.9));
  if (e.beat >= 0 && e.beat < 6) put(core, W - label.length * 4 - 6, 4, [1, 0.2, 0.2], 1); // heart blink
}

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') { st.sceneT += dt; name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length]; }
  if (st.last !== name) { st.last = name; st.hist = []; st.smooth = null; st.fw = null; st.ecg = null; }
  if (name === 'city') sceneCity(core, ctx, st, W, H, t, dt);
  else if (name === 'blocks') sceneBlocks(core, ctx, st, W, H, t, dt);
  else if (name === 'tubes') sceneTubes(core, ctx, st, W, H, t, dt);
  else if (name === 'planet') scenePlanet(core, ctx, st, W, H, t, dt);
  else if (name === 'ocean') sceneOcean(core, ctx, st, W, H, t, dt);
  else if (name === 'fireworks') sceneFireworks(core, ctx, st, W, H, t, dt);
  else sceneMonitor(core, ctx, st, W, H, t, dt);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
