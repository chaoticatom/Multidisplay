// Ported verbatim (math unchanged) from effects-games.js's
// retroDrawTopFace(S,t) (~line 4354-4480) - draws the rotating "RETRO" /
// "GAMES" arc-text logo used on the top face in cube mode. Only the plumbing
// changed: reads faceMap/colBuf off the passed `core` instead of bare
// globals, and writes into a local topBuf then blits to core.colBuf via
// core.faceMap[4] exactly like the original did via the browser's faceMap/
// colBuf globals.
function retroDrawTopFace(core, S, t) {
  const { faceMap, colBuf } = core;
  const topBuf = new Float32Array(S * S * 3);
  const cx = S / 2, cy = S / 2;
  const radius = S * 0.38;

  // Background: pulsing radial gradient
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 3;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) / cx;
    const pulse = 0.02 + 0.015 * Math.sin(t * 2 - dist * 4);
    topBuf[i] = pulse * 0.4; topBuf[i + 1] = pulse * 0.1; topBuf[i + 2] = pulse * 1.2;
  }

  // Rotating radial beams
  for (let b = 0; b < 8; b++) {
    const beamAngle = t * 0.8 + b * Math.PI / 4;
    for (let r = 5; r < S / 2; r++) {
      const bx = Math.round(cx + Math.cos(beamAngle) * r);
      const by = Math.round(cy + Math.sin(beamAngle) * r);
      if (bx >= 0 && bx < S && by >= 0 && by < S) {
        const i = (by * S + bx) * 3;
        const fade = 0.06 * (1 - r / (S / 2));
        topBuf[i] += fade * 0.5; topBuf[i + 1] += fade * 0.2; topBuf[i + 2] += fade;
      }
    }
  }

  // Concentric rings (pulsing outward)
  for (let ring = 0; ring < 4; ring++) {
    const rr = ((t * 12 + ring * 16) % ((S / 2) - 4)) + 4;
    const bright = 0.08 * (1 - rr / (S / 2));
    for (let a = 0; a < 120; a++) {
      const ang = a * Math.PI * 2 / 120;
      const rx = Math.round(cx + Math.cos(ang) * rr);
      const ry = Math.round(cy + Math.sin(ang) * rr);
      if (rx >= 0 && rx < S && ry >= 0 && ry < S) {
        const i = (ry * S + rx) * 3;
        topBuf[i] += bright; topBuf[i + 1] += bright * 0.5; topBuf[i + 2] += bright * 1.5;
      }
    }
  }

  // Sparkle particles orbiting
  for (let sp = 0; sp < 20; sp++) {
    const spAng = t * 1.5 + sp * 0.314;
    const spR = 8 + sp * 1.3 + Math.sin(t * 3 + sp) * 3;
    const sx = Math.round(cx + Math.cos(spAng) * spR);
    const sy = Math.round(cy + Math.sin(spAng) * spR);
    if (sx >= 0 && sx < S && sy >= 0 && sy < S) {
      const i = (sy * S + sx) * 3;
      const flicker = 0.4 + 0.4 * Math.sin(t * 8 + sp * 2);
      topBuf[i] += flicker; topBuf[i + 1] += flicker * 0.8; topBuf[i + 2] += flicker * 0.3;
    }
  }

  // 5x7 bitmap font (scaled 2x)
  const F = { R: [0x7C, 0x44, 0x44, 0x78, 0x48, 0x44, 0x42], E: [0x7E, 0x40, 0x40, 0x7C, 0x40, 0x40, 0x7E], T: [0x7E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18], O: [0x3C, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C], G: [0x3C, 0x42, 0x40, 0x4E, 0x42, 0x42, 0x3C], A: [0x18, 0x24, 0x42, 0x7E, 0x42, 0x42, 0x42], M: [0x42, 0x66, 0x5A, 0x42, 0x42, 0x42, 0x42], S: [0x3C, 0x42, 0x40, 0x3C, 0x02, 0x42, 0x3C] };
  const word1 = [F.R, F.E, F.T, F.R, F.O];
  const word2 = [F.S, F.E, F.M, F.A, F.G];
  const scale = 1;
  const charW = 7 * scale, charH = 7 * scale;
  const arcSpan = 2.2;
  const baseAngle = t * 0.5;

  // Color cycling
  const hue = (t * 80) % 360;
  const hr = hue / 60; const hi = Math.floor(hr) % 6; const hf = hr - Math.floor(hr);
  let cr, cg, cb;
  switch (hi) {
    case 0: cr = 1; cg = hf; cb = 0; break; case 1: cr = 1 - hf; cg = 1; cb = 0; break;
    case 2: cr = 0; cg = 1; cb = hf; break; case 3: cr = 0; cg = 1 - hf; cb = 1; break;
    case 4: cr = hf; cg = 0; cb = 1; break; default: cr = 1; cg = 0; cb = 1 - hf;
  }

  function drawArcText(word, bAngle, flipDir) {
    const numChars = word.length;
    for (let c = 0; c < numChars; c++) {
      const glyph = word[c];
      const charAngle = bAngle + (c - (numChars - 1) / 2) * arcSpan / numChars;
      const charCx = cx + Math.cos(charAngle) * radius;
      const charCy = cy + Math.sin(charAngle) * radius;
      const rot = charAngle + Math.PI / 2 * flipDir;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 7; col++) {
          if (bits & (1 << (6 - col))) {
            for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
              const lx = (col * scale + sx) - charW / 2, ly = (row * scale + sy) - charH / 2;
              const px = Math.round(charCx + lx * cosR - ly * sinR);
              const py = Math.round(charCy + lx * sinR + ly * cosR);
              if (px >= 0 && px < S && py >= 0 && py < S) {
                const i2 = (py * S + px) * 3;
                topBuf[i2] = cr; topBuf[i2 + 1] = cg; topBuf[i2 + 2] = cb;
              }
            }
          }
        }
      }
    }
  }
  // "RETRO" on one side, "GAMES" on the opposite
  drawArcText(word1, baseAngle, 1);
  drawArcText(word2, baseAngle + Math.PI, -1);

  // Outer ring border (bright, pulsing)
  const borderR = S / 2 - 2;
  const borderBright = 0.3 + 0.15 * Math.sin(t * 3);
  for (let a = 0; a < 200; a++) {
    const ang = a * Math.PI * 2 / 200;
    const bx = Math.round(cx + Math.cos(ang) * borderR);
    const by = Math.round(cy + Math.sin(ang) * borderR);
    if (bx >= 0 && bx < S && by >= 0 && by < S) {
      const i = (by * S + bx) * 3;
      topBuf[i] += borderBright * cr; topBuf[i + 1] += borderBright * cg; topBuf[i + 2] += borderBright * cb;
    }
  }

  // Write to top face
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[4][v * S + u]; if (idx < 0) continue;
    const i = (v * S + u) * 3;
    colBuf[idx * 3] = Math.min(1, topBuf[i]); colBuf[idx * 3 + 1] = Math.min(1, topBuf[i + 1]); colBuf[idx * 3 + 2] = Math.min(1, topBuf[i + 2]);
  }
}

module.exports = { retroDrawTopFace };
