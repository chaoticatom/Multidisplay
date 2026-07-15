#!/usr/bin/env python3
"""
pi/bluetooth_server.py — small local HTTP API letting the Multidisplay
browser UI trigger Bluetooth speaker pairing on the Raspberry Pi, via
bluetoothctl. The browser can't do real Bluetooth audio pairing itself —
Web Bluetooth only covers BLE device access, not classic A2DP audio
pairing — so this runs as a tiny always-on helper on the same Pi that
hosts the web app and drives the ESP32 cube.

Endpoints (CORS-open, plain JSON):
  GET  /bt/scan    -> scans ~6s, returns discovered devices
  GET  /bt/status  -> lists paired/connected devices
  POST /bt/pair    -> body {"mac": "AA:BB:CC:DD:EE:FF"} — pairs, trusts,
                      and connects that device as an audio sink

Setup on the Pi (one-time):
  sudo apt install bluez pulseaudio-module-bluetooth
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
        if path != '/bt/pair':
            return self._json({'error': 'not found'}, 404)
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length) or b'{}')
            mac = data.get('mac', '')
            if not MAC_RE.match(mac):
                return self._json({'error': 'invalid mac address'}, 400)
            ok, log = pair_device(mac)
            self._json({'ok': ok, 'log': log})
        except Exception as e:
            self._json({'error': str(e)}, 500)

    def log_message(self, fmt, *args):
        pass  # keep console quiet; comment out this override to debug


if __name__ == '__main__':
    print(f'[bt] listening on 0.0.0.0:{PORT}')
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
