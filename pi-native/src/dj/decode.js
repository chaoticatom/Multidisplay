// Auto-DJ decoding through ffmpeg (the same tool the radio uses).
//   decodeAnalysis(input)       -> Float32Array, mono 11025 Hz (for dj/analyse.js)
//   decodePlay(input, tempo)    -> Int16Array, stereo 44100 Hz, sped up or
//                                  slowed by `tempo` (1 = as is) with the
//                                  pitch kept (ffmpeg's atempo)
// `input` is { url, opts } - a file path, or a stream URL plus ffmpeg input
// options (YouTube). Tracks are capped at 10 minutes. spawn is injectable.
'use strict';
const { spawn: realSpawn } = require('child_process');

const MAX_SECS = 10 * 60; // ~106 MB of audio a deck at most

function run(input, outArgs, spawn, maxBytes) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', ...(input.opts || []), '-i', input.url, '-t', String(MAX_SECS), ...outArgs, 'pipe:1'];
    let p;
    try { p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const chunks = []; let size = 0, err = '';
    p.stdout.on('data', (d) => { size += d.length; if (size <= maxBytes) chunks.push(d); });
    p.stderr.on('data', (d) => { err = (err + d).slice(-1000); });
    p.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('ffmpeg is not installed - sudo apt install ffmpeg') : e));
    p.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code !== 0 && buf.length < 44100) reject(new Error((err.trim().split('\n').pop() || `ffmpeg exited (${code})`).slice(0, 160)));
      else resolve(buf);
    });
  });
}

async function decodeAnalysis(input, spawn = realSpawn) {
  const buf = await run(input, ['-vn', '-ac', '1', '-ar', '11025', '-f', 'f32le'], spawn, MAX_SECS * 11025 * 4);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}

// atempo takes 0.5..2 per stage; the Auto-DJ stays within about +-8%.
async function decodePlay(input, tempo = 1, spawn = realSpawn) {
  const t = Math.max(0.5, Math.min(2, tempo || 1));
  const filt = Math.abs(t - 1) > 0.0005 ? ['-af', `atempo=${t.toFixed(5)}`] : [];
  const buf = await run(input, ['-vn', ...filt, '-ac', '2', '-ar', '44100', '-f', 's16le'], spawn, MAX_SECS * 44100 * 4 * 1.1);
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)).slice();
}

module.exports = { decodeAnalysis, decodePlay, MAX_SECS };
