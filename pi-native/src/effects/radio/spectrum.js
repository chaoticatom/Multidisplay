// Spectrum visualizer render styles - ported from effects-core.js's
// renderSpectrumStyle() family (drawBandBars/drawDotsStyle/drawBlocksStyle/
// drawOutlineStyle/drawRadialStyle/drawVUStyle/drawWaterfallStyle/
// drawWaveformStyle/drawTunnelStyle/drawStormStyle/drawPlasmaStyle/
// drawRingsStyle/drawFireStyle, effects-core.js lines ~560-975). All 13
// styles + the 7-theme colour engine (auColor) are ported; some are
// simplified relative to the browser original (documented per-style below)
// rather than reproduced pixel-for-pixel, since exact bloom/glow-halo
// helpers (auBloom/auGlowAround) and true stereo VU data aren't available
// here in the same form - see radio.js's module comment for what's kept vs
// simplified.
//
// Takes a plain `{ amp(b), peak(b), bands, theme, barMode, t, dt }` reader
// object rather than reaching into module-level globals (unlike the
// browser original) - core.setLED/setFaceLED already forces every effect
// in this project through an explicit `core` argument (see core.js's
// module comment for why), so the audio data source follows the same
// convention rather than being a second exception to it.
'use strict';

const { hsl } = require('../../core');

// Same 7 colour themes as auColor() in effects-core.js.
function auColor(theme, fb, fh, amp, t) {
  switch (theme) {
    case 1: return hsl(0.02 + fh * 0.12, 1, 0.16 + fh * 0.42 + amp * 0.08); // Fire
    case 2: return hsl(0.62 - fh * 0.14, 0.95, 0.16 + fh * 0.40 + amp * 0.08); // Ocean
    case 3: return hsl(((fb * 256) | 0) % 2 ? 0.86 : 0.5, 1, 0.22 + fh * 0.35 + amp * 0.1); // Neon
    case 4: return hsl(0.34, 1, 0.10 + fh * 0.50 + amp * 0.06); // Matrix
    case 5: return hsl(fb * 0.85 + t * 0.05, 0.55, 0.35 + fh * 0.35 + amp * 0.08); // Pastel
    case 6: { // VU Meter
      const yellowAt = 0.75;
      const hue = fh < yellowAt ? 0.34 - (0.34 - 0.15) * (fh / yellowAt) : 0.15 - 0.15 * ((fh - yellowAt) / (1 - yellowAt));
      const light = Math.min(0.72, 0.20 + fh * 0.34 + amp * 0.18);
      return hsl(hue, 1, light);
    }
    default: return hsl(fb * 0.85, 1, 0.18 + fh * 0.38 + amp * 0.1); // Rainbow
  }
}

// Map a display column 0..4*SIZE-1 to (face,u), matching sideCol() -
// front/right/back/left, wrapping around the 4 side faces.
function sideCol(core, c) {
  const S = core.SIZE, q = ((c / S) | 0) % 4, u = ((c % S) + S) % S;
  if (q === 0) return [0, u];
  if (q === 1) return [2, u];
  if (q === 2) return [1, u];
  return [3, u];
}

function scrolledBand(c, cols, bands) {
  return Math.min(bands - 1, (c * bands / cols) | 0);
}

// Simple polar layout for top/bottom faces (angle = band, radius = level) -
// same idea as drawPolarFace() in the original.
function drawPolarFace(core, ctx, face) {
  const S = core.SIZE, cc = (S - 1) / 2, maxR = cc * 1.08;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const dx = u - cc, dz = v - cc, r = Math.hypot(dx, dz) / maxR;
      if (r > 1) continue;
      const ang = (Math.atan2(dz, dx) / (Math.PI * 2) + 0.5 + ctx.t * 0.03) % 1;
      const b = Math.min(ctx.bands - 1, (ang * ctx.bands) | 0);
      const amp = ctx.amp(b);
      if (r <= amp) {
        const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - r / Math.max(0.01, amp), amp, ctx.t);
        core.setFaceLED(face, u, v, col[0], col[1], col[2]);
      }
    }
  }
}

