// Wall-mode counterpart to strobe.js - same effectOptions.strobe.{pattern,
// color,speed} option keys (no new UI needed, reuses the cube variant's
// option panel), same on/off beat timer, same COLMAP. The difference is
// entirely in *where* each pattern paints, since a flat wall has no
// cube "faces" to iterate via faceMap/SIZE - everything below operates on
// the whole stitched core.wallW x core.wallH canvas instead.
//
// Judgment call: the cube's 'faces' pattern (flash one of the 6 cube faces
// per beat, cycling) has no literal wall equivalent - a wall isn't made of
// faces. Substituted with cycling through the currently-placed *panels*
// instead (core.wallPanels, populated by initWall() from however many
// panels the user has dragged into the grid), flashing one panel-sized
// cell of the canvas at a time - the closest "discrete named region of the
// wall" concept a wall actually has. Falls back to flashing the whole
// canvas if wallPanels is empty/unset (shouldn't happen once initWall()
// has run, but keeps this from silently no-oping).
const { hsl } = require('../core');

let strobeT = 0, strobeOn = false, strobePhase = 0, strobeBeat = 0;

function effectStrobeWall(core, dt) {
  const { wallW, wallH, wallPanels } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const opts = core.effectOptions?.strobe || {};
  const mode = opts.pattern || 'all';
  const sc = opts.color || 'white';
  const speed = Number(opts.speed ?? 8);
  const period = 1 / Math.max(0.2, speed);
  strobeT += dt;
  if (strobeT >= period) { strobeT %= period; strobeOn = !strobeOn; strobePhase = (strobePhase + 1) % 2; strobeBeat++; }

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;
  if (!strobeOn) return;

  const COLMAP = { white: [1, 1, 1], red: [1, 0.05, 0.05], green: [0.05, 1, 0.05], blue: [0.1, 0.2, 1], cyan: [0.1, 1, 1] };
  const baseCol = COLMAP[sc] || [1, 1, 1];
  const multi = (sc === 'multi');
  const hue = multi ? ((strobeBeat * 0.13) % 1) : 0;
  const col = (mod) => {
    if (multi) return hsl((hue + mod) % 1, 1, 0.5);
    return baseCol;
  };
  const fill = (x0, y0, x1, y1, mod) => {
    const [r, g, b] = col(mod);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) core.setWallPixel(x, y, r, g, b);
  };

  if (mode === 'all') {
    fill(0, 0, wallW, wallH, 0);
  } else if (mode === 'checker') {
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) {
      if ((x + y) % 2 === strobePhase) { const [r, g, b] = col(0); core.setWallPixel(x, y, r, g, b); }
    }
  } else if (mode === 'faces') {
    // Substitution for the cube's "flash one face at a time": flash one
    // currently-placed panel at a time, cycling. See module comment.
    const panels = (wallPanels && wallPanels.length) ? wallPanels : null;
    if (!panels) { fill(0, 0, wallW, wallH, 0); }
    else {
      const p = panels[strobeBeat % panels.length];
      const ps = core.wallPanelSize || 64;
      fill(p.gx * ps, p.gy * ps, p.gx * ps + ps, p.gy * ps + ps, (strobeBeat % panels.length) * 0.16);
    }
  } else if (mode === 'rings') {
    const maxR = Math.ceil(Math.max(wallW, wallH) / 2);
    const ring = strobeBeat % maxR;
    const [r, g, b] = col(0);
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) {
      if (Math.round(Math.min(x, wallW - 1 - x, y, wallH - 1 - y)) === ring) core.setWallPixel(x, y, r, g, b);
    }
  } else if (mode === 'diagonal') {
    const span = Math.max(wallW, wallH);
    const offset = (strobeBeat * 3) % (span * 2);
    const [r, g, b] = col(0);
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) {
      if (((x + y + offset) % (span / 2 | 0)) < (span / 4 | 0)) core.setWallPixel(x, y, r, g, b);
    }
  } else if (mode === 'scanline') {
    const line = strobeBeat % wallH;
    const [r, g, b] = col(0);
    for (let x = 0; x < wallW; x++) {
      core.setWallPixel(x, line, r, g, b);
      if (line > 0) core.setWallPixel(x, line - 1, r * 0.6, g * 0.6, b * 0.6);
      if (line < wallH - 1) core.setWallPixel(x, line + 1, r * 0.6, g * 0.6, b * 0.6);
    }
  } else if (mode === 'burst') {
    // Substitution for the cube's per-face burst stagger: stagger by panel
    // instead of by face, same "some regions on, some off" beat pattern.
    const panels = (wallPanels && wallPanels.length) ? wallPanels : null;
    const ps = core.wallPanelSize || 64;
    if (!panels) {
      if (strobeBeat % 6 < 2) fill(0, 0, wallW, wallH, 0);
    } else {
      panels.forEach((p, f) => {
        if ((strobeBeat + f * 2) % 6 < 2) fill(p.gx * ps, p.gy * ps, p.gx * ps + ps, p.gy * ps + ps, f * 0.16);
      });
    }
  } else if (mode === 'spiral') {
    const step = strobeBeat % (Math.max(wallW, wallH) * 2);
    const cx = wallW / 2, cy = wallH / 2;
    const scale = Math.max(wallW, wallH);
    const [r, g, b] = col(0);
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) {
      const ang = Math.atan2(y - cy, x - cx);
      const rad = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (Math.round((ang / (Math.PI * 2) * scale + rad + step)) % 4 === 0) core.setWallPixel(x, y, r, g, b);
    }
  }
}

module.exports = effectStrobeWall;
