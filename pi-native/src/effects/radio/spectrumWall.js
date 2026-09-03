// Wall-mode counterpart to ./spectrum.js's renderSpectrumStyle() family.
//
// Shape check (per the batch brief): every style in spectrum.js already
// draws onto a flat `cols x S` rectangle - `cols` is either S (single
// panel, core.panelMode==='2d') or 4*S (four cube side faces stitched
// side-by-side via sideCol()), and each column is placed via
// core.setFaceLED(face,u,y,...). That's already "generalize the is2D
// branch" shape: for the wall canvas, cols becomes core.wallW, the row
// axis becomes core.wallH (not necessarily square, unlike the cube's S),
// and every pixel write goes straight through core.setWallPixel(x,y,...)
// (or a max-blend write against core.wallBuf for the bloom/glow helpers,
// same convention neoWall.js/weatherWall.js already use) - no face/
// sideCol indirection needed since the wall is already one flat canvas.
//
// auColor() (the 7-theme colour engine) is imported and reused VERBATIM
// from ./spectrum.js - it's pure colour math with no face/coordinate
// dependency, nothing to port.
//
// The three faces-native styles (radial/tunnel/fire/vu used the 6 cube
// faces or the polar top/bottom faces for parts of their look) don't have
// a literal per-face equivalent on a flat canvas, so those get NEW math
// here that reproduces the same visual idea (radial rings expanding from
// wall centre, a single centred tunnel, VU bar spanning the full wall
// width, fire columns spanning the full wall) against wallW/wallH instead
// of reusing face-indexed loops - same "new per-style math where a literal
// port doesn't make sense" allowance the batch brief calls out.
'use strict';

const { hsl } = require('../../core');
const { auColor } = require('./spectrum');

function blendWall(core, x, y, r, g, b) {
  if (x < 0 || x >= core.wallW || y < 0 || y >= core.wallH) return;
  const gx = (x / core.wallPanelSize) | 0, gy = (y / core.wallPanelSize) | 0;
  if (!core._wallOccupied[gy * core.wallCols + gx]) return;
  const o = (y * core.wallW + x) * 3;
  if (r > core.wallBuf[o]) core.wallBuf[o] = r;
  if (g > core.wallBuf[o + 1]) core.wallBuf[o + 1] = g;
  if (b > core.wallBuf[o + 2]) core.wallBuf[o + 2] = b;
}
function glowAroundWall(core, x, y, col, spread, strength) {
  for (let g = 1; g <= spread; g++) {
    const fade = strength * (1 - g / (spread + 1));
    blendWall(core, x, y + g, col[0] * fade, col[1] * fade, col[2] * fade);
    blendWall(core, x, y - g, col[0] * fade, col[1] * fade, col[2] * fade);
  }
}
function peakCapWall(core, x, y, tint) {
  const glow = [0.55 + tint[0] * 0.45, 0.55 + tint[1] * 0.45, 0.55 + tint[2] * 0.45];
  blendWall(core, x, y, glow[0], glow[1], glow[2]);
  glowAroundWall(core, x, y, glow, 2, 0.35);
}

function scrolledBand(c, cols, bands, scrollX) {
  const sc = (c + ((scrollX || 0) | 0) + cols) % cols;
  return Math.min(bands - 1, (sc * bands / cols) | 0);
}

