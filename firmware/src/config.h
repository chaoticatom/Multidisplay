#pragma once

// ---------------------------------------------------------------------------
// Multidisplay RGB LED Cube - compile-time configuration
// ---------------------------------------------------------------------------

#define PANEL_SIZE     64    // pixels per side (8, 16, or 64)
#define NUM_FACES      6

// Bump this on any firmware change - shown as an overlay on the boot-time
// test screen (runCloudSwirlTest in main.cpp) so it's visible at a glance
// which build is actually running on the board. Kept short deliberately:
// at Adafruit GFX text size 1 (~6px/char), anything past ~10 characters
// starting at x=2 overflows the 64px face width onto the next face.
#define FW_VERSION     "0725-1"

// How many faces the boot-time bring-up test pattern (main.cpp,
// drawBringupTestPattern) actually draws to. Keep this at the number of
// panels you currently have physically wired — set to 1 while bringing up
// just Face 0, bump it up as you add panels, no need to touch anything
// else. Face 0 always displays correctly regardless of this value (the
// chain doesn't need to be "complete" for the first panel to work), this
// just controls how much test content is generated/logged.
#define TEST_PATTERN_FACES 1
#define WS_PORT        81
#define HTTP_PORT      80
#define AP_SSID        "Multidisplay-Setup"
#define AP_PASSWORD    "cube1234"
#define MDNS_NAME      "multidisplay"
#define CUBE_FPS       20

// Size in bytes of one face frame buffer (RGB888)
#define FACE_BYTES     (PANEL_SIZE * PANEL_SIZE * 3)

// ---- Packet types (WebSocket binary protocol) ----
#define PKT_CMD        1
#define PKT_VIDEO      2

// ---- Command bytes (PKT_CMD payload) ----
#define CMD_SET_EFFECT 0x01

// ---------------------------------------------------------------------------
// HUB75 pin assignments for ESP32-S3
// ---------------------------------------------------------------------------
#define HUB75_R1  42
#define HUB75_G1  41
#define HUB75_B1  40
#define HUB75_R2  39
#define HUB75_G2  38
#define HUB75_B2  37
#define HUB75_A   36
#define HUB75_B   35
#define HUB75_C   45
// GPIO 47 is confirmed by continuity check to reach the panel's real 4th
// address wire - silkscreened "E" on the connector, since this is the
// HUB75E standard (R1,G1,B1,GND,R2,G2,B2,E,A,B,C,NC,CLK,LAT,OE,GND - pin 8
// carries a real signal, pin 12/D is NC on every one of 3 panels tested).
//
// Which library PARAMETER (D vs E) that GPIO should be assigned to depends
// on HUB75_MOD_HEIGHT, not on what the panel's silkscreen calls it: at
// MOD_HEIGHT<=32 the library only ever reads A/B/C/D (a 32-tall module
// needs just a 4-bit/16-combination address) and never touches E no matter
// what it's wired to; at MOD_HEIGHT=64 it's a genuine 5-bit/32-combination
// address and E is real. Github mrcodetastic/ESP32-HUB75-MatrixPanel-DMA
// issue #9 confirms this exact scenario: a P2.5 64x64 panel (same family as
// ours) working via "Line E" with MATRIX_HEIGHT set to a genuine 64 - a
// native config we hadn't actually tried (every attempt tonight used
// MOD_HEIGHT 32 via either the virtual-panel/four-scan hack or
// TEST_PLAIN_64X32). So the pin assignment now follows HUB75_MOD_HEIGHT
// below instead of being hardcoded here.
#define HUB75_LAT 21
#define HUB75_OE  14
#define HUB75_CLK 13

