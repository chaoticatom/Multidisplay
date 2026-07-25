#pragma once

#include <Arduino.h>
#include <ctype.h>            // isspace/isalnum/toupper (word-cascade text engine)
#include <stdlib.h>           // strtol (HTML entity decoder)
#include <esp_heap_caps.h>   // heap_caps_malloc / MALLOC_CAP_8BIT (snAllocPreferPsram fallback)
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include <TJpg_Decoder.h>   // real JPEG decode for APOD (PSRAM-only, see standaloneApodFetch)
#include "config.h"
#include "led_matrix.h"
#include "easter_egg_images.h"

// Defined in main.cpp, set from web_server.h's WS_EVT_CONNECT/DISCONNECT.
// True while >=1 browser/app is connected over the cube WebSocket - used to
// hide the boot-time WiFi status icon once a browser is controlling.
extern volatile bool g_browserConnected;

// ---------------------------------------------------------------------------
// standalone.h — native (no-browser) effects, weather, schedule/alarms.
//
// Runs entirely on the ESP32: no Canvas, no DOM, no fetch() from JS — just
// HTTPClient + ArduinoJson (same technique already used for F1 data) and
// direct GFX drawing calls against the display object (same primitives
// proven by the boot-time bring-up test pattern in main.cpp). See
// docs/STANDALONE_MODE_PLAN.md for the design behind this.
//
// Scope: a small set of effects that don't need image decoding or a
// browser. Weather is included because it's pure data + math (no images).
// Effects that genuinely need image decode (NASA imagery, Art Gallery,
// Unsplash) or a 3D/Canvas engine (the full effects.js library) are not
// part of this — those remain browser-only by necessity, not oversight.
// ---------------------------------------------------------------------------

enum StandaloneEffect : uint8_t {
    SA_RAINBOW       = 0,
    SA_PULSE         = 1,
    SA_PLASMA        = 2,
    SA_CLOCK         = 3,
    SA_WEATHER       = 4,
    SA_FIREWORKS     = 5,
    SA_GRADIENT_WASH = 6,
    SA_AURORA        = 7,
    SA_SPECTRUM      = 8,
    SA_BALLS         = 9,
    SA_STROBE        = 10,
    SA_LIGHTNING     = 11,
    SA_TIDE          = 12,
    SA_RAIN          = 13,
    SA_OFF           = 14,
    SA_WAVE          = 15,
    SA_DEPTH_RINGS   = 16,
    SA_PRISM         = 17,
    SA_NEBULA        = 18,
    SA_DNA           = 19,
    SA_WARP          = 20,
    SA_LIFE          = 21,
    SA_LIGHTSPEED    = 22,
    SA_SAND          = 23,
    SA_FLUID         = 24,
    SA_MAZE          = 25,
    SA_MOON          = 26,
    SA_EASTER_EGG    = 27,
    SA_DICE          = 28,
    SA_COINFLIP      = 29,
    SA_TRON          = 30,
    SA_SPHERE        = 31,
    SA_APOD          = 32,
    SA_GHOST         = 33,
    SA_RETRO         = 34,
    SA_JOKE          = 35,
    SA_TRIVIA        = 36,
    SA_OTD           = 37,
    SA_SIMHOUSE      = 38,
    SA_NEO           = 39,
    SA_COUNT         = 40
};

inline const char* standaloneEffectName(uint8_t id) {
    switch (id) {
        case SA_RAINBOW:       return "rainbow";
        case SA_PULSE:         return "pulse";
        case SA_PLASMA:        return "plasma";
        case SA_CLOCK:         return "clock";
        case SA_WEATHER:       return "weather";
        case SA_FIREWORKS:     return "fireworks";
        case SA_GRADIENT_WASH: return "gradient_wash";
        case SA_AURORA:        return "aurora";
        case SA_SPECTRUM:      return "spectrum";
        case SA_BALLS:         return "balls";
        case SA_STROBE:        return "strobe";
        case SA_LIGHTNING:     return "lightning";
        case SA_TIDE:          return "tide";
        case SA_RAIN:          return "rain";
        case SA_OFF:           return "off";
        case SA_WAVE:          return "wave";
        case SA_DEPTH_RINGS:   return "depth_rings";
        case SA_PRISM:         return "prism";
        case SA_NEBULA:        return "nebula";
        case SA_DNA:           return "dna";
        case SA_WARP:          return "warp";
        case SA_LIFE:          return "life";
        case SA_LIGHTSPEED:    return "lightspeed";
        case SA_SAND:          return "sand";
        case SA_FLUID:         return "fluid";
        case SA_MAZE:          return "maze";
        case SA_MOON:          return "moon";
        case SA_EASTER_EGG:    return "easter_egg";
        case SA_DICE:          return "dice";
        case SA_COINFLIP:      return "coinflip";
        case SA_TRON:          return "tron";
        case SA_SPHERE:        return "sphere";
        case SA_APOD:          return "apod";
        case SA_GHOST:         return "ghost";
        case SA_RETRO:         return "retro";
        case SA_JOKE:          return "joke";
        case SA_TRIVIA:        return "trivia";
        case SA_OTD:           return "otd";
        case SA_SIMHOUSE:      return "simhouse";
        case SA_NEO:           return "neo";
        default:               return "unknown";
    }
}

// Maps a browser effect key (effects.js EFFECTS map) to the nearest native
// standalone effect, so selecting an effect in the browser also sets what the
// ESP32 runs on its own once the browser stops streaming. Data/internet-backed
// browser effects (weather, apod, iss, radio, cam, f1, jokes, ...) have no
// pure-visual native equivalent yet; those fall back to a pleasant default
// rather than a black screen. Extend as more effects are ported.
inline uint8_t standaloneEffectForBrowserKey(const char* key) {
    if (!key) return SA_RAINBOW;
    struct { const char* k; uint8_t fx; } M[] = {
        {"wave", SA_WAVE}, {"rain", SA_RAIN}, {"plasma", SA_PLASMA},
        {"fireworks", SA_FIREWORKS}, {"balls", SA_BALLS},
        {"gradient_wash", SA_GRADIENT_WASH}, {"aurora", SA_AURORA},
        {"depth_rings", SA_DEPTH_RINGS}, {"prism", SA_PRISM},
        {"tide", SA_TIDE}, {"nebula", SA_NEBULA}, {"lightning", SA_LIGHTNING},
        {"strobe", SA_STROBE}, {"weather", SA_WEATHER}, {"datetime", SA_CLOCK},
        {"dna", SA_DNA}, {"warp", SA_WARP}, {"life", SA_LIFE},
        {"lightspeed", SA_LIGHTSPEED}, {"sand", SA_SAND}, {"fluid", SA_FLUID},
        {"maze", SA_MAZE}, {"moon", SA_MOON}, {"easter_egg", SA_EASTER_EGG},
        {"dice", SA_DICE}, {"coinflip", SA_COINFLIP}, {"tron", SA_TRON}, {"sphere", SA_SPHERE},
        {"apod", SA_APOD}, {"ghost", SA_GHOST}, {"retro", SA_RETRO},
        {"joke", SA_JOKE}, {"trivia", SA_TRIVIA}, {"otd", SA_OTD}, {"simhouse", SA_SIMHOUSE},
        {"neo", SA_NEO},
        // reasonable stand-ins for not-yet-ported visual effects
        {"custom_cube", SA_RAINBOW},
    };
    for (auto& m : M) if (strcmp(key, m.k) == 0) return m.fx;
    return SA_RAINBOW;   // default for data effects with no visual native
}

struct ScheduleEntry {
    uint8_t hour;
    uint8_t minute;
    uint8_t effectId;
    bool    enabled;
};

// APOD (Astronomy Picture of the Day) cache: real fetched+decoded photo, PSRAM
// only (a decoded 64x64 RGB frame is 12KB, and the JPEG download buffer can be
// several hundred KB - internal RAM on this board can't safely hold that; if
// PSRAM isn't actually enumerating this boot, APOD just shows a placeholder
// instead of risking the same memory corruption fixed earlier tonight).
inline uint8_t*      g_apodPixels    = nullptr;   // 64x64 RGB888, PSRAM
inline volatile bool g_apodValid     = false;
inline volatile bool g_apodFetching  = false;

// ---- Module state -----------------------------------------------------
inline uint8_t       g_standaloneEffect               = SA_PULSE;   // default boot effect: pulsing RGB solid
inline ScheduleEntry  g_schedule[STANDALONE_MAX_SCHEDULE];
inline uint8_t        g_scheduleCount                 = 0;
inline Preferences    g_saPrefs;

// Live controls for the native effects, driven from the web UI (brightness
// slider, speed slider) so the browser stays a working remote even though the
// effects run on-device. Defaults chosen so a fresh boot with no browser looks
// good on its own.
inline volatile uint8_t g_nativeBrightness = 60;    // 0..255, panel drive level
inline volatile float   g_nativeSpeed      = 1.0f;  // time multiplier for effects
inline volatile uint8_t g_nativeBrightnessApplied = 255; // last value pushed to HW

// Native overlay enable flags, mirroring effects.js's OV.<key>.on. Synced from
// the browser's overlay toggles via the setOverlay command (web_server.h), so
// overlays keep running on-device the same way effects do. Only the on/off
// state is mirrored (not each overlay's density/speed/color sub-params) -
// native overlays use the same defaults as effects.js's OV object.
inline volatile bool g_ovStars     = false;
inline volatile bool g_ovSnow      = false;
inline volatile bool g_ovSparkle   = false;
inline volatile bool g_ovColorwave = false;
inline volatile bool g_ovPulse     = false;
inline volatile bool g_ovVignette  = false;
inline volatile bool g_ovScanline  = false;
inline volatile bool g_ovMist      = false;
inline volatile bool g_ovMeteors   = false;
inline volatile bool g_ovEdgeglow  = false;
inline volatile bool g_ovFire      = false;
inline volatile bool g_ovGlitch    = false;
inline volatile bool g_ovLightning = false;

// Display source of truth, owned by the ESP32 (not the browser). Default
// false = run native on-device effects and IGNORE any streamed video frames.
// The browser sets this true only for Panel 2D mode (pixel-perfect streaming).
// Making native the default here means a stale/old browser that's still
// streaming can't override the native effects - the ESP32 just drops its
// frames. This is the robust fix for "it's still coming from the browser".
inline volatile bool    g_streamMode = false;

// Per-effect option state, synced from the browser's effect option panels via
// the setOption command (web_server.h) - the "options within effects aren't
// replicated on the ESP32" gap. Extend this as more options get wired up;
// starting with fireworks' show mode (random vs. synchronized volleys).
inline volatile uint8_t g_fwMode = 0;   // 0=random (default), 1=sync

// Weather cache, refreshed periodically by standaloneWxFetch().
inline bool           g_wxValid       = false;
inline int            g_wxTemp        = 0;
inline int            g_wxCode        = 0;
inline uint32_t        g_wxSunriseSec  = 6UL * 3600;
inline uint32_t        g_wxSunsetSec   = 18UL * 3600;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
inline void standaloneHsvToRgb(float h, float s, float v, uint8_t& r, uint8_t& g, uint8_t& b) {
    float c = v * s;
    float x = c * (1 - fabsf(fmodf(h / 60.0f, 2.0f) - 1));
    float m = v - c;
    float rf, gf, bf;
    if      (h < 60)  { rf = c; gf = x; bf = 0; }
    else if (h < 120) { rf = x; gf = c; bf = 0; }
    else if (h < 180) { rf = 0; gf = c; bf = x; }
    else if (h < 240) { rf = 0; gf = x; bf = c; }
    else if (h < 300) { rf = x; gf = 0; bf = c; }
    else              { rf = c; gf = 0; bf = x; }
    r = (uint8_t)((rf + m) * 255);
    g = (uint8_t)((gf + m) * 255);
    b = (uint8_t)((bf + m) * 255);
}

// Deterministic pseudo-random 0..1 from an integer seed (no state, no
// stdlib rand() dependency) - used by the particle-ish native effects below
// to fake "random" positions/timing without needing to persist arrays.
inline float standaloneHash01(int n) {
    float x = sinf((float)n * 12.9898f) * 43758.5453f;
    return x - floorf(x);
}

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// ---- Helpers for the browser-effect ports below ------------------------
// The browser effects (effects.js) are written against hsl() with h,s,l in
// 0..1, plus lerp / smoothstep / fract. Provide native equivalents so the
// ports read almost identically to the JS and stay visually faithful.
inline void standaloneHslToRgb(float h, float s, float l,
                               uint8_t& r, uint8_t& g, uint8_t& b) {
    h -= floorf(h);                       // wrap hue into 0..1
    if (s <= 0.0f) { r = g = b = (uint8_t)(l * 255.0f); return; }
    auto hue2 = [](float p, float q, float t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1.0f/6) return p + (q - p) * 6 * t;
        if (t < 1.0f/2) return q;
        if (t < 2.0f/3) return p + (q - p) * (2.0f/3 - t) * 6;
        return p;
    };
    float q = l < 0.5f ? l * (1 + s) : l + s - l * s;
    float p = 2 * l - q;
    float rf = hue2(p, q, h + 1.0f/3);
    float gf = hue2(p, q, h);
    float bf = hue2(p, q, h - 1.0f/3);
    r = (uint8_t)(fminf(1.0f, fmaxf(0.0f, rf)) * 255.0f);
    g = (uint8_t)(fminf(1.0f, fmaxf(0.0f, gf)) * 255.0f);
    b = (uint8_t)(fminf(1.0f, fmaxf(0.0f, bf)) * 255.0f);
}
inline float saLerp(float a, float b, float t) { return a + (b - a) * t; }
inline float saClamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
inline float saSmooth(float e0, float e1, float x) {   // GLSL smoothstep
    float t = saClamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}
inline float saFract(float x) { return x - floorf(x); }

// ===========================================================================
// Native pixel buffer — mirrors the browser's colBuf model. Effects write
// into THIS (persistent across frames, so fade-trail effects that decay by
// multiplying, like effects.js's `colBuf[i]*=0.8`, work exactly the same
// way), overlays blend additively on top of it afterward, and exactly ONE
// blit step at the end pushes it to the real hardware via display->drawPixel
// (proven remap-safe, unlike fillRect/fillCircle's internal fast path which
// bypasses the four-scan remap entirely - see saFillRect's old comment,
// preserved below at snFillRect). Indexed per logical face (0..NUM_FACES-1),
// matching how the browser's faceMap addresses one flat 64x64 grid per face.
// ===========================================================================
// uint8_t (0..255) per channel, NOT float - a float buffer here (4 bytes/
// channel) was enough extra static RAM on this PSRAM-less, internal-RAM-only
// board to starve the network stack's own buffers, corrupting its output
// (symptom: the HTTP server sending garbled binary instead of valid
// responses - "Received HTTP/0.9 when not allowed" / random bytes where the
// status line should be). uint8_t is 4x smaller and loses no real precision:
// the final color565 blit already quantizes to 5/6/5 bits regardless.
// Allocate `bytes` preferring PSRAM (ps_malloc) when it's actually working on
// this boot, falling back to internal RAM (heap_caps_malloc) otherwise - same
// pattern as main.cpp's allocBuffer() for the video frame buffers. This board's
// PSRAM has been unreliable (fails to enumerate on some boots), so every
// caller of this must still work correctly with the internal-RAM fallback;
// PSRAM is a bonus that frees internal RAM when it happens to be present, not
// something anything depends on.
inline void* snAllocPreferPsram(size_t bytes) {
    void* p = nullptr;
    if (psramFound()) p = ps_malloc(bytes);
    if (!p) p = heap_caps_malloc(bytes, MALLOC_CAP_8BIT);
    return p;
}

#define SN_BUF_BYTES_PER_FACE (PANEL_SIZE * PANEL_SIZE * 3)
inline uint8_t* g_snBuf[NUM_FACES] = { nullptr };
inline void snEnsureBuf(int face) {
    if (!g_snBuf[face]) {
        g_snBuf[face] = (uint8_t*)snAllocPreferPsram(SN_BUF_BYTES_PER_FACE);
        memset(g_snBuf[face], 0, SN_BUF_BYTES_PER_FACE);
    }
}

inline void snSet(int face, int x, int y, float r, float g, float b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) return;
    snEnsureBuf(face);
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    p[0] = (uint8_t)(saClamp01(r) * 255.0f);
    p[1] = (uint8_t)(saClamp01(g) * 255.0f);
    p[2] = (uint8_t)(saClamp01(b) * 255.0f);
}
// Additive blend, clamped - what overlays use (matches colBuf's
// Math.min(1, colBuf[i]+r) pattern).
inline void snAdd(int face, int x, int y, float r, float g, float b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) return;
    snEnsureBuf(face);
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    p[0] = (uint8_t)(saClamp01(p[0] / 255.0f + r) * 255.0f);
    p[1] = (uint8_t)(saClamp01(p[1] / 255.0f + g) * 255.0f);
    p[2] = (uint8_t)(saClamp01(p[2] / 255.0f + b) * 255.0f);
}
// Per-channel max blend (matches colBuf's Math.max(colBuf[i], newVal)
// pattern - used where overlapping shapes should show whichever is
// brighter, not accumulate/wash out like snAdd).
inline void snMax(int face, int x, int y, float r, float g, float b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) return;
    snEnsureBuf(face);
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    uint8_t rr = (uint8_t)(saClamp01(r) * 255.0f), gg = (uint8_t)(saClamp01(g) * 255.0f), bb = (uint8_t)(saClamp01(b) * 255.0f);
    if (rr > p[0]) p[0] = rr;
    if (gg > p[1]) p[1] = gg;
    if (bb > p[2]) p[2] = bb;
}
// Decay the whole buffer (fade-trail effects: colBuf[i]*=mul each frame).
inline void snDecay(int face, float mul) {
    snEnsureBuf(face);
    uint8_t* p = g_snBuf[face];
    for (int i = 0; i < PANEL_SIZE * PANEL_SIZE * 3; i++) p[i] = (uint8_t)(p[i] * mul);
}
inline void snClear(int face) { snEnsureBuf(face); memset(g_snBuf[face], 0, SN_BUF_BYTES_PER_FACE); }
inline void snClearAll() { for (int f = 0; f < NUM_FACES; f++) snClear(f); }
// Read back a pixel's current 0..1 value - needed by overlays that sample
// the buffer (e.g. glitch, which shifts/re-blends existing pixels).
inline void snGet(int face, int x, int y, float& r, float& g, float& b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) { r = g = b = 0; return; }
    snEnsureBuf(face);
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    r = p[0] / 255.0f; g = p[1] / 255.0f; b = p[2] / 255.0f;
}
// Decode a color565 back to 0..1 floats - used by call sites that already
// built a color565 (most of the existing effect code) so they don't need
// rewriting to carry raw r,g,b floats through.
inline void snColor565ToRgb(uint16_t c, float& r, float& g, float& b) {
    r = ((c >> 11) & 0x1F) / 31.0f;
    g = ((c >> 5)  & 0x3F) / 63.0f;
    b = (c         & 0x1F) / 31.0f;
}

// ---- Back-compat shims: same call signatures as before (display, xOff, ...)
// so every existing effect function keeps working unchanged, but now writing
// into the buffer above instead of the hardware directly. `display` is kept
// as a parameter (unused) purely to avoid touching ~30 call sites; xOff
// determines which face's buffer slot to target (xOff / PANEL_SIZE).
inline void saPixel(MatrixPanel_I2S_DMA* display, int xOff, int x, int y,
                    float r, float g, float b) {
    (void)display;
    snSet(xOff / PANEL_SIZE, x, y, r, g, b);
}
inline void saFillRect(MatrixPanel_I2S_DMA* display, int x0, int y0, int w, int h, uint16_t color) {
    (void)display;
    float r, g, b; snColor565ToRgb(color, r, g, b);
    int face = x0 / PANEL_SIZE, lx0 = x0 % PANEL_SIZE;
    for (int y = y0; y < y0 + h; y++)
        for (int x = lx0; x < lx0 + w; x++)
            snSet(face, x, y, r, g, b);
}
inline void saFillCircle(MatrixPanel_I2S_DMA* display, int cx, int cy, int radius, uint16_t color) {
    (void)display;
    float r, g, b; snColor565ToRgb(color, r, g, b);
    int face = cx / PANEL_SIZE, lcx = cx % PANEL_SIZE;
    for (int y = -radius; y <= radius; y++)
        for (int x = -radius; x <= radius; x++)
            if (x * x + y * y <= radius * radius)
                snSet(face, lcx + x, cy + y, r, g, b);
}
// Shim for the 12 effects that call display->drawPixel(xOff+x, y, color565)
// directly (all absolute coordinates already baked in by the caller).
inline void snRawSet(int absX, int absY, uint16_t color) {
    float r, g, b; snColor565ToRgb(color, r, g, b);
    snSet(absX / PANEL_SIZE, absX % PANEL_SIZE, absY, r, g, b);
}

// Parses the "HH:MM" following a 'T' in an ISO-ish timestamp
// (Open-Meteo's daily sunrise/sunset format, e.g. "2026-07-12T06:12").
// Returns seconds-of-day, or 0 if not found.
inline uint32_t standaloneParseTimeOfDay(const char* iso) {
    if (!iso) return 0;
    const char* tpos = strchr(iso, 'T');
    if (!tpos) return 0;
    int hh = 0, mm = 0;
    sscanf(tpos + 1, "%d:%d", &hh, &mm);
    return (uint32_t)(hh * 3600 + mm * 60);
}

inline const char* standaloneWxCodeShort(int code) {
    if (code == 0)                     return "CLEAR";
    if (code >= 1  && code <= 3)       return "CLOUDY";
    if (code >= 45 && code <= 48)      return "FOG";
    if (code >= 51 && code <= 67)      return "RAIN";
    if (code >= 71 && code <= 77)      return "SNOW";
    if (code >= 80 && code <= 82)      return "SHOWERS";
    if (code >= 95)                    return "STORM";
    return "MIXED";
}

// Local "now" as seconds-of-day, honoring STANDALONE_TZ_OFFSET_MIN.
inline void standaloneLocalTm(struct tm& out, long* secOfDayOut = nullptr) {
    time_t now = time(nullptr) + (long)STANDALONE_TZ_OFFSET_MIN * 60;
    gmtime_r(&now, &out);
    if (secOfDayOut) *secOfDayOut = out.tm_hour * 3600L + out.tm_min * 60L + out.tm_sec;
}

// ---------------------------------------------------------------------------
// Persistence (NVS via Preferences)
// ---------------------------------------------------------------------------
inline void standaloneSaveSchedule() {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for (uint8_t i = 0; i < g_scheduleCount; i++) {
        JsonObject o = arr.add<JsonObject>();
        o["h"]  = g_schedule[i].hour;
        o["m"]  = g_schedule[i].minute;
        o["fx"] = g_schedule[i].effectId;
        o["on"] = g_schedule[i].enabled;
    }
    String out;
    serializeJson(doc, out);
    g_saPrefs.begin("standalone", false);
    g_saPrefs.putString("sched", out);
    g_saPrefs.end();
}

inline void standaloneSaveLastEffect(uint8_t id) {
    g_standaloneEffect = id;
    g_saPrefs.begin("standalone", false);
    g_saPrefs.putUChar("lastFx", id);
    g_saPrefs.end();
}

inline void standaloneLoad() {
    g_saPrefs.begin("standalone", true);
    // Always boot into the pulsing RGB solid, ignoring whatever effect was
    // last saved from earlier testing/use - "startup default" means every
    // boot, not just a blank/never-used flash. The saved lastFx value is
    // read to preserve compatibility with older code paths but intentionally
    // discarded here.
    (void)g_saPrefs.getUChar("lastFx", SA_PULSE);
    g_standaloneEffect = SA_PULSE;
    String sched = g_saPrefs.getString("sched", "");
    g_saPrefs.end();

    g_scheduleCount = 0;
    if (sched.length()) {
        JsonDocument doc;
        if (!deserializeJson(doc, sched)) {
            JsonArray arr = doc.as<JsonArray>();
            for (JsonObject o : arr) {
                if (g_scheduleCount >= STANDALONE_MAX_SCHEDULE) break;
                ScheduleEntry& e = g_schedule[g_scheduleCount];
                e.hour     = o["h"]  | 0;
                e.minute   = o["m"]  | 0;
                e.effectId = o["fx"] | 0;
                e.enabled  = o["on"] | false;
                g_scheduleCount++;
            }
        }
    }
    Serial.printf("[STANDALONE] loaded lastFx=%s scheduleEntries=%u\n",
                  standaloneEffectName(g_standaloneEffect), g_scheduleCount);
}

inline void standaloneNtpInit() {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("[STANDALONE] NTP sync requested (UTC; STANDALONE_TZ_OFFSET_MIN applied on top)");
}

// ---------------------------------------------------------------------------
// Weather fetch — blocking HTTPS + JSON, call from loop() (core 1), not the
// DMA task. Same technique as the F1 data fetch, just a different API.
// ---------------------------------------------------------------------------
inline bool standaloneWxFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;

    WiFiClientSecure client;
    client.setInsecure();   // no cert pinning — same trust model as browser JS fetch() has via the OS cert store, simplified for embedded use
    client.setTimeout(5);   // seconds - without PSRAM, a heap-starved TLS handshake can otherwise block far longer than any HTTPClient-level timeout catches
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);

    char url[256];
    snprintf(url, sizeof(url),
        "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
        "&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=UTC&forecast_days=1",
        (double)STANDALONE_WX_LAT, (double)STANDALONE_WX_LON);

    if (!http.begin(client, url)) {
        Serial.println("[WX] http.begin() failed");
        return false;
    }
    int code = http.GET();
    if (code != 200) {
        Serial.printf("[WX] HTTP %d\n", code);
        http.end();
        return false;
    }
    String payload = http.getString();
    http.end();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.printf("[WX] JSON parse error: %s\n", err.c_str());
        return false;
    }

    g_wxTemp = (int)lround((double)(doc["current"]["temperature_2m"] | 20.0));
    g_wxCode = doc["current"]["weather_code"] | 0;
    const char* sr = doc["daily"]["sunrise"][0] | "";
    const char* ss = doc["daily"]["sunset"][0]  | "";
    g_wxSunriseSec = standaloneParseTimeOfDay(sr);
    g_wxSunsetSec  = standaloneParseTimeOfDay(ss);
    g_wxValid = true;

    Serial.printf("[WX] temp=%dC code=%d sunrise=%lus sunset=%lus\n",
                  g_wxTemp, g_wxCode, (unsigned long)g_wxSunriseSec, (unsigned long)g_wxSunsetSec);
    return true;
}

// ---------------------------------------------------------------------------
// APOD fetch + real JPEG decode - blocking, call from loop() (core 1), same
// rule as weather. Ported from effectAPOD/apodFetch: query NASA's APOD API
// for today's image URL, download the JPEG, decode it with TJpg_Decoder, and
// nearest-neighbour scale into a 64x64 RGB buffer in PSRAM.
//
// PSRAM is REQUIRED here, checked explicitly (not just attempted-and-hope):
// a decoded frame is 12KB but the JPEG download itself can be several
// hundred KB, and this board's internal RAM already corrupted the HTTP
// server once tonight from far smaller static buffers. If PSRAM isn't
// enumerating this boot, this bails out cleanly and the render function
// falls back to a placeholder instead of risking that again.
// ---------------------------------------------------------------------------
inline uint16_t g_apodSrcW = 0, g_apodSrcH = 0;

inline bool apodTJpgCallback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
    if (!g_apodPixels || !g_apodSrcW || !g_apodSrcH) return false;
    for (int by = 0; by < h; by++) {
        int sy = y + by;
        if (sy >= g_apodSrcH) continue;
        int ty = (int)((long)sy * PANEL_SIZE / g_apodSrcH);
        if (ty >= PANEL_SIZE) continue;
        for (int bx = 0; bx < w; bx++) {
            int sx = x + bx;
            if (sx >= g_apodSrcW) continue;
            int tx = (int)((long)sx * PANEL_SIZE / g_apodSrcW);
            if (tx >= PANEL_SIZE) continue;
            uint16_t c565 = bitmap[by * w + bx];
            uint8_t r = ((c565 >> 11) & 0x1F) * 255 / 31;
            uint8_t g = ((c565 >> 5) & 0x3F) * 255 / 63;
            uint8_t b = (c565 & 0x1F) * 255 / 31;
            int pi = (ty * PANEL_SIZE + tx) * 3;
            g_apodPixels[pi] = r; g_apodPixels[pi + 1] = g; g_apodPixels[pi + 2] = b;
        }
    }
    return true;
}

inline bool standaloneApodFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (!psramFound()) {
        Serial.println("[APOD] PSRAM not available this boot - skipping (placeholder shown instead)");
        return false;
    }
    if (g_apodFetching) return false;
    g_apodFetching = true;

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    bool ok = false;

    if (http.begin(client, "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY")) {
        int code = http.GET();
        if (code == 200) {
            String payload = http.getString();
            http.end();
            JsonDocument doc;
            if (!deserializeJson(doc, payload)) {
                const char* mediaType = doc["media_type"] | "";
                const char* imgUrl = doc["url"] | "";
                if (strcmp(mediaType, "image") == 0 && imgUrl[0]) {
                    HTTPClient http2;
                    http2.setConnectTimeout(5000);
                    http2.setTimeout(5000);
                    WiFiClientSecure client2;
                    client2.setInsecure();
                    client2.setTimeout(5);
                    if (http2.begin(client2, imgUrl)) {
                        int code2 = http2.GET();
                        int len = http2.getSize();
                        // Cap at 1.5MB - a sane ceiling for a PSRAM (8MB) board;
                        // real APOD images are typically 100-500KB.
                        if (code2 == 200 && len > 0 && len < 1500000) {
                            uint8_t* jpgBuf = (uint8_t*)ps_malloc(len);
                            if (jpgBuf) {
                                WiFiClient* stream = http2.getStreamPtr();
                                size_t got = 0;
                                unsigned long startMs = millis();
                                while (got < (size_t)len && millis() - startMs < 20000) {
                                    if (stream->available()) {
                                        int n = stream->read(jpgBuf + got, len - got);
                                        if (n > 0) got += n;
                                    } else {
                                        delay(5);
                                    }
                                }
                                if (got == (size_t)len) {
                                    if (!g_apodPixels) g_apodPixels = (uint8_t*)ps_malloc(PANEL_SIZE * PANEL_SIZE * 3);
                                    if (g_apodPixels && TJpgDec.getJpgSize(&g_apodSrcW, &g_apodSrcH, jpgBuf, len)) {
                                        // Pick the largest decode-scale (1/2/4/8) that
                                        // still leaves the source >= panel size, so we
                                        // downscale during decode instead of after -
                                        // much less peak memory for the decoder's own
                                        // internal MCU buffers.
                                        uint8_t scale = 1;
                                        while (scale < 8 && (g_apodSrcW / (scale * 2)) >= PANEL_SIZE) scale *= 2;
                                        TJpgDec.setJpgScale(scale);
                                        g_apodSrcW /= scale; g_apodSrcH /= scale;
                                        TJpgDec.setCallback(apodTJpgCallback);
                                        memset(g_apodPixels, 0, PANEL_SIZE * PANEL_SIZE * 3);
                                        if (TJpgDec.drawJpg(0, 0, jpgBuf, len) == JDR_OK) {
                                            g_apodValid = true;
                                            ok = true;
                                            Serial.printf("[APOD] decoded %ux%u -> 64x64\n", g_apodSrcW, g_apodSrcH);
                                        } else {
                                            Serial.println("[APOD] JPEG decode failed");
                                        }
                                    }
                                } else {
                                    Serial.printf("[APOD] download incomplete (%u/%d bytes)\n", (unsigned)got, len);
                                }
                                free(jpgBuf);
                            } else {
                                Serial.println("[APOD] ps_malloc failed for JPEG buffer");
                            }
                        } else {
                            Serial.printf("[APOD] image fetch HTTP %d, len=%d\n", code2, len);
                        }
                        http2.end();
                    }
                } else {
                    Serial.println("[APOD] today's entry isn't an image (video/other) - skipping");
                }
            }
        } else {
            http.end();
            Serial.printf("[APOD] HTTP %d\n", code);
        }
    }
    g_apodFetching = false;
    return ok;
}

// ---------------------------------------------------------------------------
// Schedule / alarm check — call every ~20-30s from loop(). Fires at most
// once per calendar minute so a slow poll interval can't double-fire.
// ---------------------------------------------------------------------------
inline void standaloneCheckSchedule() {
    time_t rawNow = time(nullptr);
    if (rawNow < 100000) return;   // NTP hasn't synced yet

    struct tm tmv;
    long secOfDay;
    standaloneLocalTm(tmv, &secOfDay);

    static int16_t lastFiredMinuteOfDay = -1;
    int minuteOfDay = tmv.tm_hour * 60 + tmv.tm_min;
    if (minuteOfDay == lastFiredMinuteOfDay) return;

    for (uint8_t i = 0; i < g_scheduleCount; i++) {
        if (!g_schedule[i].enabled) continue;
        if (g_schedule[i].hour == tmv.tm_hour && g_schedule[i].minute == tmv.tm_min) {
            standaloneSaveLastEffect(g_schedule[i].effectId);
            lastFiredMinuteOfDay = minuteOfDay;
            Serial.printf("[SCHED] %02d:%02d -> %s\n",
                          tmv.tm_hour, tmv.tm_min, standaloneEffectName(g_schedule[i].effectId));
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Native effect renderers — one face at a time, same coordinate convention
// as drawBringupTestPattern (xOff = face * PANEL_SIZE).
// ---------------------------------------------------------------------------
inline void standaloneRenderRainbow(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float hue = fmodf((x + y) * 4.0f + t * 60.0f, 360.0f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        }
    }
}

// Default boot effect: a solid full-screen colour that cycles through the RGB
// spectrum while its brightness pulses smoothly from 10% up to 100% and back.
inline void standaloneRenderPulse(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    // brightness 10% -> 100% -> 10%
    float pulse = 0.1f + 0.9f * (0.5f + 0.5f * sinf(t * 1.6f));
    // hue sweeps the full colour wheel over time
    float hue = fmodf(t * 30.0f, 360.0f);
    uint8_t r, g, b;
    standaloneHsvToRgb(hue, 1.0f, pulse, r, g, b);
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(r, g, b));
}

inline void standaloneRenderPlasma(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float v = sinf(x * 0.25f + t) + sinf(y * 0.25f - t) + sinf((x + y) * 0.15f + t * 1.3f);
            float hue = fmodf((v + 3.0f) * 60.0f, 360.0f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        }
    }
}

