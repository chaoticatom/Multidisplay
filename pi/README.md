# Raspberry Pi helper scripts

These run on the Raspberry Pi that hosts the Multidisplay web app and
streams effects to the ESP32 cube — not part of the browser app or the
ESP32 firmware.

## bluetooth_server.py

Lets the "Internet Radio" sidebar panel scan for and pair a Bluetooth
speaker, without needing to SSH into the Pi. The browser has no API for
real Bluetooth audio pairing (Web Bluetooth only covers BLE device access),
so this is a tiny local HTTP bridge to `bluetoothctl` that the page talks
to on port 5005.

### One-time setup on the Pi

```bash
sudo apt install bluez pulseaudio-module-bluetooth
sudo systemctl enable --now bluetooth
```

### Run it manually (for testing)

```bash
python3 pi/bluetooth_server.py
```

### Run it permanently (autostart on boot)

```bash
sudo cp pi/multidisplay-bluetooth.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now multidisplay-bluetooth
```

Edit the `ExecStart` path and `User` in the `.service` file first — it
needs to run as the same user that owns the desktop's PulseAudio/PipeWire
session (not root, and not a headless user), or audio routing after
pairing won't work even though pairing itself succeeds.

### Endpoints

- `GET /bt/scan` — scans ~6s, returns `{"devices":[{"mac":"...","name":"..."}]}`
- `GET /bt/status` — lists paired devices
- `POST /bt/pair` — body `{"mac":"AA:BB:CC:DD:EE:FF"}`, pairs + trusts + connects

No auth — this is meant to run on your own trusted local network only.