// Scan-split panel geometry (see led_matrix.h ScanSplitPanel/scanSplitRemap).
// Each physical PANEL_SIZE x PANEL_SIZE face is really SCAN_SPLIT separate
// PANEL_SIZE x (PANEL_SIZE/SCAN_SPLIT) strips the panel's own shift
// registers cascade like SCAN_SPLIT chained modules — so the DMA library
// needs SCAN_SPLIT x the chain length and 1/SCAN_SPLIT the module height to
// address it correctly, and every pixel write needs remapping from "face f,
// full 0..PANEL_SIZE-1 y" logical space into that expanded-chain physical
// space.
//   SCAN_SPLIT 2 = half-scan  (32-tall strips, needs A-D). Tried with
//                  sequential strip order before - banding unchanged. BUT:
//                  this is exactly the geometry a real, documented SM5166PS-
//                  family fix (GitHub mrfaptastic/ESP32-HUB75-MatrixPanel-
//                  I2S-DMA issue #154, "lines doubled in an array of 8")
//                  needed - and that fix specifically required a NON-
//                  sequential chaining order ("the 2nd 1/4th being chained
//                  to the first (top) 1/4th"), not the simple sequential
//                  order tried before. That's what SCAN_SPLIT_REVERSE tests.
//   SCAN_SPLIT 4 = quarter-scan (16-tall strips, needs only A-C) - tried,
//                  ruled out (same banding). Also being swept independently
//                  in firmware/hub75_full_diagnostic.
// NEW theory, worth testing before anything else: what if this panel is
// simply, genuinely a 64x32 display (a plain single 1/16-scan module, no
// chaining/splitting trickery at all) - not a 64x64 panel with a scan
// quirk? Observed support for this: rendering full 64x64 content and
// compressing/remapping always left exactly half the rows dark regardless
// of which half/config, and the swirl's actual VISIBLE content only ever
// occupied what looks like a genuine 32-row-tall image if the dark rows
// are removed - consistent with 32 rows being the real, total addressable
// height, not a fault hiding within a genuine 64-tall panel.
// TEST_PLAIN_64X32: module height 32, chain length 1 - a true standalone
// module, no SCAN_SPLIT chaining math applied at all. Currently disabled -
// see USE_VIRTUAL_MATRIX_PANEL below, which needs a plain full 64-tall base
// module underneath its own remap layer instead.
// Ruled out tonight: bad unit (3 panels band identically), dead/miswired
// address line (GPIO 47 confirmed by continuity to reach the panel's real
// address pin), the library's own FOUR_SCAN_64PX_HIGH remap bug (bug-fixed
// version made no difference), and TEST_PLAIN_64X32 itself (identical
// banding - see TEST_NATIVE_64 below, tried next).
#define TEST_PLAIN_64X32      0

// NEXT theory (see GitHub mrcodetastic/ESP32-HUB75-MatrixPanel-DMA issue #9
// - a P2.5 64x64 panel, same family as ours, working via a genuine native
// MOD_HEIGHT=64 config using "Line E" as a real address bit): every
// scan-geometry attempt so far used MOD_HEIGHT<=32 (virtual-panel/
// four-scan split, or TEST_PLAIN_64X32's plain 32-tall module), where the
// library never reads E regardless of wiring. This is the one combination
// not yet tried - a true 64-tall single module, no splitting/chaining
// trickery, with E genuinely driven.
#define TEST_NATIVE_64         1

// Use the library's own built-in VirtualMatrixPanel class with
// setPhysicalPanelScanRate(FOUR_SCAN_64PX_HIGH) - a REAL feature, read
// directly from the actual installed library source (not a summary/guess):
// specifically built for 64px-tall panels that need four rows updated in
// parallel instead of the standard two - exactly the "four-scan" theory
// suspected all night. Its own source comment says the underlying DMA
// buffer must be set up "as if the panel is 2 * W and 0.5 * H" - i.e. the
// base display below needs module height 32 / chain length 2 (matching our
// earlier "half-scan"/SCAN_SPLIT=2 geometry), NOT a plain full 64-tall
// module. See led_matrix.h. Disabled while TEST_NATIVE_64/TEST_PLAIN_64X32
// take priority below regardless of this flag, but led_matrix.h's
// initDisplay() also branches on this directly, so it has to be 0 to avoid
// constructing the wrong display class.
#define USE_VIRTUAL_MATRIX_PANEL 0

#if TEST_NATIVE_64
// CONFIRMED WORKING: the connector's "GND" pin between B and LAT (paired
// with C, same column - exactly where a 4th address line belongs) was
// never actually ground. A continuity check found no connection to the
// panel's true ground plane, so that ribbon conductor was rewired from
// ground onto GPIO 11 instead - and a full 5-bit address sweep (A,B,C,D,E
// all real) confirmed every row 0-31 is now reachable with no more 8-row
// gaps. Both address lines are real on this panel; the "D is NC" belief
// earlier tonight was wrong - it's mislabeled, not absent. This is the
// resolution to the whole banding investigation.
#define SCAN_SPLIT_PANEL      0
#define SCAN_SPLIT            1   // unused, see comment above
#define HUB75_MOD_HEIGHT      PANEL_SIZE   // genuine 64, no splitting
#define HUB75_CHAIN_LEN       NUM_FACES
#define HUB75_D               11   // real - rewired off the mislabeled GND pin (see above)
#define HUB75_E               47   // real address bit at MOD_HEIGHT=64 - see issue #9 above
#elif TEST_PLAIN_64X32
#define SCAN_SPLIT_PANEL      0
#define SCAN_SPLIT            1   // unused (SCAN_SPLIT_PANEL=0 means scanSplitRemap is never called), but the function still needs it defined to compile
#define HUB75_MOD_HEIGHT      32
#define HUB75_CHAIN_LEN       1
#define HUB75_D               47   // only A-D read at this height, see comment above
#define HUB75_E               -1
#elif USE_VIRTUAL_MATRIX_PANEL
#define SCAN_SPLIT_PANEL      0
#define SCAN_SPLIT            1   // unused, see comment above
#define HUB75_MOD_HEIGHT      (PANEL_SIZE / 2)
#define HUB75_CHAIN_LEN       (NUM_FACES * 2)
#define HUB75_D               47
#define HUB75_E               -1
#else
#define SCAN_SPLIT_PANEL      1
#define SCAN_SPLIT            2
#define HUB75_MOD_HEIGHT      (PANEL_SIZE / SCAN_SPLIT)
#define HUB75_CHAIN_LEN       (NUM_FACES * SCAN_SPLIT)
#define HUB75_D               47
#define HUB75_E               -1
#endif

