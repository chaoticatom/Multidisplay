// Who gets in, and how much they can do (see Setup > Control PIN).
//   'admin' - full control
//   'guest' - picks effects and scenes only, with a lighter preview
//   'auth'  - must enter the control PIN first
// With a PIN set: people on the home network can skip it (localNoPin), and
// visitors coming in over the internet (through the Cloudflare tunnel) can
// get the guest view instead of a PIN prompt (guests). The PIN always gives
// full control.
'use strict';

const GUEST_CMDS = new Set(['setEffect', 'applyScene', 'setPreviewOff']);

function isPrivateIp(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  return ip === '::1' || /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip);
}

// A request from outside the home network: anything the Cloudflare tunnel
// forwarded (it adds cf-connecting-ip), or a non-private address.
function isRemote(req) {
  const h = (req && req.headers) || {};
  if (h['cf-connecting-ip'] || h['cf-ray']) return true;
  const fwd = h['x-forwarded-for'];
  const ip = fwd ? String(fwd).split(',')[0].trim() : req && req.socket && req.socket.remoteAddress;
  return !isPrivateIp(ip);
}

function decide({ pinSet, remote, access }) {
  const a = access || {};
  if (!pinSet) return 'admin';
  if (!remote && a.localNoPin !== false) return 'admin';
  if (remote && a.guests) return 'guest';
  return 'auth';
}

module.exports = { GUEST_CMDS, isPrivateIp, isRemote, decide };
