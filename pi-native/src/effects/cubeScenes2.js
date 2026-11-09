// Three effects made for the cube (each also fills a flat wall):
//   globe     - a slowly turning Earth: oceans, continents, ice caps, drifting
//               clouds and city lights on the night side, with a real
//               day/night line from the sun's position right now.
//   eqtower   - an equaliser tower: bars climb all four sides to the music
//               (a gentle pulse without it), and the top flashes on the beat.
//   lighthouse- a lighthouse beam sweeping round the cube over a night sea,
//               the lamp glowing on the top.
'use strict';
const { defineFieldEffect } = require('./surface');
const { sceneUV, ringUV, fbm, vnoise, hash2, clamp, smooth } = require('./sceneKit');
const { hsl } = require('../core');

// ── Globe ──
// Direction from the middle of the cube (or across a flat wall) -> latitude and longitude.
function globeDir(p, core) {
  if (p.flat) { const [x, y, w] = sceneUV(p, core); const u = (x / w) * 2 - 1, v = y * 2 - 1, r2 = u * u + v * v; if (r2 > 1) return null; return [u, -v, Math.sqrt(1 - r2)]; }
  const x = p.x - 0.5, y = p.y - 0.5, z = p.z - 0.5, n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}
const globe = defineFieldEffect({
  smooth: true, // a slowly varying picture: sampled and blended (see surface.js)
  speed: 1,
  pixel(p, { t, core }) {
    const d = globeDir(p, core);
    if (!d) { const s = hash2(Math.floor(p.x * 300), Math.floor(p.y * 200)) > 0.996 ? 0.5 : 0; return [s, s, s + 0.02]; } // space round a flat globe
    const spin = t * 0.08, lat = Math.asin(d[1]), lon = Math.atan2(d[0], d[2]) + spin;
    const lx = Math.cos(lat) * Math.cos(lon), lz = Math.cos(lat) * Math.sin(lon);
    // Land from noise on the sphere (no seam), ice at the poles.
    const land = fbm(lx * 1.6 + 7, lz * 1.6 + d[1] * 1.3, 4) + fbm(d[1] * 2 + 3, lx * 1.3, 2) * 0.35;
    const ice = Math.abs(d[1]) > 0.86;
    let r, g, b;
    // About a third land, like the real Earth: ocean blues, then green
    // lowlands and brown uplands, white ice at the poles.
    const SEA = 0.72; // about 30% of the surface is above this
    if (ice) { r = 0.85; g = 0.9; b = 0.95; }
    else if (land > SEA) { const k = clamp((land - SEA) * 5); r = 0.08 + k * 0.3; g = 0.26 + k * 0.02; b = 0.07 + k * 0.06; }
    else { const deep = clamp((SEA - land) * 5); r = 0.01; g = 0.08 + 0.14 * (1 - deep); b = 0.28 + 0.24 * (1 - deep); }
    // Clouds drifting across, thinner.
    const cl = smooth(0.6, 0.85, fbm(lx * 2.4 + t * 0.03, lz * 2.4 + d[1] * 2, 3));
    r += (0.9 - r) * cl * 0.7; g += (0.92 - g) * cl * 0.7; b += (0.95 - b) * cl * 0.7;
    // Day and night: the sun's longitude from the time of day (UTC), so the terminator is real.
    const now = new Date(), sunLon = -((now.getUTCHours() + now.getUTCMinutes() / 60) / 24) * Math.PI * 2 + Math.PI + spin;
    const sx = Math.cos(sunLon), sz = Math.sin(sunLon), lit = clamp((Math.cos(lat) * (Math.cos(lon) * sx + Math.sin(lon) * sz)) * 4 + 0.5);
    // City lights: small and sparse, only on land, away from the coast, and only in the dark.
    const cityLights = !ice && land > SEA + 0.03 && cl < 0.3 && hash2(Math.floor(lx * 140 + 500), Math.floor(lz * 140 + d[1] * 90 + 500)) > 0.965 ? 0.7 : 0;
    const k = 0.1 + 0.9 * lit, night = clamp(1 - lit * 1.6);
    return [r * k + cityLights * night * 1.0, g * k + cityLights * night * 0.8, b * k + cityLights * night * 0.4 + 0.015 * night];
  },
});

