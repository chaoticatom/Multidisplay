// YouTube for the Video Display effect, via yt-dlp (free, no API key; it
// must be installed on the Pi: sudo apt install yt-dlp). search() lists
// videos for a query; resolve() turns a video id into a direct stream URL
// that the existing ffmpeg video source can play. Spawn is injectable for
// tests.
'use strict';
const { spawn: realSpawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Signing in: YouTube no longer lets tools log in with a password, so the
// account comes from browser cookies (a Netscape cookies.txt exported from a
// signed-in browser, uploaded in the Video panel). Premium/age-restricted/
// members videos then play as that account.
const COOKIE_FILE = process.env.YT_COOKIE_FILE || path.join(__dirname, '..', 'youtube-cookies.txt');
function cookieArgs() { return fs.existsSync(COOKIE_FILE) ? ['--cookies', COOKIE_FILE] : []; }
function signedIn() { return fs.existsSync(COOKIE_FILE); }
function saveCookies(text) {
  const t = String(text || '');
  if (!/youtube\.com/.test(t) || !/\t/.test(t)) throw new Error('That is not a cookies.txt with YouTube cookies');
  const tmp = COOKIE_FILE + '.tmp';
  fs.writeFileSync(tmp, t, { mode: 0o600 });
  fs.renameSync(tmp, COOKIE_FILE);
}
function signOut() { try { fs.unlinkSync(COOKIE_FILE); } catch (e) { /* not signed in */ } }

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
  const out = await run([...cookieArgs(), '--flat-playlist', '-J', '--no-warnings', `ytsearch12:${q}`], spawn, 30000);
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
      const out = await run([...cookieArgs(), ...base, ...extra, `https://www.youtube.com/watch?v=${id}`], spawn, 40000);
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

// A start offset rides on the stream URL as a '#mdss=SECONDS' suffix, so a
// seek changes the URL and both the video and audio pipelines relaunch on
// their own. Returns the plain URL plus the ffmpeg input options for it:
// -ss to start there, and -re for downloaded (non-live) YouTube streams,
// which ffmpeg would otherwise decode as fast as it can.
function inputOptions(url) {
  const m = /#mdss=(\d+(?:\.\d+)?)$/.exec(url || '');
  const plain = m ? url.slice(0, m.index) : url;
  const opts = [];
  if (/googlevideo\.com|#mdss=/.test(url || '')) opts.push('-re');
  if (m && Number(m[1]) > 0) opts.push('-ss', m[1]);
  return { url: plain, opts };
}

module.exports = { inputOptions, signedIn, saveCookies, signOut, COOKIE_FILE, search, resolve };
