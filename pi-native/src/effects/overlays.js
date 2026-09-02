// Ported from effects-core.js's "GLOBAL OVERLAYS ENGINE" section (OV config,
// ovGetEdges/bitCount, all ov* functions, applyFaceOverlays, runOverlays -
// lines ~1230-1894).
//
// Architecturally different from every other file in this directory:
// overlays are NOT a selectable effect. They're independently-toggleable
// visual layers (stars, snow, fire, lightning, ...) that composite ON TOP
// of whatever main effect is currently running, every tick - see
// index.js's module comment for the registry these are deliberately kept
// OUT of, and app.js's tick loop for where runOverlays() is actually
// called (after the main effect writes core.colBuf, before the frame is
// pushed to the driver/streamed).
//
// Ported 13 of the browser's 15 overlays - stars, snow, meteors, edgeglow,
// fire, sparkle, colorwave, pulse, scanline, vignette, glitch, mist,
// lightning. Two were deliberately skipped:
//
//  - 'radio': the browser's ovRadio(dt) is a documented no-op stub (its
//    entire job was letting a radio station's audio element keep playing
//    while another overlay/effect is on screen - it draws nothing). Skipped
//    entirely rather than port an empty function with no effect.
//
//  - 'spectrum': draws a live audio-reactive spectrum analyser sourced from
//    the browser's Web Audio API (mic/tab/phone audio). pi-native has no
//    audio-input pipeline of any kind - this is the same permanent scope
//    boundary as fireworks.js's 'mic' mode (see that file's module comment)
//    and cam.js's snapshot-only Camera effect. Documented here, not fudged
//    with fake data; if real audio input is ever added to pi-native, this
//    is the overlay to wire up.
//
// State shape: OV_DEFAULTS mirrors the browser's OV config object (each
// overlay's {on, ...params}) plus a top-level globalBright (mirrors
// ovGlobalBright). The caller (app.js) owns a live copy of this shape at
// state.overlays and passes it into runOverlays() every tick - this is
// GLOBAL state (applies regardless of which effect is selected), unlike
// core.effectOptions which is keyed per-effect. Per-overlay *dynamic*
// state (particle lists, buffers, timers - ovStarData, ovSnowParts, etc.)
// stays module-level here, same pattern every other effect file in this
// directory already uses for its own state.
const { hsl, lerp } = require('../core');

const OV_DEFAULTS = {
  stars:     { on: false, density: 6, speed: 1.5, color: 'multi' },
  snow:      { on: false, density: 8, speed: 1, color: 'white' },
  meteors:   { on: false, rate: 1.5, trail: 8, color: 'white' },
  edgeglow:  { on: false, intensity: 0.5, speed: 1, color: 'cyan' },
  fire:      { on: false, height: 0.22, intensity: 1, color: 'fire' },
  sparkle:   { on: false, density: 12, fade: 3, color: 'multi' },
  colorwave: { on: false, intensity: 0.3, speed: 1, color: 'rainbow' },
  pulse:     { on: false, speed: 0.8, depth: 0.45, color: 'white' },
  scanline:  { on: false, speed: 1.5, width: 3, color: 'cyan' },
  vignette:  { on: false, intensity: 0.65, radius: 0.5 },
  glitch:    { on: false, intensity: 0.3, rate: 3 },
  mist:      { on: false, intensity: 0.22, speed: 0.4 },
  lightning: { on: false, rate: 1.2, width: 3, brightness: 1 },
  globalBright: 1.0,
};

// The 13 ported overlay keys, in the order runOverlays() applies them
// (matches the browser exactly) - also used by wsServer.js to validate
// setOverlay/setOverlayOption's `key`.
const OVERLAY_KEYS = ['stars', 'snow', 'meteors', 'edgeglow', 'fire', 'sparkle', 'colorwave', 'pulse', 'scanline', 'vignette', 'glitch', 'mist', 'lightning'];

// ── module-level dynamic state (mirrors the browser's bare globals) ──
let ovStarData = null, ovSnowParts = [], ovMeteorList = [], ovSparkleList = [];
let ovFireBufs = null, ovScanY = 0, ovPulseT = 0, ovGlitchT = 0, ovMeteorT = 0;
let ovEdgeIdx = null; // precomputed edge LED indices
let ovGlitchActive = false, ovGlitchData = null;
let ovLightningT = 0, ovLightningStrikes = [], ovLightningNextAt = 0;

function bitCount(n) { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; }

function ovGetEdges(core) {
  if (ovEdgeIdx && ovEdgeIdx.length > 0) return;
  ovEdgeIdx = [];
  for (let i = 0; i < core.N; i++) if (bitCount(core.faceMembership[i]) >= 2) ovEdgeIdx.push(i);
}

