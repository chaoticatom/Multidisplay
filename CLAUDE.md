# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multidisplay is a 6-face RGB LED cube (64×64 per face) with a browser-based Three.js simulator that streams pixel frames over WebSocket to an ESP32-S3 driving HUB75 panels via DMA at 20 fps. The browser computes all effects in JavaScript; the ESP32 does no effect computation — it only receives and displays frames.

**Live demo**: https://chaoticatom.github.io/Multidisplay/ (simulator-only, no hardware streaming on HTTPS)

## Development

No build step for the web app. Edit JS/CSS/HTML, reload the page.

```bash
# Local dev server
python3 -m http.server 8080
# Then open http://localhost:8080

# Firmware build (PlatformIO)
cd firmware && pio run --target upload      # initial USB flash
cd firmware && pio run --target uploadfs    # upload web assets

# Bundle web assets for ESP32 LittleFS
./build.sh    # downloads three.js, gzips all assets into ./data/

# OTA updates (after initial flash)
# Browse to http://multidisplay.local/loader, drag-drop firmware.bin or littlefs.bin
```

## Version Bumping

Every change requires updating three files in sync:
1. `version.js` — `APP_VERSION` string
2. `service-worker.js` — `CACHE_NAME` and all `?v=` params in `PRECACHE_URLS`
3. `index.html` — all `?v=` params on script/link tags

All three must use the same version number.

## Architecture

### Rendering Pipeline

```
Effect function → setLED(i, r, g, b) → colBuf (Float32Array, RGB 0-1)
  ├→ Three.js InstancedMesh (browser, 60fps)
  └→ streamFrameToCube() → WebSocket binary [PKT_VIDEO=2, faceID, S×S×3 RGB888]
       → ESP32 g_frameBuf → displayTask (Core 0, 20fps) → HUB75 DMA → physical LEDs
```

`colBuf` is a direct reference to `mesh.instanceColor.array` — writes go straight to the GPU texture. The float-to-uint8 conversion happens only at WebSocket streaming time.

### Key Globals (cube.js)

- `SIZE` (8/16/64), `N` (total surface LEDs), `SPACING`, `HALF`
- `colBuf` — Float32Array, N×3, the pixel buffer everything writes to
- `faceMap[face][v*SIZE+u]` — maps face pixel coords to LED index (-1 if none)
- `surfX/Y/Z[i]` — normalized 0-1 coords for smooth 3D patterns
- `mesh` — Three.js InstancedMesh
- Faces: 0=Front(z=max), 1=Back(z=0), 2=Right(x=max), 3=Left(x=0), 4=Top(y=max), 5=Bottom(y=0)
- faceMap bakes horizontal flip for faces 1 and 2

### Key Globals (ui.js)

- `currentEffect` — active effect key string
- `brightness` — master brightness 0-1.5; 3D cube uses `mesh.material.color.setScalar(brightness)`
- `speedMult` — effect speed multiplier
- `EFFECTS` — map of effect key → function (line ~1226)
- `EFFECT_NAMES` — map of effect key → display name (line ~1243)
- `OV` — overlay enable flags and params; `runOverlays(dt)` processes all enabled overlays
- `perFaceEffect[0-5]` — per-face effect assignment `{effect, overlayKeys:[], opts:{}}`
- `activeAlarm` — current timer state `{al, phase:'pre'|'main'|'done', startMs, ...}`

### Animation Loop (ui.js `animate()`, line ~2849)

Each frame: FPS counter → playlist advance → alarm check → alarm phase rendering → main effect execution → overlay application → floor brightness → backface culling → Three.js render → WebSocket stream.

### File Load Order

`three.min.js` → `cube.js` → `effects.js` → `f1.js` → `version.js` → `ui.js` (ui.js depends on all others)

## Writing Effects

Effect functions live in `effects.js`, signature: `function effectMyEffect(dt) { ... }`