// Text for SA_CLOCK/SA_WEATHER is drawn to the real hardware AFTER the main
// blit (see the "// Post-blit text overlay" step at the end of
// standaloneRender), not here. display->print()/setCursor() write straight
// to the panel, bypassing our snBuf entirely - drawing them here, before the
// blit that copies snBuf to the panel, meant the blit immediately painted
// over them with blank buffer content every frame (symptom: clock showed
// nothing at all). This function only prepares the background/graphics
// (which DO go through the buffer correctly) and the text string to draw.
inline char g_clockTimeBuf[9] = "";
inline char g_clockDateBuf[12] = "";

inline void standaloneRenderClock(MatrixPanel_I2S_DMA* display, int face) {
    (void)display;
    snClear(face);
    struct tm tmv;
    standaloneLocalTm(tmv);
    snprintf(g_clockTimeBuf, sizeof(g_clockTimeBuf), "%02d:%02d", tmv.tm_hour, tmv.tm_min);
    snprintf(g_clockDateBuf, sizeof(g_clockDateBuf), "%02d/%02d/%04d", tmv.tm_mday, tmv.tm_mon + 1, tmv.tm_year + 1900);
}

// Text for SA_WEATHER is drawn after the blit too, same reason as clock -
// see the note above standaloneRenderClock.
inline char g_wxLine1Buf[8] = "";
inline const char* g_wxLine2Buf = "";

// Weather condition flags, matching effectWeather's wxCode ranges.
inline bool standaloneWxIsRain(int code)  { return (code >= 51 && code <= 65) || (code >= 80 && code <= 82) || code >= 95; }
inline bool standaloneWxIsSnow(int code)  { return (code >= 71 && code <= 77) || code == 85 || code == 86; }
inline bool standaloneWxIsFog(int code)   { return code >= 45 && code <= 48; }
inline bool standaloneWxIsStorm(int code) { return code >= 95; }

inline void standaloneRenderWeather(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;

    struct tm tmv;
    long secOfDay;
    standaloneLocalTm(tmv, &secOfDay);
    float dayFrac = secOfDay / 86400.0f;

    bool isDay = g_wxValid
        ? (secOfDay >= (long)g_wxSunriseSec && secOfDay < (long)g_wxSunsetSec)
        : (tmv.tm_hour >= 6 && tmv.tm_hour < 18);

    // Twilight blend (matches effectWeather's lightLvl): fades over 1h either
    // side of sunrise/sunset instead of a hard day/night cut.
    float lightLvl = isDay ? 1.0f : 0.0f;
    if (g_wxValid) {
        const float twilS = 3600.0f;
        float toSr = (float)g_wxSunriseSec - secOfDay, fromSs = secOfDay - (float)g_wxSunsetSec;
        if (!isDay && toSr > 0 && toSr < twilS) lightLvl = 1.0f - toSr / twilS;
        if (!isDay && fromSs > 0 && fromSs < twilS) lightLvl = 1.0f - fromSs / twilS;
    }

    // Sky: vertical gradient, blended smoothly across the twilight fade
    // rather than a hard day/night cut. Drawn via snSet (not drawFastHLine,
    // which - like fillRect/fillCircle - bypasses the virtual drawPixel the
    // four-scan remap depends on).
    float topR = saLerp(5, 70, lightLvl) / 255.0f, topG = saLerp(8, 140, lightLvl) / 255.0f, topB = saLerp(30, 235, lightLvl) / 255.0f;
    float botR = saLerp(20, 160, lightLvl) / 255.0f, botG = saLerp(20, 210, lightLvl) / 255.0f, botB = saLerp(55, 250, lightLvl) / 255.0f;
    for (int y = 0; y < S; y++) {
        float f = (float)y / (S - 1);
        float r = saLerp(topR, botR, f), g = saLerp(topG, botG, f), b = saLerp(topB, botB, f);
        for (int x = 0; x < S; x++) snSet(face, x, y, r, g, b);
    }

    // Sun/moon arc: elevation follows sin(progress*PI) like the browser
    // (rises from the horizon, peaks at midday/midnight, sets), not a flat
    // left-to-right line.
    float dayLen = g_wxValid ? (float)(g_wxSunsetSec - g_wxSunriseSec) : 43200.0f;
    if (dayLen <= 0) dayLen = 43200.0f;
    float dayProg = isDay ? (secOfDay - (float)g_wxSunriseSec) / dayLen : 0;
    float nightLen = 86400.0f - dayLen; if (nightLen <= 0) nightLen = 43200.0f;
    float fromSunset = secOfDay > (float)g_wxSunsetSec ? secOfDay - (float)g_wxSunsetSec : secOfDay + (86400.0f - (float)g_wxSunsetSec);
    float nightProg = !isDay ? fromSunset / nightLen : 0;
    float prog = isDay ? dayProg : nightProg;
    float elev = sinf(constrain(prog, 0.0f, 1.0f) * (float)M_PI);
    int cx = 6 + (int)(constrain(prog, 0.0f, 1.0f) * (S - 12));
    int cy = (int)(S * 0.42f - elev * S * 0.32f);
    float dr = isDay ? 1.0f : 0.84f, dg = isDay ? 0.86f : 0.84f, db = isDay ? 0.31f : 0.88f;
    const int R = 5;
    for (int y = -R; y <= R; y++)
        for (int x = -R; x <= R; x++)
            if (x * x + y * y <= R * R) snSet(face, cx + x, cy + y, dr, dg, db);

    // Precipitation.
    int code = g_wxCode;
    if (standaloneWxIsRain(code)) {
        for (int i = 0; i < 24; i++) {
            float px = standaloneHash01(i * 13) * S;
            float py = fmodf(standaloneHash01(i * 19) * S + t * (S * 1.6f), (float)S);
            snAdd(face, (int)px, (int)py, 0.15f, 0.15f, 0.35f);
        }
    } else if (standaloneWxIsSnow(code)) {
        for (int i = 0; i < 20; i++) {
            float px = fmodf(standaloneHash01(i * 13) * S + sinf(t + i) * 3, (float)S);
            float py = fmodf(standaloneHash01(i * 19) * S + t * (S * 0.4f), (float)S);
            snAdd(face, (int)px, (int)py, 0.7f, 0.7f, 0.75f);
        }
    } else if (standaloneWxIsFog(code)) {
        for (int y = S / 2; y < S; y++) for (int x = 0; x < S; x++) snAdd(face, x, y, 0.15f, 0.15f, 0.15f);
    }
    if (standaloneWxIsStorm(code) && standaloneHash01((int)(t * 3.0f)) > 0.92f) {
        for (int y = 0; y < S; y++) snAdd(face, S / 2, y, 0.6f, 0.6f, 0.7f);
    }

    if (g_wxValid) snprintf(g_wxLine1Buf, sizeof(g_wxLine1Buf), "%dC", g_wxTemp);
    else           snprintf(g_wxLine1Buf, sizeof(g_wxLine1Buf), "WX --");
    g_wxLine2Buf = g_wxValid ? standaloneWxCodeShort(g_wxCode) : "NO DATA";
}

// Faithful port of the browser's effectFireworks: rockets launch from the
// bottom, rise under gravity leaving a fading trail, then burst into a shower
// of particles that spread radially, fall under gravity, and fade out. The
// signature look is the persistent fade trails - reproduced here with a
// per-pixel buffer that's dimmed ~20% every frame (matching colBuf*=0.80),
// with heads drawn additively (max) into it, then blitted to the panel.
struct FwParticle { float col, v, vc, vy, hue, life, decay, bright; bool active; };
struct FwRocket   { float col, v, vy, vc, hue, hue2; bool active; };

// NOTE: rocket/particle state below is `static`, so it's shared across all
// faces - fine for the current 1-panel setup (identical single instance),
// but if NUM_FACES > 1 every face would show the exact same fireworks
// animation in lockstep rather than independent ones. Would need per-face
// arrays (indexed by `face`) to fix for a full multi-panel cube.
inline void standaloneRenderFireworks(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const int S = PANEL_SIZE;
    static uint8_t* buf = nullptr;   // fade buffer, RGB888
    static FwRocket   rockets[10];
    static FwParticle parts[420];
    static bool   init = false;
    static float  lastT = 0, spawnT = 0;
    static uint32_t rng = 0x1234567;
    if (!init) {
        buf = (uint8_t*)snAllocPreferPsram(PANEL_SIZE * PANEL_SIZE * 3);
        memset(buf, 0, PANEL_SIZE * PANEL_SIZE * 3);
        init = true; lastT = t;
    }
    // xorshift PRNG for per-frame variety (Math.random equivalent)
    auto rnd = [&]() { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return (rng & 0xFFFFFF) / (float)0xFFFFFF; };

    float dt = t - lastT; lastT = t;
    if (dt < 0) dt = 0; if (dt > 0.1f) dt = 0.1f;

    // Fade the whole buffer ~20% (colBuf *= 0.80).
    for (int i = 0; i < S * S * 3; i++) buf[i] = (uint8_t)((buf[i] * 205) >> 8);

    auto addPix = [&](int x, int y, float r, float g, float b) {
        if (x < 0 || x >= S || y < 0 || y >= S) return;
        int i = (y * S + x) * 3;
        uint8_t rr = (uint8_t)(saClamp01(r) * 255), gg = (uint8_t)(saClamp01(g) * 255), bb = (uint8_t)(saClamp01(b) * 255);
        if (rr > buf[i])   buf[i]   = rr;   // additive max, like fwSet
        if (gg > buf[i+1]) buf[i+1] = gg;
        if (bb > buf[i+2]) buf[i+2] = bb;
    };

    // Launch new rockets. Two modes, synced from the browser's Sync Show
    // option (setOption cmd, mirrors fwMode):
    // - random (default): independent single/double launches every ~0.4s,
    //   each with its own random hue - matches the browser's random branch.
    // - sync: periodic unified volleys (3-5 rockets at once, sharing one
    //   hue/hue2 "theme") every ~2.5-4s - a simplified stand-in for the
    //   browser's full scripted FW_SYNC_ACTS routine table (which schedules
    //   specific shapes/timings via a large routine list), capturing the
    //   core "one coordinated themed show" feel rather than the exact script.
    if (g_fwMode == 1) {
        spawnT += dt;
        if (spawnT > 0) spawnT = spawnT;   // (kept for symmetry, unused in sync branch)
        static float syncWait = 0;
        syncWait -= dt;
        if (syncWait <= 0) {
            syncWait = 2.5f + rnd() * 1.5f;
            float sharedHue = rnd(), sharedHue2 = rnd();
            int volley = 3 + (int)(rnd() * 3);
            for (int v = 0; v < volley; v++) {
                for (int k = 0; k < 10; k++) if (!rockets[k].active) {
                    rockets[k] = { rnd() * S, 0, S * (0.88f + rnd() * 0.45f), (rnd() - 0.5f) * S * 0.3f, sharedHue, sharedHue2, true };
                    break;
                }
            }
        }
    } else {
        spawnT += dt;
        if (spawnT > 0.4f) {
            spawnT = 0;
            for (int shots = 0; shots < (rnd() > 0.6f ? 2 : 1); shots++)
                for (int k = 0; k < 10; k++) if (!rockets[k].active) {
                    rockets[k] = { rnd() * S, 0, S * (0.88f + rnd() * 0.45f), (rnd() - 0.5f) * S * 0.3f, rnd(), rnd(), true };
                    break;
                }
        }
    }

    // Rockets rise, gravity, burst at apex.
    const float G = S * 0.06f;
    for (int k = 0; k < 10; k++) {
        if (!rockets[k].active) continue;
        FwRocket& r = rockets[k];
        r.vy -= S * 0.85f * dt; r.v += r.vy * dt; r.col += r.vc * dt;
        uint8_t rr, gg, bb;
        standaloneHslToRgb(r.hue, 1.0f, 0.9f, rr, gg, bb);
        addPix((int)lroundf(r.col), (S - 1) - (int)lroundf(r.v), rr/255.0f, gg/255.0f, bb/255.0f);
        if (r.vy <= 0 || r.v >= S - 1) {
            // Burst: spawn a ring of particles.
            bool mono = rnd() > 0.5f;
            int n = 30 + (int)(rnd() * 55);
            float spd = S * (0.25f + rnd() * 0.35f) * (0.6f + rnd());
            for (int i = 0; i < n; i++) {
                for (int p = 0; p < 420; p++) if (!parts[p].active) {
                    float a = (i / (float)n) * 6.2832f + rnd() * 0.3f;
                    float rad = spd * (0.4f + rnd() * 0.6f);
                    float h = mono ? r.hue : ((i % 3 == 0) ? r.hue2 : r.hue + rnd() * 0.1f);
                    parts[p] = { r.col, r.v, cosf(a) * rad, sinf(a) * rad * (0.5f + rnd()), h, 1.0f, 0.006f + rnd() * 0.008f, 0.85f + rnd() * 0.15f, true };
                    break;
                }
            }
            r.active = false;
        }
    }

    // Burst particles: gravity, life decay.
    for (int p = 0; p < 420; p++) {
        if (!parts[p].active) continue;
        FwParticle& b = parts[p];
        b.col += b.vc * dt; b.v += b.vy * dt; b.vy -= G * dt; b.life -= b.decay;
        if (b.life <= 0 || b.v < 0) { b.active = false; continue; }
        uint8_t rr, gg, bb;
        standaloneHslToRgb(b.hue, 1.0f, b.life * b.bright, rr, gg, bb);
        addPix((int)lroundf(b.col), (S - 1) - (int)lroundf(b.v), rr/255.0f, gg/255.0f, bb/255.0f);
    }

    // Blit the fade buffer to the panel.
    for (int y = 0; y < S; y++)
        for (int x = 0; x < S; x++) {
            int i = (y * S + x) * 3;
            snRawSet(xOff + x, y, display->color565(buf[i], buf[i+1], buf[i+2]));
        }
}

inline void standaloneRenderGradientWash(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float hue = fmodf((x - y) * 3.0f + t * 40.0f + 720.0f, 360.0f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        }
    }
}

inline void standaloneRenderAurora(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 8));
    for (int x = 0; x < PANEL_SIZE; x++) {
        float baseY1 = PANEL_SIZE * 0.5f + sinf(x * 0.18f + t * 1.1f) * 12.0f;
        float baseY2 = PANEL_SIZE * 0.55f + sinf(x * 0.12f - t * 0.8f + 2.0f) * 16.0f;
        for (int band = 0; band < 2; band++) {
            float baseY = band == 0 ? baseY1 : baseY2;
            float hue = band == 0 ? 140.0f : 260.0f;
            for (int dy = -6; dy <= 6; dy++) {
                int y = (int)baseY + dy;
                if (y < 0 || y >= PANEL_SIZE) continue;
                float fade = 1.0f - fabsf((float)dy) / 6.0f;
                if (fade <= 0) continue;
                uint8_t r, g, b;
                standaloneHsvToRgb(hue, 0.8f, fade * 0.8f, r, g, b);
                snRawSet(xOff + x, y, display->color565(r, g, b));
            }
        }
    }
}

inline void standaloneRenderSpectrum(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    const int BARS = 8;
    const int barW = PANEL_SIZE / BARS;
    for (int i = 0; i < BARS; i++) {
        float speed = 1.5f + i * 0.37f;
        float h = (0.15f + 0.85f * fabsf(sinf(t * speed + i * 1.3f))) * PANEL_SIZE;
        for (int x = i * barW; x < i * barW + barW - 1; x++) {
            for (int y = PANEL_SIZE - 1; y > PANEL_SIZE - 1 - (int)h; y--) {
                float f = (float)(PANEL_SIZE - y) / PANEL_SIZE;
                uint8_t r, g, b;
                standaloneHsvToRgb(120.0f - f * 120.0f, 1.0f, 1.0f, r, g, b);
                snRawSet(xOff + x, y, display->color565(r, g, b));
            }
        }
    }
}

// Faithful port of effectBouncingBalls' panel2dMode path (no gyro on this
// board, so the gyroEnabled/rotChange gravity-nudge branches never fire -
// matching the browser's own behaviour with gyro unavailable/disabled):
// each ball moves at constant velocity, bounces elastically off the panel
// walls and off each other, exactly the real physics, not an approximation.
inline void standaloneRenderBalls(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;
    const int NBALLS = 6;   // ballsPerFace(3) * 2, matching panel2dMode's doubled count
    struct Ball { float u, v, du, dv, r, cr, cg, cb; };
    static Ball balls[NBALLS];
    static bool init = false;
    static float lastT = 0;
    // Same 12-colour palette as resetBalls' COLORS array.
    static const float PAL[12][3] = {
        {1,0.15f,0.15f},{0.15f,1,0.15f},{0.2f,0.4f,1},{1,1,0.1f},
        {1,0.4f,0},{0.9f,0.15f,0.9f},{0,0.9f,0.9f},{1,0.6f,0.7f},
        {0.5f,1,0.3f},{1,0.5f,0.1f},{0.3f,0.5f,1},{0.8f,0.2f,0.5f},
    };
    if (!init) {
        for (int i = 0; i < NBALLS; i++) {
            float R = 3 + (int)(standaloneHash01(i * 7) * 3);
            float ang = standaloneHash01(i * 11) * 6.2832f;
            float spd = S * (0.3f + standaloneHash01(i * 13) * 0.4f);
            balls[i] = { R + 1 + standaloneHash01(i * 17) * (S - 2 * R - 2),
                         R + 1 + standaloneHash01(i * 19) * (S - 2 * R - 2),
                         cosf(ang) * spd, sinf(ang) * spd, R,
                         PAL[i % 12][0], PAL[i % 12][1], PAL[i % 12][2] };
        }
        init = true; lastT = t;
    }
    float dt = t - lastT; lastT = t;
    if (dt < 0) dt = 0; if (dt > 0.1f) dt = 0.1f;
    snClear(face);

    const float S1 = S - 1;
    for (int i = 0; i < NBALLS; i++) {
        Ball& b = balls[i];
        b.u += b.du * dt; b.v += b.dv * dt;
        float R = b.r;
        if (b.u < R)      { b.u = R;      b.du = fabsf(b.du); }
        if (b.u > S1 - R) { b.u = S1 - R; b.du = -fabsf(b.du); }
        if (b.v < R)      { b.v = R;      b.dv = fabsf(b.dv); }
        if (b.v > S1 - R) { b.v = S1 - R; b.dv = -fabsf(b.dv); }
    }
    // Ball-ball elastic collisions (same overlap-separation + relative-
    // velocity-along-normal impulse as the browser).
    for (int i = 0; i < NBALLS; i++) {
        for (int j = i + 1; j < NBALLS; j++) {
            Ball& a = balls[i]; Ball& b2 = balls[j];
            float dx = b2.u - a.u, dy = b2.v - a.v;
            float dist = sqrtf(dx * dx + dy * dy);
            float minD = a.r + b2.r;
            if (dist < minD && dist > 0.1f) {
                float nx = dx / dist, ny = dy / dist;
                float overlap = (minD - dist) * 0.5f;
                a.u -= nx * overlap; a.v -= ny * overlap;
                b2.u += nx * overlap; b2.v += ny * overlap;
                float relV = (b2.du - a.du) * nx + (b2.dv - a.dv) * ny;
                if (relV < 0) {
                    a.du += relV * nx * 0.5f; a.dv += relV * ny * 0.5f;
                    b2.du -= relV * nx * 0.5f; b2.dv -= relV * ny * 0.5f;
                }
            }
        }
    }
    // Render: shaded circle (dist-based shading + edge darkening), max-blend
    // so overlapping balls show whichever colour is brighter, matching the
    // browser's colBuf Math.max compositing.
    for (int i = 0; i < NBALLS; i++) {
        Ball& b = balls[i];
        int cu = (int)lroundf(b.u), cv = (int)lroundf(b.v);
        int R = (int)b.r, R2 = R * R;
        for (int dv = -R; dv <= R; dv++) {
            for (int du = -R; du <= R; du++) {
                int d2 = du * du + dv * dv;
                if (d2 > R2) continue;
                float dist = sqrtf((float)d2) / R;
                float shade = 1.0f - dist * 0.55f;
                float edge = dist > 0.75f ? 0.5f : 1.0f;
                snMax(face, cu + du, cv + dv, b.cr * shade * edge, b.cg * shade * edge, b.cb * shade * edge);
            }
        }
    }
}

inline void standaloneRenderStrobe(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    bool on = fmodf(t, 0.3f) < 0.12f;
    uint16_t col = on ? display->color565(255, 255, 255) : display->color565(0, 0, 0);
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, col);
}

inline void standaloneRenderLightning(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(2, 2, 10));
    int bucket = (int)(t * 3.0f) + face * 97;
    bool flash = standaloneHash01(bucket) > 0.8f;
    if (!flash) return;
    int x = PANEL_SIZE / 2;
    for (int y = 0; y < PANEL_SIZE; y++) {
        x += (int)(standaloneHash01(bucket * 131 + y) * 5.0f) - 2;
        x = constrain(x, 2, PANEL_SIZE - 3);
        snRawSet(xOff + x, y, display->color565(255, 255, 255));
        snRawSet(xOff + x + 1, y, display->color565(200, 200, 255));
    }
}

inline void standaloneRenderTide(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        float hue = fmodf(y * 4.0f + t * 20.0f, 360.0f);
        for (int x = 0; x < PANEL_SIZE; x++) {
            float shimmer = 0.7f + 0.3f * sinf(x * 0.2f + t * 1.5f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 0.9f, shimmer, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        }
    }
}

// Faithful port of effects.js's default "colour rain" mode (effectRain, the
// rainStyle==='colour' branch - the actual default, not the 'matrix'
// alternate style): per-drop random hue/length/brightness/width, splash at
// the bottom, occasional full-column chromatic flash. Previous native
// version was a much simpler placeholder (basic blue drops, no splash, no
// per-drop colour) that didn't match the browser at all.
inline void standaloneRenderRain(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;
    struct Drop { float col, y, speed, hue, len, bright; bool wide; };
    const int NDROPS = 40;   // matches JS's max(16, SIZE*2.5) for SIZE=64 -> 160 across 4 faces == 40/face
    static Drop drops[NDROPS];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < NDROPS; i++) {
            drops[i] = { (float)(int)(standaloneHash01(i * 7) * S), standaloneHash01(i * 11) * S,
                         0.35f + standaloneHash01(i * 13) * 0.9f, standaloneHash01(i * 17),
                         5 + standaloneHash01(i * 19) * S * 0.22f, 0.7f + standaloneHash01(i * 23) * 0.3f,
                         standaloneHash01(i * 29) < 0.15f };
        }
        init = true;
    }
    snDecay(face, 0.78f);   // colBuf[i]*=0.78 each frame in the JS
    const float dt = 1.0f / CUBE_FPS;   // standaloneRender's tick rate
    for (int i = 0; i < NDROPS; i++) {
        Drop& d = drops[i];
        d.y -= d.speed * dt * (S * 0.48f);
        if (d.y < -d.len) {
            d.y = S + d.len;
            d.col = (float)(int)(standaloneHash01((int)(t * 977) + i) * S);
            d.hue = standaloneHash01((int)(t * 613) + i * 3);
            d.wide = standaloneHash01((int)(t * 431) + i * 5) < 0.15f;
        }
        for (int k = 0; k < (int)d.len; k++) {
            int vy = (int)lroundf(d.y + k);
            if (vy < 0 || vy >= S) continue;
            // The browser's faceMap treats v=0 as the BOTTOM of the panel
            // (falling = decreasing v). Our snBuf is top-origin (y=0 = top),
            // so flip here at the point of drawing rather than rewriting the
            // physics/timing above - this was drawing rain rising instead of
            // falling before this fix.
            int screenY = S - 1 - vy;
            float fade = powf(1 - k / d.len, 1.2f) * d.bright;
            float h = saFract(d.hue + k / d.len * 0.15f);
            uint8_t r, g, b;
            standaloneHslToRgb(h, 1.0f, fade * 0.95f, r, g, b);
            snSet(face, (int)d.col, screenY, r / 255.0f, g / 255.0f, b / 255.0f);
            if (d.wide) {
                snSet(face, (int)d.col - 1, screenY, r / 510.0f, g / 510.0f, b / 510.0f);
                snSet(face, (int)d.col + 1, screenY, r / 510.0f, g / 510.0f, b / 510.0f);
            }
            if (vy == 0 && k < 4) {   // vy==0 is the bottom in JS's convention
                float sp = fade * 0.8f;
                for (int s = -4; s <= 4; s++) {
                    float sf = fmaxf(0.0f, 1 - fabsf((float)s) / 4.0f) * sp * 0.5f;
                    uint8_t sr, sg, sb;
                    standaloneHslToRgb(h, 1.0f, sf, sr, sg, sb);
                    snSet(face, (int)d.col + s, S - 1, sr / 255.0f, sg / 255.0f, sb / 255.0f);
                }
            }
        }
        uint8_t rh, gh, bh;
        standaloneHslToRgb(d.hue, 0.3f, d.bright, rh, gh, bh);
        snSet(face, (int)d.col, S - 1 - (int)lroundf(d.y), rh / 255.0f, gh / 255.0f, bh / 255.0f);
    }
    // Occasional full-column chromatic flash (JS: Math.random() < dt*0.8).
    if (standaloneHash01((int)(t * 1000.0f)) < dt * 0.8f) {
        int col = (int)(standaloneHash01((int)(t * 2000.0f)) * S);
        float hue = standaloneHash01((int)(t * 3000.0f));
        for (int y = 0; y < S; y++) {
            float b2 = powf(standaloneHash01((int)(t * 4000.0f) + y), 1.5f) * 0.85f;
            uint8_t r, g, b;
            standaloneHslToRgb(saFract(hue + (float)y / S * 0.3f), 0.9f, b2, r, g, b);
            snSet(face, col, y, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}

// ===========================================================================
// Ports of browser effects (effects.js) to native C++, so they run on the
// ESP32 with no browser attached. Rendered as a flat 64x64 field: the front
// panel's normalized coords are x=u/(S-1), y=v/(S-1); the cube's third axis
// (z) is held constant since a single panel is a flat plane. Each keeps the
// same math/structure as its JS original so the look matches closely. The
// shared `t` accumulator is passed in from the dispatcher.
// ===========================================================================
inline void standaloneRenderWave(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const float z = 0.5f;
    const float tt = t * 1.1f;
    for (int py = 0; py < PANEL_SIZE; py++) {
        float y = (float)py / (PANEL_SIZE - 1);
        for (int px = 0; px < PANEL_SIZE; px++) {
            float x = (float)px / (PANEL_SIZE - 1);
            float w1 = sinf((x + z) * 6.2f + tt) * cosf(y * 4.5f - tt * 0.8f);
            float w2 = sinf((x - z) * 4.8f + tt * 1.4f) * sinf(y * 5.2f + tt * 0.6f);
            float w3 = sinf((x * 0.7f + y * 0.9f + z * 0.5f) * 7 + tt * 0.9f);
            float w = (w1 + w2 + w3) / 3;
            float bright = w * 0.5f + 0.5f;
            float hue = saFract(x * 0.35f + y * 0.25f + z * 0.35f + tt * 0.045f);
            uint8_t r8, g8, b8;
            standaloneHslToRgb(hue, 1.0f, bright * 0.72f, r8, g8, b8);
            float r = r8 / 255.0f, g = g8 / 255.0f, b = b8 / 255.0f;
            float spark = fmaxf(0.0f, (w1 + w2 + w3 - 2.2f) / 0.8f);
            saPixel(display, xOff, px, py, r + spark * 0.9f, g + spark * 0.9f, b + spark * 0.9f);
        }
    }
}

inline void standaloneRenderDepthRings(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const float tt = t * 0.75f;
    for (int py = 0; py < PANEL_SIZE; py++) {
        float y = (float)py / (PANEL_SIZE - 1);
        for (int px = 0; px < PANEL_SIZE; px++) {
            float x = (float)px / (PANEL_SIZE - 1);
            float dx = x - 0.5f, dy = y - 0.5f;
            float dist = sqrtf(dx * dx + dy * dy) * 2;
            float ang = atan2f(dy, dx);
            float twist = ang * 1.6f + dist * 2.5f;
            float ring = sinf(dist * (float)M_PI * 9 - tt * 2.4f + twist);
            float ring2 = sinf(dist * (float)M_PI * 4.5f + tt * 1.1f + ang);
            float bright = ((ring * 0.6f + ring2 * 0.4f) * 0.5f + 0.5f) * (1 - dist * 0.42f) * 0.88f;
            float hue = saFract(dist * 0.65f + ang / ((float)M_PI * 2) * 0.3f + tt * 0.055f);
            uint8_t r8, g8, b8;
            standaloneHslToRgb(hue, 1.0f, fmaxf(0.0f, bright), r8, g8, b8);
            saPixel(display, xOff, px, py, r8 / 255.0f, g8 / 255.0f, b8 / 255.0f);
        }
    }
}

inline void standaloneRenderPrism(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const float z = 0.5f;
    const float tt = t * 0.55f;
    const float beamAng = tt * 0.6f, beamW = 0.18f;
    for (int py = 0; py < PANEL_SIZE; py++) {
        float y = (float)py / (PANEL_SIZE - 1);
        for (int px = 0; px < PANEL_SIZE; px++) {
            float x = (float)px / (PANEL_SIZE - 1);
            float diag = (x + y + z) / 3;
            float cross = fabsf(x - z);
            float base = 0.28f + sinf(diag * (float)M_PI * 5.5f + tt) * 0.28f;
            float hue = saFract(diag * 0.92f + tt * 0.065f);
            uint8_t r8, g8, b8;
            standaloneHslToRgb(hue, 0.78f + saSmooth(0, 1, cross) * 0.22f, fmaxf(0.0f, base), r8, g8, b8);
            float r = r8 / 255.0f, g = g8 / 255.0f, b = b8 / 255.0f;
            float bDist = fabsf((x - 0.5f) * cosf(beamAng) + (z - 0.5f) * sinf(beamAng));
            float beam = fmaxf(0.0f, 1 - bDist / beamW) * 0.8f;
            if (beam > 0) {
                float dispHue = saFract(hue + bDist * 1.5f);
                uint8_t dr, dg, db;
                standaloneHslToRgb(dispHue, 1.0f, beam * 0.9f, dr, dg, db);
                r += dr / 255.0f * beam + beam * 0.3f;
                g += dg / 255.0f * beam + beam * 0.3f;
                b += db / 255.0f * beam + beam * 0.3f;
            }
            saPixel(display, xOff, px, py, r, g, b);
        }
    }
}

inline void standaloneRenderNebula(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const float z = 0.5f;
    const float tt = t * 0.28f;
    for (int py = 0; py < PANEL_SIZE; py++) {
        float y = (float)py / (PANEL_SIZE - 1);
        for (int px = 0; px < PANEL_SIZE; px++) {
            float x = (float)px / (PANEL_SIZE - 1);
            float d = 0;
            d += sinf(x * 5.3f + tt * 0.52f) * cosf(y * 4.9f + tt * 0.31f) * 0.5f;
            d += sinf(z * 6.5f - tt * 0.42f) * sinf(x * 3.4f + tt * 0.21f) * 0.38f;
            d += cosf((x + y + z) * 4.2f + tt * 0.58f) * 0.28f;
            d += sinf(x * 8.8f + y * 6.1f - tt * 0.35f) * 0.15f;
            d = d * 0.48f + 0.52f;
            float bright = powf(fmaxf(0.0f, d - 0.08f), 1.4f) * 0.92f;
            float hue = saLerp(0.60f, 0.04f, saSmooth(0.18f, 0.88f, d)) + sinf(tt * 0.08f) * 0.05f;
            uint8_t r8, g8, b8;
            standaloneHslToRgb(hue, 0.85f + d * 0.15f, bright, r8, g8, b8);
            // star sparks
            float spark = standaloneHash01(px * 131 + py * 17);
            float add = 0;
            if (spark > 0.985f) add = 0.5f + 0.5f * sinf(t * 3.0f + spark * 40.0f);
            saPixel(display, xOff, px, py, r8 / 255.0f + add, g8 / 255.0f + add, b8 / 255.0f + add);
        }
    }
}

// DNA double helix - port of effectDNA, one face. Two strands winding down
// the panel with connecting rungs.
inline void standaloneRenderDna(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    const float RADIUS = PANEL_SIZE * 0.36f;
    const int TURNS = 4;
    const float tt = t * 0.55f;
    for (int y = 0; y < PANEL_SIZE; y++) {
        float progress = (float)y / PANEL_SIZE;
        float ang0 = progress * (float)M_PI * 2 * TURNS + tt * 1.4f;
        for (int s = 0; s < 2; s++) {
            float ang = ang0 + s * (float)M_PI;
            int ui = (int)lroundf(PANEL_SIZE / 2 + cosf(ang) * RADIUS);
            float hue = saFract(progress * 0.5f + tt * 0.06f + s * 0.5f);
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 1.0f, 0.95f, r, g, b);
            if (ui >= 0 && ui < PANEL_SIZE)
                snRawSet(xOff + ui, y, display->color565(r, g, b));
            for (int d = 1; d <= 3; d++) {
                float fade = powf(1 - d / 4.0f, 2) * 0.7f;
                uint8_t rg, gg, bg;
                standaloneHslToRgb(hue, 0.9f, fade, rg, gg, bg);
                if (ui - d >= 0)          snRawSet(xOff + ui - d, y, display->color565(rg, gg, bg));
                if (ui + d < PANEL_SIZE)  snRawSet(xOff + ui + d, y, display->color565(rg, gg, bg));
            }
        }
        if (y % 3 == 0) {
            int u0 = (int)lroundf(PANEL_SIZE / 2 + cosf(ang0) * RADIUS);
            int u1 = (int)lroundf(PANEL_SIZE / 2 + cosf(ang0 + (float)M_PI) * RADIUS);
            int lo = u0 < u1 ? u0 : u1, hi = u0 < u1 ? u1 : u0;
            uint8_t r, g, b;
            standaloneHslToRgb(saFract(progress * 0.5f + tt * 0.06f + 0.5f), 0.6f, 0.5f, r, g, b);
            for (int u = lo; u <= hi; u++)
                if (u >= 0 && u < PANEL_SIZE)
                    snRawSet(xOff + u, y, display->color565(r, g, b));
        }
    }
}

// Warp starfield - 2D radial version of effectWarp. Stars fly outward from
// centre with a short motion tail; brighter/faster near the edges.
inline void standaloneRenderWarp(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const int NSTARS = 80;
    static float sx[NSTARS], sy[NSTARS], ssp[NSTARS], shue[NSTARS];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < NSTARS; i++) {
            float a = standaloneHash01(i * 7) * 6.2832f;
            float r = standaloneHash01(i * 13) * 0.5f;
            sx[i] = 0.5f + cosf(a) * r; sy[i] = 0.5f + sinf(a) * r;
            ssp[i] = 0.15f + standaloneHash01(i * 3) * 0.5f;
            shue[i] = 0.55f + standaloneHash01(i * 5) * 0.2f;
        }
        init = true;
    }
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    for (int i = 0; i < NSTARS; i++) {
        float dx = sx[i] - 0.5f, dy = sy[i] - 0.5f;
        float dist = sqrtf(dx * dx + dy * dy) * 2;
        // step outward from centre
        float ang = atan2f(dy, dx);
        float step = ssp[i] * (0.02f + dist * 0.06f);
        sx[i] += cosf(ang) * step; sy[i] += sinf(ang) * step;
        if (sx[i] < 0 || sx[i] > 1 || sy[i] < 0 || sy[i] > 1) {
            sx[i] = 0.5f + (standaloneHash01((int)(t * 1000) + i) - 0.5f) * 0.05f;
            sy[i] = 0.5f + (standaloneHash01((int)(t * 777) + i * 3) - 0.5f) * 0.05f;
            continue;
        }
        float bright = fminf(1.0f, dist * 1.1f);
        uint8_t r, g, b;
        standaloneHslToRgb(shue[i] + dist * 0.15f, 0.8f, bright, r, g, b);
        int px = (int)(sx[i] * (PANEL_SIZE - 1));
        int py = (int)(sy[i] * (PANEL_SIZE - 1));
        snRawSet(xOff + px, py, display->color565(r, g, b));
        // short tail toward centre
        int tx = (int)((sx[i] - cosf(ang) * 0.03f) * (PANEL_SIZE - 1));
        int ty = (int)((sy[i] - sinf(ang) * 0.03f) * (PANEL_SIZE - 1));
        if (tx >= 0 && tx < PANEL_SIZE && ty >= 0 && ty < PANEL_SIZE)
            snRawSet(xOff + tx, ty, display->color565(r / 3, g / 3, b / 3));
    }
}

