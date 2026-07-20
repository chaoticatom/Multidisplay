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

// Some "smart" HUB75 driver chips (FM6126A/ICN2038S-style, and per a
// community report a RUL6024/MBI6024-family chip closely related to this
// panel's SM5166PS) don't treat LAT as a simple end-of-row pulse - they
// read it as a command-length counter: LAT must be HIGH during the LAST N
// clock edges of the shift sequence itself (not asserted separately
// afterward) to actually latch the data. The report that found this said
// N=3 for their chip. Every config tried tonight (library-based and the
// first version of this custom driver) used a plain separate end pulse -
// this has never actually been tested.
static const int LATCH_DURING_LAST_N_CLOCKS = 3;

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
    Serial.printf("[CUSTOM_HUB75] LAT held high during the last %d clock edges of each row shift.\n",
                   LATCH_DURING_LAST_N_CLOCKS);
    for (;;) {
        for (int addr = 0; addr < 16; addr++) {
            // Shift out one full row's worth of colour data for both halves.
            // LAT goes HIGH before the last LATCH_DURING_LAST_N_CLOCKS
            // columns' clock pulses (not as a separate pulse afterward) -
            // the specific technique this panel's driver family reportedly
            // needs to actually transfer shift-register data to output.
            digitalWrite(HUB75_LAT, LOW);
            for (int col = 0; col < PANEL_SIZE; col++) {
                digitalWrite(HUB75_R1, r ? HIGH : LOW);
                digitalWrite(HUB75_G1, g ? HIGH : LOW);
                digitalWrite(HUB75_B1, b ? HIGH : LOW);
                digitalWrite(HUB75_R2, r ? HIGH : LOW);
                digitalWrite(HUB75_G2, g ? HIGH : LOW);
                digitalWrite(HUB75_B2, b ? HIGH : LOW);
                if (col == PANEL_SIZE - LATCH_DURING_LAST_N_CLOCKS) {
                    digitalWrite(HUB75_LAT, HIGH);
                }
                digitalWrite(HUB75_CLK, HIGH);
                digitalWrite(HUB75_CLK, LOW);
            }
            digitalWrite(HUB75_LAT, LOW);

            // Blank output before changing the row address, to avoid a
            // visible ghost row while the address lines are mid-transition.
            digitalWrite(HUB75_OE, HIGH);

            digitalWrite(HUB75_A, (addr & 0x1) ? HIGH : LOW);
            digitalWrite(HUB75_B, (addr & 0x2) ? HIGH : LOW);
            digitalWrite(HUB75_C, (addr & 0x4) ? HIGH : LOW);
            digitalWrite(HUB75_D, (addr & 0x8) ? HIGH : LOW);

            // Enable output (active-low) to actually light this row-pair.
            digitalWrite(HUB75_OE, LOW);
        }
    }
}

// Drops the "R1=row N, R2=row N+32" pairing assumption entirely and instead
// reveals which physical rows each half actually feeds, directly: R1 is
// driven RED-only, R2 is driven GREEN-only, for the exact same address
// value each cycle. Whatever rows come up red are R1's true rows; whatever
// comes up green are R2's - no offset assumption baked in anywhere. If this
// really is a fixed R1=N/R2=N+32 pair, expect to see red rows and green rows
// exactly 32 apart; if this panel is wired differently, this will show
// whatever the real relationship actually is.
inline void customHub75RowIdentityTest() {
    Serial.println("[CUSTOM_HUB75] R1=RED / R2=GREEN row-identity test (does not return).");
    Serial.printf("[CUSTOM_HUB75] LAT held high during the last %d clock edges of each row shift.\n",
                   LATCH_DURING_LAST_N_CLOCKS);
    for (;;) {
        for (int addr = 0; addr < 16; addr++) {
            digitalWrite(HUB75_LAT, LOW);
            for (int col = 0; col < PANEL_SIZE; col++) {
                // R1 channel: red only.
                digitalWrite(HUB75_R1, HIGH);
                digitalWrite(HUB75_G1, LOW);
                digitalWrite(HUB75_B1, LOW);
                // R2 channel: green only.
                digitalWrite(HUB75_R2, LOW);
                digitalWrite(HUB75_G2, HIGH);
                digitalWrite(HUB75_B2, LOW);
                if (col == PANEL_SIZE - LATCH_DURING_LAST_N_CLOCKS) {
                    digitalWrite(HUB75_LAT, HIGH);
                }
                digitalWrite(HUB75_CLK, HIGH);
                digitalWrite(HUB75_CLK, LOW);
            }
            digitalWrite(HUB75_LAT, LOW);

            digitalWrite(HUB75_OE, HIGH);

            digitalWrite(HUB75_A, (addr & 0x1) ? HIGH : LOW);
            digitalWrite(HUB75_B, (addr & 0x2) ? HIGH : LOW);
            digitalWrite(HUB75_C, (addr & 0x4) ? HIGH : LOW);
            digitalWrite(HUB75_D, (addr & 0x8) ? HIGH : LOW);

            digitalWrite(HUB75_OE, LOW);
        }
    }
}

