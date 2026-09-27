// Ported verbatim (math unchanged) from effects-games.js's "RANDOM 2" block
// (r2* functions, effectRandom80s()) - the "Random 2" button. A morphing
// generative engine that smoothly interpolates (no crossfade cut) between
// randomly generated parameter sets using core.surfX/Y/Z, so it already
// covers every LED on every face and works unchanged in both 'cube' and
// '2d' panelMode, same as every other surfX/Y/Z-driven effect (wave.js,
// plasma.js, etc).
const { hsl } = require('../core');

let r2T = 0, r2MorphT = 0, r2MorphDur = 12;
let r2From = null, r2To = null;

const { r2rnd, R2_CHARS, r2GenParams, r2lerp, r2MorphParams, r2Pal } = require('./random80sCommon');

function r2NewTarget() {
  r2From = r2To || r2GenParams();
  r2To = r2GenParams();
  r2MorphT = 0;
  r2MorphDur = 10 + Math.random() * 10;
}

function effectRandom80s(core, dt) {
  const { N, colBuf, surfX, surfY, surfZ } = core;
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

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  for (let i = 0; i < N; i++) {
    let x = surfX[i] - 0.5, y = surfY[i] - 0.5, z = surfZ[i] - 0.5;
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
    colBuf[i * 3] = col[0] * L; colBuf[i * 3 + 1] = col[1] * L; colBuf[i * 3 + 2] = col[2] * L;
  }
}

module.exports = effectRandom80s;
