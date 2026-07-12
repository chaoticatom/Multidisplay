#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <LittleFS.h>
#include <Update.h>
#include <ArduinoJson.h>
#include "config.h"
#include "loader_html.h"
#include "cam/cam_api.h"
#include "standalone.h"

// ---------------------------------------------------------------------------
// web_server.h - HTTP routes + WebSocket handler for the cube.
// ---------------------------------------------------------------------------

// Cached F1 timing/state. Each member holds a ready-to-serve JSON string.
struct F1State {
    String session;   // for GET /api/session
    String drivers;   // for GET /api/drivers
    String flag;      // for GET /api/flags
};

// ---- Shared state owned by main.cpp ----------------------------------------
// Per-face incoming frame buffers (PSRAM allocated). Indexed by face id 0..5.
extern uint8_t*       g_frameBuf[NUM_FACES];
// Set true by the WS handler when a face buffer gets new pixels.
extern volatile bool  g_faceDirty[NUM_FACES];
// Guards g_frameBuf / g_faceDirty access between the WS task and DMA task.
extern portMUX_TYPE   g_frameMux;
// Name of the currently selected effect (kept in sync across clients).
extern String         g_currentEffect;
// Numeric effect id last set via PKT_CMD / CMD_SET_EFFECT.
extern volatile uint8_t g_currentEffectId;
// Millis() at boot, for uptime reporting.
extern uint32_t       g_bootMillis;
// Millis() of the last real PKT_VIDEO frame received; drives the
// standalone-mode fallback in main.cpp's displayTask (see standalone.h).
extern volatile uint32_t g_lastFrameMs;
extern volatile bool     g_everStreamed;

// ---------------------------------------------------------------------------
// MIME helpers
// ---------------------------------------------------------------------------
inline String wsMimeType(const String& path) {
    if (path.endsWith(".html") || path.endsWith(".htm")) return "text/html";
    if (path.endsWith(".css"))  return "text/css";
    if (path.endsWith(".js"))   return "application/javascript";
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".png"))  return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".gif"))  return "image/gif";
    if (path.endsWith(".svg"))  return "image/svg+xml";
    if (path.endsWith(".ico"))  return "image/x-icon";
    if (path.endsWith(".woff")) return "font/woff";
    if (path.endsWith(".woff2"))return "font/woff2";
    if (path.endsWith(".ttf"))  return "font/ttf";
    if (path.endsWith(".wasm")) return "application/wasm";
    return "application/octet-stream";
}

// Serve a static file from LittleFS, preferring a .gz sibling if present.
inline bool serveStaticFile(AsyncWebServerRequest* request, String path) {
    if (path.endsWith("/")) path += "index.html";

    String gzPath = path + ".gz";
    if (LittleFS.exists(gzPath)) {
        AsyncWebServerResponse* resp =
            request->beginResponse(LittleFS, gzPath, wsMimeType(path));
        resp->addHeader("Content-Encoding", "gzip");
        request->send(resp);
        return true;
    }
    if (LittleFS.exists(path)) {
        request->send(LittleFS, path, wsMimeType(path));
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// WebSocket broadcasting helpers
// ---------------------------------------------------------------------------

// Broadcast the current effect to every connected client as a JSON text frame,
// optionally skipping the client that originated the change.
inline void broadcastEffect(AsyncWebSocket& ws, AsyncWebSocketClient* skip) {
    JsonDocument doc;
    doc["cmd"]    = "setEffect";
    doc["effect"] = g_currentEffect;
    doc["id"]     = g_currentEffectId;
    String out;
    serializeJson(doc, out);
    for (AsyncWebSocketClient* c : ws.getClients()) {
        if (!c) continue;
        if (skip && c->id() == skip->id()) continue;
        if (c->status() == WS_CONNECTED) c->text(out);
    }
}

// ---------------------------------------------------------------------------
// WebSocket event handler
// ---------------------------------------------------------------------------
inline void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client,
                      AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
    case WS_EVT_CONNECT:
        Serial.printf("[WS] client #%u connected from %s\n",
                      client->id(), client->remoteIP().toString().c_str());
        // Bring the new client up to date with the current effect.
        {
            JsonDocument doc;
            doc["cmd"]    = "setEffect";
            doc["effect"] = g_currentEffect;
            doc["id"]     = g_currentEffectId;
            String out; serializeJson(doc, out);
            client->text(out);
        }
        break;

    case WS_EVT_DISCONNECT:
        Serial.printf("[WS] client #%u disconnected\n", client->id());
        break;

    case WS_EVT_DATA: {
        AwsFrameInfo* info = (AwsFrameInfo*)arg;
        // Only act on complete, single-fragment frames.
        if (!(info->final && info->index == 0 && info->len == len)) break;

        if (info->opcode == WS_BINARY) {
            if (len < 2) break;
            uint8_t pkt = data[0];

            if (pkt == PKT_VIDEO) {
                uint8_t face = data[1];
                if (face < NUM_FACES && len >= (size_t)(2 + FACE_BYTES)) {
                    portENTER_CRITICAL(&g_frameMux);
                    memcpy(g_frameBuf[face], data + 2, FACE_BYTES);
                    g_faceDirty[face] = true;
                    portEXIT_CRITICAL(&g_frameMux);
                    g_lastFrameMs = millis();
                    g_everStreamed = true;
                }
            } else if (pkt == PKT_CMD) {
                uint8_t cmd = data[1];
                if (cmd == CMD_SET_EFFECT && len >= 3) {
                    g_currentEffectId = data[2];
                    // Relay the raw command to every other client.
                    for (AsyncWebSocketClient* c : server->getClients()) {
                        if (!c || c->id() == client->id()) continue;
                        if (c->status() == WS_CONNECTED) c->binary(data, len);
                    }
                    broadcastEffect(*server, client);
                }
            }
        } else if (info->opcode == WS_TEXT) {
            JsonDocument doc;
            if (deserializeJson(doc, data, len) == DeserializationError::Ok) {
                const char* cmd = doc["cmd"] | "";
                if (strcmp(cmd, "setEffect") == 0) {
                    g_currentEffect = String((const char*)(doc["effect"] | ""));
                    if (doc["id"].is<uint8_t>()) {
                        g_currentEffectId = doc["id"].as<uint8_t>();
                    }
                    broadcastEffect(*server, client);
                }
            }
        }
        break;
    }

    default:
        break;
    }
}