// ── Stars ──
function ovStars(core, dt, cfg) {
  const { N, colBuf } = core;
  const target = Math.round(N * cfg.density / 100);
  if (!ovStarData || ovStarData.length !== target) {
    ovStarData = [];
    for (let k = 0; k < target; k++) ovStarData.push({ idx: Math.random() * N | 0, ph: Math.random() * Math.PI * 2, hue: Math.random() });
  }
  for (const s of ovStarData) {
    s.ph += dt * cfg.speed * (1.2 + Math.sin(s.ph * 0.7 + ovPulseT) * 0.5);
    const bright = Math.pow(Math.sin(s.ph) * 0.5 + 0.5, 2.8);
    if (bright < 0.04) continue;
    let r, g, b;
    const col = cfg.color;
    if (col === 'white') { r = bright; g = bright; b = Math.min(1, bright * 1.08); }
    else if (col === 'gold') [r, g, b] = hsl(0.12, 1, bright * 0.88);
    else if (col === 'ice') [r, g, b] = hsl(0.60, 0.85, bright);
    else { [r, g, b] = hsl(s.hue, 1, bright * 0.92); } // multi
    const b3 = s.idx * 3;
    colBuf[b3] = Math.min(1, colBuf[b3] + r);
    colBuf[b3 + 1] = Math.min(1, colBuf[b3 + 1] + g);
    colBuf[b3 + 2] = Math.min(1, colBuf[b3 + 2] + b);
  }
}

// ── Snow ──
function ovSnow(core, dt, cfg) {
  const { SIZE } = core;
  const want = cfg.density * Math.max(1, SIZE / 16 | 0);
  while (ovSnowParts.length < want) {
    const face = Math.random() * 4 | 0;
    ovSnowParts.push({ face, col: Math.random() * SIZE | 0, y: SIZE - 1, speed: 0.15 + Math.random() * 0.5, hue: Math.random(), drift: Math.random() - 0.5 });
  }
  for (const p of ovSnowParts) {
    p.y -= p.speed * dt * cfg.speed * (SIZE * 0.28);
    p.col += p.drift * dt * SIZE * 0.04;
    p.col = Math.max(0, Math.min(SIZE - 1, p.col));
    const col = cfg.color;
    let r, g, b;
    if (col === 'white') { r = 0.88; g = 0.92; b = 1; }
    else if (col === 'ice') [r, g, b] = hsl(0.58, 0.7, 0.75);
    else [r, g, b] = hsl(p.hue, 1, 0.8);
    core.setFaceLED(p.face, p.col | 0, Math.max(0, Math.min(SIZE - 1, p.y | 0)), r, g, b);
    if (p.y < 0) { p.y = SIZE - 1; p.col = Math.random() * SIZE | 0; p.hue = Math.random(); }
  }
  while (ovSnowParts.length > want) ovSnowParts.pop();
}

// ── Meteors ──
function ovMeteors(core, dt, cfg) {
  const { SIZE, faceMap, colBuf } = core;
  ovMeteorT += dt;
  if (ovMeteorT > 1 / cfg.rate) {
    ovMeteorT = 0;
    const face = Math.random() * 6 | 0;
    const ang = Math.random() * Math.PI * 2;
    ovMeteorList.push({
      face, u: Math.random() * SIZE | 0, v: Math.random() * SIZE | 0,
      du: Math.cos(ang), dv: Math.sin(ang), pos: 0, hue: Math.random(), speed: SIZE * 0.6 + Math.random() * SIZE * 0.4,
    });
  }
  for (let k = ovMeteorList.length - 1; k >= 0; k--) {
    const m = ovMeteorList[k];
    m.pos += dt * m.speed * cfg.rate * 0.7;
    const head = m.pos | 0;
    if (head > cfg.trail + SIZE * 1.4) { ovMeteorList.splice(k, 1); continue; }
    for (let j = 0; j <= Math.min(head, cfg.trail); j++) {
      const fu = (m.u + m.du * (head - j)) | 0, fv = (m.v + m.dv * (head - j)) | 0;
      if (fu < 0 || fu >= SIZE || fv < 0 || fv >= SIZE) continue;
      const fade = Math.pow(1 - j / cfg.trail, 1.8);
      const col = cfg.color;
      let r, g, b;
      if (col === 'white') { r = fade; g = fade; b = fade; }
      else if (col === 'gold') [r, g, b] = hsl(0.12, 1, fade * 0.9);
      else if (col === 'fire') [r, g, b] = hsl(0.04 + j / cfg.trail * 0.1, 1, fade * 0.9);
      else [r, g, b] = hsl(m.hue, 1, fade * 0.9); // multi
      const idx = faceMap[m.face][fv * SIZE + fu]; if (idx < 0) continue;
      colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + r);
      colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + g);
      colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b);
    }
  }
}

