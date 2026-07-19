#pragma once

// ===========================================================================
// Pins.h - fixed physical wiring. Only D/E vary between AddressMapping
// options (handled in PanelTester), everything else here is constant across
// every configuration in the sweep.
// ===========================================================================

namespace Pins {
    constexpr int R1  = 42;
    constexpr int G1  = 41;
    constexpr int B1  = 40;
    constexpr int R2  = 39;
    constexpr int G2  = 38;
    constexpr int B2  = 37;
    constexpr int A   = 36;
    constexpr int B   = 35;
    constexpr int C   = 45;
    constexpr int LAT = 21;
    constexpr int OE  = 14;
    constexpr int CLK = 13;

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
