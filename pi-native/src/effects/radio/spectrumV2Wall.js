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
//   sand    - each band pours coloured sand; the music draws dunes that
//             slowly drain away
//   trampoline - balls bounce on the spectrum line; a band that jumps
//             flings the balls above it
//   garden  - a flower per band: stems grow with it, heads bloom on the
//             loud parts and drop petals on the peaks
//   tetris  - each band drops blocks into its columns; full rows clear
//   rain    - rain falls harder where a band is loud, splashes on a
//             puddle, lightning on big beats
//   stars   - a constellation per band: its stars brighten and their lines
//             light up as it plays; shooting stars on the beats
//   auto    - moves through them, about 25 s each
// Crisp shapes on black, shaded faces, no trails. The bottom 9 rows are
// kept clear for the now-playing ticker. Reads the shared display levels
// (ctx.ampArr, see levels.js) and the music features (core.audio).
// y = 0 is the top, as for every wall effect. Version 1 is still in
// spectrumWall.js, chosen with the "Version" option.
'use strict';

const { hsl } = require('../../core');

const SCENES = ['city', 'blocks', 'tubes', 'planet', 'ocean', 'fireworks', 'monitor', 'sand', 'trampoline', 'garden', 'tetris', 'rain', 'stars'];
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
// A patient monitor with three traces, like the real thing:
//   green  - heart: a spike on every beat, the music's own wave in between
//   cyan   - pulse: a smooth wave that swells with the bass
//   yellow - breathing: a slower wave following the treble and loudness
// Each sweeps left to right, bright at the cursor and fading behind it.
const BEAT_SHAPE = [0, -1, -1.5, -1, 0, 0, 1, -9, 5, 0, 0, -1, -2, -2, -1, 0];
function sceneMonitor(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, au = core.audio || {}, lv = levels(ctx, st, 8, dt);
  const level = lv.reduce((a, b) => a + b, 0) / 8, bass = (lv[0] + lv[1]) / 2, treble = (lv[5] + lv[6] + lv[7]) / 3;
  const lane = area / 3, labelW = W >= 96 ? 30 : 0, plotW = W - labelW;
  if (!st.ecg || st.ecg.w !== plotW) {
    st.ecg = { w: plotW, ch: [0, 1, 2].map(() => ({ v: new Float32Array(plotW), age: new Float32Array(plotW).fill(99) })), x: 0, acc: 0, beat: -1, beats: [], latch: false, lastBeat: -9, ph1: 0, ph2: 0, wi: 0 };
  }
  const e = st.ecg;
  for (let y = 0; y < area; y++) for (let x = 0; x < plotW; x++) if (x % 8 === 0 || y % 8 === 0) put(core, x, y, [0, 0.35, 0.18], 0.35);
  // Beats: a detected kick, or a steady pulse when nothing is detected.
  if (((au.beat || 0) > 0.8 && !e.latch) || (t - e.lastBeat > 0.9 && level > 0.12 && !((au.beat || 0) > 0.05))) {
    e.latch = true; e.beat = 0; e.lastBeat = t; e.beats.push(t);
  }
  if ((au.beat || 0) < 0.5) e.latch = false;
  e.beats = e.beats.filter((b) => t - b < 10);
  const wave = ctx.wave && ctx.wave.length ? ctx.wave : null;
  e.acc += dt * Math.max(48, plotW / 3);
  while (e.acc >= 1) {
    e.acc -= 1;
    // Heart: the sound wave (or a little noise) plus the beat shape.
    let h = wave ? wave[(e.wi = (e.wi + 7) % wave.length)] * lane * 0.25 * (0.4 + level) : (hash(e.x, Math.floor(t * 30)) - 0.5) * lane * 0.1 * level;
    if (e.beat >= 0) { h += BEAT_SHAPE[e.beat] * lane * 0.05 * (0.7 + level); e.beat++; if (e.beat >= BEAT_SHAPE.length) e.beat = -1; }
    e.ph1 += 0.11 + bass * 0.12; e.ph2 += 0.035 + treble * 0.05;
    const pulse = -(Math.max(0, Math.sin(e.ph1)) ** 2) * lane * (0.15 + bass * 0.55);
    const breath = -Math.sin(e.ph2) * lane * (0.1 + (treble * 0.5 + level * 0.3) * 0.6);
    [h, pulse, breath].forEach((v, i) => { e.ch[i].v[e.x] = v; e.ch[i].age[e.x] = 0; });
    e.x = (e.x + 1) % plotW;
  }
  const colours = [[0.45, 1, 0.6], [0.35, 0.85, 1], [1, 0.85, 0.3]];
  const bases = [lane * 0.62, lane * 1.75, lane * 2.55];
  e.ch.forEach((c, i) => {
    let prev = null;
    for (let k = plotW - 1; k >= 0; k--) {
      const x = (e.x - 1 - k + plotW * 2) % plotW;
      const age = c.age[x];
      if (age > 2.8) { prev = null; continue; }
      const y = bases[i] + c.v[x], b = Math.max(0.45, 1 - age / 5);
      if (prev !== null && Math.abs(prev - y) > 1) { const lo = Math.min(prev, y), hi = Math.max(prev, y); for (let yy = Math.round(lo); yy <= Math.round(hi); yy++) put(core, x, yy, colours[i], b); }
      put(core, x, y, colours[i], b);
      prev = y;
    }
    for (let x = 0; x < plotW; x++) c.age[x] += dt;
    put(core, e.x, bases[i] + c.v[(e.x - 1 + plotW) % plotW], [1, 1, 1], 1);
  });
  // Readouts: on a wide wall in a column on the right, on one panel tucked in the corners.
  const bpm = e.beats.length > 1 ? Math.round((e.beats.length - 1) / (e.beats[e.beats.length - 1] - e.beats[0]) * 60) : 0;
  const vals = [(bpm || '--') + '', Math.round(bass * 99) + '', Math.round(treble * 99) + ''], names = ['HR', 'BASS', 'TREB'];
  vals.forEach((v, i) => {
    const y = Math.round(bases[i] - lane * 0.45);
    const plot = (x, yy) => put(core, x, yy, colours[i], 0.95);
    if (labelW) { drawString(FONT_3x5, names[i], plotW + 3, y, (x, yy) => put(core, x, yy, colours[i], 0.55)); drawString(FONT_3x5, v, plotW + 3, y + 7, plot); }
    else drawString(FONT_3x5, v, W - v.length * 4 - 1, Math.max(0, y), plot);
  });
  if (e.beat >= 0 && e.beat < 6) put(core, labelW ? W - 3 : 1, Math.round(bases[0] - lane * 0.45) + 1, [1, 0.2, 0.2], 1); // heart blink
}

