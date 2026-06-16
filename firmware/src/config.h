#pragma once

// ---------------------------------------------------------------------------
// Multidisplay RGB LED Cube - compile-time configuration
// ---------------------------------------------------------------------------

#define PANEL_SIZE     64    // pixels per side (8, 16, or 64)
#define NUM_FACES      6
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
#define HUB75_D   48
#define HUB75_E   47   // needed for 64-row panels (1/32 scan)
#define HUB75_LAT 21
#define HUB75_OE  14
#define HUB75_CLK 13

// Status LED (built-in on most ESP32-S3 devkits)
#define STATUS_LED_PIN 2
