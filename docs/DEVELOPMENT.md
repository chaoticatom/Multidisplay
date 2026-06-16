# Development Guide

This document covers local development setup, connecting the browser simulator to a physical ESP32, PlatformIO firmware workflow, adding API endpoints, and debugging.

## Local Dev Setup

No build step is required for the web app. Serve the project root over HTTP:

```bash
cd /path/to/Multidisplay
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. The Three.js simulator runs fully locally. WebSocket streaming to a physical ESP32 is automatically disabled when the hostname is `localhost` or `127.0.0.1` (see `initCubeWs()` in `ui.js`).

If you make changes to `effects.js`, `cube.js`, `ui.js`, or `index.html`, just reload the page — no compilation needed.

## Connecting the Simulator to a Physical ESP32

### Option A — Access the app from the ESP32 itself (recommended)

Browse to `http://multidisplay.local` from a device on the same WiFi network as the ESP32. The page is served by the ESP32 and WebSocket streaming connects automatically to `ws://multidisplay.local:81`.

### Option B — Dev machine with live editing, streaming to ESP32

1. Run the local HTTP server on your dev machine (port 8080 as above).
2. Open the page at `http://localhost:8080`. Streaming is disabled automatically.
3. To stream to the physical cube from localhost, temporarily edit the guard in `ui.js`:

```js
function initCubeWs() {
  const h = location.hostname;
  // Comment out or change the localhost guard during testing:
  // if(!h || h === 'localhost' || h === '127.0.0.1') return;

  const cubeHost = '192.168.x.x';  // replace with your ESP32's IP
  try {
    cubeWs = new WebSocket(`ws://${cubeHost}:81`);
    // ...
  }
}
```

Note: browsers may block `ws://` connections from `http://localhost` pages depending on security settings. Chrome allows it; Safari may not. Always revert this change before committing.

## PlatformIO Setup for Firmware

### Prerequisites

- [PlatformIO](https://platformio.org/) (VS Code extension or CLI)
- USB cable connected to the ESP32-S3 devkit

### Install and build

```bash
cd firmware
pio run                     # compile firmware
pio run --target upload     # compile + flash over USB
pio run --target buildfs    # build LittleFS image from ./data/
pio run --target uploadfs   # flash LittleFS image over USB
```

### Generate web assets before uploading filesystem

```bash
cd ..          # project root
./build.sh     # downloads Three.js r168, gzips all web assets into ./data/
cd firmware
pio run --target uploadfs
```

### Library dependencies (auto-installed by PlatformIO)

Defined in `firmware/platformio.ini`:

| Library | Purpose |
|---------|---------|
| `esphome/ESPAsyncWebServer-esphome` | Async HTTP server, serves gzipped web assets |
| `esphome/AsyncTCP-esphome` | Async TCP for the web server |
| `mrcodetastic/ESP32 HUB75 LED MATRIX PANEL DMA Display` | HUB75 panel DMA driver |
| `bblanchon/ArduinoJson` | JSON parsing for F1/weather API responses |
| `tzapu/WiFiManager` | Captive-portal WiFi provisioning |

### Key source files

| File | Purpose |
|------|---------|
| `firmware/src/config.h` | Compile-time constants: panel size, pin assignments, WebSocket port, FPS |
| `firmware/src/led_matrix.h` | HUB75 DMA panel initialization and pixel write helpers |
| `firmware/src/wifi_setup.h` | WiFiManager captive-portal setup (`connectWifi()`) |

### Board and partition configuration

The firmware targets `esp32-s3-devkitc-1` with 16 MB flash and 8 MB PSRAM. The partition table (`firmware/partitions_16MB.csv`) allocates space for firmware, OTA slot, and a LittleFS partition large enough to hold the gzipped web assets.

## How to Add a New API Endpoint

The ESP32 firmware uses ESPAsyncWebServer. Add new GET or POST handlers in the firmware's `setup()` function alongside the existing `/api/f1/*` routes.

### Example: GET endpoint

```cpp
server.on("/api/mydata", HTTP_GET, [](AsyncWebServerRequest* req) {
  StaticJsonDocument<256> doc;
  doc["value"] = 42;
  doc["label"] = "hello";
  String body;
  serializeJson(doc, body);
  req->send(200, "application/json", body);
});
```

### Example: POST endpoint

```cpp
server.on("/api/mydata", HTTP_POST,
  [](AsyncWebServerRequest* req){},
  nullptr,
  [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
    StaticJsonDocument<512> doc;
    deserializeJson(doc, data, len);
    // process doc["field"] ...
    req->send(200, "application/json", "{\"ok\":true}");
  }
);
```

On the JavaScript side, fetch from a relative URL so the code works whether the page is served from the ESP32 or localhost (in which case the fetch will 404, which is fine for local dev):

```js
const res = await fetch('/api/mydata');
const data = await res.json();
```

## Debugging

### Browser console

Open DevTools (F12) and check the console. Key messages to look for:

| Message | Meaning |
|---------|---------|
| `[cube] streaming started` | WebSocket to ESP32 opened successfully |
| `[cube] WebSocket unavailable: ...` | Could not reach ESP32 — check IP/hostname |
| `[cube] physical-cube streaming disabled on HTTPS` | Page loaded from HTTPS; streaming disabled by design |
| `Failed to load effects.js` | Script load error — check file path |

The effect name and frame metadata (size, fps) are shown in the bottom-right overlay of the canvas.

### WebSocket frame inspection

In DevTools → Network → WS, select the `ws://multidisplay.local:81` connection to inspect individual frames. Each outgoing frame is a binary message:

```
byte 0: packet type (2 = PKT_VIDEO)
byte 1: face ID (0–5)
bytes 2+: RGB888 pixel data, row-major, SIZE×SIZE pixels
```

Total frame size per face: `2 + SIZE*SIZE*3` bytes (e.g. 12290 bytes for 64×64). Six faces are sent per frame, totalling ~74 KB/frame at 64×64.

### ESP32 Serial monitor

```bash
cd firmware
pio device monitor   # 115200 baud
```

Useful log output:

| Log line | Meaning |
|----------|---------|
| `[WiFi] Connected, IP=192.168.x.x` | WiFi connected; use this IP if mDNS doesn't resolve |
| `[WiFi] Config portal started: SSID=Multidisplay-Setup ...` | Captive portal is open |
| `[WS] client connected` | Browser WebSocket opened |
| `[WS] PKT_VIDEO face=N len=M` | Pixel frame received for face N |

### mDNS not resolving

If `http://multidisplay.local` doesn't load:

1. Check Serial monitor for the assigned IP address.
2. Browse to the IP directly (`http://192.168.x.x`).
3. On Windows, install Bonjour Print Services if mDNS resolution fails.

### OTA upload fails

- Ensure the browser and ESP32 are on the same WiFi network.
- Disable VPN if active.
- Try the IP address directly in the loader URL: `http://192.168.x.x/loader`.

## Cube Size Configuration

The cube size is set at runtime in the browser via the "Cube Size" section in the sidebar (8×8, 16×16, 64×64). The firmware panel size is a compile-time constant:

```cpp
// firmware/src/config.h
#define PANEL_SIZE  64   // change to 8 or 16 and recompile for smaller panels
```

If you change `PANEL_SIZE` in firmware, select the matching size in the browser sidebar so that the streamed frame dimensions match what the firmware expects.