// ── bars / mirror ───────────────────────────────────────────────────────
function drawBarsWall(core, ctx, mirror) {
  const W = core.wallW, H = core.wallH, M = H - 1, mode = ctx.barMode || 'solid';
  const AB = ctx.bands;
  const barW = Math.round(W / AB);
  for (let c = 0; c < W; c++) {
    if (H > 8 && barW > 1 && c % barW === barW - 1) continue;
    const b = scrolledBand(c, W, AB, ctx.scrollX);
    const amp = ctx.amp(b), fb = b / (AB - 1);

    if (mirror) {
      // See spectrum.js's drawBars() for why - a real report ("in the
      // mirror mode, it needs to be 1 row at the centre").
      const mid = (H - 1) / 2, half = amp > 0 ? Math.max(0.5, amp * H * 0.5) : 0;
      for (let y = 0; y < H; y++) {
        const d = Math.abs(y - mid);
        if (d <= half) {
          const fh = half > 0 ? 1 - d / half : 0;
          const edgeSoft = Math.min(1, (half - d + 1) * 0.6);
          const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
          if (mode === 'striped' && (y & 1)) core.setWallPixel(c, y, col[0] * 0.15, col[1] * 0.15, col[2] * 0.15);
          else core.setWallPixel(c, y, col[0] * edgeSoft, col[1] * edgeSoft, col[2] * edgeSoft);
        }
      }
      const pk = ctx.peak(b) * H * 0.5;
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      peakCapWall(core, c, Math.min(M, Math.round(mid + pk)), tint);
      peakCapWall(core, c, Math.max(0, Math.round(mid - pk)), tint);
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
        core.setWallPixel(c, fy, col[0], col[1], col[2]);
      }
      if (rawH > 0) {
        const tp = auColor(ctx.theme, fb, 1, amp, ctx.t);
        const tipY = Math.max(0, M - hi);
        blendWall(core, c, tipY, tp[0] * 1.5, tp[1] * 1.5, tp[2] * 1.5);
        glowAroundWall(core, c, tipY, tp, 2, 0.3);
      }
      peakCapWall(core, c, Math.max(0, M - Math.round(ctx.peak(b) * M)), auColor(ctx.theme, fb, 1, amp, ctx.t));
    } else if (mode === 'center') {
      const mid = (H - 1) / 2, half = rawH * 0.5;
      for (let y = 0; y < H; y++) {
        const d = Math.abs(y - mid);
        if (d <= half) {
          const fh = half > 0 ? 1 - d / half : 0;
          const edgeSoft = Math.min(1, (half - d + 1) * 0.6);
          const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
          core.setWallPixel(c, y, col[0] * edgeSoft, col[1] * edgeSoft, col[2] * edgeSoft);
        }
      }
      const pk = ctx.peak(b) * M * 0.5;
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      peakCapWall(core, c, Math.min(M, Math.round(mid + pk)), tint);
      peakCapWall(core, c, Math.max(0, Math.round(mid - pk)), tint);
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
          core.setWallPixel(c, y, col[0] * bevel, col[1] * bevel, col[2] * bevel);
        }
      }
      const pkSeg = Math.round(ctx.peak(b) * M / SEG);
      const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
      for (let dy = 0; dy < SEG - 1; dy++) {
        const y = pkSeg * SEG + dy; if (y > M) break;
        blendWall(core, c, y, tint[0] * 1.3, tint[1] * 1.3, tint[2] * 1.3);
      }
    } else {
      const h = rawH + waveOff, hi = Math.max(0, Math.min(M, Math.round(h)));
      const frac = h - Math.floor(h);
      for (let y = 0; y <= hi; y++) {
        const fh = hi > 0 ? y / hi : 0;
        const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
        if (mode === 'striped' && (y & 1)) {
          core.setWallPixel(c, y, col[0] * 0.15, col[1] * 0.15, col[2] * 0.15);
        } else {
          const isTip = (y === hi);
          const bright = isTip ? Math.max(0.35, frac) : 1;
          core.setWallPixel(c, y, col[0] * bright, col[1] * bright, col[2] * bright);
        }
      }
      if (h > 0) {
        const tp = auColor(ctx.theme, fb, 1, amp, ctx.t);
        blendWall(core, c, hi, tp[0] * 1.5, tp[1] * 1.5, tp[2] * 1.5);
        glowAroundWall(core, c, hi, tp, 3, 0.4);
      }
      peakCapWall(core, c, Math.max(0, Math.min(M, Math.round(ctx.peak(b) * M + waveOff))), auColor(ctx.theme, fb, 1, amp, ctx.t));
    }
  }
}

function drawDotsWall(core, ctx) {
  const W = core.wallW, H = core.wallH, M = H - 1;
  for (let c = 0; c < W; c++) {
    const b = scrolledBand(c, W, ctx.bands, ctx.scrollX);
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const h = amp * M;
    const ly = Math.min(M, Math.round(h));
    const spacing = Math.max(2, 3 - Math.round(amp * 1.4));
    for (let y = 0; y <= ly; y += spacing) {
      const fh = ly > 0 ? y / ly : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      const isLead = (y + spacing > ly);
      const fade = isLead ? 1 : 0.35 + 0.45 * fh;
      core.setWallPixel(c, y, col[0] * fade, col[1] * fade, col[2] * fade);
      if (isLead) { blendWall(core, c, y, col[0] * 1.3, col[1] * 1.3, col[2] * 1.3); glowAroundWall(core, c, y, col, 2, 0.4); }
    }
    const peakY = Math.min(M, Math.round(ctx.peak(b) * M));
    peakCapWall(core, c, peakY, auColor(ctx.theme, fb, 1, amp, ctx.t));
  }
}

