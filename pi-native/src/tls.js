// Self-signed TLS certificate for the HTTPS listener (see wsServer.js's
// module comment for why one exists at all): browsers only expose
// getUserMedia()/getDisplayMedia() in a "secure context" - HTTPS, or the
// literal localhost/127.0.0.1 origin - and this control page is normally
// reached over plain http://<pi-hostname>:8081/ on a LAN, which does NOT
// count as secure. A real report traced the camera/screen-capture buttons
// staying permanently greyed out to exactly this: navigator.mediaDevices
// is simply undefined on an insecure origin, browser policy, not a bug in
// this app's own feature-detection.
//
// Shells out to the system `openssl` binary to generate a cert (same
// "shell out to a system tool already installed on any normal Pi" pattern
// as ffmpegSource.js/bluetooth.js, rather than adding an npm dependency
// for something a 3-line openssl command already does) once, the first
// time the server starts with no existing cert on disk, and reuses it on
// every subsequent boot. Self-signed means every browser/device will show
// a one-time "not secure" warning that has to be manually accepted before
// it's trusted - expected and unavoidable without a real CA-issued
// certificate, which isn't practical for a device with no public DNS name.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CERT_DIR = path.join(__dirname, '..');
const KEY_PATH = path.join(CERT_DIR, 'tls-key.pem');
const CERT_PATH = path.join(CERT_DIR, 'tls-cert.pem');

// Returns {key, cert} Buffers, or null if openssl isn't available/fails -
// the caller (wsServer.js) treats null as "just don't start the HTTPS
// listener," never a fatal error (plain HTTP still works for everything
// except the camera/screen-capture buttons either way).
function ensureSelfSignedCert() {
  try {
    if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
        '-keyout', KEY_PATH, '-out', CERT_PATH,
        '-subj', '/CN=multidisplay',
        // Only relevant for openssl builds new enough to accept -addext
        // (widely true on current Raspberry Pi OS/Debian) - lets a
        // browser validate the cert against whatever hostname/IP it's
        // actually being accessed by, rather than only the CN. Wrapped in
        // its own try/catch below so an older openssl without this flag
        // still falls back to a plain CN-only cert instead of failing
        // outright.
        '-addext', 'subjectAltName=DNS:multidisplay,DNS:multidisplay.local,DNS:localhost,IP:127.0.0.1',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
  } catch (err) {
    // Fallback: try again without -addext, for an openssl build too old
    // to recognize it (the -subj-only invocation works on essentially any
    // openssl 1.x/3.x).
    try {
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
        '-keyout', KEY_PATH, '-out', CERT_PATH, '-subj', '/CN=multidisplay',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
    } catch (err2) {
      console.warn('[tls] could not generate a self-signed certificate (openssl missing or failed) - HTTPS/camera capture will be unavailable:', err2.message);
      return null;
    }
  }
}

module.exports = { ensureSelfSignedCert, KEY_PATH, CERT_PATH };