function drawBars(core, ctx, mirror) {
  const S = core.SIZE, M = S - 1;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands);
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const [face, u] = sideCol(core, c);
    const h = Math.round(amp * M);
    for (let y = 0; y <= h; y++) {
      const fh = h > 0 ? y / h : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      core.setFaceLED(face, u, mirror ? M - y : y, col[0], col[1], col[2]);
    }
    const pk = Math.round(ctx.peak(b) * M);
    const pcol = auColor(ctx.theme, fb, 1, amp, ctx.t);
    core.setFaceLED(face, u, mirror ? M - pk : pk, Math.min(1, pcol[0] + 0.3), Math.min(1, pcol[1] + 0.3), Math.min(1, pcol[2] + 0.3));
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawDots(core, ctx) {
  const S = core.SIZE, M = S - 1;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands);
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const [face, u] = sideCol(core, c);
    const h = amp * M;
    const ly = Math.min(M, Math.round(h));
    const spacing = Math.max(2, 3 - Math.round(amp * 1.4));
    for (let y = 0; y <= ly; y += spacing) {
      const fh = ly > 0 ? y / ly : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      core.setFaceLED(face, u, y, col[0], col[1], col[2]);
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawBlocks(core, ctx) {
  const S = core.SIZE, BLOCK = 4;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  const bandW = Math.max(1, Math.floor(cols / ctx.bands));
  const dcMax = bandW > 1 ? bandW - 1 : 1;
  for (let b = 0; b < ctx.bands; b++) {
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const blocks = Math.round(amp * (S / BLOCK));
    for (let blk = 0; blk < blocks; blk++) {
      const fh = blocks > 0 ? blk / blocks : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      const yBase = blk * BLOCK;
      for (let dy = 0; dy < BLOCK - 1; dy++) {
        const y = yBase + dy; if (y >= S) break;
        for (let dc = 0; dc < dcMax; dc++) {
          const c = b * bandW + dc; if (c >= cols) break;
          const [face, u] = sideCol(core, c);
          core.setFaceLED(face, u, y, col[0], col[1], col[2]);
        }
      }
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawOutline(core, ctx) {
  const S = core.SIZE, M = S - 1;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands);
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const [face, u] = sideCol(core, c);
    const y = Math.min(M, Math.round(amp * M));
    const col = auColor(ctx.theme, fb, 1, amp, ctx.t);
    core.setFaceLED(face, u, y, col[0], col[1], col[2]);
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// Radial: expanding beat-triggered rings + spectral wash - simplified from
// the original (no persistent ring-particle array kept across calls; uses
// a single time-driven pulse instead) since that bit of extra state isn't
// essential to the visual and keeps this module stateless/easy to test.
function drawRadial(core, ctx) {
  const S = core.SIZE, cc = (S - 1) / 2;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  for (let f = 0; f < 4; f++) {
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const r = Math.hypot(u - cc, v - cc) / (cc * 1.05);
        const b = Math.min(ctx.bands - 1, (((u / (S - 1)) * 0.25 + f * 0.25) * ctx.bands) | 0);
        const bandAmp = ctx.amp(b);
        const amp = bandAmp * (0.28 + bass * 0.2 * (1 - r));
        const col = auColor(ctx.theme, b / (ctx.bands - 1), v / (S - 1), bandAmp, ctx.t);
        core.setFaceLED(f, u, v, col[0] * amp, col[1] * amp, col[2] * amp);
      }
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// VU meter: simplified to mono (no independent stereo channel data
// available from the mono-summed FFT pipeline - see ffmpegAudio.js's
// module comment / CLAUDE.md's explicit "acceptable simplification" note)
// - both left/right meters read the same overall bass-weighted level.
function drawVU(core, ctx) {
  const S = core.SIZE, M = S - 1;
  let lvl = 0;
  for (let b = 0; b < Math.min(8, ctx.bands); b++) lvl += ctx.amp(b);
  lvl = Math.min(1, lvl / 4);
  const u0 = Math.round(S * 0.18), u1 = Math.round(S * 0.82);
  const faces = [0, 2, 1, 3];
  const rows = Math.round(lvl * M);
  for (const face of faces) {
    for (let y = 0; y <= rows; y++) {
      const fy = y / M;
      const col = fy < 0.6 ? hsl(0.33, 1, 0.28 + fy * 0.15) : fy < 0.85 ? hsl(0.12, 1, 0.4) : hsl(0.0, 1, 0.42);
      for (let u = u0; u <= u1; u++) core.setFaceLED(face, u, y, col[0], col[1], col[2]);
    }
  }
  const cc = (S - 1) / 2;
  for (let face = 4; face <= 5; face++) {
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const r = Math.hypot(u - cc, v - cc) / (cc * 1.05);
        if (r <= lvl) {
          const col = r < 0.6 ? hsl(0.33, 1, 0.25 + r * 0.2) : r < 0.85 ? hsl(0.12, 1, 0.4) : hsl(0, 1, 0.42);
          core.setFaceLED(face, u, v, col[0], col[1], col[2]);
        }
      }
    }
  }
}

function drawWaterfall(core, ctx, state) {
  const S = core.SIZE, cols = 4 * S;
  if (!state.wfBuf || state.wfBuf.length !== S * ctx.bands) { state.wfBuf = new Float32Array(S * ctx.bands); state.wfPos = 0; state.wfTimer = 0; }
  state.wfTimer += ctx.dt;
  if (state.wfTimer > 1 / 30) {
    state.wfTimer = 0;
    for (let b = 0; b < ctx.bands; b++) state.wfBuf[state.wfPos * ctx.bands + b] = ctx.amp(b);
    state.wfPos = (state.wfPos + 1) % S;
  }
  for (let row = 0; row < S; row++) {
    const hist = (state.wfPos - 1 - row + S) % S;
    const age = row / S;
    const fade = Math.pow(1 - age * 0.72, 1.3);
    for (let c = 0; c < cols; c++) {
      const b = scrolledBand(c, cols, ctx.bands);
      const amp = state.wfBuf[hist * ctx.bands + b];
      if (amp < 0.035) continue;
      const [face, u] = sideCol(core, c);
      const bright = amp * fade;
      const col = auColor(ctx.theme, b / (ctx.bands - 1), amp, amp, ctx.t);
      core.setFaceLED(face, u, S - 1 - row, col[0] * bright * 1.4, col[1] * bright * 1.4, col[2] * bright * 1.4);
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawWaveform(core, ctx) {
  const S = core.SIZE, M = S - 1, cols = 4 * S, mid = M / 2;
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] *= 0.80;
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands);
    const amp = ctx.amp(b) * Math.sin(c * 0.35);
    const y = Math.round(mid - amp * mid * 0.9);
    const fy = Math.max(0, Math.min(M, y));
    const [face, u] = sideCol(core, c);
    const hue = (c / cols + ctx.t * 0.04) % 1;
    const col = hsl(hue, 1, 0.9);
    core.setFaceLED(face, u, fy, col[0], col[1], col[2]);
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawTunnel(core, ctx) {
  const S = core.SIZE;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const du = Math.abs(u - (S - 1) / 2) / (S / 2);
        const dv = Math.abs(v - (S - 1) / 2) / (S / 2);
        const ring = Math.max(du, dv);
        const animated = (ring + ctx.t * 0.45 * (1 + bass * 0.5)) % 1;
        const b = Math.min(ctx.bands - 1, (animated * ctx.bands) | 0);
        const amp = ctx.amp(b);
        const bright = amp < 0.04 ? 0.05 : amp * (1 - ring * 0.35) * 0.92;
        const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - ring, amp, ctx.t);
        core.setFaceLED(f, u, v, col[0] * bright, col[1] * bright, col[2] * bright);
      }
    }
  }
}

function drawStorm(core, ctx, state) {
  const S = core.SIZE, cols = 4 * S;
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] *= 0.72;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (!state.flashes) state.flashes = [];
  if (bass > 0.52 && Math.random() < bass * ctx.dt * 18 && state.flashes.length < 12) {
    state.flashes.push({ face: Math.random() * 4 | 0, u: Math.random() * S | 0, v: Math.random() * S | 0, life: 1, hue: 0.58 + Math.random() * 0.16, size: Math.max(2, (bass * S * 0.14) | 0) });
  }
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands);
    const raw = ctx.amp(b), amp = raw * 0.4;
    if (amp < 0.03) continue;
    const [face, u] = sideCol(core, c);
    const col = auColor(ctx.theme, b / (ctx.bands - 1), 1, raw, ctx.t);
    for (let y = 0; y < Math.round(amp * (S - 1)); y++) core.setFaceLED(face, u, y, col[0] * amp, col[1] * amp, col[2] * amp);
  }
  for (let k = state.flashes.length - 1; k >= 0; k--) {
    const fl = state.flashes[k]; fl.life -= ctx.dt * 3.5;
    if (fl.life <= 0) { state.flashes.splice(k, 1); continue; }
    const R = Math.ceil(fl.size * fl.life);
    for (let dv = -R; dv <= R; dv++) {
      for (let du = -R; du <= R; du++) {
        const d2 = du * du + dv * dv; if (d2 > R * R) continue;
        const bright = fl.life * (1 - Math.sqrt(d2) / R) * 0.95;
        const col = hsl(fl.hue, 0.5 + fl.life * 0.5, bright);
        core.setFaceLED(fl.face, fl.u + du, fl.v + dv, col[0], col[1], col[2]);
      }
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawPlasma(core, ctx) {
  let energy = 0;
  for (let i = 0; i < Math.min(32, ctx.bands); i++) energy += ctx.amp(i);
  energy /= Math.min(32, ctx.bands);
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  const hueShift = ctx.t * 0.12 * (1 + bass * 3);
  const { surfX, surfY, surfZ, N } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const p1 = Math.sin(x * 4.5 + ctx.t * 1.3) + Math.sin(y * 3.8 - ctx.t * 0.9);
    const p2 = Math.sin(z * 5.1 + ctx.t * 0.7) + Math.sin((x + y) * 2.9 + ctx.t * 1.1);
    const p3 = Math.sin((x - z) * 3.3 + ctx.t * 1.5) + Math.cos((y + z) * 4.1 - ctx.t * 0.6);
    const plasma = (p1 + p2 + p3) / 6 + 0.5;
    const intensity = plasma * (0.15 + energy * 0.85);
    const hue = (plasma * 0.5 + hueShift + x * 0.1 + z * 0.1) % 1;
    const [r, g, b] = hsl((hue + 1) % 1, 1, Math.min(1, intensity * 0.9));
    core.setLED(i, r, g, b);
  }
}

function drawRings(core, ctx, state) {
  if (!state.rings) state.rings = [];
  if (state.ringTimer === undefined) state.ringTimer = 0;
  state.ringTimer += ctx.dt;
  const bassHit = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (bassHit > 0.35 && state.ringTimer > 0.2 && state.rings.length < 12) {
    state.ringTimer = 0;
    state.rings.push({ face: Math.floor(Math.random() * 6), cx: Math.random() * core.SIZE, cy: Math.random() * core.SIZE, radius: 0, hue: Math.random(), bright: 1 });
  }
  const S = core.SIZE;
  for (let ri = state.rings.length - 1; ri >= 0; ri--) {
    const ring = state.rings[ri];
    ring.radius += ctx.dt * S * 1.2;
    ring.bright -= ctx.dt * 0.7;
    if (ring.bright <= 0) { state.rings.splice(ri, 1); continue; }
    const w = 3;
    const rMax = Math.ceil(ring.radius + w);
    const uMin = Math.max(0, Math.floor(ring.cx - rMax)), uMax = Math.min(S - 1, Math.ceil(ring.cx + rMax));
    const vMin = Math.max(0, Math.floor(ring.cy - rMax)), vMax = Math.min(S - 1, Math.ceil(ring.cy + rMax));
    const [cr, cg, cb] = hsl(ring.hue, 1, ring.bright * 0.9);
    for (let v = vMin; v <= vMax; v++) {
      for (let u = uMin; u <= uMax; u++) {
        const d = Math.abs(Math.hypot(u - ring.cx, v - ring.cy) - ring.radius);
        if (d < w) {
          const a = Math.max(1 - d / (w * 0.4), (1 - d / w) * 0.5);
          core.setFaceLED(ring.face, u, v, cr * a, cg * a, cb * a);
        }
      }
    }
  }
}

function drawFire(core, ctx) {
  const S = core.SIZE, M = S - 1;
  const sides = [2, 0, 3, 1];
  for (const face of sides) {
    const colW = S / ctx.bands;
    for (let b = 0; b < ctx.bands; b++) {
      const spec = ctx.amp(b);
      if (spec < 0.02) continue;
      const h = Math.round(spec * M);
      const colStart = Math.floor(b * colW), colEnd = Math.min(S, Math.floor((b + 1) * colW));
      for (let u = colStart; u < colEnd; u++) {
        for (let v = 0; v < h; v++) {
          const frac = v / h;
          let rr, gg, bb;
          if (frac < 0.3) { rr = 1; gg = 0.95; bb = 0.4 * (1 - frac / 0.3); }
          else if (frac < 0.7) { const mf = (frac - 0.3) / 0.4; rr = 1; gg = 0.95 - mf * 0.6; bb = 0; }
          else { const tf = (frac - 0.7) / 0.3; rr = 1 - tf * 0.5; gg = 0.35 - tf * 0.3; bb = 0; }
          const bright = (1 - frac * 0.3);
          core.setFaceLED(face, u, v, Math.min(1, rr * bright), Math.min(1, gg * bright), Math.min(1, bb * bright));
        }
      }
    }
  }
}

// Persistent per-instance state (ring particles, waterfall history, storm
// flashes) that some styles need across frames - kept alongside the effect
// module rather than at this module's top level so multiple radio effect
// instances (if any) don't share state.
function createSpectrumState() {
  return {};
}

function renderSpectrumStyle(core, ctx, style, state) {
  switch (style) {
    case 'mirror': return drawBars(core, ctx, true);
    case 'dots': return drawDots(core, ctx);
    case 'blocks': return drawBlocks(core, ctx);
    case 'outline': return drawOutline(core, ctx);
    case 'radial': return drawRadial(core, ctx);
    case 'vu': return drawVU(core, ctx);
    case 'waterfall': return drawWaterfall(core, ctx, state);
    case 'waveform': return drawWaveform(core, ctx);
    case 'tunnel': return drawTunnel(core, ctx);
    case 'storm': return drawStorm(core, ctx, state);
    case 'plasma': return drawPlasma(core, ctx);
    case 'rings': return drawRings(core, ctx, state);
    case 'fire': return drawFire(core, ctx);
    default: return drawBars(core, ctx, false);
  }
}

module.exports = { renderSpectrumStyle, createSpectrumState, auColor };