// Maze - single-panel adaptation of effectMaze: the browser generates and
// races through a maze spanning all 6 cube faces with multiple simultaneous
// runners. On one flat panel this becomes a proper 2D maze (recursive
// backtracker generation, real walls/corridors) solved by a single runner via
// depth-first search, leaving a comet trail, then a rainbow victory wave
// along the solved route before regenerating - same visual beats (glowing
// walls, pulsing start/goal, trail, celebration) as the original, just one
// runner instead of a multi-racer competition (no second/third runner to race
// against without the other 5 faces' worth of maze to share).
// Tron light bikes - single-panel adaptation of effectTron: the browser runs
// bikes across all 6 cube faces with face-transfer topology; the browser's
// OWN panel2dMode already simplifies this to wraparound edges on one flat
// grid (tronMove's panel2dMode branch), so that's exactly what this uses.
// AI is simplified to flood-fill space evaluation only (pick whichever of
// straight/left/right leaves the most open area) - the browser's extra
// runway/escape-route/4-step-lookahead scoring layers are dropped for size,
// but the core "avoid trapping yourself" behavour is the same technique.
// Laser Grid (sphere) - simplified port of effectSphere: the browser is a
// ~6-state routine machine (scan/spin/collapse/dblscan/pulse/colsweep/wave/
// flat, cycling through them over time). This keeps the core visual identity
// - rotating radial laser rays from centre, a bright horizontal scan bar
// sweeping up/down, and the same colour-cycle-with-flicker math (cR/cG/cB) -
// continuously, rather than the full discrete state machine switching between
// 8 distinct routines. A close relative, not a byte-identical recreation.
inline void standaloneRenderSphere(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;
    const float cx = (S - 1) / 2.0f, cy = (S - 1) / 2.0f;
    const int nRays = 6;
    snClear(face);
    // Colour cycle with subtle flicker, same shape as the browser's cR/cG/cB.
    float hp = t * 0.15f;
    float flicker = 0.92f + 0.08f * sinf(t * 47.3f) * sinf(t * 31.7f);
    float cR = (0.15f + 0.85f * fmaxf(0.0f, sinf(hp))) * flicker;
    float cG = (0.3f + 0.7f * fmaxf(0.0f, sinf(hp + 2.094f))) * flicker;
    float cB = (0.1f + 0.9f * fmaxf(0.0f, sinf(hp + 4.189f))) * flicker;
    // Slow continuous rotation instead of the browser's discrete spin bursts.
    float spinAngle = t * 0.35f;
    float cosA = cosf(spinAngle), sinA = sinf(spinAngle);
    // Radial rays from centre, rotating.
    for (int ri = 0; ri < nRays; ri++) {
        float ang = (2.0f * (float)M_PI * ri) / nRays;
        float rdx = cosf(ang) * cosA - sinf(ang) * sinA;
        float rdy = cosf(ang) * sinA + sinf(ang) * cosA;
        float len = S * 0.7f;
        int steps = (int)len;
        for (int i = 0; i <= steps; i++) {
            float ft = (float)i / steps;
            int u = (int)lroundf(cx + rdx * len * ft);
            int v = (int)lroundf(cy + rdy * len * ft);
            float bright = 1.0f - ft * 0.6f;
            snSet(face, u, v, cR * bright, cG * bright, cB * bright);
        }
    }
    // Scanning horizontal bar, sweeping up and down.
    const float scanPeriod = 3.0f;
    float sp = fmodf(t, scanPeriod) / scanPeriod;
    float raw = sp < 0.5f ? sp * 2 : 2 - sp * 2;
    int scanV = (int)lroundf(cy + (raw - 0.5f) * (S - 1));
    scanV = constrain(scanV, 0, S - 1);
    for (int u = 0; u < S; u++) snAdd(face, u, scanV, cR * 0.6f, cG * 0.6f, cB * 0.6f);
}

inline void standaloneRenderTron(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;
    const int NBIKES = 3;
    static uint8_t* trail = nullptr;     // 0=empty, 1..NBIKES=owner
    static uint8_t* visited = nullptr;   // flood-fill scratch
    static int16_t* queue = nullptr;     // BFS queue (x<<8|y per cell... just store index)
    struct Bike { int x, y, dx, dy; float hue, acc; bool alive; };
    static Bike bikes[NBIKES];
    static bool init = false;
    static float lastT = 0;
    static float stateT = 0;
    static bool running = true;

    auto idxOf = [&](int x, int y) { return y * S + x; };
    auto wrap = [&](int v) { return ((v % S) + S) % S; };

    auto floodArea = [&](int x, int y, int dx, int dy) -> int {
        int nx = wrap(x + dx), ny = wrap(y + dy);
        if (trail[idxOf(nx, ny)]) return 0;
        memset(visited, 0, S * S);
        int qh = 0, qt = 0, count = 0;
        const int CAP = S * S;
        queue[qt++] = (int16_t)idxOf(nx, ny);
        visited[idxOf(nx, ny)] = 1;
        int dxs[4] = {1, -1, 0, 0}, dys[4] = {0, 0, 1, -1};
        while (qh < qt && count < CAP) {
            int ci = queue[qh++];
            int cx = ci % S, cy = ci / S;
            for (int d = 0; d < 4; d++) {
                int fx = wrap(cx + dxs[d]), fy = wrap(cy + dys[d]);
                int fi = idxOf(fx, fy);
                if (trail[fi] || visited[fi]) continue;
                visited[fi] = 1;
                queue[qt++] = (int16_t)fi;
                count++;
                if (qt >= CAP) break;
            }
        }
        return count;
    };
    auto resetGame = [&]() {
        memset(trail, 0, S * S);
        for (int i = 0; i < NBIKES; i++) {
            bikes[i].x = (int)(standaloneHash01(i * 37 + (int)(t * 100)) * S);
            bikes[i].y = (int)(standaloneHash01(i * 53 + (int)(t * 100)) * S);
            int dirs[4][2] = {{1,0},{-1,0},{0,1},{0,-1}};
            int d = (int)(standaloneHash01(i * 71 + (int)(t * 100)) * 4);
            bikes[i].dx = dirs[d][0]; bikes[i].dy = dirs[d][1];
            bikes[i].hue = (float)i / NBIKES;
            bikes[i].acc = 0; bikes[i].alive = true;
            trail[idxOf(bikes[i].x, bikes[i].y)] = i + 1;
        }
        running = true; stateT = 0;
    };

    if (!init) {
        trail = (uint8_t*)snAllocPreferPsram(S * S);
        visited = (uint8_t*)snAllocPreferPsram(S * S);
        queue = (int16_t*)snAllocPreferPsram(S * S * sizeof(int16_t));
        resetGame();
        init = true;
    }
    float dt = t - lastT; lastT = t;
    stateT += dt;

    // Grid background.
    snClear(face);
    for (int y = 0; y < S; y++)
        for (int x = 0; x < S; x++)
            if (x % 4 == 0 || y % 4 == 0)
                snSet(face, x, y, 0.015f, 0.09f, 0.18f);
    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            uint8_t owner = trail[idxOf(x, y)];
            if (owner) {
                uint8_t r, g, b;
                standaloneHslToRgb(bikes[owner - 1].hue, 1.0f, 0.45f, r, g, b);
                snSet(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
            }
        }
    }

    if (running) {
        int aliveCount = 0;
        for (int i = 0; i < NBIKES; i++) if (bikes[i].alive) aliveCount++;
        for (int i = 0; i < NBIKES; i++) {
            Bike& bk = bikes[i];
            if (!bk.alive) continue;
            bk.acc += dt * 6.0f;   // bike speed (cells/sec)
            while (bk.acc >= 1.0f) {
                bk.acc -= 1.0f;
                int cand[3][2] = {{bk.dx, bk.dy}, {-bk.dy, bk.dx}, {bk.dy, -bk.dx}};
                int best = -1, bestArea = -1;
                for (int c = 0; c < 3; c++) {
                    int area = floodArea(bk.x, bk.y, cand[c][0], cand[c][1]);
                    if (area > bestArea) { bestArea = area; best = c; }
                }
                if (best < 0 || bestArea == 0) { bk.alive = false; break; }
                bk.dx = cand[best][0]; bk.dy = cand[best][1];
                bk.x = wrap(bk.x + bk.dx); bk.y = wrap(bk.y + bk.dy);
                int ni = idxOf(bk.x, bk.y);
                if (trail[ni]) { bk.alive = false; break; }
                trail[ni] = i + 1;
            }
        }
        // Head-on collisions.
        for (int i = 0; i < NBIKES; i++) {
            if (!bikes[i].alive) continue;
            for (int j = i + 1; j < NBIKES; j++) {
                if (!bikes[j].alive) continue;
                if (bikes[i].x == bikes[j].x && bikes[i].y == bikes[j].y) {
                    bikes[i].alive = false; bikes[j].alive = false;
                }
            }
        }
        aliveCount = 0;
        for (int i = 0; i < NBIKES; i++) if (bikes[i].alive) aliveCount++;
        if (aliveCount <= 1) { running = false; stateT = 0; }
    } else if (stateT > 2.5f) {
        resetGame();
    }
    // Bright head marker for surviving bikes.
    for (int i = 0; i < NBIKES; i++) {
        if (!bikes[i].alive) continue;
        uint8_t r, g, b;
        standaloneHslToRgb(bikes[i].hue, 0.5f, 0.9f, r, g, b);
        snSet(face, bikes[i].x, bikes[i].y, r / 255.0f, g / 255.0f, b / 255.0f);
    }
}

