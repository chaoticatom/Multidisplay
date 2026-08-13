// Wall-mode counterpart to random80s.js ("Random 2"). All param generation/
// morphing (r2GenParams/r2MorphParams/r2Pal) is copied verbatim/unchanged -
// only the sampling domain changes.
//
// random80s.js drives its noise field from core.surfX/Y/Z, i.e. genuine 3D
// coordinates on the cube's surface (each wave term mixes x/y/z, there's a
// kaleidoscope fold in the x/z plane, and a spin rotation in x/z) - a flat
// wall has no z axis to speak of. Rather than drop those axes and lose the
// 'kaleid'/'tunnel'/'rings' character (which specifically read as 3D-shell
// patterns via the x/z fold+spin), this treats the wall canvas as a single
// flat cross-section through that same 3D noise field: canvas (u,v) is
// normalized the same way surfX/Y were (0..1 -> -0.5..0.5) and mapped to
// (x,y), while z is driven by a slow, slight time-varying offset
// (`Math.sin(t*0.05)*0.15`) instead of a fixed 0 - so the pattern still
// drifts through the 3D noise field over time rather than being a frozen
// 2D slice, closer in spirit to the cube version's constantly-morphing
// character. Everything downstream (kaleid fold, warp, wave sum, palette)
// is unchanged.
const { hsl } = require('../core');

let r2T = 0, r2MorphT = 0, r2MorphDur = 12;
let r2From = null, r2To = null;

function r2rnd(a, b) { return a + Math.random() * (b - a); }

const R2_CHARS = ['plasma', 'laser', 'laser', 'rings', 'grid', 'grid', 'bars', 'nebula', 'kaleid', 'tunnel', 'storm'];

