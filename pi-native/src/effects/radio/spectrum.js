// Spectrum visualizer render styles - ported from effects-core.js's
// renderSpectrumStyle() family (drawBandBars/drawDotsStyle/drawBlocksStyle/
// drawOutlineStyle/drawRadialStyle/drawVUStyle/drawWaterfallStyle/
// drawWaveformStyle/drawTunnelStyle/drawStormStyle/drawPlasmaStyle/
// drawRingsStyle/drawFireStyle, effects-core.js lines ~480-975). All 13
// styles + the 7-theme colour engine (auColor) + the bloom/glow-halo
// helpers (auBloom/auGlowAround/auDrawPeakCap) are ported.
//
// Only the plumbing changed: every style reads amp/peak/bands/theme/
// barMode/scrollX/t/dt off the passed `ctx` reader object instead of
// reaching into module-level globals (unlike the browser original) -
// core.setLED/setFaceLED already forces every effect in this project
// through an explicit `core` argument (see core.js's module comment for
// why), so the audio data source follows the same convention rather than
// being a second exception to it. auBloom/auGlowAround take `core` as
// their first argument and write directly into core.colBuf via
// core.faceMap (max-blend, same as the browser original) since
// core.setLED/setFaceLED overwrite rather than additively blend - the
// browser's helpers rely on colBuf's max-blend semantics for the "glow
// never darkens what's already there" behaviour, so this reaches past
// setLED the same way the browser reaches past a hypothetical wrapper,
// straight at colBuf/faceMap, matching the original 1:1.
//
// VU meter stays mono (see auReadStereoLevels in effects-core.js): no
// independent stereo channel data is available from the mono-summed FFT
// pipeline (ffmpegAudio.js mono-sums L+R before computing bands - see its
// module comment) - both left/right meters read the same overall
// bass-weighted level. That's a decode-pipeline limitation, explicitly
// out of scope for this pass (audio pipeline architecture untouched).
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

// scrollX is folded in here exactly like the browser's scrolledBand(), which
// reads the module-level auScrollX global unconditionally - including the
// literal double-offset drawWaveform() below reproduces (it pre-offsets its
// own column by scrollX and THEN calls this, same as the original).
function scrolledBand(c, cols, bands, scrollX) {
  const sc = (c + ((scrollX || 0) | 0) + cols) % cols;
  return Math.min(bands - 1, (sc * bands / cols) | 0);
}

// ── Bloom/glow-halo helpers — ported verbatim from effects-core.js's
// auBloom/auGlowAround/auDrawPeakCap (lines ~450-479). Additive (never
// darkens what's already there) — the glow that makes LED bar tips and
// peak caps read as genuinely lit rather than a flat colour swatch.
function auBloom(core, face, u, y, col, coreAmt) {
  const S = core.SIZE;
  if (y < 0 || y >= S || u < 0 || u >= S) return;
  const idx = core.faceMap[face][y * S + u];
  if (idx < 0) return;
  const c0 = Math.min(1, col[0] * coreAmt), c1 = Math.min(1, col[1] * coreAmt), c2 = Math.min(1, col[2] * coreAmt);
  const cb = core.colBuf, o = idx * 3;
  cb[o] = Math.max(cb[o], c0);
  cb[o + 1] = Math.max(cb[o + 1], c1);
  cb[o + 2] = Math.max(cb[o + 2], c2);
}
function auGlowAround(core, face, u, y, col, spread, strength) {
  const S = core.SIZE, cb = core.colBuf;
  for (let g = 1; g <= spread; g++) {
    const fade = strength * (1 - g / (spread + 1));
    for (const dy of [g, -g]) {
      const yy = y + dy; if (yy < 0 || yy >= S) continue;
      const idx = core.faceMap[face][yy * S + u]; if (idx < 0) continue;
      const r = col[0] * fade, g2 = col[1] * fade, b = col[2] * fade;
      const o = idx * 3;
      if (r > cb[o]) cb[o] = r;
      if (g2 > cb[o + 1]) cb[o + 1] = g2;
      if (b > cb[o + 2]) cb[o + 2] = b;
    }
  }
}
// Peak cap: a small glowing diamond instead of one flat white pixel -
// bright core, soft halo, tinted faintly by the bar's own colour so it
// doesn't look like a disconnected sticker on top.
function auDrawPeakCap(core, face, u, y, tint) {
  const glow = [0.55 + tint[0] * 0.45, 0.55 + tint[1] * 0.45, 0.55 + tint[2] * 0.45];
  auBloom(core, face, u, y, glow, 1);
  auGlowAround(core, face, u, y, glow, 2, 0.35);
}