inline void standaloneRenderMaze(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int CELLS = 12;                 // 12x12 cells
    const int CW = PANEL_SIZE / CELLS;     // pixels per cell (5 for 64px panel)
    // Wall bits per cell: 1=N 2=E 4=S 8=W (wall present)
    static uint8_t* walls = nullptr;
    static uint8_t* visitedCell = nullptr;      // generation visited
    static int8_t* stackX = nullptr; static int8_t* stackY = nullptr;
    static uint8_t* solvedX = nullptr; static uint8_t* solvedY = nullptr; // DFS solve path
    static uint8_t* trailX = nullptr; static uint8_t* trailY = nullptr;   // final route for celebration
    static int solvedLen = 0, trailLen = 0;
    static int runX = 0, runY = 0, runProgress = 0;
    static bool init = false, solved = false, celebrating = false;
    static float stateT = 0, lastT = 0;
    static float hue = 0;

    auto idxOf = [&](int x, int y) { return y * CELLS + x; };

    auto generate = [&]() {
        memset(walls, 0x0F, CELLS * CELLS);       // all walls up
        memset(visitedCell, 0, CELLS * CELLS);
        int sp = 0;
        int cx = 0, cy = 0;
        visitedCell[idxOf(cx, cy)] = 1;
        stackX[sp] = cx; stackY[sp] = cy; sp++;
        int seedBase = (int)(t * 977.0f);
        int iter = 0;
        while (sp > 0) {
            cx = stackX[sp - 1]; cy = stackY[sp - 1];
            // Candidate neighbours: N,E,S,W not yet visited
            int cand[4], ncand = 0;
            if (cy > 0         && !visitedCell[idxOf(cx, cy - 1)]) cand[ncand++] = 0;
            if (cx < CELLS - 1 && !visitedCell[idxOf(cx + 1, cy)]) cand[ncand++] = 1;
            if (cy < CELLS - 1 && !visitedCell[idxOf(cx, cy + 1)]) cand[ncand++] = 2;
            if (cx > 0         && !visitedCell[idxOf(cx - 1, cy)]) cand[ncand++] = 3;
            if (ncand == 0) { sp--; continue; }
            int pick = cand[(int)(standaloneHash01(seedBase + iter * 17) * ncand)];
            iter++;
            int nx = cx, ny = cy;
            if (pick == 0) { ny--; walls[idxOf(cx, cy)] &= ~1; walls[idxOf(nx, ny)] &= ~4; }
            if (pick == 1) { nx++; walls[idxOf(cx, cy)] &= ~2; walls[idxOf(nx, ny)] &= ~8; }
            if (pick == 2) { ny++; walls[idxOf(cx, cy)] &= ~4; walls[idxOf(nx, ny)] &= ~1; }
            if (pick == 3) { nx--; walls[idxOf(cx, cy)] &= ~8; walls[idxOf(nx, ny)] &= ~2; }
            visitedCell[idxOf(nx, ny)] = 1;
            stackX[sp] = nx; stackY[sp] = ny; sp++;
        }
    };
    auto solve = [&]() {
        // DFS from (0,0) to (CELLS-1,CELLS-1), recording the path taken.
        memset(visitedCell, 0, CELLS * CELLS);
        int sp = 0;
        stackX[0] = 0; stackY[0] = 0; sp = 1;
        visitedCell[0] = 1;
        solvedLen = 0;
        solvedX[solvedLen] = 0; solvedY[solvedLen] = 0; solvedLen++;
        while (sp > 0 && !(stackX[sp - 1] == CELLS - 1 && stackY[sp - 1] == CELLS - 1)) {
            int cx = stackX[sp - 1], cy = stackY[sp - 1];
            uint8_t w = walls[idxOf(cx, cy)];
            int nx = -1, ny = -1;
            if (!(w & 1) && cy > 0         && !visitedCell[idxOf(cx, cy - 1)]) { nx = cx; ny = cy - 1; }
            else if (!(w & 2) && cx < CELLS - 1 && !visitedCell[idxOf(cx + 1, cy)]) { nx = cx + 1; ny = cy; }
            else if (!(w & 4) && cy < CELLS - 1 && !visitedCell[idxOf(cx, cy + 1)]) { nx = cx; ny = cy + 1; }
            else if (!(w & 8) && cx > 0         && !visitedCell[idxOf(cx - 1, cy)]) { nx = cx - 1; ny = cy; }
            if (nx >= 0) {
                visitedCell[idxOf(nx, ny)] = 1;
                stackX[sp] = nx; stackY[sp] = ny; sp++;
                solvedX[solvedLen] = nx; solvedY[solvedLen] = ny; solvedLen++;
            } else {
                sp--;
                if (sp > 0 && solvedLen > 0) solvedLen--;   // backtrack the recorded path too
            }
        }
        trailLen = solvedLen; memcpy(trailX, solvedX, solvedLen); memcpy(trailY, solvedY, solvedLen);
    };

    if (!init) {
        walls = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        visitedCell = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        stackX = (int8_t*)snAllocPreferPsram(CELLS * CELLS);
        stackY = (int8_t*)snAllocPreferPsram(CELLS * CELLS);
        solvedX = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        solvedY = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        trailX = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        trailY = (uint8_t*)snAllocPreferPsram(CELLS * CELLS);
        generate(); solve();
        runX = 0; runY = 0; runProgress = 0; solved = false; celebrating = false;
        init = true;
    }
    float dt = t - lastT; lastT = t;
    stateT += dt;

    if (!celebrating) {
        runProgress++;
        if (runProgress >= solvedLen) { celebrating = true; stateT = 0; }
        else { runX = solvedX[runProgress]; runY = solvedY[runProgress]; }
    } else if (stateT > 3.0f) {
        generate(); solve();
        runX = 0; runY = 0; runProgress = 0; celebrating = false; stateT = 0;
    }

    // Draw walls + corridors.
    snClear(face);
    for (int cy = 0; cy < CELLS; cy++) {
        for (int cx = 0; cx < CELLS; cx++) {
            uint8_t w = walls[idxOf(cx, cy)];
            int px0 = cx * CW, py0 = cy * CW;
            float sh = 0.7f + 0.3f * sinf(px0 * 0.3f + py0 * 0.25f + t * 0.8f);
            uint8_t wr, wg, wb;
            standaloneHslToRgb(0.55f, 0.8f, fminf(1.0f, 0.5f * sh), wr, wg, wb);
            if (w & 1) for (int i = 0; i < CW; i++) snSet(face, px0 + i, py0, wr / 255.0f, wg / 255.0f, wb / 255.0f);
            if (w & 8) for (int i = 0; i < CW; i++) snSet(face, px0, py0 + i, wr / 255.0f, wg / 255.0f, wb / 255.0f);
            if (cy == CELLS - 1 && (w & 4)) for (int i = 0; i < CW; i++) snSet(face, px0 + i, py0 + CW - 1, wr / 255.0f, wg / 255.0f, wb / 255.0f);
            if (cx == CELLS - 1 && (w & 2)) for (int i = 0; i < CW; i++) snSet(face, px0 + CW - 1, py0 + i, wr / 255.0f, wg / 255.0f, wb / 255.0f);
        }
    }

    if (!celebrating) {
        // Comet trail behind the runner.
        for (int k = (runProgress > 8 ? runProgress - 8 : 0); k <= runProgress; k++) {
            float f = 1.0f - (float)(runProgress - k) / 9.0f;
            uint8_t r, g, b;
            standaloneHslToRgb(0.55f, 1.0f, 0.14f + f * 0.5f, r, g, b);
            int cx2 = solvedX[k] * CW + CW / 2, cy2 = solvedY[k] * CW + CW / 2;
            snSet(face, cx2, cy2, r / 255.0f, g / 255.0f, b / 255.0f);
        }
        int hx = runX * CW + CW / 2, hy = runY * CW + CW / 2;
        snSet(face, hx, hy, 1.0f, 1.0f, 1.0f);
    } else {
        // Rainbow victory wave along the solved route.
        for (int k = 0; k < trailLen; k++) {
            float h = fmodf((float)k / trailLen * 2.0f - stateT * 1.5f + 10.0f, 1.0f);
            uint8_t r, g, b;
            standaloneHslToRgb(h, 1.0f, 0.5f + 0.18f * sinf(t * 6.0f), r, g, b);
            int cx2 = trailX[k] * CW + CW / 2, cy2 = trailY[k] * CW + CW / 2;
            snSet(face, cx2, cy2, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
    // Start (green pulse) and goal (white/red pulse) markers.
    float pg = 0.5f + 0.5f * sinf(t * 5.0f);
    snSet(face, CW / 2, CW / 2, 0, 0.35f + 0.6f * pg, 0.05f);
    float flash = 0.5f + 0.5f * sinf(t * 8.0f);
    int gx = (CELLS - 1) * CW + CW / 2, gy = (CELLS - 1) * CW + CW / 2;
    snSet(face, gx, gy, 1.0f, 1.0f, 1.0f);
    snSet(face, gx - 1, gy, 0.7f + 0.3f * flash, flash * 0.2f, flash * 0.1f);
    snSet(face, gx + 1, gy, 0.7f + 0.3f * flash, flash * 0.2f, flash * 0.1f);
    snSet(face, gx, gy - 1, 0.7f + 0.3f * flash, flash * 0.2f, flash * 0.1f);
    snSet(face, gx, gy + 1, 0.7f + 0.3f * flash, flash * 0.2f, flash * 0.1f);
}

// Lightspeed - single-panel adaptation of effectLightspeed: racers travel in
// straight lines leaving a fading trail. The browser version transfers
// racers across the 6 cube faces at panel edges (lsTransfer); with only one
// physical panel here, racers instead bounce (reflect) off the edges, which
// preserves the "streaking light trails crossing the panel" look without the
// cube topology this panel doesn't have.
// Dice roll - port of effectDice's single-panel path: a rounded square die
// face with the standard 6-pip layouts (diceDotPositions), a shuffle/roll
// animation, auto-rolls every ~4s, brief glow after landing.
inline void standaloneRenderDice(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    static bool rolling = false, init = false;
    static float rollStartT = 0, rollDur = 1.5f, autoTimer = 0, lastT = 0;
    static int result = 1;
    if (!init) { result = 1 + (int)(standaloneHash01(1) * 6); init = true; }
    float dt = t - lastT; lastT = t;
    autoTimer += dt;
    if (!rolling && autoTimer >= 4.0f) {
        autoTimer = 0; rolling = true; rollStartT = t;
        rollDur = 1.5f + standaloneHash01((int)(t * 500)) * 0.5f;
        result = 1 + (int)(standaloneHash01((int)(t * 700)) * 6);
    }
    int showVal = result;
    float glow = 0;
    if (rolling) {
        if (t - rollStartT >= rollDur) { rolling = false; }
        else showVal = 1 + (int)(standaloneHash01((int)(t * 30)) * 6);
    } else {
        glow = fmaxf(0.0f, 1.0f - (t - (rollStartT + rollDur)) / 3.0f);
    }
    snClear(face);
    const int8_t dots[6][6][2] = {
        {{50,50},{-1,-1},{-1,-1},{-1,-1},{-1,-1},{-1,-1}},
        {{20,20},{80,80},{-1,-1},{-1,-1},{-1,-1},{-1,-1}},
        {{20,20},{50,50},{80,80},{-1,-1},{-1,-1},{-1,-1}},
        {{20,20},{80,20},{20,80},{80,80},{-1,-1},{-1,-1}},
        {{20,20},{80,20},{50,50},{20,80},{80,80},{-1,-1}},
        {{20,20},{80,20},{20,50},{80,50},{20,80},{80,80}},
    };
    // Rounded-square face (approximated as a plain square - corner rounding
    // isn't worth the extra complexity at 64px).
    uint8_t bgv = rolling ? 8 : (uint8_t)(15 + glow * 25);
    for (int y = 2; y < PANEL_SIZE - 2; y++)
        for (int x = 2; x < PANEL_SIZE - 2; x++)
            snSet(face, x, y, bgv / 255.0f * 1.1f, bgv / 255.0f, bgv / 255.0f * 0.85f);
    int dotR = (int)(PANEL_SIZE * 0.07f);
    for (int i = 0; i < 6; i++) {
        if (dots[showVal - 1][i][0] < 0) continue;
        int cx = 2 + (int)(dots[showVal - 1][i][0] / 100.0f * (PANEL_SIZE - 4));
        int cy = 2 + (int)(dots[showVal - 1][i][1] / 100.0f * (PANEL_SIZE - 4));
        for (int dy = -dotR; dy <= dotR; dy++)
            for (int dx = -dotR; dx <= dotR; dx++)
                if (dx * dx + dy * dy <= dotR * dotR)
                    snSet(face, cx + dx, cy + dy, 0.08f, 0.08f, 0.12f);
    }
    if (!rolling && glow > 0.1f) {
        uint8_t r, g, b;
        standaloneHslToRgb(0.58f, 0.8f, glow * 0.6f, r, g, b);
        for (int i = 0; i < PANEL_SIZE; i++) {
            snAdd(face, i, 1, r / 255.0f, g / 255.0f, b / 255.0f);
            snAdd(face, i, PANEL_SIZE - 2, r / 255.0f, g / 255.0f, b / 255.0f);
            snAdd(face, 1, i, r / 255.0f, g / 255.0f, b / 255.0f);
            snAdd(face, PANEL_SIZE - 2, i, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}

// Tiny 5x7 bitmaps for H/T, used by the coin-flip result (avoids needing a
// full font just for two letters).
inline const uint8_t COIN_LETTER_H[7] = {0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001};
inline const uint8_t COIN_LETTER_T[7] = {0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100};

// Coin flip - port of effectCoinFlip's single-panel path: a gold coin that
// squashes horizontally while spinning, settling on a result (H/T) drawn with
// a small bitmap letter, matching the browser's flip-duration/timing.
inline void standaloneRenderCoinflip(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    static bool flipping = true, init = false;
    static float flipStartT = 0, flipDur = 1.5f, showResultStart = 0;
    static bool resultHeads = true;
    static float lastT = 0;
    if (!init) { flipStartT = t; flipDur = 1.2f + standaloneHash01(3) * 0.8f; init = true; }
    lastT = t;
    if (flipping) {
        if (t - flipStartT >= flipDur) {
            flipping = false;
            resultHeads = standaloneHash01((int)(t * 900.0f)) < 0.5f;
            showResultStart = t;
        }
    } else if (t - showResultStart > 2.0f) {
        flipping = true; flipStartT = t; flipDur = 1.2f + standaloneHash01((int)(t * 400)) * 0.8f;
    }
    snClear(face);
    const int cx = PANEL_SIZE / 2, cy = PANEL_SIZE / 2 - 3;
    const int R = (int)(PANEL_SIZE * 0.3f);
    float angle = flipping ? (t - flipStartT) * 12.0f : 0;
    float scaleX = flipping ? fabsf(cosf(angle)) : 1.0f;
    if (scaleX < 0.05f) scaleX = 0.05f;
    int rx = (int)(R * scaleX);
    for (int y = -R; y <= R; y++) {
        for (int x = -rx; x <= rx; x++) {
            float nx = rx ? (float)x / rx : 0, ny = (float)y / R;
            if (nx * nx + ny * ny > 1.0f) continue;
            uint8_t r, g, b;
            if (flipping) { r = 0xdd; g = 0xaa; b = 0x33; }
            else          { r = 0xff; g = 0xdd; b = 0x55; }
            snSet(face, cx + x, cy + y, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
    if (!flipping) {
        const uint8_t* glyph = resultHeads ? COIN_LETTER_H : COIN_LETTER_T;
        int gx0 = cx - 2, gy0 = cy - 3;
        for (int row = 0; row < 7; row++)
            for (int col = 0; col < 5; col++)
                if (glyph[row] & (1 << (4 - col)))
                    snSet(face, gx0 + col, gy0 + row, 0.25f, 0.18f, 0.02f);
    }
}

inline void standaloneRenderLightspeed(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    const int NRACERS = 3;
    static float rx[NRACERS], ry[NRACERS], rdu[NRACERS], rdv[NRACERS], rhue[NRACERS];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < NRACERS; i++) {
            rx[i] = PANEL_SIZE * 0.25f + standaloneHash01(i * 17) * PANEL_SIZE * 0.5f;
            ry[i] = PANEL_SIZE * 0.25f + standaloneHash01(i * 23) * PANEL_SIZE * 0.5f;
            float a = standaloneHash01(i * 31) * 6.2832f;
            rdu[i] = cosf(a); rdv[i] = sinf(a);
            rhue[i] = (float)i / NRACERS;
        }
        init = true;
    }
    snDecay(face, 0.80f);   // fading trail, matches colBuf[i]*=decay each frame
    const float speed = 8.0f * PANEL_SIZE * 0.03f;   // lsSpeed=8 default, scaled for panel size
    for (int i = 0; i < NRACERS; i++) {
        rx[i] += rdu[i] * speed * 0.15f;
        ry[i] += rdv[i] * speed * 0.15f;
        if (rx[i] < 1)              { rx[i] = 1;              rdu[i] = fabsf(rdu[i]); }
        if (rx[i] > PANEL_SIZE - 2) { rx[i] = PANEL_SIZE - 2;  rdu[i] = -fabsf(rdu[i]); }
        if (ry[i] < 1)              { ry[i] = 1;               rdv[i] = fabsf(rdv[i]); }
        if (ry[i] > PANEL_SIZE - 2) { ry[i] = PANEL_SIZE - 2;  rdv[i] = -fabsf(rdv[i]); }
        uint8_t r, g, b;
        standaloneHslToRgb(rhue[i] + t * 0.06f, 1.0f, 1.0f, r, g, b);
        snSet(face, (int)rx[i], (int)ry[i], r / 255.0f, g / 255.0f, b / 255.0f);
    }
}

// Conway's Game of Life (classic 2D B3/S23) with age-based crystal colouring,
// port of effectLife adapted to a flat panel.
inline void standaloneRenderLife(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    // Simulated at half resolution (32x32, nearest-upsampled to 64x64 when
    // rendering) - cuts the 3 grid/nextg/age arrays from 12KB total to 3KB.
    // This board has no working PSRAM and has already had one memory-
    // corruption incident tonight from oversized static buffers; "chunkier"
    // Life cells is a worthwhile trade for real headroom.
    const int W = PANEL_SIZE / 2, H = PANEL_SIZE / 2;
    static uint8_t* grid = nullptr;
    static uint8_t* nextg = nullptr;
    static uint8_t* age = nullptr;
    static bool init = false;
    static float genT = 0;
    static float lastT = 0;
    auto seed = [&]() {
        for (int i = 0; i < W * H; i++) { grid[i] = standaloneHash01(i * 3 + (int)(t * 100)) < 0.32f ? 1 : 0; age[i] = 0; }
    };
    if (!init) {
        grid  = (uint8_t*)snAllocPreferPsram(W * H);
        nextg = (uint8_t*)snAllocPreferPsram(W * H);
        age   = (uint8_t*)snAllocPreferPsram(W * H);
        seed(); init = true;
    }
    float dt = t - lastT; lastT = t;
    genT += dt;
    if (genT > 0.09f) {
        genT = 0;
        int pop = 0;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int nb = 0;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                int nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx]) nb++;
            }
            int i = y * W + x;
            uint8_t alive = grid[i];
            nextg[i] = alive ? (nb == 2 || nb == 3 ? 1 : 0) : (nb == 3 ? 1 : 0);
            if (nextg[i] && !alive) age[i] = 0;
            else if (nextg[i]) age[i] = age[i] < 250 ? age[i] + 1 : 250;
            else age[i] = age[i] > 3 ? age[i] - 3 : 0;
            pop += nextg[i];
        }
        memcpy(grid, nextg, W * H);
        if (pop < W * H * 0.01f || pop > W * H * 0.85f) seed();
    }
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 1));
    for (int py = 0; py < PANEL_SIZE; py++) for (int px = 0; px < PANEL_SIZE; px++) {
        int i = (py / 2) * W + (px / 2);
        int x = px, y = py;
        if (grid[i]) {
            float a = age[i] / 250.0f;
            float hue = a < 0.33f ? saLerp(0.50f, 0.62f, a * 3)
                      : a < 0.66f ? saLerp(0.62f, 0.75f, (a - 0.33f) * 3)
                                  : saLerp(0.75f, 0.13f, (a - 0.66f) * 3);
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 1 - a * 0.15f, 0.5f + a * 0.45f, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        } else if (age[i] > 0) {
            uint8_t r, g, b;
            standaloneHslToRgb(0.06f, 1.0f, age[i] / 250.0f * 0.5f, r, g, b);
            snRawSet(xOff + x, y, display->color565(r, g, b));
        }
    }
}

// Gravity sand - single-panel adaptation of effectGravitySand: the browser
// simulates grains falling toward whichever direction gyro/gravity currently
// points across the whole cube surface. Without a gyro or other cube faces,
// gravity here is simply fixed straight down (matches the browser's own
// panel2dMode branch, which does exactly that: "2D mode: fixed gravity
// straight down"). Grains occupy a grid and fall to the lowest free neighbour.
inline void standaloneRenderSand(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display; (void)t;
    const int S = PANEL_SIZE;
    static uint8_t* occ = nullptr;
    static bool init = false;
    if (!init) {
        occ = (uint8_t*)snAllocPreferPsram(PANEL_SIZE * PANEL_SIZE);
        memset(occ, 0, PANEL_SIZE * PANEL_SIZE);
        // Seed roughly a third of the top rows with grains, like the browser's
        // initial fill (a scattered pile that then settles).
        for (int y = 0; y < S / 2; y++)
            for (int x = 0; x < S; x++)
                if (standaloneHash01(y * 131 + x * 7) < 0.35f) occ[y * S + x] = 1;
        init = true;
    }
    // A few passes per frame so sand settles at a reasonable visible rate.
    for (int pass = 0; pass < 3; pass++) {
        for (int y = 1; y < S; y++) {   // y=0 is the "floor" row (nothing below it)
            for (int x = 0; x < S; x++) {
                if (!occ[y * S + x]) continue;
                // Prefer straight down; fall diagonally if blocked straight down
                // but a diagonal neighbour is free (classic sand-pile rule).
                if (!occ[(y - 1) * S + x]) {
                    occ[(y - 1) * S + x] = 1; occ[y * S + x] = 0;
                } else if (x > 0 && !occ[(y - 1) * S + x - 1] && !occ[y * S + x - 1]) {
                    occ[(y - 1) * S + x - 1] = 1; occ[y * S + x] = 0;
                } else if (x < S - 1 && !occ[(y - 1) * S + x + 1] && !occ[y * S + x + 1]) {
                    occ[(y - 1) * S + x + 1] = 1; occ[y * S + x] = 0;
                }
            }
        }
    }
    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            if (!occ[y * S + x]) { snSet(face, x, y, 0, 0, 0); continue; }
            float hue = saFract(0.10f + (float)x / S * 0.06f);   // sandy gold band
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 0.85f, 0.55f, r, g, b);
            snSet(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}

// Liquid crystal - flat-panel adaptation of effectFluid: the browser
// simulates a height field on the cube's 6-neighbour surface graph, driven by
// gyro-read gravity. On a single flat panel there's no gyro and no other
// faces, so this uses the browser's own panel2dMode-equivalent flat-plane
// case: a standard 2D wave equation (4-neighbour Laplacian) with a constant
// downward gravity bias and periodic random splashes, then the same
// iridescent crest/trough colour mapping.
inline void standaloneRenderFluid(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    // Simulated at half resolution (32x32) and upsampled (nearest) to the
    // 64x64 panel when rendering - cuts h/v to 1/4 the memory of a full-
    // resolution simulation (8KB total instead of 32KB). This board has no
    // working PSRAM and already had one HTTP-server-corrupting memory
    // incident tonight from an oversized static buffer, so trading a bit of
    // wave detail for real headroom is the right call for a cosmetic effect.
    const int SIM = PANEL_SIZE / 2;
    static float* h = nullptr; static float* v = nullptr;
    static bool init = false;
    if (!init) {
        h = (float*)snAllocPreferPsram(SIM * SIM * sizeof(float));
        v = (float*)snAllocPreferPsram(SIM * SIM * sizeof(float));
        memset(h, 0, SIM * SIM * sizeof(float));
        memset(v, 0, SIM * SIM * sizeof(float));
        init = true;
    }
    const float dt = 1.0f / CUBE_FPS;
    const float SPEED = 28, DAMP = 0.96f, GRAV_STR = 14;
    for (int y = 0; y < SIM; y++) {
        for (int x = 0; x < SIM; x++) {
            int i = y * SIM + x;
            float lap = 0; int cnt = 0;
            if (x > 0)       { lap += h[i - 1]; cnt++; }
            if (x < SIM - 1) { lap += h[i + 1]; cnt++; }
            if (y > 0)       { lap += h[i - SIM]; cnt++; }
            if (y < SIM - 1) { lap += h[i + SIM]; cnt++; }
            if (cnt) {
                float avg = lap / cnt;
                float slope = (float)y / SIM - 0.5f;   // gravity pulls "down" = toward y=0
                v[i] = (v[i] + dt * (SPEED * (avg - h[i]) - GRAV_STR * slope)) * DAMP;
            }
            h[i] = fmaxf(-1.0f, fminf(1.0f, h[i] + v[i] * dt));
        }
    }
    if (standaloneHash01((int)(t * 1000.0f)) < dt * 1.5f) {
        int i = (int)(standaloneHash01((int)(t * 2000.0f)) * SIM * SIM);
        h[i] += 0.8f + standaloneHash01((int)(t * 3000.0f)) * 0.6f;
    }
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float hv = h[(y / 2) * SIM + (x / 2)], absv = fabsf(hv);
            if (absv < 0.03f) { snSet(face, x, y, 0, 0, 0.02f); continue; }
            float posPhase = ((float)x / PANEL_SIZE + (float)y / PANEL_SIZE) * 2.1f + t * 0.15f;
            float hue = hv > 0
                ? saFract(0.55f + absv * 0.15f + sinf(posPhase) * 0.08f)
                : saFract(0.02f + absv * 0.12f + sinf(posPhase) * 0.06f);
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 0.85f, fminf(0.95f, 0.3f + absv * 0.6f), r, g, b);
            snSet(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}

// Moon phase - simplified port of effectMoon's 'moon' body: a starfield
// background with a circular moon disc, illuminated on one side by a
// terminator line whose position tracks the real current lunar phase (a
// standard synodic-cycle approximation from the current UTC time, rather
// than the browser's full precise illumination-fraction library - close
// enough to look right, not pixel-identical). Saturn/planets/solar-system
// alternate bodies aren't ported (needs per-planet ring/band rendering).
inline void standaloneRenderMoon(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    snClear(face);
    // Sparse starfield.
    for (int i = 0; i < 40; i++) {
        int px = (int)(standaloneHash01(i * 13) * PANEL_SIZE);
        int py = (int)(standaloneHash01(i * 29) * PANEL_SIZE);
        float tw = 0.3f + 0.7f * fabsf(sinf(t * 1.5f + i * 3.7f));
        float br = standaloneHash01(i * 41) * 0.7f * tw;
        snSet(face, px, py, br, br, br * 1.1f);
    }
    // Synodic-cycle phase approximation: days since a known new moon
    // (2000-01-06 18:14 UTC, epoch 947182440) divided by the ~29.53-day
    // lunar cycle, fractional part = phase 0(new)..0.5(full)..1(new).
    time_t now = time(nullptr);
    double days = (now - 947182440.0) / 86400.0;
    float phase = (float)fmod(days / 29.530588f, 1.0);
    if (phase < 0) phase += 1.0f;
    float frac = (1.0f - cosf(phase * 2.0f * (float)M_PI)) / 2.0f;   // 0=new,1=full
    // Terminator: an ellipse whose horizontal squash tracks illuminated
    // fraction, and whose side (left/right lit) tracks waxing/waning. Tilted
    // by observer latitude (STANDALONE_WX_LAT, config.h - the same location
    // config already used for weather; the browser lets you pick a separate
    // city just for the moon view, which this board has no UI to configure
    // per-effect, so it reuses the one location setting it has) plus a
    // time-of-day shift, matching the browser's tiltBase/tiltShift formula.
    bool waxing = phase < 0.5f;
    float termPos = frac * 2.0f - 1.0f;   // -1=new, 0=quarter, +1=full
    const int R = (int)(PANEL_SIZE * 0.42f) - 1;
    const int cx = PANEL_SIZE / 2, cy = PANEL_SIZE / 2 + 2;
    struct tm nowTm; standaloneLocalTm(nowTm);
    float hourNow = nowTm.tm_hour + nowTm.tm_min / 60.0f;
    float tiltBase = (float)STANDALONE_WX_LAT * (float)M_PI / 180.0f * 0.4f;
    float tiltShift = sinf((hourNow / 24.0f) * 2.0f * (float)M_PI) * 0.3f;
    float tilt = tiltBase + tiltShift;
    float cosT = cosf(tilt), sinT = sinf(tilt);

    // A handful of real named craters/maria, approximate selenographic
    // lat/lon in degrees, projected orthographically onto the disc (ignores
    // libration - a reasonable simplification). Not exhaustive, but real
    // recognisable features rather than a plain flat/textureless disc.
    struct Crater { float lat, lon, radius, dark; };
    static const Crater CRATERS[] = {
        {-43.3f, -11.4f, 0.09f, 0.35f},   // Tycho (bright rays, but shows as a crater here)
        { 9.7f, -20.1f, 0.07f, 0.30f},    // Copernicus
        {  8.1f, -38.0f, 0.045f, 0.28f},  // Kepler
        { 32.8f, -15.0f, 0.20f, 0.15f},   // Mare Imbrium (large dark plain)
        {  8.5f,  31.4f, 0.16f, 0.15f},   // Mare Tranquillitatis
        { 28.0f,  17.5f, 0.13f, 0.14f},   // Mare Serenitatis
        { 51.6f,  -9.3f, 0.045f, 0.30f},  // Plato
        { 23.7f, -47.4f, 0.03f, 0.32f},   // Aristarchus
        { -5.5f, -68.3f, 0.09f, 0.20f},   // Grimaldi
        {-58.6f, -14.4f, 0.07f, 0.25f},   // Clavius
    };

    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float dx = (float)(x - cx) / R, dy = (float)(y - cy) / R;
            float d2 = dx * dx + dy * dy;
            if (d2 > 1.0f) continue;
            // Rotate by tilt for the terminator test only (visual tilt of the
            // day/night line), not the crater projection below.
            float rdx = dx * cosT - dy * sinT;
            float rdy = dx * sinT + dy * cosT;
            float termX = termPos * sqrtf(fmaxf(0.0f, 1.0f - rdy * rdy));
            bool lit = waxing ? (rdx > termX) : (rdx < -termX);
            float shade = 1.0f;   // 1=undarkened, lower = crater shadow
            if (lit) {
                for (auto& c : CRATERS) {
                    float clat = c.lat * (float)M_PI / 180.0f, clon = c.lon * (float)M_PI / 180.0f;
                    float ccx = cosf(clat) * sinf(clon), ccy = -sinf(clat);
                    float ddx = dx - ccx, ddy = dy - ccy;
                    float dist2 = ddx * ddx + ddy * ddy;
                    if (dist2 < c.radius * c.radius) {
                        float f = 1.0f - sqrtf(dist2) / c.radius;
                        shade = fminf(shade, 1.0f - c.dark * f);
                    }
                }
            }
            uint8_t r, g, b;
            if (lit) {
                float edge = 1.0f - fabsf(rdx - termX) * 0.3f;
                standaloneHslToRgb(0.14f, 0.12f, fminf(0.95f, (0.55f + 0.35f * edge) * shade), r, g, b);
            } else {
                standaloneHslToRgb(0.62f, 0.3f, 0.06f, r, g, b);   // dim earthshine on the dark limb
            }
            snSet(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}

// Ghost face - faithful port of ghostRenderCanvas/ghostPaintFace, computed
// directly at native 64x64 resolution via distance-based gradient math
// instead of the browser's 256x256 canvas-then-downsample approach (which
// ends up LESS accurate than this at our actual panel resolution, since
// nearest-neighbour downsampling from 256 to 64 discards detail this direct
// math preserves). Same personality variables (eye size/spacing, cheek
// depth, brow angle, hue shift), same state machine (hidden -> emerging ->
// present -> retreating), same blink/mouth timers. Skips only the 256-canvas
// skin-pore noise texture (imperceptible at 64px) and the multi-face aura
// hint (this board has one panel).
// Retro: Space Invaders - one faithful game from effectRetro's 14-game
// collection (the browser's "retro" effect rotates through/lets you pick
// from all 14; porting all of them is a much larger separate undertaking,
// so this ports the single most iconic one exactly - 5x8 invader grid,
// squid/crab/octopus row shapes with 2-frame animation, wave speed-up,
// lives, GAME OVER flash - rather than a generic stand-in).
inline void standaloneRenderRetro(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE;
    static bool invAlive[5][8];
    static float invX = 5, invY = 32, invDir = 1;
    static int wave = 0, lives = 3;
    static float loserT = 0;
    static bool init = false;
    static float lastT = 0;
    if (!init) {
        for (int r = 0; r < 5; r++) for (int c = 0; c < 8; c++) invAlive[r][c] = true;
        init = true;
    }
    float dt = t - lastT; lastT = t;
    if (dt < 0) dt = 0; if (dt > 0.1f) dt = 0.1f;

    snClear(face);
    // This game's original coordinates are bottom-origin (matching the
    // browser's faceMap convention, same as rain - confirmed here by
    // invaders' y DECREASING as they descend toward the player, i.e. toward
    // y=0=bottom). Our snBuf is top-origin, so every draw call in this
    // function goes through this flip instead of calling snSet directly.
    auto sset = [&](int x, int y, float r, float g, float b) { snSet(face, x, S - 1 - y, r, g, b); };
    const int hudH = 4;
    static const float ROWCOL[5][3] = {{1,0,0},{0.9f,0,0.9f},{0,0.9f,0},{0,0.9f,0.9f},{1,1,0}};

    if (loserT > 0) {
        loserT -= dt;
        int flash = ((int)(loserT * 4)) % 2;
        if (flash) {
            for (int y = S/2 - 4; y <= S/2 + 4; y++)
                sset(S/2, y, 1, 0, 0);   // simple flashing marker instead of full GAME OVER glyph text
        }
        if (loserT <= 0) {
            for (int r = 0; r < 5; r++) for (int c = 0; c < 8; c++) invAlive[r][c] = true;
            invY = 32; invX = 5; lives = 3; wave = 0;
        }
        return;
    }

    float invSpeed = 8 + wave * 3;
    invX += invDir * invSpeed * dt;
    if (invX > S - 42 || invX < 2) { invDir *= -1; invY -= 1.5f; }
    int lowestAliveRow = 99;
    for (int r = 0; r < 5; r++) for (int c = 0; c < 8; c++) if (invAlive[r][c] && r < lowestAliveRow) lowestAliveRow = r;
    if (lowestAliveRow < 99 && invY + lowestAliveRow * 6 <= 17) {
        lives--;
        if (lives <= 0) { loserT = 3; }
        else { for (int r = 0; r < 5; r++) for (int c = 0; c < 8; c++) invAlive[r][c] = true; invY = 32; invX = 5; }
    }

    int frame = ((int)(t * 3)) % 2;
    for (int r = 0; r < 5; r++) {
        for (int c = 0; c < 8; c++) {
            if (!invAlive[r][c]) continue;
            int ix = (int)lroundf(invX + c * 5);
            int iy = (int)lroundf(invY + r * 6);
            if (ix < 0 || ix >= S || iy < hudH || iy >= S - 12) continue;
            float rr = ROWCOL[r][0], gg = ROWCOL[r][1], bb = ROWCOL[r][2];
            if (r == 4) {   // squid
                sset(ix, iy+3, rr,gg,bb); sset(ix, iy+2, rr,gg,bb); sset(ix, iy+1, rr,gg,bb);
                sset(ix-1, iy+2, rr,gg,bb); sset(ix+1, iy+2, rr,gg,bb);
                if (frame) { sset(ix-1, iy, rr,gg,bb); sset(ix+1, iy, rr,gg,bb); }
                else { sset(ix-2, iy+1, rr,gg,bb); sset(ix+2, iy+1, rr,gg,bb); }
            } else if (r == 3 || r == 2) {   // crab
                sset(ix, iy+3, rr,gg,bb); sset(ix-1, iy+3, rr,gg,bb); sset(ix+1, iy+3, rr,gg,bb);
                sset(ix, iy+2, rr,gg,bb); sset(ix-1, iy+2, rr,gg,bb); sset(ix+1, iy+2, rr,gg,bb);
                sset(ix-2, iy+2, rr,gg,bb); sset(ix+2, iy+2, rr,gg,bb);
                sset(ix, iy+1, rr,gg,bb);
                if (frame) { sset(ix-2, iy+3, rr,gg,bb); sset(ix+2, iy+3, rr,gg,bb); sset(ix-1, iy, rr,gg,bb); sset(ix+1, iy, rr,gg,bb); }
                else { sset(ix-2, iy+1, rr,gg,bb); sset(ix+2, iy+1, rr,gg,bb); sset(ix-1, iy+4, rr*0.7f,gg*0.7f,bb*0.7f); sset(ix+1, iy+4, rr*0.7f,gg*0.7f,bb*0.7f); }
            } else {   // octopus
                sset(ix, iy+3, rr,gg,bb); sset(ix-1, iy+3, rr,gg,bb); sset(ix+1, iy+3, rr,gg,bb);
                sset(ix, iy+2, rr,gg,bb); sset(ix-1, iy+2, rr,gg,bb); sset(ix+1, iy+2, rr,gg,bb);
                sset(ix-2, iy+3, rr*0.8f,gg*0.8f,bb*0.8f); sset(ix+2, iy+3, rr*0.8f,gg*0.8f,bb*0.8f);
                if (frame) { sset(ix-1, iy+1, rr,gg,bb); sset(ix+1, iy+1, rr,gg,bb); sset(ix-2, iy, rr*0.6f,gg*0.6f,bb*0.6f); sset(ix+2, iy, rr*0.6f,gg*0.6f,bb*0.6f); }
                else { sset(ix-2, iy+1, rr,gg,bb); sset(ix+2, iy+1, rr,gg,bb); sset(ix-1, iy, rr*0.6f,gg*0.6f,bb*0.6f); sset(ix+1, iy, rr*0.6f,gg*0.6f,bb*0.6f); }
            }
        }
    }
    // Player cannon (green, bottom).
    int px = S / 2;
    for (int i = -3; i <= 3; i++) sset(px + i, 3, 0, 0.85f, 0);
    sset(px, 5, 0, 0.85f, 0);
    // HUD: lives as small dots top-left.
    for (int i = 0; i < lives; i++) sset(1 + i * 2, S - 2, 0, 0.85f, 0);
}

inline void standaloneRenderGhost(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    static float lastT = 0;
    static float stateT = 0, reveal = 0, alpha = 0;
    static int state = 0;   // 0=hidden 1=emerging 2=present 3=retreating
    static float mouthOpen = 0.7f, mouthT = 0, blinkT = 0;
    static int eyeOpen = 1;
    static float eyeRX = 0.20f, eyeRY = 0.15f, eyeSpread = 0.44f, cheekDepth = 0.48f, browAngle = 0, hueShift = 0;
    static bool init = false;
    if (!init) { stateT = 0; init = true; }
    float dt = t - lastT; lastT = t;
    if (dt < 0) dt = 0; if (dt > 0.2f) dt = 0.2f;
    stateT += dt;

    if (state == 0) {   // hidden
        if (stateT > 1.0f + standaloneHash01((int)(t * 300)) * 2.0f) {
            state = 1; stateT = 0; reveal = 0;
            mouthOpen = 0.3f + standaloneHash01((int)(t * 400)) * 0.7f;
            eyeRX = 0.16f + standaloneHash01((int)(t * 500)) * 0.08f;
            eyeRY = 0.10f + standaloneHash01((int)(t * 600)) * 0.07f;
            eyeSpread = 0.38f + standaloneHash01((int)(t * 700)) * 0.14f;
            cheekDepth = 0.3f + standaloneHash01((int)(t * 800)) * 0.5f;
            browAngle = (standaloneHash01((int)(t * 900)) - 0.5f) * 0.4f;
            hueShift = (standaloneHash01((int)(t * 1000)) - 0.5f) * 1.0f;
            eyeOpen = 1;
        }
    } else if (state == 1) {   // emerging
        float p = fminf(1.0f, stateT / 2.2f);
        reveal = p * p * (3 - 2 * p);
        alpha = 0.6f + reveal * 0.3f;
        if (stateT > 2.2f) { state = 2; stateT = 0; reveal = 1; }
    } else if (state == 2) {   // present
        reveal = 1;
        alpha = 0.82f + 0.12f * sinf(t * 1.8f);
        blinkT += dt;
        if (blinkT > 2.5f + standaloneHash01((int)(t * 200)) * 4.0f && eyeOpen == 1) { eyeOpen = 0; blinkT = 0; }
        else if (blinkT > 0.12f && eyeOpen == 0) { eyeOpen = 1; blinkT = 0; }
        mouthT += dt;
        if (mouthT > 1.5f + standaloneHash01((int)(t * 250)) * 2.5f) { mouthOpen = 0.4f + standaloneHash01((int)(t * 350)) * 0.6f; mouthT = 0; }
        if (stateT > 3.0f + standaloneHash01((int)(t * 150)) * 3.0f) { state = 3; stateT = 0; }
    } else {   // retreating
        float p = fminf(1.0f, stateT / 1.5f);
        reveal = 1.0f - p * p;
        alpha = 0.6f;
        if (stateT > 1.5f) { state = 0; stateT = 0; reveal = 0; }
    }

    snClear(face);
    if (reveal < 0.01f) return;

    const int S = PANEL_SIZE;
    const float cx = S * 0.5f, cy = S * 0.54f;
    const float fw = S * 0.34f, fh = S * 0.44f;
    const float eRX = fw * eyeRX, eRY = fh * eyeRY, eSpread = fw * eyeSpread;
    float baseH = fmodf(0.33f + hueShift * 0.15f + 1.0f, 1.0f);

    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            float dx = (x - cx) / (fw * 1.3f), dy = (y - cy) / (fh * 1.2f);
            float d2 = dx * dx + dy * dy;
            if (d2 > 1.0f) continue;   // outside the face oval

            // Skin: radial gradient, bright near top-center, darker toward edge.
            float rd = sqrtf(d2);
            float skinL = rd < 0.4f ? saLerp(0.72f, 0.50f, rd / 0.4f)
                        : rd < 0.75f ? saLerp(0.50f, 0.28f, (rd - 0.4f) / 0.35f)
                                     : saLerp(0.28f, 0.10f, (rd - 0.75f) / 0.25f);
            float skinA = rd < 0.75f ? saLerp(0.97f, 0.75f, rd / 0.75f) : saLerp(0.75f, 0.0f, (rd - 0.75f) / 0.25f);
            uint8_t sr, sg, sb;
            standaloneHslToRgb(baseH, 0.85f, skinL, sr, sg, sb);
            float r = sr / 255.0f * skinA, g = sg / 255.0f * skinA, b = sb / 255.0f * skinA;

            // Brow shadow band.
            float relY = (y - cy) / fh;
            if (relY > -0.7f && relY < -0.1f) {
                float bshade = (1.0f - (relY + 0.7f) / 0.6f) * 0.38f;
                r *= (1 - bshade); g *= (1 - bshade); b *= (1 - bshade);
            }

            // Cheek hollows (two dark radial blobs).
            for (int side = -1; side <= 1; side += 2) {
                float hx = cx + side * fw * 0.70f, hy = cy + fh * 0.10f;
                float hd = sqrtf((x - hx) * (x - hx) + (y - hy) * (y - hy)) / (fw * 0.30f);
                if (hd < 1.0f) {
                    float sh = (1.0f - hd) * fminf(0.75f, cheekDepth);
                    r *= (1 - sh); g *= (1 - sh); b *= (1 - sh);
                }
            }

            snSet(face, x, y, r * alpha * reveal, g * alpha * reveal, b * alpha * reveal);
        }
    }

    // Brows (angled short lines).
    uint8_t br8, bg8, bb8;
    standaloneHslToRgb(baseH, 0.85f, 0.08f, br8, bg8, bb8);
    for (int side = -1; side <= 1; side += 2) {
        float bx = cx + side * eSpread, by = cy - fh * 0.38f + browAngle * fh * side;
        for (int i = -3; i <= 3; i++) {
            int lx = (int)(bx + i * fw * 0.06f);
            int ly = (int)(by - browAngle * fh * side * 0.3f * (i / 3.0f));
            snSet(face, lx, ly, br8 / 255.0f * alpha * reveal, bg8 / 255.0f * alpha * reveal, bb8 / 255.0f * alpha * reveal);
        }
    }

    // Eyes: socket + iris/pupil/glint (open) or a closed-lid crease line.
    for (int side = -1; side <= 1; side += 2) {
        float ex = cx + side * eSpread, ey = cy - fh * 0.14f;
        if (eyeOpen) {
            for (int dyp = -(int)eRY; dyp <= (int)eRY; dyp++) {
                for (int dxp = -(int)eRX; dxp <= (int)eRX; dxp++) {
                    float nx = eRX > 0 ? dxp / eRX : 0, ny = eRY > 0 ? dyp / eRY : 0;
                    float d = sqrtf(nx * nx + ny * ny);
                    if (d > 1.0f) continue;
                    float ix = ex + dxp, iy = ey + dyp;
                    if (d < 0.24f) { snSet(face, (int)ix, (int)iy, 0, 0, 0); continue; }   // pupil
                    if (d < 0.56f) {
                        uint8_t ir, ig, ib;
                        standaloneHslToRgb(baseH, 1.0f, saLerp(0.65f, 0.35f, (d - 0.24f) / 0.32f), ir, ig, ib);
                        snSet(face, (int)ix, (int)iy, ir / 255.0f * alpha, ig / 255.0f * alpha, ib / 255.0f * alpha);
                    } else {
                        float shade = 1.0f - (d - 0.56f) / 0.44f;
                        snSet(face, (int)ix, (int)iy, 0, shade * 0.03f * alpha, shade * 0.012f * alpha);
                    }
                }
            }
            snSet(face, (int)(ex - eRX * 0.20f), (int)(ey - eRY * 0.25f), alpha, alpha, alpha);   // glint
        } else {
            for (int i = -(int)(eRX * 1.2f); i <= (int)(eRX * 1.2f); i++) {
                float frac = eRX > 0 ? i / (eRX * 1.2f) : 0;
                int ly = (int)(ey + eRY * 0.7f * (1 - frac * frac));
                snSet(face, (int)(ex + i), ly, br8 / 255.0f * alpha, bg8 / 255.0f * alpha, bb8 / 255.0f * alpha);
            }
        }
    }

    // Nose: bridge shadow + nostrils.
    float noseY = cy + fh * 0.12f;
    for (int side = -1; side <= 1; side += 2) {
        float nx = cx + side * fw * 0.11f, ny = noseY + fh * 0.05f;
        for (int dyp = -2; dyp <= 2; dyp++) for (int dxp = -2; dxp <= 2; dxp++)
            if (dxp * dxp + dyp * dyp <= 4) snSet(face, (int)nx + dxp, (int)ny + dyp, 0, 0, 0);
    }

    // Mouth: lip ellipse, dark opening, teeth rows if open enough.
    float mouthW = fw * 0.56f, mouthH = fh * 0.23f * fmaxf(0.1f, mouthOpen);
    uint8_t lr, lg, lb;
    standaloneHslToRgb(baseH, 0.85f, 0.18f, lr, lg, lb);
    for (int dyp = -(int)(mouthH * 1.15f) - 1; dyp <= (int)(mouthH * 1.15f) + 1; dyp++) {
        for (int dxp = -(int)(mouthW * 1.08f); dxp <= (int)(mouthW * 1.08f); dxp++) {
            float nx = mouthW > 0 ? dxp / (mouthW * 1.08f) : 0, ny = mouthH > 0 ? dyp / (mouthH * 1.15f) : 0;
            if (nx * nx + ny * ny > 1.0f) continue;
            float nx2 = mouthW > 0 ? dxp / mouthW : 0, ny2 = mouthH > 0 ? dyp / mouthH : 0;
            bool inner = (nx2 * nx2 + ny2 * ny2) <= 1.0f;
            int mx = (int)(cx + dxp), my = (int)(noseY + fh * 0.28f + dyp);
            if (inner) snSet(face, mx, my, 0, 0, 0);
            else snSet(face, mx, my, lr / 255.0f * alpha, lg / 255.0f * alpha, lb / 255.0f * alpha);
        }
    }
    if (mouthOpen > 0.2f) {
        uint8_t tr, tg, tb;
        standaloneHslToRgb(baseH, 0.85f, 0.88f, tr, tg, tb);
        for (int i = 0; i < 5; i++) {
            float tx = cx - mouthW * 0.72f + mouthW * 0.36f * i + mouthW * 0.18f;
            snSet(face, (int)tx, (int)(noseY + fh * 0.28f - mouthH * 0.7f), tr / 255.0f * alpha, tg / 255.0f * alpha, tb / 255.0f * alpha);
        }
    }
}

// APOD render - shows the real fetched+decoded photo once standaloneApodFetch
// (called from main.cpp's loop(), core 1) has one ready. Before that, or if
// PSRAM isn't available this boot, shows a pulsing placeholder instead of a
// blank/black panel.
inline void standaloneRenderApod(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    if (g_apodValid && g_apodPixels) {
        for (int y = 0; y < PANEL_SIZE; y++) {
            for (int x = 0; x < PANEL_SIZE; x++) {
                int pi = (y * PANEL_SIZE + x) * 3;
                snSet(face, x, y, g_apodPixels[pi] / 255.0f, g_apodPixels[pi + 1] / 255.0f, g_apodPixels[pi + 2] / 255.0f);
            }
        }
        return;
    }
    // Placeholder: slowly pulsing deep-space blue with a centred dot, while
    // fetching (or if PSRAM isn't up this boot, so it's showing something
    // deliberate rather than the black default: case).
    snClear(face);
    float pulse = 0.3f + 0.2f * sinf(t * 1.2f);
    for (int y = PANEL_SIZE / 2 - 1; y <= PANEL_SIZE / 2 + 1; y++)
        for (int x = PANEL_SIZE / 2 - 1; x <= PANEL_SIZE / 2 + 1; x++)
            snSet(face, x, y, 0.1f * pulse, 0.25f * pulse, 0.5f * pulse);
}

// Hidden Easter egg - port of ui.js's secret image reveal (size button
// sequence 8,8,16,64 within 2s). Same two embedded 64x64 images
// (easter_egg_images.h), same crossfade timing as the browser's single-panel
// mode: 15s holding image 1, 3s crossfade, 15s holding image 2, 3s crossfade
// back, repeat. The browser sends setEffect("easter_egg") the moment the
// sequence is detected, so the physical panel reveals it too.
inline void standaloneRenderEasterEgg(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    // Track our own start time (set once, first time this is ever rendered)
    // so the crossfade cycle begins on image 1 rather than inheriting
    // whatever phase the shared `t` accumulator (which never resets) happens
    // to be at. If you find the egg again later it just continues the same
    // background cycle rather than restarting - fine for a hidden extra.
    static float startT = -1;
    if (startT < 0) startT = t;
    float phase = fmodf(t - startT, 36.0f);   // 15+3+15+3 = 36s cycle
    float alpha = phase < 15 ? 0.0f
                : phase < 18 ? (phase - 15) / 3.0f
                : phase < 33 ? 1.0f
                             : 1.0f - (phase - 33) / 3.0f;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            int pi = (y * PANEL_SIZE + x) * 3;
            uint8_t r1 = pgm_read_byte(&EASTER_EGG_IMG1[pi]);
            uint8_t g1 = pgm_read_byte(&EASTER_EGG_IMG1[pi + 1]);
            uint8_t b1 = pgm_read_byte(&EASTER_EGG_IMG1[pi + 2]);
            uint8_t r2 = pgm_read_byte(&EASTER_EGG_IMG2[pi]);
            uint8_t g2 = pgm_read_byte(&EASTER_EGG_IMG2[pi + 1]);
            uint8_t b2 = pgm_read_byte(&EASTER_EGG_IMG2[pi + 2]);
            float r = (r1 * (1 - alpha) + r2 * alpha) / 255.0f;
            float g = (g1 * (1 - alpha) + g2 * alpha) / 255.0f;
            float b = (b1 * (1 - alpha) + b2 * alpha) / 255.0f;
            snSet(face, x, y, r, g, b);
        }
    }
}

