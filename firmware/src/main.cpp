// ===========================================================================
// Multidisplay - ESP32-S3 RGB LED Cube firmware
//
//   * WiFiManager provisioning (captive portal on first boot)
//   * HTTP server (port 80): web app from LittleFS, OTA, F1 API
//   * WebSocket server (port 81): video frames + effect sync
//   * 6x HUB75 panels chained as one wide bitmap, driven by a DMA task on core 0
// ===========================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <time.h>
#include <esp_heap_caps.h>   // heap_caps_malloc / MALLOC_CAP_8BIT (internal-RAM buffer fallback)

#include "config.h"
#include "led_matrix.h"
#include "custom_hub75.h"
#include "web_server.h"
#include "wifi_setup.h"
#include "cam/cam_client.h"
#include "standalone.h"

// Set to 1 to bypass the ESP32-HUB75-MatrixPanel-I2S-DMA library entirely
// and drive Face 0 with the raw bit-banged driver in custom_hub75.h instead.
// Diagnostic-only: two structurally different scan-geometry configs fed to
// the library produced byte-identical banding, so this rules the library's
// internal assumptions in/out entirely by controlling every GPIO ourselves.
#define USE_CUSTOM_HUB75_DRIVER 0

// Set to 1 to run the boot-time line-sweep diagnostic (runCloudSwirlTest,
// never returns) instead of the real app. Set to 0 for normal operation:
// display initializes with the current FourScan64Panel/pin config from
// led_matrix.h/config.h, then setup() continues into WiFi provisioning,
// the HTTP/WebSocket servers, and the real displayTask/effects pipeline.
#define RUN_DIAGNOSTIC_TEST 0

// ---------------------------------------------------------------------------
// Shared globals (declared extern in web_server.h)
// ---------------------------------------------------------------------------
uint8_t*        g_frameBuf[NUM_FACES]   = {nullptr};
volatile bool   g_faceDirty[NUM_FACES]  = {false};
portMUX_TYPE    g_frameMux              = portMUX_INITIALIZER_UNLOCKED;
String          g_currentEffect        = "video";
volatile uint8_t g_currentEffectId     = 0;
uint32_t        g_bootMillis           = 0;
// Set by the WS handler whenever a real PKT_VIDEO frame arrives — the
// displayTask uses this to decide whether a browser is actively driving the
// cube, or whether it should fall back to standalone.h's native effects.
volatile uint32_t g_lastFrameMs        = 0;
volatile bool     g_everStreamed       = false;
bool              g_fsMountOk          = false;
bool              g_psramOk            = false;
String            g_psramTestResult    = "not run";

// ---------------------------------------------------------------------------
// Module-local objects
// ---------------------------------------------------------------------------
static AsyncWebServer httpServer(HTTP_PORT);
static AsyncWebServer wsServer(WS_PORT);
static AsyncWebSocket ws("/");
static F1State        f1State;
static MatrixPanel_I2S_DMA* dma_display = nullptr;

// DMA-output (front) buffer, distinct from the WS-receive buffers so a frame
// can be assembled without tearing what is being pushed to the panels.
static uint8_t* g_dmaBuf[NUM_FACES] = {nullptr};

// Connection / display state for the status LED.
enum class AppState : uint8_t { AP_MODE, CONNECTING, RUNNING, OTA };
static volatile AppState g_appState = AppState::CONNECTING;

