// Wall-mode counterpart to random80s.js ("Random 2"). All param generation/
// morphing (r2GenParams/r2MorphParams/r2Pal) is shared with it via
// random80sCommon.js - only the sampling domain changes.
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

const { r2rnd, R2_CHARS, r2GenParams, r2lerp, r2MorphParams, r2FrameTables } = require('./random80sCommon');

function r2NewTarget() {
  r2From = r2To || r2GenParams();
  r2To = r2GenParams();
  r2MorphT = 0;
  r2MorphDur = 10 + Math.random() * 10;
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
  const tb = r2FrameTables(p, tOff); // per-frame tables, see random80sCommon.js
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
      const WV = tb.wave, WA = tb.amp;
      let raw2 = Math.sin(x * WV[0] + y * WV[1] + z * WV[2] + WV[3]) * WA[0] + Math.sin(x * WV[4] + y * WV[5] + z * WV[6] + WV[7]) * WA[1]
        + Math.sin(x * WV[8] + y * WV[9] + z * WV[10] + WV[11]) * WA[2] + Math.sin(x * WV[12] + y * WV[13] + z * WV[14] + WV[15]) * WA[3];
      raw2 = raw2 * 0.5 + 0.5;

      let val = tb.sharp[Math.round((raw2 < 0 ? 0 : raw2 > 1 ? 1 : raw2) * tb.TN)];

      if (p.threshold > 0.01) {
        val = val > p.threshold ? (val - p.threshold) / (1 - p.threshold) : 0;
        if (p.edgeGlow > 0.01 && val <= 0) {
          const shaped = tb.sharp[Math.round((raw2 < 0 ? 0 : raw2 > 1 ? 1 : raw2) * tb.TN)];
          const dist = p.threshold - shaped;
          if (dist < p.edgeGlow * 0.5 && dist > 0) {
            val = (1 - dist / (p.edgeGlow * 0.5)) * p.edgeGlow * 0.5;
          }
        }
      }

      const rad = Math.sqrt(x * x + y * y + z * z);
      if (p.glow > 0) val += p.glow * Math.max(0, 1 - rad * 2.5);
      val = val < 0 ? 0 : val > 1 ? 1 : val;
      const ci = Math.round(val * tb.TN) * 3, C = tb.col;
      if (C[ci] < 0) continue; // too dark to show
      core.setWallPixel(u, v, C[ci], C[ci + 1], C[ci + 2]);
    }
  }
}

module.exports = effectRandom80sWall;