function drawBlocksWall(core, ctx) {
  const W = core.wallW, H = core.wallH, BLOCK = Math.max(2, Math.round(H / 16));
  const bandW = Math.max(1, Math.floor(W / ctx.bands));
  for (let b = 0; b < ctx.bands; b++) {
    const amp = ctx.amp(b), fb = b / (ctx.bands - 1);
    const blocks = Math.round(amp * (H / BLOCK));
    for (let blk = 0; blk < blocks; blk++) {
      const fh = blocks > 0 ? blk / blocks : 0;
      const col = auColor(ctx.theme, fb, fh, amp, ctx.t);
      const yBase = blk * BLOCK;
      for (let dy = 0; dy < BLOCK - 1; dy++) {
        const y = yBase + dy; if (y >= H) break;
        const cellFrac = dy / (BLOCK - 2 || 1);
        const bevel = 0.6 + 0.4 * Math.sin(cellFrac * Math.PI);
        for (let dc = 0; dc < bandW; dc++) {
          const c = b * bandW + dc; if (c >= W) break;
          core.setWallPixel(c, y, col[0] * bevel, col[1] * bevel, col[2] * bevel);
        }
      }
    }
    const pkBlk = Math.round(ctx.peak(b) * (H / BLOCK));
    const pkY = pkBlk * BLOCK;
    const tint = auColor(ctx.theme, fb, 1, amp, ctx.t);
    for (let dy = 0; dy < BLOCK - 1; dy++) {
      const y = pkY + dy; if (y >= H) break;
      for (let dc = 0; dc < bandW; dc++) {
        const c = b * bandW + dc; if (c >= W) break;
        blendWall(core, c, y, tint[0] * 1.3, tint[1] * 1.3, tint[2] * 1.3);
      }
    }
  }
}

function drawOutlineWall(core, ctx) {
  const W = core.wallW, H = core.wallH, M = H - 1;
  const pts = new Float32Array(W);
  for (let c = 0; c < W; c++) {
    const b = scrolledBand(c, W, ctx.bands, ctx.scrollX);
    pts[c] = ctx.amp(b) * M;
  }
  for (let c = 0; c < W; c++) {
    const b = scrolledBand(c, W, ctx.bands, ctx.scrollX);
    const fb = b / (ctx.bands - 1), amp = ctx.amp(b);
    const yHere = pts[c], yNext = pts[(c + 1) % W];
    const y0 = Math.round(yHere);
    const col = auColor(ctx.theme, fb, 1, amp, ctx.t);
    for (let y = 0; y < y0; y++) {
      const fh = y0 > 0 ? y / y0 : 0;
      const fillCol = auColor(ctx.theme, fb, fh, amp, ctx.t);
      core.setWallPixel(c, y, fillCol[0] * 0.12, fillCol[1] * 0.12, fillCol[2] * 0.12);
    }
    const steps = Math.max(1, Math.abs(Math.round(yNext - yHere)));
    for (let s = 0; s <= steps; s++) {
      const yy = Math.round(yHere + (yNext - yHere) * (s / steps));
      if (yy < 0 || yy > M) continue;
      core.setWallPixel(c, yy, Math.min(1, col[0] * 1.3), Math.min(1, col[1] * 1.3), Math.min(1, col[2] * 1.3));
    }
    glowAroundWall(core, c, y0, col, 3, 0.45);
    peakCapWall(core, c, Math.min(M, Math.round(ctx.peak(b) * M)), col);
  }
}

function drawWaveformWall(core, ctx) {
  const W = core.wallW, H = core.wallH, M = H - 1, mid = M / 2;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] *= 0.80;
  for (let c = 0; c < W; c++) {
    const sc = (c + ((ctx.scrollX || 0) | 0) + W) % W;
    const b = scrolledBand(sc, W, ctx.bands, ctx.scrollX);
    const amp = ctx.amp(b) * Math.sin(sc * 0.35);
    const y = Math.round(mid - amp * mid * 0.9);
    const fy = Math.max(0, Math.min(M, y));
    const hue = (sc / W + ctx.t * 0.04) % 1;
    const col = hsl(hue, 1, 0.9);
    core.setWallPixel(c, fy, col[0], col[1], col[2]);
    for (let dy = 1; dy <= 5; dy++) {
      const gl = (1 - dy / 6) * 0.42;
      core.setWallPixel(c, fy + dy, col[0] * gl, col[1] * gl, col[2] * gl);
      core.setWallPixel(c, fy - dy, col[0] * gl, col[1] * gl, col[2] * gl);
    }
  }
}

