// Ported from effects-physics.js's "FIREWORKS" section (fwSet/fwLaunch/
// fwBurst/FW_PALETTES/fwSync*/fwMic*/effectFireworks, lines ~6-398) plus
// effects-core.js's cubePx()/fwPx()/buildFwText() that it depends on.
//
// Three modes, each handled deliberately (see index.js comment on other
// effects for the general "ported vs re-implemented" split this project
// uses):
//
//  - 'random' (default): the core rocket-launch + particle-burst
//    simulation, ported faithfully - math, timings, and the seven burst
//    "type" shapes are all unchanged from the browser.
//
//  - 'sync' ("Sync Show"): NOT tied to any external source (no audio, no
//    timecode) - it's a fixed choreographed timeline of 7 "acts"
//    (FW_SYNC_ACTS) that cycle in order, each scheduling a batch of
//    rockets via setTimeout with hand-tuned per-rocket delays (fans,
//    volleys, cascades, symmetry pairs, a waterfall, a grand finale).
//    Ported verbatim, including the browser's use of real-time
//    setTimeout for the sub-act stagger - same pattern already
//    established by lightning.js's spawnStrike() re-strikes, so pi-native
//    keeps it rather than converting to a dt-accumulator.
//
//  - 'mic' (was Web Audio API mic input in the browser): pi-native has no
//    browser, no microphone permission flow, and no audio-input pipeline
//    of any kind (confirmed - this is a real, permanent scope boundary,
//    the same category as cam.js's snapshot-only Camera effect never
//    growing a live webcam feed). Rather than crash, silently no-op, or
//    fake microphone data, 'mic' mode falls back to running the exact
//    same logic as 'random' mode - a reactive fireworks show degrades
//    gracefully to a still-lively ambient one instead of going dark or
//    erroring, which reads better on an unattended display than a dim
//    idle screen. If real audio input is ever added to pi-native, this is
//    the branch to wire up.
const { hsl } = require('../core');
const { fwPx, FW_FONT, FW_CHAR_W } = require('./_shared');

// ── module state (mirrors the browser's bare globals) ──
const fwRockets = [];
const fwBursts = [];
let fwSpawnT = 0;
// fwSyncT/fwSyncPhase/fwSyncStep: ported for fidelity with the browser's
// module-scope declarations (effects-physics.js lines 12) but, same as in
// the original, never actually read anywhere - the real sync-show state is
// fwSyncQueue/fwSyncWait/fwSyncAct below. Kept as dead state on purpose
// rather than "cleaned up", to stay a faithful port.
let fwSyncT = 0, fwSyncPhase = 0, fwSyncStep = 0;

const FW_PALETTES = [
  [0.0, 0.03],   // reds
  [0.08, 0.14],  // golds/amber
  [0.55, 0.65],  // blues
  [0.3, 0.38],   // greens
  [0.78, 0.88],  // purples/pinks
  [0.0, 1.0],    // rainbow
];
let fwSyncQueue = [];
let fwSyncWait = 0;
let fwSyncAct = 0;
let fwSyncForceType = -1, fwSyncForceMono = false;

// ── text overlay state ──
let fwTextOn = false, fwText = '', fwScrollX = 0;
let fwTextPixels = null, fwTextWidth = 0, fwTextH = 0, fwTextBuiltFor = null;

function fwSet(core, idx, r, g, b) {
  if (idx < 0) return;
  const c = core.colBuf, o = idx * 3;
  c[o] = Math.max(c[o], r);
  c[o + 1] = Math.max(c[o + 1], g);
  c[o + 2] = Math.max(c[o + 2], b);
}

function fwLaunch(core, panel2dMode) {
  const SIZE = core.SIZE;
  const totalCols = panel2dMode ? SIZE : SIZE * 4;
  const sc = Math.random() * totalCols;
  fwRockets.push({
    col: sc, v: 0,
    vy: SIZE * (0.88 + Math.random() * 0.45),
    vc: (Math.random() - 0.5) * SIZE * 0.3,
    hue: Math.random(),
    hue2: Math.random(),
    trail: [],
  });
}

