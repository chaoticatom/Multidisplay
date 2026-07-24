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
    SA_COUNT         = 22
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
        // reasonable stand-ins for not-yet-ported visual effects
        {"sphere", SA_PLASMA}, {"sand", SA_BALLS},
        {"maze", SA_PLASMA}, {"tron", SA_SPECTRUM},
        {"fluid", SA_TIDE}, {"ghost", SA_STROBE},
        {"lightspeed", SA_WARP}, {"custom_cube", SA_RAINBOW},
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
// Push an already-computed 0..1 RGB triple to one face pixel, clamped.
inline void saPixel(MatrixPanel_I2S_DMA* display, int xOff, int x, int y,
                    float r, float g, float b) {
    display->drawPixel(xOff + x, y, display->color565(
        (uint8_t)(saClamp01(r) * 255.0f),
        (uint8_t)(saClamp01(g) * 255.0f),
        (uint8_t)(saClamp01(b) * 255.0f)));
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
    g_standaloneEffect = g_saPrefs.getUChar("lastFx", SA_PULSE);   // first boot: pulsing RGB solid
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
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
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
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(r, g, b));
}

inline void standaloneRenderPlasma(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float v = sinf(x * 0.25f + t) + sinf(y * 0.25f - t) + sinf((x + y) * 0.15f + t * 1.3f);
            float hue = fmodf((v + 3.0f) * 60.0f, 360.0f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
        }
    }
}

inline void standaloneRenderClock(MatrixPanel_I2S_DMA* display, int face) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));

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
    display->fillCircle(cx, cy, 5, discColor);

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

inline void standaloneRenderFireworks(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    const int BURSTS = 3;
    for (int b = 0; b < BURSTS; b++) {
        float phase = fmodf(t * 0.6f + face * 0.53f + b * 0.77f, 1.0f);
        float cx = xOff + 10 + standaloneHash01(face * 31 + b * 7) * (PANEL_SIZE - 20);
        float cy = 10 + standaloneHash01(face * 17 + b * 13 + 3) * (PANEL_SIZE - 20);
        float radius = phase * 26.0f;
        float fade = 1.0f - phase;
        float hue = fmodf((face * 60.0f + b * 120.0f + t * 20.0f), 360.0f);
        uint8_t r, g, cb;
        standaloneHsvToRgb(hue, 1.0f, fade, r, g, cb);
        uint16_t col = display->color565(r, g, cb);
        const int SPARKS = 10;
        for (int s = 0; s < SPARKS; s++) {
            float ang = (2.0f * PI * s) / SPARKS + b;
            int px = (int)(cx + cosf(ang) * radius);
            int py = (int)(cy + sinf(ang) * radius);
            if (px >= xOff && px < xOff + PANEL_SIZE && py >= 0 && py < PANEL_SIZE) {
                display->drawPixel(px, py, col);
            }
        }
    }
}

inline void standaloneRenderGradientWash(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    for (int y = 0; y < PANEL_SIZE; y++) {
        for (int x = 0; x < PANEL_SIZE; x++) {
            float hue = fmodf((x - y) * 3.0f + t * 40.0f + 720.0f, 360.0f);
            uint8_t r, g, b;
            standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
        }
    }
}

inline void standaloneRenderAurora(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 8));
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
                display->drawPixel(xOff + x, y, display->color565(r, g, b));
            }
        }
    }
}

inline void standaloneRenderSpectrum(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
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
                display->drawPixel(xOff + x, y, display->color565(r, g, b));
            }
        }
    }
}

inline void standaloneRenderBalls(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    const int BALLS = 4;
    for (int i = 0; i < BALLS; i++) {
        float freq = 0.9f + i * 0.23f;
        int x = xOff + (PANEL_SIZE / (BALLS + 1)) * (i + 1);
        int y = (int)((PANEL_SIZE - 4) * fabsf(sinf(t * freq + i)));
        float hue = fmodf(i * 90.0f + t * 30.0f, 360.0f);
        uint8_t r, g, b;
        standaloneHsvToRgb(hue, 1.0f, 1.0f, r, g, b);
        display->fillCircle(x, y + 3, 3, display->color565(r, g, b));
    }
}

inline void standaloneRenderStrobe(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    bool on = fmodf(t, 0.3f) < 0.12f;
    uint16_t col = on ? display->color565(255, 255, 255) : display->color565(0, 0, 0);
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, col);
}