// ── Sand ────────────────────────────────────────────────────────────────
function sceneSand(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, n = Math.max(8, Math.round(W / 8)), lv = levels(ctx, st, n, dt);
  if (!st.sand || st.sand.w !== W) st.sand = { w: W, g: new Float32Array(W * area), seed: 3 };
  const sd = st.sand, g = sd.g, rnd = () => { sd.seed = (sd.seed * 16807) % 2147483647; return sd.seed / 2147483647; };
  // Pour: each band drops grains over its stretch of the wall, more when loud.
  for (let i = 0; i < n; i++) {
    const count = lv[i] * lv[i] * 3 * dt * 30;
    for (let k = 0; k < count; k++) if (rnd() < count - k) {
      const x = Math.floor((i + rnd()) / n * W);
      if (!g[x]) g[x] = 1 + ((0.62 - (i / (n - 1)) * 0.62 + (rnd() - 0.5) * 0.04 + 1) % 1);
    }
  }
  // Fall: straight down, else slide diagonally (bottom-up so each grain moves once).
  for (let y = area - 2; y >= 0; y--) {
    const dir = (Math.floor(t * 60) + y) & 1 ? 1 : -1;
    for (let xi = 0; xi < W; xi++) {
      const x = dir > 0 ? xi : W - 1 - xi, i = y * W + x, v = g[i]; if (!v) continue;
      const below = i + W;
      if (!g[below]) { g[below] = v; g[i] = 0; continue; }
      const a = x + dir, b = x - dir;
      if (a >= 0 && a < W && !g[below + dir]) { g[below + dir] = v; g[i] = 0; }
      else if (b >= 0 && b < W && !g[below - dir]) { g[below - dir] = v; g[i] = 0; }
    }
  }
  // Drain: the bottom row slowly empties, faster as the pile grows.
  let filled = 0; for (let i = 0; i < g.length; i++) if (g[i]) filled++;
  const drain = 0.02 + (filled / g.length) * 0.7;
  for (let x = 0; x < W; x++) if (rnd() < drain) g[(area - 1) * W + x] = 0;
  for (let y = 0; y < area; y++) for (let x = 0; x < W; x++) {
    const v = g[y * W + x]; if (!v) continue;
    put(core, x, y, hsl(v - 1, 0.75, 0.42 + 0.12 * hash(x, y)));
  }
}