function fwBurst(core, col, v, hue, hue2) {
  const SIZE = core.SIZE;
  const mono = fwSyncForceMono ? true : Math.random() > 0.5;
  const type = fwSyncForceType >= 0 ? fwSyncForceType : Math.random();
  const sizeMul = 0.5 + Math.random() * 1.0;

  function addParticle(c, y, vc, vy, h, decay, bright) {
    fwBursts.push({ col: c, v: y, vc, vy, hue: h, life: 1, decay, bright });
  }

  if (type < 0.25) {
    const n = 30 + Math.floor(Math.random() * 50);
    const spd = SIZE * (0.25 + Math.random() * 0.35) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = spd * (0.4 + Math.random() * 0.6);
      const h = mono ? hue : (i % 3 === 0 ? hue2 : hue + Math.random() * 0.1) % 1;
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * (0.5 + Math.random()), h, 0.008 + Math.random() * 0.008, 0.85 + Math.random() * 0.15);
    }
  } else if (type < 0.42) {
    const n = 70 + Math.floor(Math.random() * 40);
    const spd = SIZE * (0.35 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.8, mono ? hue : (hue + i * 0.003) % 1, 0.004 + Math.random() * 0.004, 0.9);
    }
  } else if (type < 0.56) {
    const n = 40 + Math.floor(Math.random() * 30);
    const spd = SIZE * (0.2 + Math.random() * 0.25) * sizeMul;
    const wHue = mono ? hue : 0.12 + Math.random() * 0.08;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r = spd * (0.4 + Math.random() * 0.6);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.3, wHue, 0.003 + Math.random() * 0.003, 0.8);
    }
  } else if (type < 0.73) {
    const n = 35 + Math.floor(Math.random() * 25);
    const spd = SIZE * (0.3 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const spread = (0.3 + Math.random() * 0.5) * spd;
      addParticle(col, v, Math.cos(a) * spread, spd * (0.6 + Math.random() * 0.4), mono ? hue : 0.08 + Math.random() * 0.06, 0.005 + Math.random() * 0.005, 0.85);
    }
  } else if (type < 0.88) {
    const offsets = [-SIZE * 0.12, SIZE * 0.12, 0, 0];
    const voffs = [0, 0, -SIZE * 0.12, SIZE * 0.12];
    for (let d = 0; d < 4; d++) {
      const sc = col + offsets[d], sv = v + voffs[d];
      const n2 = 15 + Math.floor(Math.random() * 10);
      const spd2 = SIZE * (0.15 + Math.random() * 0.2) * sizeMul;
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2 + Math.random() * 0.3;
        const r = spd2 * (0.4 + Math.random() * 0.6);
        addParticle(sc, sv, Math.cos(a) * r + offsets[d] * 2, Math.sin(a) * r * 0.5 + voffs[d] * 2, mono ? hue : (hue2 + Math.random() * 0.1) % 1, 0.01 + Math.random() * 0.008, 0.9);
      }
    }
  } else {
    const n = 20 + Math.floor(Math.random() * 20);
    const spd = SIZE * (0.25 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.6, 0.13 + Math.random() * 0.04, 0.015 + Math.random() * 0.015, 1.0);
    }
  }
}

function fwPal() { return FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)]; }
function fwHue(pal) { return pal[0] + Math.random() * (pal[1] - pal[0]); }

function fwSyncRocket(col, vy, vc, hue, hue2, delay) {
  if (delay > 0) {
    fwSyncQueue.push({ col, vy, vc, hue, hue2, delay });
  } else {
    fwRockets.push({ col, v: 0, vy, vc, hue, hue2, trail: [] });
  }
}

function fwFan(core, center, pal, count, spread) {
  const SIZE = core.SIZE;
  const n = count || 7 + Math.floor(Math.random() * 5);
  const sp = spread || SIZE * 0.07;
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2);
    const d = i * 20;
    fwSyncRocket(center + off * sp * 0.3, SIZE * (0.92 + Math.random() * 0.15), off * sp * 0.8, hue, (hue + 0.15) % 1, d);
  }
}

function fwVolley(core, faceIdx, pal, count) {
  const SIZE = core.SIZE;
  const base = faceIdx * SIZE;
  const n = count || 4 + Math.floor(Math.random() * 3);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const sc = base + SIZE * 0.15 + Math.random() * SIZE * 0.7;
    fwSyncRocket(sc, SIZE * (0.88 + Math.random() * 0.2), (Math.random() - 0.5) * SIZE * 0.1, hue, (hue + 0.2 + Math.random() * 0.1) % 1, i * 30);
  }
}

function fwCascade(core, pal, dir) {
  const SIZE = core.SIZE;
  const total = SIZE * 4;
  const n = 8 + Math.floor(Math.random() * 4);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const idx = dir > 0 ? i : (n - 1 - i);
    const sc = (total / n) * idx + SIZE * 0.1 + Math.random() * SIZE * 0.15;
    fwSyncRocket(sc, SIZE * (0.82 + Math.random() * 0.2), 0, (hue + i * 0.02) % 1, (hue + 0.4) % 1, i * 40);
  }
}

