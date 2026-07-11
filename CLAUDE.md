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
# Then open http://localhost:8080 (WebSocket streaming to hardware auto-disables on localhost)

# Firmware build (PlatformIO)
cd firmware && pio run                      # compile only
cd firmware && pio run --target upload      # compile + flash over USB (initial flash)
cd firmware && pio run --target buildfs     # build LittleFS image from ./data/
cd firmware && pio run --target uploadfs    # flash LittleFS image over USB
cd firmware && pio device monitor           # serial monitor, 115200 baud

# Bundle web assets for ESP32 LittleFS
./build.sh    # downloads three.js, gzips all assets into ./data/

# OTA updates (after initial flash, no USB needed)
# Browse to http://multidisplay.local/loader, drag-drop firmware.bin or littlefs.bin
```

No test suite or linter is configured (`package.json` only lists `playwright` as a dependency; no test files exist).

## Version Bumping

Every change requires updating **two** files in sync (there is no service-worker precache step — see PWA note below):
1. `version.js` — `APP_VERSION` string
2. `index.html` — every `?v=` param, on the `style.css`/`version.js` tags and inside the `appScripts` array (`cube.js`, `effects.js`, `ui.js`)

`f1-state.js`/`f1.js`/`f1-providers.js` are loaded dynamically at runtime (see File Load Order below) and append `?v=` + `APP_VERSION` automatically — they never need a manual bump.

### PWA / service worker is retired

`sw.js` and `service-worker.js` are both intentionally reduced to self-destruct stubs (unregister themselves, clear all caches) — they caused more stuck-version problems than they solved. `index.html` only calls `getRegistrations()` to unregister leftovers; it does not register a new one. Do not reintroduce a precaching service worker without discussing it — the version-bump-and-reload model this app uses depends on there being no cache layer between the browser and the server.

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
- `EFFECTS` — map of effect key → function (~line 1267)
- `EFFECT_NAMES` — map of effect key → display name (~line 1294)
- `OV` — overlay enable flags and params; `runOverlays(dt)` processes all enabled overlays
- `perFaceEffect[0-5]` — per-face effect assignment `{effect, overlayKeys:[], opts:{}}`
- `activeAlarm` — current timer state `{al, phase:'pre'|'main'|'done', startMs, ...}`

### Animation Loop (ui.js `animate()`, ~line 3099)

Each frame: FPS counter → playlist advance → alarm check → alarm phase rendering → main effect execution → overlay application → floor brightness → backface culling → Three.js render → WebSocket stream.

### File Load Order

`three.min.js` (local, CDN fallback) → `version.js` → then `index.html`'s inline loader sequentially injects `cube.js` → `effects.js` → `ui.js` (each with a `?v=APP_VERSION` cache-bust) once `THREE` is confirmed available.

`f1-state.js` → `f1.js` → `f1-providers.js` are **not** part of that static load — `ui.js`'s `_f1LoadScripts()` injects them lazily the first time the F1 effect is activated, using the same `?v=APP_VERSION` cache-busting. Don't assume F1 globals exist until that effect has been selected at least once.

## Writing Effects

Effect functions live in `effects.js`, signature: `function effectMyEffect(dt) { ... }`

Registration requires three steps:
1. Add function to `effects.js`
2. Add to `EFFECTS` and `EFFECT_NAMES` maps in `ui.js`
3. Add button in `index.html`: `<button class="effect-btn" data-effect="key">Name</button>`

Use `setLED(i, r, g, b)` for coordinate-based patterns (iterate `surfX/Y/Z`), or `faceMap[face][v*SIZE+u]` for pixel-precise face rendering. Pre-allocate state arrays at module level with lazy init guards.

Effects read UI controls directly via `document.getElementById()` inside the effect function — no event listener wiring needed.

### Shared engines — reuse these instead of reimplementing per effect

Several visual patterns recur across effects and have been factored into shared helpers in `effects.js`. When adding an effect that fits one of these shapes, wrap the shared engine rather than copy-pasting an existing effect's version of it (this has happened twice already and both times got unified later):

- **Photo-gallery slideshow** (Unsplash, Art Gallery): `galleryInitFaceState(n, periodSecs)` sets up per-face staggered timing state; `gallerySlideshowStep(state, n, dt, periodSecs, fadeDur, slideshowOn, loadFn, pixelsArr)` advances one face's cycle/crossfade per frame; `galleryApplyToFace`/`galleryApplyBlendToFace` do the actual pixel blit/crossfade given generic `pixelsArr`/`sizesArr` arrays. Each face cycles on the same period but offset by `period/6` and crossfades over `fadeDur` seconds instead of cutting.
- **Word-cascade text** (Jokes, Trivia, On This Day, Date & Time's Words mode): `WC_FONT` (4-wide × 7-tall bitmap font), `WC_CHAR_W`/`WC_LINE_H`, `wcInit(taggedWords)`/`wcStep(state, dt)`/`wcDrawToFace(state, face)`/`wcDrawGlyph(face, ch, su, sv, rgb)`, and `wcTagQA(text)` (splits a question/answer string into per-word color tags). Any "words appear staggered with per-word timing" effect should reuse this rather than hand-rolling text layout.
- **Image loading** (`loadImageForPixels()` in `effects.js`): 4-tier fallback — direct fetch→blob, direct `<img crossOrigin>`, proxy fetch→blob (images.weserv.nl), proxy `<img>`. Some CDNs (e.g. Art Institute of Chicago's IIIF server) block all four tiers via hotlink/referrer protection with no client-side workaround — if every strategy fails for a given host, the fix is switching data source, not adding a 5th strategy.

## Submenu / shared-controls UI pattern

The "Art" and "Trivia & Facts" sidebar entries are submenus grouping several related effects (e.g. APOD/Unsplash/Art Gallery) with one shared controls block, not three separate ones. The pattern: a `.sub-section.collapsed` wrapping a `.sub-head.sub-head-boxed` header (styled and sized identically to a regular `.effect-btn`, with the same `.panel-arrow` rotate-on-open behavior) and a `.sub-body` containing the child effect buttons. Shared controls that must stay visible regardless of which child effect is open go in a `.art-shared-panel` div — **not** `.effect-panel` — because the effect-button click handler does `document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'))`, which would strip a shared panel reusing that class too.

