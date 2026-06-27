# Multidisplay — System Architecture

## Top-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER INTERFACES                                  │
│                                                                             │
│   ┌──────────────────────┐          ┌──────────────────────┐               │
│   │   Browser / Mobile   │          │   GitHub Pages       │               │
│   │  http://multidisplay │          │  (preview / dev)     │               │
│   │       .local         │          │  github.io/...       │               │
│   └──────────┬───────────┘          └──────────────────────┘               │
│              │ HTTP + WebSocket                                              │
└──────────────┼──────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ESP32-S3 (N16R8)                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  WiFi Stack                                                          │   │
│  │  ┌───────────────────┐    ┌──────────────────────────────────────┐  │   │
│  │  │ First Boot        │    │ Normal Boot                          │  │   │
│  │  │ AP Mode           │    │ Connect to saved WiFi                │  │   │
│  │  │ "Multidisplay-    │    │ mDNS → multidisplay.local            │  │   │
│  │  │  Setup" portal    │    │ Reconnect watchdog in loop()         │  │   │
│  │  └───────────────────┘    └──────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────┐   ┌─────────────────────────────────┐    │
│  │  HTTP Server  (port 80)     │   │  WebSocket Server  (port 81)    │    │
│  │                             │   │                                  │    │
│  │  GET  /            ─────────┼─┐ │  ◄── PKT_VIDEO (type=2)        │    │
│  │  GET  /style.css   LittleFS │ │ │       face_id + S×S×3 RGB bytes │    │
│  │  GET  /cube.js     (.gz     │ │ │       → frameBuf[face]          │    │
│  │  GET  /effects.js   aware)  │ │ │                                  │    │
│  │  GET  /f1.js               │ │ │  ◄── PKT_CMD (type=1)           │    │
│  │  GET  /ui.js               │ │ │       setEffect → broadcast all  │    │
│  │  GET  /three.min.js        │ │ │                                  │    │
│  │                             │ │ │  ◄── JSON text                  │    │
│  │  GET  /loader   ◄─ PROGMEM─┘ │ │       {"cmd":"setEffect",       │    │
│  │  POST /update/firmware  OTA  │ │       "effect":"wave"}           │    │
│  │  POST /update/filesystem OTA │ └─────────────────────────────────┘    │
│  │                             │                    │                       │
│  │  GET  /api/session          │                    │ 20fps pixel frames    │
│  │  GET  /api/drivers    F1    │                    ▼                       │
│  │  GET  /api/flags    State   │   ┌─────────────────────────────────┐    │
│  │  POST /api/*        ◄───────┼───│  Frame Buffers  (PSRAM)         │    │
│  │  GET  /api/status           │   │  frameBuf[0..5]: S×S×3 bytes    │    │
│  └─────────────────────────────┘   │  Double-buffered, mutex-guarded  │    │
│                                    └────────────────┬────────────────┘    │
│                                                      │                      │
│  ┌───────────────────────────────────────────────────┼──────────────────┐  │
│  │  FreeRTOS Tasks                                   │                  │  │
│  │                                                   │                  │  │
│  │  Core 0: DMA Display Task ◄───────────────────────┘                 │  │
│  │  Core 1: WiFi / HTTP / WebSocket / Arduino loop()                   │  │
│  │  Core 1: Status LED Task (blink pattern = system state)             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  LittleFS  (~8MB)           │  Flash  (2×4MB OTA partitions)        │  │
│  │  index.html.gz              │  ota_0: running firmware               │  │
│  │  style.css.gz               │  ota_1: staged OTA image               │  │
│  │  cube.js.gz                 │  nvs:   WiFi credentials               │  │
│  │  effects.js.gz              │  otadata: active partition pointer      │  │
│  │  f1.js.gz  ui.js.gz        │                                         │  │
│  │  three.min.js.gz            │  PROGMEM: loader.html (never updated)  │  │
│  │  manifest.json.gz           │                                         │  │
│  │  service-worker.js.gz       │                                         │  │
│  │  icons/*.gz                 │                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ HUB75 DMA (I2S)
                              │ 14 GPIO pins
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Physical LED Cube                                        │
│                                                                             │
│  6× HUB75 RGB Matrix Panels (64×64, daisy-chained)                         │
│                                                                             │
│              ┌────────────┐                                                 │
│              │  Top  (4)  │                                                 │
│   ┌──────────┼────────────┼──────────┬────────────┐                        │
│   │ Left (3) │ Front (0)  │ Right(2) │  Back (1)  │   ◄── chain order      │
│   └──────────┼────────────┼──────────┴────────────┘                        │
│              │ Bottom (5) │                                                 │
│              └────────────┘                                                 │
│                                                                             │
│  Power: 5V / 30A PSU  (separate from ESP32)                                │
│  Common GND with ESP32                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Web App Internal Structure

```
Browser
│
├── index.html          Markup + PWA meta + script loader
├── style.css           All styles (sidebar, buttons, overlays)
│
├── three.min.js        3D engine (Three.js r168, local + CDN fallback)
├── cube.js             Renderer, LED geometry, face maps, camera, orbit
├── effects.js          All visual effect functions (wave, fire, F1, etc.)
├── f1.js               F1 data globals, polling loop, face buffer builders
└── ui.js               Sidebar wiring, effect switching, timers,
                        WebSocket client → streams pixel frames to ESP32
│
├── manifest.json       PWA: install as mobile app
└── service-worker.js   Offline cache (static assets) + network-first /api/*
```

---

## Effect Data Flow

```
Effect Function (effects.js)
        │
        │  setLED(i, r, g, b)  ←── per-LED colour, called every frame
        │
        ▼
    colBuf[]              Float32 RGB array, one entry per surface LED
        │
        ├──► Three.js InstancedMesh   (browser visualizer, every frame)
        │
        └──► streamFrameToCube()      (when connected to ESP32)
                  │
                  │  WebSocket binary message (port 81)
                  │  [PKT_VIDEO=2, faceID, S×S×3 bytes RGB888]
                  │  6 messages per frame, 20fps
                  │
                  ▼
             ESP32 frameBuf[face]
                  │
                  ▼
             HUB75 DMA → Physical panel pixels
```

---

## Effect Selection Sync

```
User clicks effect button
        │
        ▼
ui.js: currentEffect = 'wave'
        │
        ├──► Switches JS effect function in animation loop
        │
        └──► WebSocket text: {"cmd":"setEffect","effect":"wave"}
                  │
                  ▼
             ESP32 stores effect name
                  │
                  └──► Broadcasts to ALL connected WS clients
                            (keeps multiple browser tabs in sync)
```

---

## WiFi Boot Sequence

```
Power on
    │
    ▼
NVS has WiFi credentials?
    │
    ├── NO ──► Start AP "Multidisplay-Setup" (192.168.4.1)
    │               │
    │               ▼
    │          User connects phone/laptop to AP
    │          Opens captive portal, enters home WiFi
    │          Credentials saved to NVS → reboot
    │
    └── YES ──► Connect to home WiFi
                    │
                    ├── Success ──► mDNS: multidisplay.local
                    │               Start HTTP (80) + WS (81)
                    │               Mount LittleFS → serve web app
                    │
                    └── Fail (30s) ──► Restart in AP mode
```

---

## OTA Update Flow

```
Developer workstation
    │
    ├── Web app change:
    │       Edit JS/CSS → ./build.sh → gzips to ./data/
    │       PlatformIO: pio run -t buildfs
    │       Browser: http://multidisplay.local/loader
    │       Upload littlefs.bin → POST /update/filesystem
    │       ESP32 flashes LittleFS partition → remounts → reload
    │
    └── Firmware change:
            Edit src/*.cpp → PlatformIO: pio run -t build
            Browser: http://multidisplay.local/loader
            Upload firmware.bin → POST /update/firmware
            ESP32 writes to inactive OTA partition
            Sets otadata → reboots into new firmware
            /loader served from PROGMEM (always safe, never updated)
```

---

## F1 Data Flow

```
External F1 data source (your backend / script)
    │
    │  POST /api/session   {"type":"race"}
    │  POST /api/drivers   [{position, driver_number, name, gap}, ...]
    │  POST /api/flags     {"flag":"yellow"}
    │
    ▼
ESP32 F1State cache
    │
    ├──► GET /api/* ◄── Browser f1.js polls every 5s (when F1 effect active)
    │
    └──► F1 effect renders leaderboard, flag colours,
         track map, weather onto cube faces
```

---

## Repository Layout

```
Multidisplay/
├── index.html              Main app page (markup only)
├── style.css               All styles
├── cube.js                 Three.js cube renderer
├── effects.js              Visual effects library
├── f1.js                   F1 data integration
├── ui.js                   UI wiring + WebSocket client
├── three.min.js            Three.js r168 (local bundle)
├── manifest.json           PWA manifest
├── service-worker.js       Offline service worker
├── loader.html             OTA update page (standalone, no deps)
├── build.sh                Gzip assets → ./data/ for LittleFS
│
├── icons/
│   ├── icon.svg            Source icon
│   ├── icon-192.png        PWA icon
│   └── icon-512.png        PWA icon
│
├── firmware/
│   ├── platformio.ini      PlatformIO project config
│   ├── partitions_16MB.csv Custom partition table
│   └── src/
│       ├── main.cpp        Entry point, tasks, setup/loop
│       ├── config.h        All constants and pin definitions
│       ├── web_server.h    HTTP routes + WebSocket handler
│       ├── wifi_setup.h    WiFiManager captive portal
│       ├── led_matrix.h    HUB75 DMA display init
│       └── loader_html.h   Gzipped loader page (PROGMEM)
│
├── docs/
│   ├── ARCHITECTURE.md     This file
│   ├── EFFECTS.md          How to write and upload new effects
│   ├── WIRING.md           ESP32-S3 → HUB75 pin wiring
│   └── DEVELOPMENT.md      Local dev, PlatformIO, debugging
│
└── tools/
    ├── generate_loader_h.py   Regenerate loader_html.h from loader.html
    └── generate_icons.py      Regenerate PNG icons from icon.svg
```
