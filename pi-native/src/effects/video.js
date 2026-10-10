// "Video Display". Decodes a video URL or uploaded file (saved by wsServer.js's
// /api/uploadVideo) with a spawned system ffmpeg (./video/ffmpegSource.js) into RGB24
// frames, projected onto the cube by ./video/render.js. With source==='browser', frames
// come instead from browserFrameSource.js (webcam/screen streamed by the connected tab).
// Requires `sudo apt install ffmpeg`; failures surface via getStatus().
const { FfmpegSource } = require('./video/ffmpegSource');
const { browserFrameSource } = require('./video/browserFrameSource');
const { buildComposite, projectToFaces } = require('./video/render');
const { drawLinesCentered, FONT_3x5, facePlot } = require('./text');

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
  // 'contain' preserves the source's aspect ratio (letterboxed/pillarboxed
  // with black bars) instead of the default 'stretch' (fills w×h exactly,
  // distorting the source to fit) - see ffmpegSource.js's ensure()/_launch()
  // for how ffmpeg does the actual scale+pad in one filter pass. Most
  // useful with 'mirror'/'tile' layout (a single undistorted square tile)
  // or 2D single-panel mode (which only ever shows face 0's content
  // regardless of layout) - a real report specifically asked for this on
  // the 2D display. Has no effect on browser-captured frames (no ffmpeg
  // involved there - the browser's own canvas capture already draws at
  // exactly the target dims via drawImage's stretch, see
  // startBrowserCapture() in public/app.js).
  const fit = opts.fit === 'contain' ? 'contain' : 'stretch';

  // Panorama/perspective decode a 4S-wide composite meant to wrap around
  // the cube's 4 side faces - in '2d' single-panel mode there IS no
  // "wrap around 4 faces" (only face 0 is ever physically shown, per
  // rgbMatrixDriver.js's faceCount=1), so those layouts just showed a
  // cropped 1/4-width slice of the actual image/video instead of the
  // whole thing fitting on the one panel - a real report. Clamp to
  // 'mirror' (a single undistorted S×S tile) the same way browser-
  // captured sources already were, so a single panel always shows the
  // complete frame (optionally letterboxed via the Fit option above)
  // regardless of which layout button happens to be selected.
  const forceSingleTile = sourceKind === 'browser' || core.panelMode === '2d';
  if (forceSingleTile && (layout === 'panorama' || layout === 'perspective')) layout = 'mirror';

  let decodeW, decodeH, frame;
  if (sourceKind === 'browser') {
    // Browser-captured frames always arrive as a single S×S tile (see
    // browserFrameSource.js's module comment) - there's no browser-side
    // equivalent of a real panoramic video source to fill a 4-wide
    // composite from, so panorama/perspective (which need one) aren't
    // meaningful here.
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
    source.ensure(url, decodeW, decodeH, DECODE_FPS, fit);
    frame = source.getFrame(decodeW, decodeH);
  }

  core.t += dt;
  const t = core.t;

  if (!frame) {
    // No source loaded / not decoding yet - same pulsing purple "waiting"
    // placeholder as the browser's early-return branch.
    for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    // Say what's missing, not just a faint line (a review found the black
    // cube read as "broken"). Too small to be legible below 16x16.
    if (S >= 16) {
      const k = 0.45 + 0.35 * pulse;
      // Flipped vertically: face rows run bottom-up (see text.js's drawGlyph5x7Face).
      for (let f = 0; f < 4; f++) {
        const p = facePlot(core, f, 0.6 * k, 0.3 * k, 0.75 * k);
        drawLinesCentered(FONT_3x5, ['LOAD A', 'VIDEO'], S, S, (x, y) => p(x, S - 1 - y), { scale: S >= 64 ? 2 : 1 });
      }
      return;
    }
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
// See wsServer.js's "stopVideoSource" command - immediately tears down
// this file's FfmpegSource instance regardless of whether effectVideo()
// is even being ticked right now (it won't be, once a different effect
// is selected - see ffmpegSource.js's stop() for why that matters).
module.exports.stop = () => source.stop();
