#pragma once

// ===========================================================================
// Pins.h - fixed physical wiring. Only D/E vary between AddressMapping
// options (handled in PanelTester), everything else here is constant across
// every configuration in the sweep.
//
// All names use an explicit _PIN suffix, even single-letter address lines -
// Arduino's binary.h defines B0/B1/B2/.../B11111111 as binary-literal
// shorthand macros, which silently collides with a bare "B1"/"B2" constant
// name once <Arduino.h> is included (breaks with a confusing "expected
// unqualified-id before numeric constant" error, since the macro just
// replaces the text B1 with the digit 1 first). The _PIN suffix sidesteps
// that whole class of collision.
// ===========================================================================

namespace Pins {
    constexpr int R1_PIN  = 42;
    constexpr int G1_PIN  = 41;
    constexpr int B1_PIN  = 40;
    constexpr int R2_PIN  = 39;
    constexpr int G2_PIN  = 38;
    constexpr int B2_PIN  = 37;
    constexpr int A_PIN   = 36;
    constexpr int B_PIN   = 35;
    constexpr int C_PIN   = 45;
    constexpr int LAT_PIN = 21;
    constexpr int OE_PIN  = 14;
    constexpr int CLK_PIN = 13;

    // The one extra row-address wire this panel's connector actually has
    // beyond A/B/C. Per the silkscreen (A,B,C,E; no D), this should almost
    // certainly be driven as E - but AddressMapping::STANDARD/ABCDE test the
    // "assume it's D instead" theory too.
    constexpr int EXTRA_ADDRESS_WIRE = 47;

    constexpr int PANEL_WIDTH  = 64;
    constexpr int PANEL_HEIGHT = 64;
    constexpr int PANEL_CHAIN  = 1;   // one physical panel

    constexpr int NOT_CONNECTED = -1;
}