// ---------------------------------------------------------------------------
// OTA upload handlers
// ---------------------------------------------------------------------------
inline void handleOtaUpload(AsyncWebServerRequest* request, String filename,
                            size_t index, uint8_t* data, size_t len, bool final,
                            int otaCommand) {
    if (index == 0) {
        Serial.printf("[OTA] start %s (cmd=%d)\n", filename.c_str(), otaCommand);
        size_t maxSpace = (otaCommand == U_SPIFFS)
                            ? (size_t)0x7F0000   // LittleFS partition size
                            : UPDATE_SIZE_UNKNOWN;
        if (!Update.begin(maxSpace, otaCommand)) {
            Update.printError(Serial);
        }
    }
    if (Update.write(data, len) != len) {
        Update.printError(Serial);
    }
    if (final) {
        if (Update.end(true)) {
            Serial.printf("[OTA] success: %u bytes\n", index + len);
        } else {
            Update.printError(Serial);
        }
    }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
inline void initWebServer(AsyncWebServer& server, AsyncWebSocket& ws, F1State& f1) {
    // ---- Camera API ----
    camApiInit(server);

    // ---- WebSocket ----
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    // ---- Loader page (PROGMEM gzip) ----
    server.on("/loader", HTTP_GET, [](AsyncWebServerRequest* request) {
        AsyncWebServerResponse* resp = request->beginResponse_P(
            200, "text/html", LOADER_HTML_GZ, LOADER_HTML_GZ_LEN);
        resp->addHeader("Content-Encoding", "gzip");
        request->send(resp);
    });

    // ---- F1 API: GET ----
    server.on("/api/session", HTTP_GET, [&f1](AsyncWebServerRequest* request) {
        request->send(200, "application/json",
                      f1.session.length() ? f1.session : "{\"type\":\"standby\"}");
    });
    server.on("/api/drivers", HTTP_GET, [&f1](AsyncWebServerRequest* request) {
        request->send(200, "application/json",
                      f1.drivers.length() ? f1.drivers : "[]");
    });
    server.on("/api/flags", HTTP_GET, [&f1](AsyncWebServerRequest* request) {
        request->send(200, "application/json",
                      f1.flag.length() ? f1.flag : "{\"flag\":\"none\"}");
    });

    // ---- F1 API: POST (external pusher updates cached JSON) ----
    auto makePostHandler = [](String* target) {
        return [target](AsyncWebServerRequest* request, uint8_t* data,
                        size_t len, size_t index, size_t total) {
            if (index == 0) target->clear();
            target->concat((const char*)data, len);
            if (index + len == total) {
                request->send(200, "application/json", "{\"ok\":true}");
            }
        };
    };
    server.on("/api/session", HTTP_POST,
              [](AsyncWebServerRequest* r) {}, nullptr, makePostHandler(&f1.session));
    server.on("/api/drivers", HTTP_POST,
              [](AsyncWebServerRequest* r) {}, nullptr, makePostHandler(&f1.drivers));
    server.on("/api/flags", HTTP_POST,
              [](AsyncWebServerRequest* r) {}, nullptr, makePostHandler(&f1.flag));

    // ---- Standalone mode: status, manual effect select, schedule config ----
    // No browser UI wired up for these yet (see docs/STANDALONE_MODE_PLAN.md)
    // — configure via curl/Postman for now, e.g.:
    //   curl http://multidisplay.local/api/standalone/status
    //   curl -X POST http://multidisplay.local/api/standalone/effect -d '{"id":4}'
    //   curl -X POST http://multidisplay.local/api/standalone/schedule \
    //        -d '[{"h":7,"m":0,"fx":0,"on":true},{"h":23,"m":0,"fx":5,"on":true}]'
    server.on("/api/standalone/status", HTTP_GET, [](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["active"]        = !g_everStreamed || (millis() - g_lastFrameMs) > STANDALONE_FALLBACK_MS;
        doc["effect"]        = standaloneEffectName(g_standaloneEffect);
        doc["effect_id"]     = g_standaloneEffect;
        doc["wx_valid"]      = g_wxValid;
        doc["wx_temp_c"]     = g_wxTemp;
        doc["wx_code"]       = g_wxCode;
        JsonArray sched = doc["schedule"].to<JsonArray>();
        for (uint8_t i = 0; i < g_scheduleCount; i++) {
            JsonObject o = sched.add<JsonObject>();
            o["h"] = g_schedule[i].hour;
            o["m"] = g_schedule[i].minute;
            o["fx"] = g_schedule[i].effectId;
            o["on"] = g_schedule[i].enabled;
        }
        String out; serializeJson(doc, out);
        request->send(200, "application/json", out);
    });

    server.on("/api/standalone/effect", HTTP_POST,
        [](AsyncWebServerRequest* request) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t index, size_t total) {
            static String body;
            if (index == 0) body.clear();
            body.concat((const char*)data, len);
            if (index + len != total) return;
            JsonDocument doc;
            if (deserializeJson(doc, body)) {
                request->send(400, "application/json", "{\"error\":\"bad json\"}");
                return;
            }
            uint8_t id = doc["id"] | 0;
            if (id >= SA_COUNT) {
                request->send(400, "application/json", "{\"error\":\"invalid effect id\"}");
                return;
            }
            standaloneSaveLastEffect(id);
            request->send(200, "application/json", "{\"ok\":true}");
        });

    server.on("/api/standalone/schedule", HTTP_POST,
        [](AsyncWebServerRequest* request) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t index, size_t total) {
            static String body;
            if (index == 0) body.clear();
            body.concat((const char*)data, len);
            if (index + len != total) return;
            JsonDocument doc;
            if (deserializeJson(doc, body)) {
                request->send(400, "application/json", "{\"error\":\"bad json\"}");
                return;
            }
            JsonArray arr = doc.as<JsonArray>();
            uint8_t count = 0;
            for (JsonObject o : arr) {
                if (count >= STANDALONE_MAX_SCHEDULE) break;
                g_schedule[count].hour     = o["h"]  | 0;
                g_schedule[count].minute   = o["m"]  | 0;
                g_schedule[count].effectId = o["fx"] | 0;
                g_schedule[count].enabled  = o["on"] | false;
                count++;
            }
            g_scheduleCount = count;
            standaloneSaveSchedule();
            request->send(200, "application/json", "{\"ok\":true}");
        });

    // ---- Status ----
    server.on("/api/status", HTTP_GET, [&ws](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["effect"]            = g_currentEffect;
        doc["size"]              = PANEL_SIZE;
        doc["connected_clients"] = ws.count();
        doc["free_heap"]         = ESP.getFreeHeap();
        doc["uptime"]            = (millis() - g_bootMillis) / 1000;
        String out; serializeJson(doc, out);
        request->send(200, "application/json", out);
    });

    // ---- OTA: firmware ----
    server.on("/update/firmware", HTTP_POST,
        [](AsyncWebServerRequest* request) {
            bool ok = !Update.hasError();
            AsyncWebServerResponse* resp = request->beginResponse(
                200, "text/plain", ok ? "OK" : "FAIL");
            resp->addHeader("Connection", "close");
            request->send(resp);
            if (ok) { delay(500); ESP.restart(); }
        },
        [](AsyncWebServerRequest* request, String filename, size_t index,
           uint8_t* data, size_t len, bool final) {
            handleOtaUpload(request, filename, index, data, len, final, U_FLASH);
        });

    // ---- OTA: filesystem ----
    server.on("/update/filesystem", HTTP_POST,
        [](AsyncWebServerRequest* request) {
            bool ok = !Update.hasError();
            AsyncWebServerResponse* resp = request->beginResponse(
                200, "text/plain", ok ? "OK" : "FAIL");
            resp->addHeader("Connection", "close");
            request->send(resp);
            if (ok) {
                LittleFS.end();
                LittleFS.begin();   // remount the freshly written filesystem
            }
        },
        [](AsyncWebServerRequest* request, String filename, size_t index,
           uint8_t* data, size_t len, bool final) {
            handleOtaUpload(request, filename, index, data, len, final, U_SPIFFS);
        });

    // ---- Static files / SPA fallback ----
    server.onNotFound([](AsyncWebServerRequest* request) {
        String path = request->url();
        if (serveStaticFile(request, path)) return;
        // SPA fallback: serve index.html for unknown GET routes.
        if (request->method() == HTTP_GET && serveStaticFile(request, "/index.html")) return;
        request->send(404, "text/plain", "Not Found");
    });

    // Root explicitly mapped for clarity.
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
        if (!serveStaticFile(request, "/index.html")) {
            request->send(404, "text/plain",
                          "index.html not found - upload the web app to LittleFS");
        }
    });
}
