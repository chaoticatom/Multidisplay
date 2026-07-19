#pragma once

#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

// ===========================================================================
// PanelTypes.h - enums and the PanelConfiguration struct describing one
// candidate wiring/timing theory to test, plus PANEL_CONFIGS[]: the actual
// sweep list.
//
// This panel's known-unusual facts (from the physical connector silkscreen
// and chip markings), which shaped which configs are worth testing at all:
//   - PCB marking: "L3-B 32S 64x64 2121 V2.8" - the "32S" strongly implies
//     1/32 scan is the panel's real intended scan rate.
//   - Connector silkscreen shows NC (not connected) where a D address line
//     would normally be, and a genuine E line - i.e. this panel's own
//     labelling says A/B/C/E, no D, matching what was found by physical
//     inspection earlier in this project's debugging history.
//   - Driver ICs: MW2458C (constant-current LED driver, standard) and
//     SM5166PS (row/multiplex driver, plain constant-current shift-register
//     type per its datasheet family - not a "smart" self-latching chip like
//     FM6126A/ICN2038S, which need a special init sequence those chips
//     require and this one shouldn't).
// ===========================================================================

// --- Scan rate: how many row-groups the panel addresses, and therefore how
// many address bits (A, B, C, ... ) actually matter. ---
enum class ScanRate {
    SCAN_1_8,    // 8 row-groups, 3-bit addressing (A,B,C only)
    SCAN_1_16,   // 16 row-groups, 4-bit addressing (A,B,C,D)
    SCAN_1_32,   // 32 row-groups, 5-bit addressing (A,B,C,D,E)
};

// --- Address mapping: which physical wire (if any) drives the panel's 4th
// and 5th address bits. This panel's silkscreen shows no D pin at all, only
// A/B/C/E - so "standard" (D used, E not) is almost certainly wrong for
// this panel, but it's included as the baseline/control case. ---
enum class AddressMapping {
    STANDARD,   // D used (weight 8), E unused - the "textbook" 5-bit scheme
    ABCDE,      // Same physical assignment as STANDARD, tested as its own
                // explicit step (kept distinct per explicit request)
    ABCE,       // E used (weight 16) instead of D - matches this panel's own
                // silkscreen (A,B,C,E; no D) literally
};

// --- Row driver chip. SM5166PS (this panel's actual chip, per its marking)
// is a plain constant-current shift-register sink - SHIFTREG is the
// expected-correct choice. FM6126A/ICN2038S are "smart" chips needing their
// own init sequence; included as control cases in case that assumption
// about the chip is wrong. ---
enum class DriverType {
    SHIFTREG,
    FM6126A,
    ICN2038S,
};

// --- Row iteration order - some panels wire row-groups in reverse address
// order relative to what's expected. ---
enum class RowOrder {
    NORMAL,
    REVERSED,
};

// --- Column iteration order - some panels/cabling mirror columns. ---
enum class ColumnOrder {
    NORMAL,
    REVERSED,
};

// A single candidate configuration to test. Kept as plain data (not
// spread across scattered #defines) specifically so PANEL_CONFIGS[] below
// can be extended by just adding one more line - no other code changes
// needed to test a new theory.
struct PanelConfiguration {
    const char* name;
    ScanRate scanRate;
    AddressMapping addressMapping;
    DriverType driverType;
    RowOrder rowOrder;
    ColumnOrder columnOrder;
    uint8_t latchBlanking;   // real HUB75_I2S_CFG field - timing around the LAT pulse
    bool clockPhaseInverted; // real HUB75_I2S_CFG field (clkphase)
    bool doubleBuffer;       // real HUB75_I2S_CFG field (double_buff) - a DMA/memory setting
};

// Module height / chain length are derived from ScanRate, not stored
// directly - see PanelTester::moduleHeightFor()/chainLengthFor().
inline int moduleHeightFor(ScanRate rate) {
    switch (rate) {
        case ScanRate::SCAN_1_8:  return 16;   // 64 / 4
        case ScanRate::SCAN_1_16: return 32;   // 64 / 2
        case ScanRate::SCAN_1_32: return 64;   // 64 / 1
    }
    return 64;
}
inline int chainLengthFor(ScanRate rate) {
    switch (rate) {
        case ScanRate::SCAN_1_8:  return 4;
        case ScanRate::SCAN_1_16: return 2;
        case ScanRate::SCAN_1_32: return 1;
    }
    return 1;
}