Registration requires three steps:
1. Add function to `effects.js`
2. Add to `EFFECTS` and `EFFECT_NAMES` maps in `ui.js`
3. Add button in `index.html`: `<button class="effect-btn" data-effect="key">Name</button>`

Use `setLED(i, r, g, b)` for coordinate-based patterns (iterate `surfX/Y/Z`), or `faceMap[face][v*SIZE+u]` for pixel-precise face rendering. Pre-allocate state arrays at module level with lazy init guards.

Effects read UI controls directly via `document.getElementById()` inside the effect function — no event listener wiring needed.

## Overlays

13 overlays (stars, snow, meteors, edgeglow, fire, sparkle, colorwave, pulse, scanline, vignette, glitch, mist, lightning) defined in `effects.js`. Each has an `OV[key].on` flag. They blend onto colBuf after the main effect via `runOverlays(dt)`. UI uses `.ov-toggle`/`.ov-slider` CSS classes for pill-shaped slide toggles.

## Timer System (ui.js, lines ~286-1016)

Timers (formerly "alarms") support Alarm and Wind Down modes with collapsible dropdown headers. Wind down triggers AT alarm time and dims forward. `activeAlarm.phase` tracks state: `'pre'` (counting), `'main'` (firing), `'done'` (blanked). Timer editor uses hidden inputs for alarm/wind-down selection, `.ov-toggle` slide switches for all checkboxes.

## F1 Subsystem (f1.js)

Current implementation polls ESP32 endpoints (`/api/session`, `/api/drivers`, `/api/flags`) every 5 seconds. `effectF1(dt)` renders session info, leaderboard, weather, track outline, and flag overlays onto cube faces using `faceMap` and pre-rendered pixel buffers (`f1FaceBufs`). Simulation mode uses hardcoded demo data.

## Firmware (ESP32-S3)

- `config.h` — pin assignments, `PANEL_SIZE=64`, `NUM_FACES=6`, `WS_PORT=81`, `PKT_VIDEO=2`, `PKT_CMD=1`
- `main.cpp` — PSRAM frame buffers, `displayTask` (Core 0, 20fps DMA output), `statusLedTask` (Core 1)
- `web_server.h` — HTTP routes, WebSocket handler copies `PKT_VIDEO` packets into `g_frameBuf[face]` with mutex protection
- `led_matrix.h` — HUB75 DMA panel driver via `MatrixPanel_I2S_DMA`
- Face ordering differs: JS sends face IDs, firmware maps via `CUBE_FACE_ORDER` in ui.js (line ~3275)

## UI Patterns

- Sidebar sections: collapsible with section headers
- Effect buttons: `data-effect="key"`, optional `has-panel` class with `<div class="effect-panel" id="panel-key">`
- Toggle switches: `.ov-toggle` wrapping `<input type="checkbox">` + `.ov-slider` span
- `.check-row` class on labels renders checkboxes as slide toggles (separate from `.ov-toggle`)
- `.modern-chk` class for custom styled checkboxes (dark square, blue check)
- Timer list uses custom slide-switch HTML (not CSS class)

## Weather System (effects.js)

Real-time weather via Open-Meteo API. Key globals: `wxData`, `wxCity`, `HORIZ` (horizon line fraction), `WX_CLEAR_TOP` (clear zone top). Clouds use dist-based falloff and naturally dip 6px into the clear zone. `SIDE=[2,0,3,1]` maps face indices for panoramic rendering.

## Face Mirroring

faceMap bakes horizontal flip for faces 1 (back) and 2 (right). For text rendering, `SIDE=[2,0,3,1]` orders faces for panoramic layout. Wind down text uses `mir=false` on all faces; normal countdown uses `mirFaces=[2,3]`.

## WebSocket Streaming (ui.js)

`initCubeWs()` connects to `ws://{hostname}:81`. Disabled on localhost and HTTPS. `streamFrameToCube()` throttles to 20fps, packs colBuf floats into RGB888 bytes per face. Auto-reconnects every 5 seconds.
