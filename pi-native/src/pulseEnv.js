// Shared by src/bluetooth.js (pactl calls) and src/effects/radio/
// ffmpegAudio.js (the `paplay` playback process) - extracted out of
// bluetooth.js rather than duplicated, after a real report ("I don't hear
// anything on the BT speaker") turned out to be exactly the same
// PulseAudio-env problem bluetooth.js already had, just in a second place
// that spawns a PulseAudio client process independently.
//
// multidisplay-pi.service runs as root (needed for rpi-led-matrix's GPIO/
// DMA access), but PulseAudio/PipeWire-pulse runs as a per-user SESSION
// daemon under the Pi's regular login user, not root - any child process
// this app spawns that talks to PulseAudio (pactl, paplay, ...) needs to
// be pointed at that user's actual socket + home directory (for PulseAudio
// client auth's cookie file), or it silently tries to reach root's own
// nonexistent session instead and fails with "Connection refused"/
// "Permission denied" - see bluetooth.js's original diagnosis of this for
// the full story.
const fs = require('fs');

let _pulseEnvCache = null;

// Returns { env } on success or { debug } on failure - debug records
// exactly what was tried and what fs call failed/returned, so a failure
// is diagnosable instead of just "found nothing".
function findPulseEnv() {
  // Only the found-it case is cached - if PulseAudio's session hasn't
  // started yet (e.g. checked very early at boot, before the user session
  // is up), retrying the cheap filesystem scan on the next call is better
  // than permanently caching a false "not found".
  if (_pulseEnvCache) return { env: _pulseEnvCache };
  const debug = [];
  const runUser = '/run/user';
  let entries;
  try {
    entries = fs.readdirSync(runUser);
    debug.push(`readdirSync(${runUser}) -> [${entries.join(', ')}]`);
  } catch (err) {
    debug.push(`readdirSync(${runUser}) threw: ${err.code || ''} ${err.message}`);
    return { debug };
  }
  for (const uid of entries) {
    const sock = `${runUser}/${uid}/pulse/native`;
    let exists;
    try { exists = fs.existsSync(sock); } catch (err) { exists = false; debug.push(`existsSync(${sock}) threw: ${err.message}`); }
    debug.push(`existsSync(${sock}) -> ${exists}`);
    if (!exists) continue;
    let home = null;
    try {
      const passwd = fs.readFileSync('/etc/passwd', 'utf8');
      for (const line of passwd.split('\n')) {
        const fields = line.split(':');
        if (fields[2] === uid) { home = fields[5] || null; break; }
      }
      debug.push(`home for uid ${uid} -> ${home}`);
    } catch (err) {
      debug.push(`readFileSync(/etc/passwd) threw: ${err.message}`);
    }
    _pulseEnvCache = { PULSE_SERVER: 'unix:' + sock, XDG_RUNTIME_DIR: `${runUser}/${uid}`, ...(home ? { HOME: home } : {}) };
    return { env: _pulseEnvCache };
  }
  return { debug };
}

module.exports = { findPulseEnv };
