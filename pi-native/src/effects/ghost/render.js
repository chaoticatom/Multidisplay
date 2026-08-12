// Canvas-2D -> raw-pixel-math translation of effects-scenes.js's
// ghostRenderCanvas() (lines ~81-265). The browser draws the ghost face
// into an offscreen 256x256 <canvas> using gradients/ellipse fills/
// quadratic-curve strokes/clip paths/destination-out compositing, then
// reads it back with getImageData(). None of that API exists under
// Node, so this file reimplements each drawing primitive as a per-pixel
// loop over a flat Uint8ClampedArray RGBA buffer (256*256*4), built once
// per eye-open/mouth-open state change and cached by the caller (see
// ghost.js), exactly like the browser caches ghostPixelsOpen/Closed.
//
// Translation notes (documented judgment calls):
//  - Radial/linear gradients: implemented as `sampleStops(stops, t)`,
//    piecewise-linear interpolation between the same addColorStop
//    positions/colours the browser used, given a 0..1 distance/position
//    fraction - this is exactly what CanvasGradient does internally.
//  - Ellipse/circle fills: point-in-ellipse test
//    ((x-cx)/rx)^2+((y-cy)/ry)^2<=1, then straight alpha-over blend
//    (same visual result as ctx.fill() on an opaque/semi-opaque path).
//  - Strokes with lineWidth/lineCap='round' (brow quadratic curves, the
//    closed-eyelid crease): sampled at N points along the curve
//    (quadraticBezier(t)) and each point stamped with a filled circle of
//    radius lineWidth/2 - round line caps/joins are exactly circle-stamps,
//    so this is faithful, not an approximation.
//  - The oval clip path (ctx.clip() before the skin/brow/eye/nose/mouth/
//    cheek/texture layers): rather than a real clip stack, every fill in
//    that block is intersected with the same ellipse test the clip would
//    have applied (fw*1.3, fh*1.2 ellipse). Equivalent result, no clip
//    machinery needed since nothing in that block draws outside a shape
//    the ellipse test can express (the render only ever fills circles/
//    ellipses/rects, no complex outside-the-clip strokes).
//  - destination-out vignette: for an opaque base image, "reduce dest
//    alpha by the gradient's alpha at this pixel" is mathematically
//    `finalAlpha = baseAlpha * (1 - gradAlpha)`, applied as the very last
//    pass over the whole 256x256 buffer, matching the browser's ordering
//    (vignette is composited after everything else, outside the face
//    clip's ctx.restore()).
//  - Pore/texture noise (60 random dots at globalAlpha=0.06): drawn as
//    60 random small alpha-blended circles, same as the source. Judgment
//    call: Math.random() here uses the ambient RNG same as the browser
//    (no fixed seed) - the browser doesn't seed it either, texture is
//    meant to differ per render, so this preserves that.
'use strict';

const R = 256; // canvas resolution, matches the browser's ghostRenderCanvas

function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// Piecewise-linear interpolation between colour stops, mirroring
// CanvasGradient.addColorStop(pos, 'rgba(...)') semantics.
// stops: [[pos, r,g,b,a], ...] sorted ascending by pos.
function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const span = b[0] - a[0];
      const f = span > 1e-9 ? (t - a[0]) / span : 0;
      return [
        t,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
        a[4] + (b[4] - a[4]) * f,
      ];
    }
  }
  return last;
}

function makeBuffer() {
  return new Uint8ClampedArray(R * R * 4);
}

// Alpha-over (Porter-Duff "over") blend. r/g/b are in 0..255 (matching
// every colour source in this file - ghostCol()'s hsl()*255 output and the
// literal [0,0,0]/[255,255,255] rgba tuples below); a is 0..1. Colour
// channels are kept in 0..255 throughout so they compose against the
// buffer's own 0..255 values without a scale mismatch (an earlier version
// of this mixed a 0..1 formula with 0..255 inputs, which saturated every
// channel toward 255 and washed the whole face out to grey/white).
function blendPixel(buf, pi, r, g, b, a) {
  if (a <= 0) return;
  const dstA = buf[pi + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 1e-6) { buf[pi] = 0; buf[pi + 1] = 0; buf[pi + 2] = 0; buf[pi + 3] = 0; return; }
  const dr = buf[pi], dg = buf[pi + 1], db = buf[pi + 2];
  buf[pi] = (r * a + dr * dstA * (1 - a)) / outA;
  buf[pi + 1] = (g * a + dg * dstA * (1 - a)) / outA;
  buf[pi + 2] = (b * a + db * dstA * (1 - a)) / outA;
  buf[pi + 3] = outA * 255;
}

