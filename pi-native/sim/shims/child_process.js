// Browser shim for Node's 'child_process' - only reached by video.js's
// FfmpegSource, which the simulator UI never exposes (video playback needs
// a real ffmpeg binary and can't run in a browser tab). Bundled in only so
// effects/index.js's eager `require('./video')` doesn't fail to resolve;
// spawn() throwing keeps FfmpegSource's own error handling in charge if
// something ever calls it in sim mode instead of silently hanging.
function spawn() {
  throw new Error('video playback (ffmpeg) is not available in the browser simulator');
}
module.exports = { spawn };