// ===========================================================================
// Overlays — ports of effects.js's OV_FUNCS, blended additively onto the
// buffer (snAdd) after the main effect draws, exactly matching how the
// browser composites overlays on top of colBuf. Applied per-face.
// ===========================================================================
inline void standaloneOverlayStars(int face, float t) {
    static float phase[40]; static float hue[40]; static bool init = false;
    if (!init) { for (int i = 0; i < 40; i++) { phase[i] = standaloneHash01(i * 9) * 6.2832f; hue[i] = standaloneHash01(i * 5); } init = true; }
    for (int i = 0; i < 40; i++) {
        float ph = phase[i] + t * 1.5f * (1.2f + sinf(phase[i] * 0.7f + t) * 0.5f);
        float bright = powf(fmaxf(0.0f, sinf(ph) * 0.5f + 0.5f), 2.8f);
        if (bright < 0.04f) continue;
        int idx = (int)(standaloneHash01(i * 31) * PANEL_SIZE * PANEL_SIZE);
        int px = idx % PANEL_SIZE, py = idx / PANEL_SIZE;
        uint8_t r, g, b;
        standaloneHslToRgb(hue[i], 1.0f, bright * 0.92f, r, g, b);
        snAdd(face, px, py, r / 255.0f, g / 255.0f, b / 255.0f);
    }
}
inline void standaloneOverlaySnow(int face, float t) {
    static float sx[30], sy[30], sspd[30];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < 30; i++) { sx[i] = standaloneHash01(i * 3) * PANEL_SIZE; sy[i] = standaloneHash01(i * 7) * PANEL_SIZE; sspd[i] = 4 + standaloneHash01(i * 11) * 10; }
        init = true;
    }
    for (int i = 0; i < 30; i++) {
        sy[i] += sspd[i] * 0.02f;
        if (sy[i] >= PANEL_SIZE) { sy[i] = 0; sx[i] = standaloneHash01((int)(t * 100) + i) * PANEL_SIZE; }
        snAdd(face, (int)sx[i], (int)sy[i], 0.9f, 0.9f, 1.0f);
    }
}
inline void standaloneOverlaySparkle(int face, float t) {
    for (int i = 0; i < 24; i++) {
        float ph = fmodf(t * 2.0f + i * 3.7f, 3.0f);
        if (ph > 0.15f) continue;
        int px = (int)(standaloneHash01(i * 13 + (int)(t * 0.3f)) * PANEL_SIZE);
        int py = (int)(standaloneHash01(i * 17 + (int)(t * 0.3f)) * PANEL_SIZE);
        float bright = 1.0f - (ph / 0.15f);
        snAdd(face, px, py, bright, bright, bright);
    }
}
inline void standaloneOverlayColorwave(int face, float t) {
    for (int y = 0; y < PANEL_SIZE; y++) for (int x = 0; x < PANEL_SIZE; x++) {
        float hue = saFract((x + y) * 0.01f + t * 0.15f);
        uint8_t r, g, b;
        standaloneHslToRgb(hue, 1.0f, 0.15f, r, g, b);
        snAdd(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
    }
}
inline void standaloneOverlayPulse(int face, float t) {
    float bright = 0.45f * (0.5f + 0.5f * sinf(t * 0.8f * 2 * (float)M_PI));
    for (int y = 0; y < PANEL_SIZE; y++) for (int x = 0; x < PANEL_SIZE; x++)
        snAdd(face, x, y, bright, bright, bright);
}
inline void standaloneOverlayVignette(int face, float t) {
    (void)t;
    const float cx = PANEL_SIZE / 2.0f, cy = PANEL_SIZE / 2.0f, maxD = sqrtf(cx * cx + cy * cy);
    for (int y = 0; y < PANEL_SIZE; y++) for (int x = 0; x < PANEL_SIZE; x++) {
        float d = sqrtf((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
        float darken = -0.65f * saSmooth(0.5f, 1.0f, d);
        snAdd(face, x, y, darken, darken, darken);   // negative -> darkens (clamped at 0 by saClamp01)
    }
}
inline void standaloneOverlayScanline(int face, float t) {
    int y = ((int)(t * 1.5f * PANEL_SIZE)) % PANEL_SIZE;
    for (int x = 0; x < PANEL_SIZE; x++) snAdd(face, x, y, 0.5f, 0.5f, 0.5f);
}
inline void standaloneOverlayMist(int face, float t) {
    for (int y = 0; y < PANEL_SIZE; y++) for (int x = 0; x < PANEL_SIZE; x++) {
        float m = sinf(x * 0.2f + t * 0.4f) * cosf(y * 0.2f - t * 0.3f) * 0.11f + 0.11f;
        snAdd(face, x, y, m * 0.7f, m * 0.7f, m * 0.9f);
    }
}
// Meteors - streaks flying across the panel at random angles, faithful to
// ovMeteors' random-angle-spawn + fading-trail structure (single-panel: one
// face instead of 6).
inline void standaloneOverlayMeteors(int face, float t) {
    const int NMETEORS = 3;
    static float mu[NMETEORS], mv[NMETEORS], mdu[NMETEORS], mdv[NMETEORS], mhue[NMETEORS], mpos[NMETEORS];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < NMETEORS; i++) mpos[i] = 9999;   // start "expired" so they spawn immediately below
        init = true;
    }
    for (int i = 0; i < NMETEORS; i++) {
        const int trail = 8;
        if (mpos[i] > trail + PANEL_SIZE * 1.4f) {
            // respawn
            float ang = standaloneHash01((int)(t * 500) + i * 7) * 6.2832f;
            mu[i] = standaloneHash01((int)(t * 300) + i * 3) * PANEL_SIZE;
            mv[i] = standaloneHash01((int)(t * 200) + i * 5) * PANEL_SIZE;
            mdu[i] = cosf(ang); mdv[i] = sinf(ang);
            mhue[i] = standaloneHash01(i * 11 + (int)(t * 50));
            mpos[i] = 0;
        }
        mpos[i] += 0.02f * PANEL_SIZE;   // speed budget per frame at CUBE_FPS
        int head = (int)mpos[i];
        for (int j = 0; j <= trail && j <= head; j++) {
            int fu = (int)(mu[i] + mdu[i] * (head - j));
            int fv = (int)(mv[i] + mdv[i] * (head - j));
            float fade = powf(1 - (float)j / trail, 1.8f);
            uint8_t r, g, b;
            standaloneHslToRgb(mhue[i], 1.0f, fade * 0.9f, r, g, b);
            snAdd(face, fu, fv, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}
// Edge glow - the browser glows LEDs shared between two cube faces (physical
// edges). A single flat panel has no such shared edge, so this adapts the
// concept to the one edge a flat panel DOES have: its own border.
inline void standaloneOverlayEdgeglow(int face, float t) {
    float pulse = 0.5f + 0.5f * sinf(t * 2.5f);
    float bright = pulse * 0.6f;
    for (int i = 0; i < PANEL_SIZE; i++) {
        snAdd(face, i, 0, 0, bright * 0.8f, bright);
        snAdd(face, i, PANEL_SIZE - 1, 0, bright * 0.8f, bright);
        snAdd(face, 0, i, 0, bright * 0.8f, bright);
        snAdd(face, PANEL_SIZE - 1, i, 0, bright * 0.8f, bright);
    }
}
// Fire border - faithful port of ovFire's bottom-up flame propagation
// automaton (seed bottom row, propagate up with cooling + drift).
inline void standaloneOverlayFire(int face, float t) {
    (void)t;
    // Only the bottom ~22% of rows are ever read/written (flame height), so
    // size the buffer for that instead of the full panel - the full-panel
    // allocation here was 16KB of static RAM for only ~3.5KB of actual use,
    // meaningful on this PSRAM-less, memory-corruption-prone board.
    const int MAXROWS = 24;   // PANEL_SIZE*0.22 with headroom
    const int rows = (int)(PANEL_SIZE * 0.22f);
    static float* buf = nullptr;
    static bool init = false;
    if (!init) {
        buf = (float*)snAllocPreferPsram(MAXROWS * PANEL_SIZE * sizeof(float));
        memset(buf, 0, MAXROWS * PANEL_SIZE * sizeof(float));
        init = true;
    }
    const float dt = 1.0f / CUBE_FPS;
    for (int u = 0; u < PANEL_SIZE; u++)
        buf[u] = fminf(2.0f, buf[u] + (standaloneHash01((int)(t * 997) + u) - 0.05f) * dt * 22.0f);
    for (int v = 1; v < rows; v++) {
        for (int u = 0; u < PANEL_SIZE; u++) {
            float below = buf[(v - 1) * PANEL_SIZE + u];
            float left  = buf[(v - 1) * PANEL_SIZE + (u > 0 ? u - 1 : 0)];
            float right = buf[(v - 1) * PANEL_SIZE + (u < PANEL_SIZE - 1 ? u + 1 : PANEL_SIZE - 1)];
            float drift = (standaloneHash01((int)(t * 1300) + v * 61 + u) - 0.5f) * 0.15f;
            float raw = below * 0.5f + left * 0.25f + right * 0.25f + drift;
            float cool = dt * (5 + v * 0.4f) + standaloneHash01((int)(t * 700) + v) * dt * 3.0f;
            buf[v * PANEL_SIZE + u] = fmaxf(0.0f, raw - cool);
        }
    }
    for (int v = 0; v < rows; v++) {
        for (int u = 0; u < PANEL_SIZE; u++) {
            float h = fminf(1.0f, buf[v * PANEL_SIZE + u]);
            if (h < 0.03f) continue;
            uint8_t r, g, b;
            if (h < 0.4f)      standaloneHslToRgb(0.02f, 1.0f, h * 1.2f, r, g, b);
            else if (h < 0.75f) standaloneHslToRgb(0.06f + h * 0.04f, 1.0f, h * 0.9f, r, g, b);
            else                standaloneHslToRgb(0.12f, 0.6f, h * 0.95f, r, g, b);
            snAdd(face, u, v, r / 255.0f, g / 255.0f, b / 255.0f);
        }
    }
}
// Glitch - faithful port of ovGlitch: periodically scrambles a small block
// by horizontally shifting and re-blending pixels sampled from the buffer.
inline void standaloneOverlayGlitch(int face, float t) {
    static int gu0 = 0, gv0 = 0, gbw = 4, gbh = 2, gshift = 0;
    static float lastTrigger = -999;
    if (t - lastTrigger > 1.0f / 3.0f) {
        lastTrigger = t;
        gu0 = (int)(standaloneHash01((int)(t * 400)) * PANEL_SIZE * 0.8f);
        gv0 = (int)(standaloneHash01((int)(t * 500)) * PANEL_SIZE * 0.8f);
        gbw = fmaxf(2, PANEL_SIZE * 0.08f + standaloneHash01((int)(t * 600)) * PANEL_SIZE * 0.15f);
        gbh = fmaxf(1, (int)(PANEL_SIZE * 0.04f));
        gshift = (int)((standaloneHash01((int)(t * 700)) - 0.5f) * PANEL_SIZE * 0.2f);
    } else return;   // only active the instant it triggers, like the JS's one-shot ovGlitchActive
    for (int v = gv0; v < fminf(PANEL_SIZE, gv0 + gbh); v++) {
        for (int u = gu0; u < fminf(PANEL_SIZE, gu0 + gbw); u++) {
            int su = constrain(u + gshift, 0, PANEL_SIZE - 1);
            float sr, sg, sb, dr, dg, db;
            snGet(face, su, v, sr, sg, sb);
            snGet(face, u, v, dr, dg, db);
            float noise = standaloneHash01((int)(t * 900) + u * 7 + v * 13) * 0.3f;
            snSet(face, u, v, saLerp(dr, sr, 0.6f), saLerp(dg, sg, 0.6f), saLerp(db, sb * 0.5f + noise, 0.6f));
        }
    }
}
// Lightning overlay - reuses the same white-bolt-down-the-panel structure as
// the native SA_LIGHTNING effect, but as an occasional flash on TOP of
// whatever else is drawing (additive), matching the browser's overlay
// (independent of the main effect) rather than replacing the whole panel.
inline void standaloneOverlayLightning(int face, float t) {
    int bucket = (int)(t * 3.0f) + face * 97;
    bool flash = standaloneHash01(bucket) > 0.85f;
    if (!flash) return;
    int x = PANEL_SIZE / 2;
    for (int y = 0; y < PANEL_SIZE; y++) {
        x += (int)(standaloneHash01(bucket * 131 + y) * 5.0f) - 2;
        x = constrain(x, 2, PANEL_SIZE - 3);
        snAdd(face, x, y, 1.0f, 1.0f, 1.0f);
        snAdd(face, x + 1, y, 0.78f, 0.78f, 1.0f);
    }
}
inline void standaloneRunOverlays(int face, float t) {
    if (g_ovStars)     standaloneOverlayStars(face, t);
    if (g_ovSnow)      standaloneOverlaySnow(face, t);
    if (g_ovSparkle)   standaloneOverlaySparkle(face, t);
    if (g_ovColorwave) standaloneOverlayColorwave(face, t);
    if (g_ovPulse)     standaloneOverlayPulse(face, t);
    if (g_ovVignette)  standaloneOverlayVignette(face, t);
    if (g_ovScanline)  standaloneOverlayScanline(face, t);
    if (g_ovMist)      standaloneOverlayMist(face, t);
    if (g_ovMeteors)   standaloneOverlayMeteors(face, t);
    if (g_ovEdgeglow)  standaloneOverlayEdgeglow(face, t);
    if (g_ovFire)      standaloneOverlayFire(face, t);
    if (g_ovGlitch)    standaloneOverlayGlitch(face, t);
    if (g_ovLightning) standaloneOverlayLightning(face, t);
}

// ===========================================================================
// Word-cascade text engine — faithful port of effects.js's WC_FONT/wcInit/
// wcStep/wcDrawGlyph/wcDrawToFace/wcTagQA, shared by Jokes/Trivia/On This Day
// (see CLAUDE.md's "shared engines" note - the browser explicitly calls out
// reusing this rather than reimplementing per effect, so this firmware port
// does the same: one engine, three effects below).
// ===========================================================================

// 4x7 bitmap font, one row per byte (top 4 bits used, MSB-first per column) -
// same table as WC_FONT in effects.js. GNU designated-initializer extension
// (works under the ESP32 Arduino gcc toolchain) - everything not explicitly
// listed defaults to all-zero rows, which draws nothing but still advances
// by WC_CHAR_W, exactly matching wcDrawGlyph's "unmapped char = blank glyph"
// fallback in JS.
// Not a designated-initializer table - this toolchain's GCC rejects
// "non-trivial" (array-valued) designated initializers ("sorry,
// unimplemented"). A switch is fully portable and equally fast.
inline const uint8_t* wcFontRows(uint8_t c) {
    switch (c) {
        case '0': { static const uint8_t r[7] = {6,9,9,9,9,9,6};     return r; }
        case '1': { static const uint8_t r[7] = {4,12,4,4,4,4,14};   return r; }
        case '2': { static const uint8_t r[7] = {14,1,2,4,8,8,15};   return r; }
        case '3': { static const uint8_t r[7] = {14,1,6,1,1,9,6};    return r; }
        case '4': { static const uint8_t r[7] = {2,6,10,10,15,2,2};  return r; }
        case '5': { static const uint8_t r[7] = {15,8,14,1,1,9,6};   return r; }
        case '6': { static const uint8_t r[7] = {6,8,8,14,9,9,6};    return r; }
        case '7': { static const uint8_t r[7] = {15,1,2,2,4,4,4};    return r; }
        case '8': { static const uint8_t r[7] = {6,9,9,6,9,9,6};     return r; }
        case '9': { static const uint8_t r[7] = {6,9,9,7,1,1,6};     return r; }
        case 'A': { static const uint8_t r[7] = {6,9,9,15,9,9,9};    return r; }
        case 'B': { static const uint8_t r[7] = {14,9,9,14,9,9,14};  return r; }
        case 'C': { static const uint8_t r[7] = {7,8,8,8,8,8,7};     return r; }
        case 'D': { static const uint8_t r[7] = {12,10,9,9,9,10,12}; return r; }
        case 'E': { static const uint8_t r[7] = {15,8,8,14,8,8,15};  return r; }
        case 'F': { static const uint8_t r[7] = {15,8,8,14,8,8,8};   return r; }
        case 'G': { static const uint8_t r[7] = {7,8,8,11,9,9,7};    return r; }
        case 'H': { static const uint8_t r[7] = {9,9,9,15,9,9,9};    return r; }
        case 'I': { static const uint8_t r[7] = {14,4,4,4,4,4,14};   return r; }
        case 'J': { static const uint8_t r[7] = {3,1,1,1,1,9,6};     return r; }
        case 'K': { static const uint8_t r[7] = {9,10,12,8,12,10,9}; return r; }
        case 'L': { static const uint8_t r[7] = {8,8,8,8,8,8,15};    return r; }
        case 'M': { static const uint8_t r[7] = {9,13,11,9,9,9,9};   return r; }
        case 'N': { static const uint8_t r[7] = {9,13,11,11,9,9,9};  return r; }
        case 'O': { static const uint8_t r[7] = {6,9,9,9,9,9,6};     return r; }
        case 'P': { static const uint8_t r[7] = {14,9,9,14,8,8,8};   return r; }
        case 'Q': { static const uint8_t r[7] = {6,9,9,9,11,9,7};    return r; }
        case 'R': { static const uint8_t r[7] = {14,9,9,14,12,10,9}; return r; }
        case 'S': { static const uint8_t r[7] = {7,8,8,6,1,1,14};    return r; }
        case 'T': { static const uint8_t r[7] = {15,4,4,4,4,4,4};    return r; }
        case 'U': { static const uint8_t r[7] = {9,9,9,9,9,9,6};     return r; }
        case 'V': { static const uint8_t r[7] = {9,9,9,9,9,6,2};     return r; }
        case 'W': { static const uint8_t r[7] = {9,9,9,9,11,13,9};   return r; }
        case 'X': { static const uint8_t r[7] = {9,9,6,6,6,9,9};     return r; }
        case 'Y': { static const uint8_t r[7] = {9,9,6,2,2,2,2};     return r; }
        case 'Z': { static const uint8_t r[7] = {15,1,2,4,8,8,15};   return r; }
        case ' ': { static const uint8_t r[7] = {0,0,0,0,0,0,0};     return r; }
        case '.': { static const uint8_t r[7] = {0,0,0,0,0,0,4};     return r; }
        case ',': { static const uint8_t r[7] = {0,0,0,0,0,4,8};     return r; }
        case '\'':{ static const uint8_t r[7] = {4,4,0,0,0,0,0};     return r; }
        case '"': { static const uint8_t r[7] = {10,10,0,0,0,0,0};   return r; }
        case '?': { static const uint8_t r[7] = {6,9,2,2,4,0,4};     return r; }
        case '!': { static const uint8_t r[7] = {4,4,4,4,4,0,4};     return r; }
        case ':': { static const uint8_t r[7] = {0,4,0,0,4,0,0};     return r; }
        case ';': { static const uint8_t r[7] = {0,4,0,0,4,8,0};     return r; }
        case '-': { static const uint8_t r[7] = {0,0,0,15,0,0,0};    return r; }
        case '(': { static const uint8_t r[7] = {2,4,8,8,8,4,2};     return r; }
        case ')': { static const uint8_t r[7] = {8,4,2,2,2,4,8};     return r; }
        default:  { static const uint8_t r[7] = {0,0,0,0,0,0,0};     return r; }
    }
}
#define WC_CHAR_W 5
#define WC_LINE_H 8
#define WC_MAX_TOTAL_WORDS 120
#define WC_MAX_LINE_WORDS  16
#define WC_MAX_LINES       8   // matches floor(PANEL_SIZE/WC_LINE_H) at 64/8
#define WC_WORD_LEN        28

struct WcWord {
    char  w[WC_WORD_LEN];
    float color[3];
};

struct WcState {
    WcWord words[WC_MAX_TOTAL_WORDS];
    int    wordCount;
    int    idx;
    WcWord cur[WC_MAX_LINE_WORDS];
    int    curCount;
    WcWord lines[WC_MAX_LINES][WC_MAX_LINE_WORDS];
    int    lineWordCount[WC_MAX_LINES];
    int    lineCount;
    float  timer;
    float  pendingDelay;
    bool   done;
    float  holdTimer;
    int    maxLines;
};

inline float wcWordDelay(const char* word) {
    const float base = 0.16f, perChar = 0.05f;
    int len = (int)strlen(word);
    int symbols = 0;
    for (int i = 0; i < len; i++) if (!isalnum((unsigned char)word[i])) symbols++;
    return base + len * perChar + symbols * 0.08f;
}

// Draws one glyph. Always uppercases first (wcFontRows only has cases for
// uppercase/digit/punctuation, matching wcDrawGlyph's
// WC_FONT[ch]||WC_FONT[ch.toUpperCase()] fallback in JS - since there are no
// lowercase cases at all, that fallback always resolves to the uppercase
// lookup; unmapped characters fall through to the all-zero default, which
// draws nothing but still advances by WC_CHAR_W). Returns the advance
// width, same as the JS version.
inline int wcDrawGlyph(int face, char ch, int su, int sv, const float* rgb) {
    uint8_t c = (uint8_t)toupper((unsigned char)ch);
    const uint8_t* rows = wcFontRows(c);
    for (int row = 0; row < 7; row++) {
        uint8_t bits = rows[row];
        for (int col = 0; col < 4; col++) {
            if (!((bits >> (3 - col)) & 1)) continue;
            int u = su + col, v = sv + (6 - row);
            snSet(face, u, v, rgb[0], rgb[1], rgb[2]);
        }
    }
    return WC_CHAR_W;
}

inline int wcLineWidth(const WcWord* line, int count) {
    int w = 0;
    for (int i = 0; i < count; i++) w += (int)strlen(line[i].w) * WC_CHAR_W;
    if (count > 1) w += (count - 1) * WC_CHAR_W;
    return w;
}

inline void wcInit(WcState& st, const WcWord* taggedWords, int count) {
    st.wordCount = count > WC_MAX_TOTAL_WORDS ? WC_MAX_TOTAL_WORDS : count;
    for (int i = 0; i < st.wordCount; i++) st.words[i] = taggedWords[i];
    st.idx = 0;
    st.curCount = 0;
    st.lineCount = 0;
    st.timer = 0;
    st.pendingDelay = 0.3f;
    st.done = false;
    st.holdTimer = 0;
    st.maxLines = PANEL_SIZE / WC_LINE_H;
}

// No auto-loop/auto-advance here, same as the JS version - the caller
// (standaloneRenderJoke/Trivia/OnThisDay) watches state.done + holdTimer to
// decide what comes next.
inline void wcStep(WcState& st, float dt) {
    if (st.done) { st.holdTimer += dt; return; }
    st.timer += dt;
    const int maxW = PANEL_SIZE;
    while (st.timer >= st.pendingDelay && st.idx < st.wordCount) {
        st.timer -= st.pendingDelay;
        WcWord& tw = st.words[st.idx++];
        int curW = wcLineWidth(st.cur, st.curCount);
        int addW = (st.curCount ? WC_CHAR_W : 0) + (int)strlen(tw.w) * WC_CHAR_W;
        if (curW + addW > maxW && st.curCount) {
            // Completed line goes into the lines ring buffer - bounded at
            // WC_MAX_LINES since wcDrawToFace only ever shows the last
            // maxLines anyway (unlike the JS version, which keeps every
            // completed line forever and slices at draw time - equivalent
            // visible result, bounded memory here instead).
            if (st.lineCount < WC_MAX_LINES) {
                memcpy(st.lines[st.lineCount], st.cur, sizeof(WcWord) * st.curCount);
                st.lineWordCount[st.lineCount] = st.curCount;
                st.lineCount++;
            } else {
                for (int i = 1; i < WC_MAX_LINES; i++) {
                    memcpy(st.lines[i - 1], st.lines[i], sizeof(WcWord) * st.lineWordCount[i]);
                    st.lineWordCount[i - 1] = st.lineWordCount[i];
                }
                memcpy(st.lines[WC_MAX_LINES - 1], st.cur, sizeof(WcWord) * st.curCount);
                st.lineWordCount[WC_MAX_LINES - 1] = st.curCount;
            }
            st.curCount = 0;
            st.cur[st.curCount++] = tw;
        } else if (st.curCount < WC_MAX_LINE_WORDS) {
            st.cur[st.curCount++] = tw;
        }
        st.pendingDelay = wcWordDelay(tw.w);
        if (st.idx >= st.wordCount) st.done = true;
    }
}

inline void wcDrawToFace(WcState& st, int face) {
    struct LineRef { const WcWord* words; int count; };
    LineRef allLines[WC_MAX_LINES + 1];
    int totalLines = 0;
    for (int i = 0; i < st.lineCount; i++) {
        allLines[totalLines].words = st.lines[i];
        allLines[totalLines].count = st.lineWordCount[i];
        totalLines++;
    }
    if (st.curCount > 0) {
        allLines[totalLines].words = st.cur;
        allLines[totalLines].count = st.curCount;
        totalLines++;
    }
    int visibleStart = totalLines > st.maxLines ? totalLines - st.maxLines : 0;
    int visibleCount = totalLines - visibleStart;
    const int topMargin = 1;
    for (int i = 0; i < visibleCount; i++) {
        const LineRef& line = allLines[visibleStart + i];
        int sv = (PANEL_SIZE - 1) - topMargin - 6 - i * WC_LINE_H;
        if (sv + 6 < 0) continue;
        int lineW = wcLineWidth(line.words, line.count);
        int su = (PANEL_SIZE - lineW) / 2;
        for (int j = 0; j < line.count; j++) {
            int u = su;
            for (int k = 0; line.words[j].w[k]; k++) {
                u += wcDrawGlyph(face, line.words[j].w[k], u, sv, line.words[j].color);
            }
            su += (int)strlen(line.words[j].w) * WC_CHAR_W + WC_CHAR_W;
        }
    }
}

// Tags each word as setup/question (before/including the "?") white, or
// answer (after it) amber - same split as wcTagQA in JS. Shared by
// Jokes/Trivia. Returns word count written into outWords.
inline int wcTagQA(const char* text, WcWord* outWords, int maxWords) {
    const char* qmark = strchr(text, '?');
    int qIdx = qmark ? (int)(qmark - text) : -1;
    int count = 0;
    const char* p = text;
    while (*p && count < maxWords) {
        while (*p && isspace((unsigned char)*p)) p++;
        if (!*p) break;
        const char* start = p;
        while (*p && !isspace((unsigned char)*p)) p++;
        int len = (int)(p - start);
        if (len > WC_WORD_LEN - 1) len = WC_WORD_LEN - 1;
        memcpy(outWords[count].w, start, len);
        outWords[count].w[len] = 0;
        bool isAnswer = (qIdx >= 0) && ((int)(start - text) > qIdx);
        if (isAnswer) { outWords[count].color[0] = 1.0f; outWords[count].color[1] = 0.8f; outWords[count].color[2] = 0.27f; }
        else          { outWords[count].color[0] = 1.0f; outWords[count].color[1] = 1.0f; outWords[count].color[2] = 1.0f; }
        count++;
    }
    return count;
}

// Minimal common-subset HTML entity decoder, in place (output never longer
// than input). Covers what Open Trivia DB's default encoding actually
// produces (quotes, apostrophes, basic punctuation, ampersand, a handful of
// accented letters) - not a general HTML decoder like the browser's
// textarea-based wcDecodeEntities, but this firmware only ever feeds it
// trivia API text, so this covers what's actually seen in practice.
inline void wcDecodeEntitiesInPlace(char* s) {
    char* src = s;
    char* dst = s;
    while (*src) {
        if (*src == '&') {
            struct { const char* ent; char ch; } table[] = {
                {"&quot;", '"'}, {"&#039;", '\''}, {"&apos;", '\''},
                {"&amp;", '&'}, {"&lt;", '<'}, {"&gt;", '>'},
                {"&rsquo;", '\''}, {"&lsquo;", '\''},
                {"&ldquo;", '"'}, {"&rdquo;", '"'},
                {"&eacute;", 'e'}, {"&egrave;", 'e'}, {"&ndash;", '-'}, {"&mdash;", '-'},
                {"&hellip;", '.'},
            };
            bool matched = false;
            for (auto& e : table) {
                size_t elen = strlen(e.ent);
                if (strncmp(src, e.ent, elen) == 0) {
                    *dst++ = e.ch;
                    src += elen;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;
            // Numeric entity &#NNN;
            if (src[1] == '#') {
                char* end;
                long code = strtol(src + 2, &end, 10);
                if (*end == ';' && code > 0 && code < 128) {
                    *dst++ = (char)code;
                    src = end + 1;
                    continue;
                }
            }
        }
        *dst++ = *src++;
    }
    *dst = 0;
}

// ---------------------------------------------------------------------------
// Jokes (icanhazdadjoke.com) - real fetch, same API/behavior as effects.js's
// jokeFetch(). Fetching happens from main.cpp's loop() (core 1), never on
// the DMA task, same pattern as standaloneApodFetch/standaloneWxFetch.
// ---------------------------------------------------------------------------
inline String  g_jokeText;
inline String  g_jokeError;
inline volatile bool g_jokeFetching = false;
inline WcState g_jokeCascade;
inline String  g_jokeCascadeForText;

inline bool standaloneJokeFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (g_jokeFetching) return false;
    g_jokeFetching = true;
    g_jokeError = "";

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    bool ok = false;
    if (http.begin(client, "https://icanhazdadjoke.com/")) {
        http.addHeader("Accept", "application/json");
        int code = http.GET();
        if (code == 200) {
            String payload = http.getString();
            JsonDocument doc;
            if (!deserializeJson(doc, payload)) {
                const char* joke = doc["joke"] | "";
                if (joke[0]) {
                    g_jokeText = joke;
                    g_jokeText.trim();
                    ok = true;
                } else {
                    g_jokeError = "Empty response";
                }
            } else {
                g_jokeError = "Parse error";
            }
        } else {
            g_jokeError = "Joke API error " + String(code);
        }
        http.end();
    } else {
        g_jokeError = "Network error";
    }
    g_jokeFetching = false;
    return ok;
}

// Loading/error placeholder - a simplified stand-in for effects.js's
// renderTextToFace (a separate, more elaborate auto-fit multi-line text
// engine used only for these transient states), reusing the WC font so it
// at least looks visually consistent with the cascade that follows.
inline void wcDrawCenteredLine(int face, const char* text, const float* rgb, int sv) {
    int len = (int)strlen(text);
    int u = (PANEL_SIZE - len * WC_CHAR_W) / 2;
    for (int i = 0; i < len; i++) u += wcDrawGlyph(face, text[i], u, sv, rgb);
}

inline void standaloneRenderJoke(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    snClear(face);
    if (face != 1) return;   // browser draws the cascade on face 1 only, other faces stay black

    if (g_jokeText.length() == 0 && g_jokeError.length() == 0) {
        char dots[4] = "";
        int n = 1 + ((int)t % 3);
        for (int i = 0; i < n; i++) dots[i] = '.';
        dots[n] = 0;
        char line2[16];
        snprintf(line2, sizeof(line2), "JOKE%s", dots);
        const float amber[3] = {0.9f, 0.75f, 0.2f};
        wcDrawCenteredLine(face, "LOADING", amber, PANEL_SIZE / 2 + 2);
        wcDrawCenteredLine(face, line2, amber, PANEL_SIZE / 2 - 8);
        return;
    }
    if (g_jokeError.length() > 0) {
        const float red[3] = {1.0f, 0.25f, 0.25f};
        wcDrawCenteredLine(face, "API", red, PANEL_SIZE / 2 + 8);
        wcDrawCenteredLine(face, "ERROR", red, PANEL_SIZE / 2);
        return;
    }

    if (g_jokeCascadeForText != g_jokeText) {
        WcWord tagged[WC_MAX_TOTAL_WORDS];
        int n = wcTagQA(g_jokeText.c_str(), tagged, WC_MAX_TOTAL_WORDS);
        wcInit(g_jokeCascade, tagged, n);
        g_jokeCascadeForText = g_jokeText;
    }
    static float lastT = -1;
    float dt = lastT < 0 ? 0 : (t - lastT);
    lastT = t;
    wcStep(g_jokeCascade, dt);
    wcDrawToFace(g_jokeCascade, face);

    // Once fully revealed and held a moment, fetch a new one - main.cpp's
    // loop() actually performs the fetch, this just clears the cached text
    // so the loop's "no text and not fetching" condition triggers it.
    if (g_jokeCascade.done && g_jokeCascade.holdTimer > 5.0f && !g_jokeFetching) {
        g_jokeText = "";
        g_jokeCascadeForText = "";
        g_jokeCascade.done = false;
        g_jokeCascade.holdTimer = 0;
    }
}

// ---------------------------------------------------------------------------
// Trivia (Open Trivia DB) - same word-cascade style as Jokes.
// ---------------------------------------------------------------------------
inline String  g_triviaText;
inline String  g_triviaError;
inline volatile bool g_triviaFetching = false;
inline WcState g_triviaCascade;
inline String  g_triviaCascadeForText;

inline bool standaloneTriviaFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (g_triviaFetching) return false;
    g_triviaFetching = true;
    g_triviaError = "";

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    bool ok = false;
    if (http.begin(client, "https://opentdb.com/api.php?amount=1&type=multiple")) {
        int code = http.GET();
        if (code == 200) {
            String payload = http.getString();
            JsonDocument doc;
            if (!deserializeJson(doc, payload)) {
                JsonArray results = doc["results"].as<JsonArray>();
                if (results.size() > 0) {
                    String question = results[0]["question"] | "";
                    String answer = results[0]["correct_answer"] | "";
                    question.trim();
                    answer.trim();
                    char qbuf[256], abuf[128];
                    question.toCharArray(qbuf, sizeof(qbuf));
                    answer.toCharArray(abuf, sizeof(abuf));
                    wcDecodeEntitiesInPlace(qbuf);
                    wcDecodeEntitiesInPlace(abuf);
                    String q = String(qbuf);
                    if (!q.endsWith("?")) q += "?";
                    g_triviaText = q + " " + String(abuf);
                    ok = true;
                } else {
                    g_triviaError = "No question returned";
                }
            } else {
                g_triviaError = "Parse error";
            }
        } else {
            g_triviaError = "Trivia API error " + String(code);
        }
        http.end();
    } else {
        g_triviaError = "Network error";
    }
    g_triviaFetching = false;
    return ok;
}

inline void standaloneRenderTrivia(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    snClear(face);
    if (face != 1) return;

    if (g_triviaText.length() == 0 && g_triviaError.length() == 0) {
        char dots[4] = "";
        int n = 1 + ((int)t % 3);
        for (int i = 0; i < n; i++) dots[i] = '.';
        dots[n] = 0;
        char line2[16];
        snprintf(line2, sizeof(line2), "TRIVIA%s", dots);
        const float amber[3] = {0.9f, 0.75f, 0.2f};
        wcDrawCenteredLine(face, "LOADING", amber, PANEL_SIZE / 2 + 2);
        wcDrawCenteredLine(face, line2, amber, PANEL_SIZE / 2 - 8);
        return;
    }
    if (g_triviaError.length() > 0) {
        const float red[3] = {1.0f, 0.25f, 0.25f};
        wcDrawCenteredLine(face, "API", red, PANEL_SIZE / 2 + 8);
        wcDrawCenteredLine(face, "ERROR", red, PANEL_SIZE / 2);
        return;
    }

    if (g_triviaCascadeForText != g_triviaText) {
        WcWord tagged[WC_MAX_TOTAL_WORDS];
        int n = wcTagQA(g_triviaText.c_str(), tagged, WC_MAX_TOTAL_WORDS);
        wcInit(g_triviaCascade, tagged, n);
        g_triviaCascadeForText = g_triviaText;
    }
    static float lastT = -1;
    float dt = lastT < 0 ? 0 : (t - lastT);
    lastT = t;
    wcStep(g_triviaCascade, dt);
    wcDrawToFace(g_triviaCascade, face);

    if (g_triviaCascade.done && g_triviaCascade.holdTimer > 5.0f && !g_triviaFetching) {
        g_triviaText = "";
        g_triviaCascadeForText = "";
        g_triviaCascade.done = false;
        g_triviaCascade.holdTimer = 0;
    }
}

// ---------------------------------------------------------------------------
// On This Day (Wikipedia REST API) - cycles through today's historical
// events one at a time, each revealed word-by-word (year in amber, text in
// light blue), same as effects.js's effectOnThisDay.
// ---------------------------------------------------------------------------
#define OTD_MAX_EVENTS 20
struct OtdEvent {
    int  year;
    char text[160];
};
inline OtdEvent g_otdEvents[OTD_MAX_EVENTS];
inline int      g_otdEventCount = 0;
inline String   g_otdError;
inline volatile bool g_otdFetching = false;
inline String   g_otdFetchedFor;   // "MM-DD" the cache is for
inline int      g_otdIdx = 0;
inline WcState  g_otdCascade;
inline String   g_otdCascadeForKey;

inline bool standaloneOtdFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (g_otdFetching) return false;
    g_otdFetching = true;
    g_otdError = "";

    time_t now = time(nullptr);
    struct tm tmNow;
    gmtime_r(&now, &tmNow);
    char mmdd[6];
    snprintf(mmdd, sizeof(mmdd), "%02d-%02d", tmNow.tm_mon + 1, tmNow.tm_mday);
    g_otdFetchedFor = mmdd;

    char url[128];
    snprintf(url, sizeof(url), "https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/%02d/%02d",
             tmNow.tm_mon + 1, tmNow.tm_mday);

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    bool ok = false;
    if (http.begin(client, url)) {
        http.addHeader("Accept", "application/json");
        int code = http.GET();
        if (code == 200) {
            String payload = http.getString();
            // Wikipedia's onthisday payload can run large (default events
            // list often 100+ entries); ArduinoJson v7's JsonDocument grows
            // dynamically, but cap what we keep to OTD_MAX_EVENTS below.
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload);
            if (!err) {
                JsonArray events = doc["events"].as<JsonArray>();
                // Collect (year, text) pairs, then sort descending by year -
                // same as events.filter(e=>e.text).sort((a,b)=>(b.year||0)-(a.year||0))
                int n = 0;
                for (JsonObject e : events) {
                    const char* text = e["text"] | "";
                    if (!text[0]) continue;
                    if (n >= OTD_MAX_EVENTS) break;
                    g_otdEvents[n].year = e["year"] | 0;
                    strncpy(g_otdEvents[n].text, text, sizeof(g_otdEvents[n].text) - 1);
                    g_otdEvents[n].text[sizeof(g_otdEvents[n].text) - 1] = 0;
                    n++;
                }
                // Simple insertion sort, descending by year - n is capped at
                // OTD_MAX_EVENTS (20) so O(n^2) is fine.
                for (int i = 1; i < n; i++) {
                    OtdEvent key = g_otdEvents[i];
                    int j = i - 1;
                    while (j >= 0 && g_otdEvents[j].year < key.year) {
                        g_otdEvents[j + 1] = g_otdEvents[j];
                        j--;
                    }
                    g_otdEvents[j + 1] = key;
                }
                if (n > 0) {
                    g_otdEventCount = n;
                    g_otdIdx = 0;
                    ok = true;
                } else {
                    g_otdError = "No events found";
                }
            } else {
                g_otdError = "Parse error";
            }
        } else {
            g_otdError = "Wikipedia API error " + String(code);
        }
        http.end();
    } else {
        g_otdError = "Network error";
    }
    g_otdFetching = false;
    return ok;
}

inline void standaloneRenderOnThisDay(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    snClear(face);
    if (face != 1) return;

    if (g_otdEventCount == 0 && g_otdError.length() == 0) {
        char dots[4] = "";
        int n = 1 + ((int)t % 3);
        for (int i = 0; i < n; i++) dots[i] = '.';
        dots[n] = 0;
        char line2[16];
        snprintf(line2, sizeof(line2), "DAY%s", dots);
        const float blue[3] = {0.3f, 0.65f, 0.95f};
        wcDrawCenteredLine(face, "ON THIS", blue, PANEL_SIZE / 2 + 2);
        wcDrawCenteredLine(face, line2, blue, PANEL_SIZE / 2 - 8);
        return;
    }
    if (g_otdError.length() > 0) {
        const float red[3] = {1.0f, 0.25f, 0.25f};
        wcDrawCenteredLine(face, "API", red, PANEL_SIZE / 2 + 8);
        wcDrawCenteredLine(face, "ERROR", red, PANEL_SIZE / 2);
        return;
    }

    if (g_otdIdx >= g_otdEventCount) g_otdIdx = 0;
    char wrapKey[16];
    snprintf(wrapKey, sizeof(wrapKey), "%d|%d", g_otdIdx, g_otdEventCount);
    if (g_otdCascadeForKey != wrapKey) {
        const OtdEvent& ev = g_otdEvents[g_otdIdx];
        WcWord tagged[WC_MAX_TOTAL_WORDS];
        int n = 0;
        char yearWord[16];
        snprintf(yearWord, sizeof(yearWord), "%d:", ev.year);
        strncpy(tagged[n].w, yearWord, WC_WORD_LEN - 1);
        tagged[n].w[WC_WORD_LEN - 1] = 0;
        tagged[n].color[0] = 1.0f; tagged[n].color[1] = 0.8f; tagged[n].color[2] = 0.27f;
        n++;
        const char* p = ev.text;
        while (*p && n < WC_MAX_TOTAL_WORDS) {
            while (*p && isspace((unsigned char)*p)) p++;
            if (!*p) break;
            const char* start = p;
            while (*p && !isspace((unsigned char)*p)) p++;
            int len = (int)(p - start);
            if (len > WC_WORD_LEN - 1) len = WC_WORD_LEN - 1;
            memcpy(tagged[n].w, start, len);
            tagged[n].w[len] = 0;
            tagged[n].color[0] = 0.48f; tagged[n].color[1] = 0.82f; tagged[n].color[2] = 1.0f;
            n++;
        }
        wcInit(g_otdCascade, tagged, n);
        g_otdCascadeForKey = wrapKey;
    }
    static float lastT = -1;
    float dt = lastT < 0 ? 0 : (t - lastT);
    lastT = t;
    wcStep(g_otdCascade, dt);
    wcDrawToFace(g_otdCascade, face);

    // Once revealed and held, advance to the next event (wraps at the end -
    // main.cpp's loop() re-fetches once per day when the date changes).
    if (g_otdCascade.done && g_otdCascade.holdTimer > 5.0f) {
        g_otdIdx++;
        g_otdCascadeForKey = "";   // force cascade rebuild for the next event
        g_otdCascade.done = false;
        g_otdCascade.holdTimer = 0;
    }
}

// ===========================================================================
// Sim House — shadow-puppet house simulation. Faithful port of
// effectSimHouseShadows + its supporting state (shRooms/shPeople/shGetHour/
// shPickRoom/shUpdatePeople/initSimHouse) from effects.js: silhouettes of
// 8 named people wandering between 12 rooms across two floors, visible as
// shadows moving past lit windows on the house's exterior, day/night cycle,
// people occasionally waving from a window.
//
// SCOPE NOTE: this ports SHADOW MODE only, which is a complete, real display
// mode the browser itself renders - not a simplified stand-in. The browser's
// OTHER mode (shShadowMode=false - a full room-by-room interior view with
// two embedded mini-games, a platformer and a card game, spanning ~3800
// more lines of effects.js) is a separate, much larger follow-up not yet
// ported. SA_SIMHOUSE currently always renders the shadow view.
// ===========================================================================
#define SH_ROOM_COUNT   12
#define SH_PEOPLE_COUNT 8

struct ShRoom {
    int  x1, x2, y1, y2;
    bool isBedroomLike;   // bedroom1/bedroom2/kidsroom - triggers sleep at night
    bool isSitLike;        // living/dining/study - triggers sitting
};

enum ShMovePhase : uint8_t { SH_TO_ROOM, SH_TO_STAIRS, SH_ON_STAIRS };

struct ShPerson {
    const char* name;
    int   h;
    float x, y;
    int   targetRoom, prevRoom;
    float stateT, nextDecisionT;
    float speed;
    bool  walking;
    float animFrame;
    bool  sitting, sleeping;
    ShMovePhase movePhase;
    float waveT;
    bool  waving;
};

inline bool     g_shInit = false;
inline float    g_shT = 0;
inline uint8_t* g_shBuf = nullptr;   // W*S*3 bytes, W=4*PANEL_SIZE
inline ShRoom   g_shRooms[SH_ROOM_COUNT];
inline ShPerson g_shPeople[SH_PEOPLE_COUNT];

inline float shRandom01() { return (float)random(10000) / 10000.0f; }

// Local wall-clock hour, matching effects.js's shGetHour() (real time, not
// the effect's own animation clock) - reuses the same TZ-aware helper the
// clock/weather effects already use.
inline float shGetHour() {
    struct tm tmNow;
    standaloneLocalTm(tmNow);
    return tmNow.tm_hour + tmNow.tm_min / 60.0f;
}

inline void initSimHouse() {
    const int S = PANEL_SIZE, W = 4 * S;
    const int ground = 2, floor1 = (int)(S * 0.47f), roof = S - 5;
    const int gf = ground + 1, gfTop = floor1 - 1;
    const int ff = floor1 + 1, ffTop = roof - 1;

    int idx = 0;
    auto addRoom = [&](int x1, int x2, int y1, int y2, bool bedroom, bool sitLike) {
        g_shRooms[idx] = {x1, x2, y1, y2, bedroom, sitLike};
        idx++;
    };
    addRoom(2, (int)(W * 0.11f), gf, gfTop, false, false);                    // 0 garage
    addRoom((int)(W * 0.11f) + 2, (int)(W * 0.28f), gf, gfTop, false, false); // 1 kitchen
    addRoom((int)(W * 0.28f) + 2, (int)(W * 0.44f), gf, gfTop, false, true);  // 2 dining
    addRoom((int)(W * 0.44f) + 2, (int)(W * 0.68f), gf, gfTop, false, true);  // 3 living
    addRoom((int)(W * 0.68f) + 2, (int)(W * 0.79f), gf, gfTop, false, false); // 4 hallway
    addRoom((int)(W * 0.79f) + 2, W - 3, gf, gfTop, false, true);             // 5 study
    addRoom(2, (int)(W * 0.20f), ff, ffTop, true, false);                    // 6 bedroom1
    addRoom((int)(W * 0.20f) + 2, (int)(W * 0.34f), ff, ffTop, false, false); // 7 bathroom
    addRoom((int)(W * 0.34f) + 2, (int)(W * 0.52f), ff, ffTop, true, false);  // 8 bedroom2
    addRoom((int)(W * 0.52f) + 2, (int)(W * 0.72f), ff, ffTop, true, false);  // 9 kidsroom
    addRoom((int)(W * 0.72f) + 2, (int)(W * 0.82f), ff, ffTop, false, false); // 10 landing
    addRoom((int)(W * 0.82f) + 2, W - 3, ff, ffTop, false, false);            // 11 ensuite

    static const char* names[SH_PEOPLE_COUNT]   = {"Dad", "Mum", "Teen", "Kid", "Granny", "Toddler", "Uncle", "Guest"};
    static const int   heights[SH_PEOPLE_COUNT] = {10, 9, 9, 7, 8, 5, 11, 9};
    for (int i = 0; i < SH_PEOPLE_COUNT; i++) {
        int rm = i % SH_ROOM_COUNT;
        ShPerson& p = g_shPeople[i];
        p.name = names[i];
        p.h = heights[i];
        p.x = g_shRooms[rm].x1 + 6 + i * 3;
        p.y = g_shRooms[rm].y1 + 1;
        p.targetRoom = rm;
        p.prevRoom = rm;
        p.stateT = 0;
        p.nextDecisionT = 3 + shRandom01() * 8;
        p.speed = 8 + shRandom01() * 5;
        p.walking = false;
        p.animFrame = 0;
        p.sitting = false;
        p.sleeping = false;
        p.movePhase = SH_TO_ROOM;
        p.waveT = 0;
        p.waving = false;
    }

    if (!g_shBuf) g_shBuf = (uint8_t*)(psramFound() ? ps_malloc(W * S * 3) : malloc(W * S * 3));
    g_shInit = true;
}

inline int shPickRoom(const ShPerson& person) {
    float hour = shGetHour();
    float r = shRandom01();
    if (r < 0.06f) return (int)(shRandom01() * 12);
    bool isKid = (strcmp(person.name, "Kid") == 0) || (strcmp(person.name, "Teen") == 0);
    if (hour >= 23 || hour < 6) return isKid ? (r < 0.9f ? 9 : 7) : (r < 0.9f ? 6 : 7);
    if (hour >= 6 && hour < 8) { if (r < 0.35f) return 7; if (r < 0.65f) return 1; return 10; }
    if (hour >= 8 && hour < 12) { if (isKid) return r < 0.6f ? 9 : 3; if (r < 0.3f) return 5; if (r < 0.6f) return 1; return 3; }
    if (hour >= 12 && hour < 14) { if (r < 0.5f) return 1; if (r < 0.8f) return 2; return 3; }
    if (hour >= 14 && hour < 18) { if (isKid) return r < 0.5f ? 9 : 3; if (r < 0.3f) return 3; if (r < 0.5f) return 5; if (r < 0.7f) return 0; return 1; }
    if (hour >= 18 && hour < 21) { if (r < 0.4f) return 3; if (r < 0.6f) return 2; if (r < 0.8f) return 1; return isKid ? 9 : 5; }
    if (isKid) return r < 0.7f ? 9 : 7;
    if (r < 0.4f) return 3;
    if (r < 0.6f) return 6;
    return 7;
}

inline void shUpdatePeople(float dt, int S, int W) {
    const int ground = 2, floor1 = (int)(S * 0.47f), roof = S - 5;
    (void)roof;
    const ShRoom& hall = g_shRooms[4];
    int stL = hall.x1 + 2, stR = hall.x2 - 2;
    int stBotY = ground + 1, stTopY = floor1;
    int stW = stR - stL, stH = stTopY - stBotY;
    float hour = shGetHour();
    bool isNight = (hour >= 21 || hour < 6);

    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) {
        ShPerson& p = g_shPeople[pi];
        p.stateT += dt;
        p.animFrame += dt * 5;
        if (p.stateT >= p.nextDecisionT) {
            p.stateT = 0;
            p.nextDecisionT = 8 + shRandom01() * 20;
            p.prevRoom = p.targetRoom;
            p.targetRoom = shPickRoom(p);
            p.sitting = false;
            p.sleeping = false;
            int curFloor = p.y > floor1 ? 1 : 0;
            int destFloor = p.targetRoom >= 6 ? 1 : 0;
            p.movePhase = (curFloor != destFloor) ? SH_TO_STAIRS : SH_TO_ROOM;
        }

        const ShRoom& room = g_shRooms[p.targetRoom];
        int destFloor = p.targetRoom >= 6 ? 1 : 0;
        int ri = p.targetRoom;

        float targetX = p.x, targetY = p.y;
        if (p.movePhase == SH_TO_STAIRS) {
            int curFloor = p.y > floor1 ? 1 : 0;
            targetX = curFloor == 0 ? stL : stR;
            targetY = curFloor == 0 ? stBotY + 1 : stTopY + 1;
            if (fabsf(p.x - targetX) < 2 && fabsf(p.y - targetY) < 2) p.movePhase = SH_ON_STAIRS;
        } else if (p.movePhase == SH_ON_STAIRS) {
            if (destFloor == 1) p.x += p.speed * dt * 0.7f;
            else p.x -= p.speed * dt * 0.7f;
            p.x = constrain(p.x, (float)stL, (float)stR);
            float progress = constrain((p.x - stL) / (float)stW, 0.0f, 1.0f);
            p.y = stBotY + 1 + progress * stH;
            p.walking = true;
            if ((destFloor == 1 && p.x >= stR - 1) || (destFloor == 0 && p.x <= stL + 1)) p.movePhase = SH_TO_ROOM;
        } else {
            if (ri == 3) { targetX = room.x1 + 7; targetY = room.y1 + 4; }                          // living
            else if (ri == 6 || ri == 8) { targetX = room.x1 + 6; targetY = room.y1 + 4; }           // bedroom1/2
            else if (ri == 9) { targetX = room.x1 + 5; targetY = room.y1 + 3; }                      // kidsroom
            else if (ri == 5) { targetX = room.x1 + 8; targetY = room.y1 + 2; }                      // study
            else if (ri == 1) { targetX = room.x1 + 6; targetY = room.y1 + 1; }                      // kitchen
            else if (ri == 2) { targetX = (room.x1 + room.x2) / 2.0f; targetY = room.y1 + 3; }       // dining
            else if (ri == 7 || ri == 11) { targetX = room.x1 + 4; targetY = room.y1 + 1; }          // bathroom/ensuite
            else { targetX = (room.x1 + room.x2) / 2.0f; targetY = room.y1 + 1; }
        }

        if (p.movePhase != SH_ON_STAIRS) {
            float dx = targetX - p.x, dy = targetY - p.y;
            float dist = sqrtf(dx * dx + dy * dy);
            p.walking = dist > 1.5f;
            if (dist > 1) {
                float step = p.speed * dt;
                if (fabsf(dx) > 1) p.x += (dx > 0 ? 1.0f : -1.0f) * fminf(fabsf(dx), step);
                else if (fabsf(dy) > 1) p.y += (dy > 0 ? 1.0f : -1.0f) * fminf(fabsf(dy), step);
            } else if (p.movePhase == SH_TO_ROOM) {
                if (g_shRooms[ri].isBedroomLike) p.sleeping = isNight;
                if (g_shRooms[ri].isSitLike) p.sitting = true;
            }
        }

        if (p.waving) {
            p.waveT += dt;
            if (p.waveT > 4) { p.waving = false; p.waveT = 0; }
        } else if (!p.walking && !p.sleeping && shRandom01() < 0.0008f) {
            p.waving = true;
            p.waveT = 0;
        }
    }
}

// Builds the full wide (4*PANEL_SIZE x PANEL_SIZE) shadow-house canvas into
// g_shBuf. Faithful port of effectSimHouseShadows's drawing code (house
// outline, windows, front door, people-shadow silhouettes, waving person,
// ground/path) - everything except the final per-face OUTPUT blit, which
// standaloneRenderSimHouse handles separately per dispatcher call.
inline void standaloneSimHouseShadowsBuild(float shT) {
    const int S = PANEL_SIZE, W = 4 * S;
    const int ground = 2, floor1 = (int)(S * 0.47f), roof = S - 5;
    memset(g_shBuf, 0, W * S * 3);

    auto setP = [&](int x, int y, float r, float g, float b) {
        if (x < 0 || x >= W || y < 0 || y >= S) return;
        int i = (y * W + x) * 3;
        g_shBuf[i]     = (uint8_t)fminf(255.0f, r * 255.0f);
        g_shBuf[i + 1] = (uint8_t)fminf(255.0f, g * 255.0f);
        g_shBuf[i + 2] = (uint8_t)fminf(255.0f, b * 255.0f);
    };
    auto addP = [&](int x, int y, float r, float g, float b) {
        if (x < 0 || x >= W || y < 0 || y >= S) return;
        int i = (y * W + x) * 3;
        g_shBuf[i]     = (uint8_t)fmaxf(0.0f, g_shBuf[i]     - r * 255.0f);
        g_shBuf[i + 1] = (uint8_t)fmaxf(0.0f, g_shBuf[i + 1] - g * 255.0f);
        g_shBuf[i + 2] = (uint8_t)fmaxf(0.0f, g_shBuf[i + 2] - b * 255.0f);
    };
    auto fillRect = [&](int x1, int y1, int x2, int y2, float r, float g, float b) {
        for (int y = (y1 < 0 ? 0 : y1); y <= (y2 > S - 1 ? S - 1 : y2); y++)
            for (int x = (x1 < 0 ? 0 : x1); x <= (x2 > W - 1 ? W - 1 : x2); x++) setP(x, y, r, g, b);
    };
    auto hLine = [&](int x1, int x2, int y, float r, float g, float b) {
        for (int x = x1; x <= x2; x++) setP(x, y, r, g, b);
    };
    auto vLine = [&](int x, int y1, int y2, float r, float g, float b) {
        for (int y = y1; y <= y2; y++) setP(x, y, r, g, b);
    };

    // White background
    for (int y = 0; y < S; y++) for (int x = 0; x < W; x++) setP(x, y, 0.97f, 0.96f, 0.93f);

    // House outline (thick)
    const float outR = 0.12f, outG = 0.12f, outB = 0.15f;
    hLine(0, W - 1, ground, outR, outG, outB);     hLine(0, W - 1, ground + 1, outR * 0.7f, outG * 0.7f, outB * 0.7f);
    hLine(0, W - 1, roof, outR, outG, outB);        hLine(0, W - 1, roof - 1, outR * 0.6f, outG * 0.6f, outB * 0.6f);
    vLine(0, ground, roof, outR, outG, outB);       vLine(1, ground, roof, outR * 0.6f, outG * 0.6f, outB * 0.6f);
    vLine(W - 1, ground, roof, outR, outG, outB);   vLine(W - 2, ground, roof, outR * 0.6f, outG * 0.6f, outB * 0.6f);
    hLine(0, W - 1, floor1, outR * 0.5f, outG * 0.5f, outB * 0.5f);
    const int roofPeak = S - 2, roofMid = (int)(W * 0.5f);
    for (int x = 0; x < W; x++) {
        int ry = roof + (int)roundf(fmaxf(0.0f, 1.0f - fabsf(x - roofMid) / (W * 0.5f)) * (roofPeak - roof));
        setP(x, ry, outR, outG, outB); setP(x, ry - 1, outR * 0.7f, outG * 0.7f, outB * 0.7f);
    }

    // Windows - 4 per face, wide, evenly spaced within each face
    struct ShWindow { int x1, y1, x2, y2; bool arched; };
    ShWindow windows[40];
    int winCount = 0;
    int gfMid = (ground + floor1) / 2;
    int gfWinH = (int)((floor1 - ground) * 0.6f);
    int winW = (int)(S * 0.18f);
    int ffMid = (floor1 + roof) / 2;
    int ffWinH = (int)((roof - floor1) * 0.6f);
    const int doorFace = 1;
    for (int f = 0; f < 4; f++) {
        int fStart = f * S;
        if (f == doorFace) {
            int doorCX = fStart + S / 2;
            int dW = (int)(S * 0.14f);
            int dLeft = doorCX - dW / 2, dRight = doorCX + dW / 2;
            int lWx = fStart + (dLeft - fStart - winW) / 2;
            if (lWx >= fStart + 2) windows[winCount++] = {lWx, gfMid - gfWinH / 2, lWx + winW, gfMid + gfWinH / 2, true};
            int rWx = dRight + (fStart + S - dRight - winW) / 2;
            if (rWx + winW <= fStart + S - 2) windows[winCount++] = {rWx, gfMid - gfWinH / 2, rWx + winW, gfMid + gfWinH / 2, true};
            int ffSpacing = (S - 2 * winW) / 3;
            for (int wi = 0; wi < 2; wi++) {
                int wx = fStart + ffSpacing + wi * (winW + ffSpacing);
                windows[winCount++] = {wx, ffMid - ffWinH / 2, wx + winW, ffMid + ffWinH / 2, true};
            }
        } else {
            int spacing = (S - 2 * winW) / 3;
            for (int wi = 0; wi < 2; wi++) {
                int wx = fStart + spacing + wi * (winW + spacing);
                windows[winCount++] = {wx, gfMid - gfWinH / 2, wx + winW, gfMid + gfWinH / 2, true};
                windows[winCount++] = {wx, ffMid - ffWinH / 2, wx + winW, ffMid + ffWinH / 2, true};
            }
        }
    }

    // Front door - centred on face 1
    const int doorFaceStart = doorFace * S;
    const int doorW = (int)(S * 0.14f), doorH = (int)((floor1 - ground) * 0.8f);
    const int doorX = doorFaceStart + (S - doorW) / 2;
    fillRect(doorX - 2, ground + 1, doorX + doorW + 2, ground + 2, 0.55f, 0.55f, 0.52f);
    fillRect(doorX - 1, ground + 1, doorX - 1, ground + doorH + 1, 0.25f, 0.2f, 0.12f);
    fillRect(doorX + doorW + 1, ground + 1, doorX + doorW + 1, ground + doorH + 1, 0.25f, 0.2f, 0.12f);
    hLine(doorX - 1, doorX + doorW + 1, ground + doorH + 1, 0.25f, 0.2f, 0.12f);
    fillRect(doorX, ground + 2, doorX + doorW, ground + doorH, 0.35f, 0.18f, 0.08f);
    fillRect(doorX + 1, ground + doorH - 4, doorX + doorW / 2 - 1, ground + doorH - 1, 0.28f, 0.14f, 0.06f);
    fillRect(doorX + doorW / 2 + 1, ground + doorH - 4, doorX + doorW - 1, ground + doorH - 1, 0.28f, 0.14f, 0.06f);
    fillRect(doorX + 1, ground + 3, doorX + doorW / 2 - 1, ground + doorH - 6, 0.28f, 0.14f, 0.06f);
    fillRect(doorX + doorW / 2 + 1, ground + 3, doorX + doorW - 1, ground + doorH - 6, 0.28f, 0.14f, 0.06f);
    const int archCX = doorX + doorW / 2;
    for (int dx = -(doorW / 2) - 1; dx <= doorW / 2 + 1; dx++) {
        int archY = ground + doorH + 1 + (int)roundf(sqrtf(fmaxf(0.0f, (doorW * 0.6f) * (doorW * 0.6f) - dx * dx)) * 0.4f);
        setP(archCX + dx, archY, 0.25f, 0.2f, 0.12f);
    }
    fillRect(doorX + 1, ground + doorH + 1, doorX + doorW - 1, ground + doorH + 3, 0.7f, 0.75f, 0.85f);
    setP(doorX + doorW - 2, ground + doorH / 2 + 1, 0.7f, 0.6f, 0.2f);
    setP(doorX + doorW - 2, ground + doorH / 2, 0.6f, 0.5f, 0.15f);
    setP(doorX + doorW / 2, ground + doorH - 1, 0.65f, 0.55f, 0.2f);

    // Draw windows (fancy with arch, curtains, warm glow)
    float hour = shGetHour();
    bool isNight = (hour >= 21 || hour < 6);
    float winGlow = isNight ? 0.9f : 0.65f;
    for (int wi = 0; wi < winCount; wi++) {
        const ShWindow& w = windows[wi];
        int ww = w.x2 - w.x1, wh = w.y2 - w.y1;
        (void)wh;
        fillRect(w.x1, w.y1, w.x2, w.y2, winGlow * 0.95f, winGlow * 0.88f, winGlow * 0.55f);
        hLine(w.x1 - 1, w.x2 + 1, w.y1 - 1, outR, outG, outB); hLine(w.x1 - 1, w.x2 + 1, w.y2 + 1, outR, outG, outB);
        vLine(w.x1 - 1, w.y1 - 1, w.y2 + 1, outR, outG, outB); vLine(w.x2 + 1, w.y1 - 1, w.y2 + 1, outR, outG, outB);
        hLine(w.x1, w.x2, w.y1, outR * 0.9f, outG * 0.9f, outB * 0.9f); hLine(w.x1, w.x2, w.y2, outR * 0.9f, outG * 0.9f, outB * 0.9f);
        vLine(w.x1, w.y1, w.y2, outR * 0.9f, outG * 0.9f, outB * 0.9f); vLine(w.x2, w.y1, w.y2, outR * 0.9f, outG * 0.9f, outB * 0.9f);
        int mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
        hLine(w.x1, w.x2, my, outR * 0.7f, outG * 0.7f, outB * 0.7f);
        vLine(mx, w.y1, w.y2, outR * 0.7f, outG * 0.7f, outB * 0.7f);
        if (w.arched) {
            int acx = mx, radius = ww / 2 + 1;
            for (int dx = -radius; dx <= radius; dx++) {
                int ay = w.y2 + 1 + (int)roundf(sqrtf(fmaxf(0.0f, (float)(radius * radius - dx * dx))) * 0.35f);
                if (ay > w.y2 + 1) setP(acx + dx, ay, outR * 0.8f, outG * 0.8f, outB * 0.8f);
            }
        }
        hLine(w.x1 - 1, w.x2 + 1, w.y1 - 1, 0.3f, 0.28f, 0.22f);
        for (int y = w.y1 + 1; y < w.y2; y++) {
            setP(w.x1 + 1, y, winGlow * 0.6f, winGlow * 0.5f, winGlow * 0.3f);
            setP(w.x2 - 1, y, winGlow * 0.6f, winGlow * 0.5f, winGlow * 0.3f);
        }
    }

    // People shadows - realistic silhouettes, stop at windows to do things
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) {
        const ShPerson& p = g_shPeople[pi];
        int px = (int)roundf(p.x), py = (int)roundf(p.y);
        int ph = p.h ? p.h : 10;
        int pHash = ((int)p.name[0] * 7 + (int)(shT * 0.15f)) % 5;
        bool atWindow = !p.walking && pHash < 2;

        for (int wi = 0; wi < winCount; wi++) {
            const ShWindow& w = windows[wi];
            int personFloor = py > floor1 ? 1 : 0;
            int winFloor = w.y1 > floor1 ? 1 : 0;
            if (personFloor != winFloor) continue;
            float winCX = (w.x1 + w.x2) / 2.0f;
            float dist = fabsf(px - winCX);
            int winW2 = w.x2 - w.x1;
            if (dist > winW2 * 3) continue;
            float closeness = fmaxf(0.0f, 1.0f - dist / (winW2 * 2.5f));
            float sR = 0.85f * closeness, sG = 0.85f * closeness, sB = 0.88f * closeness;
            if (sR < 0.1f) continue;
            int sxOff = (int)roundf((px - winCX) * 0.4f);
            int sCX = (int)winCX + sxOff;
            int wH = w.y2 - w.y1;

            if (p.sleeping) {
                for (int i = -3; i <= 3; i++) {
                    int sx = sCX + i; if (sx <= w.x1 || sx >= w.x2) continue;
                    addP(sx, w.y1 + 2, sR, sG, sB);
                    addP(sx, w.y1 + 3, sR * 0.7f, sG * 0.7f, sB * 0.7f);
                    if (i >= -1 && i <= 1) addP(sx, w.y1 + 4, sR * 0.4f, sG * 0.4f, sB * 0.4f);
                }
            } else if (atWindow && dist < winW2 * 1.2f) {
                int baseY = w.y1 + 1;
                int sH = wH - 2 < ph ? wH - 2 : ph;
                int activity = pHash;
                for (int dy = 0; dy < sH; dy++) {
                    int sy = baseY + dy; if (sy <= w.y1 || sy >= w.y2) continue;
                    float rel = (float)dy / sH;
                    int bw;
                    if (rel > 0.85f) bw = 2;
                    else if (rel > 0.75f) bw = 2;
                    else if (rel > 0.45f) bw = 3;
                    else if (rel > 0.35f) bw = 3;
                    else bw = 2;
                    for (int dx = -(bw / 2); dx <= bw / 2; dx++) {
                        int sx = sCX + dx; if (sx <= w.x1 || sx >= w.x2) continue;
                        addP(sx, sy, sR, sG, sB);
                    }
                }
                int armY = baseY + (int)(sH * 0.6f);
                if (activity == 0) {
                    for (int ay = armY; ay < armY + 3 && ay < w.y2; ay++)
                        if (sCX + 2 < w.x2) addP(sCX + 2, ay, sR * 0.7f, sG * 0.7f, sB * 0.7f);
                    if (sCX + 2 < w.x2 && armY + 3 < w.y2) addP(sCX + 2, armY + 3, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                } else {
                    int phoneY = baseY + (int)(sH * 0.8f);
                    if (sCX + 2 < w.x2 && phoneY < w.y2) addP(sCX + 2, phoneY, sR * 0.8f, sG * 0.8f, sB * 0.8f);
                    if (sCX + 2 < w.x2 && phoneY - 1 > w.y1) addP(sCX + 2, phoneY - 1, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                }
            } else if (p.sitting) {
                int baseY = w.y1 + 1;
                int sH = (ph - 2 < wH - 2) ? ph - 2 : wH - 2;
                for (int dy = 0; dy < sH; dy++) {
                    int sy = baseY + dy; if (sy <= w.y1 || sy >= w.y2) continue;
                    float rel = (float)dy / sH;
                    int bw = rel > 0.8f ? 2 : 3;
                    for (int dx = -(bw / 2); dx <= bw / 2; dx++) {
                        int sx = sCX + dx; if (sx <= w.x1 || sx >= w.x2) continue;
                        addP(sx, sy, sR, sG, sB);
                    }
                }
                int armY = baseY + (int)(sH * 0.5f);
                int armAnim = (int)roundf(sinf(shT * 1.5f) * 0.5f);
                if (armY > w.y1 && armY < w.y2) {
                    for (int ax = 1; ax <= 3; ax++) {
                        if (sCX - ax > w.x1) addP(sCX - ax, armY + armAnim, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                        if (sCX + ax < w.x2) addP(sCX + ax, armY - armAnim, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                    }
                }
            } else {
                // Walking - realistic body with natural stride
                int baseY = w.y1 + 1;
                int sH = (ph + 1 < wH - 1) ? ph + 1 : wH - 1;
                for (int dy = 0; dy < sH; dy++) {
                    int sy = baseY + dy; if (sy <= w.y1 || sy >= w.y2) continue;
                    float rel = (float)dy / sH;
                    int bw;
                    if (rel > 0.88f) bw = 2;
                    else if (rel > 0.82f) bw = 2;
                    else if (rel > 0.5f) bw = 3;
                    else if (rel > 0.38f) bw = 3;
                    else if (rel > 0.15f) bw = 2;
                    else bw = 2;
                    for (int dx = -(bw / 2); dx <= bw / 2; dx++) {
                        int sx = sCX + dx; if (sx <= w.x1 || sx >= w.x2) continue;
                        addP(sx, sy, sR, sG, sB);
                    }
                }
                if (p.walking) {
                    float swing = sinf(p.animFrame * 3);
                    int armY1 = baseY + (int)(sH * 0.55f) + (int)roundf(swing * 1.5f);
                    int armY2 = baseY + (int)(sH * 0.55f) - (int)roundf(swing * 1.5f);
                    if (sCX - 2 > w.x1 && armY1 > w.y1 && armY1 < w.y2) addP(sCX - 2, armY1, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                    if (sCX + 2 < w.x2 && armY2 > w.y1 && armY2 < w.y2) addP(sCX + 2, armY2, sR * 0.6f, sG * 0.6f, sB * 0.6f);
                    int legOff = (int)roundf(swing * 1.3f);
                    int legY = baseY + 1;
                    if (legY > w.y1 && legY < w.y2) {
                        if (sCX + legOff > w.x1 && sCX + legOff < w.x2) addP(sCX + legOff, legY, sR * 0.5f, sG * 0.5f, sB * 0.5f);
                        if (sCX - legOff > w.x1 && sCX - legOff < w.x2) addP(sCX - legOff, legY + 1, sR * 0.4f, sG * 0.4f, sB * 0.4f);
                    }
                }
            }
        }
    }

    // Waving person - head pokes out above window, arm waves
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) {
        const ShPerson& p = g_shPeople[pi];
        if (!p.waving) continue;
        int px = (int)roundf(p.x), py = (int)roundf(p.y);
        int personFloor = py > floor1 ? 1 : 0;
        const ShWindow* bestW = nullptr;
        float bestDist = 999;
        for (int wi = 0; wi < winCount; wi++) {
            const ShWindow& w = windows[wi];
            int winFloor = w.y1 > floor1 ? 1 : 0;
            if (winFloor != personFloor) continue;
            float d = fabsf(px - (w.x1 + w.x2) / 2.0f);
            if (d < bestDist) { bestDist = d; bestW = &w; }
        }
        if (!bestW || bestDist > 30) continue;
        int wcx = (bestW->x1 + bestW->x2) / 2;
        int wTop = bestW->y2;
        float phase = p.waveT;
        if (phase > 0.5f && phase < 3.5f) {
            setP(wcx, wTop + 2, 0.2f, 0.15f, 0.1f); setP(wcx + 1, wTop + 2, 0.2f, 0.15f, 0.1f);
            setP(wcx, wTop + 3, 0.15f, 0.1f, 0.08f); setP(wcx + 1, wTop + 3, 0.15f, 0.1f, 0.08f);
            setP(wcx - 1, wTop + 1, 0.18f, 0.13f, 0.09f); setP(wcx + 2, wTop + 1, 0.18f, 0.13f, 0.09f);
            int armUp = (int)roundf(sinf(p.waveT * 6) * 1.5f);
            setP(wcx + 3, wTop + 2 + armUp, 0.2f, 0.15f, 0.1f);
            setP(wcx + 3, wTop + 3 + armUp, 0.18f, 0.13f, 0.09f);
            hLine(bestW->x1 + 1, bestW->x2 - 1, wTop, 0.85f, 0.88f, 0.92f);
        } else if (phase <= 0.5f) {
            float openAmt = phase / 0.5f;
            if (openAmt > 0.5f) hLine(bestW->x1 + 1, bestW->x2 - 1, wTop, 0.8f, 0.82f, 0.85f);
        } else {
            float closeAmt = (phase - 3.5f) / 0.5f;
            if (closeAmt < 0.5f) hLine(bestW->x1 + 1, bestW->x2 - 1, wTop, 0.8f, 0.82f, 0.85f);
        }
    }

    // Ground shadow + path
    for (int x = 0; x < W; x++) setP(x, ground - 1, 0.7f, 0.7f, 0.68f);
    for (int x = doorX - 1; x <= doorX + doorW + 1; x++) setP(x, ground - 1, 0.6f, 0.58f, 0.52f);
}

// Browser-side default mode (shShadowMode starts false) - a full room-by-
// room interior view: furnished rooms, occupancy-driven lighting, stairs,
// particles (kitchen steam, dust motes), chimney smoke, night sky
// (stars/moon/shooting star), window light spilling onto the ground.
// Faithful port of effectSimHouse's non-shadow, non-panel2D branch
// (panel2dMode is a browser-viewport-only single-panel view, not applicable
// to the physical 6-face cube, so - like every other ported effect - it's
// skipped here).
#define SH_MAX_PARTICLES 60
struct ShParticle { float x, y, vx, vy, life, r, g, b; };
inline ShParticle g_shParticles[SH_MAX_PARTICLES];
inline int        g_shParticleCount = 0;

inline void shSpawnParticle(float x, float y, float vx, float vy, float life, float r, float g, float b) {
    if (g_shParticleCount >= SH_MAX_PARTICLES) return;
    ShParticle& p = g_shParticles[g_shParticleCount++];
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.r = r; p.g = g; p.b = b;
}

inline void standaloneSimHouseRoomsBuild(float dt, float shT) {
    const int S = PANEL_SIZE, W = 4 * S;
    const int ground = 2, floor1 = (int)(S * 0.47f), roof = S - 5;
    memset(g_shBuf, 0, W * S * 3);

    // Additive fill (unlike shadow mode's overwrite setP) - matches this
    // branch's own setP in effects.js exactly.
    auto setP = [&](int x, int y, float r, float g, float b) {
        if (x < 0 || x >= W || y < 0 || y >= S) return;
        int i = (y * W + x) * 3;
        g_shBuf[i]     = (uint8_t)fminf(255.0f, g_shBuf[i]     + r * 255.0f);
        g_shBuf[i + 1] = (uint8_t)fminf(255.0f, g_shBuf[i + 1] + g * 255.0f);
        g_shBuf[i + 2] = (uint8_t)fminf(255.0f, g_shBuf[i + 2] + b * 255.0f);
    };
    auto fillRect = [&](int x1, int y1, int x2, int y2, float r, float g, float b) {
        for (int y = (y1 < 0 ? 0 : y1); y <= (y2 > S - 1 ? S - 1 : y2); y++)
            for (int x = (x1 < 0 ? 0 : x1); x <= (x2 > W - 1 ? W - 1 : x2); x++) setP(x, y, r, g, b);
    };
    auto hLine = [&](int x1, int x2, int y, float r, float g, float b) {
        for (int x = x1; x <= x2; x++) setP(x, y, r, g, b);
    };
    auto vLine = [&](int x, int y1, int y2, float r, float g, float b) {
        for (int y = y1; y <= y2; y++) setP(x, y, r, g, b);
    };

    float hour = shGetHour();
    bool isNight = (hour >= 21 || hour < 6);
    bool isDusk = (hour >= 18 && hour < 21) || (hour >= 6 && hour < 7);
    bool isDawn = (hour >= 6 && hour < 8);

    // Sky with gradient
    float skyR, skyG, skyB;
    if (isNight) { skyR = 0.01f; skyG = 0.01f; skyB = 0.05f; }
    else if (isDusk) { skyR = 0.12f; skyG = 0.05f; skyB = 0.08f; }
    else if (isDawn) { skyR = 0.1f; skyG = 0.08f; skyB = 0.12f; }
    else { skyR = 0.05f; skyG = 0.08f; skyB = 0.15f; }
    for (int y = roof + 1; y < S; y++) {
        float grad = 1.0f - (float)(y - roof) / (S - roof);
        for (int x = 0; x < W; x++) setP(x, y, skyR * (1 + grad * 0.5f), skyG * (1 + grad * 0.3f), skyB * (1 + grad * 0.8f));
    }

    // Room backgrounds with warm ambient + subtle wall colour tints
    static const float wallTints[SH_ROOM_COUNT][3] = {
        {0.08f, 0.06f, 0.04f}, {0.06f, 0.08f, 0.04f}, {0.08f, 0.06f, 0.03f}, {0.06f, 0.05f, 0.07f},
        {0.05f, 0.05f, 0.05f}, {0.04f, 0.05f, 0.07f}, {0.06f, 0.04f, 0.07f}, {0.04f, 0.07f, 0.07f},
        {0.04f, 0.05f, 0.07f}, {0.07f, 0.05f, 0.06f}, {0.05f, 0.05f, 0.04f}, {0.04f, 0.06f, 0.06f},
    };
    // g_shRooms doesn't carry wallCol/floorCol (added only bedroom/sitLike
    // flags for the shadow-mode port) - reconstruct the same per-room base
    // colours from effects.js's shRooms literal here, indexed the same way.
    static const float roomWallCol[SH_ROOM_COUNT][3] = {
        {0.12f,0.11f,0.09f},{0.2f,0.17f,0.1f},{0.16f,0.12f,0.07f},{0.13f,0.1f,0.06f},
        {0.11f,0.1f,0.08f},{0.11f,0.09f,0.06f},{0.09f,0.07f,0.14f},{0.12f,0.16f,0.17f},
        {0.08f,0.07f,0.12f},{0.14f,0.09f,0.13f},{0.1f,0.09f,0.08f},{0.09f,0.13f,0.13f},
    };
    static const float roomFloorCol[SH_ROOM_COUNT][3] = {
        {0.1f,0.1f,0.08f},{0.14f,0.12f,0.08f},{0.12f,0.09f,0.06f},{0.1f,0.08f,0.05f},
        {0.08f,0.07f,0.06f},{0.08f,0.06f,0.04f},{0.07f,0.05f,0.1f},{0.1f,0.12f,0.12f},
        {0.06f,0.05f,0.08f},{0.1f,0.06f,0.09f},{0.07f,0.06f,0.05f},{0.07f,0.09f,0.09f},
    };
    bool roomOccupied[SH_ROOM_COUNT];
    for (int ri = 0; ri < SH_ROOM_COUNT; ri++) {
        const ShRoom& rm = g_shRooms[ri];
        bool occ = false;
        for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) if (g_shPeople[pi].targetRoom == ri) { occ = true; break; }
        roomOccupied[ri] = occ;
        float litMul = occ ? (isNight ? 0.5f : 1.0f) : 0.2f;
        fillRect(rm.x1, rm.y1, rm.x2, rm.y2,
                  (roomWallCol[ri][0] + wallTints[ri][0]) * litMul,
                  (roomWallCol[ri][1] + wallTints[ri][1]) * litMul,
                  (roomWallCol[ri][2] + wallTints[ri][2]) * litMul);
        hLine(rm.x1, rm.x2, rm.y1, roomFloorCol[ri][0] * 1.5f, roomFloorCol[ri][1] * 1.5f, roomFloorCol[ri][2] * 1.5f);
        if (occ) {
            int cx = (rm.x1 + rm.x2) / 2, cy = rm.y2;
            for (int dy = -2; dy <= 2; dy++) for (int dx = -3; dx <= 3; dx++) {
                float d = sqrtf((float)(dx * dx + dy * dy));
                if (d < 3.5f) setP(cx + dx, cy + dy, 0.08f * (1 - d / 4), 0.07f * (1 - d / 4), 0.03f * (1 - d / 4));
            }
            setP(cx, cy, 0.3f, 0.28f, 0.15f); setP(cx - 1, cy, 0.15f, 0.14f, 0.08f); setP(cx + 1, cy, 0.15f, 0.14f, 0.08f);
        }
    }

    // Structure
    const float wc[3] = {0.35f, 0.28f, 0.18f};
    hLine(0, W - 1, ground, wc[0], wc[1], wc[2]);
    hLine(0, W - 1, floor1, wc[0], wc[1], wc[2]);
    hLine(0, W - 1, roof, wc[0], wc[1], wc[2]);
    vLine(0, ground, roof, wc[0] * 0.8f, wc[1] * 0.8f, wc[2] * 0.8f);
    vLine(W - 1, ground, roof, wc[0] * 0.8f, wc[1] * 0.8f, wc[2] * 0.8f);
    for (int ri = 0; ri < SH_ROOM_COUNT; ri++) {
        const ShRoom& rm = g_shRooms[ri];
        vLine(rm.x1 - 1, rm.y1 - 1, rm.y2 + 1, wc[0] * 0.5f, wc[1] * 0.5f, wc[2] * 0.5f);
    }
    const int roofPeak = S - 2, roofMid = (int)(W * 0.5f);
    for (int x = 0; x < W; x++) {
        int ry = roof + (int)roundf(fmaxf(0.0f, 1.0f - fabsf(x - roofMid) / (W * 0.5f)) * (roofPeak - roof));
        setP(x, ry, wc[0], wc[1], wc[2]);
        setP(x, ry - 1, wc[0] * 0.6f, wc[1] * 0.6f, wc[2] * 0.6f);
    }

    // Stairs (diagonal steps + banister)
    const ShRoom& hall = g_shRooms[4];
    int stairL = hall.x1 + 2, stairR = hall.x2 - 2;
    int stairW = stairR - stairL;
    int stairH = floor1 - ground - 1;
    int numSteps = stairH < stairW ? stairH : stairW;
    for (int s = 0; s <= numSteps; s++) {
        int sx = stairL + (int)roundf(s * ((float)stairW / numSteps));
        int sy = ground + 1 + (int)roundf(s * ((float)stairH / numSteps));
        hLine(sx, sx + 2, sy, 0.25f, 0.2f, 0.14f);
        setP(sx, sy + 1, 0.15f, 0.12f, 0.08f);
    }
    for (int s = 0; s <= numSteps; s += 2) {
        int sx = stairL + (int)roundf(s * ((float)stairW / numSteps)) + 3;
        int sy = ground + 1 + (int)roundf(s * ((float)stairH / numSteps));
        vLine(sx, sy, sy + 3, 0.2f, 0.15f, 0.08f);
    }

    // Furniture, big and colourful, fills every room - direct port of
    // effects.js's per-room hand-placed decoration, room indices matching
    // initSimHouse's addRoom() order (0=garage,1=kitchen,2=dining,3=living,
    // 4=hallway,5=study,6=bedroom1,7=bathroom,8=bedroom2,9=kidsroom,
    // 10=landing,11=ensuite).
    const ShRoom& kit = g_shRooms[1];
    fillRect(kit.x1 + 1, kit.y1, kit.x1 + 8, kit.y1 + 4, 0.45f, 0.4f, 0.32f);
    fillRect(kit.x2 - 8, kit.y1, kit.x2 - 1, kit.y1 + 4, 0.4f, 0.38f, 0.3f);
    fillRect(kit.x2 - 4, kit.y1, kit.x2 - 1, kit.y1 + 7, 0.5f, 0.52f, 0.55f);
    setP(kit.x2 - 2, kit.y1 + 6, 0.3f, 0.55f, 0.85f); setP(kit.x2 - 2, kit.y1 + 4, 0.25f, 0.45f, 0.7f);
    setP(kit.x2 - 3, kit.y1 + 5, 0.35f, 0.35f, 0.4f);
    fillRect(kit.x1 + 9, kit.y1, kit.x1 + 13, kit.y1 + 3, 0.35f, 0.35f, 0.38f);
    setP(kit.x1 + 10, kit.y1 + 3, 0.2f, 0.2f, 0.22f); setP(kit.x1 + 12, kit.y1 + 3, 0.2f, 0.2f, 0.22f);
    fillRect(kit.x1 + 1, kit.y2 - 4, kit.x1 + 6, kit.y2 - 1, 0.3f, 0.22f, 0.12f);
    fillRect(kit.x1 + 8, kit.y2 - 4, kit.x1 + 13, kit.y2 - 1, 0.3f, 0.22f, 0.12f);
    fillRect(kit.x2 - 8, kit.y2 - 3, kit.x2 - 5, kit.y2 - 1, 0.28f, 0.2f, 0.1f);
    fillRect(kit.x1 + 4, kit.y1 + 4, kit.x1 + 6, kit.y1 + 5, 0.5f, 0.55f, 0.6f);
    setP(kit.x1 + 5, kit.y1 + 6, 0.4f, 0.42f, 0.45f);
    setP(kit.x1 + 2, kit.y1 + 5, 0.8f, 0.2f, 0.15f); setP(kit.x1 + 3, kit.y1 + 5, 0.9f, 0.7f, 0.1f); setP(kit.x1 + 4, kit.y1 + 5, 0.2f, 0.7f, 0.15f);
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) {
        const ShPerson& p = g_shPeople[pi];
        if (p.targetRoom == 1 && fabsf(p.x - (kit.x1 + 11)) < 5) {
            float fl = 0.7f + 0.3f * sinf(shT * 12);
            setP(kit.x1 + 10, kit.y1 + 4, fl, fl * 0.4f, 0.05f);
            setP(kit.x1 + 11, kit.y1 + 4, fl * 0.8f, fl * 0.3f, 0.05f);
            setP(kit.x1 + 12, kit.y1 + 4, fl * 0.6f, fl * 0.2f, 0.02f);
            if (shRandom01() < 0.3f) shSpawnParticle(kit.x1 + 10 + shRandom01() * 3, kit.y1 + 5, (shRandom01() - 0.5f) * 0.5f, 1.5f + shRandom01(), 1.5f, 0.3f, 0.3f, 0.3f);
            break;
        }
    }

    const ShRoom& din = g_shRooms[2];
    int dtX = (din.x1 + din.x2) / 2;
    fillRect(dtX - 7, din.y1, dtX + 7, din.y1 + 1, 0.2f, 0.1f, 0.08f);
    fillRect(dtX - 6, din.y1 + 3, dtX + 6, din.y1 + 6, 0.45f, 0.28f, 0.12f);
    vLine(dtX - 5, din.y1, din.y1 + 2, 0.38f, 0.22f, 0.1f); vLine(dtX + 5, din.y1, din.y1 + 2, 0.38f, 0.22f, 0.1f);
    fillRect(dtX - 9, din.y1, dtX - 8, din.y1 + 6, 0.35f, 0.2f, 0.1f); fillRect(dtX + 8, din.y1, dtX + 9, din.y1 + 6, 0.35f, 0.2f, 0.1f);
    fillRect(dtX - 3, din.y1, dtX - 2, din.y1 + 2, 0.35f, 0.2f, 0.1f); fillRect(dtX + 2, din.y1, dtX + 3, din.y1 + 2, 0.35f, 0.2f, 0.1f);
    setP(dtX, din.y2, 0.6f, 0.55f, 0.25f); setP(dtX - 1, din.y2, 0.4f, 0.35f, 0.15f); setP(dtX + 1, din.y2, 0.4f, 0.35f, 0.15f);
    setP(dtX - 2, din.y2 - 1, 0.55f, 0.5f, 0.2f); setP(dtX + 2, din.y2 - 1, 0.55f, 0.5f, 0.2f);
    vLine(dtX, din.y2 - 2, din.y2, 0.15f, 0.12f, 0.08f);
    for (int i = -4; i <= 4; i += 2) { setP(dtX + i, din.y1 + 5, 0.6f, 0.6f, 0.65f); setP(dtX + i, din.y1 + 4, 0.5f, 0.15f, 0.1f); }
    fillRect(din.x2 - 4, din.y1, din.x2 - 1, din.y1 + 4, 0.25f, 0.18f, 0.1f);
    setP(din.x2 - 2, din.y1 + 4, 0.6f, 0.3f, 0.15f);
    setP(din.x2 - 2, din.y1 + 5, 0.2f, 0.6f, 0.15f); setP(din.x2 - 3, din.y1 + 5, 0.15f, 0.5f, 0.1f);
    setP(din.x1 + 1, din.y1 + 1, 0.25f, 0.55f, 0.15f); setP(din.x1 + 2, din.y1 + 2, 0.2f, 0.5f, 0.12f); setP(din.x1 + 1, din.y1 + 2, 0.18f, 0.45f, 0.1f);
    setP(din.x1 + 1, din.y1, 0.3f, 0.2f, 0.1f);

    const ShRoom& liv = g_shRooms[3];
    fillRect(liv.x1 + 2, liv.y1, liv.x2 - 4, liv.y1 + 1, 0.25f, 0.08f, 0.06f);
    fillRect(liv.x1 + 3, liv.y1 + 1, liv.x2 - 5, liv.y1 + 1, 0.2f, 0.1f, 0.12f);
    fillRect(liv.x1 + 2, liv.y1 + 2, liv.x1 + 14, liv.y1 + 5, 0.3f, 0.15f, 0.1f);
    fillRect(liv.x1 + 2, liv.y1 + 6, liv.x1 + 4, liv.y1 + 7, 0.28f, 0.13f, 0.08f);
    fillRect(liv.x1 + 12, liv.y1 + 6, liv.x1 + 14, liv.y1 + 7, 0.28f, 0.13f, 0.08f);
    fillRect(liv.x1 + 4, liv.y1 + 5, liv.x1 + 6, liv.y1 + 6, 0.6f, 0.25f, 0.15f);
    fillRect(liv.x1 + 7, liv.y1 + 5, liv.x1 + 9, liv.y1 + 6, 0.15f, 0.4f, 0.55f);
    fillRect(liv.x1 + 10, liv.y1 + 5, liv.x1 + 12, liv.y1 + 6, 0.5f, 0.45f, 0.15f);
    bool tvOn = false;
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) if (g_shPeople[pi].targetRoom == 3) { tvOn = true; break; }
    int tvX = liv.x2 - 10;
    fillRect(tvX, liv.y1 + 7, tvX + 10, liv.y1 + 13, 0.04f, 0.04f, 0.04f);
    if (tvOn) {
        float fl = 0.5f + 0.2f * sinf(shT * 5) + 0.15f * sinf(shT * 9.3f);
        fillRect(tvX + 1, liv.y1 + 8, tvX + 9, liv.y1 + 12, fl * 0.25f, fl * 0.45f, fl * 0.95f);
        for (int d = 1; d < 6; d++) {
            float fade = 0.04f * (1 - (float)d / 6);
            fillRect(tvX - d, liv.y1 + 7, tvX + 10 + d, liv.y1 + 13, fade * fl, fade * fl * 1.2f, fade * fl * 2);
        }
    }
    fillRect(liv.x1 + 15, liv.y1 + 1, liv.x1 + 20, liv.y1 + 3, 0.3f, 0.22f, 0.1f);
    setP(liv.x1 + 17, liv.y1 + 3, 0.5f, 0.1f, 0.1f);
    vLine(liv.x1 + 1, liv.y1 + 4, liv.y1 + 9, 0.15f, 0.12f, 0.08f);
    setP(liv.x1 + 1, liv.y1 + 9, 0.5f, 0.45f, 0.2f); setP(liv.x1, liv.y1 + 9, 0.4f, 0.35f, 0.15f);
    fillRect(liv.x2 - 4, liv.y1, liv.x2 - 1, liv.y2 - 1, 0.22f, 0.15f, 0.08f);
    for (int by = liv.y1; by < liv.y2 - 1; by++) {
        float hue = by * 0.7f;
        setP(liv.x2 - 3, by, 0.3f + 0.3f * sinf(hue), 0.2f + 0.2f * sinf(hue + 2), 0.2f + 0.2f * sinf(hue + 4));
        setP(liv.x2 - 2, by, 0.25f + 0.25f * sinf(hue + 1), 0.3f + 0.2f * sinf(hue + 3), 0.15f + 0.15f * sinf(hue + 5));
    }
    fillRect(liv.x1 + 5, liv.y2 - 4, liv.x1 + 9, liv.y2 - 2, 0.15f, 0.3f, 0.45f);
    fillRect(liv.x1 + 11, liv.y2 - 3, liv.x1 + 14, liv.y2 - 1, 0.4f, 0.25f, 0.15f);

    const ShRoom& stu = g_shRooms[5];
    fillRect(stu.x1 + 2, stu.y1, stu.x2 - 3, stu.y1 + 4, 0.32f, 0.22f, 0.12f);
    fillRect(stu.x1 + 4, stu.y1 + 5, stu.x1 + 8, stu.y1 + 8, 0.1f, 0.1f, 0.14f);
    fillRect(stu.x1 + 10, stu.y1 + 5, stu.x1 + 14, stu.y1 + 8, 0.1f, 0.1f, 0.14f);
    fillRect(stu.x1 + 7, stu.y1, stu.x1 + 10, stu.y1 + 5, 0.18f, 0.18f, 0.22f);
    bool studyOcc = false;
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) if (g_shPeople[pi].targetRoom == 5) { studyOcc = true; break; }
    if (studyOcc) {
        fillRect(stu.x1 + 5, stu.y1 + 6, stu.x1 + 7, stu.y1 + 7, 0.2f, 0.6f, 0.8f);
        fillRect(stu.x1 + 11, stu.y1 + 6, stu.x1 + 13, stu.y1 + 7, 0.2f, 0.6f, 0.8f);
    }
    setP(stu.x2 - 4, stu.y1 + 5, 0.75f, 0.65f, 0.25f); setP(stu.x2 - 4, stu.y1 + 6, 0.45f, 0.38f, 0.15f);
    vLine(stu.x2 - 4, stu.y1 + 3, stu.y1 + 5, 0.2f, 0.18f, 0.1f);
    fillRect(stu.x2 - 2, stu.y1, stu.x2, stu.y2 - 1, 0.2f, 0.14f, 0.08f);
    for (int by = stu.y1; by < stu.y2 - 1; by++) setP(stu.x2 - 1, by, 0.4f + 0.3f * sinf(by * 1.2f), 0.15f + 0.2f * sinf(by * 0.9f), 0.2f + 0.2f * sinf(by * 1.5f));
    setP(stu.x1 + 1, stu.y1 + 1, 0.2f, 0.5f, 0.15f); setP(stu.x1 + 1, stu.y1 + 2, 0.15f, 0.45f, 0.1f); setP(stu.x1 + 1, stu.y1, 0.3f, 0.2f, 0.12f);

    const ShRoom& gar = g_shRooms[0];
    fillRect(gar.x1 + 2, gar.y1, gar.x2 - 2, gar.y1 + 4, 0.1f, 0.1f, 0.2f);
    fillRect(gar.x1 + 3, gar.y1 + 5, gar.x2 - 3, gar.y1 + 7, 0.08f, 0.08f, 0.18f);
    fillRect(gar.x1 + 4, gar.y1 + 5, gar.x2 - 4, gar.y1 + 6, 0.2f, 0.28f, 0.4f);
    setP(gar.x1 + 2, gar.y1 + 2, 0.7f, 0.7f, 0.2f); setP(gar.x2 - 2, gar.y1 + 2, 0.7f, 0.1f, 0.1f);
    setP(gar.x1 + 3, gar.y1, 0.06f, 0.06f, 0.06f); setP(gar.x2 - 3, gar.y1, 0.06f, 0.06f, 0.06f);
    setP(gar.x1 + 4, gar.y1, 0.06f, 0.06f, 0.06f); setP(gar.x2 - 4, gar.y1, 0.06f, 0.06f, 0.06f);
    fillRect(gar.x1 + 1, gar.y2 - 4, gar.x1 + 4, gar.y2 - 1, 0.22f, 0.22f, 0.2f);
    setP(gar.x1 + 2, gar.y2 - 2, 0.5f, 0.4f, 0.1f); setP(gar.x1 + 3, gar.y2 - 3, 0.4f, 0.4f, 0.45f);
    fillRect(gar.x2 - 4, gar.y1, gar.x2 - 1, gar.y1 + 3, 0.28f, 0.22f, 0.12f);

    const ShRoom& br1 = g_shRooms[6];
    fillRect(br1.x1 + 1, br1.y1, br1.x1 + 1, br1.y1 + 1, 0.18f, 0.1f, 0.06f);
    fillRect(br1.x1 + 2, br1.y1, br1.x1 + 12, br1.y1 + 3, 0.24f, 0.18f, 0.1f);
    fillRect(br1.x1 + 2, br1.y1 + 4, br1.x1 + 12, br1.y1 + 6, 0.55f, 0.3f, 0.5f);
    fillRect(br1.x1 + 2, br1.y1 + 7, br1.x1 + 5, br1.y1 + 7, 0.7f, 0.7f, 0.75f);
    fillRect(br1.x1 + 9, br1.y1 + 7, br1.x1 + 12, br1.y1 + 7, 0.7f, 0.7f, 0.75f);
    fillRect(br1.x1 + 1, br1.y1, br1.x1 + 1, br1.y1 + 3, 0.2f, 0.15f, 0.08f);
    fillRect(br1.x1 + 13, br1.y1, br1.x1 + 13, br1.y1 + 3, 0.2f, 0.15f, 0.08f);
    fillRect(br1.x2 - 5, br1.y1, br1.x2 - 1, br1.y2 - 1, 0.22f, 0.15f, 0.08f);
    vLine(br1.x2 - 3, br1.y1, br1.y2 - 2, 0.17f, 0.12f, 0.06f);
    setP(br1.x2 - 2, br1.y1 + (br1.y2 - br1.y1) / 2, 0.4f, 0.35f, 0.2f);
    fillRect(br1.x2 - 8, br1.y1, br1.x2 - 6, br1.y1 + 3, 0.25f, 0.18f, 0.1f);
    fillRect(br1.x2 - 8, br1.y1 + 4, br1.x2 - 6, br1.y1 + 6, 0.35f, 0.4f, 0.45f);
    fillRect(br1.x1 + 5, br1.y2 - 4, br1.x1 + 9, br1.y2 - 2, 0.15f, 0.35f, 0.5f);
    bool br1Occ = false;
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) if (g_shPeople[pi].targetRoom == 6) { br1Occ = true; break; }
    if (br1Occ && isNight) { setP(br1.x1 + 1, br1.y1 + 4, 0.4f, 0.32f, 0.12f); setP(br1.x1 + 13, br1.y1 + 4, 0.4f, 0.32f, 0.12f); }

    const ShRoom& bath = g_shRooms[7];
    fillRect(bath.x1 + 1, bath.y1, bath.x1 + 8, bath.y1 + 4, 0.38f, 0.42f, 0.48f);
    fillRect(bath.x1 + 2, bath.y1 + 1, bath.x1 + 7, bath.y1 + 3, 0.4f, 0.55f, 0.65f);
    fillRect(bath.x2 - 4, bath.y1, bath.x2 - 1, bath.y1 + 4, 0.8f, 0.8f, 0.85f);
    setP(bath.x2 - 2, bath.y1 + 4, 0.6f, 0.6f, 0.65f);
    fillRect(bath.x2 - 7, bath.y1 + 5, bath.x2 - 4, bath.y1 + 8, 0.6f, 0.6f, 0.65f);
    setP(bath.x2 - 5, bath.y1 + 8, 0.4f, 0.45f, 0.5f);
    fillRect(bath.x2 - 8, bath.y2 - 5, bath.x2 - 4, bath.y2 - 1, 0.35f, 0.4f, 0.48f);
    hLine(bath.x1 + 1, bath.x1 + 3, bath.y2 - 2, 0.15f, 0.12f, 0.1f);
    setP(bath.x1 + 2, bath.y2 - 3, 0.6f, 0.2f, 0.2f); setP(bath.x1 + 2, bath.y2 - 4, 0.55f, 0.18f, 0.18f);
    for (int y = bath.y1; y <= bath.y2; y += 3) hLine(bath.x1, bath.x2, y, 0.18f, 0.22f, 0.25f);
    for (int x = bath.x1; x <= bath.x2; x += 4) vLine(x, bath.y1, bath.y2, 0.16f, 0.2f, 0.22f);

    const ShRoom& br2 = g_shRooms[8];
    fillRect(br2.x1 + 2, br2.y1, br2.x1 + 9, br2.y1 + 3, 0.22f, 0.16f, 0.1f);
    fillRect(br2.x1 + 2, br2.y1 + 4, br2.x1 + 9, br2.y1 + 5, 0.3f, 0.45f, 0.6f);
    fillRect(br2.x1 + 2, br2.y1 + 6, br2.x1 + 4, br2.y1 + 6, 0.65f, 0.65f, 0.7f);
    fillRect(br2.x2 - 7, br2.y1, br2.x2 - 2, br2.y1 + 4, 0.25f, 0.18f, 0.1f);
    fillRect(br2.x2 - 6, br2.y1 + 5, br2.x2 - 3, br2.y1 + 8, 0.08f, 0.08f, 0.12f);
    bool br2Occ = false;
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) if (g_shPeople[pi].targetRoom == 8) { br2Occ = true; break; }
    if (br2Occ) fillRect(br2.x2 - 5, br2.y1 + 6, br2.x2 - 4, br2.y1 + 7, 0.1f, 0.6f, 0.3f);
    fillRect(br2.x1 + 4, br2.y2 - 4, br2.x1 + 7, br2.y2 - 2, 0.6f, 0.3f, 0.1f);
    fillRect(br2.x1 + 9, br2.y2 - 3, br2.x1 + 11, br2.y2 - 1, 0.1f, 0.4f, 0.6f);
    fillRect(br2.x2 - 2, br2.y1, br2.x2, br2.y2 - 2, 0.24f, 0.16f, 0.08f);
    for (int by = br2.y1; by < br2.y2 - 2; by++) setP(br2.x2 - 1, by, 0.5f, 0.2f + by * 0.008f, 0.25f);

    const ShRoom& kids = g_shRooms[9];
    fillRect(kids.x1 + 1, kids.y1, kids.x1 + 8, kids.y1 + 3, 0.24f, 0.18f, 0.1f);
    fillRect(kids.x1 + 1, kids.y1 + 4, kids.x1 + 8, kids.y1 + 5, 0.45f, 0.6f, 0.35f);
    fillRect(kids.x1 + 1, kids.y1 + 8, kids.x1 + 8, kids.y1 + 9, 0.24f, 0.18f, 0.1f);
    fillRect(kids.x1 + 1, kids.y1 + 10, kids.x1 + 8, kids.y1 + 11, 0.4f, 0.45f, 0.7f);
    vLine(kids.x1 + 8, kids.y1, kids.y1 + 12, 0.3f, 0.24f, 0.14f);
    vLine(kids.x1 + 1, kids.y1, kids.y1 + 12, 0.3f, 0.24f, 0.14f);
    fillRect(kids.x1 + 10, kids.y1, kids.x1 + 14, kids.y1 + 3, 0.6f, 0.3f, 0.35f);
    setP(kids.x1 + 15, kids.y1, 0.9f, 0.2f, 0.2f); setP(kids.x1 + 16, kids.y1, 0.2f, 0.8f, 0.2f);
    setP(kids.x1 + 14, kids.y1 + 1, 0.2f, 0.2f, 0.9f); setP(kids.x1 + 17, kids.y1, 0.9f, 0.9f, 0.15f);
    setP(kids.x1 + 13, kids.y1, 0.8f, 0.4f, 0.8f); setP(kids.x1 + 18, kids.y1 + 1, 0.1f, 0.7f, 0.7f);
    fillRect(kids.x2 - 6, kids.y1, kids.x2 - 4, kids.y1 + 3, 0.55f, 0.25f, 0.5f);
    fillRect(kids.x2 - 7, kids.y2 - 5, kids.x2 - 3, kids.y2 - 1, 0.55f, 0.3f, 0.6f);
    fillRect(kids.x2 - 12, kids.y2 - 4, kids.x2 - 9, kids.y2 - 1, 0.3f, 0.55f, 0.3f);
    fillRect(kids.x1 + 4, kids.y2 - 3, kids.x1 + 7, kids.y2 - 1, 0.6f, 0.5f, 0.15f);
    fillRect(kids.x2 - 3, kids.y1, kids.x2 - 1, kids.y1 + 3, 0.28f, 0.2f, 0.1f);

    const ShRoom& ens = g_shRooms[11];
    fillRect(ens.x1 + 1, ens.y1, ens.x1 + 5, ens.y1 + 7, 0.24f, 0.3f, 0.35f);
    vLine(ens.x1 + 6, ens.y1, ens.y1 + 8, 0.35f, 0.4f, 0.5f);
    setP(ens.x1 + 3, ens.y1 + 8, 0.5f, 0.5f, 0.6f);
    hLine(ens.x1 + 2, ens.x1 + 4, ens.y1 + 8, 0.4f, 0.42f, 0.5f);
    fillRect(ens.x2 - 4, ens.y1, ens.x2 - 1, ens.y1 + 4, 0.75f, 0.75f, 0.8f);
    fillRect(ens.x2 - 6, ens.y1 + 5, ens.x2 - 4, ens.y1 + 7, 0.55f, 0.55f, 0.6f);
    fillRect(ens.x2 - 7, ens.y2 - 4, ens.x2 - 4, ens.y2 - 1, 0.3f, 0.38f, 0.42f);

    // People (8px tall, 3px wide standing figure; distinct sleeping/sitting poses)
    for (int pi = 0; pi < SH_PEOPLE_COUNT; pi++) {
        const ShPerson& p = g_shPeople[pi];
        int px = (int)roundf(p.x), py = (int)roundf(p.y);
        int ph = p.h ? p.h : 7;
        float legAnim = p.walking ? sinf(p.animFrame * 3) : 0;
        // Person colours weren't carried over into ShPerson (only used for
        // the shadow-mode port, which only needs silhouettes) - reconstruct
        // the same per-person palette from effects.js's pDefs literal here.
        static const float skinC[SH_PEOPLE_COUNT][3] = {
            {1,0.75f,0.55f},{1,0.78f,0.6f},{0.92f,0.72f,0.52f},{1,0.82f,0.62f},
            {0.95f,0.72f,0.55f},{1,0.84f,0.65f},{0.85f,0.65f,0.45f},{0.9f,0.7f,0.5f},
        };
        static const float hairC[SH_PEOPLE_COUNT][3] = {
            {0.3f,0.2f,0.1f},{0.55f,0.3f,0.12f},{0.15f,0.12f,0.08f},{0.6f,0.4f,0.12f},
            {0.7f,0.7f,0.72f},{0.65f,0.45f,0.15f},{0.1f,0.08f,0.06f},{0.4f,0.25f,0.1f},
        };
        static const float shirtC[SH_PEOPLE_COUNT][3] = {
            {0.15f,0.3f,0.7f},{0.7f,0.15f,0.4f},{0.1f,0.55f,0.25f},{0.9f,0.55f,0.1f},
            {0.4f,0.2f,0.3f},{0.8f,0.3f,0.3f},{0.3f,0.3f,0.5f},{0.5f,0.4f,0.15f},
        };
        static const float pantsC[SH_PEOPLE_COUNT][3] = {
            {0.1f,0.1f,0.2f},{0.08f,0.08f,0.12f},{0.2f,0.2f,0.25f},{0.22f,0.15f,0.3f},
            {0.15f,0.12f,0.15f},{0.15f,0.2f,0.3f},{0.12f,0.12f,0.15f},{0.1f,0.1f,0.12f},
        };
        const float* skin = skinC[pi]; const float* hair = hairC[pi];
        const float* shirt = shirtC[pi]; const float* pants = pantsC[pi];

        if (p.sleeping) {
            for (int i = 0; i < 4; i++) setP(px + i, py + 3, shirt[0] * (1 - i * 0.1f), shirt[1] * (1 - i * 0.1f), shirt[2] * (1 - i * 0.1f));
            setP(px - 1, py + 3, skin[0], skin[1], skin[2]);
            setP(px - 1, py + 4, hair[0], hair[1], hair[2]);
            if (sinf(shT * 2) > 0.3f) { setP(px + 1, py + 5, 0.25f, 0.25f, 0.45f); setP(px + 2, py + 6, 0.2f, 0.2f, 0.35f); }
        } else if (p.sitting) {
            setP(px, py + 4, hair[0], hair[1], hair[2]); setP(px + 1, py + 4, hair[0], hair[1], hair[2]);
            setP(px, py + 3, skin[0], skin[1], skin[2]); setP(px + 1, py + 3, skin[0] * 0.9f, skin[1] * 0.9f, skin[2] * 0.9f);
            fillRect(px - 1, py + 1, px + 2, py + 2, shirt[0], shirt[1], shirt[2]);
            setP(px, py, pants[0], pants[1], pants[2]); setP(px + 1, py, pants[0], pants[1], pants[2]);
            setP(px - 1, py + 1, skin[0] * 0.8f, skin[1] * 0.8f, skin[2] * 0.8f);
            setP(px + 2, py + 1, skin[0] * 0.8f, skin[1] * 0.8f, skin[2] * 0.8f);
        } else {
            setP(px, py + ph - 1, hair[0], hair[1], hair[2]); setP(px + 1, py + ph - 1, hair[0], hair[1], hair[2]);
            setP(px, py + ph - 2, skin[0], skin[1], skin[2]); setP(px + 1, py + ph - 2, skin[0] * 0.95f, skin[1] * 0.95f, skin[2] * 0.95f);
            for (int ty = ph - 3; ty >= ph - 5; ty--) {
                setP(px - 1, py + ty, shirt[0] * 0.85f, shirt[1] * 0.85f, shirt[2] * 0.85f);
                setP(px, py + ty, shirt[0], shirt[1], shirt[2]);
                setP(px + 1, py + ty, shirt[0] * 0.9f, shirt[1] * 0.9f, shirt[2] * 0.9f);
            }
            int armY = py + ph - 3;
            if (p.walking) {
                int armSwing = (int)roundf(legAnim * 1.2f);
                setP(px - 2, armY + armSwing, skin[0] * 0.85f, skin[1] * 0.85f, skin[2] * 0.85f);
                setP(px + 2, armY - armSwing, skin[0] * 0.85f, skin[1] * 0.85f, skin[2] * 0.85f);
            } else {
                setP(px - 2, armY - 1, skin[0] * 0.8f, skin[1] * 0.8f, skin[2] * 0.8f);
                setP(px + 2, armY - 1, skin[0] * 0.8f, skin[1] * 0.8f, skin[2] * 0.8f);
            }
            int legOff = (int)roundf(legAnim * 1.2f);
            setP(px + legOff, py, pants[0], pants[1], pants[2]);
            setP(px - legOff, py, pants[0] * 0.85f, pants[1] * 0.85f, pants[2] * 0.85f);
            setP(px, py + 1, pants[0] * 0.9f, pants[1] * 0.9f, pants[2] * 0.9f);
            setP(px + 1, py + 1, pants[0] * 0.85f, pants[1] * 0.85f, pants[2] * 0.85f);
            setP(px, py + 2, pants[0] * 0.8f, pants[1] * 0.8f, pants[2] * 0.8f);
            setP(px + 1, py + 2, pants[0] * 0.75f, pants[1] * 0.75f, pants[2] * 0.75f);
        }
    }

    // Particles (kitchen steam / dust motes)
    for (int i = g_shParticleCount - 1; i >= 0; i--) {
        ShParticle& pt = g_shParticles[i];
        pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
        if (pt.life <= 0) {
            g_shParticles[i] = g_shParticles[g_shParticleCount - 1];
            g_shParticleCount--;
            continue;
        }
        float a = pt.life;
        setP((int)roundf(pt.x), (int)roundf(pt.y), pt.r * a, pt.g * a, pt.b * a);
    }
    if (shRandom01() < 0.15f) {
        int ri = (int)(shRandom01() * 12);
        bool occ = roomOccupied[ri];
        if (occ) {
            const ShRoom& rm = g_shRooms[ri];
            shSpawnParticle(rm.x1 + shRandom01() * (rm.x2 - rm.x1), rm.y1 + shRandom01() * (rm.y2 - rm.y1),
                             (shRandom01() - 0.5f) * 0.3f, 0.2f + shRandom01() * 0.3f, 3 + shRandom01() * 3,
                             0.15f, 0.14f, 0.08f);
        }
    }

    // Chimney smoke
    if (isNight || isDusk) {
        int chimneyX = (int)(W * 0.35f);
        for (int s = 0; s < 8; s++) {
            int sy = roof + 3 + s;
            int sx = chimneyX + (int)roundf(sinf(shT * 0.8f + s * 0.7f) * 2);
            float fade = 0.18f * (1 - (float)s / 8);
            setP(sx, sy, fade, fade, fade * 0.85f);
            setP(sx + 1, sy, fade * 0.7f, fade * 0.7f, fade * 0.6f);
            setP(sx - 1, sy, fade * 0.4f, fade * 0.4f, fade * 0.35f);
        }
        fillRect(chimneyX - 1, roof, chimneyX + 2, roof + 2, 0.3f, 0.2f, 0.12f);
    }

    // Stars + occasional shooting star
    if (isNight) {
        for (int i = 0; i < 50; i++) {
            int sx = (i * 97 + 23) % W, sy = roof + 3 + (i * 53 + 17) % (S - roof - 4);
            float tw = 0.12f + 0.1f * sinf(shT * 1.2f + i * 2.7f);
            setP(sx, sy, tw, tw, tw * 1.3f);
        }
        if (sinf(shT * 0.3f) > 0.98f) {
            int ssX = ((int)(W * 0.3f + shT * 20)) % W;
            int ssY = S - 3;
            for (int tt = 0; tt < 5; tt++) setP(ssX - tt * 2, ssY - tt, 0.4f * (1 - tt / 5.0f), 0.4f * (1 - tt / 5.0f), 0.5f * (1 - tt / 5.0f));
        }
    }

    // Moon
    if (isNight) {
        int mx = (int)(W * 0.8f), my = S - 8;
        for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++)
            if (dx * dx + dy * dy <= 5) setP(mx + dx, my + dy, 0.25f, 0.25f, 0.2f);
        setP(mx, my, 0.4f, 0.4f, 0.32f); setP(mx - 1, my, 0.35f, 0.35f, 0.28f);
        for (int dy = -4; dy <= 4; dy++) for (int dx = -4; dx <= 4; dx++) {
            float d = sqrtf((float)(dx * dx + dy * dy));
            if (d > 2 && d < 5) setP(mx + dx, my + dy, 0.03f, 0.03f, 0.05f);
        }
    }

    // Window light spilling onto the ground at night, for occupied rooms
    if (isNight) {
        for (int ri = 0; ri < SH_ROOM_COUNT; ri++) {
            if (!roomOccupied[ri]) continue;
            const ShRoom& rm = g_shRooms[ri];
            int wx = (rm.x1 + rm.x2) / 2;
            for (int d = 1; d < 4; d++) {
                float fade = 0.06f * (1 - (float)d / 4);
                setP(wx - d, ground - 1, fade * 0.8f, fade * 0.7f, fade * 0.3f);
                setP(wx + d, ground - 1, fade * 0.8f, fade * 0.7f, fade * 0.3f);
                setP(wx, ground - 1, fade, fade * 0.9f, fade * 0.4f);
            }
        }
    }
}