function fillEllipse(buf, cx, cy, rx, ry, rgba, clip) {
  const [r, g, b, a] = rgba;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(R - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(R - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (clip && !clip(x, y)) continue;
      blendPixel(buf, (y * R + x) * 4, r, g, b, a);
    }
  }
}

// Radial gradient fill over an ellipse-shaped (or full-rect if no rx/ry
// given) region: for each pixel inside, compute normalized distance from
// (cx,cy) between r0 and r1 and sample the gradient stops.
function fillRadialGradient(buf, cx, cy, r0, r1, stops, opts) {
  opts = opts || {};
  const rx = opts.rx || r1, ry = opts.ry || r1;
  const boxX0 = Math.max(0, Math.floor(cx - rx)), boxX1 = Math.min(R - 1, Math.ceil(cx + rx));
  const boxY0 = Math.max(0, Math.floor(cy - ry)), boxY1 = Math.min(R - 1, Math.ceil(cy + ry));
  const clip = opts.clip;
  for (let y = boxY0; y <= boxY1; y++) {
    for (let x = boxX0; x <= boxX1; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const dist = Math.sqrt(nx * nx + ny * ny) * r1;
      if (dist > r1) continue;
      if (clip && !clip(x, y)) continue;
      const t = r1 > r0 ? Math.max(0, Math.min(1, (dist - r0) / (r1 - r0))) : (dist <= r0 ? 0 : 1);
      const [, sr, sg, sb, sa] = sampleStops(stops, t);
      blendPixel(buf, (y * R + x) * 4, sr, sg, sb, sa);
    }
  }
}

// Linear gradient fill over a rect, gradient axis is vertical (y0->y1),
// matching the only linear gradient the source uses (the brow shadow).
function fillLinearGradientV(buf, x0, y0, x1, y1, gy0, gy1, stops, clip) {
  const bx0 = Math.max(0, Math.floor(x0)), bx1 = Math.min(R - 1, Math.ceil(x1));
  const by0 = Math.max(0, Math.floor(y0)), by1 = Math.min(R - 1, Math.ceil(y1));
  for (let y = by0; y <= by1; y++) {
    const t = gy1 > gy0 ? Math.max(0, Math.min(1, (y - gy0) / (gy1 - gy0))) : 0;
    const [, sr, sg, sb, sa] = sampleStops(stops, t);
    for (let x = bx0; x <= bx1; x++) {
      if (clip && !clip(x, y)) continue;
      blendPixel(buf, (y * R + x) * 4, sr, sg, sb, sa);
    }
  }
}

function fillRect(buf, x0, y0, x1, y1, rgba, clip) {
  const [r, g, b, a] = rgba;
  const bx0 = Math.max(0, Math.floor(x0)), bx1 = Math.min(R - 1, Math.ceil(x1));
  const by0 = Math.max(0, Math.floor(y0)), by1 = Math.min(R - 1, Math.ceil(y1));
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if (clip && !clip(x, y)) continue;
      blendPixel(buf, (y * R + x) * 4, r, g, b, a);
    }
  }
}

// Stamps a filled circle at each sampled point along a quadratic Bezier,
// equivalent to a round-cap/round-join stroke of the given lineWidth.
function strokeQuadratic(buf, x0, y0, cx, cy, x1, y1, lineWidth, rgba, steps) {
  steps = steps || 24;
  const radius = lineWidth / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const py = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    fillEllipse(buf, px, py, radius, radius, rgba);
  }
}

