// Absolute minimal HUB75 test: initialize the panel and fill it with a
// solid dark green. Nothing else - no test cycling, no Serial, no status
// LED, no scan-split theorizing. Just the one thing that should work.
#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#define PANEL_RES_X 64
#define PANEL_RES_Y 64
#define PANEL_CHAIN 1

#define R1_PIN  42
#define G1_PIN  41
#define B1_PIN  40
#define R2_PIN  39
#define G2_PIN  38
#define B2_PIN  37
#define A_PIN   36
#define B_PIN   35
#define C_PIN   45
#define D_PIN   47
#define E_PIN   -1
#define LAT_PIN 21
#define OE_PIN  14
#define CLK_PIN 13

MatrixPanel_I2S_DMA *dma_display = nullptr;

void setup() {
    HUB75_I2S_CFG::i2s_pins pins = {
        R1_PIN, G1_PIN, B1_PIN,
        R2_PIN, G2_PIN, B2_PIN,
        A_PIN,  B_PIN,  C_PIN, D_PIN, E_PIN,
        LAT_PIN, OE_PIN, CLK_PIN
    };

    HUB75_I2S_CFG mxconfig(PANEL_RES_X, PANEL_RES_Y, PANEL_CHAIN, pins);

    dma_display = new MatrixPanel_I2S_DMA(mxconfig);
    dma_display->begin();
    dma_display->setBrightness8(90);
    dma_display->fillScreen(dma_display->color565(0, 100, 0));   // dark green
}

void loop() {
}
