// Ported verbatim (math unchanged) from effects-motion.js's effectLightspeed().
// lsSpeed/lsTrail/lsSize/lsColour/lsCount/lsNudge are the Light Speed panel's
// slider/button controls - read each frame from core.effectOptions.lightspeed
// (set via the WS setEffectOption command, see wsServer.js), same defaults
// as the browser's plain module-level vars. Matches the browser's own
// behaviour of only applying a changed "Objects" count on the NEXT
// resetLightspeed() (i.e. next time this effect is (re)selected) rather
// than live-adding/removing racers mid-run - ui.js's #ls-count listener
// doesn't call resetLightspeed() either, it just mutates the count.
const { hsl } = require('../core');

let lsRacers = [];
let lsT = 0;

function lsTransfer(face, u, v, du, dv, S) {
  const S1 = S - 1;
  let r;
  if (u < 0) {
    if (face === 0) r = [3, S1, v, du, dv];
    else if (face === 1) r = [3, 0, v, -du, dv];
    else if (face === 2) r = [1, S1, v, du, dv];
    else if (face === 3) r = [1, 0, v, -du, dv];
    else if (face === 4) r = [3, v, S1, dv, du];
    else r = [3, v, 0, dv, -du];
  } else if (u >= S) {
    if (face === 0) r = [2, S1, v, -du, dv];
    else if (face === 1) r = [2, 0, v, du, dv];
    else if (face === 2) r = [0, S1, v, -du, dv];
    else if (face === 3) r = [0, 0, v, du, dv];
    else if (face === 4) r = [2, v, S1, dv, -du];
    else r = [2, v, 0, dv, du];
  } else if (v < 0) {
    if (face === 0) r = [5, u, S1, du, dv];
    else if (face === 1) r = [5, u, 0, du, -dv];
    else if (face === 2) r = [5, S1, u, dv, du];
    else if (face === 3) r = [5, 0, u, -dv, du];
    else if (face === 4) r = [1, u, S1, du, dv];
    else r = [1, u, 0, du, -dv];
  } else {
    if (face === 0) r = [4, u, S1, du, -dv];
    else if (face === 1) r = [4, u, 0, du, dv];
    else if (face === 2) r = [4, S1, u, -dv, du];
    else if (face === 3) r = [4, 0, u, dv, du];
    else if (face === 4) r = [0, u, S1, du, -dv];
    else r = [0, u, 0, du, dv];
  }
  r[1] = Math.max(1, Math.min(S - 2, r[1]));
  r[2] = Math.max(1, Math.min(S - 2, r[2]));
  const spd = Math.sqrt(r[3] * r[3] + r[4] * r[4]) || 1;
  r[3] /= spd; r[4] /= spd;
  return r;
}

function resetLightspeed(core, lsCount) {
  lsRacers = [];
  const S = core.SIZE;
  for (let k = 0; k < lsCount; k++) {
    const face = k % 6;
    const u = S * 0.25 + Math.random() * S * 0.5;
    const v = S * 0.25 + Math.random() * S * 0.5;
    // Start at 0 degrees = going straight right (du=1, dv=0)
    lsRacers.push({
      face, u, v,
      du: 1, dv: 0,
      hue: k / lsCount, trail: [],
      nudgeCountdown: 3 + Math.random() * 4,
      nudgeT: 3 + Math.random() * 5,
    });
  }
}

function effectLightspeed(core, dt) {
  lsT += dt;
  const { N, SIZE, colBuf, faceMap } = core;
  const opts = core.effectOptions?.lightspeed || {};
  const lsSpeed = opts.speed ?? 8, lsTrail = opts.trail ?? 32, lsSize = opts.size ?? 1;
  const lsColour = opts.colour ?? 'multi', lsCount = opts.count ?? 3, lsNudge = opts.nudge ?? 0;
  if (!lsRacers.length || !faceMap) resetLightspeed(core, lsCount);
  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;
  const S = SIZE;

  // Pixels per second — fast but not insane
  const pps = Math.pow(lsSpeed, 1.6) * SIZE * 0.8;
  const dist = pps * dt;
  const subSteps = Math.min(Math.max(1, Math.ceil(dist)), 400);
  const d = dist / subSteps;

  for (const r of lsRacers) {
    r.nudgeCountdown -= dt;
    if (r.nudgeCountdown <= 0) {
      r.nudgeCountdown = r.nudgeT * (0.8 + Math.random() * 3);
      if (lsNudge > 0) {
        const a = (Math.random() - 0.5) * 2 * (lsNudge * Math.PI / 180);
        const c = Math.cos(a), s_ = Math.sin(a);
        const od = r.du, ov = r.dv;
        r.du = od * c - ov * s_; r.dv = od * s_ + ov * c;
        const l = Math.sqrt(r.du * r.du + r.dv * r.dv) || 1;
        r.du /= l; r.dv /= l;
      }
    }

    for (let ss = 0; ss < subSteps; ss++) {
      r.u += r.du * d;
      r.v += r.dv * d;

      if (r.u < 0 || r.u >= S || r.v < 0 || r.v >= S) {
        const res = lsTransfer(r.face, r.u, r.v, r.du, r.dv, S);
        r.face = res[0];
        r.u = Math.max(0.001, Math.min(S - 0.001, res[1]));
        r.v = Math.max(0.001, Math.min(S - 0.001, res[2]));
        r.du = res[3]; r.dv = res[4];
        const l = Math.sqrt(r.du * r.du + r.dv * r.dv) || 1;
        r.du /= l; r.dv /= l;
      }

      const pu = Math.round(r.u), pv = Math.round(r.v);
      if (pu >= 0 && pu < S && pv >= 0 && pv < S && faceMap[r.face][pv * S + pu] >= 0) {
        r.trail.push({ face: r.face, u: pu, v: pv });
        if (r.trail.length > lsTrail) r.trail.shift();
      }
    }
    r.hue = (r.hue + dt * 0.04) % 1;

    const tl = r.trail.length;
    for (let i = 0; i < tl; i++) {
      const { face, u, v } = r.trail[i];
      const frac = (i + 1) / tl;
      const bright = Math.pow(frac, 1.3);
      let rr, rg, rb;
      if (lsColour === 'multi') [rr, rg, rb] = hsl((r.hue + frac * 0.1 + lsT * 0.04) % 1, 1, bright);
      else {
        const hmap = { white: null, cyan: 0.52, red: 0.02, green: 0.33, gold: 0.13 };
        const h = hmap[lsColour];
        if (!h) { rr = bright; rg = bright; rb = bright; }
        else[rr, rg, rb] = hsl(h, 1, bright);
      }
      if (i === tl - 1) { rr = 1; rg = 1; rb = 1; }
      const R = lsSize - 1;
      for (let dv2 = -R; dv2 <= R; dv2++) for (let du2 = -R; du2 <= R; du2++) {
        const nu = u + du2, nv = v + dv2;
        if (nu < 0 || nu >= S || nv < 0 || nv >= S) continue;
        const idx = faceMap[face][nv * S + nu];
        if (idx < 0) continue;
        if (rr > colBuf[idx * 3]) colBuf[idx * 3] = rr;
        if (rg > colBuf[idx * 3 + 1]) colBuf[idx * 3 + 1] = rg;
        if (rb > colBuf[idx * 3 + 2]) colBuf[idx * 3 + 2] = rb;
      }
    }
  }
}

module.exports = effectLightspeed;
