# Multidisplay Pi-native (early proof-of-concept)

Native effect engine + LED panel driver for running Multidisplay on a
Raspberry Pi driving HUB75 panels directly (via `rpi-led-matrix`), instead
of a browser computing effects and streaming frames to an ESP32.

Not to be confused with the top-level `pi/` directory in this repo, which
is unrelated: helper scripts (Bluetooth audio bridge) for a Raspberry Pi
that's running the *existing browser-based* app as a client, not this
native rewrite.

## Quick setup

`setup.sh` automates everything scriptable on a fresh Raspberry Pi OS Lite
install - system packages, boot config (audio off / isolated CPU core),
Node.js, `npm install`, a baseline test run, and installing the systemd
service. Run it on the Pi as your normal user (not root):

```bash
bash pi-native/setup.sh
```

It deliberately stops short of the one thing that can't be scripted -
calibrating `FACE_LAYOUT` against your actual panel wiring, needed once
you wire up the full 6-panel cube (the default single "2d" panel needs no
calibration at all - see the "Panel layout config" section below) - and
prints exactly what to do next once it's done. See the script's own
header comment for the one-liner `curl | bash` form. Not tested against
real Pi hardware (none available while writing this); read it before
running it, same as any setup script from the internet.

### Alternative: pre-built image (`build-image.sh`)

If you'd rather flash one ready-to-go image than run `setup.sh` after
booting, `build-image.sh` customizes an official Raspberry Pi OS Lite
(64-bit) image offline - mounts it via a loop device, chroots in with
`qemu-user-static`, and installs everything `setup.sh` would (packages,
Node.js, the app, boot config, systemd service) without ever booting a
Pi. Run on a Linux machine (needs root, `qemu-user-static`, `rsync`):

```bash
# Download raspios_lite_arm64 from raspberrypi.com/software first
sudo ./pi-native/build-image.sh raspios-lite-arm64.img.xz multidisplay-cube.img
```

**Read the script's own header comment before trusting this one** - it's
honestly labeled as partially unverified. The mounting/chrooting
mechanics are demonstrated working (a full `debootstrap` completed
successfully under the same emulation technique), but the actual package-
install run hit an environment-specific hang partway through while being
developed (root-caused to a missing `policy-rc.d` guard, now added, but
not re-verified by a clean successful run) - the riskiest unverified
piece is whether `rpi-led-matrix`'s native addon compiles under
emulation, since that step was never reached. `setup.sh` (above) is the
better-tested path if you want something proven to work end-to-end.

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
- The control web page (`public/index.html`) - `GET /` and `GET
  /effects.json` served correctly (`test/webPage.test.js`), and confirmed
  the WebSocket upgrade still works on the same port alongside plain HTTP.
  Added after a real user tried browsing to `http://<pi>:8081/` directly
  (a completely reasonable first instinct) and got a bare "Upgrade
  Required" error, since the server used to be WebSocket-only.
- Panel-layout config (size + cube/2D mode), persisted and synced to
  clients on connect - see the dedicated section below.
- The instant boot screen (`app.js`'s `renderBootScreen`) - confirmed via
  a real spawned-process test (`test/bootScreen.test.js`) that it renders
  to the driver strictly before the WS server starts listening.
- `src/bluetooth.js`'s device-line parsing (the only hardware-independent
  part) against realistic canned `bluetoothctl` output, including a real
  bug this caught: `[CHG] Device MAC RSSI: -60`-style lines match the same
  generic pattern as `[NEW] Device MAC Name` lines and were overwriting
  the correct name with RSSI junk on repeat sightings during a scan -
  fixed with first-sighting-wins instead of last-write-wins. The same
  regex-based approach is used in `pi/bluetooth_server.py` (the existing
  Python service for the browser-based deployment), which likely has the
  same latent bug - not fixed there as part of this port, since that's a
  different, separately-deployed file.
- Confirmed live that a Bluetooth command sent to a real running server
  fails gracefully (`{"ok":false,"error":"spawn bluetoothctl ENOENT"}`)
  rather than crashing or hanging the process when `bluetoothctl` isn't
  present (expected in this sandbox - no Bluetooth hardware here at all).
- `src/wifiSetup.js`'s orchestration logic (`isConnected`/`startAccessPoint`/
  `stopAccessPoint`/`connectToNetwork`) against a fake `nmcli`, and the
  captive-portal HTTP server itself for real (it's just Node's `http`
  module, no hardware dependency) - serves the setup page, accepts
  `/connect` POSTs, resolves only on success, keeps serving after a
  failure so the user can retry. Confirmed live that with no `nmcli`
  present at all (this sandbox), `ensureWifiConnected()` logs a warning and
  assumes already-connected rather than crashing or blocking the app
  forever - `app.js` starts up fine either way.

**NOT verified — needs real hardware:**
- `src/bluetooth.js`'s actual `bluetoothctl`/`pactl` execution (pairing,
  discoverable mode, phone-audio routing) - only the parsing logic is
  tested here, since there's no Bluetooth hardware or those binaries in
  this sandbox.
- `src/wifiSetup.js`'s actual `nmcli` AP creation and network join - no
  NetworkManager, no wlan0, no real network hardware in this sandbox.
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

Open `http://localhost:8081/` in a browser for the actual control page
(`public/index.html`) — effect buttons, brightness/speed sliders, panel
layout picker, a live per-face preview (real pixel data via `putImageData`,
not a placeholder), and Bluetooth pairing controls. Or connect a raw WS
client to `ws://localhost:8081` directly — see `src/wsServer.js`'s module
comment for the exact protocol, or run `node test/smoke-client.js` against
a live `npm start` as a working example.

## Panel layout config (size + 2D/cube mode)

