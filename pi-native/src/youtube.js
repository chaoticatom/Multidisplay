// YouTube for the Video Display effect, via yt-dlp (free, no API key; it
// must be installed on the Pi: sudo apt install yt-dlp). search() lists
// videos for a query; resolve() turns a video id into a direct stream URL
// that the existing ffmpeg video source can play. Spawn is injectable for
// tests.
'use strict';
const { spawn: realSpawn } = require('child_process');

function run(args, spawn, timeoutMs) {
  return new Promise((resolve, reject) => {
    let out = '', err = '', done = false;
    let p;
    try { p = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { if (!done) { done = true; try { p.kill(); } catch (e) { /* gone */ } reject(new Error('YouTube took too long to answer')); } }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); reject(e.code === 'ENOENT' ? new Error('yt-dlp is not installed on the Pi - run: sudo apt install yt-dlp') : e); });
    p.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code === 0) resolve(out); else reject(new Error((err.trim().split('\n').pop() || `yt-dlp exited (${code})`).replace(/^ERROR:\s*/, '').slice(0, 160)));
    });
  });
}

async function search(query, spawn = realSpawn) {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return [];
  const out = await run(['--flat-playlist', '-J', '--no-warnings', `ytsearch12:${q}`], spawn, 30000);
  const data = JSON.parse(out);
  return (data.entries || []).filter((e) => e && /^[\w-]{6,20}$/.test(e.id || '')).map((e) => ({
    id: e.id, title: String(e.title || 'Video').slice(0, 120), channel: String(e.channel || e.uploader || '').slice(0, 60),
    duration: Number(e.duration) || 0,
  }));
}

async function resolve(id, spawn = realSpawn) {
  if (!/^[\w-]{6,20}$/.test(String(id || ''))) throw new Error('bad video id');
  // A small single-file stream is plenty for LED panels and easy on the Pi.
  // YouTube often blocks the default web client ("The page needs to be
  // reloaded", "Sign in to confirm..."), so on failure retry as the TV /
  // iOS / Android clients before giving up.
  const base = ['-f', 'best[height<=360][vcodec!=none][acodec!=none]/best[height<=480]/best', '-g', '--no-warnings'];
  const attempts = [[], ['--extractor-args', 'youtube:player_client=tv,ios'], ['--extractor-args', 'youtube:player_client=android,web_safari']];
  let lastErr = null;
  for (const extra of attempts) {
    try {
      const out = await run([...base, ...extra, `https://www.youtube.com/watch?v=${id}`], spawn, 40000);
      const url = out.trim().split('\n')[0];
      if (/^https?:\/\//.test(url)) return url;
      lastErr = new Error('no playable stream found');
    } catch (e) {
      if (/not installed/.test(e.message)) throw e;
      lastErr = e;
    }
  }
  throw new Error(`${lastErr.message.replace(/^\[youtube\]\s*[\w-]+:\s*/, '')} - update yt-dlp on the Pi: sudo pip3 install -U yt-dlp --break-system-packages`);
}

module.exports = { search, resolve };