// Dispatcher entry point - builds the shared wide canvas once per frame
// (on face 0's call) and blits the appropriate segment for every face,
// same panorama-order/mirroring/roof-tile/floor-tile treatment both modes
// share. g_shShadowMode picks which of the two builders runs; synced from
// the browser's shadows/rooms toggle via setOption (web_server.h), default
// false (rooms) matching the browser's own default.
inline volatile bool g_shShadowMode = false;

inline void standaloneRenderSimHouse(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    const int S = PANEL_SIZE, W = 4 * S;
    if (!g_shInit) initSimHouse();
    if (!g_shBuf) { snClear(face); return; }

    static float lastT = -1;
    if (face == 0) {
        float dt = lastT < 0 ? 0 : (t - lastT);
        lastT = t;
        g_shT += dt;
        shUpdatePeople(dt, S, W);
        if (g_shShadowMode) standaloneSimHouseShadowsBuild(g_shT);
        else standaloneSimHouseRoomsBuild(dt, g_shT);
    }

    if (face == 4) {
        // Top face: tiled roof pattern (both modes share this)
        for (int y = 0; y < S; y++) {
            for (int x = 0; x < S; x++) {
                float r = 0.38f, g = 0.36f, b = 0.34f;
                const int tileH = 6, tileW = 8;
                int row = y / tileH;
                int offset = (row % 2) * (tileW / 2);
                int localV = y % tileH, localU = (x + offset) % tileW;
                float tileHash = (float)((row * 13 + ((x + offset) / tileW) * 7) % 17) / 17.0f;
                r += tileHash * 0.06f - 0.03f; g += tileHash * 0.05f - 0.025f; b += tileHash * 0.04f - 0.02f;
                if (localV == 0) { r -= 0.08f; g -= 0.08f; b -= 0.07f; }
                if (localU == 0) { r -= 0.06f; g -= 0.06f; b -= 0.05f; }
                float ridgeFade = 1.0f - fabsf(y - S / 2.0f) / (S * 0.6f);
                r += ridgeFade * 0.04f; g += ridgeFade * 0.04f; b += ridgeFade * 0.03f;
                snSet(face, x, y, r, g, b);
            }
        }
        return;
    }
    if (face == 5) {
        // Bottom face colour differs per mode - shadow mode is plain
        // daylight-grey ground, rooms mode is a dark night-sky-ish colour
        // (matches each JS branch's own OUTPUT block exactly).
        if (g_shShadowMode) {
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) snSet(face, x, y, 0.7f, 0.7f, 0.68f);
        } else {
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) snSet(face, x, y, 0.04f, 0.05f, 0.02f);
        }
        return;
    }

    static const int VID_FACE_ORDER[4] = {0, 3, 1, 2};
    int fIdx = -1;
    for (int i = 0; i < 4; i++) if (VID_FACE_ORDER[i] == face) { fIdx = i; break; }
    if (fIdx < 0) { snClear(face); return; }
    for (int v = 0; v < S; v++) {
        for (int u = 0; u < S; u++) {
            int pu = S - 1 - u;
            int sx = fIdx * S + pu;
            int i = (v * W + sx) * 3;
            snSet(face, u, v, g_shBuf[i] / 255.0f, g_shBuf[i + 1] / 255.0f, g_shBuf[i + 2] / 255.0f);
        }
    }
}

