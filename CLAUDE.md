# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multidisplay is an RGB LED display made of 64×64 HUB75 panels, either a 6-face cube or a flat "wall" of panels. Everything that matters lives in **`pi-native/`**, a Node.js app that runs directly on a Raspberry Pi. It computes every effect server-side and drives the panels through `rpi-led-matrix`. A thin browser UI (`pi-native/public/`) controls it and shows a live preview over WebSocket. See `pi-native/README.md` for setup, panel layout, WiFi and Bluetooth.

**Live demo**: https://chaoticatom.github.io/Multidisplay/ is a browser build of the same pi-native effect engine, bundled via `pi-native/sim/` and running standalone with no Pi behind it. The files at the repo root (`app.js`, `index.html`, `sim-engine.js`, `effects.json`, ...) are **build output** from `sim/deploy.js`. Never hand-edit them.

The older ESP32-S3 + browser architecture (`firmware/`, `docs/`, the old root-level `cube.js`/`ui.js`/`effects-*.js`) is retired. It remains in `firmware/`/`docs/` and git history as reference only. Don't build against it, and treat `docs/` as historical.

## Working style

Don't test beyond `node --check` on touched files and the `npm test` suite in `pi-native/`. Don't spin up servers, browsers, or do manual verification. The real panels and Bluetooth speaker are only on the user's Pi, so hardware-dependent fixes ship untested and get confirmed by the user.

## Commands (run from `pi-native/`)

```bash
npm test                 # the full suite: every test/*.test.js, run by scripts/runTests.js (new files run automatically)
npm run start:mock       # run without hardware (mock driver, no WiFi setup)
npm run release          # bump patch version everywhere + rebuild the root simulator (see below)
npm run release -- 0.7.0 # ...or set an exact version
```

On the Pi, it runs as the `multidisplay-pi` systemd service from `/opt/multidisplay`. To update it: `cd /opt/multidisplay && git pull origin main && sudo systemctl restart multidisplay-pi`.

## Shipping a change

1. Make the change, then run `node --check` on touched files and `npm test`.
2. Run `npm run release`. It bumps `package.json`'s `version`, `public/app.js`'s `APP_VERSION` and the `app.js?v=` query in `public/index.html` together, then runs `sim/deploy.js` to regenerate the root simulator files. It fails if the three versions are out of step.
3. Commit the source changes **and** the regenerated root files (`app.js`, `index.html`, `sim-engine.js`, `effects.json`).
4. GitHub Pages deploys from `main`. The deploy step fails transiently ~30-40% of the time for infrastructure reasons, so rerun a failed "pages build and deployment" job rather than assuming the commit is broken.

## Architecture

```
app.js (main thread)                         renderWorker.js (RENDER_WORKER=1)
  WS/HTTP server (wsServer.js)                 tick(): effect + alarms + overlays -> colBuf/wallBuf
  radio decode/FFT/playback (RadioAudio)  ---> driver.renderFrame() (rpi-led-matrix push)
  sends {type:'tick', state, dt, radioAudio}   replies {type:'frame', colBuf, wallBuf, alarms, effectStatus, radioAudio}
```

- **`src/tick.js`**: one frame of computation, shared by the Pi and the simulator. Anything a tick does belongs here, not copy-pasted into `app.js` or `sim/`.
- **`src/app.js`**: entry point. With `RENDER_WORKER=1` (how the Pi runs), tick + panel push move to `src/renderWorker.js`. The loop is ping-pong: the next tick is only sent after the previous frame's reply, at up to `TICK_HZ` (60), or 30 without the worker.
- **Per-thread singletons**: each thread has its own `require()` cache, so effect modules with state (radio, video, browserFrameSource) exist once per thread. `wsServer.js` relays commands that must reach the rendering copy through `effectCommandRelay` (see its constructor comment). Its main-thread copies are otherwise dead under the worker.
- **Radio audio split**: the real `RadioAudio` (ffmpeg decode, FFT, `paplay` to the Bluetooth sink) runs on the main thread. The worker's `radio.js` uses a `RemoteAudio` proxy fed a spectrum snapshot with each tick, and it sends `ensure()`/clear requests back with each frame. Running decode on the render thread starved it at 60 Hz. See `src/effects/radio/ffmpegAudio.js`. Analysis runs on a steady 60 Hz clock over a ring buffer, kept 120 ms behind the newest audio. It uses a dB scale from 30 Hz to 7 kHz, with a longer window for bass (`radio/fft.js`). Per-frame display levels (gain, auto-gain, fit, soft ceiling) are computed once in `radio/levels.js`, and renderers read `ctx.ampArr`/`ctx.peakArr`.
- **Child processes (ffmpeg/paplay)**: `kill()` is asynchronous. Exit, error and stdout handlers must ignore any process that is no longer the current one (`proc !== this.proc`). Otherwise a late exit tears down its successor. Both `radio/ffmpegAudio.js` and `video/ffmpegSource.js` follow this pattern, so copy it for any new spawned pipeline.
- **`src/drivers/`**: `rgbMatrixDriver.js` (real panels; calibrate `FACE_LAYOUT` for cube wiring) and `mockDriver.js`, behind `driverInterface.js`. Brightness is applied at push time, not baked into `colBuf`.
- **`src/wsServer.js`**: HTTP/WebSocket listeners, state broadcast, preview frame streaming, uploads. It sends `Cache-Control: no-store`, so there's no cache layer to fight. WebSocket connections and uploads from another site's page are refused (`isSameOrigin`), and messages are capped at 8 MB.
- **`src/wsCommands.js`**: one handler per WebSocket `cmd`, called with `this` bound to the `WsServer`. Add new commands here. Every incoming command bumps `ws.stateVersion`, which is how `app.js` knows to re-send state to the render worker.
- **Config saves** go through `src/atomicWrite.js` (`atomicWriteJson`: temp file, fsync, rename). Never `writeFileSync` a config file directly.
- **Panel output**: `src/drivers/pixel.js` converts floats to bytes with a hue-preserving clip above brightness 1.0. Don't add gamma: rpi-rgb-led-matrix already applies CIE1931 correction.
- **`src/tick.js`** crossfades between effects over 0.4 s.