// The one extra address wire physically confirmed present on this panel's
// connector (GPIO 47) - always this GPIO regardless of which of HUB75_D/
// HUB75_E it's currently assigned to above (that assignment only matters
// for the library's own address-bit-weight assumptions; custom_hub75.h's
// raw bit-bang driver bypasses the library and its assumptions entirely,
// so it uses this fixed alias instead of caring about D-vs-E naming).
#define HUB75_EXTRA_ADDR      47

// The real 4th address wire (D), physically confirmed present on this
// panel's connector at "wire 12" - paired in the same column as C, right
// where a real address line belongs. It's silkscreened NC/GND on every
// panel tested, but a continuity check confirmed it does NOT actually tie
// to the panel's true ground plane - meaning the "GND" label was wrong, and
// the panel's driver chip likely still has a real trace to this pin
// internally. Rewired: this ribbon conductor now goes to GPIO 11 instead
// of ground. Fixed alias, same reasoning as HUB75_EXTRA_ADDR above - the
// raw bit-bang driver bypasses the library entirely, so it names this pin
// directly rather than through the library-facing HUB75_D define.
#define HUB75_REAL_D          11

// Reversed strip chaining order - see the SCAN_SPLIT=2 comment above. This
// is the specific untested combination: half-scan geometry + non-sequential
// chain order, matching the real documented community fix as closely as
// possible from a published description (not the exact source, which
// wasn't fetchable - GitHub raw-content access is blocked in this
// environment).
#define SCAN_SPLIT_REVERSE 1

// Status LED (built-in on most ESP32-S3 devkits)
#define STATUS_LED_PIN 2

// ---------------------------------------------------------------------------
// Standalone mode — runs natively on the ESP32 with no browser connected.
// See docs/STANDALONE_MODE_PLAN.md for the full design.
// ---------------------------------------------------------------------------

// If no browser has streamed a video frame for this long (ms), the ESP32
// takes over and renders its own effects/weather/schedule instead of
// sitting on the last received (now stale) frame. Raised from 5000: when
// streaming is bandwidth-limited (6 faces x 20fps ~= 1.5MB/s over WiFi to a
// heap-constrained board), frames arrive in bursts with multi-second gaps,
// and a 5s window snapped the display back to the ESP32's own default
// animation mid-stream ("flickers then reverts to default"). A longer
// window keeps the last streamed frame showing across those gaps so the
// browser stays visibly in control; it only falls back if the browser
// genuinely stops or disconnects.
#define STANDALONE_FALLBACK_MS      20000

// WiFi credentials used by the boot-time diagnostic test's bounded-time
// connect attempt (see main.cpp setup()) so it doesn't depend on
// WiFiManager's saved creds being present on this board.
#define STANDALONE_WIFI_SSID       "NoChance"
#define STANDALONE_WIFI_PASS       "vampire22"

// Weather location — set this to your actual coordinates. Defaults to
// London. Open-Meteo doesn't need an API key, just lat/lon.
#define STANDALONE_WX_LAT           51.5074
#define STANDALONE_WX_LON           -0.1278

// Your UTC offset in minutes (e.g. UTC+1 = 60, UTC-5 = -300). Used for the
// on-device clock display and for matching schedule/alarm times against
// NTP time, which arrives in UTC. Does not handle DST automatically —
// update it yourself if your region observes daylight saving.
#define STANDALONE_TZ_OFFSET_MIN    0

// How often to re-fetch weather from Open-Meteo, in minutes.
#define STANDALONE_WX_INTERVAL_MIN  15

// Max schedule/alarm entries persisted in flash.
#define STANDALONE_MAX_SCHEDULE     8
