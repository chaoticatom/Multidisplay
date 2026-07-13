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
    SA_COUNT         = 15
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
        default:               return "unknown";
    }
}

struct ScheduleEntry {
    uint8_t hour;
    uint8_t minute;
    uint8_t effectId;
    bool    enabled;
};

// ---- Module state -----------------------------------------------------
inline uint8_t       g_standaloneEffect               = SA_RAINBOW;
inline ScheduleEntry  g_schedule[STANDALONE_MAX_SCHEDULE];
inline uint8_t        g_scheduleCount                 = 0;
inline Preferences    g_saPrefs;

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
    g_standaloneEffect = g_saPrefs.getUChar("lastFx", SA_RAINBOW);
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

inline void standaloneRenderPulse(MatrixPanel_I2S_DMA* display, int face, float t) {
    const int xOff = face * PANEL_SIZE;
    float b = 0.4f + 0.6f * (0.5f + 0.5f * sinf(t * 1.6f));
    uint16_t c = display->color565((uint8_t)(255 * b), (uint8_t)(50 * b), (uint8_t)(150 * b));
    display->fillRect(xOff, 0, PANEL_SIZE, PANEL_SIZE, c);
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

// ---------------------------------------------------------------------------
// Dispatcher — called once per display-task tick when in standalone mode.
// ---------------------------------------------------------------------------
inline void standaloneRender(MatrixPanel_I2S_DMA* display, float dt) {
    static float t = 0;
    t += dt;
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
            default:
                display->fillRect(face * PANEL_SIZE, 0, PANEL_SIZE, PANEL_SIZE, display->color565(0, 0, 0));
                break;
        }
    }
    display->flipDMABuffer();
}