// ── Edge Glow ──
// A real report: "I see the effect that would show on the top panel if I
// had it connected" - core.faceMembership (and so ovEdgeIdx) is always
// built from the FULL 6-face cube geometry regardless of panelMode, since
// core.js doesn't know or care how many physical panels are actually
// wired up. In 'cube' mode that's correct - a real seam exists between
// face 0 and the face above it. In '2d' mode there is exactly ONE
// physical panel: face 0's own top/left/right/bottom rows/columns are
// still flagged as "edges" (they're shared with faces 1-5 in the cube
// geometry that's ALWAYS built), so edge-glow kept lighting up the
// single panel's own border as if it were an internal cube seam glowing
// against a neighboring panel that doesn't exist. No-op in '2d' mode -
// there's no second panel for an edge glow to represent a seam with.
function ovEdgeGlow(core, dt, cfg) {
  if (core.panelMode === '2d') return;
  const { surfX, surfY, surfZ, colBuf } = core;
  ovGetEdges(core);
  const spd = cfg.speed, inten = cfg.intensity;
  for (let k = 0; k < ovEdgeIdx.length; k++) {
    const i = ovEdgeIdx[k];
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const pulse = 0.5 + 0.5 * Math.sin(ovPulseT * spd * 2.5 + (x + y + z) * Math.PI * 3);
    const bright = pulse * inten;
    const col = cfg.color;
    let r, g, b;
    if (col === 'cyan') { r = 0; g = bright * 0.8; b = bright; }
    else if (col === 'gold') [r, g, b] = hsl(0.12, 1, bright * 0.85);
    else if (col === 'white') { r = bright; g = bright; b = bright; }
    else [r, g, b] = hsl(((x + y + z) / 3 + ovPulseT * spd * 0.15) % 1, 1, bright * 0.85); // rainbow
    colBuf[i * 3] = Math.min(1, colBuf[i * 3] + r);
    colBuf[i * 3 + 1] = Math.min(1, colBuf[i * 3 + 1] + g);
    colBuf[i * 3 + 2] = Math.min(1, colBuf[i * 3 + 2] + b);
  }
}

// ── Fire Border ──
// Note: ovCloudInit/ovDrawCloud/ovTickCloud in the browser source (the
// swirling top-panel cloud) are NOT used by this overlay - reading ovFire's
// body confirms it only touches ovFireBufs. The cloud helpers belong to
// ovLightning below (its "persistent cloud" backdrop), not fire.
function ovFire(core, dt, cfg) {
  const { SIZE: S, faceMap, colBuf } = core;
  const rows = Math.max(3, Math.round(S * cfg.height));
  if (!ovFireBufs || ovFireBufs[0].length !== S * S) {
    ovFireBufs = Array.from({ length: 4 }, () => new Float32Array(S * S));
  }
  for (let f = 0; f < 4; f++) { // faces 0-3 = front/back/right/left only
    const buf = ovFireBufs[f];
    for (let u = 0; u < S; u++) {
      buf[u] = Math.min(2, buf[u] + (Math.random() - 0.05) * dt * 22 * cfg.intensity);
    }
    for (let v = 1; v < rows; v++) {
      for (let u = 0; u < S; u++) {
        const below = buf[(v - 1) * S + u];
        const left = buf[(v - 1) * S + Math.max(0, u - 1)];
        const right = buf[(v - 1) * S + Math.min(S - 1, u + 1)];
        const drift = (Math.random() - 0.5) * 0.15;
        const raw = (below * 0.5 + left * 0.25 + right * 0.25) + drift;
        const cool = dt * (5 + v * 0.4) * cfg.intensity + Math.random() * dt * 3;
        buf[v * S + u] = Math.max(0, raw - cool);
      }
    }
    for (let v = 0; v < rows; v++) {
      for (let u = 0; u < S; u++) {
        const h = Math.min(1, buf[v * S + u]);
        if (h < 0.03) continue;
        const col = cfg.color;
        let r, g, b;
        if (col === 'fire') {
          if (h < 0.4) [r, g, b] = hsl(0.02, 1, h * 1.2);
          else if (h < 0.75) [r, g, b] = hsl(0.06 + h * 0.04, 1, h * 0.9);
          else [r, g, b] = hsl(0.12, 0.6, h * 0.95);
        } else if (col === 'blue') {
          [r, g, b] = hsl(lerp(0.65, 0.58, h), 1, h * 0.8);
        } else if (col === 'green') {
          [r, g, b] = hsl(lerp(0.38, 0.28, h), 1, h * 0.8);
        } else {
          [r, g, b] = hsl(lerp(0.82, 0.72, h), 1, h * 0.8);
        }
        const idx = faceMap[f][v * S + u]; if (idx < 0) continue;
        colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + r);
        colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + g);
        colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b);
      }
    }
  }
}

