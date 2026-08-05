# Multidisplay Pi-native (early proof-of-concept)

Native effect engine + LED panel driver for running Multidisplay on a
Raspberry Pi driving HUB75 panels directly (via `rpi-led-matrix`), instead
of a browser computing effects and streaming frames to an ESP32.

Not to be confused with the top-level `pi/` directory in this repo, which
is unrelated: helper scripts (Bluetooth audio bridge) for a Raspberry Pi
that's running the *existing browser-based* app as a client, not this
native rewrite.

## Status: proof-of-concept, NOT feature-complete, NOT hardware-tested

This was built and tested entirely in a sandbox with **no Raspberry Pi, no
HUB75 panels, and no ARM hardware available**. What that means concretely:

**Verified (in this sandbox, with `DRIVER=mock`):**
- `src/core.js` — the ported `SIZE`/`N`/`faceMap`/`surfX,Y,Z`/`colBuf`/
  `setLED` logic — produces the exact expected surface-LED count
  (64³ − 62³ = 23,816) and valid `faceMap` entries. See `test/core.test.js`.
- 4 ported effects:
  - `wave`, `gradient_wash` — small, pure-math effects, run without
    throwing and produce finite, in-range color values.
  - `weather` — a **much** larger, faithful line-for-line port of the
    browser's 900+ line `effectWeather()` (sky/sun/moon, procedural
    skyline with ~19 city landmark silhouettes, clouds, birds/planes/
    balloons, lightning, rain/snow). Stress-tested across every weather
    code × 4 times of day × short/long city names (156 cases,
    `test/weather.test.js`) - never throws, stays in valid numeric range.
    **Not visually verified** - there's no renderer available in this
    sandbox to eyeball spatial correctness against, unlike the small math
    effects where numeric range-checking is meaningful confidence. Treat
    the geometry/layout as unverified until you can actually see it.
  - `easter_egg` — port of the ESP32 firmware's `standaloneRenderEasterEgg`
    (itself a native port of the browser's hidden image reveal). Verified
    byte-for-byte against `firmware/src/easter_egg_images.h`'s embedded
    images and exact-match tested against the source crossfade math at a
    sampled pixel (`test/easterEgg.test.js`).
- The WS control/preview server: connect → receive state → send
  `setEffect` → receive correctly-shaped binary preview frames for all 6
  faces, confirmed for all 4 registered effects. See `test/smoke-client.js`
  (manual, run against a live `npm start`).

**NOT verified — needs real hardware:**
- `src/drivers/rgbMatrixDriver.js` — written against `rpi-led-matrix`'s
  actual documented API and its native addon's C++ source (verified the
  `drawBuffer()` byte-buffer contract by reading `led-matrix.addon.cc`
  directly, not just the README, which was stale on this point) — but it
  has never actually run against the native binding or real panels, since
  that binding requires compiling against real hardware.
- **`FACE_LAYOUT` in `rgbMatrixDriver.js` is a placeholder**, not a
  calibrated mapping. It assumes the Active-3 board's 3-parallel-chain
  layout discussed during planning, but which physical face lands where is
  a property of how *you* wire it. Test with solid per-face colors before
  trusting any real effect's output.
- `gpioSlowdown` and other `runtimeOptions` in `rgbMatrixDriver.js` are
  placeholder starting points, not tuned values.
- **The `weather` effect's spatial rendering specifically** - see above.
  The math was transcribed function-by-function against the browser source
  and stress-tested numerically, but only actual hardware (or eventually a
  renderer) can confirm things like sun/moon screen position, skyline
  placement, and cloud shapes actually look right.
- Only 4 of the ~40 effects in the browser (`effects-*.js`) are ported.
  Everything else in the project's task list (word-cascade text, APOD, ISS
  tracker, custom-cube per-face composition, internet radio) is still
  todo, and radio specifically needs its own audio-decode/FFT subsystem -
  it isn't a `setLED()`-only port like the rest.
- The `systemd/multidisplay-pi.service` unit file is standard boilerplate,
  not tested against a real boot.

## Running (development, no hardware)

```bash
npm install --omit=optional   # skip rpi-led-matrix's native build if you don't have build tools/hardware for it
npm test                      # run test/core.test.js
npm run start:mock            # or: DRIVER=mock node src/app.js
```

With `DRIVER=mock` (the default), no GPIO/hardware calls happen at all —
`mockDriver.js` just logs a periodic frame/brightness summary, so the
effect engine + WS server can be exercised on any machine.

Connect a WS client to `ws://localhost:8081` to drive it — see
`src/wsServer.js`'s module comment for the exact protocol, or run
`node test/smoke-client.js` against a live `npm start` as a working example.

## Running on real hardware

```bash
npm install          # now including rpi-led-matrix - needs build tools + the actual native library present
sudo DRIVER=hardware node src/app.js
```

Before trusting any effect's visual output: **calibrate `FACE_LAYOUT` in
`src/drivers/rgbMatrixDriver.js` against your actual wiring** by testing
one distinctive solid color per face.

Then install `systemd/multidisplay-pi.service` (adjust `WorkingDirectory`
to wherever this is deployed) to run it as a boot-time service.

## Project layout

- `src/core.js` — DOM-free port of `cube.js`'s `SIZE`/`N`/`faceMap`/
  `surfX,Y,Z`/`colBuf`/`setLED`/`setFaceLED` plus the `hsl`/`lerp`/`sm`
  color helpers. No dependency on `document`/WebGL/Three.js at all - see
  its module comment for why that split was necessary.
- `src/effects/` — ported effect functions, `(core, dt) => void`, same
  calling convention as the browser's `EFFECTS` map. `weather/` holds the
  weather effect's supporting modules (state, lunar-position math, city
  skyline/landmark generation, Open-Meteo fetch, bitmap font) split out
  from the ~900-line render function itself, mirroring how the browser
  source spreads this across several concerns even though it's all one
  file there. `easterEgg/img1.bin`/`img2.bin` are the two embedded 64x64
  RGB888 images, extracted programmatically from
  `firmware/src/easter_egg_images.h` (not hand-transcribed).
- `src/drivers/` — pluggable LED output backends (`mockDriver.js`,
  `rgbMatrixDriver.js`) behind the shared contract in
  `driverInterface.js`.
- `src/wsServer.js` — local control + preview WebSocket server.
- `src/app.js` — entry point: animation loop, driver selection, wiring it
  all together.