Reuses the browser's existing cube-size picker (8×8 / 16×16 / 64×64 / 2D)
as the panel-layout setting here too, rather than inventing new config UI -
users already know it. All 3 sizes mean the same 6-face physical layout;
"2D" means 1 flat panel instead of a full cube. HUB75 itself can't be
auto-probed for how many panels are connected (it's a write-only protocol
with no return signal - see this project's design discussion), so this is
a `{"cmd":"setPanelConfig","size":8|16|64,"mode":"cube"|"2d"}` WS command
(see `src/wsServer.js`), persisted to `panel-config.json` (gitignored,
created on first run) and included in the `state` message sent to every
newly-connected client, so a remote browser's UI reflects whatever was
last chosen on the Pi rather than defaulting to something stale. Verified
live: set via one client, confirmed a second client sees it on connect,
confirmed it survives a full process restart.

**Defaults to `mode: "2d"` (1 panel) on a fresh install** - a first run
shouldn't assume all 6 panels are already wired and `FACE_LAYOUT`
calibrated (see `src/panelConfig.js`'s `DEFAULT_CONFIG`); switch to
`"cube"` explicitly via `setPanelConfig` once you're actually ready.

Size changes apply live (`CubeCore.resize()`). Mode changes (cube/2D) also
apply live to the WS preview, but **not** to real physical panels if
you're running `DRIVER=hardware` - `rpi-led-matrix` fixes its panel
topology (chain length/parallel count) at construction time with no
runtime reconfiguration API, so changing mode there only takes effect
after a process restart (`app.js` logs a warning when this happens).

Also note: only `size=64` is meaningful with `DRIVER=hardware` -
`8`/`16` are browser-preview-only resolutions (same as the ESP32 firmware,
which is hardcoded `PANEL_SIZE=64`); real HUB75 panels are a fixed
physical resolution and `rgbMatrixDriver.js` will throw rather than
silently misbehave if asked to render a non-64 size.

## WiFi setup

Mirrors the ESP32 firmware's `WiFiManager` captive-portal flow
(`firmware/src/wifi_setup.cpp`): every time `app.js` starts, it checks for
a working connection (`src/wifiSetup.js`, via NetworkManager/`nmcli` - the
default network stack on Raspberry Pi OS Bullseye and later). If none is
found, it opens its own AP - same credentials as the firmware for
consistency: SSID `Multidisplay-Setup`, password `cube1234` - and blocks
startup until real credentials are submitted through a small web form at
`http://10.42.0.1/` (NetworkManager's default AP gateway address). The
instant boot screen is already showing at this point, so real panels
aren't dark during the wait.

This is a genuinely new subsystem (the browser-based/ESP32 project never
needed this on the Pi side), not previously scoped work. Unlike a full
captive portal, there's no DNS hijacking to trigger the OS's automatic
"Sign in to network" popup - same UX as the ESP32's own portal: connect,
then manually browse to the address. A DNS redirect (`dnsmasq` on the AP
interface) would upgrade this to auto-popup, but is a separate, real
chunk of infrastructure, not built here.

Opt out entirely with `SKIP_WIFI_SETUP=1` (useful for local dev on a
machine you don't want this touching, or if you're not on Raspberry Pi
OS's NetworkManager-based network stack). If `nmcli` itself isn't
installed, this is detected and logged rather than crashing or hanging -
confirmed live in this sandbox (no `nmcli` at all here).

## Bluetooth audio

Ported from `pi/bluetooth_server.py` (a standalone Python HTTP service used
by the browser-based deployment) into `src/bluetooth.js`, wired directly
into this project's existing WS control channel instead of adding a
second separate service/port. Same `bluetoothctl`-over-stdin technique and
PulseAudio `module-remap-source`/`module-loopback` plumbing for routing a
paired phone's audio to both a connected speaker and a capturable
`phone_capture` input.

Commands (see `src/wsServer.js`'s module comment for exact shapes):
`btScan`, `btPair`, `btStatus`, `btDiscoverable`, `btRoutePhoneAudio` -
each replies only to the requesting client (`btScanResult` etc.), not a
broadcast, since a scan/pair result is specific to that request.

One-time setup on the Pi (same as the Python version):
```bash
sudo apt install bluez pulseaudio-module-bluetooth pulseaudio-utils
sudo systemctl enable --now bluetooth
```

This relies on a working PulseAudio/PipeWire **user session** to actually
route audio after pairing - if `app.js` runs as root (as the provided
`systemd` unit does, for GPIO access), phone-audio routing specifically
won't have a session to route into. Run as the same non-root user with a
logged-in desktop session if you need that piece, same caveat the
original Python script's README carried.

## Instant boot screen

The moment `app.js` has a driver constructed, it renders a single solid
amber fill (`renderBootScreen`) directly to the physical panels -
synchronously, before the WS server or animation loop exist. This mirrors
the ESP32 firmware's own pattern (`main.cpp`: "Start the display task
RIGHT AWAY, before any networking") - real panels should never sit dark
while the rest of the system comes up, however long that ends up taking.
Nothing needs to explicitly clear it; the first real animation-loop tick
overwrites it naturally. Verified via a spawned-process test
(`test/bootScreen.test.js`) that it renders strictly before the WS server
starts listening.

## Running on real hardware

```bash
npm install          # now including rpi-led-matrix - needs build tools + the actual native library present
sudo DRIVER=hardware node src/app.js
```

If you're running in "cube" mode (6 panels): before trusting any effect's
visual output, **calibrate `FACE_LAYOUT` in `src/drivers/rgbMatrixDriver.js`
against your actual wiring** by testing one distinctive solid color per
face. Not needed in the default "2d" (1 panel) mode - see "Panel layout
config" above.

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
