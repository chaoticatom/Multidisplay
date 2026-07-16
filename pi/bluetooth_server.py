#!/usr/bin/env python3
"""
pi/bluetooth_server.py — small local HTTP API letting the Multidisplay
browser UI trigger Bluetooth speaker pairing on the Raspberry Pi, via
bluetoothctl. The browser can't do real Bluetooth audio pairing itself —
Web Bluetooth only covers BLE device access, not classic A2DP audio
pairing — so this runs as a tiny always-on helper on the same Pi that
hosts the web app and drives the ESP32 cube.

Endpoints (CORS-open, plain JSON):
  GET  /bt/scan              -> scans ~6s, returns discovered devices
  GET  /bt/status             -> lists paired/connected devices
  POST /bt/pair               -> body {"mac": "AA:BB:CC:DD:EE:FF"} — pairs,
                                  trusts, and connects that device as an
                                  audio sink (for an external speaker)
  POST /bt/discoverable       -> makes the Pi discoverable/pairable for
                                  ~120s so a PHONE can find and connect to
                                  it (the reverse role from /bt/pair — the
                                  Pi is the audio sink here, not the source)
  POST /bt/route-phone-audio  -> sets up the PulseAudio plumbing so audio
                                  arriving from a paired phone is both (a)
                                  exposed as a capturable "phone_capture"
                                  input device the browser can select, and
                                  (b) looped through to the currently
                                  connected external Bluetooth speaker

Setup on the Pi (one-time):
  sudo apt install bluez pulseaudio-module-bluetooth pulseaudio-utils
  sudo systemctl enable --now bluetooth
  # then run this script (see multidisplay-bluetooth.service for autostart)

Run it as the same non-root user that's logged into the desktop session
(needs a working PulseAudio/PipeWire user session to actually route audio
after pairing — running as root won't have one).
"""
import json
import re
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

PORT = 5005
MAC_RE = re.compile(r'^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$')
DEVICE_LINE_RE = re.compile(r'Device ([0-9A-Fa-f:]{17}) (.+)')
PHONE_CAPTURE_SOURCE = 'phone_capture'


def bluetoothctl(commands, wait=1.5):
    """Feed commands into an interactive bluetoothctl session and return
    its combined output. Simpler and more portable than a D-Bus binding."""
    proc = subprocess.Popen(
        ['bluetoothctl'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    try:
        for cmd in commands:
            proc.stdin.write(cmd + '\n')
            proc.stdin.flush()
            time.sleep(wait)
        proc.stdin.write('quit\n')
        proc.stdin.flush()
        out, _ = proc.communicate(timeout=20)
    except Exception:
        proc.kill()
        raise
    return out


def scan_devices(duration=6):
    out = bluetoothctl(['scan on'], wait=duration)
    bluetoothctl(['scan off'], wait=0.5)
    devices = {}
    for line in out.splitlines():
        m = DEVICE_LINE_RE.search(line)
        if m:
            devices[m.group(1)] = m.group(2).strip()
    return [{'mac': mac, 'name': name} for mac, name in devices.items()]


def pair_device(mac):
    out = bluetoothctl([f'pair {mac}', f'trust {mac}', f'connect {mac}'], wait=6)
    ok = 'Connection successful' in out or 'Connected: yes' in out
    return ok, out


def list_paired():
    out = bluetoothctl(['paired-devices'], wait=1)
    devices = []
    for line in out.splitlines():
        m = DEVICE_LINE_RE.search(line)
        if m:
            devices.append({'mac': m.group(1), 'name': m.group(2).strip()})
    return devices


def make_discoverable(seconds=120):
    """Opens a pairing window for an incoming connection (a phone finding
    and pairing with the Pi), rather than the Pi initiating a connection to
    a known device like /bt/pair does. NoInputNoOutput agent auto-accepts
    the pairing prompt (just-works pairing) since there's no way to type a
    PIN on a headless Pi."""
    out = bluetoothctl([
        'agent NoInputNoOutput',
        'default-agent',
        'discoverable on',
        'pairable on',
    ], wait=1)
    return out


def route_phone_audio():
    """Finds the Bluetooth source PulseAudio created for a connected phone
    (bluez_source.*.a2dp_source), exposes it as a stable-named capturable
    input ("phone_capture") via module-remap-source (browsers only list
    real sources as microphones, not raw monitors), and loops it to the
    default sink so it's audible on the paired external speaker at the
    same time. Safe to call again — unloads any previous instance of these
    modules first so re-running doesn't stack duplicates."""
    log = []

    def run(cmd):
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        log.append(f'$ {" ".join(cmd)}\n{r.stdout}{r.stderr}')
        return r

    # Find the phone's Bluetooth source.
    sources = run(['pactl', 'list', 'short', 'sources']).stdout
    phone_source = None
    for line in sources.splitlines():
        if 'bluez_source' in line and 'a2dp_source' in line:
            phone_source = line.split('\t')[1]
            break
    if not phone_source:
        return False, log + ['No connected phone audio source found — pair and start playing music on the phone first.']

    # Remove any previous remap/loopback modules from an earlier call.
    mods = run(['pactl', 'list', 'short', 'modules']).stdout
    for line in mods.splitlines():
        if PHONE_CAPTURE_SOURCE in line or ('module-loopback' in line and phone_source in line):
            mod_id = line.split('\t')[0]
            run(['pactl', 'unload-module', mod_id])

    run(['pactl', 'load-module', 'module-remap-source',
         f'master={phone_source}', f'source_name={PHONE_CAPTURE_SOURCE}'])
    run(['pactl', 'load-module', 'module-loopback',
         f'source={phone_source}', 'latency_msec=100'])

    return True, log


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == '/bt/scan':
                self._json({'devices': scan_devices()})
            elif path == '/bt/status':
                self._json({'devices': list_paired()})
            else:
                self._json({'error': 'not found'}, 404)
        except Exception as e:
            self._json({'error': str(e)}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == '/bt/pair':
                length = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(length) or b'{}')
                mac = data.get('mac', '')
                if not MAC_RE.match(mac):
                    return self._json({'error': 'invalid mac address'}, 400)
                ok, log = pair_device(mac)
                self._json({'ok': ok, 'log': log})
            elif path == '/bt/discoverable':
                log = make_discoverable()
                self._json({'ok': True, 'log': log})
            elif path == '/bt/route-phone-audio':
                ok, log = route_phone_audio()
                self._json({'ok': ok, 'log': log})
            else:
                self._json({'error': 'not found'}, 404)
        except Exception as e:
            self._json({'error': str(e)}, 500)

    def log_message(self, fmt, *args):
        pass  # keep console quiet; comment out this override to debug


if __name__ == '__main__':
    print(f'[bt] listening on 0.0.0.0:{PORT}')
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
