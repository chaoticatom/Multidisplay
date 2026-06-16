# Multidisplay RGB LED Cube

A browser-based RGB LED cube visualizer with live streaming to a physical ESP32-S3 controller driving six HUB75 LED panels. Effects run in the browser (Three.js simulator) and stream over WebSocket to the hardware at 20 fps.

## What it is

- **Web app**: 3D interactive simulator rendered in Three.js. Supports cube sizes of 8×8, 16×16, and 64×64. Includes 30+ built-in visual effects, overlays, playlists, alarms, and a custom graphics editor.
- **Physical cube**: Six HUB75 RGB panels arranged as a cube, driven by an ESP32-S3 via DMA. The ESP32 serves the web app over HTTP and receives pixel frames from connected browsers via WebSocket on port 81.
- **PWA**: Installable as a Progressive Web App on mobile and desktop.

## Architecture

```
Browser <─ WebSocket (port 81) ─> ESP32-S3
   │              │                    │
Three.js      Pixel frames         HUB75 DMA
visualizer    20fps, 6 faces       6× panels
   │                                   │
GitHub Pages              Physical LED Cube
(dev/preview)
```

The browser computes every effect frame in JavaScript, then sends each of the six face pixel buffers as a binary WebSocket message (`PKT_VIDEO`). The ESP32 routes each face buffer to the correct panel via DMA. No effect computation happens on the ESP32 unless you implement standalone firmware effects.

When the page is served from `localhost` or over HTTPS (e.g. GitHub Pages), WebSocket streaming is automatically skipped — the visualizer runs in simulator-only mode.

## Quick Start (first-time hardware setup)

1. Wire six HUB75 panels to the ESP32-S3 according to the pin assignments in `firmware/src/config.h`.
2. Open `firmware/` in PlatformIO. Build and upload the firmware over USB.
3. On first boot the ESP32 creates a WiFi access point:
   - SSID: `Multidisplay-Setup`
   - Password: `cube1234`
4. Connect your phone or laptop to that network and browse to `192.168.4.1`.
5. Enter your home WiFi credentials. The ESP32 saves them and reboots.
6. Back on your home network, browse to `http://multidisplay.local` to open the web app. Pixel streaming to the physical cube starts automatically.

## File Structure

```
Multidisplay/
├── index.html        # Main web app shell — effect buttons, sidebar controls
├── cube.js           # Three.js scene, LED geometry, faceMap, colBuf
├── effects.js        # All JavaScript effect functions (effectWave, effectRain, …)
├── f1.js             # F1 Live effect globals and data model
├── ui.js             # Effect registry (EFFECTS/EFFECT_NAMES), UI wiring,
│                     #   WebSocket streaming (initCubeWs / streamFrameToCube),
│                     #   playlist, alarms, panel editor
├── style.css         # Dark theme CSS
├── manifest.json     # PWA manifest
├── service-worker.js # PWA offline cache
├── three.min.js      # Three.js r168 (downloaded by build.sh)
├── loader.html       # OTA upload page served at /loader on the ESP32
├── build.sh          # Bundles and gzips web assets into ./data/ for LittleFS
├── icons/            # App icons
├── docs/
│   ├── EFFECTS.md    # How to write new visual effects
│   └── DEVELOPMENT.md# Developer workflow and firmware guide
└── firmware/
    ├── platformio.ini
    ├── partitions_16MB.csv
    └── src/
        ├── config.h      # Pin assignments, packet types, compile-time settings
        ├── led_matrix.h  # HUB75 DMA panel driver
        └── wifi_setup.h  # WiFiManager captive-portal provisioning
```

## PWA Install

On Chrome/Edge: click the install icon in the address bar or open the browser menu and choose "Install app". On iOS Safari: tap Share → Add to Home Screen.

## Effect Development

Effects are JavaScript functions in `effects.js`. Each function iterates over surface LEDs using the global arrays `surfX`, `surfY`, `surfZ` and calls `setLED(i, r, g, b)` to set pixel colours.

See [docs/EFFECTS.md](docs/EFFECTS.md) for the complete guide including function signatures, helper functions, registering a new effect in the UI, and optionally porting effects to C++ for standalone mode.

## Firmware Build and Flash

**Initial flash (USB required once):**

```bash
cd firmware
pio run --target upload        # compile + flash firmware
pio run --target uploadfs      # upload web assets from ./data/
```

Generate `./data/` first:

```bash
cd ..
./build.sh    # downloads Three.js, gzips all web assets into ./data/
```

**Subsequent updates (OTA, no USB needed):**

Browse to `http://multidisplay.local/loader` and drag-drop:
- `firmware.bin` — for firmware changes
- `littlefs.bin` — for web app changes

Both files are produced by PlatformIO in `.pio/build/esp32-s3-devkitc-1/`.

## F1 Data Integration

The F1 Live effect (`effectF1` in `effects.js`) reads data from the following API endpoints served by the ESP32:

- `GET /api/f1/meeting` — race meeting info
- `GET /api/f1/standings` — current driver standings
- `GET /api/f1/session` — session timing (duration, elapsed, remaining)
- `GET /api/f1/weather` — track weather
- `GET /api/f1/flag` — current race flag status

Push data to these endpoints from your backend to drive the live display. The F1 globals are declared in `f1.js`.

## Wiring

See [docs/WIRING.md](docs/WIRING.md) (to be added) for full HUB75 wiring diagrams.

The HUB75 pin assignments are defined in `firmware/src/config.h`:

| Signal | GPIO |
|--------|------|
| R1     | 42   |
| G1     | 41   |
| B1     | 40   |
| R2     | 39   |
| G2     | 38   |
| B2     | 37   |
| A      | 36   |
| B      | 35   |
| C      | 45   |
| D      | 48   |
| E      | 47   |
| LAT    | 21   |
| OE     | 14   |
| CLK    | 13   |
