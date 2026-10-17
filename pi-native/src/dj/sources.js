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

function ytRun(args, spawn, timeoutMs, { anon = false } = {}) {
  const yt = require('../youtube');
  const cookies = !anon && yt.signedIn() ? ['--cookies', yt.COOKIE_FILE] : [];
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

// "Artist - Title" from a YouTube Music entry (its channel is often
// "Artist - Topic"); a video title that already names the artist is kept.
const artistOf = (e) => String((Array.isArray(e.artists) && e.artists[0]) || e.artist || e.channel || e.uploader || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim().slice(0, 60);
const cleanTitle = (e) => String(e.track || e.title || 'YouTube').trim().replace(/\s*[([](official( music)?( video| audio)?|lyrics?( video)?|audio|hd|4k|visuali[sz]er)[)\]]/gi, '').trim();
function prettyTitle(e) {
  const artist = artistOf(e), clean = cleanTitle(e);
  if (!artist || clean.toLowerCase().includes(artist.toLowerCase())) return clean.slice(0, 100);
  return (artist + ' – ' + clean).slice(0, 100);
}
// A track: its full display title, plus the song name and artist on their own (for the list).
function toTrack(e) {
  const artist = artistOf(e); let name = cleanTitle(e);
  // A video titled "Artist - Song": the song part on its own.
  if (artist && name.toLowerCase().startsWith(artist.toLowerCase())) name = name.slice(artist.length).replace(/^\s*[-–:|]\s*/, '') || name;
  return { kind: 'yt', id: e.id, title: prettyTitle(e), name: name.slice(0, 100), artist };
}
const toTracks = (entries) => entries.filter((e) => e && /^[\w-]{6,20}$/.test(e.id || '') && !(e.duration && e.duration > 10 * 60)).map(toTrack);
async function flat(target, spawn, max = 40) {
  const out = await ytRun(['--flat-playlist', '-J', '--no-warnings', '--playlist-end', String(max), target], spawn, 45000);
  const data = JSON.parse(out);
  return data.entries || [data];
}

// YouTube tracks for a playlist/video link or a search (up to 40). A search
// asks YouTube Music for songs first (the official audio versions, without
// a video's intro and outro), then ordinary YouTube.
// artist: only songs by that artist (as far as YouTube says).
async function youtubeTracks(query, spawn = realSpawn, { artist = false } = {}) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return [];
  if (/^https?:\/\//.test(q)) return toTracks(await flat(q, spawn));
  if (artist) {
    const want = q.toLowerCase();
    let all = [];
    try { all = toTracks(await flat(`https://music.youtube.com/search?q=${encodeURIComponent(q)}#songs`, spawn, 60)); } catch (e) { if (/not installed/.test(e.message)) throw e; }
    if (all.length < 5) all = all.concat(toTracks(await flat(`ytsearch40:${q}`, spawn)));
    const by = all.filter((t) => t.artist.toLowerCase().includes(want) || t.title.toLowerCase().startsWith(want));
    return by.length >= 3 ? by : all;
  }
  try {
    const t = toTracks(await flat(`https://music.youtube.com/search?q=${encodeURIComponent(q)}#songs`, spawn, 30));
    if (t.length >= 5) return t;
  } catch (e) { if (/not installed/.test(e.message)) throw e; }
  return toTracks(await flat(`ytsearch25:${q}`, spawn));
}

// Your YouTube Music library (signed in): Liked music, then your playlists.
async function youtubeLibrary(spawn = realSpawn) {
  const yt = require('../youtube');
  if (!yt.signedIn()) throw new Error('Sign in to YouTube first (just below)');
  const items = [{ id: 'LM', title: '❤ Liked music', url: 'https://music.youtube.com/playlist?list=LM' }];
  for (const src of ['https://www.youtube.com/feed/playlists', 'https://music.youtube.com/library/playlists']) {
    try {
      for (const e of await flat(src, spawn, 100)) {
        const id = e.id || (String(e.url || '').match(/list=([\w-]+)/) || [])[1];
        if (!id || !/^[\w-]{2,64}$/.test(id) || items.some((x) => x.id === id)) continue;
        items.push({ id, title: String(e.title || 'Playlist').slice(0, 80), url: `https://music.youtube.com/playlist?list=${id}` });
      }
    } catch (e) { if (/not installed/.test(e.message)) throw e; }
  }
  return items;
}

// YouTube Music's radio for a song: similar songs, endlessly (its "mix").
async function youtubeRadio(id, spawn = realSpawn) {
  if (!/^[\w-]{6,20}$/.test(id)) return [];
  return toTracks(await flat(`https://www.youtube.com/watch?v=${id}&list=RDAMVM${id}`, spawn, 40)).filter((t) => t.id !== id);
}

// The best audio-only stream. (Premium's 256 kbps format 141 is left out:
// with current YouTube it often arrives unplayable - 'Invalid data'.)
const AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio/best';
// The audio-only stream for a YouTube track.
let lastAttempt = 0;
const URL_ATTEMPTS = [[true], [true, '--extractor-args', 'youtube:player_client=android,ios'], [false], [false, '--extractor-args', 'youtube:player_client=tv,ios']];
// from: the attempt to start at (a download that failed moves on to the next).
async function youtubeAudio(id, spawn = realSpawn, from = 0) {
  // Without the sign-in first: signed-in requests now often get a stream
  // address that needs a security token yt-dlp doesn't have, which ffmpeg
  // then can't read ('Invalid data'). The account is the fallback (for
  // songs that need it).
  let last = null;
  for (let i = from; i < URL_ATTEMPTS.length; i++) {
    const [anon, ...extra] = URL_ATTEMPTS[i];
    try {
      const out = await ytRun(['-f', AUDIO_FORMAT, '-g', '--no-warnings', ...extra, `https://www.youtube.com/watch?v=${id}`], spawn, 40000, { anon });
      const url = out.trim().split('\n').find((l) => /^https?:\/\//.test(l));
      if (url) { lastAttempt = i; return url; }
    } catch (e) { last = e; if (/not installed/.test(e.message)) throw e; }
  }
  throw last || new Error('no audio stream');
}

// YouTube tracks are fetched once into a small temporary cache (the last
// few only, deleted as newer ones arrive): analysis and playback both read
// the file, and the next track can be fetched ahead while one plays.
const CACHE_DIR = path.join(process.env.TMPDIR || '/tmp', 'multidisplay-dj');
const CACHE_KEEP = 5;
const FETCH_WAIT_MS = 20000;
const fetching = new Map();
// Only a finished audio file counts: while yt-dlp works it leaves pieces
// (.part, .part-Frag3, .ytdl, .temp...) that aren't playable.
const DONE_RE = /^[\w-]+\.(mka|m4a|webm|opus|ogg|mp3|aac|mp4)$/;
function cachedFile(id) {
  try { const f = fs.readdirSync(CACHE_DIR).find((x) => x.startsWith(id + '.') && DONE_RE.test(x)); return f ? path.join(CACHE_DIR, f) : null; } catch (e) { return null; }
}
// A cached file that turned out unplayable: remove it (and any pieces).
function dropCached(id) {
  try { for (const f of fs.readdirSync(CACHE_DIR)) if (f.startsWith(id + '.')) fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (e) { /* nothing cached */ }
}
function trimCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => DONE_RE.test(f)).map((f) => ({ f, t: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(CACHE_KEEP)) fs.unlinkSync(path.join(CACHE_DIR, f));
  } catch (e) { /* nothing cached */ }
}
function fetchYoutube(id, spawn = realSpawn) {
  if (!/^[\w-]{6,20}$/.test(id)) return Promise.reject(new Error('bad id'));
  const have = cachedFile(id); if (have) return Promise.resolve(have);
  if (fetching.has(id)) return fetching.get(id);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // The same stream address that plays, saved as it comes by ffmpeg (no
  // re-encoding) into Matroska, which holds any audio codec.
  const job = (async () => {
    let from = 0, lastErr = null;
    while (from < URL_ATTEMPTS.length) {
      let url;
      try { url = await youtubeAudio(id, spawn, from); } catch (e) { throw lastErr || e; }
      const tried = lastAttempt;
      try { return await saveStream(id, url, spawn); } catch (e) { lastErr = e; from = tried + 1; }
    }
    throw lastErr || new Error('no audio');
  })().finally(() => fetching.delete(id));
  fetching.set(id, job);
  return job;
}
// ffmpeg saves a stream address's audio as it comes into the cache.
async function saveStream(id, url, spawn) {
  {
    const tmp = path.join(CACHE_DIR, id + '.mka.part'), out = path.join(CACHE_DIR, id + '.mka');
    await new Promise((resolve, reject) => {
      let p, err = '';
      try { p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url, '-vn', '-c:a', 'copy', '-t', '600', '-f', 'matroska', tmp], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { try { p.kill(); } catch (e) { /* gone */ } reject(new Error('download took too long')); }, 150000);
      if (p.stderr) p.stderr.on('data', (d) => { err = (err + d).slice(-400); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error((err.trim().split('\n').pop() || 'ffmpeg exited ' + code).slice(0, 160))); });
    });
    let size = 0; try { size = fs.statSync(tmp).size; } catch (e) { /* missing */ }
    if (size < 50000) { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } throw new Error('download came back empty'); }
    fs.renameSync(tmp, out);
    trimCache();
    return out;
  }
}
// Start fetching a track in the background (the one after next).
function prefetch(track, spawn = realSpawn) { if (track && track.kind === 'yt') fetchYoutube(track.id, spawn).catch(() => {}); }