// ── Trampoline ──────────────────────────────────────────────────────────
function sceneTrampoline(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, floor = area - 2, maxH = area * 0.6, lv = levels(ctx, st, Math.max(16, Math.round(W / 4)), dt), n = lv.length;
  const curve = (x) => floor - ampAt(lv, n, x / (W - 1)) * maxH;
  if (!st.tramp || st.tramp.w !== W) {
    const balls = [];
    for (let k = 0; k < Math.max(5, Math.round(W / 14)); k++) balls.push({ x: (k + 0.5) / Math.max(5, Math.round(W / 14)) * W, y: area * 0.3, vx: (hash(k, 1) - 0.5) * 20, vy: 0, hue: hash(k, 2) });
    st.tramp = { w: W, balls, prev: new Float32Array(W) };
    for (let x = 0; x < W; x++) st.tramp.prev[x] = curve(x);
  }
  const tr = st.tramp;
  // The line: a soft gradient under it, a bright edge on top.
  for (let x = 0; x < W; x++) {
    const y = curve(x), c = hsl(0.62 - (x / (W - 1)) * 0.62, 0.9, 0.55);
    for (let yy = Math.ceil(y) + 1; yy <= floor; yy++) put(core, x, yy, c, 0.12 * (1 - (yy - y) / (floor - y + 1)));
    put(core, x, y, c, 1);
  }
  for (const b of tr.balls) {
    b.vy += area * 2.2 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 1) { b.x = 1; b.vx = Math.abs(b.vx); } if (b.x > W - 2) { b.x = W - 2; b.vx = -Math.abs(b.vx); }
    const xi = Math.max(0, Math.min(W - 1, Math.round(b.x))), cy = curve(xi);
    if (b.y >= cy - 1.5) {
      const rise = Math.max(0, (tr.prev[xi] - cy) / Math.max(dt, 1e-3)); // the line moving up kicks the ball
      b.y = cy - 1.5;
      b.vy = -Math.max(Math.abs(b.vy) * 0.72, area * 0.6) - rise * 0.9;
      const slope = curve(Math.min(W - 1, xi + 2)) - curve(Math.max(0, xi - 2));
      b.vx = Math.max(-60, Math.min(60, b.vx - slope * 3));
    }
    if (b.y < 1) { b.y = 1; b.vy = Math.abs(b.vy) * 0.5; }
    const c = hsl(b.hue, 0.8, 0.6);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) put(core, b.x + xx, b.y + yy, c, xx && yy ? 0.45 : 1);
    put(core, b.x - 0.5, b.y - 0.7, [1, 1, 1], 0.8); // highlight
  }
  for (let x = 0; x < W; x++) tr.prev[x] = curve(x);
}

