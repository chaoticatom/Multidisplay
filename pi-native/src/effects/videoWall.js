// Wall-mode counterpart to video.js - same idea as gradientWashWall.js vs
// gradientWash.js: decode/render onto the WHOLE stitched wall canvas
// (core.wallW/core.wallH, built from however many panels are currently
// placed/dragged in the "+"-button grid - see panelConfig.js/core.js's
// initWall()) as one continuous image, instead of repeating the same
// frame identically on every panel.
//
// Much simpler than video.js's cube variant: a flat wall has no faces to
// wrap a panorama around, so there's nothing here corresponding to
// video.js's layout picker (panorama/mirror/tile/perspective) or its
// top/bottom face handling - ffmpeg is just asked to scale the source
// straight to wallW x wallH and that's the whole picture. Reuses
// video.js's own effectOptions.video.{url,bright,sat,scroll} (same
// option-panel fields, no separate wall-specific controls needed) and
// render.js's applyBrightSat() so brightness/saturation match the cube
// variant exactly. `scroll` here means "pan the source horizontally
// across the canvas, wrapping" - useful when the wall's aspect ratio
// doesn't match the video's and you'd rather see all of it pass by than
// have it letterboxed/stretched.
//
// Separate FfmpegSource instance from video.js's - the two never run in
// the same tick (app.js dispatches EFFECTS xor WALL_EFFECTS depending on
// config.mode), so there's no benefit to sharing one, and keeping them
// independent means switching between cube/2d and wall mode just starts/
// idles-out the other's process on its own schedule (see
// ffmpegSource.js's IDLE_TIMEOUT_MS) rather than needing any hand-off.
const { FfmpegSource } = require('./video/ffmpegSource');
const { browserFrameSource } = require('./video/browserFrameSource');
const { applyBrightSat } = require('./video/render');

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