function drawVUWall(core, ctx) {
  const W = core.wallW, H = core.wallH, M = H - 1;
  let lvl = 0;
  for (let b = 0; b < Math.min(8, ctx.bands); b++) lvl += ctx.amp(b);
  lvl = Math.min(1, lvl / 4);
  const rows = Math.round(lvl * M);
  for (let y = 0; y <= rows; y++) {
    const fy = y / M;
    const col = fy < 0.6 ? hsl(0.33, 1, 0.28 + fy * 0.15) : fy < 0.85 ? hsl(0.12, 1, 0.4) : hsl(0.0, 1, 0.42);
    for (let x = 0; x < W; x++) core.setWallPixel(x, y, col[0], col[1], col[2]);
  }
}

function drawTunnelWall(core, ctx) {
  const W = core.wallW, H = core.wallH;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ring = Math.hypot(x - cx, y - cy) / maxR;
      const animated = (ring + ctx.t * 0.45 * (1 + bass * 0.5)) % 1;
      const b = Math.min(ctx.bands - 1, (animated * ctx.bands) | 0);
      const amp = ctx.amp(b);
      const col = auColor(ctx.theme, b / (ctx.bands - 1), 1 - ring, Math.max(amp, 0.06), ctx.t);
      const bright = amp < 0.04 ? 0.05 : amp * (1 - ring * 0.35) * 0.92;
      core.setWallPixel(x, y, col[0] * bright, col[1] * bright, col[2] * bright);
    }
  }
  if (bass > 0.55) {
    const coreR = 1 + bass * 1.5;
    for (let dy = -coreR; dy <= coreR; dy++) {
      for (let dx = -coreR; dx <= coreR; dx++) {
        const d = Math.hypot(dx, dy); if (d > coreR) continue;
        blendWall(core, Math.round(cx + dx), Math.round(cy + dy), (1 - d / coreR) * (bass - 0.55) * 2.2, (1 - d / coreR) * (bass - 0.55) * 2.2, (1 - d / coreR) * (bass - 0.55) * 2.2);
      }
    }
  }
}

function drawStormWall(core, ctx, state) {
  const W = core.wallW, H = core.wallH;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] *= 0.72;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (!state.flashesW) state.flashesW = [];
  if (bass > 0.52 && Math.random() < bass * ctx.dt * 18 && state.flashesW.length < 16) {
    state.flashesW.push({ x: (Math.random() * W) | 0, y: (Math.random() * H) | 0, life: 1, hue: 0.58 + Math.random() * 0.16, size: Math.max(2, (bass * H * 0.14) | 0) });
  }
  for (let c = 0; c < W; c++) {
    const b = scrolledBand(c, W, ctx.bands, ctx.scrollX);
    const raw = ctx.amp(b), amp = raw * 0.4;
    if (amp < 0.03) continue;
    const col = auColor(ctx.theme, b / (ctx.bands - 1), 1, raw, ctx.t);
    for (let y = 0; y < Math.round(amp * (H - 1)); y++) core.setWallPixel(c, y, col[0] * amp, col[1] * amp, col[2] * amp);
  }
  for (let k = state.flashesW.length - 1; k >= 0; k--) {
    const fl = state.flashesW[k]; fl.life -= ctx.dt * 3.5;
    if (fl.life <= 0) { state.flashesW.splice(k, 1); continue; }
    const R = Math.ceil(fl.size * fl.life);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dy * dy; if (d2 > R * R) continue;
        const jag = 0.75 + 0.25 * Math.sin(dx * 2.7 + dy * 3.1 + fl.life * 20);
        const bright = fl.life * (1 - Math.sqrt(d2) / R) * 0.95 * jag;
        const col = hsl(fl.hue, 0.5 + fl.life * 0.5, bright);
        core.setWallPixel(fl.x + dx, fl.y + dy, col[0], col[1], col[2]);
      }
    }
    if (fl.life > 0.7) blendWall(core, fl.x, fl.y, fl.life - 0.7, fl.life - 0.7, fl.life - 0.7);
  }
}

