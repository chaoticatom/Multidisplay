// Wall-mode counterpart to fireworks.js. Same three modes and same
// documented mode-handling split as the cube version (see that file's
// module comment for the general "ported vs re-implemented" reasoning) -
// only repeated here where the wall adaptation changes something:
//
//  - 'random' (default): the core rocket-launch + particle-burst
//    simulation, bounded directly to the flat wallW x wallH canvas instead
//    of wrapping around cube faces via fwPx()/cubePx() - genuine
//    particle-bounds flattening, not a "draw once" shortcut. Column
//    (horizontal) position ranges over [0, wallW); vertical position "v"
//    counts up from the bottom of the canvas (v=0) same as the cube
//    version counts up a face, and is drawn at wall row `wallH-1-v` since
//    setWallPixel's y=0 is the top of the canvas. All burst-shape/particle
//    math (the 6 burst "type" branches, decay rates, gravity) is otherwise
//    unchanged, just re-scaled off wallH instead of SIZE (both are just
//    "the vertical span a rocket travels").
//
//  - 'sync' ("Sync Show"): same fixed choreographed-acts structure
//    (fan/volley/cascade/symmetry/waterfall/finale), same real-time
//    setTimeout stagger as the cube version. The cube version schedules
//    rockets by cube *face* (SIZE-wide columns, 4 side faces); a flat wall
//    has no faces, so each "face slot" is substituted with one quarter of
//    the wall's width (wallW/4) - the closest "4 named horizontal regions"
//    concept a flat wall actually has, same style of substitution as
//    strobeWall.js's panel-cycling stand-in for the cube's "flash one face"
//    strobe pattern.
//
//  - 'mic': no audio-input pipeline in pi-native (see fireworks.js's module
//    comment) - falls back to 'random' mode, same reasoning.
//
// The scrolling text overlay is simpler here than the cube version: no
// per-face segmenting is needed since there's only one flat surface, so
// the text strip just scrolls across the full wallW in a single fixed
// horizontal band instead of the cube's 4-panel front→left→right→back
// sequence.
const { hsl } = require('../core');
const { FW_FONT, FW_CHAR_W } = require('./_shared');

const fwRockets = [];
const fwBursts = [];
let fwSpawnT = 0;

const FW_PALETTES = [
  [0.0, 0.03], [0.08, 0.14], [0.55, 0.65], [0.3, 0.38], [0.78, 0.88], [0.0, 1.0],
];
let fwSyncQueue = [];
let fwSyncWait = 0;
let fwSyncAct = 0;
let fwSyncForceType = -1, fwSyncForceMono = false;

let fwTextOn = false, fwScrollX = 0;
let fwTextPixels = null, fwTextWidth = 0, fwTextH = 0, fwTextBuiltFor = null;

function fwSet(core, x, y, r, g, b) {
  const o = (y * core.wallW + x) * 3;
  const c = core.wallBuf;
  const cr = Math.max(c[o] || 0, r), cg = Math.max(c[o + 1] || 0, g), cb = Math.max(c[o + 2] || 0, b);
  core.setWallPixel(x, y, cr, cg, cb);
}

function fwLaunch(core) {
  const dimV = core.wallH;
  const sc = Math.random() * core.wallW;
  fwRockets.push({
    col: sc, v: 0,
    vy: dimV * (0.88 + Math.random() * 0.45),
    vc: (Math.random() - 0.5) * dimV * 0.3,
    hue: Math.random(),
    hue2: Math.random(),
    trail: [],
  });
}

