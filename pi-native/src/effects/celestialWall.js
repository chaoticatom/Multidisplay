// Wall-mode counterpart to celestial/celestial.js (Moon, planets, Sun, Black Hole,
// Solar System). Each body is a centred scene: centre = (wallW/2, wallH/2), radius from
// Math.min(wallW, wallH) so it stays a circle. The Moon is drawn directly; the other
// bodies reuse bodies.js/solarsystem.js unchanged by handing them a fake face (an
// identity faceMap over a scratch colBuf, reused across ticks) and blitting it to wallBuf.
const { getMoonIllumination } = require('./weather/state');
const { drawString, FONT_MOON, wallMaxPlot } = require('./text');
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

// Moon-phase ticker text - see celestial.js's drawMoonText() for why the
// glyph cell is placed at H-5-sv (v flipped at the point of writing).
// Writes wallBuf directly (brighten-only), unoccupied cells included.
function drawMoonTextWall(core, W, H, text, su, sv) {
  drawString(FONT_MOON, text, su, H - 5 - sv, wallMaxPlot(core, 0.75, 0.8, 0.85));
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
    // The body renderers count rows upwards (as cube faces do), so flip them:
    // otherwise the Earth was upside down and its countries unrecognisable.
    const x = i % W, y = H - 1 - ((i / W) | 0);
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
    // As big as fits above the label strip (the bottom 8 rows), never over it.
    const areaH = H - 8;
    const moonRad = Math.floor(Math.min(W, areaH) / 2) - 1;
    const cx = Math.round(W / 2), cy = Math.floor(areaH / 2);

    const frac = mi0.fraction;
    const waxing = phase < 0.5;
    const termPos = frac * 2 - 1;

    // Same fix/root cause as celestial.js's own moon lat (a real report:
    // "celestial needs [a city search]... the moon needs to take that
    // into consideration... it was working on the esp32 version").
    const lat = Number.isFinite(core.effectOptions?.moon?.lat) ? core.effectOptions.moon.lat : MOON_LAT_DEFAULT;
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
  // Keep the label strip clear, so a glow (the Sun's corona) never sits behind the text.
  for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) core.setWallPixel(x, y, 0, 0, 0);
  drawMoonTextWall(core, W, H, moonText, scrollOff, textBaseV);
}

module.exports = effectCelestialWall;
