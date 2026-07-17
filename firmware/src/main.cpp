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

#include "config.h"
#include "led_matrix.h"
#include "web_server.h"
#include "wifi_setup.h"
#include "cam/cam_client.h"
#include "standalone.h"

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
                        // shape helpers used elsewhere) this fast path can't
                        // rely on HalfScanPanel's override - remap explicitly.
                        const int xOff = face * PANEL_SIZE;
                        const uint8_t* src = g_dmaBuf[face];
                        for (int y = 0; y < PANEL_SIZE; y++) {
                            for (int x = 0; x < PANEL_SIZE; x++) {
                                const uint8_t* p = src + (y * PANEL_SIZE + x) * 3;
#if HALF_SCAN_PANEL
                                int16_t rx, ry;
                                halfScanRemap(xOff + x, y, rx, ry);
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

// Tiny hand-plotted 3x5 bitmap font (just the letters needed for "HELLO"),
// drawn entirely via drawPixel() - deliberately NOT Adafruit_GFX text/
// print(), since that didn't show up on real hardware even though drawPixel
// calls (the cloud-swirl test this replaces) rendered fine. Each row is the
// 3 columns packed into the low 3 bits, MSB = leftmost column.
static const uint8_t FONT_H[5] = {0b101, 0b101, 0b111, 0b101, 0b101};
static const uint8_t FONT_E[5] = {0b111, 0b100, 0b110, 0b100, 0b111};
static const uint8_t FONT_L[5] = {0b100, 0b100, 0b100, 0b100, 0b111};
static const uint8_t FONT_O[5] = {0b111, 0b101, 0b101, 0b101, 0b111};

static void drawGlyph(MatrixPanel_I2S_DMA* display, const uint8_t* glyph,
                       int x0, int y0, int scale, uint16_t color) {
    for (int row = 0; row < 5; row++) {
        for (int col = 0; col < 3; col++) {
            if (!(glyph[row] & (0b100 >> col))) continue;
            for (int sy = 0; sy < scale; sy++) {
                for (int sx = 0; sx < scale; sx++) {
                    display->drawPixel(x0 + col * scale + sx, y0 + row * scale + sy, color);
                }
            }
        }
    }
}

// Boot-time diagnostic: plain black background with "HELLO" plotted via the
// hand-rolled font above, so it's obvious at a glance the board is running
// and drawPixel() is reaching the panel - no swirl, no Adafruit_GFX text.
static void runCloudSwirlTest(MatrixPanel_I2S_DMA* display) {
    Serial.println("[TEST] Showing HELLO marker on Face 0 (does not return).");
    const uint16_t white = display->color565(255, 255, 255);
    const uint16_t black = display->color565(0, 0, 0);
    const uint8_t* letters[5] = {FONT_H, FONT_E, FONT_L, FONT_L, FONT_O};
    // Biggest integer scale that still fits "HELLO" (5 letters x 3 cols +
    // 4 one-column gaps = 19 font-columns wide) across PANEL_SIZE, so the
    // word fills as much of the panel as the font proportions allow.
    const int scale = (PANEL_SIZE - 4) / 19;
    const int textW = 19 * scale;
    const int textH = 5 * scale;
    const int x0 = (PANEL_SIZE - textW) / 2;
    const int y0 = (PANEL_SIZE - textH) / 2;
    for (;;) {
        for (uint8_t y = 0; y < PANEL_SIZE; y++) {
            for (uint8_t x = 0; x < PANEL_SIZE; x++) {
                display->drawPixel(x, y, black);
            }
        }
        int x = x0;
        for (int i = 0; i < 5; i++) {
            drawGlyph(display, letters[i], x, y0, scale, white);
            x += (3 * scale) + scale;   // glyph width + 1-column gap
        }
        display->flipDMABuffer();
        delay(200);
    }
}

// ---------------------------------------------------------------------------
// Allocate per-face frame buffers in PSRAM.
// ---------------------------------------------------------------------------
static bool allocBuffers() {
    for (uint8_t i = 0; i < NUM_FACES; i++) {
        g_frameBuf[i] = (uint8_t*)ps_malloc(FACE_BYTES);
        g_dmaBuf[i]   = (uint8_t*)ps_malloc(FACE_BYTES);
        if (!g_frameBuf[i] || !g_dmaBuf[i]) {
            Serial.printf("[MEM] ps_malloc failed for face %u\n", i);
            return false;
        }
        memset(g_frameBuf[i], 0, FACE_BYTES);
        memset(g_dmaBuf[i],   0, FACE_BYTES);
    }
    return true;
}

// ---------------------------------------------------------------------------
// setup()
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(200);
    g_bootMillis = millis();
    Serial.println("\n[Boot] Multidisplay cube starting...");

    // Status LED indicator task.
    xTaskCreatePinnedToCore(statusLedTask, "statusLed", 2048, nullptr, 1, nullptr, 1);

    // PSRAM frame buffers.
    if (!psramFound()) {
        Serial.println("[MEM] WARNING: PSRAM not found!");
    }
    if (!allocBuffers()) {
        Serial.println("[MEM] FATAL: could not allocate frame buffers");
    }

    // Filesystem.
    if (!LittleFS.begin(true)) {
        Serial.println("[FS] LittleFS mount failed (even after format)");
    } else {
        Serial.printf("[FS] LittleFS mounted, %u / %u bytes used\n",
                      LittleFS.usedBytes(), LittleFS.totalBytes());
    }

    // HUB75 display.
    dma_display = initDisplay();
    if (!dma_display) {
        Serial.println("[LED] display init FAILED");
    } else {
        Serial.println("[LED] display initialized");
        // Cloud-swirl RGB diagnostic — never returns. Swap back to
        // drawWorkingText(dma_display) or drawBringupTestPattern(dma_display)
        // once the split/duplicate-image wiring issue is resolved.
        runCloudSwirlTest(dma_display);
    }

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

    // Standalone mode: load persisted last-effect + schedule, sync NTP time,
    // and fetch weather once now so it's not blank for the first 15 minutes
    // after boot. All three need WiFi, so this runs after connectWifi()
    // succeeds. The fetch is a blocking HTTPS call, same trade-off as the
    // WiFi connect above it — acceptable one-time cost during boot.
    standaloneLoad();
    standaloneNtpInit();
    standaloneWxFetch();

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

    // Web + WebSocket servers.
    initWebServer(httpServer, ws, f1State);
    httpServer.begin();

    // The WebSocket lives on its own port (81). Reuse the same handler.
    wsServer.addHandler(&ws);
    wsServer.begin();

    Serial.printf("[HTTP] serving on :%d   [WS] on :%d\n", HTTP_PORT, WS_PORT);

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