function fwBurst(core, col, v, hue, hue2) {
  const dimV = core.wallH;
  const mono = fwSyncForceMono ? true : Math.random() > 0.5;
  const type = fwSyncForceType >= 0 ? fwSyncForceType : Math.random();
  const sizeMul = 0.5 + Math.random() * 1.0;

  function addParticle(c, y, vc, vy, h, decay, bright) {
    fwBursts.push({ col: c, v: y, vc, vy, hue: h, life: 1, decay, bright });
  }

  if (type < 0.25) {
    const n = 30 + Math.floor(Math.random() * 50);
    const spd = dimV * (0.25 + Math.random() * 0.35) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = spd * (0.4 + Math.random() * 0.6);
      const h = mono ? hue : (i % 3 === 0 ? hue2 : hue + Math.random() * 0.1) % 1;
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * (0.5 + Math.random()), h, 0.008 + Math.random() * 0.008, 0.85 + Math.random() * 0.15);
    }
  } else if (type < 0.42) {
    const n = 70 + Math.floor(Math.random() * 40);
    const spd = dimV * (0.35 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.8, mono ? hue : (hue + i * 0.003) % 1, 0.004 + Math.random() * 0.004, 0.9);
    }
  } else if (type < 0.56) {
    const n = 40 + Math.floor(Math.random() * 30);
    const spd = dimV * (0.2 + Math.random() * 0.25) * sizeMul;
    const wHue = mono ? hue : 0.12 + Math.random() * 0.08;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r = spd * (0.4 + Math.random() * 0.6);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.3, wHue, 0.003 + Math.random() * 0.003, 0.8);
    }
  } else if (type < 0.73) {
    const n = 35 + Math.floor(Math.random() * 25);
    const spd = dimV * (0.3 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const spread = (0.3 + Math.random() * 0.5) * spd;
      addParticle(col, v, Math.cos(a) * spread, spd * (0.6 + Math.random() * 0.4), mono ? hue : 0.08 + Math.random() * 0.06, 0.005 + Math.random() * 0.005, 0.85);
    }
  } else if (type < 0.88) {
    const offsets = [-dimV * 0.12, dimV * 0.12, 0, 0];
    const voffs = [0, 0, -dimV * 0.12, dimV * 0.12];
    for (let d = 0; d < 4; d++) {
      const sc = col + offsets[d], sv = v + voffs[d];
      const n2 = 15 + Math.floor(Math.random() * 10);
      const spd2 = dimV * (0.15 + Math.random() * 0.2) * sizeMul;
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2 + Math.random() * 0.3;
        const r = spd2 * (0.4 + Math.random() * 0.6);
        addParticle(sc, sv, Math.cos(a) * r + offsets[d] * 2, Math.sin(a) * r * 0.5 + voffs[d] * 2, mono ? hue : (hue2 + Math.random() * 0.1) % 1, 0.01 + Math.random() * 0.008, 0.9);
      }
    }
  } else {
    const n = 20 + Math.floor(Math.random() * 20);
    const spd = dimV * (0.25 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.6, 0.13 + Math.random() * 0.04, 0.015 + Math.random() * 0.015, 1.0);
    }
  }
}

function fwPal() { return FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)]; }
function fwHue(pal) { return pal[0] + Math.random() * (pal[1] - pal[0]); }

function fwSyncRocket(core, col, vy, vc, hue, hue2, delay) {
  if (delay > 0) {
    fwSyncQueue.push({ col, vy, vc, hue, hue2, delay });
  } else {
    fwRockets.push({ col, v: 0, vy, vc, hue, hue2, trail: [] });
  }
}

function fwFan(core, center, pal, count, spread) {
  const dimV = core.wallH;
  const n = count || 7 + Math.floor(Math.random() * 5);
  const sp = spread || dimV * 0.07;
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2);
    const d = i * 20;
    fwSyncRocket(core, center + off * sp * 0.3, dimV * (0.92 + Math.random() * 0.15), off * sp * 0.8, hue, (hue + 0.15) % 1, d);
  }
}

// `slot` stands in for the cube version's cube face (0-3): one quarter of
// wallW, see module comment.
function fwVolley(core, slot, pal, count) {
  const dimV = core.wallH, quarterW = core.wallW / 4;
  const base = slot * quarterW;
  const n = count || 4 + Math.floor(Math.random() * 3);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const sc = base + quarterW * 0.15 + Math.random() * quarterW * 0.7;
    fwSyncRocket(core, sc, dimV * (0.88 + Math.random() * 0.2), (Math.random() - 0.5) * dimV * 0.1, hue, (hue + 0.2 + Math.random() * 0.1) % 1, i * 30);
  }
}