async function inputFor(track, spawn = realSpawn) {
  if (track.kind === 'mp3') return { url: path.join(MUSIC_DIR, track.id), opts: [] };
  // The cached file if it's there within FETCH_WAIT_MS; otherwise stream
  // this one (the download carries on, for the next time it plays).
  let timer = null;
  const file = await Promise.race([
    fetchYoutube(track.id, spawn).catch((e) => { if (/not installed/.test(e.message)) throw e; return null; }),
    new Promise((r) => { timer = setTimeout(() => r(null), FETCH_WAIT_MS); }),
  ]).finally(() => clearTimeout(timer));
  if (file) return { url: file, opts: [] };
  return { url: await youtubeAudio(track.id, spawn), opts: ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] };
}

// Analyses of your MP3s (tempo, key, ...), kept so a track is only analysed once.
const CACHE = path.join(MUSIC_DIR, '.dj-analysis.json');
function loadAnalyses() {
  try { const all = JSON.parse(fs.readFileSync(CACHE, 'utf8')), files = new Set(listMusic()), out = {}; for (const k of Object.keys(all)) if (files.has(k)) out[k] = all[k]; return out; } catch (e) { return {}; }
}
function saveAnalysis(track, info) {
  if (track.kind !== 'mp3') return;
  const all = loadAnalyses(); all[track.id] = info;
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  require('../atomicWrite').atomicWriteJson(CACHE, all);
}

// All tracks for the Auto-DJ settings, shuffled.
async function allTracks(cfg, spawn = realSpawn) {
  const out = [];
  if (cfg.source !== 'youtube') for (const f of listMusic()) { const t = titleOf(f), m = t.match(/^(.+?)\s+-\s+(.+)$/); out.push({ kind: 'mp3', id: f, title: t, name: m ? m[2] : t, artist: m ? m[1] : '' }); }
  // YouTube: the link or search given; with none, your Liked music (signed in).
  const ytQuery = cfg.youtube || (require('../youtube').signedIn() ? 'https://music.youtube.com/playlist?list=LM' : '');
  if (cfg.source !== 'mp3' && ytQuery) { try { out.push(...await youtubeTracks(ytQuery, spawn, { artist: !!cfg.ytArtist && !!cfg.youtube })); } catch (e) { if (!out.length) throw e; } }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

module.exports = { MUSIC_DIR, AUDIO_RE, listMusic, deleteMusic, titleOf, youtubeTracks, youtubeAudio, dropCached, youtubeLibrary, youtubeRadio, prettyTitle, prefetch, fetchYoutube, CACHE_DIR, inputFor, allTracks, loadAnalyses, saveAnalysis };