function r2GenParams() {
  const char = R2_CHARS[Math.floor(Math.random() * R2_CHARS.length)];

  const waves = [];
  for (let i = 0; i < 4; i++) {
    let ax = r2rnd(-3, 3), ay = r2rnd(-3, 3), az = r2rnd(-3, 3);
    let freq = r2rnd(3, 18), amp = r2rnd(0.15, 0.5);
    if (char === 'laser') {
      const axis = Math.floor(Math.random() * 3);
      ax = axis === 0 ? r2rnd(1, 2.5) * (Math.random() < 0.5 ? -1 : 1) : r2rnd(-0.15, 0.15);
      ay = axis === 1 ? r2rnd(1, 2.5) * (Math.random() < 0.5 ? -1 : 1) : r2rnd(-0.15, 0.15);
      az = axis === 2 ? r2rnd(1, 2.5) * (Math.random() < 0.5 ? -1 : 1) : r2rnd(-0.15, 0.15);
      freq = r2rnd(5, 14); amp = r2rnd(0.5, 0.8);
    } else if (char === 'bars') {
      ay = i < 2 ? r2rnd(0.8, 2) : r2rnd(-0.2, 0.2);
      ax = i < 2 ? r2rnd(-0.2, 0.2) : r2rnd(0.8, 2);
      az = r2rnd(-0.3, 0.3);
      freq = r2rnd(5, 15);
    } else if (char === 'rings') {
      ax = r2rnd(-2, 2); ay = r2rnd(-0.3, 0.3); az = r2rnd(-2, 2);
      freq = r2rnd(10, 30); amp = r2rnd(0.2, 0.45);
    } else if (char === 'tunnel') {
      ax = r2rnd(1, 3); az = r2rnd(1, 3); ay = r2rnd(-0.5, 0.5);
      freq = r2rnd(6, 20);
    } else if (char === 'grid') {
      const pick = i % 3;
      ax = pick === 0 ? r2rnd(1, 2) : r2rnd(-0.1, 0.1);
      ay = pick === 1 ? r2rnd(1, 2) : r2rnd(-0.1, 0.1);
      az = pick === 2 ? r2rnd(1, 2) : r2rnd(-0.1, 0.1);
      freq = r2rnd(6, 14);
    }
    waves.push({ ax, ay, az, freq, speed: r2rnd(-2.5, 2.5), phase: r2rnd(0, 6.28), amp });
  }

  let sharpness = 1, threshold = 0, edgeGlow = 0;
  if (char === 'laser') {
    sharpness = r2rnd(2, 5); threshold = r2rnd(0.25, 0.5); edgeGlow = r2rnd(0.4, 0.8);
  } else if (char === 'grid') {
    sharpness = r2rnd(2, 4); threshold = r2rnd(0.2, 0.45); edgeGlow = r2rnd(0.2, 0.5);
  } else if (char === 'bars') {
    sharpness = r2rnd(2, 6); threshold = r2rnd(0.2, 0.5);
  } else if (char === 'rings') {
    sharpness = r2rnd(2, 5); threshold = r2rnd(0.1, 0.4); edgeGlow = r2rnd(0.2, 0.5);
  } else if (char === 'storm') {
    sharpness = r2rnd(0.4, 0.8); threshold = 0;
  } else if (char === 'tunnel') {
    sharpness = r2rnd(1.5, 4); threshold = r2rnd(0.1, 0.3); edgeGlow = r2rnd(0.1, 0.3);
  } else {
    sharpness = r2rnd(0.6, 1.8); threshold = r2rnd(0, 0.15); edgeGlow = r2rnd(0, 0.2);
  }

  const warp = {
    amt: char === 'storm' ? r2rnd(0.12, 0.3) : (char === 'nebula' ? r2rnd(0.08, 0.25) : r2rnd(0, 0.18)),
    fx: r2rnd(3, 10), fy: r2rnd(3, 10), fz: r2rnd(3, 10),
    sx: r2rnd(-1.5, 1.5), sy: r2rnd(-1.5, 1.5),
  };

  const kaleid = char === 'kaleid' ? (3 + Math.floor(Math.random() * 6)) : (Math.random() < 0.2 ? (2 + Math.floor(Math.random() * 5)) : 0);

  let palA, palB, palC, palD;
  const palType = Math.random();
  if (char === 'laser' || char === 'grid' || palType < 0.35) {
    const neons = [
      { a: [0.5, 0.1, 0.1], b: [0.5, 0.1, 0.1], d: [0, 0.1, 0.2] },
      { a: [0.1, 0.5, 0.1], b: [0.1, 0.5, 0.1], d: [0.2, 0, 0.1] },
      { a: [0.1, 0.1, 0.5], b: [0.1, 0.2, 0.5], d: [0.1, 0.2, 0] },
      { a: [0.5, 0.1, 0.5], b: [0.5, 0.15, 0.5], d: [0, 0.3, 0.1] },
      { a: [0.1, 0.5, 0.5], b: [0.15, 0.5, 0.5], d: [0.2, 0, 0.1] },
      { a: [0.5, 0.4, 0.1], b: [0.5, 0.3, 0.1], d: [0, 0.15, 0.3] },
      { a: [0.5, 0.2, 0.4], b: [0.4, 0.15, 0.5], d: [0.1, 0.25, 0] },
    ];
    const n = neons[Math.floor(Math.random() * neons.length)];
    palA = n.a; palB = n.b; palD = n.d;
    palC = [r2rnd(0.5, 1.5), r2rnd(0.5, 1.5), r2rnd(0.5, 1.5)];
  } else if (palType < 0.6) {
    palA = [r2rnd(0.3, 0.6), r2rnd(0.3, 0.6), r2rnd(0.3, 0.6)];
    const bv2 = r2rnd(0.35, 0.55);
    palB = [bv2, bv2 * r2rnd(0.8, 1.2), bv2 * r2rnd(0.8, 1.2)];
    palC = [r2rnd(0.8, 2), r2rnd(0.8, 2), r2rnd(0.8, 2)];
    palD = [r2rnd(0, 1), r2rnd(0, 1), r2rnd(0, 1)];
  } else {
    palA = [r2rnd(0.4, 0.65), r2rnd(0.4, 0.65), r2rnd(0.4, 0.65)];
    const bv3 = r2rnd(0.3, 0.5);
    palB = [bv3, bv3 * r2rnd(0.85, 1.15), bv3 * r2rnd(0.85, 1.15)];
    const cf2 = r2rnd(0.5, 1.8);
    palC = [cf2, cf2, cf2];
    palD = [r2rnd(0, 1), r2rnd(0, 1), r2rnd(0, 1)];
  }

  return {
    waves, warp, kaleid, palA, palB, palC, palD,
    hueScale: r2rnd(0.3, 1.5),
    hueDrift: r2rnd(-0.08, 0.08),
    contrast: (char === 'laser' || char === 'grid') ? r2rnd(0.6, 1.2) : r2rnd(0.8, 2.2),
    bright: (char === 'laser' || char === 'grid') ? r2rnd(0.9, 1.0) : r2rnd(0.7, 1.0),
    glow: (char === 'laser' || char === 'rings' || char === 'grid') ? r2rnd(0.08, 0.3) : r2rnd(0, 0.15),
    spin: r2rnd(-0.3, 0.3),
    sharpness, threshold, edgeGlow,
  };
}

