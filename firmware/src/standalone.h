#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include "config.h"
#include "led_matrix.h"

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
    SA_COUNT         = 25
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
        // reasonable stand-ins for not-yet-ported visual effects
        {"sphere", SA_PLASMA},
        {"maze", SA_PLASMA}, {"tron", SA_SPECTRUM},
        {"ghost", SA_STROBE},
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
inline uint8_t g_snBuf[NUM_FACES][PANEL_SIZE * PANEL_SIZE * 3];

inline void snSet(int face, int x, int y, float r, float g, float b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) return;
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    p[0] = (uint8_t)(saClamp01(r) * 255.0f);
    p[1] = (uint8_t)(saClamp01(g) * 255.0f);
    p[2] = (uint8_t)(saClamp01(b) * 255.0f);
}
// Additive blend, clamped - what overlays use (matches colBuf's
// Math.min(1, colBuf[i]+r) pattern).
inline void snAdd(int face, int x, int y, float r, float g, float b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) return;
    uint8_t* p = &g_snBuf[face][(y * PANEL_SIZE + x) * 3];
    p[0] = (uint8_t)(saClamp01(p[0] / 255.0f + r) * 255.0f);
    p[1] = (uint8_t)(saClamp01(p[1] / 255.0f + g) * 255.0f);
    p[2] = (uint8_t)(saClamp01(p[2] / 255.0f + b) * 255.0f);
}
// Decay the whole buffer (fade-trail effects: colBuf[i]*=mul each frame).
inline void snDecay(int face, float mul) {
    uint8_t* p = g_snBuf[face];
    for (int i = 0; i < PANEL_SIZE * PANEL_SIZE * 3; i++) p[i] = (uint8_t)(p[i] * mul);
}
inline void snClear(int face) { memset(g_snBuf[face], 0, sizeof(g_snBuf[face])); }
inline void snClearAll() { memset(g_snBuf, 0, sizeof(g_snBuf)); }
// Read back a pixel's current 0..1 value - needed by overlays that sample
// the buffer (e.g. glitch, which shifts/re-blends existing pixels).
inline void snGet(int face, int x, int y, float& r, float& g, float& b) {
    if (face < 0 || face >= NUM_FACES || x < 0 || x >= PANEL_SIZE || y < 0 || y >= PANEL_SIZE) { r = g = b = 0; return; }
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
    HTTPClient http;

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

inline void standaloneRenderClock(MatrixPanel_I2S_DMA* display, int face) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));

    struct tm tmv;
    standaloneLocalTm(tmv);

    char tbuf[9];
    snprintf(tbuf, sizeof(tbuf), "%02d:%02d", tmv.tm_hour, tmv.tm_min);
    display->setTextColor(display->color565(255, 255, 255));
    display->setTextSize(2);
    display->setCursor(xOff + 6, 20);
    display->print(tbuf);

    char dbuf[12];
    snprintf(dbuf, sizeof(dbuf), "%02d/%02d/%04d", tmv.tm_mday, tmv.tm_mon + 1, tmv.tm_year + 1900);
    display->setTextSize(1);
    display->setCursor(xOff + 4, 44);
    display->print(dbuf);
}

