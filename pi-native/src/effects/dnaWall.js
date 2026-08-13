// Wall-mode counterpart to dna.js. dna.js draws two different things: a
// double helix wrapped around each of the 4 side faces (strands as
// vertical sine waves in u, scrolling in v/time) plus a distinct end-on
// "looking down the axis" view baked onto the top face only. A flat wall
// has no side/top face distinction and no wraparound, so this keeps the
// side-face mechanism (the part that actually reads as "DNA helix" - two
// sine strands with periodic rungs) and drops the top-face end-on view
// entirely, rather than trying to force a second unrelated visual onto the
// same canvas: two horizontal sine-wave strands scroll left-to-right (time
// in x-phase) across the FULL wallW, with y playing the role SIZE's u-axis
// played in the original (the strand's traversal axis), so the helix
// stretches continuously across however many panels are stitched together
// instead of restarting at each 64px face boundary. Turn count scales with
// wallW/SIZE so the pitch of the helix looks the same regardless of wall
// width.
const { hsl } = require('../core');

function effectDNAWall(core, dt) {
  core.t += dt * 0.55;
  const { wallW, wallH, wallBuf, t, SIZE } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let i = 0; i < wallBuf.length; i++) wallBuf[i] *= 0.82;

  const STRANDS = 2; // Classic double helix
  const RADIUS = wallH * 0.36;
  const cy = wallH / 2;
  const TURNS = 4 * (wallW / SIZE); // keep the same visual pitch regardless of wall width

  for (let x = 0; x < wallW; x++) {
    const progress = x / wallW;
    for (let s = 0; s < STRANDS; s++) {
      const ang = progress * Math.PI * 2 * TURNS + t * 1.4 + s * Math.PI;
      const vc = cy + Math.cos(ang) * RADIUS;
      const vi = Math.round(vc);
      if (vi < 0 || vi >= wallH) continue;

      const hue = (progress * 0.5 + t * 0.06 + s * 0.5) % 1;
      const [r, g, b] = hsl(hue, 1, 0.95);
      core.setWallPixel(x, vi, r, g, b);

      for (let d = 1; d <= 3; d++) {
        const fade = Math.pow(1 - d / 4, 2) * 0.7;
        const [rg, gg, bg] = hsl(hue, 0.9, fade);
        core.setWallPixel(x, vi - d, rg, gg, bg);
        core.setWallPixel(x, vi + d, rg, gg, bg);
      }
    }

    if (x % 3 === 0) {
      const ang0 = progress * Math.PI * 2 * TURNS + t * 1.4;
      const v0 = cy + Math.cos(ang0) * RADIUS;
      const v1 = cy + Math.cos(ang0 + Math.PI) * RADIUS;
      const vMin = Math.round(Math.min(v0, v1));
      const vMax = Math.round(Math.max(v0, v1));
      const rungHue = (progress * 0.5 + t * 0.06 + 0.5) % 1;
      for (let v = vMin; v <= vMax; v++) {
        if (v < 0 || v >= wallH) continue;
        const frac = (v - vMin) / Math.max(1, vMax - vMin);
        const bright = Math.sin(frac * Math.PI) * 0.8;
        const [rr, gr, br] = hsl(rungHue, 1, bright);
        core.setWallPixel(x, v, rr, gr, br);
      }
    }
  }
}

module.exports = effectDNAWall;
