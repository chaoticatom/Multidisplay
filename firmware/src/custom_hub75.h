#pragma once

#include <Arduino.h>
#include "config.h"

// ---------------------------------------------------------------------------
// custom_hub75.h - minimal, fully transparent HUB75 bit-banged driver.
//
// Why this exists: two structurally different scan-geometry theories fed to
// the ESP32-HUB75-MatrixPanel-I2S-DMA library (half-scan/SCAN_SPLIT=2, then
// quarter-scan/SCAN_SPLIT=4) produced byte-identical "8 rows on, 8 rows off"
// banding on a plain solid-colour fill. That's the library's internal
// scan-rate/addressing logic being a black box we can configure but not see
// inside - if it doesn't actually change its GPIO behaviour the way its
// module-height parameter implies, no amount of geometry tuning through it
// will ever show a different result.
//
// This driver makes zero assumptions borrowed from any theory about how many
// "virtual modules" this panel chains as. It drives only the FOUR row-address
// wires that are physically confirmed to exist on this panel's connector (A,
// B, C, and the one extra wire currently assigned to HUB75_D) as a plain
// 4-bit counter (0-15), with R1/R2 feeding the standard top/bottom halves.
// No PWM/BCM colour depth - solid on/off per channel (8 possible colours) is
// enough to see whether every row lights evenly. Slow (digitalWrite, no
// DMA), but for a static full-panel fill test that's plenty.
// ---------------------------------------------------------------------------

inline void customHub75Init() {
    pinMode(HUB75_R1, OUTPUT);
    pinMode(HUB75_G1, OUTPUT);
    pinMode(HUB75_B1, OUTPUT);
    pinMode(HUB75_R2, OUTPUT);
    pinMode(HUB75_G2, OUTPUT);
    pinMode(HUB75_B2, OUTPUT);
    pinMode(HUB75_A,  OUTPUT);
    pinMode(HUB75_B,  OUTPUT);
    pinMode(HUB75_C,  OUTPUT);
    pinMode(HUB75_D,  OUTPUT);   // the one extra confirmed-present address wire
    pinMode(HUB75_LAT, OUTPUT);
    pinMode(HUB75_OE,  OUTPUT);
    pinMode(HUB75_CLK, OUTPUT);

    digitalWrite(HUB75_OE, HIGH);   // OE is active-low on HUB75 - start blanked
    digitalWrite(HUB75_LAT, LOW);
    digitalWrite(HUB75_CLK, LOW);
    Serial.println("[CUSTOM_HUB75] Pins initialized (bit-bang, no library).");
}

// Fills the whole PANEL_SIZE x PANEL_SIZE Face 0 with one solid colour,
// forever, scanning all 16 row-address states (A/B/C/D -> 4 bits) each pass.
// R1/G1/B1 drive the top half (rows 0-31), R2/G2/B2 the bottom half
// (rows 32-63) simultaneously per the HUB75 standard - each of the 16
// address states lights one row in each half (address n -> row n in the top
// half, row n+32 in the bottom half). If this shows even, uniform
// brightness across all 64 rows, the earlier banding was a library
// scan-geometry/config issue. If it still bands, the fault is below any
// software abstraction - the physical address line(s) or panel itself.
inline void customHub75FillTest(bool r, bool g, bool b) {
    Serial.println("[CUSTOM_HUB75] Filling Face 0 with a solid colour (does not return).");
    for (;;) {
        for (int addr = 0; addr < 16; addr++) {
            // Shift out one full row's worth of colour data for both halves.
            for (int col = 0; col < PANEL_SIZE; col++) {
                digitalWrite(HUB75_R1, r ? HIGH : LOW);
                digitalWrite(HUB75_G1, g ? HIGH : LOW);
                digitalWrite(HUB75_B1, b ? HIGH : LOW);
                digitalWrite(HUB75_R2, r ? HIGH : LOW);
                digitalWrite(HUB75_G2, g ? HIGH : LOW);
                digitalWrite(HUB75_B2, b ? HIGH : LOW);
                digitalWrite(HUB75_CLK, HIGH);
                digitalWrite(HUB75_CLK, LOW);
            }

            // Blank output before changing the row address, to avoid a
            // visible ghost row while the address lines are mid-transition.
            digitalWrite(HUB75_OE, HIGH);

            digitalWrite(HUB75_A, (addr & 0x1) ? HIGH : LOW);
            digitalWrite(HUB75_B, (addr & 0x2) ? HIGH : LOW);
            digitalWrite(HUB75_C, (addr & 0x4) ? HIGH : LOW);
            digitalWrite(HUB75_D, (addr & 0x8) ? HIGH : LOW);

            // Latch the shifted row data into the output drivers.
            digitalWrite(HUB75_LAT, HIGH);
            digitalWrite(HUB75_LAT, LOW);

            // Enable output (active-low) to actually light this row-pair.
            digitalWrite(HUB75_OE, LOW);
        }
    }
}