// Renders the ghost face into a fresh 256x256 RGBA buffer. Mirrors
// ghostRenderCanvas(eyeOpen, mouthOpen, hasHorns) exactly, layer by layer.
function renderGhostFace(eyeOpen, mouthOpen, hasHorns, hueShift, personality) {
  const buf = makeBuffer();
  const cx = R / 2, cy = R * 0.52;
  const fw = R * 0.34, fh = R * 0.44;

  const p = personality || {};
  const eRX = fw * (p.eyeRX || 0.20);
  const eRY = fh * (p.eyeRY || 0.15);
  const eSpread = fw * (p.eyeSpread || 0.44);
  const cheekD = p.cheekDepth || 0.48;
  const browA = p.browAngle || 0;

  const baseH = (0.33 + (hueShift || 0) * 0.15 + 1) % 1;
  function ghostCol(lightness, alpha) {
    const [r, g, b] = hsl(baseH, 0.85, lightness);
    return [r * 255, g * 255, b * 255, alpha];
  }

  // Face-clip ellipse test (fw*1.3, fh*1.2), used for every layer that
  // was inside ctx.save()/ctx.clip()/ctx.restore() in the source.
  const clipFace = (x, y) => {
    const dx = (x - cx) / (fw * 1.3), dy = (y - cy) / (fh * 1.2);
    return dx * dx + dy * dy <= 1;
  };

  // ── Skin — radial gradient ──
  fillRadialGradient(buf, cx, cy - fh * 0.1, fw * 0.05, fw * 1.3, [
    [0, ...ghostCol(0.72, 0.97)],
    [0.4, ...ghostCol(0.50, 0.90)],
    [0.75, ...ghostCol(0.28, 0.75)],
    [1, ...ghostCol(0.10, 0)],
  ], { rx: fw * 1.3, ry: fw * 1.3, clip: clipFace });

  // ── Brow shadow — linear gradient ──
  fillLinearGradientV(
    buf, cx - fw * 1.3, cy - fh * 1.3, cx + fw * 1.3, cy - fh * 0.1,
    cy - fh * 0.7, cy - fh * 0.1,
    [[0, 0, 0, 0, 0.38], [1, 0, 0, 0, 0]],
    clipFace,
  );

  // ── Brows ──
  const browY = cy - fh * 0.38;
  const browRGBA = ghostCol(0.08, 0.85);
  const browLW = fw * 0.065;
  [[cx - eSpread, browY + browA * fh, -1], [cx + eSpread, browY - browA * fh, 1]].forEach(([bx, by, dir]) => {
    strokeQuadratic(
      buf,
      bx - fw * 0.22, by + browA * fh * dir * 0.3,
      bx, by,
      bx + fw * 0.22, by - browA * fh * dir * 0.3,
      browLW, browRGBA, 24,
    );
  });

  // ── Eyes ──
  const eyeY = cy - fh * 0.14;
  [[cx - eSpread, eyeY], [cx + eSpread, eyeY]].forEach(([ex, ey]) => {
    // Deep socket (elliptical radial gradient, scale(1, eRY/eRX))
    fillRadialGradient(buf, ex, ey, 0, eRX * 1.5, [
      [0, 0, 0, 0, 0.95],
      [0.6, 0, 8, 3, 0.65],
      [1, 0, 0, 0, 0],
    ], { rx: eRX * 1.5, ry: eRY * 1.5 });

    if (eyeOpen > 0.5) {
      fillRadialGradient(buf, ex, ey, 0, eRX * 0.56, [
        [0, 255, 255, 220, 0.98],
        [0.25, ...ghostCol(0.65, 0.95)],
        [0.75, ...ghostCol(0.35, 0.80)],
        [1, 0, 0, 0, 0],
      ], { rx: eRX * 0.56, ry: eRY * 0.56 });
      fillEllipse(buf, ex, ey, eRX * 0.24, eRY * 0.24, [0, 0, 0, 0.97]);
      fillEllipse(buf, ex - eRX * 0.20, ey - eRY * 0.25, eRX * 0.09, eRY * 0.09, [255, 255, 255, 0.92]);
      fillEllipse(buf, ex + eRX * 0.15, ey + eRY * 0.1, eRX * 0.05, eRY * 0.05, [255, 255, 255, 0.55]);
    } else {
      // Closed lid crease
      const lidRGBA = ghostCol(0.06, 0.9);
      strokeQuadratic(buf, ex - eRX * 1.2, ey, ex, ey + eRY * 0.7, ex + eRX * 1.2, ey, eRY * 0.6, lidRGBA, 24);
    }
  });

  // ── Nose ──
  const noseY = cy + fh * 0.12;
  fillRadialGradient(buf, cx, noseY, 0, fw * 0.18, [
    [0, 0, 0, 0, 0.72],
    [1, 0, 0, 0, 0],
  ], { rx: fw * 0.18 * 0.6, ry: fw * 0.18 });
  [[cx - fw * 0.11, noseY + fh * 0.05], [cx + fw * 0.11, noseY + fh * 0.05]].forEach(([nx, ny]) => {
    fillEllipse(buf, nx, ny, fw * 0.07, fh * 0.055, [0, 0, 0, 0.80]);
  });

  // ── Mouth ──
  const mouthY = cy + fh * 0.40;
  const mouthW = fw * 0.56, mouthH = fh * 0.23 * Math.max(0.1, mouthOpen);
  fillEllipse(buf, cx, mouthY, mouthW * 1.08, Math.max(3, mouthH * 1.15), ghostCol(0.18, 0.9));
  fillEllipse(buf, cx, mouthY, mouthW, Math.max(2, mouthH), [0, 0, 0, 0.97]);

  if (mouthOpen > 0.2) {
    const tw = mouthW * 0.36, th = mouthH * 0.55;
    const upperRGBA = ghostCol(0.88, 0.85);
    for (let i = 0; i < 5; i++) {
      const tx = cx - mouthW * 0.72 + mouthW * 0.36 * i + mouthW * 0.18;
      fillRect(buf, tx - tw * 0.38, mouthY - mouthH * 0.88, tx - tw * 0.38 + tw * 0.7, mouthY - mouthH * 0.88 + th, upperRGBA);
    }
    const lowerRGBA = ghostCol(0.75, 0.72);
    for (let i = 0; i < 4; i++) {
      const tx = cx - mouthW * 0.54 + mouthW * 0.36 * i + mouthW * 0.09;
      fillRect(buf, tx - tw * 0.3, mouthY + mouthH * 0.08, tx - tw * 0.3 + tw * 0.56, mouthY + mouthH * 0.08 + th * 0.7, lowerRGBA);
    }
  }

  // ── Cheek hollows ──
  [[cx - fw * 0.70, cy + fh * 0.10], [cx + fw * 0.70, cy + fh * 0.10]].forEach(([hx, hy]) => {
    fillRadialGradient(buf, hx, hy, 0, fw * 0.30, [
      [0, 0, 0, 0, Math.min(0.75, cheekD)],
      [1, 0, 0, 0, 0],
    ], { rx: fw * 0.30, ry: fw * 0.30 });
  });

  // ── Pore/texture noise (60 dots, judgment call: unseeded RNG, matches source) ──
  for (let i = 0; i < 60; i++) {
    const px = cx + (Math.random() - 0.5) * fw * 2.2;
    const py = cy + (Math.random() - 0.5) * fh * 2.0;
    if (!clipFace(px, py)) continue;
    const rad = 0.8 + Math.random() * 1.5;
    const dot = Math.random() < 0.5 ? [0, 0, 0, 0.06] : [255, 255, 255, 0.06];
    fillEllipse(buf, px, py, rad, rad, dot);
  }

  // ── Edge vignette via destination-out: finalAlpha *= (1 - gradAlpha) ──
  {
    const stops = [[0, 0, 0, 0, 0], [0.8, 0, 0, 0, 0], [1, 0, 0, 0, 1]];
    const r0 = fw * 0.65, r1 = fw * 1.55;
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < R; x++) {
        const pi = (y * R + x) * 4;
        if (buf[pi + 3] === 0) continue;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = r1 > r0 ? Math.max(0, Math.min(1, (dist - r0) / (r1 - r0))) : (dist <= r0 ? 0 : 1);
        const gradA = sampleStops(stops, t)[4];
        if (gradA <= 0) continue;
        buf[pi + 3] = buf[pi + 3] * (1 - gradA);
      }
    }
  }

  return buf;
}

module.exports = { renderGhostFace, R };
