# Standalone (no-browser) operation — plan [ATLAST]

Goal (user requirement): power the cube up without connecting a browser, and
have it still run something — resume the last effect, run a playlist, or
follow a schedule — instead of sitting frozen/blank.

## Why this doesn't already work

Today the ESP32 does zero effect computation. The browser computes every
pixel (Three.js, Canvas, `effects.js`) and streams finished frames over
WebSocket; the ESP32 only receives and displays them. With no browser
connected, there's nothing generating new frames, so the panels just show
whatever the last received frame was (frozen), or the boot-time bring-up
test pattern if nothing has ever connected.

Ruled out during discussion:
- **Multi-ESP32 master/slave** (one controller per face) — never built in
  this repo (checked full git history, nothing there), and doesn't actually
  solve the problem: it only reduces the *pixel count* per chip, not the
  real blocker.
- **Running the existing `effects.js` on the ESP32 itself** (via an embedded
  JS engine like JerryScript/Espruino) — not viable. Most effects depend on
  browser-only APIs that don't exist on a microcontroller under any
  architecture (Three.js, Canvas 2D, `fetch()`, `Image()`, DOM) — weather,
  F1, NASA imagery, art galleries, trivia, word-cascade text, video all fall
  into this category. Even for pure-math effects with no images/network,
  interpreted JS on a 240MHz microcontroller (no JIT, no GPU) is likely too
  slow for smooth full-cube (24,576 px) or even single-face (4,096 px)
  animation.

## The actual plan

Single ESP32-S3 (no new hardware), firmware additions only:

1. **A small set of effects written natively in C++** directly in firmware
   — not ported from `effects.js`, new equivalent logic using the same
   drawing primitives already proven in the boot-time bring-up test pattern
   (`drawBringupTestPattern` in `main.cpp`: `fillRect`, `fillCircle`,
   `drawLine`, `setCursor`/`print` for text — the display object is
   GFX-based). Candidates: rainbow wash, color breathing/pulse, a simple
   plasma-style pattern, an on-device clock/date text display.
2. **Persisted last-effect/mode** in flash (NVS/Preferences) — written
   whenever the active mode changes, read back on boot so a power cycle
   resumes instead of going blank.
3. **A native playlist** cycling through the standalone effects on a timer,
   entirely in firmware.
4. **On-device schedule/alarm support** — configured via the web app (that
   part still needs a browser, but only while editing), pushed to and
   persisted on the ESP32. Firmware syncs real time via NTP over WiFi and
   checks the saved schedule itself, switching native effects/modes with no
   browser involved at evaluation time.
5. **Priority/fallback logic**: if a browser is actively connected and
   streaming (recent frame within the last few seconds), that takes full
   priority — today's complete experience, all 50+ effects, unchanged. If no
   frames have arrived for some timeout (disconnected, or never connected
   this boot), the ESP32 automatically falls back to its own
   playlist/schedule/last-effect. Automatic, no manual mode switch.

## Explicit scope / trade-off

Only the small native-C++ effect set can run standalone. Effects needing
network fetch, image decode, or Canvas rendering (weather, F1, NASA
effects, Art Gallery/Unsplash, Jokes/Trivia/On This Day, video display)
remain browser-only — this is a hard constraint from what those effects
fundamentally need, not something to code around.

## Status: implemented

`firmware/src/standalone.h` (new) + changes to `main.cpp`, `web_server.h`,
`config.h`.

- **Native effects**: rainbow wash, breathing pulse, plasma, on-device
  clock/date, and **weather** (fetches Open-Meteo directly from the ESP32
  via `HTTPClient`/`WiFiClientSecure` — same technique as the F1 data fetch
  — renders a sky gradient + sun/moon disc + temperature/condition text, no
  images, no Canvas, all native GFX drawing calls).
- **Priority/fallback**: `main.cpp`'s `displayTask` checks
  `g_lastFrameMs`/`g_everStreamed` (set by `web_server.h`'s WS handler on
  every real `PKT_VIDEO` frame). No frame in `STANDALONE_FALLBACK_MS` (or
  none ever) → renders `standaloneRender()` instead of the browser buffer.
  A browser reconnecting and streaming again takes over immediately, no
  restart needed.
- **Persistence**: last effect + schedule saved to NVS via `Preferences`
  (namespace `"standalone"`), reloaded on boot.
- **Schedule/alarms**: up to `STANDALONE_MAX_SCHEDULE` (8) entries, each
  `{hour, minute, effectId, enabled}`, checked every ~20s in `loop()`
  against NTP time (`STANDALONE_TZ_OFFSET_MIN` applied on top of UTC) and
  fires at most once per calendar minute.
- **Config knobs** (`config.h`): `STANDALONE_WX_LAT`/`_LON` (defaults to
  London — change to your actual coordinates), `STANDALONE_TZ_OFFSET_MIN`
  (defaults to 0/UTC, no DST handling), `STANDALONE_WX_INTERVAL_MIN` (15),
  `STANDALONE_FALLBACK_MS` (5000).

### Known gap — no browser UI yet

Schedule/effect selection is only configurable via raw HTTP API calls
(`GET /api/standalone/status`, `POST /api/standalone/effect`,
`POST /api/standalone/schedule` — see comments above those routes in
`web_server.h` for curl examples), not through the web app's sidebar. That's
a separate, real follow-up task (new `ui.js`/`index.html` section) — not
done here.

### Not attempted (per the earlier discussion, genuinely not viable)

- Full alarm feature set from the browser (pre-alarm brightening curve,
  wind-down dimming) — only "switch to effect X at time Y" is implemented.
  Use `SA_OFF` as a schedule target for a basic "blank at night" behavior.
- Any image-based effect (NASA imagery, Art Gallery, Unsplash) or the full
  effects.js library — still browser-only, unchanged.

### Compile-test caveat

This was written and reviewed carefully (brace/paren balance checked,
patterns cross-checked against already-working code in this same
codebase — e.g. the F1 POST handlers' body-callback signature, the
bring-up test pattern's GFX calls) but **not actually compiled** — this
session's sandbox has no PlatformIO toolchain. First real build on real
hardware is the actual test. `g_standaloneEffect` and friends are declared
as file-scope `inline` variables (C++17) in `standalone.h` so they're safe
to include from both `main.cpp` and `web_server.h` without a linker
"multiple definition" error — if that error shows up anyway, it means the
project's toolchain defaults to an older C++ standard than expected, and
the fix is moving those definitions into a `.cpp` file instead.
