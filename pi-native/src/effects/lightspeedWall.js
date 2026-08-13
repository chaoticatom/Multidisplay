// Wall-mode counterpart to lightspeed.js. lsTransfer() in the cube version
// hands a racer off to the correct adjacent face (with axis remap) when it
// walks off a face's edge - the whole point being a racer can fly forever,
// circling the cube surface indefinitely. A flat wall has no adjacent face
// to hand off to, but "circles forever" is still the right visual for a
// starfield racer, so this wraps a racer's straight-line position back
// around the opposite edge of the wallW x wallH canvas (toroidal wrap)
// instead of face-transferring it - same "never stops, keeps flying in a
// straight line" character, just on a flat torus instead of a cube surface.
// Direction (du/dv) never changes on a wrap, unlike lsTransfer's axis
// remap, since there's no face-orientation change to compensate for.
// Reads the same core.effectOptions.lightspeed keys (speed/trail/size/
// nudge/count/colour) as the cube version, so the sidebar's Light Speed
// panel controls both without needing separate wall-specific options.
const { hsl } = require('../core');

let lsWallRacers = [];
let lsWallT = 0;

function resetLightspeedWall(core, lsCount) {
  lsWallRacers = [];
  const { wallW, wallH } = core;
  for (let k = 0; k < lsCount; k++) {
    const x = wallW * 0.25 + Math.random() * wallW * 0.5;
    const y = wallH * 0.25 + Math.random() * wallH * 0.5;
    // Start at 0 degrees = going straight right (du=1, dv=0)
    lsWallRacers.push({
      x, y,
      du: 1, dv: 0,
      hue: k / lsCount, trail: [],
      nudgeCountdown: 3 + Math.random() * 4,
      nudgeT: 3 + Math.random() * 5,
    });
  }
}

function effectLightspeedWall(core, dt) {
  lsWallT += dt;
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const opts = core.effectOptions?.lightspeed || {};
  const lsSpeed = opts.speed ?? 8, lsTrail = opts.trail ?? 32, lsSize = opts.size ?? 1;
  const lsColour = opts.colour ?? 'multi', lsCount = opts.count ?? 3, lsNudge = opts.nudge ?? 0;
  if (!lsWallRacers.length || lsWallRacers.length !== lsCount) resetLightspeedWall(core, lsCount);
  for (let i = 0; i < wallBuf.length; i++) wallBuf[i] = 0;

  // Pixels per second — fast but not insane
  const dim = Math.max(wallW, wallH);
  const pps = Math.pow(lsSpeed, 1.6) * dim * 0.8 / 64; // /64 keeps pacing comparable across wall sizes vs the cube's fixed SIZE=64 baseline
  const dist = pps * dt;
  const subSteps = Math.min(Math.max(1, Math.ceil(dist)), 400);
  const d = dist / subSteps;

  for (const r of lsWallRacers) {
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
      r.x += r.du * d;
      r.y += r.dv * d;
      // Toroidal wrap — no adjacent face to hand off to, so wrap the
      // position back around the opposite edge instead, direction unchanged.
      if (r.x < 0) r.x += wallW; else if (r.x >= wallW) r.x -= wallW;
      if (r.y < 0) r.y += wallH; else if (r.y >= wallH) r.y -= wallH;

      const px = Math.round(r.x), py = Math.round(r.y);
      if (px >= 0 && px < wallW && py >= 0 && py < wallH) {
        r.trail.push({ x: px, y: py });
        if (r.trail.length > lsTrail) r.trail.shift();
      }
    }
    r.hue = (r.hue + dt * 0.04) % 1;

    const tl = r.trail.length;
    for (let i = 0; i < tl; i++) {
      const { x, y } = r.trail[i];
      const frac = (i + 1) / tl;
      const bright = Math.pow(frac, 1.3);
      let rr, rg, rb;
      if (lsColour === 'multi') [rr, rg, rb] = hsl((r.hue + frac * 0.1 + lsWallT * 0.04) % 1, 1, bright);
      else {
        const hmap = { white: null, cyan: 0.52, red: 0.02, green: 0.33, gold: 0.13 };
        const h = hmap[lsColour];
        if (!h) { rr = bright; rg = bright; rb = bright; }
        else[rr, rg, rb] = hsl(h, 1, bright);
      }
      if (i === tl - 1) { rr = 1; rg = 1; rb = 1; }
      const R = lsSize - 1;
      for (let dv2 = -R; dv2 <= R; dv2++) for (let du2 = -R; du2 <= R; du2++) {
        const nx = x + du2, ny = y + dv2;
        if (nx < 0 || nx >= wallW || ny < 0 || ny >= wallH) continue;
        const gx = (nx / core.wallPanelSize) | 0, gy = (ny / core.wallPanelSize) | 0;
        if (!core._wallOccupied[gy * core.wallCols + gx]) continue;
        const o = (ny * wallW + nx) * 3;
        if (rr > wallBuf[o]) wallBuf[o] = rr;
        if (rg > wallBuf[o + 1]) wallBuf[o + 1] = rg;
        if (rb > wallBuf[o + 2]) wallBuf[o + 2] = rb;
      }
    }
  }
}

module.exports = effectLightspeedWall;