// ── Sparkle Rain ──
function ovSparkle(core, dt, cfg) {
  const { N, colBuf } = core;
  const rate = cfg.density * dt * 30;
  if (Math.random() < rate - Math.floor(rate) || Math.floor(rate) > 0) {
    const cnt = Math.max(1, Math.floor(rate));
    for (let k = 0; k < cnt; k++) ovSparkleList.push({ idx: Math.random() * N | 0, life: 1, hue: Math.random() });
  }
  for (let k = ovSparkleList.length - 1; k >= 0; k--) {
    const sp = ovSparkleList[k];
    sp.life -= dt * cfg.fade;
    if (sp.life <= 0) { ovSparkleList.splice(k, 1); continue; }
    const bright = Math.pow(sp.life, 0.7) * 0.95;
    const col = cfg.color;
    let r, g, b;
    if (col === 'white') { r = bright; g = bright; b = bright; }
    else if (col === 'gold') [r, g, b] = hsl(0.12, 1, bright * 0.88);
    else if (col === 'ice') [r, g, b] = hsl(0.60, 0.8, bright);
    else [r, g, b] = hsl(sp.hue, 1, bright * 0.92); // multi
    colBuf[sp.idx * 3] = Math.min(1, colBuf[sp.idx * 3] + r);
    colBuf[sp.idx * 3 + 1] = Math.min(1, colBuf[sp.idx * 3 + 1] + g);
    colBuf[sp.idx * 3 + 2] = Math.min(1, colBuf[sp.idx * 3 + 2] + b);
  }
}

// ── Color Wave ──
function ovColorWave(core, dt, cfg) {
  const { N, surfX, surfY, surfZ, colBuf } = core;
  const intensity = cfg.intensity, spd = cfg.speed;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i]; // eslint-disable-line no-unused-vars
    const wave = Math.sin((x + z) * Math.PI * 3 + ovPulseT * spd * 2.2) * 0.5 + 0.5;
    const col = cfg.color;
    let r, g, b, hue;
    if (col === 'rainbow') hue = (x * 0.4 + z * 0.3 + ovPulseT * spd * 0.08) % 1;
    else if (col === 'warm') hue = (x * 0.15 + ovPulseT * spd * 0.05 + 0.04) % 1;
    else if (col === 'cool') hue = (0.55 + z * 0.15 + ovPulseT * spd * 0.05) % 1;
    else hue = (x * 0.2 + z * 0.2 + ovPulseT * spd * 0.05) % 1; // pastel
    [r, g, b] = hsl(hue, col === 'pastel' ? 0.5 : 1, wave * intensity);
    colBuf[i * 3] = Math.min(1, colBuf[i * 3] + r);
    colBuf[i * 3 + 1] = Math.min(1, colBuf[i * 3 + 1] + g);
    colBuf[i * 3 + 2] = Math.min(1, colBuf[i * 3 + 2] + b);
  }
}

// ── Breathe Pulse ──
function ovPulse(core, dt, cfg) {
  const { N, colBuf } = core;
  const ph = Math.sin(ovPulseT * cfg.speed * Math.PI);
  const mul = 1 - cfg.depth * (1 - ph * 0.5 - 0.5);
  const col = cfg.color;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= mul;
  if (col !== 'white') {
    const hue = col === 'rainbow' ? (ovPulseT * cfg.speed * 0.12) % 1 : col === 'gold' ? 0.12 : 0;
    const add = Math.max(0, ph) * cfg.depth * 0.18;
    const [pr, pg, pb] = hsl(hue, 1, add);
    for (let i = 0; i < N; i++) { colBuf[i * 3] += pr; colBuf[i * 3 + 1] += pg; colBuf[i * 3 + 2] += pb; }
  }
}

// ── Scan Line ──
function ovScanLine(core, dt, cfg) {
  const { SIZE, faceMap, colBuf } = core;
  ovScanY = (ovScanY + dt * cfg.speed * SIZE * 0.5) % (SIZE * 2);
  const scanFrac = ovScanY / SIZE, scanV = ovScanY < SIZE ? ovScanY : SIZE * 2 - ovScanY;
  const W = cfg.width, col = cfg.color;
  for (let f = 0; f < 6; f++) {
    for (let u = 0; u < SIZE; u++) {
      for (let dv = -W; dv <= W; dv++) {
        const v = Math.round(scanV) + dv; if (v < 0 || v >= SIZE) continue;
        const fade = Math.pow(1 - Math.abs(dv) / W, 1.5) * 0.9;
        let r, g, b;
        if (col === 'cyan') { r = 0; g = fade * 0.8; b = fade; }
        else if (col === 'white') { r = fade; g = fade; b = fade; }
        else if (col === 'gold') [r, g, b] = hsl(0.12, 1, fade * 0.88);
        else [r, g, b] = hsl(((u / SIZE) + scanFrac * 0.5) % 1, 1, fade * 0.85); // rainbow
        const idx = faceMap[f][v * SIZE + u]; if (idx < 0) continue;
        colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + r);
        colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + g);
        colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b);
      }
    }
  }
}

