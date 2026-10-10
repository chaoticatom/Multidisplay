// The overall volume (the slider next to brightness, prefs.volume 0..1).
// Every sound the Pi makes is scaled by it on its way to the speaker: the
// radio's PCM (radio/ffmpegAudio.js), sound effects (sfx.js) and the
// Talking Face's voice (faceTalk.js). Main thread only.
'use strict';

let level = 1;
function get() { return level; }
function set(v) { const n = Number(v); if (Number.isFinite(n)) level = Math.max(0, Math.min(1, n)); return level; }
// paplay's --volume argument (0..65536 = silent..normal).
function paplayArg(scale = 1) { return '--volume=' + Math.round(65536 * Math.max(0, Math.min(1, level * scale))); }

module.exports = { get, set, paplayArg };