// ---------------------------------------------------------------------------
// Status LED task (core 1)
// ---------------------------------------------------------------------------
static void statusLedTask(void* arg) {
    pinMode(STATUS_LED_PIN, OUTPUT);
    for (;;) {
        switch (g_appState) {
        case AppState::AP_MODE:      // fast blink 200 ms
            digitalWrite(STATUS_LED_PIN, HIGH); vTaskDelay(pdMS_TO_TICKS(200));
            digitalWrite(STATUS_LED_PIN, LOW);  vTaskDelay(pdMS_TO_TICKS(200));
            break;
        case AppState::CONNECTING:   // slow blink 1 s
            digitalWrite(STATUS_LED_PIN, HIGH); vTaskDelay(pdMS_TO_TICKS(1000));
            digitalWrite(STATUS_LED_PIN, LOW);  vTaskDelay(pdMS_TO_TICKS(1000));
            break;
        case AppState::RUNNING:      // solid on
            digitalWrite(STATUS_LED_PIN, HIGH); vTaskDelay(pdMS_TO_TICKS(250));
            break;
        case AppState::OTA:          // 3 quick blinks then pause
            for (int i = 0; i < 3; i++) {
                digitalWrite(STATUS_LED_PIN, HIGH); vTaskDelay(pdMS_TO_TICKS(80));
                digitalWrite(STATUS_LED_PIN, LOW);  vTaskDelay(pdMS_TO_TICKS(80));
            }
            vTaskDelay(pdMS_TO_TICKS(500));
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// DMA display task (core 0). Copies dirty face buffers into the DMA front
// buffer and pushes them to the panels at ~CUBE_FPS.
// ---------------------------------------------------------------------------
static void displayTask(void* arg) {
    const TickType_t period = pdMS_TO_TICKS(1000 / CUBE_FPS);
    TickType_t lastWake = xTaskGetTickCount();
    const float dt = 1.0f / CUBE_FPS;

    for (;;) {
        if (dma_display) {
            // No browser has ever streamed a frame, or none has arrived
            // recently — render the native standalone content instead of
            // sitting on a stale/blank buffer. See standalone.h.
            bool standalone = !g_everStreamed
                || (millis() - g_lastFrameMs) > STANDALONE_FALLBACK_MS;

            if (standalone) {
                standaloneRender(dma_display, dt);
            } else {
                for (uint8_t face = 0; face < NUM_FACES; face++) {
                    bool dirty = false;
                    // Briefly hold the lock only to snapshot the face buffer.
                    portENTER_CRITICAL(&g_frameMux);
                    if (g_faceDirty[face]) {
                        memcpy(g_dmaBuf[face], g_frameBuf[face], FACE_BYTES);
                        g_faceDirty[face] = false;
                        dirty = true;
                    }
                    portEXIT_CRITICAL(&g_frameMux);

                    if (dirty) {
                        // The 6 panels form one wide logical bitmap; face N
                        // starts at x = N * PANEL_SIZE. drawPixelRGB888 isn't
                        // guaranteed virtual, so (unlike the Adafruit_GFX
                        // shape helpers, which pick up FourScan64Panel/
                        // ScanSplitPanel's drawPixel override automatically)
                        // this fast path must remap explicitly. The
                        // USE_VIRTUAL_MATRIX_PANEL case is critical: without
                        // it, every streamed video frame goes out with raw
                        // logical coordinates against the four-scan physical
                        // DMA layout and lands outside the addressed area -
                        // which is exactly why clicking effects in the
                        // browser changed nothing on the panel even though
                        // the (drawPixel-based, correctly remapped) diagnostic
                        // sweep DID show content.
                        const int xOff = face * PANEL_SIZE;
                        const uint8_t* src = g_dmaBuf[face];
                        for (int y = 0; y < PANEL_SIZE; y++) {
                            for (int x = 0; x < PANEL_SIZE; x++) {
                                const uint8_t* p = src + (y * PANEL_SIZE + x) * 3;
#if USE_VIRTUAL_MATRIX_PANEL
                                int16_t rx, ry;
                                fourScan64Remap(xOff + x, y, rx, ry);
                                dma_display->drawPixelRGB888(rx, ry, p[0], p[1], p[2]);
#elif SCAN_SPLIT_PANEL
                                int16_t rx, ry;
                                scanSplitRemap(xOff + x, y, rx, ry);
                                dma_display->drawPixelRGB888(rx, ry, p[0], p[1], p[2]);
#else
                                dma_display->drawPixelRGB888(
                                    xOff + x, y, p[0], p[1], p[2]);
#endif
                            }
                        }
                    }
                }
                dma_display->flipDMABuffer();
            }
        }
        vTaskDelayUntil(&lastWake, period);
    }
}

// ---------------------------------------------------------------------------
// One-time bring-up test pattern, drawn directly to the DMA buffer before
// WiFi/the web app are even involved. Per face: a double-line ID-colored
// border (edge pixels are the first place off-by-one addressing errors
// show up), three RGB color bars (verifies each data line drives the right
// channel), a filled circle (curvature exposes row/column misaddressing
// immediately — a torn or doubled panel turns this into a broken shape), a
// diagonal accent line, and the face name in text (exercises the font
// renderer and doubles as an identification label). Overwritten
// automatically by the first real frame once the web app starts streaming.
// ---------------------------------------------------------------------------
static void drawBringupTestPattern(MatrixPanel_I2S_DMA* display) {
    // Always exactly 6 - these are the cube's fixed face identities
    // (Front/Back/Right/Left/Top/Bottom), independent of NUM_FACES (the
    // chain length) or TEST_PATTERN_FACES (how many are physically wired
    // right now).
    struct { uint8_t r, g, b; const char* label; } faceInfo[6] = {
        {255, 0,   0,   "FRONT"},   // Face 0
        {0,   255, 0,   "BACK"},    // Face 1
        {0,   0,   255, "RIGHT"},   // Face 2
        {255, 255, 255, "LEFT"},    // Face 3
        {255, 255, 0,   "TOP"},     // Face 4
        {0,   255, 255, "BOTTOM"},  // Face 5
    };

    const uint16_t black = display->color565(0, 0, 0);
    const uint16_t white = display->color565(255, 255, 255);
    const uint16_t red   = display->color565(255, 0, 0);
    const uint16_t green = display->color565(0, 255, 0);
    const uint16_t blue  = display->color565(0, 0, 255);

    const uint8_t drawCount = TEST_PATTERN_FACES < 6 ? TEST_PATTERN_FACES : 6;
    for (uint8_t face = 0; face < drawCount; face++) {
        const int xOff = face * PANEL_SIZE;
        const uint16_t faceColor = display->color565(
            faceInfo[face].r, faceInfo[face].g, faceInfo[face].b);

        display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, black);

        // Double-line border in this face's ID color.
        display->drawRect(xOff,     0, PANEL_SIZE,     PANEL_SIZE,     faceColor);
        display->drawRect(xOff + 2, 2, PANEL_SIZE - 4, PANEL_SIZE - 4, faceColor);

        // RGB color bars.
        display->fillRect(xOff + 6, 6,  PANEL_SIZE - 12, 5, red);
        display->fillRect(xOff + 6, 13, PANEL_SIZE - 12, 5, green);
        display->fillRect(xOff + 6, 20, PANEL_SIZE - 12, 5, blue);

        // Filled circle.
        display->fillCircle(xOff + PANEL_SIZE / 2, 37, 9, faceColor);

        // Diagonal accent, bottom-right corner.
        display->drawLine(xOff + 42, 60, xOff + 60, 42, white);

        // Face name, bottom-left.
        display->setTextColor(white);
        display->setTextSize(1);
        display->setCursor(xOff + 3, 52);
        display->print(faceInfo[face].label);

        Serial.printf("[TEST] Face %u -> %s\n", face, faceInfo[face].label);
    }
    display->flipDMABuffer();
    Serial.println("[TEST] Bring-up pattern drawn: border + RGB bars + circle + diagonal + face-name text per panel.");
}

// ---------------------------------------------------------------------------
// Bare-minimum sanity check: just the word WORKING, big and centered, on
// Face 0. Draws before WiFi is touched, so it's a valid test even if the
// captive-portal AP isn't showing up. Swap the call in setup() back to
// drawBringupTestPattern() once you're past basic bring-up.
// ---------------------------------------------------------------------------
static void drawWorkingText(MatrixPanel_I2S_DMA* display) {
    display->fillRect(0, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    display->setTextColor(display->color565(0, 255, 0));
    // Size 1 (6px/char incl. spacing): "WORKING" is 7 chars = 42px, fits
    // comfortably on a 64px-wide panel. Size 2 would be 84px and overflow.
    display->setTextSize(1);
    display->setCursor(10, 28);
    display->print("WORKING");
    display->flipDMABuffer();
    Serial.println("[TEST] \"WORKING\" drawn on Face 0.");
}

// Draws HH:MM:SS centered within rows 0-7 - the one row-band confirmed to
// actually light on this panel regardless of every scan-geometry/remap
// theory tried. Text size 1 (5x7 glyphs) fits inside 8 rows with a 1px
// margin. Uses Adafruit_GFX's text drawing, which funnels through this
// object's own (possibly overridden) drawPixel - safe here since the
// display object is a plain FourScan64Panel/ScanSplitPanel subclass, not
// the raw bit-bang driver where that was a real concern earlier tonight.
// UK civil time: GMT (UTC+0) in winter, BST (UTC+1) from the last Sunday in
// March 01:00 UTC to the last Sunday in October 01:00 UTC. Computed from the
// UTC epoch directly rather than a fixed offset, since STANDALONE_TZ_OFFSET_MIN
// alone can't express a rule that changes twice a year.
static bool ukIsBst(time_t utcNow) {
    struct tm t;
    gmtime_r(&utcNow, &t);
    int year = t.tm_year + 1900;

    // Days-since-epoch for a UTC calendar date, since the Arduino/ESP32
    // toolchain doesn't provide timegm(). Civil-from-days algorithm
    // (Howard Hinnant's public-domain date algorithms).
    auto daysFromCivil = [](int y, int m, int d) -> long {
        y -= (m <= 2) ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        unsigned yoe = (unsigned)(y - era * 400);
        unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + (long)doe - 719468;
    };

    // Last Sunday of `month` (0-11) at 01:00 UTC, as a time_t.
    auto lastSundayAt1am = [&](int month) -> time_t {
        int daysInMonth[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        if (month == 1 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))) {
            daysInMonth[1] = 29;
        }
        long lastDayEpochDay = daysFromCivil(year, month + 1, daysInMonth[month]);
        // civil epoch day 0 (1970-01-01) was a Thursday (wday 4).
        int wday = (int)(((lastDayEpochDay % 7) + 7 + 4) % 7);
        long sundayEpochDay = lastDayEpochDay - wday;
        return (time_t)sundayEpochDay * 86400 + 3600;   // 01:00 UTC
    };

    time_t bstStart = lastSundayAt1am(2);   // March
    time_t bstEnd   = lastSundayAt1am(9);   // October
    return utcNow >= bstStart && utcNow < bstEnd;
}

static void drawClockOverlay(MatrixPanel_I2S_DMA* display) {
    time_t utcNow = time(nullptr);
    int offsetMin = ukIsBst(utcNow) ? 60 : 0;
    time_t now = utcNow + (time_t)offsetMin * 60;
    struct tm timeinfo;
    gmtime_r(&now, &timeinfo);
    char buf[9];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);

    display->setTextColor(display->color565(255, 255, 0));
    display->setTextSize(1);
    display->setCursor(8, 0);   // "HH:MM:SS" is 8 chars * 6px = 48px, centered in 64 with x=8
    display->print(buf);
}

// Diagnostic sweep: a single green vertical line moving across the display
// one column at a time (left to right), then a single green horizontal line
// moving down one row at a time, looping forever - with the current time
// overlaid in the confirmed-working top band every frame. Pixel writes go
// straight to the display object, which is a FourScan64Panel (see
// USE_VIRTUAL_MATRIX_PANEL in config.h/led_matrix.h) applying the four-scan
// remap itself via its drawPixel override - no separate wrapper needed.
static void runCloudSwirlTest(MatrixPanel_I2S_DMA* display) {
    Serial.println("[TEST] Running vertical/horizontal line sweep (does not return).");
    const uint16_t lineColor = display->color565(0, 255, 0);
    const uint16_t black = display->color565(0, 0, 0);
    for (;;) {
        // Vertical line sweeping left to right, one column at a time. Full
        // clear every frame (not just the previous column) - safer given
        // how unpredictably the remap has behaved, guarantees no stray
        // leftover lit pixels regardless.
        for (uint8_t x = 0; x < PANEL_SIZE; x++) {
            for (uint8_t cy = 0; cy < PANEL_SIZE; cy++) {
                for (uint8_t cx = 0; cx < PANEL_SIZE; cx++) {
                    display->drawPixel(cx, cy, cx == x ? lineColor : black);
                }
            }
            drawClockOverlay(display);
            display->flipDMABuffer();
            delay(80);
        }

        // Horizontal line sweeping top to bottom, one row at a time.
        for (uint8_t y = 0; y < PANEL_SIZE; y++) {
            for (uint8_t cy = 0; cy < PANEL_SIZE; cy++) {
                for (uint8_t cx = 0; cx < PANEL_SIZE; cx++) {
                    display->drawPixel(cx, cy, cy == y ? lineColor : black);
                }
            }
            drawClockOverlay(display);
            display->flipDMABuffer();
            delay(80);
        }
    }
}

// ---------------------------------------------------------------------------
// Actively read/write-test PSRAM to prove it stores and returns data
// correctly - a real memory test, not just psramFound()'s ID-read probe. A
// chip that responds to identify but corrupts data would pass psramFound()
// yet still break everything downstream; this catches that. Allocates a 64KB
// scratch block, writes a mix of patterns (walking bits, address-derived
// values, 0x00/0xFF), reads them back, and reports the first mismatch.
// Returns a human-readable summary string for /api/psramtest.
// ---------------------------------------------------------------------------
static String testPsram() {
    if (!psramFound()) return "FAIL: PSRAM not detected (psramFound() false)";

    const size_t TEST_BYTES = 64 * 1024;
    uint32_t* buf = (uint32_t*)ps_malloc(TEST_BYTES);
    if (!buf) return "FAIL: ps_malloc(64KB) returned null";

    const size_t words = TEST_BYTES / sizeof(uint32_t);
    size_t errors = 0;
    size_t firstBadIndex = 0;
    uint32_t firstExpected = 0, firstGot = 0;

    // Pattern derived from the index so every word is distinct - catches
    // stuck address lines and word-to-word bleed, not just stuck data bits.
    for (size_t i = 0; i < words; i++) {
        buf[i] = (uint32_t)(i * 2654435761u) ^ 0xA5A5A5A5u;
    }
    for (size_t i = 0; i < words; i++) {
        uint32_t expected = (uint32_t)(i * 2654435761u) ^ 0xA5A5A5A5u;
        if (buf[i] != expected) {
            if (errors == 0) {
                firstBadIndex = i; firstExpected = expected; firstGot = buf[i];
            }
            errors++;
        }
    }

    free(buf);

    if (errors == 0) {
        char msg[96];
        snprintf(msg, sizeof(msg), "PASS: %u KB tested, 0 errors (total PSRAM %u bytes)",
                 (unsigned)(TEST_BYTES / 1024), (unsigned)ESP.getPsramSize());
        return String(msg);
    }
    char msg[160];
    snprintf(msg, sizeof(msg),
             "FAIL: %u/%u words bad; first at index %u expected 0x%08X got 0x%08X",
             (unsigned)errors, (unsigned)words, (unsigned)firstBadIndex,
             firstExpected, firstGot);
    return String(msg);
}

// ---------------------------------------------------------------------------
// Allocate per-face frame buffers in PSRAM.
// ---------------------------------------------------------------------------
// Allocate one buffer, preferring PSRAM but falling back to internal SRAM
// when PSRAM is unavailable (this board's PSRAM has been failing to
// enumerate). At FACE_BYTES = 64*64*3 = 12KB each, a single wired panel
// needs just 2 buffers = 24KB, which fits comfortably in the ESP32-S3's
// 320KB internal RAM - so a dead PSRAM chip should NOT block a 1-panel
// bring-up. For the full 6-face cube (144KB of buffers) this fallback still
// works but leaves less headroom for the WiFi/TLS stacks, which is exactly
// why PSRAM was preferred originally.
static uint8_t* allocBuffer() {
    uint8_t* p = nullptr;
    if (psramFound()) {
        p = (uint8_t*)ps_malloc(FACE_BYTES);
    }
    if (!p) {
        // Internal RAM fallback (heap_caps 8-bit-accessible, i.e. normal
        // DRAM). Also covers the ps_malloc-returned-null case even when
        // psramFound() lied.
        p = (uint8_t*)heap_caps_malloc(FACE_BYTES, MALLOC_CAP_8BIT);
    }
    return p;
}

static bool allocBuffers() {
    bool usedInternalFallback = false;
    for (uint8_t i = 0; i < NUM_FACES; i++) {
        g_frameBuf[i] = allocBuffer();
        g_dmaBuf[i]   = allocBuffer();
        if (!g_frameBuf[i] || !g_dmaBuf[i]) {
            Serial.printf("[MEM] buffer alloc failed for face %u (PSRAM + internal both exhausted)\n", i);
            return false;
        }
        if (!psramFound()) usedInternalFallback = true;
        memset(g_frameBuf[i], 0, FACE_BYTES);
        memset(g_dmaBuf[i],   0, FACE_BYTES);
    }
    Serial.printf("[MEM] frame buffers allocated in %s (%u faces x 2 x %u bytes). Free internal heap: %u\n",
                  usedInternalFallback ? "INTERNAL SRAM (PSRAM unavailable)" : "PSRAM",
                  NUM_FACES, (unsigned)FACE_BYTES, ESP.getFreeHeap());
    return true;
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    // Native USB-CDC (this board's "USB-Serial/JTAG" mode) drops any output
    // written before the host's monitor reconnects after reset - typically
    // 1-2s. Without this, every setup()-time Serial.println up through FS
    // mount/display init gets silently lost even with upload+monitor
    // combined, which is why boot logs kept starting mid-way through HUB75
    // init instead of at "[Boot] ...".
    delay(2000);
    g_bootMillis = millis();
    Serial.println("\n[Boot] Multidisplay cube starting...");

    // Status LED indicator task.
    xTaskCreatePinnedToCore(statusLedTask, "statusLed", 2048, nullptr, 1, nullptr, 1);

    // PSRAM frame buffers. The automatic psramInit() that runs before
    // setup() (as part of the Arduino/ESP-IDF startup sequence) has been
    // failing intermittently on this board - succeeding on some boots,
    // failing on others, with byte-identical hardware/config each time.
    // That pattern means a single retry right here, moments later, has a
    // real chance of catching a good attempt instead of accepting the
    // one-shot automatic result. psramInit()/psramFound() are plain
    // callable functions, not locked to firing once.
    if (!psramFound()) {
        Serial.println("[MEM] WARNING: PSRAM not found on first (automatic) init - retrying...");
        for (int attempt = 1; attempt <= 10 && !psramFound(); attempt++) {
            delay(200);
            psramInit();
            Serial.printf("[MEM] psramInit() retry %d: %s\n",
                          attempt, psramFound() ? "SUCCESS" : "still failed");
        }
    }
    g_psramOk = psramFound();
    if (!g_psramOk) {
        Serial.println("[MEM] WARNING: PSRAM not found after retries!");
    } else {
        Serial.printf("[MEM] PSRAM found: %u bytes\n", ESP.getPsramSize());
    }

    if (!allocBuffers()) {
        Serial.println("[MEM] FATAL: could not allocate frame buffers");
    }

    // Read/write verification, not just the ID-read check above - proves the
    // chip actually stores and returns data correctly, not merely that it
    // responded to an identify query. Runs once at boot; result exposed via
    // /api/psramtest (web_server.h) so it's checkable from the browser
    // without depending on catching serial output at the right moment.
    g_psramTestResult = testPsram();

    // Filesystem. formatOnFail=false, deliberately, for diagnosis: with it
    // true, a mount that rejects the just-uploaded image (e.g. a mklittlefs
    // image-format/version mismatch) silently reformats to a valid-but-empty
    // filesystem - which is indistinguishable from "uploadfs worked but wrote
    // nothing" purely from /api/fsinfo (both show used_bytes:8192,
    // files:[]). g_fsMountOk below (exposed via /api/fsinfo) tells them apart.
    g_fsMountOk = LittleFS.begin(false);
    if (!g_fsMountOk) {
        Serial.println("[FS] LittleFS mount failed (formatOnFail disabled for diagnosis)");
    } else {
        Serial.printf("[FS] LittleFS mounted, %u / %u bytes used\n",
                      LittleFS.usedBytes(), LittleFS.totalBytes());
    }

#if USE_CUSTOM_HUB75_DRIVER
    // Bypass the library entirely - see USE_CUSTOM_HUB75_DRIVER above.
    // "ABC shift + DE direct" addressing theory - deep blue fill, testing
    // whether the extra address wire behaves as an independent direct-select
    // line rather than another bit in one sequential binary counter.
    customHub75Init();
    customHub75ABCShiftDEDirectTest(false, false, true);   // never returns
#else
    // HUB75 display.
    dma_display = initDisplay();
    if (!dma_display) {
        Serial.println("[LED] display init FAILED");
    } else {
        Serial.println("[LED] display initialized");

#if RUN_DIAGNOSTIC_TEST
        // Quick, bounded-time WiFi attempt for the clock overlay - NOT
        // connectWifi()/WiFiManager, which can block indefinitely waiting
        // for someone to configure WiFi through its captive portal if none
        // is saved. That would mean the diagnostic display never even
        // starts. Explicit credentials passed directly (STANDALONE_WIFI_SSID
        // /_PASS in config.h) rather than relying on WiFiManager's saved
        // creds, which may not exist on this board yet; either way this
        // gives up after 15s and moves on regardless.
        Serial.println("[LED] Trying WiFi for the clock overlay (15s max, non-blocking to the display test)...");
        WiFi.mode(WIFI_STA);
        WiFi.begin(STANDALONE_WIFI_SSID, STANDALONE_WIFI_PASS);
        unsigned long wifiWaitStart = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - wifiWaitStart < 15000) {
            delay(200);
        }
        if (WiFi.status() == WL_CONNECTED) {
            standaloneNtpInit();
            Serial.println("[LED] WiFi connected, NTP sync requested for clock overlay.");
        } else {
            Serial.println("[LED] No WiFi within 10s - starting display test anyway, clock will show 00:00:00 until/unless it syncs.");
        }

        // Cloud-swirl RGB diagnostic — never returns. Swap back to
        // drawWorkingText(dma_display) or drawBringupTestPattern(dma_display)
        // once the split/duplicate-image wiring issue is resolved.
        runCloudSwirlTest(dma_display);
#endif
    }
#endif

    // WiFi provisioning.
    g_appState = AppState::AP_MODE;   // portal may open during connectWifi()
    if (!connectWifi()) {
        Serial.println("[WiFi] no connection - restarting");
        delay(2000);
        ESP.restart();
    }
    g_appState = AppState::RUNNING;

    // mDNS.
    if (MDNS.begin(MDNS_NAME)) {
        MDNS.addService("http", "tcp", HTTP_PORT);
        MDNS.addService("ws",   "tcp", WS_PORT);
        Serial.printf("[mDNS] http://%s.local\n", MDNS_NAME);
    }

    // OTA status-LED hooks via WebSocket clients are handled elsewhere; here we
    // just register the OTA-aware servers.
    Update.onProgress([](size_t, size_t) { g_appState = AppState::OTA; });

    // Camera client (disabled by default; URL configured via web UI).
    {
        CamConfig camCfg;
        strncpy(camCfg.snapUrl, "", sizeof(camCfg.snapUrl));
        camCfg.intervalMs = 100; // 10fps default
        camCfg.enabled = false;
        camInit(camCfg);
    }

    // Web + WebSocket servers - started right after WiFi/mDNS, BEFORE the
    // blocking standalone-mode network calls below. standaloneWxFetch() is a
    // blocking HTTPS request that can take many seconds (or hang/retry on a
    // slow or failing weather API); with the servers starting only after it,
    // the browser/app got "connection refused" for that entire window even
    // though ping/mDNS already worked (neither depends on these servers).
    initWebServer(httpServer, ws, f1State);
    httpServer.begin();

    // The WebSocket lives on its own port (81). Reuse the same handler.
    wsServer.addHandler(&ws);
    wsServer.begin();

    Serial.printf("[HTTP] serving on :%d   [WS] on :%d\n", HTTP_PORT, WS_PORT);

    // Standalone mode: load persisted last-effect + schedule, sync NTP time,
    // and fetch weather once now so it's not blank for the first 15 minutes
    // after boot. All three need WiFi, so this runs after connectWifi()
    // succeeds - now after the web/WS servers are already listening.
    standaloneLoad();
    standaloneNtpInit();
    standaloneWxFetch();

    // Display task pinned to core 0 (WiFi/async stack runs on core 1/0 too,
    // but DMA pushing is isolated here for steady framerate).
    xTaskCreatePinnedToCore(displayTask, "display", 4096, nullptr, 2, nullptr, 0);
}