// ── Vignette ──
function ovVignette(core, dt, cfg) {
  const { N, surfX, surfY, surfZ, colBuf } = core;
  const inten = cfg.intensity, rad = cfg.radius;
  for (let i = 0; i < N; i++) {
    const dx = surfX[i] - 0.5, dy = surfY[i] - 0.5, dz = surfZ[i] - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * 2;
    const v = Math.max(0, d - rad) / (1 - rad + 0.001);
    const mul = 1 - Math.min(1, v * v) * inten;
    colBuf[i * 3] *= mul; colBuf[i * 3 + 1] *= mul; colBuf[i * 3 + 2] *= mul;
  }
}

// ── Glitch ──
function ovGlitch(core, dt, cfg) {
  const { SIZE, faceMap, colBuf } = core;
  ovGlitchT += dt;
  if (ovGlitchT > 1 / cfg.rate) {
    ovGlitchT = 0; ovGlitchActive = true;
    const face = Math.random() * 6 | 0;
    const u0 = Math.random() * SIZE * 0.8 | 0, v0 = Math.random() * SIZE * 0.8 | 0;
    const bw = Math.max(2, SIZE * 0.08 + (Math.random() * SIZE * 0.15) | 0);
    const bh = Math.max(1, SIZE * 0.04 | 0);
    ovGlitchData = { face, u0, v0, bw, bh, shift: ((Math.random() - 0.5) * SIZE * 0.2) | 0 };
  }
  if (!ovGlitchActive || !ovGlitchData) return;
  const { face, u0, v0, bw, bh, shift } = ovGlitchData;
  const inten = cfg.intensity;
  for (let v = v0; v < Math.min(SIZE, v0 + bh); v++) {
    for (let u = u0; u < Math.min(SIZE, u0 + bw); u++) {
      const su = Math.max(0, Math.min(SIZE - 1, u + shift));
      const src = faceMap[face][v * SIZE + su];
      const dst = faceMap[face][v * SIZE + u];
      if (src < 0 || dst < 0) continue;
      colBuf[dst * 3] = lerp(colBuf[dst * 3], colBuf[src * 3], inten);
      colBuf[dst * 3 + 1] = lerp(colBuf[dst * 3 + 1], colBuf[src * 3 + 1], inten);
      colBuf[dst * 3 + 2] = lerp(colBuf[dst * 3 + 2], colBuf[src * 3 + 2] * 0.5 + Math.random() * inten * 0.3, inten);
    }
  }
  ovGlitchActive = false;
}

// ── Rainbow Mist ──
function ovMist(core, dt, cfg) {
  const { N, surfX, surfY, surfZ, colBuf } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const hue = ((x * 0.4 + z * 0.3 + y * 0.2 + ovPulseT * cfg.speed * 0.08) % 1 + 1) % 1;
    const [mr, mg, mb] = hsl(hue, 0.9, cfg.intensity * 0.55);
    colBuf[i * 3] = Math.min(1, colBuf[i * 3] + mr);
    colBuf[i * 3 + 1] = Math.min(1, colBuf[i * 3 + 1] + mg);
    colBuf[i * 3 + 2] = Math.min(1, colBuf[i * 3 + 2] + mb);
  }
}

// ── Persistent swirling cloud on top panel (lightning's backdrop) ──
let ovCloudBuf = null;

function ovCloudInit(core) {
  const { SIZE } = core;
  ovCloudBuf = new Float32Array(SIZE * SIZE * 3);
  const blobs = [
    [SIZE * 0.35, SIZE * 0.45, SIZE * 0.38, SIZE * 0.28, 0.32],
    [SIZE * 0.60, SIZE * 0.52, SIZE * 0.32, SIZE * 0.24, 0.28],
    [SIZE * 0.50, SIZE * 0.38, SIZE * 0.28, SIZE * 0.20, 0.22],
    [SIZE * 0.25, SIZE * 0.55, SIZE * 0.22, SIZE * 0.18, 0.18],
    [SIZE * 0.72, SIZE * 0.42, SIZE * 0.25, SIZE * 0.19, 0.20],
    [SIZE * 0.48, SIZE * 0.65, SIZE * 0.30, SIZE * 0.22, 0.16],
  ];
  for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
    let g = 0;
    for (const [cx, cy, rx, ry, str] of blobs) {
      const dx = (u - cx) / rx, dy = (v - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      g += Math.pow(Math.max(0, 1 - d), 2.5) * str;
    }
    g = Math.min(0.35, g);
    if (g < 0.005) continue;
    const i = (v * SIZE + u) * 3;
    ovCloudBuf[i] = g * 0.40; ovCloudBuf[i + 1] = g * 0.52; ovCloudBuf[i + 2] = g * 0.82;
  }
}