// "ABC shift + DE direct" theory, adapted: a documented alternate row-
// addressing scheme (rpi-rgb-led-matrix's --led-row-addr-type=4) for this
// same class of panel treats A/B/C as one group and D/E as independent
// direct-select lines, rather than all five bits combining into one
// sequential binary counter (0-31) - fundamentally different from every
// theory tried tonight, which only ever varied WHICH bit got which weight,
// never the underlying structure.
//
// This panel's confirmed harness has only ONE extra address wire (not two),
// so the literal "DE" scheme doesn't map over directly - this adapts the
// concept: A/B/C sweep 0-7 as normal, but the extra wire changes far less
// often (once per full A/B/C sweep, not every row) and is set BEFORE the
// A/B/C sweep starts rather than interleaved with it row-by-row, simulating
// a genuinely independent "direct select" line rather than another bit in
// the same counter. Best-effort adaptation of a scheme documented for
// different hardware (Raspberry Pi GPIO, not ESP32 bit-bang) - not a
// guaranteed-faithful reproduction.
inline void customHub75ABCShiftDEDirectTest(bool r, bool g, bool b) {
    Serial.println("[CUSTOM_HUB75] ABC-shift + direct-select test (does not return).");
    for (;;) {
        for (int direct = 0; direct < 2; direct++) {
            // The extra wire is set ONCE here, before the whole A/B/C sweep -
            // not re-set every row - to behave like an independent select
            // line rather than a bit toggling in lockstep with A/B/C.
            digitalWrite(HUB75_D, direct ? HIGH : LOW);

            for (int abc = 0; abc < 8; abc++) {
                digitalWrite(HUB75_LAT, LOW);
                for (int col = 0; col < PANEL_SIZE; col++) {
                    digitalWrite(HUB75_R1, r ? HIGH : LOW);
                    digitalWrite(HUB75_G1, g ? HIGH : LOW);
                    digitalWrite(HUB75_B1, b ? HIGH : LOW);
                    digitalWrite(HUB75_R2, r ? HIGH : LOW);
                    digitalWrite(HUB75_G2, g ? HIGH : LOW);
                    digitalWrite(HUB75_B2, b ? HIGH : LOW);
                    if (col == PANEL_SIZE - LATCH_DURING_LAST_N_CLOCKS) {
                        digitalWrite(HUB75_LAT, HIGH);
                    }
                    digitalWrite(HUB75_CLK, HIGH);
                    digitalWrite(HUB75_CLK, LOW);
                }
                digitalWrite(HUB75_LAT, LOW);

                digitalWrite(HUB75_OE, HIGH);

                digitalWrite(HUB75_A, (abc & 0x1) ? HIGH : LOW);
                digitalWrite(HUB75_B, (abc & 0x2) ? HIGH : LOW);
                digitalWrite(HUB75_C, (abc & 0x4) ? HIGH : LOW);
                // HUB75_D deliberately not touched here - see above.

                digitalWrite(HUB75_OE, LOW);
            }
        }
    }
}
