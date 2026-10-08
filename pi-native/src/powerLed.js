// Power indicator: while the display is switched off (⏻ or 💡 Panels off),
// the panels show a single dim red LED in the bottom-left corner instead of
// going fully dark, so it's clear the Pi is still on. Drawn into a spare
// blank frame (through the normal set*Pixel helpers, so the panel wiring's
// flips apply as for any effect) and pushed instead of the real frame - the
// web preview keeps showing the effect.
'use strict';

const RED = 0.5; // half brightness

let spareWall = null, spareCol = null;
function renderPowerLed(driver, core) {
  const keepWall = core.wallBuf, keepCol = core.colBuf;
  try {
    if (keepWall) {
      if (!spareWall || spareWall.length !== keepWall.length) spareWall = new Float32Array(keepWall.length);
      spareWall.fill(0); core.wallBuf = spareWall;
      core.setWallPixel(0, core.wallH - 1, RED, 0, 0); // bottom-left (y = 0 is the top)
    }
    if (keepCol) {
      if (!spareCol || spareCol.length !== keepCol.length) spareCol = new Float32Array(keepCol.length);
      spareCol.fill(0); core.colBuf = spareCol;
      if (!keepWall && core.setFaceLED) core.setFaceLED(0, 0, 0, RED, 0, 0); // cube: front face, bottom-left (v = 0 is the bottom)
    }
    driver.renderFrame(core, 1);
  } finally {
    core.wallBuf = keepWall; core.colBuf = keepCol;
  }
}

module.exports = { renderPowerLed };