function drawPlasmaWall(core, ctx) {
  const W = core.wallW, H = core.wallH;
  let energy = 0;
  for (let i = 0; i < Math.min(32, ctx.bands); i++) energy += ctx.amp(i);
  energy /= Math.min(32, ctx.bands);
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  const hueShift = ctx.t * 0.12 * (1 + bass * 3);
  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const p1 = Math.sin(nx * 9 + ctx.t * 1.3) + Math.sin(ny * 7.6 - ctx.t * 0.9);
      const p2 = Math.sin((nx + ny) * 5.8 + ctx.t * 0.7);
      const plasma = (p1 + p2) / 4 + 0.5;
      const intensity = plasma * (0.15 + energy * 0.85);
      const hue = (plasma * 0.5 + hueShift + nx * 0.1) % 1;
      const [r, g, b] = hsl((hue + 1) % 1, 1, Math.min(1, intensity * 0.9));
      core.setWallPixel(x, y, r, g, b);
    }
  }
}

function drawRingsWall(core, ctx, state) {
  const W = core.wallW, H = core.wallH;
  if (!state.ringsW) state.ringsW = [];
  if (state.ringTimerW === undefined) state.ringTimerW = 0;
  state.ringTimerW += ctx.dt;
  const bassHit = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (bassHit > 0.35 && state.ringTimerW > 0.2 && state.ringsW.length < 16) {
    state.ringTimerW = 0;
    state.ringsW.push({ cx: Math.random() * W, cy: Math.random() * H, radius: 0, hue: Math.random(), bright: 1 });
  }
  for (let ri = state.ringsW.length - 1; ri >= 0; ri--) {
    const ring = state.ringsW[ri];
    ring.radius += ctx.dt * Math.max(W, H) * 0.6;
    ring.bright -= ctx.dt * 0.7;
    if (ring.bright <= 0) { state.ringsW.splice(ri, 1); continue; }
    const w = 3;
    const rMax = Math.ceil(ring.radius + w);
    const xMin = Math.max(0, Math.floor(ring.cx - rMax)), xMax = Math.min(W - 1, Math.ceil(ring.cx + rMax));
    const yMin = Math.max(0, Math.floor(ring.cy - rMax)), yMax = Math.min(H - 1, Math.ceil(ring.cy + rMax));
    const [cr, cg, cb] = hsl(ring.hue, 1, ring.bright * 0.9);
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const d = Math.abs(Math.hypot(x - ring.cx, y - ring.cy) - ring.radius);
        if (d < w) {
          const a = Math.max(1 - d / (w * 0.4), (1 - d / w) * 0.5);
          core.setWallPixel(x, y, cr * a, cg * a, cb * a);
        }
      }
    }
  }
}

function drawFireWall(core, ctx) {
  const W = core.wallW, H = core.wallH, M = H - 1;
  const colW = W / ctx.bands;
  for (let b = 0; b < ctx.bands; b++) {
    const spec = ctx.amp(b);
    if (spec < 0.02) continue;
    const h = Math.round(spec * M);
    const colStart = Math.floor(b * colW), colEnd = Math.min(W, Math.floor((b + 1) * colW));
    for (let x = colStart; x < colEnd; x++) {
      for (let y = 0; y < h; y++) {
        const frac = y / h;
        const flicker = 0.85 + 0.15 * Math.sin(x * 7.3 + ctx.t * 12 + y * 3.1);
        let rr, gg, bb;
        if (frac < 0.3) { rr = 1; gg = 0.95; bb = 0.4 * (1 - frac / 0.3); }
        else if (frac < 0.7) { const mf = (frac - 0.3) / 0.4; rr = 1; gg = 0.95 - mf * 0.6; bb = 0; }
        else { const tf = (frac - 0.7) / 0.3; rr = 1 - tf * 0.5; gg = 0.35 - tf * 0.3; bb = 0; }
        const bright = flicker * (1 - frac * 0.3);
        core.setWallPixel(x, y, Math.min(1, rr * bright), Math.min(1, gg * bright), Math.min(1, bb * bright));
      }
    }
    if (h > M * 0.5) {
      const tipU = Math.floor((colStart + colEnd - 1) / 2);
      blendWall(core, tipU, Math.min(M, h), 0.9, 0.88, 0.77);
    }
  }
}

