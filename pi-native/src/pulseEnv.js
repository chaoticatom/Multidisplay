// Environment for child processes that talk to PulseAudio/PipeWire-pulse
// (pactl, paplay). The service runs as root (for GPIO/DMA), but the audio
// daemon runs as a per-user session under the Pi's login user, so clients
// must be pointed at that user's socket and home directory (for the auth
// cookie), or they fail with "Connection refused"/"Permission denied".
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