// ── Equaliser tower ──
const BANDS = 24;
const eq = { lv: new Float32Array(BANDS), pk: new Float32Array(BANDS), beat: 0 };
const eqtower = defineFieldEffect({
  speed: 1,
  frame({ t, dt, core }) {
    const a = core && core.audio && core.audio.active ? core.audio : null;
    for (let b = 0; b < BANDS; b++) {
      const f = b / (BANDS - 1);
      const want = a ? clamp((a.bass * (1 - f) * 1.3 + a.mid * (1 - Math.abs(f - 0.5) * 2) + a.treble * f * 1.2) * 0.9 + 0.08 * Math.sin(t * 9 + b)) : 0.25 + 0.2 * Math.sin(t * 1.7 + b * 0.6) + 0.1 * Math.sin(t * 3.1 + b * 1.3);
      eq.lv[b] += (want - eq.lv[b]) * Math.min(1, dt * (want > eq.lv[b] ? 18 : 5));
      eq.pk[b] = Math.max(eq.lv[b], eq.pk[b] - dt * 0.4);
    }
    eq.beat = Math.max(a ? a.beat || 0 : 0, eq.beat - dt * 3);
  },
  pixel(p, { core }) {
    let x, y, w = 1;
    if (p.flat) [x, y, w] = sceneUV(p, core);
    else {
      const r = ringUV(p);
      if (!r[3]) { if (r[4]) return [0, 0, 0]; const d = Math.hypot(r[0] - 0.5, r[1] - 0.5); const k = eq.beat * Math.exp(-d * 4); return [k * 0.4 + 0.02, k * 0.9 + 0.02, k + 0.05]; } // the top flashes on the beat
      x = r[0]; y = r[1]; w = 4;
    }
    const b = Math.min(BANDS - 1, Math.floor((x / w) * BANDS)), fx = (x / w) * BANDS - b;
    if (fx < 0.12 || fx > 0.88) return [0.01, 0.01, 0.02];
    const h = 1 - y, lv = eq.lv[b], seg = Math.floor(h * 16) / 16;
    if (Math.abs(h - eq.pk[b]) < 0.02) return [0.95, 0.95, 1];
    if (seg > lv) return [0.01, 0.012, 0.025];
    const c = hsl(0.55 - seg * 0.55, 1, 0.5), gap = (h * 16) % 1 < 0.15 ? 0.35 : 1;
    return [c[0] * gap, c[1] * gap, c[2] * gap];
  },
});

// ── Lighthouse ──
const lighthouse = defineFieldEffect({
  fine: true,
  speed: 1,
  pixel(p, { t, core }) {
    let x, y, w = 4, top = false, bottom = false;
    if (p.flat) [x, y, w] = sceneUV(p, core);
    else { const r = ringUV(p); [x, y] = r; top = !r[3] && !r[4]; bottom = r[4]; }
    const sweep = (t * 0.25) % 1; // the beam turns once every 4 seconds
    if (top) { // the lamp, seen from above, with the beam leaving it
      const dx = x - 0.5, dz = y - 0.5, d = Math.hypot(dx, dz), a = (1 - Math.atan2(dz, dx) / (Math.PI * 2)) % 1; // mirrored, so it turns the same way as the beam on the sides
      const beam = Math.max(0, 1 - Math.abs(((a - sweep + 1.5) % 1) - 0.5) * 14) * clamp(1 - d * 1.4);
      const lamp = Math.exp(-d * d * 120);
      return [0.02 + lamp + beam * 0.9, 0.025 + lamp * 0.95 + beam * 0.85, 0.05 + lamp * 0.7 + beam * 0.6];
    }
    if (bottom) return [0.005, 0.015, 0.035];
    const u = x / w; // 0..1 round the cube (or across the wall)
    let r = 0.01 + 0.02 * (1 - y), g = 0.015 + 0.03 * (1 - y), b = 0.05 + 0.06 * (1 - y);
    if (hash2(Math.floor(x * 60), Math.floor(y * 60)) > 0.988 && y < 0.5) { r += 0.4; g += 0.4; b += 0.45; } // stars
    const horizon = 0.62;
    if (y > horizon) { // the sea, with the beam's reflection
      const wave = 0.5 + 0.5 * Math.sin(x * 40 + y * 90 - t * 2 + Math.sin(x * 9) * 2);
      r = 0.01; g = 0.03 + wave * 0.03; b = 0.07 + wave * 0.05;
    }
    // The beam: brightest where it points, spread wide and softly.
    const off = Math.abs(((u - sweep + 1.5) % 1) - 0.5), beam = Math.exp(-((off / 0.06) ** 2)) * (y < horizon ? 1 - Math.abs(y - 0.4) * 1.4 : 0.35 * (1 - (y - horizon)));
    r += beam * 0.95; g += beam * 0.9; b += beam * 0.65;
    return [clamp(r, 0, 1.2), clamp(g, 0, 1.2), clamp(b, 0, 1.2)];
  },
});

module.exports = { globe, eqtower, lighthouse };