// ── Garden ──────────────────────────────────────────────────────────────
function sceneGarden(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, ground = area - 3, n = Math.max(6, Math.round(W / 9)), lv = levels(ctx, st, n, dt);
  if (!st.garden || st.garden.n !== n) st.garden = { n, petals: [], seed: 11 };
  const gd = st.garden, rnd = () => { gd.seed = (gd.seed * 16807) % 2147483647; return gd.seed / 2147483647; };
  for (let y = 0; y < ground; y++) { const c = mix([0.01, 0.02, 0.07], [0.05, 0.03, 0.12], y / ground); for (let x = 0; x < W; x++) put(core, x, y, c); }
  for (let y = ground; y < area; y++) for (let x = 0; x < W; x++) put(core, x, y, [0.05, 0.22 - (y - ground) * 0.04, 0.06]);
  for (let i = 0; i < n; i++) {
    const a = lv[i], x = Math.round((i + 0.5) / n * W) + Math.round(Math.sin(t * 0.8 + i) * 0.6);
    const h = Math.round(4 + a * (ground - 10)), top = ground - h, hue = (0.95 + hash(i, 4) * 0.35) % 1;
    for (let y = ground - 1; y > top; y--) put(core, x + Math.round(Math.sin((ground - y) * 0.25 + t + i) * 0.4), y, [0.15, 0.6, 0.18], 0.9);
    if (h > 8) { put(core, x - 1, ground - Math.round(h * 0.4), [0.2, 0.7, 0.2], 0.9); put(core, x + 1, ground - Math.round(h * 0.6), [0.2, 0.7, 0.2], 0.9); }
    // Head: petals open wider when the band is loud.
    const r = 1.5 + a * 2.8, pc = hsl(hue, 0.85, 0.55 + 0.15 * a);
    for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI * 2 + t * 0.3; put(core, x + Math.cos(an) * r, top + Math.sin(an) * r, pc); }
    put(core, x, top, [1, 0.85, 0.2]);
    if (a > 0.7 && rnd() < dt * 4) gd.petals.push({ x, y: top, vx: (rnd() - 0.3) * 8, hue, life: 3 });
  }
  if (gd.petals.length > 200) gd.petals.splice(0, gd.petals.length - 200);
  for (let i = gd.petals.length - 1; i >= 0; i--) {
    const p = gd.petals[i];
    p.life -= dt; p.y += 6 * dt; p.x += (p.vx + Math.sin(t * 2 + i) * 4) * dt;
    if (p.life <= 0 || p.y >= ground) { gd.petals.splice(i, 1); continue; }
    put(core, p.x, p.y, hsl(p.hue, 0.8, 0.6), Math.min(1, p.life));
  }
}

// ── Tetris ──────────────────────────────────────────────────────────────
function sceneTetris(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, C = 4, cols = Math.floor(W / C), rows = Math.floor(area / C), ox = Math.floor((W - cols * C) / 2), oy = area - rows * C;
  const n = Math.max(4, Math.min(cols, Math.round(cols / 3))), lv = levels(ctx, st, n, dt);
  if (!st.tet || st.tet.cols !== cols) st.tet = { cols, rows, grid: new Float32Array(cols * rows), falling: [], step: 0, flash: [], seed: 5 };
  const tg = st.tet, g = tg.grid, rnd = () => { tg.seed = (tg.seed * 16807) % 2147483647; return tg.seed / 2147483647; };
  const at = (c, r) => (r < 0 ? 0 : g[r * cols + c]);
  // Spawn: each band drops pieces (1-3 cells wide) over its columns.
  for (let i = 0; i < n; i++) if (rnd() < lv[i] * lv[i] * dt * 6) {
    const w = 1 + Math.floor(rnd() * Math.min(3, Math.ceil(cols / n))), c0 = Math.min(cols - w, Math.floor((i + rnd()) / n * cols));
    if (!tg.falling.some((p) => p.r < 2 && p.c < c0 + w && c0 < p.c + p.w)) tg.falling.push({ c: c0, w, r: -1, hue: 0.62 - (i / (n - 1)) * 0.62 });
  }
  // Fall one row at a time, faster when the music is loud.
  tg.step += dt * (6 + lv.reduce((a, b) => a + b, 0) / n * 14);
  while (tg.step >= 1) {
    tg.step -= 1;
    for (let k = tg.falling.length - 1; k >= 0; k--) {
      const p = tg.falling[k];
      let blocked = p.r + 1 >= rows;
      for (let c = p.c; c < p.c + p.w && !blocked; c++) if (at(c, p.r + 1)) blocked = true;
      if (!blocked) { p.r++; continue; }
      if (p.r < 0) { g.fill(0); tg.falling = []; break; } // reached the top: sweep it all away
      for (let c = p.c; c < p.c + p.w; c++) g[p.r * cols + c] = 1 + p.hue;
      tg.falling.splice(k, 1);
    }
    // Full rows flash, then clear and the stack drops.
    for (let r = rows - 1; r >= 0; r--) {
      let full = true; for (let c = 0; c < cols; c++) if (!g[r * cols + c]) { full = false; break; }
      if (full) { tg.flash.push({ r, life: 0.25 }); g.copyWithin(cols, 0, r * cols); g.fill(0, 0, cols); r++; }
    }
  }
  const cell = (c, r, col, k) => { for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) put(core, ox + c * C + x, oy + r * C + y, col, k * (x === C - 1 || y === C - 1 ? 0.45 : x === 0 || y === 0 ? 1.15 : 0.9)); };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = g[r * cols + c]; if (v) cell(c, r, hsl(v - 1, 0.85, 0.5), 1); }
  for (const p of tg.falling) for (let c = p.c; c < p.c + p.w; c++) if (p.r >= 0) cell(c, p.r, hsl(p.hue, 0.9, 0.6), 1);
  for (let k = tg.flash.length - 1; k >= 0; k--) {
    const f = tg.flash[k]; f.life -= dt; if (f.life <= 0) { tg.flash.splice(k, 1); continue; }
    for (let x = 0; x < cols * C; x++) for (let y = 0; y < C; y++) put(core, ox + x, oy + f.r * C + y, [1, 1, 1], f.life * 4);
  }
}