// ===========================================================================
// Near-Earth Objects (NASA NeoWs API) - real fetch, same fields/sort/risk
// classification as effects.js's effectNEO. Faithful port of the 3D-cube
// branch: Face 0 (Earth + pulsing risk ring), Faces 2/3 (distance-scaled
// object blips), Face 4 (title card), Face 1 (scrolling ticker).
//
// TEXT LIMITATION: the browser renders the ticker/title card via HTML
// canvas fillText with a real system font - there's no equivalent font
// rasterizer available on the ESP32. Both use the already-ported WC bitmap
// font (5x7, see the word-cascade engine above) instead - the actual
// content (object names/distances/risk data, real NASA fetch, Earth/ring/
// blip geometry, colours, motion) is a faithful, real-data port; only the
// glyph shapes differ from the browser's system font.
// ===========================================================================
#define NEO_MAX_OBJECTS 12
struct NeoObject {
    char  name[32];
    bool  hazardous;
    float missLD;
    float velKmS;
    int   diaM;
};
inline NeoObject g_neoObjects[NEO_MAX_OBJECTS];
inline int       g_neoObjectCount = 0;
inline String    g_neoError;
inline volatile bool g_neoFetching = false;
inline uint32_t  g_neoLastFetchMs = 0;
inline float     g_neoT = 0;
inline float     g_neoTickerScrollX = 0;

