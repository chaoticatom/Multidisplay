// Ported verbatim (math unchanged) from effects-livedata.js's
// drawSolarSystem() (line ~2562) - the multi-body orbital view used by
// celestial.js's effectMoon() port for body==='solarsystem'. The browser
// read the Orbit Speed slider directly off the DOM
// (document.getElementById('solar-speed').value); here it comes from
// core.effectOptions.moon.solarSpeed (same 0-7 logarithmic slider value,
// wired in pi-native/public/app.js - see wireCelestialPanel()).
let _solarLastT = 0, _solarExtraDays = 0;

function drawSolarSystem(core, faces, W, H, tt, solarSpeedSliderVal) {
  const { colBuf, faceMap } = core;
  const cx = W / 2, cy = H / 2;
  const rng = (s) => ((s * 2654435761) >>> 0) / 4294967296;
  const planets = [
    { name: 'Mercury', T: 87.97, L0: 252.25, color: [0.55, 0.53, 0.50], rad: 1.2 },
    { name: 'Venus', T: 224.70, L0: 181.98, color: [0.90, 0.85, 0.70], rad: 1.5 },
    { name: 'Earth', T: 365.25, L0: 100.46, color: [0.2, 0.5, 0.9], rad: 1.5 },
    { name: 'Mars', T: 686.97, L0: 355.45, color: [0.80, 0.40, 0.15], rad: 1.3 },
    { name: 'Jupiter', T: 4332.6, L0: 34.40, color: [0.80, 0.70, 0.55], rad: 2.5 },
    { name: 'Saturn', T: 10759, L0: 49.95, color: [0.82, 0.72, 0.52], rad: 2.2 },
    { name: 'Uranus', T: 30687, L0: 313.23, color: [0.60, 0.82, 0.85], rad: 1.8 },
    { name: 'Neptune', T: 60190, L0: 304.88, color: [0.25, 0.40, 0.80], rad: 1.8 },
  ];
  const sunRad = Math.round(Math.min(W, H) * 0.04);
  const innerGap = sunRad + 3;
  const outerEdge = Math.min(W, H) * 0.47;
  const spacing = (outerEdge - innerGap) / (planets.length);
  const now = new Date();
  const daysSinceJ2000 = (now.getTime() - 946728000000) / 86400000;
  // Speed multiplier from the slider (logarithmic: 0=1x, 7=~10,000,000x -
  // matches index.html's #solar-speed min=0 max=7).
  const speedMult = Math.pow(10, Number(solarSpeedSliderVal) || 0);
  const realDt = _solarLastT ? tt - _solarLastT : 0;
  _solarLastT = tt;
  _solarExtraDays += realDt * (speedMult - 1) / 86400;
  const simDays = daysSinceJ2000 + _solarExtraDays;

  for (let pi = 0; pi < planets.length; pi++) {
    const p = planets[pi];
    p.orbitR = innerGap + spacing * (pi + 0.5);
    const angle = (p.L0 + 360 * simDays / p.T) * Math.PI / 180;
    p.px = cx + Math.cos(angle) * p.orbitR;
    p.py = cy - Math.sin(angle) * p.orbitR;
  }

  for (const face of faces) {
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
      const dx = u - cx, dy = v - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < sunRad * 3) {
        const glow = Math.pow(Math.max(0, 1 - d / (sunRad * 3)), 2) * 0.15;
        colBuf[idx * 3] += glow * 1.0; colBuf[idx * 3 + 1] += glow * 0.7; colBuf[idx * 3 + 2] += glow * 0.2;
      }
      if (d <= sunRad) {
        const nz2 = 1 - (d / sunRad) * (d / sunRad);
        const nz = Math.sqrt(nz2);
        const l = 0.85 + 0.15 * nz;
        const n = (rng(u * 4919 + v * 3571) * 2 - 1) * 0.05;
        colBuf[idx * 3] = Math.min(1, (1.0 + n) * l);
        colBuf[idx * 3 + 1] = Math.min(1, (0.85 + n) * l);
        colBuf[idx * 3 + 2] = Math.min(1, (0.25 + n) * l);
        continue;
      }

      for (const p of planets) {
        const ringDiff = Math.abs(d - p.orbitR);
        if (ringDiff < 0.7) {
          const f = 0.10 * (1 - ringDiff / 0.7);
          colBuf[idx * 3] += f * 0.3; colBuf[idx * 3 + 1] += f * 0.35; colBuf[idx * 3 + 2] += f * 0.5;
        }
        const pdx = u - p.px, pdy = v - p.py;
        const pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd <= p.rad) {
          const pf = pd <= p.rad * 0.5 ? 1.0 : 1.0 - (pd - p.rad * 0.5) / (p.rad * 0.5);
          colBuf[idx * 3] = Math.max(colBuf[idx * 3], p.color[0] * pf);
          colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], p.color[1] * pf);
          colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], p.color[2] * pf);
        }
      }
    }
  }
}

module.exports = drawSolarSystem;