function drawRadialWall(core, ctx, state) {
  const W = core.wallW, H = core.wallH, cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy) * 1.05;
  const bass = (ctx.amp(0) + ctx.amp(1) + ctx.amp(2)) / 3;
  if (!state.radialRingsW) state.radialRingsW = [];
  if (state.radialPrevBassW === undefined) state.radialPrevBassW = 0;
  if (bass > 0.5 && state.radialPrevBassW <= 0.5 && state.radialRingsW.length < 16) state.radialRingsW.push({ r: 0, hue: Math.random() });
  state.radialPrevBassW = bass;
  for (const ring of state.radialRingsW) ring.r += ctx.dt * Math.max(W, H) * 0.55;
  for (let k = state.radialRingsW.length - 1; k >= 0; k--) if (state.radialRingsW[k].r > maxR) state.radialRingsW.splice(k, 1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy);
      const ang = (Math.atan2(y - cy, x - cx) / (Math.PI * 2) + 0.5 + ctx.t * 0.03) % 1;
      const b = Math.min(ctx.bands - 1, (ang * ctx.bands) | 0);
      const bandAmp = ctx.amp(b);
      const amp = bandAmp * 0.28;
      const bg = auColor(ctx.theme, b / (ctx.bands - 1), r / maxR, bandAmp, ctx.t);
      let rr = bg[0] * amp, gg = bg[1] * amp, bb = bg[2] * amp;
      for (const ring of state.radialRingsW) {
        const dd = r - ring.r;
        const w = dd >= 0 ? 1.2 : 2.4;
        if (Math.abs(dd) < w) {
          const inten = (1 - Math.abs(dd) / w) * (1 - ring.r / maxR);
          const c = hsl(ring.hue, 1, 0.55);
          if (c[0] * inten > rr) rr = c[0] * inten;
          if (c[1] * inten > gg) gg = c[1] * inten;
          if (c[2] * inten > bb) bb = c[2] * inten;
        }
      }
      core.setWallPixel(x, y, rr, gg, bb);
    }
  }
}

function drawWaterfallWall(core, ctx, state) {
  const W = core.wallW, H = core.wallH;
  if (!state.wfBufW || state.wfBufW.length !== H * ctx.bands) { state.wfBufW = new Float32Array(H * ctx.bands); state.wfPosW = 0; state.wfTimerW = 0; }
  state.wfTimerW += ctx.dt;
  if (state.wfTimerW > 1 / 30) {
    state.wfTimerW = 0;
    for (let b = 0; b < ctx.bands; b++) state.wfBufW[state.wfPosW * ctx.bands + b] = ctx.amp(b);
    state.wfPosW = (state.wfPosW + 1) % H;
  }
  for (let row = 0; row < H; row++) {
    const hist = (state.wfPosW - 1 - row + H) % H;
    const age = row / H;
    const fade = Math.pow(1 - age * 0.72, 1.3);
    for (let c = 0; c < W; c++) {
      const b = scrolledBand(c, W, ctx.bands, ctx.scrollX);
      const amp = state.wfBufW[hist * ctx.bands + b];
      if (amp < 0.035) continue;
      const bright = amp * fade;
      const col = auColor(ctx.theme, b / (ctx.bands - 1), amp, amp, ctx.t);
      core.setWallPixel(c, H - 1 - row, col[0] * bright * 1.4, col[1] * bright * 1.4, col[2] * bright * 1.4);
      if (row === 0 && amp > 0.3) blendWall(core, c, H - 1 - row, col[0] * 1.2, col[1] * 1.2, col[2] * 1.2);
    }
  }
}

function createSpectrumWallState() { return {}; }

function renderSpectrumStyleWall(core, ctx, style, state) {
  switch (style) {
    case 'mirror': return drawBarsWall(core, ctx, true);
    case 'dots': return drawDotsWall(core, ctx);
    case 'blocks': return drawBlocksWall(core, ctx);
    case 'outline': return drawOutlineWall(core, ctx);
    case 'radial': return drawRadialWall(core, ctx, state);
    case 'vu': return drawVUWall(core, ctx);
    case 'waterfall': return drawWaterfallWall(core, ctx, state);
    case 'waveform': return drawWaveformWall(core, ctx);
    case 'tunnel': return drawTunnelWall(core, ctx);
    case 'storm': return drawStormWall(core, ctx, state);
    case 'plasma': return drawPlasmaWall(core, ctx);
    case 'rings': return drawRingsWall(core, ctx, state);
    case 'fire': return drawFireWall(core, ctx);
    default: return drawBarsWall(core, ctx, false);
  }
}

module.exports = { renderSpectrumStyleWall, createSpectrumWallState };