function r2lerp(a, b, t) { return a + (b - a) * t; }

function r2MorphParams(A, B, t) {
  if (!A) return B;
  if (!B) return A;
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const a = A.waves[i], b = B.waves[i];
    waves.push({
      ax: r2lerp(a.ax, b.ax, t), ay: r2lerp(a.ay, b.ay, t), az: r2lerp(a.az, b.az, t),
      freq: r2lerp(a.freq, b.freq, t), speed: r2lerp(a.speed, b.speed, t),
      phase: r2lerp(a.phase, b.phase, t), amp: r2lerp(a.amp, b.amp, t),
    });
  }
  return {
    waves,
    warp: {
      amt: r2lerp(A.warp.amt, B.warp.amt, t),
      fx: r2lerp(A.warp.fx, B.warp.fx, t), fy: r2lerp(A.warp.fy, B.warp.fy, t), fz: r2lerp(A.warp.fz, B.warp.fz, t),
      sx: r2lerp(A.warp.sx, B.warp.sx, t), sy: r2lerp(A.warp.sy, B.warp.sy, t),
    },
    kaleid: Math.round(r2lerp(A.kaleid, B.kaleid, t)),
    palA: [r2lerp(A.palA[0], B.palA[0], t), r2lerp(A.palA[1], B.palA[1], t), r2lerp(A.palA[2], B.palA[2], t)],
    palB: [r2lerp(A.palB[0], B.palB[0], t), r2lerp(A.palB[1], B.palB[1], t), r2lerp(A.palB[2], B.palB[2], t)],
    palC: [r2lerp(A.palC[0], B.palC[0], t), r2lerp(A.palC[1], B.palC[1], t), r2lerp(A.palC[2], B.palC[2], t)],
    palD: [r2lerp(A.palD[0], B.palD[0], t), r2lerp(A.palD[1], B.palD[1], t), r2lerp(A.palD[2], B.palD[2], t)],
    hueScale: r2lerp(A.hueScale, B.hueScale, t),
    hueDrift: r2lerp(A.hueDrift, B.hueDrift, t),
    contrast: r2lerp(A.contrast, B.contrast, t),
    bright: r2lerp(A.bright, B.bright, t),
    glow: r2lerp(A.glow, B.glow, t),
    spin: r2lerp(A.spin, B.spin, t),
    sharpness: r2lerp(A.sharpness, B.sharpness, t),
    threshold: r2lerp(A.threshold, B.threshold, t),
    edgeGlow: r2lerp(A.edgeGlow, B.edgeGlow, t),
  };
}

function r2NewTarget() {
  r2From = r2To || r2GenParams();
  r2To = r2GenParams();
  r2MorphT = 0;
  r2MorphDur = 10 + Math.random() * 10;
}