// Polar spectrum layout for top/bottom faces (angle = band, radius =
// level), plus the faint peak arc and bass-hit centre flash.
function drawPolarFace(core, ctx, face) {
  const S = core.SIZE, cc = (S - 1) / 2, maxR = cc * 1.08;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const dx = u - cc, dz = v - cc, r = Math.hypot(dx, dz) / maxR;
      const ang = (Math.atan2(dz, dx) / (Math.PI * 2) + 0.5 + ctx.t * 0.03) % 1;
      const b = Math.min(ctx.bands - 1, (ang * ctx.bands) | 0);
      const amp = ctx.amp(b);
      if (r <= amp) {
        const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - r / Math.max(0.01, amp), amp, ctx.t);
        core.setFaceLED(face, u, v, col[0], col[1], col[2]);
      } else if (Math.abs(r - ctx.peak(b)) < 0.045) {
        core.setFaceLED(face, u, v, 0.8, 0.8, 0.85);
      }
      if (r < bass * 0.22) core.setFaceLED(face, u, v, 1, 1, 1);
    }
  }
}

// Bar-style renderer with the six auBarMode branches (solid/striped/wave/
// falling/center/stacked) plus the separate top-level `mirror` style (the
// 'mirror' spectrum STYLE, distinct from any barMode).
function drawBars(core, ctx, mirror) {
  const S = core.SIZE, M = S - 1, mode = ctx.barMode || 'solid';
  const AB = ctx.bands;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  const barW = Math.round(cols / AB);
  for (let c = 0; c < cols; c++) {
    if (S > 8 && barW > 1 && c % barW === barW - 1) continue;
    const b = scrolledBand(c, cols, AB, ctx.scrollX);
    const amp = ctx.amp(b), fb = b / (AB - 1);
    const [face, u] = sideCol(core, c);

    if (mirror) {
      const mid = (S - 1) / 2, half = amp * S * 0.5;
      for (let y = 0; y < S; y++) {
        const d = Math.abs(y - mid);
        if (d <= half) {
          const fh = half > 0 ? 1 - d / half : 0;
          const edgeSoft = Math.min(1, (half - d + 1) * 0.6);
          const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
          if (mode === 'striped' && (y & 1)) core.setFaceLED(face, u, y, col[0] * 0.15, col[1] * 0.15, col[2] * 0.15);
          else core.setFaceLED(face, u, y, col[0] * edgeSoft, col[1] * edgeSoft, col[2] * edgeSoft);
        }
      }
      const pk = ctx.peak(b) * S * 0.5;
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      auDrawPeakCap(core, face, u, Math.min(M, Math.round(mid + pk)), tint);
      auDrawPeakCap(core, face, u, Math.max(0, Math.round(mid - pk)), tint);
      continue;
    }

    const waveOff = mode === 'wave' ? Math.sin(c * 0.15 + ctx.t * 3) * M * 0.15 : 0;
    const rawH = amp * M;

    if (mode === 'falling') {
      const hi = Math.min(M, Math.round(rawH));
      for (let y = 0; y <= hi; y++) {
        const fy = M - y;
        const fh = hi > 0 ? y / hi : 0;
        const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
        core.setFaceLED(face, u, fy, col[0], col[1], col[2]);
      }
      if (rawH > 0) {
        const tp = auColor(ctx.theme, fb, 1, amp, ctx.t);
        const tipY = Math.max(0, M - hi);
        auBloom(core, face, u, tipY, tp, 1.5);
        auGlowAround(core, face, u, tipY, tp, 2, 0.3);
      }
      auDrawPeakCap(core, face, u, Math.max(0, M - Math.round(ctx.peak(b) * M)), auColor(ctx.theme, fb, 1, amp, ctx.t));

    } else if (mode === 'center') {
      const mid = (S - 1) / 2, half = rawH * 0.5;
      for (let y = 0; y < S; y++) {
        const d = Math.abs(y - mid);
        if (d <= half) {
          const fh = half > 0 ? 1 - d / half : 0;
          const edgeSoft = Math.min(1, (half - d + 1) * 0.6);
          const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
          core.setFaceLED(face, u, y, col[0] * edgeSoft, col[1] * edgeSoft, col[2] * edgeSoft);
        }
      }
      const pk = ctx.peak(b) * M * 0.5;
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      auDrawPeakCap(core, face, u, Math.min(M, Math.round(mid + pk)), tint);
      auDrawPeakCap(core, face, u, Math.max(0, Math.round(mid - pk)), tint);

    } else if (mode === 'stacked') {
      const SEG = 4;
      const segs = Math.round(rawH / SEG);
      for (let s = 0; s < segs; s++) {
        const yBase = s * SEG;
        const fh = segs > 0 ? s / segs : 0;
        const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
        for (let dy = 0; dy < SEG - 1; dy++) {
          const y = yBase + dy; if (y > M) break;
          const cellFrac = dy / (SEG - 2 || 1);
          const bevel = 0.55 + 0.45 * Math.sin(cellFrac * Math.PI);
          core.setFaceLED(face, u, y, col[0] * bevel, col[1] * bevel, col[2] * bevel);
        }
      }
      const pkSeg = Math.round(ctx.peak(b) * M / SEG);
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      for (let dy = 0; dy < SEG - 1; dy++) {
        const y = pkSeg * SEG + dy; if (y > M) break;
        auBloom(core, face, u, y, tint, 1.3);
      }

    } else {
      // solid, striped, wave
      const h = rawH + waveOff, hi = Math.max(0, Math.min(M, Math.round(h)));
      const frac = h - Math.floor(h);
      for (let y = 0; y <= hi; y++) {
        const fh = hi > 0 ? y / hi : 0;
        const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
        if (mode === 'striped' && (y & 1)) {
          core.setFaceLED(face, u, y, col[0] * 0.15, col[1] * 0.15, col[2] * 0.15);
        } else {
          const isTip = (y === hi);
          const bright = isTip ? Math.max(0.35, frac) : 1;
          core.setFaceLED(face, u, y, col[0] * bright, col[1] * bright, col[2] * bright);
        }
      }
      if (h > 0) {
        const tp = auColor(ctx.theme, fb, 1, amp, ctx.t);
        auBloom(core, face, u, hi, tp, 1.5);
        auGlowAround(core, face, u, hi, tp, 3, 0.4);
      }
      auDrawPeakCap(core, face, u, Math.max(0, Math.min(M, Math.round(ctx.peak(b) * M + waveOff))), auColor(ctx.theme, fb, 1, amp, ctx.t));
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// Dotted trail: every dot glows (not just the tip), spacing pulses subtly
// with the level, and the lead dot gets a bright core + soft halo.
function drawDots(core, ctx) {
  const S = core.SIZE, M = S - 1;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands, ctx.scrollX);
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const [face, u] = sideCol(core, c);
    const h = amp * M;
    const ly = Math.min(M, Math.round(h));
    const spacing = Math.max(2, 3 - Math.round(amp * 1.4));
    for (let y = 0; y <= ly; y += spacing) {
      const fh = ly > 0 ? y / ly : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      const isLead = (y + spacing > ly);
      const fade = isLead ? 1 : 0.35 + 0.45 * fh;
      core.setFaceLED(face, u, y, col[0] * fade, col[1] * fade, col[2] * fade);
      if (isLead) { auBloom(core, face, u, y, col, 1.3); auGlowAround(core, face, u, y, col, 2, 0.4); }
    }
    const peakY = Math.min(M, Math.round(ctx.peak(b) * M));
    auDrawPeakCap(core, face, u, peakY, auColor(ctx.theme, fb, 1, amp, ctx.t));
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
      const isTopBlock = (blk === blocks - 1);
      const yBase = blk * BLOCK;
      for (let dy = 0; dy < BLOCK - 1; dy++) {
        const y = yBase + dy; if (y >= S) break;
        const cellFrac = dy / (BLOCK - 2 || 1);
        const bevel = 0.6 + 0.4 * Math.sin(cellFrac * Math.PI);
        for (let dc = 0; dc < dcMax; dc++) {
          const c = b * bandW + dc; if (c >= cols) break;
          const [face, u] = sideCol(core, c);
          core.setFaceLED(face, u, y, col[0] * bevel, col[1] * bevel, col[2] * bevel);
        }
      }
      if (isTopBlock) {
        for (let dc = 0; dc < dcMax; dc++) {
          const c = b * bandW + dc; if (c >= cols) break;
          const [face, u] = sideCol(core, c);
          auGlowAround(core, face, u, yBase + 1, col, 2, 0.3);
        }
      }
    }
    const pkBlk = Math.round(ctx.peak(b) * (S / BLOCK));
    const pkY = pkBlk * BLOCK;
    const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
    for (let dy = 0; dy < BLOCK - 1; dy++) {
      const y = pkY + dy; if (y >= S) break;
      for (let dc = 0; dc < dcMax; dc++) {
        const c = b * bandW + dc; if (c >= cols) break;
        const [face, u] = sideCol(core, c);
        auBloom(core, face, u, y, tint, 1.3);
      }
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// Glowing silhouette: a continuous line across the spectrum's top edge
// (interpolated between columns), a faint colour-graded fill underneath,
// and a proper glowing peak cap.
function drawOutline(core, ctx) {
  const S = core.SIZE, M = S - 1;
  const cols = core.panelMode === '2d' ? S : 4 * S;
  const pts = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands, ctx.scrollX);
    pts[c] = ctx.amp(b) * M;
  }
  for (let c = 0; c < cols; c++) {
    const b = scrolledBand(c, cols, ctx.bands, ctx.scrollX);
    const fb = b / (ctx.bands - 1), amp = ctx.amp(b);
    const [face, u] = sideCol(core, c);
    const yHere = pts[c], yNext = pts[(c + 1) % cols];
    const y0 = Math.round(yHere);
    const col = auColor(ctx.theme, fb, 1, amp, ctx.t);

    for (let y = 0; y < y0; y++) {
      const fh = y0 > 0 ? y / y0 : 0;
      const fillCol = auColor(ctx.theme, fb, fh, amp, ctx.t);
      core.setFaceLED(face, u, y, fillCol[0] * 0.12, fillCol[1] * 0.12, fillCol[2] * 0.12);
    }

    const steps = Math.max(1, Math.abs(Math.round(yNext - yHere)));
    for (let s = 0; s <= steps; s++) {
      const yy = Math.round(yHere + (yNext - yHere) * (s / steps));
      if (yy < 0 || yy > M) continue;
      core.setFaceLED(face, u, yy, Math.min(1, col[0] * 1.3), Math.min(1, col[1] * 1.3), Math.min(1, col[2] * 1.3));
    }
    auGlowAround(core, face, u, y0, col, 3, 0.45);
    auDrawPeakCap(core, face, u, Math.min(M, Math.round(ctx.peak(b) * M)), col);
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// Radial: expanding beat-triggered shockwave rings (persisted in `state`,
// same particle-array shape as the browser's auRings) + spectral wash on
// the 4 side faces.
function drawRadial(core, ctx, state) {
  const S = core.SIZE, cc = (S - 1) / 2;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (!state.radialRings) state.radialRings = [];
  if (state.radialPrevBass === undefined) state.radialPrevBass = 0;
  if (bass > 0.5 && state.radialPrevBass <= 0.5 && state.radialRings.length < 12) state.radialRings.push({ r: 0, hue: Math.random() });
  state.radialPrevBass = bass;
  for (const ring of state.radialRings) ring.r += ctx.dt * S * 0.85;
  for (let k = state.radialRings.length - 1; k >= 0; k--) if (state.radialRings[k].r > S * 0.95) state.radialRings.splice(k, 1);
  for (let f = 0; f < 4; f++) {
    const face = [0, 2, 1, 3][f];
    for (let v = 0; v < S; v++) {
      for (let u = 0; u < S; u++) {
        const r = Math.hypot(u - cc, v - cc);
        const b = Math.min(ctx.bands - 1, (((u / (S - 1)) * 0.25 + f * 0.25) * ctx.bands) | 0);
        const bandAmp = ctx.amp(b);
        const amp = bandAmp * 0.28;
        const bg = auColor(ctx.theme, b / (ctx.bands - 1), v / (S - 1), bandAmp, ctx.t);
        let rr = bg[0] * amp, gg = bg[1] * amp, bb = bg[2] * amp;
        for (const ring of state.radialRings) {
          const dd = r - ring.r;
          const w = dd >= 0 ? 1.2 : 2.4;
          if (Math.abs(dd) < w) {
            const inten = (1 - Math.abs(dd) / w) * (1 - ring.r / (S * 0.95));
            const c = hsl(ring.hue, 1, 0.55);
            if (c[0] * inten > rr) rr = c[0] * inten;
            if (c[1] * inten > gg) gg = c[1] * inten;
            if (c[2] * inten > bb) bb = c[2] * inten;
          }
        }
        core.setFaceLED(face, u, v, rr, gg, bb);
      }
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

// VU meter: mono (see module comment - no independent stereo channel data
// in the mono-summed FFT pipeline) - both left/right meters read the same
// overall bass-weighted level.
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
      const b = scrolledBand(c, cols, ctx.bands, ctx.scrollX);
      const amp = state.wfBuf[hist * ctx.bands + b];
      if (amp < 0.035) continue;
      const [face, u] = sideCol(core, c);
      const bright = amp * fade;
      const col = auColor(ctx.theme, b / (ctx.bands - 1), amp, amp, ctx.t);
      core.setFaceLED(face, u, S - 1 - row, col[0] * bright * 1.4, col[1] * bright * 1.4, col[2] * bright * 1.4);
      // Freshest row gets a soft bloom so new hits punch through the trail
      if (row === 0 && amp > 0.3) auBloom(core, face, u, S - 1 - row, col, 1.2);
    }
  }
  drawPolarFace(core, ctx, 4); drawPolarFace(core, ctx, 5);
}

function drawWaveform(core, ctx) {
  const S = core.SIZE, M = S - 1, cols = 4 * S, mid = M / 2;
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] *= 0.80;
  for (let c = 0; c < cols; c++) {
    // NB: this pre-offsets its own column by scrollX AND THEN calls
    // scrolledBand() (which folds scrollX in again) - a literal
    // reproduction of the browser original's drawWaveformStyle(), not a
    // simplification, per the "exact copy" brief.
    const sc = (c + ((ctx.scrollX || 0) | 0) + cols) % cols;
    const b = scrolledBand(sc, cols, ctx.bands, ctx.scrollX);
    const amp = ctx.amp(b) * Math.sin(sc * 0.35);
    const y = Math.round(mid - amp * mid * 0.9);
    const fy = Math.max(0, Math.min(M, y));
    const [face, u] = sideCol(core, c);
    const hue = (sc / cols + ctx.t * 0.04) % 1;
    const col = hsl(hue, 1, 0.9);
    core.setFaceLED(face, u, fy, col[0], col[1], col[2]);
    for (let dy = 1; dy <= 5; dy++) {
      const gl = (1 - dy / 6) * 0.42;
      core.setFaceLED(face, u, fy + dy, col[0] * gl, col[1] * gl, col[2] * gl);
      core.setFaceLED(face, u, fy - dy, col[0] * gl, col[1] * gl, col[2] * gl);
    }
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
        const scrollFrac = ctx.scrollX ? (ctx.scrollX / (4 * S)) * 2 : 0;
        const animated = (ring + ctx.t * 0.45 * (1 + bass * 0.5) + scrollFrac) % 1;
        const b = Math.min(ctx.bands - 1, (animated * ctx.bands) | 0);
        const amp = ctx.amp(b);
        if (amp < 0.04) {
          const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - ring, 0.06, ctx.t);
          core.setFaceLED(f, u, v, col[0] * 0.05, col[1] * 0.05, col[2] * 0.05);
          continue;
        }
        const bright = amp * (1 - ring * 0.35) * 0.92;
        const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - ring, amp, ctx.t);
        core.setFaceLED(f, u, v, col[0] * bright, col[1] * bright, col[2] * bright);
      }
    }
  }
  // Bass hit flashes a white-hot core at dead centre of every face
  if (bass > 0.55) {
    const cc = (S - 1) / 2, coreR = 1 + bass * 1.5;
    for (let f = 0; f < 6; f++) {
      for (let dv = -coreR; dv <= coreR; dv++) {
        for (let du = -coreR; du <= coreR; du++) {
          const d = Math.hypot(du, dv); if (d > coreR) continue;
          const u = Math.round(cc + du), v = Math.round(cc + dv);
          if (u < 0 || u >= S || v < 0 || v >= S) continue;
          auBloom(core, f, u, v, [1, 1, 1], (1 - d / coreR) * (bass - 0.55) * 2.2);
        }
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
    const b = scrolledBand(c, cols, ctx.bands, ctx.scrollX);
    const raw = ctx.amp(b), amp = raw * 0.4;
    if (amp < 0.03) continue;
    const [face, u] = sideCol(core, c);
    const col = auColor(ctx.theme, b / (ctx.bands - 1), 1, raw, ctx.t);
    for (let y = 0; y < Math.round(amp * (S - 1)); y++) core.setFaceLED(face, u, y, col[0] * amp, col[1] * amp, col[2] * amp);
  }
  // Bright core plus jagged bolt-like flicker, and a hot white centre on
  // the freshest strikes.
  for (let k = state.flashes.length - 1; k >= 0; k--) {
    const fl = state.flashes[k]; fl.life -= ctx.dt * 3.5;
    if (fl.life <= 0) { state.flashes.splice(k, 1); continue; }
    const R = Math.ceil(fl.size * fl.life);
    for (let dv = -R; dv <= R; dv++) {
      for (let du = -R; du <= R; du++) {
        const d2 = du * du + dv * dv; if (d2 > R * R) continue;
        const jag = 0.75 + 0.25 * Math.sin(du * 2.7 + dv * 3.1 + fl.life * 20);
        const bright = fl.life * (1 - Math.sqrt(d2) / R) * 0.95 * jag;
        const col = hsl(fl.hue, 0.5 + fl.life * 0.5, bright);
        core.setFaceLED(fl.face, fl.u + du, fl.v + dv, col[0], col[1], col[2]);
      }
    }
    if (fl.life > 0.7) auBloom(core, fl.face, fl.u, fl.v, [1, 1, 1], (fl.life - 0.7) / 0.3);
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
          const flicker = 0.85 + 0.15 * Math.sin(u * 7.3 + ctx.t * 12 + v * 3.1);
          let rr, gg, bb;
          if (frac < 0.3) { rr = 1; gg = 0.95; bb = 0.4 * (1 - frac / 0.3); }
          else if (frac < 0.7) { const mf = (frac - 0.3) / 0.4; rr = 1; gg = 0.95 - mf * 0.6; bb = 0; }
          else { const tf = (frac - 0.7) / 0.3; rr = 1 - tf * 0.5; gg = 0.35 - tf * 0.3; bb = 0; }
          const bright = flicker * (1 - frac * 0.3);
          core.setFaceLED(face, u, v, Math.min(1, rr * bright), Math.min(1, gg * bright), Math.min(1, bb * bright));
        }
      }
      // White-hot tip on tall flames
      if (h > M * 0.5) {
        const tipU = Math.floor((colStart + colEnd - 1) / 2);
        auBloom(core, face, tipU, Math.min(M, h), [1, 0.98, 0.85], 0.9);
      }
    }
  }
  const glow = (ctx.amp(0) + ctx.amp(1)) * 0.12;
  if (glow > 0.02) {
    const S2 = core.SIZE;
    for (let v = 0; v < S2; v++) {
      for (let u = 0; u < S2; u++) {
        const idx = core.faceMap[4][v * S2 + u];
        if (idx >= 0) {
          const o = idx * 3;
          if (glow > core.colBuf[o]) core.colBuf[o] = glow;
          if (glow * 0.3 > core.colBuf[o + 1]) core.colBuf[o + 1] = glow * 0.3;
        }
      }
    }
  }
}

// Persistent per-instance state (ring particles, waterfall history, storm
// flashes, radial shockwave rings, scroll offset) that some styles need
// across frames - kept alongside the effect module rather than at this
// module's top level so multiple radio effect instances (if any) don't
// share state.
function createSpectrumState() {
  return {};
}

function renderSpectrumStyle(core, ctx, style, state) {
  switch (style) {
    case 'mirror': return drawBars(core, ctx, true);
    case 'dots': return drawDots(core, ctx);
    case 'blocks': return drawBlocks(core, ctx);
    case 'outline': return drawOutline(core, ctx);
    case 'radial': return drawRadial(core, ctx, state);
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

module.exports = { renderSpectrumStyle, createSpectrumState, auColor, auBloom, auGlowAround, auDrawPeakCap };