inline void standaloneRenderLightning(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(2, 2, 10));
    int bucket = (int)(t * 3.0f) + face * 97;
    bool flash = standaloneHash01(bucket) > 0.8f;
    if (!flash) return;
    int x = PANEL_SIZE / 2;
    for (int y = 0; y < PANEL_SIZE; y++) {
        x += (int)(standaloneHash01(bucket * 131 + y) * 5.0f) - 2;
        x = constrain(x, 2, PANEL_SIZE - 3);
        display->drawPixel(xOff + x, y, display->color565(255, 255, 255));
        display->drawPixel(xOff + x + 1, y, display->color565(200, 200, 255));
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
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
        }
    }
}

inline void standaloneRenderRain(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
    for (int x = 0; x < PANEL_SIZE; x += 2) {
        float speed = 20.0f + standaloneHash01(face * 53 + x) * 30.0f;
        float phase = standaloneHash01(face * 91 + x * 3) * PANEL_SIZE;
        int y = (int)(fmodf(t * speed + phase, (float)(PANEL_SIZE + 8))) - 8;
        for (int d = 0; d < 3; d++) {
            int yy = y - d;
            if (yy >= 0 && yy < PANEL_SIZE) {
                uint8_t fade = 255 - d * 70;
                display->drawPixel(xOff + x, yy, display->color565(fade / 3, fade / 2, fade));
            }
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
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
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
                display->drawPixel(xOff + ui, y, display->color565(r, g, b));
            for (int d = 1; d <= 3; d++) {
                float fade = powf(1 - d / 4.0f, 2) * 0.7f;
                uint8_t rg, gg, bg;
                standaloneHslToRgb(hue, 0.9f, fade, rg, gg, bg);
                if (ui - d >= 0)          display->drawPixel(xOff + ui - d, y, display->color565(rg, gg, bg));
                if (ui + d < PANEL_SIZE)  display->drawPixel(xOff + ui + d, y, display->color565(rg, gg, bg));
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
                    display->drawPixel(xOff + u, y, display->color565(r, g, b));
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
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
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
        display->drawPixel(xOff + px, py, display->color565(r, g, b));
        // short tail toward centre
        int tx = (int)((sx[i] - cosf(ang) * 0.03f) * (PANEL_SIZE - 1));
        int ty = (int)((sy[i] - sinf(ang) * 0.03f) * (PANEL_SIZE - 1));
        if (tx >= 0 && tx < PANEL_SIZE && ty >= 0 && ty < PANEL_SIZE)
            display->drawPixel(xOff + tx, ty, display->color565(r / 3, g / 3, b / 3));
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
    display->fillRect(xOff, 0, W, H, display->color565(0, 0, 1));
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
        int i = y * W + x;
        if (grid[i]) {
            float a = age[i] / 250.0f;
            float hue = a < 0.33f ? saLerp(0.50f, 0.62f, a * 3)
                      : a < 0.66f ? saLerp(0.62f, 0.75f, (a - 0.33f) * 3)
                                  : saLerp(0.75f, 0.13f, (a - 0.66f) * 3);
            uint8_t r, g, b;
            standaloneHslToRgb(hue, 1 - a * 0.15f, 0.5f + a * 0.45f, r, g, b);
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
        } else if (age[i] > 0) {
            uint8_t r, g, b;
            standaloneHslToRgb(0.06f, 1.0f, age[i] / 250.0f * 0.5f, r, g, b);
            display->drawPixel(xOff + x, y, display->color565(r, g, b));
        }
    }
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
    // Blank the panel when the effect changes. Sparse effects (fireworks,
    // balls, warp, life...) don't repaint every pixel each frame, so without
    // this the previous effect's pixels linger under the new one. Clear for a
    // few frames because of the double buffer (each clearScreen only wipes the
    // current back buffer; 2+ covers both).
    static uint8_t lastFx = 0xFF;
    static uint8_t clearFrames = 0;
    if (g_standaloneEffect != lastFx) {
        lastFx = g_standaloneEffect;
        clearFrames = 3;
    }
    if (clearFrames > 0) {
        display->clearScreen();
        clearFrames--;
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
            default:
                display->fillRect(face * PANEL_SIZE, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
                break;
        }
    }
    display->flipDMABuffer();
}
