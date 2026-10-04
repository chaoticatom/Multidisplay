// Spectrum v2 for the flat panel / wall: four animated scenes, drawn into a
// private glow canvas that keeps soft trails, then copied to the wall.
//   prism   - mirrored neon bars from a centre horizon, glowing reflections
//             and sparks thrown off the peaks
//   orbit   - a ring of bars round a pulsing core, slowly turning, with
//             particles flung outwards on each beat
//   horizon - synthwave terrain: the spectrum's history rolls towards you
//             as a neon landscape under a sun that swells with the bass
//   silk    - glowing ribbons that follow the spectrum, each a little behind
//             the last
//   auto    - moves through them, about 25 s each
// Everything reads the shared display levels (ctx.ampArr / ctx.peakArr, see
// levels.js) and the music features (core.audio, see audioFeatures.js).
// y = 0 is the top of the canvas, as for every wall effect. Version 1 is
// still in spectrumWall.js, chosen with the "Version" option.
'use strict';

const { hsl } = require('../../core');
const { trailFade } = require('../trail');

const SCENES = ['prism', 'orbit', 'horizon', 'silk'];
const AUTO_SECS = 25;

function createV2State() { return { acc: null, w: 0, h: 0, sparks: [], hist: [], seed: 1, flash: 0, sceneT: 0 }; }

function rand(st) { st.seed = (st.seed * 16807) % 2147483647; return (st.seed - 1) / 2147483646; }

// Smooth amplitude at f = 0..1 across the bands.
function ampAt(arr, bands, f) {
  const x = Math.max(0, Math.min(1, f)) * (bands - 1), i = Math.floor(x), t = x - i;
  const a = arr[i] || 0, b = arr[Math.min(bands - 1, i + 1)] || 0;
  return a + (b - a) * (t * t * (3 - 2 * t));
}

function add(st, x, y, r, g, b) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return;
  const i = (y * st.w + x) * 3, a = st.acc;
  a[i] += r; a[i + 1] += g; a[i + 2] += b;
}
// A soft dot: the centre pixel plus a dimmer halo.
function glowDot(st, x, y, c, k) {
  add(st, x, y, c[0] * k, c[1] * k, c[2] * k);
  const h = k * 0.28;
  add(st, x + 1, y, c[0] * h, c[1] * h, c[2] * h); add(st, x - 1, y, c[0] * h, c[1] * h, c[2] * h);
  add(st, x, y + 1, c[0] * h, c[1] * h, c[2] * h); add(st, x, y - 1, c[0] * h, c[1] * h, c[2] * h);
}
function line(st, x0, y0, x1, y1, c, k) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let s = 0; s <= n; s++) { const t = s / n; add(st, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c[0] * k, c[1] * k, c[2] * k); }
}

function spawnSpark(st, x, y, vx, vy, hue, life) {
  if (st.sparks.length > 220) st.sparks.shift();
  st.sparks.push({ x, y, vx, vy, hue, life, max: life });
}
function stepSparks(st, dt, gravity) {
  for (let i = st.sparks.length - 1; i >= 0; i--) {
    const p = st.sparks[i];
    p.life -= dt; if (p.life <= 0) { st.sparks.splice(i, 1); continue; }
    p.vy += gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const k = p.life / p.max;
    glowDot(st, p.x, p.y, hsl(p.hue, 0.9, 0.55 + 0.35 * k), 0.9 * k);
  }
}

