// Wall-mode counterpart to video.js: ffmpeg scales the source straight to
// wallW x wallH as one continuous image (no cube layouts). Reuses effectOptions.video
// and render.js's applyBrightSat(); `scroll` pans the source horizontally, wrapping.
// Has its own FfmpegSource - cube and wall never run in the same tick, and each idles
// out on its own (IDLE_TIMEOUT_MS).
const { FfmpegSource } = require('./video/ffmpegSource');
const { browserFrameSource } = require('./video/browserFrameSource');
const { applyBrightSat } = require('./video/render');
const { drawLinesCentered, FONT_3x5, wallPlot } = require('./text');

const DECODE_FPS = 10; // matches video.js - an LED wall has no use for real video frame rates

const source = new FfmpegSource();
let scrollX = 0;
let lastSourceKind = 'url'; // read by getStatus(), which is called with no args (see video.js's equivalent comment)

function getStatus() { return lastSourceKind === 'browser' ? browserFrameSource.getStatus() : source.getStatus(); }

function effectVideoWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW || !wallH) return; // core.initWall() hasn't run yet

  const opts = core.effectOptions?.video || {};
  const sourceKind = opts.source === 'browser' ? 'browser' : 'url';
  lastSourceKind = sourceKind;
  const url = (opts.url || '').trim();
  const bright = opts.bright ?? 1;
  const sat = opts.sat ?? 1;
  const scrollSpeed = opts.scroll ?? 0;
  const fit = opts.fit === 'contain' ? 'contain' : 'stretch'; // see video.js's equivalent comment

  // Browser-captured frames are sent already sized to wallW x wallH (see
  // public/app.js's startBrowserCapture() - it reads the wall's own
  // current dims to size its capture canvas), so there's no compositing
  // difference from the ffmpeg path here at all, unlike video.js's cube
  // variant (which has to clamp the layout for browser sources) - a flat
  // wall was already "one continuous image, no layout picker" to begin
  // with.
  let frame;
  if (sourceKind === 'browser') {
    frame = browserFrameSource.getFrame(wallW, wallH);
  } else {
    source.ensure(url, wallW, wallH, DECODE_FPS, fit);
    frame = source.getFrame(wallW, wallH);
  }

  core.t += dt;
  const t = core.t;

  if (!frame) {
    // No source loaded / not decoding yet - same pulsing-purple "waiting"
    // placeholder spirit as video.js's early return, just drawn across the
    // whole wall canvas instead of per cube face.
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    for (let y = 0; y < wallH; y++) {
      for (let x = 0; x < wallW; x++) {
        core.setWallPixel(x, y, pulse * 0.12, pulse * 0.03, pulse * 0.15);
      }
    }
    const scale = Math.max(1, Math.min(4, Math.floor(Math.min(wallW / 40, wallH / 24))));
    drawLinesCentered(FONT_3x5, ['LOAD A VIDEO'], wallW, wallH, wallPlot(core, 0.75, 0.5, 0.9), { scale });
    return;
  }

  if (scrollSpeed !== 0) scrollX = (scrollX + dt * scrollSpeed * wallW * 0.4 + wallW) % wallW;
  const sx0 = scrollX | 0;

  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const srcX = (x + sx0) % wallW;
      const i = (y * wallW + srcX) * 3;
      const [r, g, b] = applyBrightSat(frame[i], frame[i + 1], frame[i + 2], bright, sat);
      core.setWallPixel(x, y, r / 255, g / 255, b / 255);
    }
  }
}

module.exports = effectVideoWall;
module.exports.getStatus = getStatus;
// See wsServer.js's "stopVideoSource" command / video.js's equivalent export.
module.exports.stop = () => source.stop();