function r2Pal(p, tv) {
  const TAU = 6.2831853;
  let r = p.palA[0] + p.palB[0] * Math.cos(TAU * (p.palC[0] * tv + p.palD[0]));
  let g = p.palA[1] + p.palB[1] * Math.cos(TAU * (p.palC[1] * tv + p.palD[1]));
  let b = p.palA[2] + p.palB[2] * Math.cos(TAU * (p.palC[2] * tv + p.palD[2]));
  return [r < 0 ? 0 : r > 1 ? 1 : r, g < 0 ? 0 : g > 1 ? 1 : g, b < 0 ? 0 : b > 1 ? 1 : b];
}

function effectRandom80sWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  r2T += dt;
  r2MorphT += dt;
  if (r2MorphT >= r2MorphDur || !r2To) r2NewTarget();

  const raw = Math.min(1, r2MorphT / r2MorphDur);
  const mt = raw * raw * (3 - 2 * raw);
  const p = r2MorphParams(r2From, r2To, mt);

  const tOff = r2T;
  const spinA = p.spin * tOff;
  const cosS = Math.cos(spinA), sinS = Math.sin(spinA);
  // See module comment: z is not a fixed 0 but a slow drift, so the wall's
  // flat cross-section still moves through the 3D noise field over time.
  const zBase = Math.sin(tOff * 0.05) * 0.15;

  core.wallBuf.fill(0);

  for (let v = 0; v < wallH; v++) {
    for (let u = 0; u < wallW; u++) {
      let x = u / wallW - 0.5, y = v / wallH - 0.5, z = zBase;
      const rx = x * cosS - z * sinS, rz = x * sinS + z * cosS;
      x = rx; z = rz;
      if (p.kaleid) {
        const ang = Math.atan2(z, x);
        const seg = 6.2832 / p.kaleid;
        const fa = Math.abs(((ang % seg) + seg) % seg - seg * 0.5);
        const rr = Math.sqrt(x * x + z * z);
        x = Math.cos(fa) * rr; z = Math.sin(fa) * rr;
      }
      if (p.warp.amt > 0.005) {
        x += Math.sin(y * p.warp.fy + z * p.warp.fz + tOff * p.warp.sy) * p.warp.amt;
        y += Math.cos(x * p.warp.fx + z * p.warp.fz * 0.7 - tOff * p.warp.sx) * p.warp.amt;
        z += Math.sin(x * p.warp.fx * 0.8 + y * p.warp.fy * 0.6 + tOff * p.warp.sy * 0.5) * p.warp.amt * 0.7;
      }
      let raw2 = 0;
      for (let w = 0; w < 4; w++) {
        const W = p.waves[w];
        raw2 += Math.sin(x * W.ax * W.freq + y * W.ay * W.freq + z * W.az * W.freq + tOff * W.speed + W.phase) * W.amp;
      }
      raw2 = raw2 * 0.5 + 0.5;

      let val = Math.pow(raw2 < 0 ? 0 : raw2 > 1 ? 1 : raw2, p.sharpness);

      if (p.threshold > 0.01) {
        val = val > p.threshold ? (val - p.threshold) / (1 - p.threshold) : 0;
        if (p.edgeGlow > 0.01 && val <= 0) {
          const shaped = Math.pow(raw2 < 0 ? 0 : raw2 > 1 ? 1 : raw2, p.sharpness);
          const dist = p.threshold - shaped;
          if (dist < p.edgeGlow * 0.5 && dist > 0) {
            val = (1 - dist / (p.edgeGlow * 0.5)) * p.edgeGlow * 0.5;
          }
        }
      }

      const rad = Math.sqrt(x * x + y * y + z * z);
      if (p.glow > 0) val += p.glow * Math.max(0, 1 - rad * 2.5);
      val = val < 0 ? 0 : val > 1 ? 1 : val;
      const L = Math.pow(val, p.contrast) * p.bright;
      if (L < 0.015) continue;
      const hc = val * p.hueScale + tOff * p.hueDrift;
      const col = r2Pal(p, hc);
      core.setWallPixel(u, v, col[0] * L, col[1] * L, col[2] * L);
    }
  }
}

module.exports = effectRandom80sWall;
