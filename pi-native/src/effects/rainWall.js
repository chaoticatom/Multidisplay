// Wall-mode counterpart to rain.js. Unlike gradientWash/depthRings/prism/
// tide, rain.js has no existing 2D/panelMode branch to generalize - its
// colour-style drops and its matrix-style streams are both written
// entirely in terms of the cube's 4 side faces (plus a top-face branch for
// matrix) via core.setFaceLED(face, u, v, ...). A flat wall has no faces
// at all, so this is a genuine flatten-to-one-surface rewrite rather than
// a coefficient-dropping port like wave/plasma/aurora/nebula above:
// instead of 4 independent face-sized rainstorms, both styles here run as
// ONE storm falling across the full stitched wallW x wallH canvas.
//
// Vertical convention: wallBuf row 0 is the top of the stitched image
// (see core.js's initWall()/setWallPixel(), and videoWall.js's raster
// iteration), so "falling" here means row index increasing over time,
// with the splash/ground effect triggered at row wallH-1 (bottom) instead
// of rain.js's v===0 (its v axis runs bottom-up per cube face, the
// opposite sense). Reusing core.effectOptions.rain.style keeps the same
// "Colour"/"Matrix" sidebar toggle the cube version already has - no new
// UI needed.
const { hsl } = require('../core');

let wallDrops = [];
function resetWallRain(core) {
  const { wallW, wallH } = core;
  wallDrops = [];
  const nDrops = Math.max(24, wallW * 0.35) | 0;
  for (let d = 0; d < nDrops; d++) {
    wallDrops.push({
      col: Math.random() * wallW | 0,
      y: Math.random() * wallH - wallH, // stagger initial fall so it doesn't all start at once
      speed: 0.35 + Math.random() * 0.9,
      hue: Math.random(), len: 5 + Math.random() * wallH * 0.22,
      bright: 0.7 + Math.random() * 0.3, wide: Math.random() < 0.15,
    });
  }
}

let wallMatrixStreams = null;
function initWallMatrixStreams(core) {
  const { wallW, wallH } = core;
  wallMatrixStreams = [];
  for (let u = 0; u < wallW; u++) {
    wallMatrixStreams[u] = {
      head: -Math.floor(Math.random() * wallH * 1.5),
      speed: 0.4 + Math.random() * 0.7,
      len: Math.floor(wallH * 0.25 + Math.random() * wallH * 0.45),
    };
  }
}

function effectRainMatrixWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallMatrixStreams || wallMatrixStreams.length !== wallW) initWallMatrixStreams(core);

  for (let u = 0; u < wallW; u++) {
    const stream = wallMatrixStreams[u];
    stream.head += stream.speed * dt * wallH; // falls downward (increasing row) toward wallH-1
    if (stream.head - stream.len > wallH) {
      stream.head = -Math.floor(Math.random() * wallH * 0.8);
      stream.speed = 0.4 + Math.random() * 0.7;
      stream.len = Math.floor(wallH * 0.25 + Math.random() * wallH * 0.45);
    }
    const headV = Math.floor(stream.head);
    for (let v = 0; v < wallH; v++) {
      const dist = headV - v; // trail extends upward (behind) from the head, same shape as rain.js's matrix trail
      if (dist < 0 || dist > stream.len) continue;
      const isHead = dist === 0;
      if (isHead) {
        core.setWallPixel(u, v, 0.7, 1.0, 0.7);
      } else {
        const frac = 1 - dist / stream.len;
        const bright = Math.pow(frac, 1.8) * 0.9;
        const flicker = 0.7 + Math.random() * 0.3;
        core.setWallPixel(u, v, bright * 0.05, bright * flicker, bright * 0.05);
      }
    }
  }
}

function effectRainWall(core, dt) {
  core.t += dt;
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let i = 0; i < wallBuf.length; i++) wallBuf[i] *= 0.78;

  const style = core.effectOptions?.rain?.style || 'colour';
  if (style === 'matrix') { effectRainMatrixWall(core, dt); return; }

  if (!wallDrops.length || wallDrops[0]._w !== wallW || wallDrops[0]._h !== wallH) {
    resetWallRain(core);
    wallDrops.forEach((d) => { d._w = wallW; d._h = wallH; });
  }

  for (const d of wallDrops) {
    d.y += d.speed * dt * (wallH * 0.48); // falls downward (increasing row)
    if (d.y > wallH + d.len) { d.y = -d.len; d.col = Math.random() * wallW | 0; d.hue = Math.random(); d.wide = Math.random() < 0.15; }

    for (let k = 0; k < d.len; k++) {
      const vy = Math.round(d.y - k); // trail extends upward (behind) from the falling head
      if (vy < 0 || vy >= wallH) continue;
      const fade = Math.pow(1 - k / d.len, 1.2) * d.bright;
      const h = (d.hue + k / d.len * 0.15) % 1;
      const [r, g, b] = hsl(h, 1, fade * 0.95);
      core.setWallPixel(d.col, vy, r, g, b);
      if (d.wide) {
        core.setWallPixel(d.col - 1, vy, r * 0.5, g * 0.5, b * 0.5);
        core.setWallPixel(d.col + 1, vy, r * 0.5, g * 0.5, b * 0.5);
      }
      if (vy === wallH - 1 && k < 4) {
        const sp = fade * 0.8;
        for (let s = -4; s <= 4; s++) {
          const sf = Math.max(0, 1 - Math.abs(s) / 4) * sp * 0.5;
          const [sr, sg, sb] = hsl(h, 1, sf);
          core.setWallPixel(d.col + s, wallH - 1, sr, sg, sb);
        }
      }
    }
    const [rh, gh, bh] = hsl(d.hue, 0.3, d.bright * 1.0);
    core.setWallPixel(d.col, Math.round(d.y), rh, gh, bh);
  }

  // Occasional full-column chromatic flash
  if (Math.random() < dt * 0.8) {
    const col = Math.random() * wallW | 0, hue = Math.random();
    for (let y = 0; y < wallH; y++) {
      const b2 = Math.pow(Math.random(), 1.5) * 0.85;
      const [r, g, b] = hsl((hue + y / wallH * 0.3) % 1, 0.9, b2);
      core.setWallPixel(col, y, r, g, b);
    }
  }
}

module.exports = effectRainWall;
