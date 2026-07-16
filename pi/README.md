# Raspberry Pi helper scripts

These run on the Raspberry Pi that hosts the Multidisplay web app and
streams effects to the ESP32 cube — not part of the browser app or the
ESP32 firmware.

## bluetooth_server.py

Lets the "Internet Radio" sidebar panel scan for and pair an **outgoing**
Bluetooth speaker (Pi → speaker), and separately lets the "Phone (Bluetooth)"
sound source in the Spectrum Analyser panel accept **incoming** audio from
a phone (phone → Pi), simultaneously looped out to that same speaker. The
browser has no API for real Bluetooth audio pairing (Web Bluetooth only
covers BLE device access), so this is a tiny local HTTP bridge to
`bluetoothctl`/PulseAudio that the page talks to on port 5005.

### One-time setup on the Pi

```bash
sudo apt install bluez pulseaudio-module-bluetooth pulseaudio-utils
sudo systemctl enable --now bluetooth
```

### Using a phone as a sound source (phone → Pi → speaker + visualizer)

1. Pair the external speaker first, as above (`POST /bt/pair`), so there's
   somewhere for the phone's audio to come out.
2. From the "Setup" sidebar section, click **Make Cube Discoverable** —
   opens a ~120s pairing window. On your phone, open Bluetooth settings and
   connect to the Pi like you would any Bluetooth speaker (it uses
   "just-works" pairing — no PIN prompt, since a headless Pi has no way to
   display or accept one).
3. Start playing music on the phone.
4. Click **Route Phone Audio to Speaker** — this finds the phone's
   PulseAudio source, exposes it as a stable `phone_capture` input device,
   and loops it to the paired speaker. Re-run this any time the phone
   reconnects (a fresh Bluetooth session gets a new PulseAudio source
   internally, even though the paired MAC is the same).
5. In the Spectrum Analyser panel, click **📱 Use Phone (Bluetooth)** — the
   browser looks for an input device labeled `phone_capture` and uses it,
   same analyser pipeline as the microphone.

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
- `POST /bt/pair` — body `{"mac":"AA:BB:CC:DD:EE:FF"}`, pairs + trusts + connects (outgoing, to a speaker)
- `POST /bt/discoverable` — opens a ~120s pairing window for an incoming connection (a phone connecting to the Pi)
- `POST /bt/route-phone-audio` — wires up the PulseAudio loopback/remap so a connected phone's audio is both audible on the paired speaker and capturable in the browser as `phone_capture`

No auth — this is meant to run on your own trusted local network only.
