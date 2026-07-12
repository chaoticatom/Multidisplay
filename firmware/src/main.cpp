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

// ---------------------------------------------------------------------------
// Shared globals (declared extern in web_server.h)
// ---------------------------------------------------------------------------
uint8_t*        g_frameBuf[NUM_FACES]   = {nullptr};
volatile bool   g_faceDirty[NUM_FACES]  = {false};
portMUX_TYPE    g_frameMux              = portMUX_INITIALIZER_UNLOCKED;
String          g_currentEffect        = "video";
volatile uint8_t g_currentEffectId     = 0;
uint32_t        g_bootMillis           = 0;

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

    for (;;) {
        if (dma_display) {
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
                    // The 6 panels form one wide bitmap; face N starts at
                    // x = N * PANEL_SIZE. Push RGB888 pixels directly.
                    const int xOff = face * PANEL_SIZE;
                    const uint8_t* src = g_dmaBuf[face];
                    for (int y = 0; y < PANEL_SIZE; y++) {
                        for (int x = 0; x < PANEL_SIZE; x++) {
                            const uint8_t* p = src + (y * PANEL_SIZE + x) * 3;
                            dma_display->drawPixelRGB888(
                                xOff + x, y, p[0], p[1], p[2]);
                        }
                    }
                }
            }
            dma_display->flipDMABuffer();
        }
        vTaskDelayUntil(&lastWake, period);
    }
}

// ---------------------------------------------------------------------------
// One-time bring-up test pattern: fills each face with a distinct solid
// color, drawn directly to the DMA buffer before WiFi/the web app are even
// involved. Lets you verify panel power, chain order, and RGB/row-address
// wiring with just a USB cable and no network setup. The first real frame
// from the browser overwrites it automatically.
// ---------------------------------------------------------------------------
static void drawBringupTestPattern(MatrixPanel_I2S_DMA* display) {
    struct { uint8_t r, g, b; const char* name; } faceColors[NUM_FACES] = {
        {255, 0,   0,   "RED"},     // Face 0 - Front
        {0,   255, 0,   "GREEN"},   // Face 1 - Back
        {0,   0,   255, "BLUE"},    // Face 2 - Right
        {255, 255, 255, "WHITE"},   // Face 3 - Left
        {255, 255, 0,   "YELLOW"},  // Face 4 - Top
        {0,   255, 255, "CYAN"},    // Face 5 - Bottom
    };
    for (uint8_t face = 0; face < NUM_FACES; face++) {
        const int xOff = face * PANEL_SIZE;
        for (int y = 0; y < PANEL_SIZE; y++) {
            for (int x = 0; x < PANEL_SIZE; x++) {
                display->drawPixelRGB888(xOff + x, y,
                    faceColors[face].r, faceColors[face].g, faceColors[face].b);
            }
        }
        Serial.printf("[TEST] Face %u -> %s\n", face, faceColors[face].name);
    }
    display->flipDMABuffer();
    Serial.println("[TEST] Bring-up pattern drawn - each face should show one solid, distinct color.");
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
        drawBringupTestPattern(dma_display);
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

    delay(20);
}