function prism(st, ctx, au, W, H, t, dt) {
  const { ampArr, peakArr, bands } = ctx;
  const n = Math.max(8, Math.min(32, Math.floor(W / 2)));
  const colW = W / n, mid = Math.round(H * 0.56), up = mid - 2, down = H - mid - 2;
  for (let i = 0; i < n; i++) {
    // Mirrored left/right: bass in the middle, treble at both edges.
    const f = Math.abs((i + 0.5) / n - 0.5) * 2, a = ampAt(ampArr, bands, f), pk = ampAt(peakArr, bands, f);
    const hue = 0.55 + f * 0.45 + t * 0.03, top = a * up;
    const x0 = Math.floor(i * colW), x1 = Math.max(x0, Math.floor((i + 1) * colW) - 1);
    for (let y = 0; y <= top; y++) {
      const v = y / Math.max(1, up), c = hsl(hue + v * 0.12, 0.95, 0.35 + 0.35 * v);
      for (let x = x0; x <= x1; x++) add(st, x, mid - y, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      // Reflection: shorter, dimmer, rippling.
      const ry = mid + 1 + Math.round(y * (down / Math.max(1, up)) * 0.8);
      if (ry < H) { const wob = Math.round(Math.sin(t * 6 + y * 0.9 + i) * 0.6); for (let x = x0; x <= x1; x++) add(st, x + wob, ry, c[0] * 0.12, c[1] * 0.12, c[2] * 0.14); }
    }
    const tipC = hsl(hue + 0.12, 0.6, 0.85);
    for (let x = x0; x <= x1; x++) add(st, x, mid - pk * up - 1, tipC[0] * 0.6, tipC[1] * 0.6, tipC[2] * 0.6);
    if (a > 0.55 && rand(st) < a * dt * 6) spawnSpark(st, (x0 + x1) / 2, mid - top, (rand(st) - 0.5) * 10, -12 - a * 18, hue, 0.9);
  }
  // Horizon line, brighter on the beat.
  const hc = hsl(0.58 + t * 0.03, 0.8, 0.6), hk = 0.25 + au.beat * 0.6;
  for (let x = 0; x < W; x++) add(st, x, mid, hc[0] * hk, hc[1] * hk, hc[2] * hk);
  stepSparks(st, dt, 26);
}

function orbit(st, ctx, au, W, H, t, dt) {
  const { ampArr, bands } = ctx;
  const cx = (W - 1) / 2, cy = (H - 1) / 2 - 2, R = Math.min(W, H);
  const r0 = R * (0.13 + au.bass * 0.05), span = R * 0.3, n = 48, rot = t * 0.25;
  for (let i = 0; i < n; i++) {
    const f = Math.abs((i / n) * 2 - 1), a = ampAt(ampArr, bands, f), ang = rot + (i / n) * Math.PI * 2;
    const c = hsl(0.8 - f * 0.55 + t * 0.02, 0.95, 0.5), ca = Math.cos(ang), sa = Math.sin(ang);
    const len = a * span;
    for (let r = 0; r <= len; r += 0.6) { const k = 0.25 + 0.5 * (r / Math.max(1, span)); add(st, cx + ca * (r0 + r), cy + sa * (r0 + r), c[0] * k, c[1] * k, c[2] * k); }
    glowDot(st, cx + ca * (r0 + len + 1), cy + sa * (r0 + len + 1), hsl(0.8 - f * 0.55 + t * 0.02, 0.5, 0.8), 0.5);
  }
  // Core: a soft disc that breathes with the bass.
  const coreC = hsl(0.9 + t * 0.02, 0.85, 0.55), cr = r0 * 0.85;
  for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) {
    const d = Math.hypot(x, y) / cr; if (d > 1) continue;
    const k = (1 - d * d) * (0.12 + au.bass * 0.35 + au.beat * 0.3);
    add(st, cx + x, cy + y, coreC[0] * k, coreC[1] * k, coreC[2] * k);
  }
  if (au.beat > 0.9 && !st.beatLatch) {
    st.beatLatch = true;
    for (let s = 0; s < 18; s++) { const ang = rand(st) * Math.PI * 2, sp = 14 + rand(st) * 22; spawnSpark(st, cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.85 + rand(st) * 0.3, 1.2); }
  } else if (au.beat < 0.5) st.beatLatch = false;
  stepSparks(st, dt, 0);
}