inline void standaloneRenderWeather(MatrixPanel_I2S_DMA* display, int face) {
    const int xOff = face * PANEL_SIZE;

    struct tm tmv;
    long secOfDay;
    standaloneLocalTm(tmv, &secOfDay);

    bool isDay = g_wxValid
        ? (secOfDay >= (long)g_wxSunriseSec && secOfDay < (long)g_wxSunsetSec)
        : (tmv.tm_hour >= 6 && tmv.tm_hour < 18);

    // Sky: simple vertical gradient, day (blue) or night (dark navy).
    uint8_t topR = isDay ? 70  : 5,  topG = isDay ? 140 : 8,  topB = isDay ? 235 : 30;
    uint8_t botR = isDay ? 160 : 20, botG = isDay ? 210 : 20, botB = isDay ? 250 : 55;
    for (int y = 0; y < PANEL_SIZE; y++) {
        float f = (float)y / (PANEL_SIZE - 1);
        uint8_t r = (uint8_t)(topR + (botR - topR) * f);
        uint8_t g = (uint8_t)(topG + (botG - topG) * f);
        uint8_t b = (uint8_t)(topB + (botB - topB) * f);
        display->drawFastHLine(xOff, y, PANEL_SIZE, display->color565(r, g, b));
    }

    // Sun/moon disc position: left-to-right across the sky based on
    // fraction of daylight (or night) elapsed.
    float frac;
    if (isDay && g_wxSunsetSec > g_wxSunriseSec) {
        frac = (float)(secOfDay - (long)g_wxSunriseSec) / (float)((long)g_wxSunsetSec - (long)g_wxSunriseSec);
    } else {
        frac = (float)tmv.tm_hour / 24.0f;
    }
    frac = constrain(frac, 0.0f, 1.0f);
    int cx = xOff + 8 + (int)(frac * (PANEL_SIZE - 16));
    int cy = 12;
    uint16_t discColor = isDay ? display->color565(255, 220, 80) : display->color565(215, 215, 225);
    saFillCircle(display, cx, cy, 5, discColor);

    // Temperature + condition text.
    display->setTextColor(display->color565(255, 255, 255));
    display->setTextSize(1);
    display->setCursor(xOff + 4, PANEL_SIZE - 18);
    if (g_wxValid) {
        char wbuf[8];
        snprintf(wbuf, sizeof(wbuf), "%dC", g_wxTemp);
        display->print(wbuf);
    } else {
        display->print("WX --");
    }

    display->setCursor(xOff + 4, PANEL_SIZE - 10);
    display->print(g_wxValid ? standaloneWxCodeShort(g_wxCode) : "NO DATA");
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
    static uint8_t buf[PANEL_SIZE * PANEL_SIZE * 3];   // fade buffer, RGB888
    static FwRocket   rockets[10];
    static FwParticle parts[420];
    static bool   init = false;
    static float  lastT = 0, spawnT = 0;
    static uint32_t rng = 0x1234567;
    if (!init) { memset(buf, 0, sizeof(buf)); init = true; lastT = t; }
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

    // Launch new rockets (~every 0.4s, sometimes two).
    spawnT += dt;
    if (spawnT > 0.4f) {
        spawnT = 0;
        for (int shots = 0; shots < (rnd() > 0.6f ? 2 : 1); shots++)
            for (int k = 0; k < 10; k++) if (!rockets[k].active) {
                rockets[k] = { rnd() * S, 0, S * (0.88f + rnd() * 0.45f), (rnd() - 0.5f) * S * 0.3f, rnd(), rnd(), true };
                break;
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

inline void standaloneRenderBalls(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    saFillRect(display, xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    const int BALLS = 4;
    for (int i = 0; i < BALLS; i++) {
        float freq = 0.9f + i * 0.23f;
        int x = xOff + (PANEL_SIZE / (BALLS + 1)) * (i + 1);
        int y = (int)((PANEL_SIZE - 4) * fabsf(sinf(t * freq + i)));
        float hue = fmodf(i * 90.0f + t * 30.0f, 360.0f);
        uint8_t r, g, b;
        standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
        saFillCircle(display, x, y + 3, 3, display->color565(r, g, b));
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
            float fade = powf(1 - k / d.len, 1.2f) * d.bright;
            float h = saFract(d.hue + k / d.len * 0.15f);
            uint8_t r, g, b;
            standaloneHslToRgb(h, 1.0f, fade * 0.95f, r, g, b);
            snSet(face, (int)d.col, vy, r / 255.0f, g / 255.0f, b / 255.0f);
            if (d.wide) {
                snSet(face, (int)d.col - 1, vy, r / 510.0f, g / 510.0f, b / 510.0f);
                snSet(face, (int)d.col + 1, vy, r / 510.0f, g / 510.0f, b / 510.0f);
            }
            if (vy == 0 && k < 4) {
                float sp = fade * 0.8f;
                for (int s = -4; s <= 4; s++) {
                    float sf = fmaxf(0.0f, 1 - fabsf((float)s) / 4.0f) * sp * 0.5f;
                    uint8_t sr, sg, sb;
                    standaloneHslToRgb(h, 1.0f, sf, sr, sg, sb);
                    snSet(face, (int)d.col + s, 0, sr / 255.0f, sg / 255.0f, sb / 255.0f);
                }
            }
        }
        uint8_t rh, gh, bh;
        standaloneHslToRgb(d.hue, 0.3f, d.bright, rh, gh, bh);
        snSet(face, (int)d.col, (int)lroundf(d.y), rh / 255.0f, gh / 255.0f, bh / 255.0f);
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

// Lightspeed - single-panel adaptation of effectLightspeed: racers travel in
// straight lines leaving a fading trail. The browser version transfers
// racers across the 6 cube faces at panel edges (lsTransfer); with only one
// physical panel here, racers instead bounce (reflect) off the edges, which
// preserves the "streaking light trails crossing the panel" look without the
// cube topology this panel doesn't have.
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
    const int W = PANEL_SIZE, H = PANEL_SIZE;
    static uint8_t grid[PANEL_SIZE * PANEL_SIZE];
    static uint8_t nextg[PANEL_SIZE * PANEL_SIZE];
    static uint8_t age[PANEL_SIZE * PANEL_SIZE];
    static bool init = false;
    static float genT = 0;
    static float lastT = 0;
    auto seed = [&]() {
        for (int i = 0; i < W * H; i++) { grid[i] = standaloneHash01(i * 3 + (int)(t * 100)) < 0.32f ? 1 : 0; age[i] = 0; }
    };
    if (!init) { seed(); init = true; }
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
    saFillRect(display, xOff, 0, W, H, display->color565(0, 0, 1));
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
        int i = y * W + x;
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
    static uint8_t occ[PANEL_SIZE * PANEL_SIZE];
    static bool init = false;
    if (!init) {
        memset(occ, 0, sizeof(occ));
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
    const int S = PANEL_SIZE;
    // Only h/v (no separate newH buffer) - updates in-place (Gauss-Seidel
    // style) rather than the browser's strict old-values-only Jacobi update.
    // Visually indistinguishable for this cosmetic wave effect; keeping a
    // third full-panel float buffer wasn't worth the extra ~16KB of static
    // RAM on this PSRAM-less board, especially after the earlier memory-
    // pressure incident that corrupted the HTTP server.
    static float h[PANEL_SIZE * PANEL_SIZE], v[PANEL_SIZE * PANEL_SIZE];
    static bool init = false;
    if (!init) { memset(h, 0, sizeof(h)); memset(v, 0, sizeof(v)); init = true; }
    const float dt = 1.0f / CUBE_FPS;
    const float SPEED = 28, DAMP = 0.96f, GRAV_STR = 14;
    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            int i = y * S + x;
            float lap = 0; int cnt = 0;
            if (x > 0)     { lap += h[i - 1]; cnt++; }
            if (x < S - 1) { lap += h[i + 1]; cnt++; }
            if (y > 0)     { lap += h[i - S]; cnt++; }
            if (y < S - 1) { lap += h[i + S]; cnt++; }
            if (cnt) {
                float avg = lap / cnt;
                float slope = (float)y / S - 0.5f;   // gravity pulls "down" = toward y=0
                v[i] = (v[i] + dt * (SPEED * (avg - h[i]) - GRAV_STR * slope)) * DAMP;
            }
            h[i] = fmaxf(-1.0f, fminf(1.0f, h[i] + v[i] * dt));
        }
    }
    if (standaloneHash01((int)(t * 1000.0f)) < dt * 1.5f) {
        int i = (int)(standaloneHash01((int)(t * 2000.0f)) * S * S);
        h[i] += 0.8f + standaloneHash01((int)(t * 3000.0f)) * 0.6f;
    }
    for (int y = 0; y < S; y++) {
        for (int x = 0; x < S; x++) {
            int i = y * S + x;
            float hv = h[i], absv = fabsf(hv);
            if (absv < 0.03f) { snSet(face, x, y, 0, 0, 0.02f); continue; }
            float posPhase = ((float)x / S + (float)y / S) * 2.1f + t * 0.15f;
            float hue = hv > 0
                ? saFract(0.55f + absv * 0.15f + sinf(posPhase) * 0.08f)
                : saFract(0.02f + absv * 0.12f + sinf(posPhase) * 0.06f);
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 0.85f, fminf(0.95f, 0.3f + absv * 0.6f), r, g, b);
            snSet(face, x, y, r / 255.0f, g / 255.0f, b / 255.0f);
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
    const int rows = (int)(PANEL_SIZE * 0.22f);
    static float buf[PANEL_SIZE * PANEL_SIZE];
    static bool init = false;
    if (!init) { memset(buf, 0, sizeof(buf)); init = true; }
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
            case SA_WEATHER:       standaloneRenderWeather(display, face);          break;
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
    if (!g_browserConnected) {
        bool wifiOk = (WiFi.status() == WL_CONNECTED);
        float r = wifiOk ? 0.0f : 0.78f, g = wifiOk ? 0.78f : 0.0f;
        for (int y = 1; y <= 3; y++)
            for (int x = 1; x <= 3; x++)
                snSet(0, x, y, r, g, 0.0f);
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
        const uint8_t* buf = g_snBuf[face];
        for (int y = 0; y < PANEL_SIZE; y++) {
            for (int x = 0; x < PANEL_SIZE; x++) {
                const uint8_t* p = &buf[(y * PANEL_SIZE + x) * 3];
                display->drawPixel(xOff + x, y, display->color565(p[0], p[1], p[2]));
            }
        }
    }
    display->flipDMABuffer();
}
