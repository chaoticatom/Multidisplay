// Ported from effects-media.js's effectVideo() (~line 168) - "Video
// Display". Architecturally different from every other effect ported so
// far: the browser gets frames from an HTML5 <video> element (local file
// drag-drop, webcam, or screen capture via getDisplayMedia/getUserMedia) -
// none of which exist in a headless Node server. Scoped down to a single
// new capability instead: decoding a real video from a URL via a spawned
// system `ffmpeg` process (see ./video/ffmpegSource.js) into raw RGB24
// frames, which is then projected onto the cube the same way the browser
// projected <video>/<img> canvas pixels (see ./video/render.js, shared
// between this and the static-image fallback since the browser
// duplicates that same compositing math across both its own code paths).
//
// Explicitly out of scope (no server-side equivalent, same "permanent
// scope boundary" category as cam.js's snapshot-only Camera effect):
//   - local file upload / webcam / screen capture (#vid-file-btn/
//     #img-file-btn/#vid-screen-btn/#vid-cam-btn in the sidebar markup are
//     greyed out client-side, see public/app.js's wireVideoPanel())
//   - vidTB==='spectrum' (mic-driven spectrum analyser on the top/bottom
//     faces) - no audio pipeline here, falls back to 'dark' behaviour,
//     same documented fallback fireworks.js's mic mode already uses.
//
// Requires `ffmpeg` installed on the Pi (`sudo apt install ffmpeg`) - see
// ffmpegSource.js for the full failure-handling story when it's missing
// or a URL is bad. This is a new *system* package dependency (not an npm
// one - see ffmpegSource.js's module comment for why shelling out to a
// system binary is the right call here, same pattern as bluetooth.js's
// bluetoothctl/pactl shell-outs), so a fresh pi-native install won't have
// this effect working until that's installed - status is surfaced via
// getStatus() same as every other network/process-backed effect.
const { FfmpegSource } = require('./video/ffmpegSource');
const { buildComposite, projectToFaces } = require('./video/render');

const DECODE_FPS = 10; // an LED wall has no use for real video frame rates; keeps ffmpeg CPU/pipe load sane on a Pi

const source = new FfmpegSource();
let vidScrollX = 0;

function getStatus() { return source.getStatus(); }

function effectVideo(core, dt) {
  const { N, SIZE: S } = core;
  const opts = core.effectOptions?.video || {};
  const url = (opts.url || '').trim();
  const layout = opts.layout || 'panorama';
  const bright = opts.bright ?? 1;
  const sat = opts.sat ?? 1;
  const scrollSpeed = opts.scroll ?? 0;
  const tb = opts.tb === 'spectrum' ? 'dark' : (opts.tb || 'dark'); // spectrum has no audio pipeline here - see module comment

  // Decode dims: panorama/perspective need the full 4-wide panorama
  // straight out of ffmpeg (render.js composites those with a straight
  // per-pixel pass); mirror/tile only need a single S×S source tile
  // (render.js composites the 4 flipped/tiled copies itself) - no point
  // asking ffmpeg to decode 4x the pixels those layouts would just
  // downsample/discard.
  const wrap = layout === 'panorama' || layout === 'perspective';
  const decodeW = wrap ? 4 * S : S, decodeH = S;

  source.ensure(url, decodeW, decodeH, DECODE_FPS);
  const frame = source.getFrame(decodeW, decodeH);

  core.t += dt;
  const t = core.t;

  if (!frame) {
    // No source loaded / not decoding yet - same pulsing purple "waiting"
    // placeholder as the browser's early-return branch.
    for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    for (let f = 0; f < 4; f++) {
      for (let u = 0; u < S; u++) core.setFaceLED(f, u, S >> 1, pulse * 0.2, pulse * 0.05, pulse * 0.22);
      core.setFaceLED(f, S >> 1, (S >> 1) - 1, 0, pulse * 0.3, pulse * 0.35);
      core.setFaceLED(f, S >> 1, (S >> 1) + 1, 0, pulse * 0.3, pulse * 0.35);
    }
    return;
  }

  if (scrollSpeed !== 0) vidScrollX = (vidScrollX + dt * scrollSpeed * S * 0.8 + 4 * S) % (4 * S);

  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);
  const composite = buildComposite(frame, decodeW, decodeH, S, layout, bright, sat);
  projectToFaces(core, composite, S, layout, tb, vidScrollX);
}

module.exports = effectVideo;
module.exports.getStatus = getStatus;