function fwSymmetry(core, pal) {
  const SIZE = core.SIZE;
  const hue = fwHue(pal);
  const pairs = [[0, 2], [1, 3]];
  const pair = pairs[Math.floor(Math.random() * 2)];
  for (let i = 0; i < 3; i++) {
    const off = SIZE * 0.2 + Math.random() * SIZE * 0.6;
    const vy = SIZE * (0.88 + Math.random() * 0.3);
    const h = (hue + i * 0.06) % 1;
    fwSyncRocket(pair[0] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 50);
    fwSyncRocket(pair[1] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 50);
  }
}

function fwWaterfall(core, pal) {
  const SIZE = core.SIZE;
  const total = SIZE * 4;
  const hue = fwHue(pal);
  for (let i = 0; i < 16; i++) {
    const sc = Math.random() * total;
    fwSyncRocket(sc, SIZE * (0.62 + Math.random() * 0.15), (Math.random() - 0.5) * SIZE * 0.05, (hue + Math.random() * 0.08) % 1, hue, i * 15);
  }
}

function fwFinale(core) {
  const SIZE = core.SIZE;
  const total = SIZE * 4;
  const pal1 = fwPal(), pal2 = fwPal();
  for (let i = 0; i < 20; i++) {
    const sc = Math.random() * total;
    const pal = i % 2 === 0 ? pal1 : pal2;
    const hue = fwHue(pal);
    fwSyncRocket(sc, SIZE * (0.72 + Math.random() * 0.3), (Math.random() - 0.5) * SIZE * 0.2, hue, (hue + 0.4) % 1, i * 25 + Math.random() * 15);
  }
}

function buildSyncActs(core) {
  return [
    () => { const pal = fwPal(); for (let f = 0; f < 4; f++) setTimeout(() => fwFan(core, f * core.SIZE + core.SIZE / 2, pal), f * 400); return 3.5; },
    () => { const p1 = fwPal(), p2 = fwPal(); fwVolley(core, 0, p1, 5); setTimeout(() => fwVolley(core, 2, p2, 5), 300); setTimeout(() => fwVolley(core, 1, p1, 5), 600); setTimeout(() => fwVolley(core, 3, p2, 5), 900); return 3.5; },
    () => { const pal = fwPal(); fwCascade(core, pal, 1); setTimeout(() => fwCascade(core, pal, -1), 1400); return 4.0; },
    () => { const pal = fwPal(); fwSymmetry(core, pal); setTimeout(() => { const p2 = fwPal(); fwSymmetry(core, p2); }, 800); setTimeout(() => { const p3 = fwPal(); fwSymmetry(core, p3); }, 1600); return 4.0; },
    () => { const pal = fwPal(); for (let i = 0; i < 5; i++) setTimeout(() => fwFan(core, Math.random() * core.SIZE * 4, pal, 5 + Math.floor(Math.random() * 4), core.SIZE * 0.06), i * 400); return 4.0; },
    () => { const pal = fwPal(); fwWaterfall(core, pal); setTimeout(() => fwWaterfall(core, fwPal()), 1000); return 3.5; },
    () => { fwFinale(core); setTimeout(() => fwFinale(core), 1000); return 5.0; },
  ];
}
let fwSyncActsCache = null, fwSyncActsCore = null;

function fwSyncUpdate(core, dt) {
  if (fwSyncActsCore !== core) { fwSyncActsCache = buildSyncActs(core); fwSyncActsCore = core; }
  for (let k = fwSyncQueue.length - 1; k >= 0; k--) {
    fwSyncQueue[k].delay -= dt * 1000;
    if (fwSyncQueue[k].delay <= 0) {
      const q = fwSyncQueue[k];
      fwRockets.push({ col: q.col, v: 0, vy: q.vy, vc: q.vc, hue: q.hue, hue2: q.hue2, trail: [] });
      fwSyncQueue.splice(k, 1);
    }
  }

  fwSyncWait -= dt;
  if (fwSyncWait <= 0) {
    const unified = Math.random() < 0.5;
    if (unified) { fwSyncForceMono = true; fwSyncForceType = [0.1, 0.3, 0.5, 0.65, 0.8, 0.95][Math.floor(Math.random() * 6)]; }
    else { fwSyncForceMono = false; fwSyncForceType = -1; }
    const act = fwSyncActsCache[fwSyncAct % fwSyncActsCache.length];
    fwSyncWait = act();
    fwSyncAct++;
  }
}