function fwCascade(core, pal, dir) {
  const dimV = core.wallH, total = core.wallW;
  const n = 8 + Math.floor(Math.random() * 4);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const idx = dir > 0 ? i : (n - 1 - i);
    const sc = (total / n) * idx + total * 0.02 + Math.random() * total * 0.04;
    fwSyncRocket(core, sc, dimV * (0.82 + Math.random() * 0.2), 0, (hue + i * 0.02) % 1, (hue + 0.4) % 1, i * 40);
  }
}

function fwSymmetry(core, pal) {
  const dimV = core.wallH, quarterW = core.wallW / 4;
  const hue = fwHue(pal);
  const pairs = [[0, 2], [1, 3]];
  const pair = pairs[Math.floor(Math.random() * 2)];
  for (let i = 0; i < 3; i++) {
    const off = quarterW * 0.2 + Math.random() * quarterW * 0.6;
    const vy = dimV * (0.88 + Math.random() * 0.3);
    const h = (hue + i * 0.06) % 1;
    fwSyncRocket(core, pair[0] * quarterW + off, vy, 0, h, (h + 0.3) % 1, i * 50);
    fwSyncRocket(core, pair[1] * quarterW + off, vy, 0, h, (h + 0.3) % 1, i * 50);
  }
}

function fwWaterfall(core, pal) {
  const dimV = core.wallH, total = core.wallW;
  const hue = fwHue(pal);
  for (let i = 0; i < 16; i++) {
    const sc = Math.random() * total;
    fwSyncRocket(core, sc, dimV * (0.62 + Math.random() * 0.15), (Math.random() - 0.5) * dimV * 0.05, (hue + Math.random() * 0.08) % 1, hue, i * 15);
  }
}

function fwFinale(core) {
  const dimV = core.wallH, total = core.wallW;
  const pal1 = fwPal(), pal2 = fwPal();
  for (let i = 0; i < 20; i++) {
    const sc = Math.random() * total;
    const pal = i % 2 === 0 ? pal1 : pal2;
    const hue = fwHue(pal);
    fwSyncRocket(core, sc, dimV * (0.72 + Math.random() * 0.3), (Math.random() - 0.5) * dimV * 0.2, hue, (hue + 0.4) % 1, i * 25 + Math.random() * 15);
  }
}