function ovDrawCloud(core, startX, startY) {
  const { SIZE } = core;
  if (!ovCloudBuf) ovCloudInit(core);
  const cx = startX, cy = startY;
  const rx = SIZE * 0.38, ry = SIZE * 0.28;
  for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
    const dx = (u - cx) / rx, dy = (v - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1.5) continue;
    const g = Math.pow(Math.max(0, 1 - d), 2) * 0.22
      + Math.pow(Math.max(0, 1 - Math.sqrt(((u - cx - rx * 0.3) / rx * 1.4) ** 2 + ((v - cy + ry * 0.25) / ry * 1.4) ** 2)), 2) * 0.14;
    const i = (v * SIZE + u) * 3;
    ovCloudBuf[i] = Math.min(0.30, ovCloudBuf[i] + g * 0.40);
    ovCloudBuf[i + 1] = Math.min(0.36, ovCloudBuf[i + 1] + g * 0.52);
    ovCloudBuf[i + 2] = Math.min(0.55, ovCloudBuf[i + 2] + g * 0.85);
  }
}

function ovTickCloud(core, dt) {
  const { SIZE, faceMap, colBuf } = core;
  if (!ovCloudBuf) ovCloudInit(core);

  const angle = dt * 0.18;
  const cx = SIZE / 2, cy = SIZE / 2;
  const next = new Float32Array(ovCloudBuf.length);

  for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
    const dx = u - cx, dy = v - cy;
    const r = Math.sqrt(dx * dx + dy * dy) / SIZE;
    const a = angle * (0.3 + r * 1.4);
    const ca = Math.cos(a), sa = Math.sin(a);
    const su = cx + dx * ca - dy * sa;
    const sv = cy + dx * sa + dy * ca;
    const iu = Math.round(su), iv = Math.round(sv);
    if (iu < 0 || iu >= SIZE || iv < 0 || iv >= SIZE) continue;
    const src = (v * SIZE + u) * 3, dst = (iv * SIZE + iu) * 3;
    next[dst] = Math.max(next[dst], ovCloudBuf[src]);
    next[dst + 1] = Math.max(next[dst + 1], ovCloudBuf[src + 1]);
    next[dst + 2] = Math.max(next[dst + 2], ovCloudBuf[src + 2]);
  }

  for (let i = 0; i < next.length; i++) next[i] *= 1 - dt * 0.025;

  if (Math.random() < dt * 0.4) {
    const bx = SIZE * (0.2 + Math.random() * 0.6), by = SIZE * (0.2 + Math.random() * 0.6);
    const rx2 = SIZE * (0.08 + Math.random() * 0.12), ry2 = SIZE * (0.06 + Math.random() * 0.1);
    for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
      const dx = (u - bx) / rx2, dy = (v - by) / ry2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1.5) continue;
      const g = Math.pow(Math.max(0, 1 - d), 3) * 0.12;
      const i = (v * SIZE + u) * 3;
      next[i] = Math.min(0.28, next[i] + g * 0.38);
      next[i + 1] = Math.min(0.34, next[i + 1] + g * 0.50);
      next[i + 2] = Math.min(0.52, next[i + 2] + g * 0.82);
    }
  }

  ovCloudBuf = next;

  for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
    const ci = (v * SIZE + u) * 3;
    if (ovCloudBuf[ci + 2] < 0.006) continue;
    const idx = faceMap[4][v * SIZE + u];
    if (idx >= 0) {
      colBuf[idx * 3] = Math.max(colBuf[idx * 3], ovCloudBuf[ci]);
      colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], ovCloudBuf[ci + 1]);
      colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], ovCloudBuf[ci + 2]);
    }
  }
}

