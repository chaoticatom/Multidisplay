// Live diagnostics for the control page's Diagnostics section: render frame
// rate and per-frame cost, CPU/memory/load/SoC temperature, and the most
// recent warnings/errors - so problems can be seen (and copied into a bug
// report) without SSHing in to read journalctl.
'use strict';
const os = require('os');
const fs = require('fs');

const LOG_MAX = 20;

function readTempC() {
  try { return Number(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000; } catch (e) { return null; }
}

function createDiagnostics() {
  const startMs = Date.now();
  const log = [];
  let frames = 0, renderSum = 0, renderMax = 0;
  let lastSnap = Date.now(), lastCpu = process.cpuUsage();

  // Mirror console warnings/errors into the ring (still printed as before).
  for (const level of ['warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      log.push({ t: new Date().toISOString().slice(11, 19), level, msg: msg.slice(0, 300) });
      if (log.length > LOG_MAX) log.shift();
      orig(...args);
    };
  }

  function recordFrame(renderMs) {
    frames++;
    if (Number.isFinite(renderMs)) { renderSum += renderMs; if (renderMs > renderMax) renderMax = renderMs; }
  }

  // Call about once a second; resets the frame counters.
  function snapshot(extra = {}) {
    const now = Date.now(), secs = Math.max(0.001, (now - lastSnap) / 1000);
    const cpu = process.cpuUsage(lastCpu);
    const mem = process.memoryUsage();
    const snap = {
      uptimeS: Math.round((now - startMs) / 1000),
      fps: Math.round((frames / secs) * 10) / 10,
      renderMsAvg: frames ? Math.round((renderSum / frames) * 100) / 100 : null,
      renderMsMax: frames ? Math.round(renderMax * 100) / 100 : null,
      // Whole process, all threads; can exceed 100% on a multi-core Pi.
      cpuPct: Math.round(((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 1000) / 10,
      rssMB: Math.round(mem.rss / 1048576),
      heapMB: Math.round(mem.heapUsed / 1048576),
      load1: Math.round(os.loadavg()[0] * 100) / 100,
      tempC: readTempC(),
      log: log.slice(),
      ...extra,
    };
    frames = 0; renderSum = 0; renderMax = 0; lastSnap = now; lastCpu = process.cpuUsage();
    return snap;
  }

  return { recordFrame, snapshot };
}

module.exports = { createDiagnostics };
