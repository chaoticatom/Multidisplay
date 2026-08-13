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
// Local file upload IS supported, just not via drag-drop/<input> reading
// the file directly the way a browser tab could: #vid-file-btn/
// #img-file-btn open the browser's native file picker (works from a
// phone's camera roll too), the chosen File's raw bytes are POSTed to
// wsServer.js's /api/uploadVideo, saved to disk on the Pi, and the
// resulting local path is fed to effectOptions.video.url exactly like a
// typed URL - ffmpeg reads a filesystem path the same way it reads a URL,
// so no extra code path was needed here once the upload plumbing existed.
// See wsServer.js's UPLOAD_DIR block and public/app.js's
// uploadVideoFile()/wireVideoPanel() for the rest of that flow.
//
// Live webcam / screen capture (#vid-cam-btn/#vid-screen-btn) IS also
// supported, just via a different mechanism than the browser original's
// direct getUserMedia()/getDisplayMedia() -> <video> -> <canvas> pipeline:
// a headless Pi has no camera/display of its own, but the CONNECTED
// BROWSER TAB does, so it captures+downsamples frames itself and streams
// them to the Pi over the WS connection as binary messages (see
// wsServer.js's module comment for the wire format and public/app.js's
// startBrowserCapture()). Server-side this just means reading from
// browserFrameSource.js's shared singleton instead of FfmpegSource when
// effectOptions.video.source==='browser' - buildComposite()/
// projectToFaces() below don't know or care which source a frame came
// from. See that file's module comment for the full story.
//
// Still explicitly out of scope (no server-side equivalent):
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
const { browserFrameSource } = require('./video/browserFrameSource');
const { buildComposite, projectToFaces } = require('./video/render');

const DECODE_FPS = 10; // an LED wall has no use for real video frame rates; keeps ffmpeg CPU/pipe load sane on a Pi

const source = new FfmpegSource();
let vidScrollX = 0;
let lastSourceKind = 'url'; // read by getStatus(), which is called with no args (see module comment)

function getStatus() { return lastSourceKind === 'browser' ? browserFrameSource.getStatus() : source.getStatus(); }

function effectVideo(core, dt) {
  const { N, SIZE: S } = core;
  const opts = core.effectOptions?.video || {};
  const sourceKind = opts.source === 'browser' ? 'browser' : 'url';
  lastSourceKind = sourceKind;
  const url = (opts.url || '').trim();
  let layout = opts.layout || 'panorama';
  const bright = opts.bright ?? 1;
  const sat = opts.sat ?? 1;
  const scrollSpeed = opts.scroll ?? 0;
  const tb = opts.tb === 'spectrum' ? 'dark' : (opts.tb || 'dark'); // spectrum has no audio pipeline here - see module comment

  let decodeW, decodeH, frame;
  if (sourceKind === 'browser') {
    // Browser-captured frames always arrive as a single S×S tile (see
    // browserFrameSource.js's module comment) - there's no browser-side
    // equivalent of a real panoramic video source to fill a 4-wide
    // composite from, so panorama/perspective (which need one) aren't
    // meaningful here. Clamp to 'mirror' if that's what's selected -
    // public/app.js also disables those two layout buttons while
    // source==='browser', this is just defensive on the server side too.
    if (layout === 'panorama' || layout === 'perspective') layout = 'mirror';
    decodeW = S; decodeH = S;
    frame = browserFrameSource.getFrame(decodeW, decodeH);
  } else {
    // Decode dims: panorama/perspective need the full 4-wide panorama
    // straight out of ffmpeg (render.js composites those with a straight
    // per-pixel pass); mirror/tile only need a single S×S source tile
    // (render.js composites the 4 flipped/tiled copies itself) - no point
    // asking ffmpeg to decode 4x the pixels those layouts would just
    // downsample/discard.
    const wrap = layout === 'panorama' || layout === 'perspective';
    decodeW = wrap ? 4 * S : S; decodeH = S;
    source.ensure(url, decodeW, decodeH, DECODE_FPS);
    frame = source.getFrame(decodeW, decodeH);
  }

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
