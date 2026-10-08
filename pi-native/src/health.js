// Health watch, for "the Pi becomes unresponsive after a few hours" (a real
// report). Every 5 minutes it logs this app's memory, the Pi's free memory,
// the load and how many child processes (ffmpeg, paplay, bluetoothctl,
// pactl...) are running, so a slow climb shows up in the service log and
// in Diagnostics. If memory gets dangerously low, or child processes pile
// up, it restarts the app (systemd's Restart=on-failure brings it straight
// back) before the whole Pi grinds to a halt.
//   createHealth({ read, exit, log }) -> { check(), history }
// `read` returns { rss, heap, free, total, load, children } and is
// injectable for the tests.
'use strict';
const os = require('os');
const fs = require('fs');

const HISTORY = 48; // 4 hours at 5-minute checks
const MB = 1048576;

function countChildren(pid = process.pid) {
  try {
    let n = 0;
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try { const m = /PPid:\s+(\d+)/.exec(fs.readFileSync('/proc/' + d + '/status', 'utf8')); if (m && Number(m[1]) === pid) n++; } catch (e) { /* gone */ }
    }
    return n;
  } catch (e) { return null; } // not Linux
}
// MemAvailable counts reclaimable cache as free, which os.freemem() doesn't.
function availableMem() {
  try { const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8')); if (m) return Number(m[1]) * 1024; } catch (e) { /* not Linux */ }
  return os.freemem();
}
function defaultRead() {
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, free: availableMem(), total: os.totalmem(), load: os.loadavg()[0], children: countChildren() };
}

function createHealth({ read = defaultRead, exit = (code) => process.exit(code), log = console } = {}) {
  const history = [];
  let strikes = 0;
  function check() {
    const r = read();
    const sample = { t: new Date().toISOString().slice(11, 16), rssMB: Math.round(r.rss / MB), heapMB: Math.round(r.heap / MB), freeMB: Math.round(r.free / MB), totalMB: Math.round(r.total / MB), load: Math.round(r.load * 100) / 100, children: r.children };
    history.push(sample); if (history.length > HISTORY) history.shift();
    log.log(`[health] app ${sample.rssMB} MB (heap ${sample.heapMB}), Pi free ${sample.freeMB}/${sample.totalMB} MB, load ${sample.load}, child processes ${sample.children ?? '?'}`);
    const lowMem = r.free < r.total * 0.06 || r.rss > r.total * 0.6;
    const tooManyKids = r.children !== null && r.children > 40;
    if (tooManyKids) log.warn(`[health] ${r.children} child processes running - something is not cleaning up`);
    // Two checks in a row, so one brief spike doesn't restart it.
    strikes = lowMem || tooManyKids ? strikes + 1 : 0;
    if (strikes >= 2) {
      log.error(`[health] ${lowMem ? 'memory nearly exhausted' : 'child processes piling up'} - restarting the app before the Pi locks up`);
      exit(1);
    }
    return sample;
  }
  return { check, history };
}

module.exports = { createHealth, countChildren };
