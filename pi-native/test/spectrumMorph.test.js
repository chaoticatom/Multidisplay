'use strict';
// Spectrum "auto": styles change every autoSecs, flowing into the next
// over the last few seconds (both drawn, flow-morphed) instead of cutting.
const assert = require('assert');
const { renderSpectrumV2Wall, createV2State, SCENES } = require('../src/effects/radio/spectrumV2Wall');

try {
  const W = 128, H = 64, buf = new Float32Array(W * H * 3);
  const core = { wallW: W, wallH: H, wallBuf: buf, setWallPixel(x, y, r, g, b) { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } };
  const amp = new Float32Array(64).map((_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 0.3)));
  const ctx = { amp: (b) => amp[b], peak: (b) => amp[b], ampArr: amp, peakArr: amp, vu: [0.5, 0.5, 0.6, 0.6], wave: new Float32Array(256), bands: 64, theme: 5, barMode: 'solid', scrollX: 0, t: 1, dt: 0.1 };
  const frame = (st) => { buf.fill(0); renderSpectrumV2Wall(core, ctx, 'auto', st, 10); return Float32Array.from(buf); };
  // Pure style A, pure style B, and the morph between them (10 s each, 3 s morph).
  const sA = createV2State(); sA.sceneT = 42; const A = frame(sA); // styles 4 and 5 (Hi-Fi, Studio): both fill the edges
  const sB = createV2State(); sB.sceneT = 52; const B = frame(sB);
  const sM = createV2State(); sM.sceneT = 48.4; const M = frame(sM); // half way through the morph
  // Mid-way it's a blend of the two, not either one.
  let dA = 0, dB = 0, lit = 0;
  for (let i = 0; i < M.length; i++) { dA += Math.abs(M[i] - A[i]); dB += Math.abs(M[i] - B[i]); lit += M[i]; }
  assert.ok(dA > 1 && dB > 1 && lit > 1, `mid-morph differs from both (${dA.toFixed(1)}, ${dB.toFixed(1)})`);
  assert.notStrictEqual(SCENES[0], SCENES[1]);
  console.log('spectrumMorph ok');
} catch (e) { console.error(e); process.exitCode = 1; }