function buildSyncActs(core) {
  return [
    () => { const pal = fwPal(); for (let s = 0; s < 4; s++) setTimeout(() => fwFan(core, s * core.wallW / 4 + core.wallW / 8, pal), s * 400); return 3.5; },
    () => { const p1 = fwPal(), p2 = fwPal(); fwVolley(core, 0, p1, 5); setTimeout(() => fwVolley(core, 2, p2, 5), 300); setTimeout(() => fwVolley(core, 1, p1, 5), 600); setTimeout(() => fwVolley(core, 3, p2, 5), 900); return 3.5; },
    () => { const pal = fwPal(); fwCascade(core, pal, 1); setTimeout(() => fwCascade(core, pal, -1), 1400); return 4.0; },
    () => { const pal = fwPal(); fwSymmetry(core, pal); setTimeout(() => { const p2 = fwPal(); fwSymmetry(core, p2); }, 800); setTimeout(() => { const p3 = fwPal(); fwSymmetry(core, p3); }, 1600); return 4.0; },
    () => { const pal = fwPal(); for (let i = 0; i < 5; i++) setTimeout(() => fwFan(core, Math.random() * core.wallW, pal, 5 + Math.floor(Math.random() * 4), core.wallH * 0.06), i * 400); return 4.0; },
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

// ── text-overlay glyph rendering (see fireworks.js's module comment for
// the font history - now FW_FONT, 6x5, a real request to switch from
// WC_FONT's 4x7) ──
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
  const wallH = core.wallH;
  const maxH = Math.round(wallH * 0.33);
  // Pinned to 1:1 - see fireworks.js's buildFwText() comment (the old
  // auto-scale blew each font pixel up into a multi-pixel block).
  const scale = 1;
  const glyphH = scale * 5;
  const yOff = Math.floor((maxH - glyphH) / 2);

  const padText = msg.trim() + '   ';
  const oneW = Math.max(1, textPixelWidth(padText, scale));
  const totalW = Math.max(core.wallW, oneW);

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
  const { wallW, wallH, t } = core;
  fwScrollX = (fwScrollX + dt * wallW * 0.19) % fwTextWidth;

  const textRows = fwTextH;
  const rowBase = Math.round(wallH * 0.5 - textRows / 2); // fixed horizontal band, vertically centred

  for (let v = 0; v < textRows; v++) {
    const wy = rowBase + v;
    if (wy < 0 || wy >= wallH) continue;
    for (let u = 0; u < wallW; u++) {
      const stripX = ((u + (fwScrollX | 0)) % fwTextWidth + fwTextWidth) % fwTextWidth;
      const pv = fwTextPixels[v * fwTextWidth + stripX] / 255;
      if (pv < 0.04) continue;
      const hue = ((stripX / fwTextWidth) + t * 0.04) % 1;
      const [r, g, b] = hsl(hue, 1, pv * 0.95);
      core.setWallPixel(u, wy, r, g, b);
    }
  }
}

function effectFireworksWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const opts = core.effectOptions?.fireworks || {};
  const mode = opts.mode === 'sync' || opts.mode === 'mic' ? opts.mode : 'random';

  fwTextOn = !!opts.textOn;
  const wantText = opts.text || '';
  if (fwTextOn && wantText && fwTextBuiltFor !== wantText) {
    buildFwText(core, wantText);
    fwTextBuiltFor = wantText;
  } else if (!wantText) {
    fwTextBuiltFor = null;
  }

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] *= 0.80;

  // See fireworks.js's effectFireworks() comment - quantity slider, only
  // meaningful for the ad-lib random/mic launch loop, not 'sync's fixed
  // choreography.
  const quantity = Math.max(1, Math.min(8, Math.round(opts.quantity) || 1));
  if (mode === 'random' || mode === 'mic') {
    // 'mic' has no audio-input pipeline here (see module comment) - falls
    // back to the same launch cadence as 'random'.
    fwSpawnT += dt;
    if (fwSpawnT > 0.4) {
      for (let i = 0; i < quantity; i++) fwLaunch(core);
      if (Math.random() > 0.6) fwLaunch(core);
      fwSpawnT = 0;
    }
  } else if (mode === 'sync') {
    fwSyncUpdate(core, dt);
  }

  const G = wallH * 0.06;

  // ── Rockets ──
  for (let k = fwRockets.length - 1; k >= 0; k--) {
    const r = fwRockets[k];
    r.vy -= wallH * 0.85 * dt;
    r.v += r.vy * dt;
    r.col += r.vc * dt;
    r.trail.push({ col: r.col, v: r.v });
    if (r.trail.length > 20) r.trail.shift();

    for (let ti = 0; ti < r.trail.length; ti++) {
      const tp = r.trail[ti];
      const fade = ti / r.trail.length;
      const [rh, gh, bh] = hsl(r.hue, 1, fade * 0.95);
      const ix = Math.round(tp.col);
      const wy = wallH - 1 - Math.max(0, Math.min(wallH - 1, Math.round(tp.v)));
      if (ix >= 0 && ix < wallW) fwSet(core, ix, wy, rh, gh, bh);
    }
    if (r.vy <= 0 || r.v >= wallH - 1) { fwBurst(core, r.col, r.v, r.hue, r.hue2); fwRockets.splice(k, 1); }
  }

  // ── Burst particles ──
  for (let k = fwBursts.length - 1; k >= 0; k--) {
    const b = fwBursts[k];
    b.col += b.vc * dt;
    b.v += b.vy * dt;
    b.vy -= G * dt;
    b.life -= b.decay;
    if (b.life <= 0) { fwBursts.splice(k, 1); continue; }

    const ix = Math.round(b.col);
    const iv = Math.round(b.v);
    if (iv < 0 || iv >= wallH || ix < 0 || ix >= wallW) { fwBursts.splice(k, 1); continue; }

    const [rh, gh, bh] = hsl(b.hue, 1, b.life * (b.bright || 0.9));
    fwSet(core, ix, wallH - 1 - iv, rh, gh, bh);
  }

  // ── Scrolling text overlay ──
  drawTextOverlay(core, dt);
}

module.exports = effectFireworksWall;