// ── Rain ────────────────────────────────────────────────────────────────
function sceneRain(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, puddle = area - 3, au = core.audio || {}, n = Math.max(8, Math.round(W / 8)), lv = levels(ctx, st, n, dt);
  if (!st.rain) st.rain = { drops: [], splash: [], bolt: null, flash: 0, seed: 9, latch: false };
  const rn = st.rain, rnd = () => { rn.seed = (rn.seed * 16807) % 2147483647; return rn.seed / 2147483647; };
  const level = lv.reduce((a, b) => a + b, 0) / n;
  // Lightning on a big beat.
  if ((au.beat || 0) > 0.85 && !rn.latch && level > 0.35) {
    rn.latch = true; rn.flash = 1;
    const pts = []; let x = rnd() * W; for (let y = 0; y < puddle; y += 2) { x += (rnd() - 0.5) * 5; pts.push([x, y]); }
    rn.bolt = { pts, life: 0.25 };
  }
  if ((au.beat || 0) < 0.5) rn.latch = false;
  rn.flash = Math.max(0, rn.flash - dt * 4);
  for (let y = 0; y < puddle; y++) { const c = mix([0.01, 0.02, 0.06], [0.03, 0.05, 0.1], y / puddle); for (let x = 0; x < W; x++) put(core, x, y, mix(c, [0.5, 0.55, 0.7], rn.flash * 0.5)); }
  for (let y = puddle; y < area; y++) for (let x = 0; x < W; x++) put(core, x, y, [0.04, 0.07, 0.14], 1);
  if (rn.bolt) { rn.bolt.life -= dt; if (rn.bolt.life <= 0) rn.bolt = null; else for (let k = 1; k < rn.bolt.pts.length; k++) line(core, rn.bolt.pts[k - 1], rn.bolt.pts[k], [0.85, 0.9, 1], 1); }
  for (let i = 0; i < n; i++) {
    const count = (0.15 + lv[i] * 2.5) * dt * 20;
    for (let k = 0; k < count; k++) if (rnd() < count - k) rn.drops.push({ x: (i + rnd()) / n * W, y: -rnd() * 6, v: area * (1.6 + lv[i] * 1.2), b: 0.4 + lv[i] * 0.6 });
  }
  if (rn.drops.length > 1500) rn.drops.splice(0, rn.drops.length - 1500);
  for (let k = rn.drops.length - 1; k >= 0; k--) {
    const d = rn.drops[k]; d.y += d.v * dt; d.x -= 3 * dt;
    if (d.y >= puddle) { rn.drops.splice(k, 1); rn.splash.push({ x: d.x, r: 0, life: 0.4, b: d.b }); continue; }
    put(core, d.x, d.y, [0.55, 0.7, 1], d.b * 0.8); put(core, d.x, d.y - 1, [0.4, 0.5, 0.8], d.b * 0.4);
  }
  if (rn.splash.length > 400) rn.splash.splice(0, rn.splash.length - 400);
  for (let k = rn.splash.length - 1; k >= 0; k--) {
    const s2 = rn.splash[k]; s2.life -= dt; s2.r += dt * 8; if (s2.life <= 0) { rn.splash.splice(k, 1); continue; }
    const kk = s2.life / 0.4 * s2.b;
    put(core, s2.x - s2.r, puddle + 1, [0.6, 0.75, 1], kk); put(core, s2.x + s2.r, puddle + 1, [0.6, 0.75, 1], kk);
    if (s2.r < 1.5) put(core, s2.x, puddle - 1, [0.7, 0.85, 1], kk);
  }
}
function line(core, a, b, col, k) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let i = 0; i <= steps; i++) put(core, a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps, col, k);
}