function ovMakeLightBolt(core) {
  const { SIZE } = core;
  const pts = [];
  const startX = Math.floor(SIZE * 0.1 + Math.random() * SIZE * 0.8);
  const startY = Math.floor(SIZE * 0.1 + Math.random() * SIZE * 0.8);

  const hc = Math.random();
  let br, bg, bb;
  if (hc < 0.28) { br = 1; bg = 1; bb = 1; }
  else if (hc < 0.50) { br = 0.7; bg = 0.88; bb = 1; }
  else if (hc < 0.65) { br = 0.85; bg = 0.65; bb = 1; }
  else if (hc < 0.80) { br = 1; bg = 0.95; bb = 0.55; }
  else { br = 1; bg = 0.78; bb = 0.35; }

  const edgeExits = [];
  const topBranches = 4 + Math.floor(Math.random() * 3);
  for (let b = 0; b < topBranches; b++) {
    const ang = (b / topBranches) * Math.PI * 2;
    let cx = startX, cy = startY;
    const steps = Math.floor(SIZE * 0.45 + Math.random() * SIZE * 0.3);
    for (let s = 0; s < steps; s++) {
      cx += Math.cos(ang) + (Math.random() - 0.5) * 0.7;
      cy += Math.sin(ang) + (Math.random() - 0.5) * 0.7;
      pts.push([4, Math.max(0, Math.min(SIZE - 1, Math.round(cx))), Math.max(0, Math.min(SIZE - 1, Math.round(cy)))]);
    }
    edgeExits.push([Math.max(0, Math.min(SIZE - 1, Math.round(cx))), Math.max(0, Math.min(SIZE - 1, Math.round(cy)))]);
  }

  const faceEdgeMap = [
    { face: 0, getEdgeU: (exit) => exit[0], edgeRow: 'vS' },
    { face: 1, getEdgeU: (exit) => SIZE - 1 - exit[0], edgeRow: 'v0' },
    { face: 3, getEdgeU: (exit) => exit[1], edgeRow: 'u0' },
    { face: 2, getEdgeU: (exit) => SIZE - 1 - exit[1], edgeRow: 'uS' },
  ];

  for (const { face, getEdgeU, edgeRow } of faceEdgeMap) {
    let bestExit = edgeExits[0], bestScore = Infinity;
    for (const ex of edgeExits) {
      let score;
      if (edgeRow === 'v0') score = ex[1];
      else if (edgeRow === 'vS') score = SIZE - 1 - ex[1];
      else if (edgeRow === 'u0') score = ex[0];
      else score = SIZE - 1 - ex[0];
      if (score < bestScore) { bestScore = score; bestExit = ex; }
    }
    let cx = getEdgeU(bestExit);
    let drift = (Math.random() - 0.5) * 1.8;
    let segLen = 3 + Math.floor(Math.random() * 5);
    let segCount = 0;
    for (let v = SIZE - 1; v >= 0; v--) {
      cx += drift + (Math.random() - 0.5) * 1.2;
      cx = Math.max(0, Math.min(SIZE - 1, cx));
      pts.push([face, Math.round(cx), v]);
      segCount++;
      if (segCount >= segLen) {
        segCount = 0;
        segLen = 2 + Math.floor(Math.random() * 5);
        drift = (Math.random() - 0.5) * 2.5;
      }
      if (Math.random() < 0.08 && v > SIZE * 0.15) {
        let bx = cx; const bdir = Math.random() < 0.5 ? -1 : 1;
        let bdrift = bdir * (1 + Math.random() * 1.5);
        const blen = Math.floor(SIZE * 0.15 + Math.random() * SIZE * 0.25);
        for (let bv = v - 1; bv >= Math.max(0, v - blen); bv--) {
          bx += bdrift + (Math.random() - 0.5) * 0.8;
          bdrift *= 0.95;
          bx = Math.max(0, Math.min(SIZE - 1, bx));
          pts.push([face, Math.round(bx), bv]);
        }
      }
    }
  }

  for (let face = 0; face < 4; face++) {
    let cx = startX + (Math.random() - 0.5) * SIZE * 0.4;
    for (let v = 0; v < SIZE * 0.6; v++) {
      if (v % 2 === 0) cx += (Math.random() - 0.5) * 3;
      cx = Math.max(0, Math.min(SIZE - 1, cx));
      pts.push([5, Math.round(cx), v]);
    }
  }

  return { pts, flashT: 0, startX, startY, br, bg, bb };
}

// ── Lightning Strike — top to bottom through all panels ──
function ovLightning(core, dt, cfg) {
  const { SIZE, faceMap, colBuf } = core;
  ovLightningT += dt;
  ovTickCloud(core, dt);

  const baseInterval = 1 / Math.max(0.1, cfg.rate);
  if (ovLightningT > ovLightningNextAt) {
    ovLightningT = 0;
    ovLightningNextAt = baseInterval * (0.3 + Math.random() * 1.8);
    const bolt = ovMakeLightBolt(core);
    ovLightningStrikes.push(bolt);
    ovDrawCloud(core, bolt.startX, bolt.startY);
    if (Math.random() < 0.35) {
      setTimeout(() => { const b2 = ovMakeLightBolt(core); ovLightningStrikes.push(b2); ovDrawCloud(core, b2.startX, b2.startY); }, 60 + Math.random() * 150);
    }
  }

  const width = cfg.width | 0;
  const bright = cfg.brightness;

  for (let si = ovLightningStrikes.length - 1; si >= 0; si--) {
    const bolt = ovLightningStrikes[si];
    bolt.flashT += dt;
    const life = 1 - bolt.flashT / 0.4;
    if (life <= 0) { ovLightningStrikes.splice(si, 1); continue; }

    const isBlast = bolt.flashT < 0.05, isCore = bolt.flashT < 0.14;
    const bb2 = isBlast ? bright : (isCore ? bright * 0.9 : bright * life * 0.75);
    const r = Math.min(1, bb2 * bolt.br), g = Math.min(1, bb2 * bolt.bg), b = Math.min(1, bb2 * bolt.bb);

    for (const [face, u, v] of bolt.pts) {
      const idx0 = faceMap[face][v * SIZE + u];
      if (idx0 >= 0) { colBuf[idx0 * 3] = Math.max(colBuf[idx0 * 3], r); colBuf[idx0 * 3 + 1] = Math.max(colBuf[idx0 * 3 + 1], g); colBuf[idx0 * 3 + 2] = Math.max(colBuf[idx0 * 3 + 2], b); }
      for (let w = 1; w < width; w++) {
        const fade = Math.pow(1 - w / width, 1.5);
        [u - w, u + w].forEach((wu) => {
          if (wu < 0 || wu >= SIZE) return;
          const idx = faceMap[face][v * SIZE + wu];
          if (idx >= 0) { colBuf[idx * 3] = Math.max(colBuf[idx * 3], r * fade); colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], g * fade); colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], b * fade * 0.8); }
        });
      }
    }

    if (isBlast) {
      const fa = bright * 0.16;
      for (let f = 0; f < 6; f++) for (let j = 0; j < SIZE * SIZE; j++) {
        const idx = faceMap[f][j];
        if (idx >= 0) { colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + fa * bolt.br); colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + fa * bolt.bg); colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + fa * bolt.bb); }
      }
    }
  }
}

