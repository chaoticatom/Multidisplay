// Wall-mode counterpart to state.js's wxInitScene(). The cube version
// hardcodes a SQUARE panel side length (`size`) used for BOTH the
// horizontal panorama width (well, panW=4*size for the 4 side faces) and
// the vertical extent (particle .v range, skyline maxH) - that assumption
// breaks the moment wallW !== wallH (e.g. a 2-wide-1-tall wall is 128x64,
// nowhere near square). This mirrors wxInitScene's body but takes wallW/
// wallH as SEPARATE parameters and treats the whole wall as ONE flat
// panorama (nFaces=1, panW=wallW) rather than a 4-face cube wraparound -
// same "wall is one continuous canvas, not 4 stitched squares" shape as
// gradientWashWall.js/mazeWall.js.
//
// Reuses buildLandmarks/wxSkyRGB/wxMoonPhase from state.js verbatim (only
// the width/height-dependent parts - cloud/particle/skyline sizing and
// landmark placement - actually need generalizing).
const { buildLandmarks } = require('./state');

function wxInitSceneWall(code, wxState, wallW, wallH) {
  wxState.clouds = []; wxState.particles = []; wxState.stars = [];
  const isRainCode = code >= 51 && code <= 55 || code >= 61 && code <= 65 || code >= 80 && code <= 82 || code >= 95;
  const isSnowCode = code >= 71 && code <= 77 || code >= 85 && code <= 86;
  const isStormCode = code >= 95;
  const isHeavyRain = code === 55 || code === 65 || code >= 81;
  const isOvercastCode = code === 3;
  const nc = code === 0 ? 0 : code === 1 ? 8 : code <= 2 ? 25 : isOvercastCode ? 160 : isStormCode ? 180 : isHeavyRain ? 80 : isRainCode ? 70 : isSnowCode ? 18 : code >= 45 && code <= 48 ? 12 : 10;
  const dark = isStormCode;
  // Cloud/star counts above are the cube's per-face-panorama densities,
  // sized for a ~64px-wide viewport - kept as-is rather than scaled by
  // wallW/wallH, matching the batch brief's "fixed UI chrome stays fixed,
  // scale/reposition proportionally otherwise" guidance for anything whose
  // count (not position) is the tunable: more panels just means the same
  // population spreads thinner, exactly like gradientWashWall's per-pixel
  // math getting more canvas to cover, not more objects.
  for (let i = 0; i < nc; i++) wxState.clouds.push({
    px: Math.random(), py: isOvercastCode || isStormCode || isRainCode ? 0.2 + Math.random() * 0.75 : 0.3 + Math.random() * 0.6,
    sz: isOvercastCode || isStormCode ? 0.16 + Math.random() * 0.24 : isRainCode ? 0.14 + Math.random() * 0.22 : code <= 2 ? 0.1 + Math.random() * 0.18 : 0.07 + Math.random() * 0.14,
    spd: 0.0002 + Math.random() * 0.0004,
    spdY: (Math.random() - 0.35) * 0.00012,
    br: dark ? 0.3 + Math.random() * 0.2 : isOvercastCode ? 0.4 + Math.random() * 0.25 : isRainCode ? 0.4 + Math.random() * 0.3 : 0.6 + Math.random() * 0.4,
    puffs: isOvercastCode || isStormCode ? 6 + Math.floor(Math.random() * 6) : isRainCode ? 5 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 5), fluff: Math.random(),
    tint: 0.85 + Math.random() * 0.3, bubSeed: Math.random() * 1000,
  });
  for (let i = 0; i < 100; i++) wxState.stars.push({
    px: Math.random(), py: Math.random(),
    br: 0.3 + Math.random() * 0.7, tw: Math.random() * Math.PI * 2, spd: 1.5 + Math.random() * 3,
  });
  const np = isStormCode ? 150 : isHeavyRain ? 120 : isRainCode ? 80 : isSnowCode ? 60 : 0;
  // u/v ranges genuinely need to be width/height-separate (not just
  // "size-1" for both) once the wall isn't square - a rain drop's
  // horizontal spawn range shouldn't be capped at wallH-1 on a wide wall.
  for (let i = 0; i < np; i++) wxState.particles.push({
    u: Math.random() * (wallW - 1), v: Math.random() * (wallH - 1),
    spd: isRainCode ? 3 + Math.random() * 5 : 0.4 + Math.random() * 0.8,
    snow: isSnowCode, drift: isRainCode ? (Math.random() - 0.5) * 1.5 : 0,
  });

  const panW = wallW; // one continuous panorama across the whole wall, not 4x
  wxState.skyline = new Uint8Array(panW);
  const seed = Math.abs(Math.round(wxState.lat * 100 + wxState.lon * 10 + code * 7)) % 9999;
  wxState.skyShapes = [];
  function sRnd(x) { return ((x * 2654435761) >>> 0) / 4294967296; }

  const cityLower = (wxState.cityDisplay || '').toLowerCase().replace(/[^a-z ]/g, '');
  const landmarks = buildLandmarks();
  let cityLandmark = null;
  for (const [city, lm] of Object.entries(landmarks)) {
    if (cityLower.includes(city)) { cityLandmark = lm; break; }
  }

  // maxH scales off wallH (vertical), not wallW - the cube version
  // conflated the two because its panel was square.
  const maxH = Math.floor(wallH * 0.35);
  const clusters = [];
  const nClust = 2 + ((seed * 37) % 3);
  for (let ci = 0; ci < nClust; ci++) {
    const cx = Math.floor(panW * (0.15 + ci * 0.7 / nClust + sRnd(seed * 101 + ci * 77) * 0.15));
    const cw = 12 + Math.floor(sRnd(seed * 203 + ci) * 16);
    const ch = maxH - Math.floor(sRnd(seed * 307 + ci) * 6);
    clusters.push({ cx, cw, ch });
  }
  function clusterInfluence(px) {
    let best = 0;
    for (const c of clusters) {
      const d = Math.abs(px - c.cx);
      if (d < c.cw) { const f = 1 - d / c.cw; best = Math.max(best, f * f * c.ch); }
    }
    return best;
  }
  let bx = 0;
  while (bx < panW) {
    const r0 = sRnd(bx * 1327 + seed * 43 + 13);
    const ci = clusterInfluence(bx);
    const inDowntown = ci > maxH * 0.3;
    const typeR = Math.floor(sRnd(bx * 4517 + seed * 89) * 100);
    let typ, bw, bh;
    if (inDowntown) {
      if (typeR < 10) { typ = 5; bw = 1; bh = Math.floor(ci * 1.1) + 2; }
      else if (typeR < 20) { typ = 4; bw = 3 + Math.floor(r0 * 3); bh = Math.floor(ci * 0.9) + 3; }
      else if (typeR < 35) { typ = 7; bw = 3 + Math.floor(r0 * 2); bh = Math.floor(ci * 0.6) + 2; }
      else { typ = 0; bw = 2 + Math.floor(r0 * 5); bh = Math.max(2, Math.floor(ci * 0.5 + r0 * 4)); }
    } else {
      if (typeR < 30) { typ = 2; bw = 2 + Math.floor(r0 * 2); bh = 3 + Math.floor(sRnd(bx * 7919 + seed) * 5); }
      else if (typeR < 55) { typ = 1; bw = 4 + Math.floor(r0 * 4); bh = 2 + Math.floor(sRnd(bx * 3917 + seed) * 3); }
      else if (typeR < 62) { typ = 3; bw = 2 + Math.floor(r0); bh = 5 + Math.floor(sRnd(bx * 6131 + seed) * 5); }
      else if (typeR < 68) { typ = 6; bw = 1; bh = 4 + Math.floor(r0 * 5); }
      else { typ = 0; bw = 2 + Math.floor(r0 * 4); bh = 2 + Math.floor(sRnd(bx * 7919 + seed) * 4 + ci * 0.3); }
    }
    wxState.skyShapes.push({ x: bx, w: bw, h: bh, t: typ });
    for (let i = 0; i < bw && bx + i < panW; i++) wxState.skyline[bx + i] = bh;
    const gap = inDowntown ? Math.floor(r0 * 2) : 1 + Math.floor(sRnd(bx * 31 + seed) * 3);
    bx += bw + gap;
  }

  if (cityLandmark) {
    // Single panorama = single landmark placement, centered on the whole
    // wall width (not per-face) - same "nFaces=1" idea the is2d cube
    // branch used for its one physical panel.
    const faceCenter = Math.floor(panW / 2);
    const lx = Math.max(0, Math.min(panW - cityLandmark.w, faceCenter - Math.floor(cityLandmark.w / 2)));
    const lx2 = lx + cityLandmark.w;
    for (let si = wxState.skyShapes.length - 1; si >= 0; si--) {
      const s = wxState.skyShapes[si];
      if (s.x + s.w > lx && s.x < lx2) wxState.skyShapes.splice(si, 1);
    }
    for (let i = 0; i < cityLandmark.w && lx + i < panW; i++) wxState.skyline[lx + i] = cityLandmark.h;
    wxState.skyShapes.push({ x: lx, w: cityLandmark.w, h: cityLandmark.h, t: 8, lm: cityLandmark });
  }

  wxState.creatures = [];
  // 2 birds + 1 plane - a real report ("30 percent less birds") down from
  // 3 birds + 1 plane.
  for (let i = 0; i < 3; i++) {
    const isPlane = i === 2;
    wxState.creatures.push({
      type: isPlane ? 'plane' : 'bird',
      px: isPlane ? -0.5 : Math.random(),
      py: isPlane ? 0.62 + Math.random() * 0.25 : 0.38 + Math.random() * 0.45,
      dx: (Math.random() < 0.5 ? 1 : -1) * (isPlane ? 0.0008 + Math.random() * 0.0005 : 0.0015 + Math.random() * 0.002),
      dy: isPlane ? 0 : (Math.random() - 0.5) * 0.0008,
      wing: 0, wingT: 0, blink: 0, cycleCount: 0, wingSpeed: 2 + Math.random() * 3,
      delay: isPlane ? Math.random() * 120 : Math.random() * 15,
      active: true, lightningHit: 0, wobble: 0,
    });
  }
  if (code <= 2) {
    wxState.creatures.push({
      type: 'balloon', px: Math.random(), py: 0.05,
      dx: 0.0003 + Math.random() * 0.0002, dy: 0,
      phase: 'rise', phaseT: 0, laps: 0, maxLaps: 2 + Math.floor(Math.random() * 3),
      color: [1, 0.2, 0.1],
      delay: 30 + Math.random() * 60, active: true,
    });
  }
}

module.exports = { wxInitSceneWall };