inline int neoRisk(const NeoObject& o) {   // 0=green, 1=yellow, 2=red
    if (o.hazardous && o.missLD < 5) return 2;
    if (o.hazardous || o.missLD < 10) return 1;
    return 0;
}
inline void neoRiskRGB(int level, float* out) {
    if (level == 2) { out[0] = 1.0f; out[1] = 0.08f; out[2] = 0.08f; }
    else if (level == 1) { out[0] = 1.0f; out[1] = 0.78f; out[2] = 0.05f; }
    else { out[0] = 0.1f; out[1] = 0.95f; out[2] = 0.25f; }
}
inline int neoOverallRisk() {
    if (g_neoObjectCount == 0) return 0;
    for (int i = 0; i < g_neoObjectCount; i++) if (neoRisk(g_neoObjects[i]) == 2) return 2;
    for (int i = 0; i < g_neoObjectCount; i++) if (neoRisk(g_neoObjects[i]) == 1) return 1;
    return 0;
}

inline bool standaloneNeoFetch() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (g_neoFetching) return false;
    g_neoFetching = true;
    g_neoError = "";

    time_t nowT = time(nullptr);
    time_t endT = nowT + 6L * 86400L;
    struct tm tmStart, tmEnd;
    gmtime_r(&nowT, &tmStart);
    gmtime_r(&endT, &tmEnd);
    char startStr[11], endStr[11];
    snprintf(startStr, sizeof(startStr), "%04d-%02d-%02d", tmStart.tm_year + 1900, tmStart.tm_mon + 1, tmStart.tm_mday);
    snprintf(endStr, sizeof(endStr), "%04d-%02d-%02d", tmEnd.tm_year + 1900, tmEnd.tm_mon + 1, tmEnd.tm_mday);
    char url[192];
    snprintf(url, sizeof(url), "https://api.nasa.gov/neo/rest/v1/feed?start_date=%s&end_date=%s&api_key=DEMO_KEY", startStr, endStr);

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(5000);
    bool ok = false;
    if (http.begin(client, url)) {
        int code = http.GET();
        if (code == 200) {
            String payload = http.getString();
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload);
            if (!err) {
                JsonObject byDate = doc["near_earth_objects"].as<JsonObject>();
                struct RawNeo { char name[32]; bool hazardous; float missLD, velKmS; int diaM; };
                static RawNeo raw[64];
                int rawCount = 0;
                for (JsonPair kv : byDate) {
                    JsonArray arr = kv.value().as<JsonArray>();
                    for (JsonObject o : arr) {
                        if (rawCount >= 64) break;
                        JsonArray cad = o["close_approach_data"].as<JsonArray>();
                        if (cad.size() == 0) continue;
                        JsonObject c0 = cad[0];
                        const char* name = o["name"] | "";
                        float dMin = o["estimated_diameter"]["meters"]["estimated_diameter_min"] | 0.0f;
                        float dMax = o["estimated_diameter"]["meters"]["estimated_diameter_max"] | 0.0f;
                        RawNeo& r = raw[rawCount++];
                        int wi = 0;   // strip parens, matching JS's replace(/[()]/g,'')
                        for (const char* p = name; *p && wi < 31; p++) if (*p != '(' && *p != ')') r.name[wi++] = *p;
                        r.name[wi] = 0;
                        r.hazardous = o["is_potentially_hazardous_asteroid"] | false;
                        r.missLD = atof((const char*)(c0["miss_distance"]["lunar"] | "0"));
                        r.velKmS = atof((const char*)(c0["relative_velocity"]["kilometers_per_second"] | "0"));
                        r.diaM = (int)roundf((dMin + dMax) / 2);
                    }
                }
                // Sort ascending by missLD, same as the browser's list.sort() -
                // rawCount is small (a handful of days x a few objects), plain
                // insertion sort is plenty.
                for (int i = 1; i < rawCount; i++) {
                    RawNeo key = raw[i];
                    int j = i - 1;
                    while (j >= 0 && raw[j].missLD > key.missLD) { raw[j + 1] = raw[j]; j--; }
                    raw[j + 1] = key;
                }
                g_neoObjectCount = rawCount < NEO_MAX_OBJECTS ? rawCount : NEO_MAX_OBJECTS;
                for (int i = 0; i < g_neoObjectCount; i++) {
                    strncpy(g_neoObjects[i].name, raw[i].name, sizeof(g_neoObjects[i].name) - 1);
                    g_neoObjects[i].name[sizeof(g_neoObjects[i].name) - 1] = 0;
                    g_neoObjects[i].hazardous = raw[i].hazardous;
                    g_neoObjects[i].missLD = raw[i].missLD;
                    g_neoObjects[i].velKmS = raw[i].velKmS;
                    g_neoObjects[i].diaM = raw[i].diaM;
                }
                ok = true;
            } else {
                g_neoError = "Parse error";
            }
        } else {
            g_neoError = "NASA API error " + String(code);
        }
        http.end();
    } else {
        g_neoError = "Network error";
    }
    g_neoFetching = false;
    return ok;
}

inline void standaloneRenderNeo(MatrixPanel_I2S_DMA* display, int face, float t) {
    (void)display;
    static float lastT = -1;
    float dt = lastT < 0 ? 0 : (t - lastT);
    lastT = t;
    if (face == 0) g_neoT += dt;

    snClear(face);
    const int S = PANEL_SIZE;
    int level = neoOverallRisk();
    float riskRGB[3]; neoRiskRGB(level, riskRGB);
    float pulse = 0.55f + 0.45f * sinf(g_neoT * (level == 2 ? 6.0f : level == 1 ? 3.0f : 1.4f));

    // Starfield background on every face - same deterministic hash formula
    // as the browser (applied per-face here since our buffer is per-face,
    // not one global colBuf array).
    float tt = millis() * 0.001f;
    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            uint32_t gi = (uint32_t)(face * S * S + y * S + x);
            float seed = (float)((gi * 2654435761u)) / 4294967296.0f;
            if (seed < 0.014f) {
                float twinkle = 0.3f + 0.7f * fabsf(sinf(tt * 1.4f + seed * 60));
                float br = seed * 36 * twinkle;
                snSet(face, x, y, br, br, br * 1.1f);
            }
        }
    }

    if (face == 0) {
        // Earth with pulsing threat ring
        float cx0 = S / 2.0f, cy0 = S / 2.0f;
        float earthRad = S * 0.3f, ringRad = S * 0.42f;
        for (int y = 0; y < S; y++) {
            for (int x = 0; x < S; x++) {
                float dx = x - cx0, dy = y - cy0, d = sqrtf(dx * dx + dy * dy);
                if (d < earthRad) {
                    float nx = dx / earthRad, ny = dy / earthRad;
                    bool land = sinf(nx * 5 + tt * 0.15f) * cosf(ny * 4) > 0.25f;
                    float r, g, b;
                    if (land) { r = 0.07f; g = 0.45f; b = 0.12f; }
                    else { r = 0.05f; g = 0.18f; b = 0.55f; }
                    float shade = 1.0f - fmaxf(0.0f, d / earthRad) * 0.3f;
                    snSet(face, x, y, r * shade, g * shade, b * shade);
                } else if (d > ringRad - 1.2f && d < ringRad + 1.2f) {
                    snSet(face, x, y, riskRGB[0] * pulse, riskRGB[1] * pulse, riskRGB[2] * pulse);
                }
            }
        }
    } else if (face == 2 || face == 3) {
        // Incoming object blips, distance-scaled
        int f = (face == 2) ? 0 : 1;
        int n = g_neoObjectCount < 6 ? g_neoObjectCount : 6;
        for (int oi = 0; oi < n; oi++) {
            const NeoObject& o = g_neoObjects[oi];
            int r = neoRisk(o);
            float rgb[3]; neoRiskRGB(r, rgb);
            float closeness = fmaxf(0.0f, 1.0f - fminf(1.0f, o.missLD / 40.0f));
            int bx = 2 + ((oi * 7 + f * 3) % (S - 4));
            int by = (int)roundf(S * 0.15f + (S * 0.7f) * (oi / fmaxf(1.0f, n - 1.0f)));
            int rad = 1 + (int)roundf(closeness * 2.5f);
            float blink = 0.6f + 0.4f * sinf(g_neoT * (2 + oi) + oi);
            for (int dv = -rad; dv <= rad; dv++) {
                for (int du = -rad; du <= rad; du++) {
                    if (du * du + dv * dv > rad * rad) continue;
                    snSet(face, bx + du, by + dv, rgb[0] * blink, rgb[1] * blink, rgb[2] * blink);
                }
            }
        }
    } else if (face == 4) {
        // Title / risk summary card, WC font (see TEXT LIMITATION note above)
        const float white[3] = {1, 1, 1};
        float rgb[3]; neoRiskRGB(level, rgb);
        wcDrawCenteredLine(face, "NEO", white, S - 10);
        const char* lvl = level == 2 ? "DANGER" : level == 1 ? "WATCH" : "CLEAR";
        wcDrawCenteredLine(face, lvl, rgb, S / 2 + 2);
        if (g_neoObjectCount > 0) {
            char line[24];
            snprintf(line, sizeof(line), "%.1fLD", g_neoObjects[0].missLD);
            const float grey[3] = {0.7f, 0.7f, 0.7f};
            wcDrawCenteredLine(face, line, grey, 12);
        } else {
            const float grey[3] = {0.7f, 0.7f, 0.7f};
            wcDrawCenteredLine(face, "NO DATA", grey, 12);
        }
    } else if (face == 1) {
        // Scrolling ticker, WC font
        g_neoTickerScrollX += dt * 22.0f * (g_nativeSpeed > 0 ? g_nativeSpeed : 1.0f);
        char ticker[400];
        if (g_neoObjectCount == 0) {
            strcpy(ticker, "   NEO WATCH  -  NO DATA   ");
        } else {
            int pos = 0;
            for (int i = 0; i < g_neoObjectCount && pos < 350; i++) {
                const NeoObject& o = g_neoObjects[i];
                int r = neoRisk(o);
                const char* flag = r == 2 ? "!!" : r == 1 ? "!" : ".";
                pos += snprintf(ticker + pos, sizeof(ticker) - pos, "%s %s %.1fLD %dm %.1fkm/s   ///   ",
                                 flag, o.name, o.missLD, o.diaM, o.velKmS);
            }
        }
        int len = (int)strlen(ticker);
        int totalW = len * WC_CHAR_W + S;
        int scrollPx = ((int)g_neoTickerScrollX) % totalW;
        const float white[3] = {1, 1, 1};
        int u = -scrollPx;
        for (int i = 0; i < len; i++) {
            if (u + WC_CHAR_W >= 0 && u < S) wcDrawGlyph(face, ticker[i], u, S / 2 - 3, white);
            u += WC_CHAR_W;
        }
        // second copy so the scroll wraps seamlessly
        u = -scrollPx + totalW;
        for (int i = 0; i < len && u < S; i++) {
            if (u + WC_CHAR_W >= 0) wcDrawGlyph(face, ticker[i], u, S / 2 - 3, white);
            u += WC_CHAR_W;
        }
    }
    // Faces 5 stays starfield-only, matching the browser (no extra content
    // drawn on that face in the 3D-cube branch).
}

// ---------------------------------------------------------------------------
// Dispatcher — called once per display-task tick when in standalone mode.
// ---------------------------------------------------------------------------
inline void standaloneRender(MatrixPanel_I2S_DMA* display, float dt) {
    static float t = 0;
    // Live speed control from the web UI (g_nativeSpeed), so the browser's
    // speed slider affects the on-device effects.
    t += dt * g_nativeSpeed;
    // Live brightness control from the web UI (g_nativeBrightness). Only push
    // to hardware when it actually changed - setBrightness8 reconfigures the
    // panel, so avoid calling it every frame.
    if (g_nativeBrightness != g_nativeBrightnessApplied) {
        display->setBrightness8(g_nativeBrightness);
        g_nativeBrightnessApplied = g_nativeBrightness;
    }
    // Blank the native buffer when the effect changes. Sparse effects
    // (fireworks, balls, warp, life...) don't repaint every pixel each frame,
    // so without this the previous effect's pixels linger under the new one.
    static uint8_t lastFx = 0xFF;
    if (g_standaloneEffect != lastFx) {
        lastFx = g_standaloneEffect;
        snClearAll();
    }
    for (uint8_t face = 0; face < NUM_FACES; face++) {
        switch (g_standaloneEffect) {
            case SA_RAINBOW:       standaloneRenderRainbow(display, face, t);       break;
            case SA_PULSE:         standaloneRenderPulse(display, face, t);         break;
            case SA_PLASMA:        standaloneRenderPlasma(display, face, t);        break;
            case SA_CLOCK:         standaloneRenderClock(display, face);            break;
            case SA_WEATHER:       standaloneRenderWeather(display, face, t);       break;
            case SA_FIREWORKS:     standaloneRenderFireworks(display, face, t);     break;
            case SA_GRADIENT_WASH: standaloneRenderGradientWash(display, face, t);  break;
            case SA_AURORA:        standaloneRenderAurora(display, face, t);        break;
            case SA_SPECTRUM:      standaloneRenderSpectrum(display, face, t);      break;
            case SA_BALLS:         standaloneRenderBalls(display, face, t);         break;
            case SA_STROBE:        standaloneRenderStrobe(display, face, t);        break;
            case SA_LIGHTNING:     standaloneRenderLightning(display, face, t);     break;
            case SA_TIDE:          standaloneRenderTide(display, face, t);          break;
            case SA_RAIN:          standaloneRenderRain(display, face, t);          break;
            case SA_WAVE:          standaloneRenderWave(display, face, t);          break;
            case SA_DEPTH_RINGS:   standaloneRenderDepthRings(display, face, t);    break;
            case SA_PRISM:         standaloneRenderPrism(display, face, t);         break;
            case SA_NEBULA:        standaloneRenderNebula(display, face, t);        break;
            case SA_DNA:           standaloneRenderDna(display, face, t);           break;
            case SA_WARP:          standaloneRenderWarp(display, face, t);          break;
            case SA_LIFE:          standaloneRenderLife(display, face, t);          break;
            case SA_LIGHTSPEED:    standaloneRenderLightspeed(display, face, t);    break;
            case SA_SAND:          standaloneRenderSand(display, face, t);          break;
            case SA_FLUID:         standaloneRenderFluid(display, face, t);         break;
            case SA_MAZE:          standaloneRenderMaze(display, face, t);          break;
            case SA_MOON:          standaloneRenderMoon(display, face, t);          break;
            case SA_EASTER_EGG:    standaloneRenderEasterEgg(display, face, t);     break;
            case SA_DICE:          standaloneRenderDice(display, face, t);          break;
            case SA_COINFLIP:      standaloneRenderCoinflip(display, face, t);      break;
            case SA_TRON:          standaloneRenderTron(display, face, t);          break;
            case SA_SPHERE:        standaloneRenderSphere(display, face, t);        break;
            case SA_APOD:          standaloneRenderApod(display, face, t);          break;
            case SA_GHOST:         standaloneRenderGhost(display, face, t);         break;
            case SA_RETRO:         standaloneRenderRetro(display, face, t);         break;
            case SA_JOKE:          standaloneRenderJoke(display, face, t);          break;
            case SA_TRIVIA:        standaloneRenderTrivia(display, face, t);        break;
            case SA_OTD:           standaloneRenderOnThisDay(display, face, t);     break;
            case SA_SIMHOUSE:      standaloneRenderSimHouse(display, face, t);      break;
            case SA_NEO:           standaloneRenderNeo(display, face, t);           break;
            default:
                saFillRect(display, face * PANEL_SIZE, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
                break;
        }
        // Overlays blend additively onto this face's buffer, on top of
        // whatever the effect just drew - exactly matching how effects.js
        // composites OV_FUNCS onto colBuf after the main effect runs.
        standaloneRunOverlays(face, t);
    }

    // Boot-time WiFi status icon: a small dot in face 0's top-left corner.
    // Red while WiFi is connecting/AP mode, green once connected. Hidden
    // entirely once a browser connects and starts controlling the cube - at
    // that point the effect selection itself is the feedback that things are
    // working, and the icon would just permanently clutter the corner of
    // whatever effect is running. Drawn into the buffer (not hardware
    // directly) so it survives the blit below like everything else.
    //
    // A second dot right next to it shows g_httpServerOk - true once
    // setup() has actually reached httpServer.begin()/wsServer.begin(), so
    // a browser could connect. This is deliberately NOT just "WiFi
    // connected": WiFi can associate fine while something later in setup()
    // (a blocking network call with no timeout, PSRAM-starved TLS, etc.)
    // hangs before the servers ever start - green WiFi + red HTTP on the
    // panel is exactly that "connected but nothing's listening" state,
    // visible without needing the serial monitor.
    if (!g_browserConnected) {
        bool wifiOk = (WiFi.status() == WL_CONNECTED);
        float wr = wifiOk ? 0.0f : 0.78f, wg = wifiOk ? 0.78f : 0.0f;
        for (int y = 1; y <= 3; y++)
            for (int x = 1; x <= 3; x++)
                snSet(0, x, y, wr, wg, 0.0f);

        float hr = g_httpServerOk ? 0.0f : 0.78f, hg = g_httpServerOk ? 0.78f : 0.0f;
        for (int y = 1; y <= 3; y++)
            for (int x = 5; x <= 7; x++)
                snSet(0, x, y, hr, hg, 0.0f);
    }

    // Single blit: push the composited buffer to the real panel. This is the
    // ONE place doing display->drawPixel with the real hardware - proven
    // remap-safe (unlike fillRect/fillCircle's bypassed fast path), so
    // routing every effect+overlay through this buffer instead of writing to
    // the display directly guarantees the four-scan remap always applies,
    // everywhere, rather than needing every future effect to remember to
    // avoid fillRect/fillCircle.
    for (uint8_t face = 0; face < NUM_FACES; face++) {
        const int xOff = face * PANEL_SIZE;
        snEnsureBuf(face);
        const uint8_t* buf = g_snBuf[face];
        for (int y = 0; y < PANEL_SIZE; y++) {
            for (int x = 0; x < PANEL_SIZE; x++) {
                const uint8_t* p = &buf[(y * PANEL_SIZE + x) * 3];
                display->drawPixel(xOff + x, y, display->color565(p[0], p[1], p[2]));
            }
        }

        // Post-blit text overlay: display->print()/setCursor() write straight
        // to the panel (not into snBuf), so this MUST run after the blit
        // above, or the blit paints over the text every frame. Only
        // SA_CLOCK/SA_WEATHER need this - everything else is fully
        // buffer-based already.
        if (g_standaloneEffect == SA_CLOCK) {
            display->setTextColor(display->color565(255, 255, 255));
            display->setTextSize(2);
            display->setCursor(xOff + 6, 20);
            display->print(g_clockTimeBuf);
            display->setTextSize(1);
            display->setCursor(xOff + 4, 44);
            display->print(g_clockDateBuf);
        } else if (g_standaloneEffect == SA_WEATHER) {
            display->setTextColor(display->color565(255, 255, 255));
            display->setTextSize(1);
            display->setCursor(xOff + 4, PANEL_SIZE - 18);
            display->print(g_wxLine1Buf);
            display->setCursor(xOff + 4, PANEL_SIZE - 10);
            display->print(g_wxLine2Buf);
        }
    }
    display->flipDMABuffer();
}
