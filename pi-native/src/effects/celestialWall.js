// Wall-mode counterpart to celestial/celestial.js ("Celestial" - Moon +
// 8 planets/Pluto + Sun + Black Hole + Solar System view).
//
// Shape check (per the batch brief): every one of these 13 bodies is a
// single circular/orbital scene drawn CENTERED on the panel - there's no
// per-face or per-pixel-of-the-whole-canvas math that needs generalizing
// beyond "where is the center and how big is the radius", unlike weather
// (whole-sky gradient) or datetime's clock hands (also just a centered
// scene, see datetimeWall.js). So this is the "single centered scene"
// case the brief calls out, generalized the same way datetimeWall.js's
// analogue clock was: center = (wallW/2, wallH/2), radius derived from
// Math.min(wallW, wallH) so the body stays a circle (not stretched into
// an ellipse) sized to fit the SHORTER wall axis, rather than growing
// absurdly wide on a many-panels-wide wall or clipping top/bottom on a
// many-panels-tall one.
//
// For the Moon (this effect's default/most common body) that math is
// simple enough to port directly against core.setWallPixel. For the other
// 12 bodies (bodies.js's drawSaturn/drawPlanet, solarsystem.js's
// drawSolarSystem - genuinely large functions, ~500 lines combined, doing
// nothing wall-specific once centering is right) this reuses those
// functions VERBATIM rather than re-deriving/duplicating them: bodies.js/
// solarsystem.js were generalized in this same batch to take separate
// width/height params instead of one square `S` (see their module
// comments / celestial.js's call sites, now passing (S, S) for the
// unchanged cube path) specifically so a wall call site could pass
// (wallW, wallH) instead. They still address pixels through
// core.faceMap[face][v*W+u]/core.colBuf (cube plumbing) rather than
// core.setWallPixel, so this file hands them a throwaway "fake face" -
// an Int32Array(wallW*wallH) faceMap entry mapping every (v*W+u) cell
// directly to the matching index into a same-shaped scratch colBuf - then
// blits that scratch buffer onto the real wallBuf afterward. Cheaper and
// far less error-prone than transcribing 500 lines of shading math a
// second time; the scratch buffer is reused across ticks (only
// reallocated if wallW/wallH change).
const { getMoonIllumination } = require('./weather/state');
const { PIXEL_FONT } = require('./weather/font');
const { drawSaturn, drawPlanet } = require('./celestial/bodies');
const drawSolarSystem = require('./celestial/solarsystem');

const MOON_LAT_DEFAULT = 52.04;

let moonCraters = null, moonMaria = null;
function moonInit() {
  if (moonCraters) return; // deterministic, normalized -1..1 disc space - independent of canvas size, only needs building once
  const rng = (s) => ((s * 2654435761) >>> 0) / 4294967296;
  moonCraters = [];
  for (let i = 0; i < 45; i++) {
    const cx = rng(i * 317 + 7) * 1.6 - 0.8;
    const cy = rng(i * 523 + 13) * 1.6 - 0.8;
    if (cx * cx + cy * cy > 0.85) continue;
    const r = 0.03 + rng(i * 719 + 31) * 0.12;
    const depth = 0.15 + rng(i * 911 + 47) * 0.2;
    moonCraters.push({ cx, cy, r, depth });
  }
  moonMaria = [
    { cx: -0.15, cy: 0.25, rx: 0.35, ry: 0.25 }, { cx: 0.2, cy: 0.35, rx: 0.2, ry: 0.18 },
    { cx: 0.25, cy: 0.15, rx: 0.22, ry: 0.2 }, { cx: 0.15, cy: -0.05, rx: 0.18, ry: 0.25 },
    { cx: -0.3, cy: 0.0, rx: 0.15, ry: 0.2 }, { cx: -0.1, cy: -0.2, rx: 0.2, ry: 0.15 },
    { cx: 0.0, cy: 0.45, rx: 0.12, ry: 0.1 }, { cx: 0.35, cy: 0.3, rx: 0.1, ry: 0.12 },
  ];
}

function getMoonPhase() { return getMoonIllumination(new Date()).phase; }

