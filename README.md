# Multidisplay RGB LED Cube

A browser-based RGB LED cube visualizer with live streaming to a physical ESP32-S3 controller driving six HUB75 LED panels. Effects run in the browser (Three.js simulator) and stream over WebSocket to the hardware at 20 fps.

## What it is

- **Web app**: 3D interactive simulator rendered in Three.js. Supports cube sizes of 8×8, 16×16, and 64×64. Includes 36 built-in visual effects, 13 overlays, playlists, timers (alarms and wind down), weather display, and a custom graphics editor.
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
│                     #   playlist, timers (alarm/wind down), panel editor
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

The full list of built-in effects:

Wave Cascade, Colour Rain, Plasma Storm, Laser Grid, Fireworks, DNA Helix, Time & Date, Bouncing Balls, Gravity Sand, F1 Live, Rainbow Wash, Aurora Borealis, Depth Rings, Prism Sweep, Color Tide, Nebula Drift, Spectrum Analyser, Maze Runner, Tron Bikes, Lightning Storm, Warp Drive, Crystal Life, Liquid Crystal, Video Display, Strobe Flash, Random 1, Random 2, Ghost Face, Light Speed, Custom Cube, Weather, Coin Flip, Dice Roll, Sim House, Moon, and Retro Arcade.

See [docs/EFFECTS.md](docs/EFFECTS.md) for the complete guide including function signatures, helper functions, registering a new effect in the UI, and optionally porting effects to C++ for standalone mode.

## Timers

The Timers section in the sidebar lets you schedule timed events. Each timer has a name, time, repeat schedule (once, daily, weekdays, weekends, weekly, hourly), and an optional message displayed on the cube faces.

Timers support two modes, selectable via collapsible dropdown headers in the editor:

- **Alarm**: Triggers at the set time. Choose an effect or playlist to play, enable overlays, and optionally configure a pre-alarm that gradually brightens the display from a dim start level. Pre-alarm options include Giant Sun Rise and Effect Rise.
- **Wind Down**: Triggers at the set time and gradually dims the display to black over a configurable duration. Optionally choose a specific effect and overlays to display while dimming, or use the currently active effect. When the wind down completes the display blanks. Selecting a new effect after wind down dismisses the blank state.

Timers are saved to local storage and persist across sessions. Each timer in the list shows a slide-toggle to enable/disable it, the scheduled time, repeat pattern, name, and whether it is an Alarm or Wind Down type.

## Overlays

13 overlay effects can be layered on top of any base effect: Twinkling Stars, Snowfall, Meteor Shower, Edge Glow, Fire Border, Sparkle Rain, Color Wave, Breathe Pulse, Scan Line, Vignette, Glitch, Rainbow Mist, and Lightning Strike. Each overlay has configurable parameters (density, speed, colour, intensity) accessible via slide-toggle headers in the Overlays section.

## Weather

The weather effect displays real-time conditions on the cube including sky gradients, sun/moon position and phase, clouds, rain, snow, thunderstorms, and fog. Weather data is fetched from the Open-Meteo API based on a configurable city. The display includes a clear zone between the horizon and sky for text readability, with clouds naturally fading into the zone edges.

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

## GitHub Pages (Browser Preview)

The web app is hosted on GitHub Pages and works as a full simulator without any hardware:

**[https://chaoticatom.github.io/Multidisplay/](https://chaoticatom.github.io/Multidisplay/)**

> Note: WebSocket streaming to the physical cube is **disabled on GitHub Pages** because browsers block insecure `ws://` connections from HTTPS pages. The visualizer runs in simulator-only mode — all effects, controls, timers, and F1 display work normally; pixel frames are just not sent to hardware. To stream to the cube, access the app directly from the ESP32 at `http://multidisplay.local`.

To update the live GitHub Pages site after making changes:
1. Merge your branch into `main`
2. GitHub Pages auto-deploys from the `main` branch root within ~1 minute

## Wiring

See [docs/WIRING.md](docs/WIRING.md) for full HUB75 wiring diagrams.

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