// ---------------------------------------------------------------------------
// loop()
// ---------------------------------------------------------------------------
void loop() {
    // Reconnect handling: if WiFi drops, fall back to connecting state and try
    // to recover; AsyncWebServer + tasks keep running.
    static uint32_t lastCheck = 0;
    if (millis() - lastCheck > 5000) {
        lastCheck = millis();
        if (WiFi.status() != WL_CONNECTED) {
            g_appState = AppState::CONNECTING;
            WiFi.reconnect();
        } else if (g_appState == AppState::CONNECTING) {
            g_appState = AppState::RUNNING;
        }
    }

    // Clean up dead WebSocket clients periodically.
    ws.cleanupClients();

    // Standalone mode: schedule/alarm check (cheap, every ~20s) and weather
    // refresh (network fetch, every STANDALONE_WX_INTERVAL_MIN minutes).
    // Both run here on core 1, never on the DMA task, so a slow/failed
    // HTTPS request can't stall the display.
    static uint32_t lastSchedCheck = 0;
    static uint32_t lastWxFetch    = 0;
    if (millis() - lastSchedCheck > 20000) {
        lastSchedCheck = millis();
        standaloneCheckSchedule();
    }
    if (millis() - lastWxFetch > (uint32_t)STANDALONE_WX_INTERVAL_MIN * 60000UL) {
        lastWxFetch = millis();
        standaloneWxFetch();
    }

    delay(20);
}