// ── Constellations ──────────────────────────────────────────────────────
function sceneStars(core, ctx, st, W, H, t, dt) {
  const area = H - TICKER_ROWS, au = core.audio || {}, n = Math.max(5, Math.min(24, Math.round(W / 16))), lv = levels(ctx, st, n, dt);
  if (!st.sky) st.sky = { shoot: [], latch: false };
  const sk = st.sky;
  for (let s2 = 0; s2 < Math.max(40, Math.round(W / 1.5)); s2++) put(core, hash(s2, 31) * W, hash(s2, 32) * area, [0.6, 0.65, 0.9], 0.12 + 0.12 * Math.sin(t * (0.5 + hash(s2, 33)) + s2));
  for (let i = 0; i < n; i++) {
    // Each band's constellation: 4-6 stars in its own patch of sky.
    const cx = (i + 0.5) / n * W, cw = W / n, a = lv[i], hue = 0.62 - (i / (n - 1)) * 0.62, cnt = 4 + Math.floor(hash(i, 40) * 3), pts = [];
    for (let k = 0; k < cnt; k++) pts.push([cx + (hash(i, 41 + k) - 0.5) * cw * 0.8, area * (0.12 + hash(i, 51 + k) * 0.76)]);
    if (a > 0.25) for (let k = 1; k < cnt; k++) line(core, pts[k - 1], pts[k], hsl(hue, 0.6, 0.55), (a - 0.25) * 0.9);
    pts.forEach((p, k) => {
      const b = 0.25 + a * 0.75 * (k === 0 ? 1.2 : 1), c = hsl(hue, 0.4, 0.75);
      put(core, p[0], p[1], c, b);
      if (a > 0.55) { put(core, p[0] + 1, p[1], c, b * 0.35); put(core, p[0] - 1, p[1], c, b * 0.35); put(core, p[0], p[1] + 1, c, b * 0.35); put(core, p[0], p[1] - 1, c, b * 0.35); }
    });
  }
  if ((au.beat || 0) > 0.85 && !sk.latch) { sk.latch = true; sk.shoot.push({ x: hash(Math.floor(t * 7), 60) * W, y: hash(Math.floor(t * 7), 61) * area * 0.4, life: 0.6 }); }
  if ((au.beat || 0) < 0.5) sk.latch = false;
  for (let k = sk.shoot.length - 1; k >= 0; k--) {
    const s2 = sk.shoot[k]; s2.life -= dt; s2.x += 60 * dt; s2.y += 20 * dt; if (s2.life <= 0) { sk.shoot.splice(k, 1); continue; }
    for (let j = 0; j < 8; j++) put(core, s2.x - j * 1.5, s2.y - j * 0.5, [1, 1, 0.9], s2.life / 0.6 * (1 - j / 8));
  }
}

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') { st.sceneT += dt; name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length]; }
  if (st.last !== name) { st.last = name; st.hist = []; st.smooth = null; st.fw = null; st.ecg = null; st.sand = null; st.tramp = null; st.garden = null; st.tet = null; st.rain = null; st.sky = null; }
  if (name === 'city') sceneCity(core, ctx, st, W, H, t, dt);
  else if (name === 'blocks') sceneBlocks(core, ctx, st, W, H, t, dt);
  else if (name === 'tubes') sceneTubes(core, ctx, st, W, H, t, dt);
  else if (name === 'planet') scenePlanet(core, ctx, st, W, H, t, dt);
  else if (name === 'ocean') sceneOcean(core, ctx, st, W, H, t, dt);
  else if (name === 'fireworks') sceneFireworks(core, ctx, st, W, H, t, dt);
  else if (name === 'monitor') sceneMonitor(core, ctx, st, W, H, t, dt);
  else if (name === 'sand') sceneSand(core, ctx, st, W, H, t, dt);
  else if (name === 'trampoline') sceneTrampoline(core, ctx, st, W, H, t, dt);
  else if (name === 'garden') sceneGarden(core, ctx, st, W, H, t, dt);
  else if (name === 'tetris') sceneTetris(core, ctx, st, W, H, t, dt);
  else if (name === 'rain') sceneRain(core, ctx, st, W, H, t, dt);
  else sceneStars(core, ctx, st, W, H, t, dt);
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
