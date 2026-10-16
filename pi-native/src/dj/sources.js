// Auto-DJ track sources: your MP3s (uploaded to the music folder) and/or
// YouTube (a playlist link or a search, through yt-dlp - streamed, never
// stored). A track is { kind: 'mp3'|'yt', id, title }; inputFor(track)
// gives what ffmpeg reads.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn: realSpawn } = require('child_process');

const MUSIC_DIR = path.join(__dirname, '..', '..', 'music');
const AUDIO_RE = /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i;

function listMusic() {
  try { return fs.readdirSync(MUSIC_DIR).filter((f) => AUDIO_RE.test(f)).sort(); } catch (e) { return []; }
}
const titleOf = (file) => file.replace(AUDIO_RE, '').replace(/^\d{10,}-/, '').replace(/[_]+/g, ' ').slice(0, 100);
function deleteMusic(name) {
  if (!listMusic().includes(name)) return false;
  fs.unlinkSync(path.join(MUSIC_DIR, name));
  return true;
}

function ytRun(args, spawn, timeoutMs) {
  const yt = require('../youtube');
  const cookies = yt.signedIn() ? ['--cookies', yt.COOKIE_FILE] : [];
  return new Promise((resolve, reject) => {
    let out = '', err = '', done = false, p;
    try { p = spawn('yt-dlp', [...cookies, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { if (!done) { done = true; try { p.kill(); } catch (e) { /* gone */ } reject(new Error('YouTube took too long to answer')); } }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e.code === 'ENOENT' ? new Error('yt-dlp is not installed on the Pi') : e); } });
    p.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); if (code === 0) resolve(out); else reject(new Error((err.trim().split('\n').pop() || 'yt-dlp failed').replace(/^ERROR:\s*/, '').slice(0, 160))); });
  });
}

// YouTube tracks for a playlist/video link or a search (up to 40).
async function youtubeTracks(query, spawn = realSpawn) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return [];
  const target = /^https?:\/\//.test(q) ? q : `ytsearch25:${q}`;
  const out = await ytRun(['--flat-playlist', '-J', '--no-warnings', '--playlist-end', '40', target], spawn, 45000);
  const data = JSON.parse(out), entries = data.entries || [data];
  return entries.filter((e) => e && /^[\w-]{6,20}$/.test(e.id || '') && !(e.duration && e.duration > 10 * 60))
    .map((e) => ({ kind: 'yt', id: e.id, title: String(e.title || 'YouTube').slice(0, 100) }));
}

// The audio-only stream for a YouTube track.
async function youtubeAudio(id, spawn = realSpawn) {
  const attempts = [[], ['--extractor-args', 'youtube:player_client=tv,ios'], ['--extractor-args', 'youtube:player_client=android,web_safari']];
  let last = null;
  for (const extra of attempts) {
    try {
      const out = await ytRun(['-f', 'bestaudio/best', '-g', '--no-warnings', ...extra, `https://www.youtube.com/watch?v=${id}`], spawn, 40000);
      const url = out.trim().split('\n').find((l) => /^https?:\/\//.test(l));
      if (url) return url;
    } catch (e) { last = e; if (/not installed/.test(e.message)) throw e; }
  }
  throw last || new Error('no audio stream');
}

async function inputFor(track, spawn = realSpawn) {
  if (track.kind === 'mp3') return { url: path.join(MUSIC_DIR, track.id), opts: [] };
  return { url: await youtubeAudio(track.id, spawn), opts: ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] };
}

// All tracks for the Auto-DJ settings, shuffled.
async function allTracks(cfg, spawn = realSpawn) {
  const out = [];
  if (cfg.source !== 'youtube') for (const f of listMusic()) out.push({ kind: 'mp3', id: f, title: titleOf(f) });
  if (cfg.source !== 'mp3' && cfg.youtube) { try { out.push(...await youtubeTracks(cfg.youtube, spawn)); } catch (e) { if (!out.length) throw e; } }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

module.exports = { MUSIC_DIR, AUDIO_RE, listMusic, deleteMusic, titleOf, youtubeTracks, youtubeAudio, inputFor, allTracks };