// ── text-overlay glyph rendering (canvas replacement) ──
// The browser's buildFwText() rasterizes text via an offscreen <canvas>
// (ctx.font/fillText/getImageData) - pi-native has no DOM/Canvas anywhere
// (see coinflip.js/dice.js's module comments for the established
// canvas-replacement approach this project uses). Text here is built once
// into a 0/255 single-channel strip, tiled to loop exactly like
// fwTextPixels did, then fed into the same scrolling-strip draw logic as
// the original.
//
// Uses FW_FONT (6x5 - see _shared.js) - a real request to switch this
// overlay from WC_FONT (4x7, the word-cascade engine's font, used here
// after an earlier "so big and blocky it can't be read" fix against the
// original 3x5 PIXEL_FONT) to a wider/flatter 6x5 shape instead.
function glyphWidth(scale) { return FW_CHAR_W * scale; }
function textPixelWidth(str, scale) { return str.length * glyphWidth(scale); }

function drawGlyphToBuffer(buf, bw, bh, ch, ox, oy, scale) {
  const rows = FW_FONT[ch] || FW_FONT[ch.toUpperCase()] || FW_FONT[' '];
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 5; col++) {
      if (!((bits >> (4 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const x = ox + col * scale + sx, y = oy + row * scale + sy;
        if (x < 0 || x >= bw || y < 0 || y >= bh) continue;
        buf[y * bw + x] = 255;
      }
    }
  }
}

function buildFwText(core, msg) {
  if (!msg || !msg.trim()) { fwTextPixels = null; fwTextWidth = 0; fwTextH = 0; return; }
  const SIZE = core.SIZE;
  const maxH = Math.round(SIZE * 0.33);
  // A real report: the font was "still massive, 4 pixels width per line,
  // should be 1" - the old auto-scale (floor(maxH/5), 4 for a 64px face)
  // blew each font pixel up into a 4x4 block. Pinned to 1:1 (each font
  // bit = exactly one physical pixel) instead of scaling to fill maxH.
  const scale = 1;
  const glyphH = scale * 5;
  const yOff = Math.floor((maxH - glyphH) / 2);

  const padText = msg.trim() + '   ';
  const oneW = Math.max(1, textPixelWidth(padText, scale));
  const totalW = Math.max(4 * SIZE, oneW);

  const pixels = new Uint8Array(totalW * maxH);
  let x = 0;
  while (x < totalW) {
    let cx = x;
    for (const ch of padText) {
      drawGlyphToBuffer(pixels, totalW, maxH, ch, cx, yOff, scale);
      cx += glyphWidth(scale);
    }
    x += oneW;
  }

  fwTextPixels = pixels;
  fwTextWidth = totalW;
  fwTextH = maxH;
  fwScrollX = 0;
}

function drawTextOverlay(core, dt) {
  if (!fwTextOn || !fwTextPixels || fwTextWidth <= 0) return;
  const SIZE = core.SIZE, faceMap = core.faceMap, t = core.t;
  fwScrollX = (fwScrollX + dt * SIZE * 0.38) % fwTextWidth;

  const textRows = fwTextH;
  const panelSeq = [3, 0, 2, 1];

  for (let pi = 0; pi < 4; pi++) {
    const face = panelSeq[pi];
    const segStart = pi * SIZE;

    for (let v = 0; v < textRows; v++) {
      const lv = SIZE - 1 - v;
      if (lv < 0 || lv >= SIZE) continue;

      for (let u = 0; u < SIZE; u++) {
        const stripX = ((segStart + u + (fwScrollX | 0)) % fwTextWidth + fwTextWidth) % fwTextWidth;
        const pv = fwTextPixels[v * fwTextWidth + stripX] / 255;
        if (pv < 0.04) continue;
        const hue = ((stripX / fwTextWidth) + t * 0.04) % 1;
        const [r, g, b] = hsl(hue, 1, pv * 0.95);
        const idx = faceMap[face][lv * SIZE + u];
        if (idx >= 0) core.setLED(idx, r, g, b);
      }
    }
  }
}

function effectFireworks(core, dt) {
  core.t += dt;
  const { N, SIZE, colBuf, faceMap } = core;
  const panel2dMode = core.panelMode === '2d';
  const opts = core.effectOptions?.fireworks || {};
  const mode = opts.mode === 'sync' || opts.mode === 'mic' ? opts.mode : 'random';

  // Text-overlay option handling (checkbox + debounced text field, both via
  // the generic setEffectOption mechanism - see the module comment/app.js
  // for the debounce choice).
  fwTextOn = !!opts.textOn;
  const wantText = opts.text || '';
  if (fwTextOn && wantText && fwTextBuiltFor !== wantText) {
    buildFwText(core, wantText);
    fwTextBuiltFor = wantText;
  } else if (!wantText) {
    fwTextBuiltFor = null;
  }

  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.80;

  if (mode === 'random') {
    fwSpawnT += dt;
    if (fwSpawnT > 0.4) { fwLaunch(core, panel2dMode); if (Math.random() > 0.6) fwLaunch(core, panel2dMode); fwSpawnT = 0; }
  } else if (mode === 'sync') {
    fwSyncUpdate(core, dt);
  } else if (mode === 'mic') {
    // No microphone/audio-input pipeline in pi-native (see module comment) -
    // fall back to the same launch cadence as 'random' rather than sitting
    // dark or crashing.
    fwSpawnT += dt;
    if (fwSpawnT > 0.4) { fwLaunch(core, panel2dMode); if (Math.random() > 0.6) fwLaunch(core, panel2dMode); fwSpawnT = 0; }
  }

  const totalCols = panel2dMode ? SIZE : SIZE * 4;
  const G = SIZE * 0.06;
  void totalCols; // kept for parity with the browser (same unused-in-scope situation as fwSyncT et al above)

  // ── Rockets ──
  for (let k = fwRockets.length - 1; k >= 0; k--) {
    const r = fwRockets[k];
    r.vy -= SIZE * 0.85 * dt;
    r.v += r.vy * dt;
    r.col += r.vc * dt;
    r.trail.push({ col: r.col, v: r.v });
    if (r.trail.length > 20) r.trail.shift();

    for (let ti = 0; ti < r.trail.length; ti++) {
      const tp = r.trail[ti];
      const fade = ti / r.trail.length;
      const [rh, gh, bh] = hsl(r.hue, 1, fade * 0.95);
      const iv = Math.max(0, Math.min(SIZE - 1, Math.round(tp.v)));
      if (panel2dMode) {
        const ic = Math.round(tp.col);
        if (ic >= 0 && ic < SIZE) { const idx = faceMap[0][iv * SIZE + ic]; if (idx >= 0) fwSet(core, idx, rh, gh, bh); }
      } else {
        const idx = fwPx(core, Math.round(tp.col), iv);
        if (idx >= 0) fwSet(core, idx, rh, gh, bh);
      }
    }
    if (r.vy <= 0 || r.v >= SIZE - 1) { fwBurst(core, r.col, r.v, r.hue, r.hue2); fwRockets.splice(k, 1); }
  }

  // ── Burst particles ──
  for (let k = fwBursts.length - 1; k >= 0; k--) {
    const b = fwBursts[k];
    b.col += b.vc * dt;
    b.v += b.vy * dt;
    b.vy -= G * dt;
    b.life -= b.decay;
    if (b.life <= 0) { fwBursts.splice(k, 1); continue; }

    const iv = Math.round(b.v);
    if (iv < 0) { fwBursts.splice(k, 1); continue; }

    const [rh, gh, bh] = hsl(b.hue, 1, b.life * (b.bright || 0.9));

    if (panel2dMode) {
      if (iv >= SIZE) { fwBursts.splice(k, 1); continue; }
      const ic = Math.round(b.col);
      if (ic < 0 || ic >= SIZE) { fwBursts.splice(k, 1); continue; }
      const idx = faceMap[0][iv * SIZE + ic];
      if (idx >= 0) fwSet(core, idx, rh, gh, bh);
    } else if (iv < SIZE) {
      const idx = fwPx(core, Math.round(b.col), iv);
      if (idx >= 0) fwSet(core, idx, rh, gh, bh);
    } else {
      const ov = iv - SIZE;
      if (ov >= SIZE) { fwBursts.splice(k, 1); continue; }
      const S = SIZE, total = S * 4;
      const c = ((Math.round(b.col) % total) + total) % total;
      const qi = (c / S) | 0, fu = c % S;
      let tu, tv;
      if (qi === 0) { tu = fu; tv = (S - 1) - ov; }
      else if (qi === 1) { tu = (S - 1) - ov; tv = (S - 1) - fu; }
      else if (qi === 2) { tu = (S - 1) - fu; tv = ov; }
      else { tu = ov; tv = fu; }
      if (tu >= 0 && tu < S && tv >= 0 && tv < S) {
        const idx = faceMap[4][tv * S + tu];
        if (idx >= 0) fwSet(core, idx, rh, gh, bh);
      }
    }
  }

  // ── Scrolling text overlay ──
  drawTextOverlay(core, dt);
}

module.exports = effectFireworks;