## Writing effects

- Each effect is `function(core, dt)`, registered in `src/effects/index.js` (`EFFECTS` for cube mode, `WALL_EFFECTS` for wall mode, plus `EFFECT_NAMES`). Most effects exist as a pair, `x.js` (cube faces) and `xWall.js` (the wall canvas).
- `core` (`src/core.js`) holds the buffers: `colBuf` (Float32 RGB 0-1), `faceMap[face][v*SIZE+u]`, `surfX/Y/Z`, `setLED(i,…)`, `setFaceLED(face,u,v,…)`, and for walls `wallBuf`/`wallW`/`wallH`/`setWallPixel(x,y,…)` (which skips unoccupied grid cells).
- Faces: 0=Front, 1=Back, 2=Right, 3=Left, 4=Top, 5=Bottom.
- Effect options arrive in `core.effectOptions[effectKey]`. An optional `fn.getStatus()` is surfaced to the UI via `state.effectStatus`.
- **Text**: always use `src/effects/text.js`, never a hand-rolled glyph loop. It provides `blitGlyph`, `drawGlyph`/`drawString`/`textWidth`/`drawLinesCentered`/`drawMarquee`, the fonts `FONT_3x5`/`FONT_5x7`/`FONT_5x7_BLANK`/`FONT_MOON`, and the plot targets `facePlot`/`wallPlot`/`faceMaxPlot`/`wallMaxPlot`. Pass whole-pixel coordinates, because fractional ones plot nothing. Cube-face 5x7 text is drawn with `flipY` (see `drawGlyph5x7Face`'s comment for why).
- **Trails**: fade the buffer with `trailFade(k, dt)` from `src/effects/trail.js`, never a fixed `*= k` per frame. That would make trail length depend on the frame rate.
- **External APIs**: call `fetchWithTimeout` from `src/effects/net.js`, not bare `fetch`.
- **One definition for cube and wall** where possible:
  - **Colour-field effects** (plasma, wave, tide, prism, depth rings, gradient wash, aurora, nebula) use `defineFieldEffect({ speed, frame?, pixel(p, ctx) })` from `src/effects/surface.js`. The module exports the cube effect with `.wall` attached, and `index.js` registers `x.wall` for wall mode. `p.flat` is true on a wall, for effects that need a different stand-in for the missing z axis.
  - **Fetched text cards** (jokes, trivia) use `defineTextCardEffect` from `src/effects/textCard.js`. There is one fetch and one status for both modes.
  - **Other pairs:** put target-independent logic in an `xCommon.js` (see `datetimeCommon.js`, `random80sCommon.js`), or one module exporting `.wall` (see `otd.js`).
- **Music**: every effect gets live `core.audio` (`bass`/`mid`/`treble`/`level`/`beat`, see `src/effects/audioFeatures.js`) while a station plays. `tick.js` also keeps a playing station alive in the background.
- **Shared engines in `src/effects/_shared.js`**: the word-cascade text engine (`WC_FONT`, `wcInit`/`wcStep`/`wcDrawToFace`, `wcTagQA`) used by Jokes/Trivia/On This Day/Date & Time Words, and the gallery slideshow helpers. Reuse them rather than copying.
- **External API behaviour**: throttle proactively, back off harder on 403/429, and surface the failing endpoint and status in the effect's status rather than a bare "error".

## Tests

`pi-native/test/*.test.js` are plain Node scripts that use `assert` and set `process.exitCode` on failure; `scripts/runTests.js` runs them all (`node scripts/runTests.js radio` runs only matching files). Spawned processes are faked through injectable `spawn` functions (see `radio.test.js`, `ffmpegSourceStaleData.test.js`). For a regression fix, make sure the new test fails on the old code.