function horizon(st, ctx, au, W, H, t, dt) {
  const { ampArr, bands } = ctx;
  const hy = Math.round(H * 0.38), N = 22;
  // Keep a short history of the spectrum (one row per ~70 ms).
  st.histT = (st.histT || 0) + dt;
  if (st.histT > 0.07 || !st.hist.length) {
    st.histT = 0;
    const row = new Float32Array(24);
    for (let i = 0; i < 24; i++) row[i] = ampAt(ampArr, bands, Math.abs((i / 23) * 2 - 1));
    st.hist.unshift(row); if (st.hist.length > N) st.hist.pop();
  }
  // Sun on the horizon, banded like a synthwave poster.
  const sr = W * (0.17 + au.bass * 0.05), scx = (W - 1) / 2;
  for (let y = -sr; y <= 0; y++) {
    if (Math.floor((y + t * 4) / 2) % 3 === 0 && y > -sr * 0.6) continue;
    const w = Math.sqrt(Math.max(0, sr * sr - y * y)), c = hsl(0.08 - (y / sr) * 0.1, 1, 0.5), k = 0.5;
    for (let x = -w; x <= w; x++) add(st, scx + x, hy + y - 1, c[0] * k, c[1] * k, c[2] * k);
  }
  // Terrain rows: far rows near the horizon, near rows at the bottom.
  const scroll = (t * 1.5) % 1;
  let prev = null;
  for (let j = st.hist.length - 1; j >= 0; j--) {
    // z: 0 = at your feet, 1 = the horizon; rows bunch up with distance.
    const z = Math.min(1, (j + 1 - scroll) / N), depth = (1 / (z + 0.15) - 1 / 1.15) / (1 / 0.15 - 1 / 1.15);
    const y0 = hy + (H - hy) * depth;
    const spread = W * (0.5 + depth * 1.4), row = st.hist[j], pts = [];
    for (let i = 0; i < 24; i++) {
      const px = scx + ((i / 23) - 0.5) * spread, lift = row[i] * depth * H * 0.16;
      pts.push([px, y0 - lift]);
    }
    const c = hsl(0.78 + 0.1 * (1 - z) + t * 0.02, 0.95, 0.5), k = 0.15 + 0.5 * (1 - z);
    for (let i = 0; i < 23; i++) line(st, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, k);
    if (prev) for (let i = 0; i < 24; i += 3) line(st, prev[i][0], prev[i][1], pts[i][0], pts[i][1], c, k * 0.5);
    prev = pts;
  }
}

function silk(st, ctx, au, W, H, t) {
  const { ampArr, bands } = ctx;
  const base = H * 0.5, ribbons = 4;
  for (let r = 0; r < ribbons; r++) {
    const c = hsl(0.5 + r * 0.11 + t * 0.04, 0.9, 0.55), k = 0.55 - r * 0.09, ph = t * (1.2 + r * 0.3) + r * 1.7;
    let py = null;
    for (let x = 0; x < W; x++) {
      const f = x / (W - 1), a = ampAt(ampArr, bands, Math.abs(f * 2 - 1) * 0.9 + r * 0.03);
      const y = base + Math.sin(f * Math.PI * 2 * (1 + r * 0.5) + ph) * (H * 0.08 + a * H * 0.28) * (r % 2 ? -1 : 1);
      if (py !== null) line(st, x - 1, py, x, y, c, k); else add(st, x, y, c[0] * k, c[1] * k, c[2] * k);
      add(st, x, y - 1, c[0] * k * 0.3, c[1] * k * 0.3, c[2] * k * 0.3); add(st, x, y + 1, c[0] * k * 0.3, c[1] * k * 0.3, c[2] * k * 0.3);
      py = y;
    }
  }
}

const TRAIL = { prism: 0.62, orbit: 0.8, horizon: 0.35, silk: 0.84 };

function renderSpectrumV2Wall(core, ctx, scene, st) {
  const W = core.wallW, H = core.wallH, dt = ctx.dt || 1 / 30, t = ctx.t;
  if (!st.acc || st.w !== W || st.h !== H) { st.acc = new Float32Array(W * H * 3); st.w = W; st.h = H; st.hist = []; st.sparks = []; }
  let name = SCENES.includes(scene) ? scene : 'auto';
  if (name === 'auto') {
    st.sceneT += dt;
    name = SCENES[Math.floor(st.sceneT / AUTO_SECS) % SCENES.length];
  }
  if (st.last !== name) { st.last = name; st.sparks = []; }
  const au = core.audio || { bass: 0, beat: 0, level: 0 };
  const k = trailFade(TRAIL[name], dt), a = st.acc;
  for (let i = 0; i < a.length; i++) a[i] *= k;
  if (name === 'prism') prism(st, ctx, au, W, H, t, dt);
  else if (name === 'orbit') orbit(st, ctx, au, W, H, t, dt);
  else if (name === 'horizon') horizon(st, ctx, au, W, H, t, dt);
  else silk(st, ctx, au, W, H, t, dt);
  // Copy out with a soft shoulder, so bright overlaps glow instead of clipping flat.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    core.setWallPixel(x, y, 1 - Math.exp(-a[i] * 1.6), 1 - Math.exp(-a[i + 1] * 1.6), 1 - Math.exp(-a[i + 2] * 1.6));
  }
}

module.exports = { renderSpectrumV2Wall, createV2State, SCENES };