## Overlays

13 overlays (stars, snow, meteors, edgeglow, fire, sparkle, colorwave, pulse, scanline, vignette, glitch, mist, lightning) defined in `effects.js`. Each has an `OV[key].on` flag. They blend onto colBuf after the main effect via `runOverlays(dt)`. UI uses `.ov-toggle`/`.ov-slider` CSS classes for pill-shaped slide toggles.

## Timer System (ui.js, lines ~286-1016)

Timers (formerly "alarms") support Alarm and Wind Down modes with collapsible dropdown headers. Wind down triggers AT alarm time and dims forward. `activeAlarm.phase` tracks state: `'pre'` (counting), `'main'` (firing), `'done'` (blanked). Timer editor uses hidden inputs for alarm/wind-down selection, `.ov-toggle` slide switches for all checkboxes.

## F1 Subsystem (f1-state.js, f1.js, f1-providers.js)

Three files with a strict separation of concerns — don't blur them:

- **`f1-state.js`** defines the single source of truth, `F1State` (session, drivers, track, weather, connection status). `f1Update(partial)` deep-merges into it and fires a `f1-state-change` DOM event; nothing should mutate `F1State` directly.
- **`f1-providers.js`** owns all networking, behind `F1Providers.esp32` / `.openf1` / `.simulation`. Exactly one is active at a time via `f1SetMode(mode)`; each writes into `F1State` via `f1Update()` and never touches rendering.
- **`f1.js`** (`effectF1(dt)`) only ever *reads* `F1State` — it never fetches anything. It renders leaderboard, weather, track outline, and flag overlays onto cube faces via `faceMap`.

`F1Providers.esp32` polls `/api/session`, `/api/drivers`, `/api/flags`, `/api/weather` on the ESP32 every 5s. `F1Providers.openf1` polls `api.openf1.org` directly from the browser (standalone/GitHub-Pages mode) and is rate-limited — see the next section, since it's the pattern to copy for any new external-API effect. `F1Providers.simulation` drives `F1State` from the sidebar's dev-tools buttons for demoing without a live session.

The F1 sidebar panel's collapsible "▸ Diagnostics" section (`_f1UpdateDiag()` in `ui.js`) surfaces `F1State.connectionError` — check there first (not just the connection dot) when live data looks stuck, since the error string carries the actual HTTP status/endpoint that failed.

### External API resilience pattern (copy this for new API-backed effects)

`f1-providers.js`'s `f1Fetch()` is the reference implementation for talking to a rate-limited free API:
- A token-bucket rate limiter gates every request under the provider's documented ceiling (proactive throttling, not reactive)
- A CORS-proxy retry (`corsproxy.io`) on raw network failure (`TypeError: Failed to fetch`), which is distinct from an HTTP error response
- 403/429 responses get a much longer cooldown than a generic failure — hammering an active rate-limit block just prolongs it
- Failures are surfaced into `F1State.connectionError` with enough detail (endpoint + status) to diagnose from the UI — never collapse a failure into a bare "error" state

## Firmware (ESP32-S3)

- `config.h` — pin assignments, `PANEL_SIZE=64`, `NUM_FACES=6`, `WS_PORT=81`, `PKT_VIDEO=2`, `PKT_CMD=1`
- `main.cpp` — PSRAM frame buffers, `displayTask` (Core 0, 20fps DMA output), `statusLedTask` (Core 1)
- `web_server.h` — HTTP routes, WebSocket handler copies `PKT_VIDEO` packets into `g_frameBuf[face]` with mutex protection
- `led_matrix.h` — HUB75 DMA panel driver via `MatrixPanel_I2S_DMA`
- Face ordering differs: JS sends face IDs, firmware maps via `CUBE_FACE_ORDER` in ui.js (~line 3525)
- Dual-core split: Core 0 runs only the DMA display task; Core 1 runs WiFi/HTTP/WebSocket/`loop()` and the status-LED task — don't add blocking work to Core 0's task
- First boot with no saved WiFi credentials starts an AP (`Multidisplay-Setup` / `cube1234`) with a captive portal; normal boot connects to saved WiFi and falls back to AP mode after a 30s connect failure
- OTA updates write to the inactive partition and only flip `otadata` after a successful write — `/loader` is served from PROGMEM so it stays reachable even if LittleFS is mid-update
- Deep dives already written up in `docs/`: `ARCHITECTURE.md` (full system diagrams), `DEVELOPMENT.md` (debugging, WS frame format, mDNS troubleshooting), `WIRING.md`, `EFFECTS.md`. Treat these as historical references, not current truth — cross-check against the actual source (e.g. current `web_server.h` routes, current `f1-providers.js`) before relying on specifics, since some content (the old single-provider F1 description, the effect count) predates this session's changes and hasn't been updated to match.

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

## Deployment

GitHub Pages auto-deploys from `main` on every push, but the deploy step itself fails transiently roughly 30-40% of the time for infrastructure reasons unrelated to the commit's content. After pushing, check the run's conclusion (GitHub Actions "pages build and deployment" workflow) and rerun failed jobs rather than assuming a first-attempt failure means the code is broken.