const OV_FUNCS = {
  stars: ovStars, snow: ovSnow, meteors: ovMeteors, edgeglow: ovEdgeGlow, fire: ovFire,
  sparkle: ovSparkle, colorwave: ovColorWave, pulse: ovPulse, scanline: ovScanLine,
  vignette: ovVignette, glitch: ovGlitch, mist: ovMist, lightning: ovLightning,
};

// Applies a SUBSET of overlays to only one face's LEDs (used by the browser
// for face-specific overlay application, e.g. the panel editor / custom
// cube faces - see effects-core.js's applyFaceOverlays). Ported faithfully
// for completeness; as of this port nothing in pi-native calls it yet -
// grepping src/effects for custom_cube/panel-editor equivalents turns up
// nothing (neither has been ported), so there's no current call site to
// wire up. Kept here so a future per-face custom-effect port has it ready.
function applyFaceOverlays(core, face, keys, dt, overlayState) {
  const { N, SIZE, faceMap, colBuf } = core;
  const before = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) before[i] = colBuf[i];
  keys.forEach((k) => {
    const fn = OV_FUNCS[k];
    if (!fn) return;
    const cfg = overlayState[k];
    if (!cfg) return;
    fn(core, dt, cfg);
  });
  const after = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) after[i] = colBuf[i];
  for (let i = 0; i < N * 3; i++) colBuf[i] = before[i];
  for (let j = 0; j < SIZE * SIZE; j++) {
    const idx = faceMap[face][j];
    if (idx >= 0) { colBuf[idx * 3] = after[idx * 3]; colBuf[idx * 3 + 1] = after[idx * 3 + 1]; colBuf[idx * 3 + 2] = after[idx * 3 + 2]; }
  }
}

// Main entry point - call once per tick, AFTER the selected main effect has
// written core.colBuf and BEFORE the frame is pushed to the driver/streamed
// (see app.js's tick loop). `overlayState` is state.overlays (see module
// comment) - each entry has `.on` plus that overlay's params.
//
// globalBright < 0.99: snapshot colBuf before running any overlay, then
// scale down only the DELTA each overlay added (colBuf[i] - snap[i]) - not
// a flat multiply of the whole frame, so overlays fade toward "no visible
// effect" at globalBright=0 while the underlying main-effect frame stays at
// full brightness (ported verbatim from runOverlays()'s two branches).
function runOverlays(core, dt, overlayState) {
  ovPulseT += dt;
  const gb = overlayState.globalBright;

  const apply = () => {
    if (overlayState.stars.on) ovStars(core, dt, overlayState.stars);
    if (overlayState.snow.on) ovSnow(core, dt, overlayState.snow);
    if (overlayState.meteors.on) ovMeteors(core, dt, overlayState.meteors);
    if (overlayState.edgeglow.on) ovEdgeGlow(core, dt, overlayState.edgeglow);
    if (overlayState.fire.on) ovFire(core, dt, overlayState.fire);
    if (overlayState.sparkle.on) ovSparkle(core, dt, overlayState.sparkle);
    if (overlayState.colorwave.on) ovColorWave(core, dt, overlayState.colorwave);
    if (overlayState.pulse.on) ovPulse(core, dt, overlayState.pulse);
    if (overlayState.scanline.on) ovScanLine(core, dt, overlayState.scanline);
    if (overlayState.vignette.on) ovVignette(core, dt, overlayState.vignette);
    if (overlayState.glitch.on) ovGlitch(core, dt, overlayState.glitch);
    if (overlayState.mist.on) ovMist(core, dt, overlayState.mist);
    if (overlayState.lightning.on) ovLightning(core, dt, overlayState.lightning);
    // 'radio' and 'spectrum' intentionally not in overlayState/OVERLAY_KEYS - see module comment.
  };

  if (gb < 0.99) {
    const snap = new Float32Array(core.colBuf);
    apply();
    const colBuf = core.colBuf;
    for (let i = 0; i < colBuf.length; i++) {
      const delta = colBuf[i] - snap[i];
      if (delta > 0) colBuf[i] = snap[i] + delta * gb;
    }
  } else {
    apply();
  }
}

module.exports = { OV_DEFAULTS, OVERLAY_KEYS, runOverlays, applyFaceOverlays };
