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
#define FW_VERSION     "0717-1"

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
// This panel's IDC connector only exposes A/B/C/E for row addressing (no D
// pin exists anywhere on the board — confirmed against the physical
// connector legend and a close inspection of the rest of the PCB for any
// secondary breakout).
//
// CONFIRMED: this panel is a half-scan design (physically two 64x32 halves
// driven as if chained side-by-side), not a true 64-row/1/32-scan panel.
// That fully explains both the missing-D-pin connector layout AND the
// persistent "8 rows on, 8 rows off" banding — a half-scan panel only ever
// needs 4 address lines (A-D, 16 row-pairs per 32-tall half), never a 5th
// (E/weight-16) line at all. The wire earlier found in the connector's "E"
// slot is this panel's real 4th (D) address line; it was reassigned here
// instead of a genuine 5-bit "D" bug fix. E is correctly left disabled.
// See HALF_SCAN_PANEL in led_matrix.h for the DMA-geometry side of this —
// the address lines alone were never the whole story; the library also
// needs to be told the true module height/chain length so its virtual
// pixel layout matches how this panel's shift registers actually cascade.
#define HUB75_D   47
#define HUB75_E   -1
#define HUB75_LAT 21
#define HUB75_OE  14
#define HUB75_CLK 13

// Half-scan panel geometry (see led_matrix.h HalfScanPanel/halfScanRemap).
// Each physical PANEL_SIZE x PANEL_SIZE face is really two PANEL_SIZE x
// (PANEL_SIZE/2) halves the panel's own shift registers cascade like two
// chained modules — so the DMA library needs double the chain length and
// half the module height to address it correctly, and every pixel write
// needs remapping from "face f, full 0..PANEL_SIZE-1 y" logical space into
// that doubled-chain physical space.
#define HALF_SCAN_PANEL      1
#define HUB75_MOD_HEIGHT     (PANEL_SIZE / 2)
#define HUB75_CHAIN_LEN      (NUM_FACES * 2)
// If the image comes out with top/bottom swapped or mirrored within each
// face once this is wired up, flip this to try the other half ordering —
// which physical half a panel's internal cascade calls "first" isn't
// something we can know without seeing actual output.
#define HALF_SCAN_SWAP_HALVES 0

// Status LED (built-in on most ESP32-S3 devkits)
#define STATUS_LED_PIN 2

// ---------------------------------------------------------------------------
// Standalone mode — runs natively on the ESP32 with no browser connected.
// See docs/STANDALONE_MODE_PLAN.md for the full design.
// ---------------------------------------------------------------------------

// If no browser has streamed a video frame for this long (ms), the ESP32
// takes over and renders its own effects/weather/schedule instead of
// sitting on the last received (now stale) frame.
#define STANDALONE_FALLBACK_MS      5000

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