const MOON_FONT = { ...PIXEL_FONT, '%': [5, 1, 2, 4, 5] };
// v is flipped (H-1-v) at the point of writing - see celestial.js's
// moonGlyph module comment for the real report/root cause this fixes
// (garbled moon-phase ticker text).
function moonGlyphWall(core, W, H, ch, su, sv) {
  const rows = MOON_FONT[ch.toUpperCase()]; if (!rows) return 4;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = H - 1 - (sv + (4 - row));
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      const o = (v * W + u) * 3;
      core.wallBuf[o] = Math.max(core.wallBuf[o], 0.75);
      core.wallBuf[o + 1] = Math.max(core.wallBuf[o + 1], 0.8);
      core.wallBuf[o + 2] = Math.max(core.wallBuf[o + 2], 0.85);
    }
  }
  return 4;
}

let _moonScrollX = 0;

// Fake single-face plumbing for reusing bodies.js/solarsystem.js verbatim
// - see module comment. Rebuilt only when wallW/wallH change.
let _fakeFaceMap = null, _fakeColBuf = null, _fakeW = 0, _fakeH = 0;
function getFakeCore(core, W, H) {
  if (_fakeW !== W || _fakeH !== H) {
    _fakeW = W; _fakeH = H;
    const fm = new Int32Array(W * H);
    for (let i = 0; i < fm.length; i++) fm[i] = i; // identity map - every wall cell is "on the face"
    _fakeFaceMap = [fm];
    _fakeColBuf = new Float32Array(W * H * 3);
  } else {
    _fakeColBuf.fill(0);
  }
  return { faceMap: _fakeFaceMap, colBuf: _fakeColBuf, effectOptions: core.effectOptions };
}
function blitFakeToWall(core, W, H) {
  for (let i = 0; i < W * H; i++) {
    const o = i * 3;
    const x = i % W, y = (i / W) | 0;
    core.setWallPixel(x, y, _fakeColBuf[o], _fakeColBuf[o + 1], _fakeColBuf[o + 2]);
  }
}

function effectCelestialWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  moonInit();
  const phase = getMoonPhase();
  const tt = Date.now() * 0.001;

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  // Background: deep space with stars, scattered across the whole wall.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const starSeed = ((i * 2654435761) >>> 0) / 4294967296;
    if (starSeed < 0.012) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.5 + starSeed * 50));
      const br = starSeed * 40 * twinkle;
      core.setWallPixel(x, y, br, br, br * 1.1);
    }
  }

  const body = core.effectOptions?.moon?.body || 'moon';
  if (body === 'saturn') {
    const fake = getFakeCore(core, W, H);
    drawSaturn(fake, [0], W, H, tt);
    blitFakeToWall(core, W, H);
  } else if (body === 'solarsystem') {
    const fake = getFakeCore(core, W, H);
    drawSolarSystem(fake, [0], W, H, tt, core.effectOptions?.moon?.solarSpeed ?? 0);
    blitFakeToWall(core, W, H);
  } else if (body !== 'moon') {
    const fake = getFakeCore(core, W, H);
    drawPlanet(fake, body, [0], W, H, tt);
    blitFakeToWall(core, W, H);
  }

  const mi0 = getMoonIllumination(new Date());

  if (body === 'moon') {
    // Centered on the FULL wall, radius pinned to the shorter axis so the
    // disc stays circular - see module comment.
    const moonRad = Math.round(Math.min(W, H) * 0.42) - 1;
    const cx = Math.round(W / 2), cy = Math.round(H / 2) + 4;

    const frac = mi0.fraction;
    const waxing = phase < 0.5;
    const termPos = frac * 2 - 1;

    const lat = MOON_LAT_DEFAULT;
    const hourNow = (Date.now() % 86400000) / 3600000;
    const tiltBase = lat * Math.PI / 180 * 0.4;
    const tiltShift = Math.sin((hourNow / 24) * Math.PI * 2) * 0.3;
    const tilt = tiltBase + tiltShift;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const dx = (u - cx) / moonRad, dy = (v - cy) / moonRad;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;

      const nz = Math.sqrt(1 - d2);
      const ny = dy;
      const nx = dx * cosT - dy * sinT;
      const nyRot = dx * sinT + dy * cosT;

      const rowR = Math.sqrt(Math.max(0, 1 - nyRot * nyRot));
      const termAt = termPos * rowR;
      const lit = waxing ? nx > -termAt : nx < termAt;

      if (!lit) {
        const es = 0.06 + 0.03 * nz;
        core.setWallPixel(u, v, es * 0.85, es * 0.85, es * 0.9);
        continue;
      }

      let lr = 0.72, lg = 0.70, lb = 0.65;
      for (const m of moonMaria) {
        const mdx = (dx - m.cx) / m.rx, mdy = (dy - m.cy) / m.ry;
        const md = mdx * mdx + mdy * mdy;
        if (md < 1) {
          const mf = Math.pow(1 - md, 0.8) * 0.35;
          lr -= mf * 0.15; lg -= mf * 0.12; lb -= mf * 0.05;
        }
      }
      for (const c of moonCraters) {
        const cdx = dx - c.cx, cdy = dy - c.cy;
        const cd = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cd < c.r * 1.3) {
          if (cd < c.r * 0.85) {
            const cf = c.depth * (1 - cd / (c.r * 0.85));
            lr -= cf; lg -= cf; lb -= cf;
          } else if (cd < c.r * 1.15) {
            const rimBr = 0.12 * (1 + nx * 0.5);
            lr += rimBr; lg += rimBr; lb += rimBr;
          }
        }
      }
      const noise = ((((u * 7919 + v * 6271) >>> 0) % 100) / 100 - 0.5) * 0.06;
      lr += noise; lg += noise; lb += noise;
      const limb = 0.75 + 0.25 * nz;
      lr *= limb; lg *= limb; lb *= limb;
      lr += ny * 0.02;
      lb -= ny * 0.015;
      core.setWallPixel(u, v, Math.max(0, Math.min(1, lr)), Math.max(0, Math.min(1, lg)), Math.max(0, Math.min(1, lb)));
    }
  }

  // Scrolling phase/name ticker along the bottom of the FULL wall width
  // (one continuous ticker, not duplicated per panel).
  const mi = mi0;
  const illum = Math.round(mi.fraction * 100);
  const ph = mi.phase;
  const pName = ph < 0.03 ? 'New Moon' : ph < 0.22 ? 'Waxing Crescent' : ph < 0.28 ? 'First Quarter' : ph < 0.47 ? 'Waxing Gibbous' : ph < 0.53 ? 'Full Moon' : ph < 0.72 ? 'Waning Gibbous' : ph < 0.78 ? 'Last Quarter' : ph < 0.97 ? 'Waning Crescent' : 'New Moon';
  const bodyNames = { blackhole: 'Black Hole', solarsystem: 'Solar System' };
  const axisTilts = { mercury: 0.03, venus: 177.4, earth: 23.4, mars: 25.2, jupiter: 3.1, saturn: 26.7, uranus: 97.8, neptune: 28.3, pluto: 122.5, sun: 7.25 };
  const tiltDeg = axisTilts[body];
  const tiltStr = tiltDeg !== undefined ? ` ${Math.round(tiltDeg)}°` : '';
  const moonText = body === 'moon' ? `${pName} ${illum}%` : (bodyNames[body] || body.charAt(0).toUpperCase() + body.slice(1)) + tiltStr;

  const charW = 4, textW = moonText.length * charW;
  const needScroll = textW > W;
  if (needScroll) _moonScrollX = (_moonScrollX + dt * 14) % (textW + W);
  else _moonScrollX = 0;
  const textBaseV = 1;
  const scrollOff = needScroll ? Math.floor(W - _moonScrollX) : Math.floor((W - textW) / 2);
  for (let ci = 0; ci < moonText.length; ci++) {
    const cxx = scrollOff + ci * charW;
    moonGlyphWall(core, W, H, moonText[ci], cxx, textBaseV);
  }
}

module.exports = effectCelestialWall;