inline const char* scanRateName(ScanRate r) {
    switch (r) {
        case ScanRate::SCAN_1_8:  return "1/8";
        case ScanRate::SCAN_1_16: return "1/16";
        case ScanRate::SCAN_1_32: return "1/32";
    }
    return "?";
}
inline const char* addressMappingName(AddressMapping m) {
    switch (m) {
        case AddressMapping::STANDARD: return "STANDARD (D used, E unused)";
        case AddressMapping::ABCDE:    return "ABCDE (D used, E unused)";
        case AddressMapping::ABCE:     return "ABCE (E used, D unused)";
    }
    return "?";
}
inline const char* driverTypeName(DriverType d) {
    switch (d) {
        case DriverType::SHIFTREG: return "SHIFTREG";
        case DriverType::FM6126A:  return "FM6126A";
        case DriverType::ICN2038S: return "ICN2038S";
    }
    return "?";
}
inline HUB75_I2S_CFG::shift_driver toLibraryDriver(DriverType d) {
    switch (d) {
        case DriverType::SHIFTREG: return HUB75_I2S_CFG::SHIFTREG;
        case DriverType::FM6126A:  return HUB75_I2S_CFG::FM6126A;
        case DriverType::ICN2038S: return HUB75_I2S_CFG::ICN2038S;
    }
    return HUB75_I2S_CFG::SHIFTREG;
}
inline const char* rowOrderName(RowOrder r)       { return r == RowOrder::NORMAL ? "NORMAL" : "REVERSED"; }
inline const char* columnOrderName(ColumnOrder c) { return c == ColumnOrder::NORMAL ? "NORMAL" : "REVERSED"; }

// ---------------------------------------------------------------------------
// The actual sweep list. NOT a full cross-product of every enum (that would
// be hundreds of configs, impractical at 8s each) - a curated set covering
// every parameter at least once, weighted toward the combinations most
// likely to be relevant to THIS panel's known facts (32S marking -> 1/32
// scan; A/B/C/E silkscreen -> ABCE addressing; SM5166PS -> SHIFTREG). Add
// more lines here to test additional theories; nothing else needs to change.
// ---------------------------------------------------------------------------
static const PanelConfiguration PANEL_CONFIGS[] = {
    // --- Scan rate sweep, standard addressing/timing held constant ---
    { "1/8 scan, standard",           ScanRate::SCAN_1_8,  AddressMapping::STANDARD, DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
    { "1/16 scan, standard",          ScanRate::SCAN_1_16, AddressMapping::STANDARD, DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
    { "1/32 scan, standard",          ScanRate::SCAN_1_32, AddressMapping::STANDARD, DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },

    // --- Address mapping sweep at 1/32 (the panel's marked scan rate) ---
    { "1/32 scan, ABCDE addressing",  ScanRate::SCAN_1_32, AddressMapping::ABCDE,    DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
    { "1/32 scan, ABCE addressing",   ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },

    // --- Address mapping sweep at 1/16 too, in case scan rate AND
    // addressing are both wrong simultaneously ---
    { "1/16 scan, ABCE addressing",   ScanRate::SCAN_1_16, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },

    // --- Row/column order sweep, at the panel's marked 1/32 + ABCE (its
    // own silkscreen's addressing) ---
    { "1/32 ABCE, row reversed",      ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::REVERSED, ColumnOrder::NORMAL,   4, false, true },
    { "1/32 ABCE, col reversed",      ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL,   ColumnOrder::REVERSED, 4, false, true },
    { "1/32 ABCE, row+col reversed",  ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::REVERSED, ColumnOrder::REVERSED, 4, false, true },

    // --- Clock phase sweep ---
    { "1/32 ABCE, clkphase inverted", ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, true, true },

    // --- Latch blanking sweep (timing around the LAT pulse) ---
    { "1/32 ABCE, latch_blanking=1",  ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 1, false, true },
    { "1/32 ABCE, latch_blanking=2",  ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 2, false, true },
    { "1/32 ABCE, latch_blanking=8",  ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 8, false, true },

    // --- DMA/double-buffer sweep ---
    { "1/32 ABCE, double_buff=false", ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::SHIFTREG, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, false },

    // --- Driver chip sweep at the panel's marked scan rate/addressing ---
    { "1/32 ABCE, FM6126A driver",    ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::FM6126A,  RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
    { "1/32 ABCE, ICN2038S driver",   ScanRate::SCAN_1_32, AddressMapping::ABCE,     DriverType::ICN2038S, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },

    // --- Driver chip sweep at 1/16, in case both scan rate AND driver
    // assumptions are wrong ---
    { "1/16 ABCE, FM6126A driver",    ScanRate::SCAN_1_16, AddressMapping::ABCE,     DriverType::FM6126A,  RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
    { "1/16 ABCE, ICN2038S driver",   ScanRate::SCAN_1_16, AddressMapping::ABCE,     DriverType::ICN2038S, RowOrder::NORMAL, ColumnOrder::NORMAL, 4, false, true },
};
static const int NUM_PANEL_CONFIGS = sizeof(PANEL_CONFIGS) / sizeof(PANEL_CONFIGS[0]);
