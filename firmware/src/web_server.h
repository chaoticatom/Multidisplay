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
// Raw LittleFS.begin(false) mount result (no auto-format) - see /api/fsinfo.
extern bool           g_fsMountOk;
// PSRAM detection + read/write test results - see /api/psramtest.
extern bool           g_psramOk;
extern String         g_psramTestResult;
// Video-stream diagnostics (see /api/status) - counts + last packet shape,
// for diagnosing "browser connected but display stuck in standalone".
extern volatile uint32_t g_videoFramesRcvd;
extern volatile uint32_t g_videoPktRejects;
extern volatile uint32_t g_lastVideoPktLen;
extern volatile uint8_t  g_lastVideoPktFace;
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

        if (info->opcode == WS_BINARY) {
            // Reassemble a (possibly multi-chunk) binary frame. A 12290-byte
            // PKT_VIDEO frame far exceeds one TCP segment (~1460 bytes), so
            // ESPAsyncWebServer delivers it across several WS_EVT_DATA
            // callbacks with advancing info->index. The previous handler only
            // accepted a frame that arrived whole in a single callback
            // (info->index==0 && info->len==len), so every large video frame
            // was dropped before it could be processed - which is why a fully
            // open socket (readyState 1, connected_clients 1) still produced
            // frames_rcvd:0 / last_pkt_len:0. Small frames (effect-sync
            // commands) fit in one callback, so those always worked. Here we
            // accumulate chunks into a static buffer until the frame is
            // complete, then process the whole thing. Single-client streaming
            // only (one reassembly buffer); fine for this app's one browser.
            static uint8_t asmBuf[2 + FACE_BYTES];
            static bool    asmActive = false;

            if (info->len > sizeof(asmBuf)) break;   // too big for our buffer
            if (info->index == 0) asmActive = true;  // start of a new frame
            if (!asmActive) break;                    // joined mid-frame; wait

            memcpy(asmBuf + info->index, data, len);

            // Not the final chunk of this frame yet - keep accumulating.
            if (info->index + len < info->len) break;
            asmActive = false;

            uint8_t* fdata = asmBuf;
            size_t   flen  = info->len;
            if (flen < 2) break;
            uint8_t pkt = fdata[0];

            if (pkt == PKT_VIDEO) {
                uint8_t face = fdata[1];
                g_lastVideoPktLen  = (uint32_t)flen;
                g_lastVideoPktFace = face;
                // g_frameBuf[face] is null if allocBuffers() (PSRAM
                // ps_malloc) failed at boot - guard against writing into it.
                if (face < NUM_FACES && g_frameBuf[face] != nullptr
                        && flen >= (size_t)(2 + FACE_BYTES)) {
                    portENTER_CRITICAL(&g_frameMux);
                    memcpy(g_frameBuf[face], fdata + 2, FACE_BYTES);
                    g_faceDirty[face] = true;
                    portEXIT_CRITICAL(&g_frameMux);
                    g_lastFrameMs = millis();
                    g_everStreamed = true;
                    g_videoFramesRcvd++;
                } else {
                    g_videoPktRejects++;
                }
            } else if (pkt == PKT_CMD) {
                uint8_t cmd = fdata[1];
                if (cmd == CMD_SET_EFFECT && flen >= 3) {
                    g_currentEffectId = fdata[2];
                    // Relay the raw command to every other client.
                    for (AsyncWebSocketClient* c : server->getClients()) {
                        if (!c || c->id() == client->id()) continue;
                        if (c->status() == WS_CONNECTED) c->binary(fdata, flen);
                    }
                    broadcastEffect(*server, client);
                }
            }
        } else if (info->opcode == WS_TEXT) {
            // Text frames (effect-sync JSON) are small - single-callback only.
            if (!(info->final && info->index == 0 && info->len == len)) break;
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
    // Register the event handler here, but do NOT addHandler(&ws) to THIS
    // server: `server` is the HTTP server on port 80, while the cube's
    // WebSocket lives on port 81 (see main.cpp: wsServer.addHandler(&ws)).
    // Adding the same AsyncWebSocket object to two different AsyncWebServer
    // instances corrupts its handshake/client bookkeeping - the client gets
    // counted on the ESP32 (ws.count()==1) but the upgrade never completes
    // cleanly back to the browser, so the browser's onopen never fires and
    // it never streams a single frame (symptom: connected_clients:1 but
    // frames_rcvd:0, last_pkt_len:0). ws must be attached to exactly one
    // server - the port-81 one.
    ws.onEvent(onWsEvent);

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
    // Diagnostic: LittleFS mount state + root directory listing, over HTTP
    // instead of serial - this board's native USB-CDC drops early boot log
    // lines whenever the monitor's own port-open triggers another reset, so
    // there's no reliable way to catch "did LittleFS actually mount and are
    // the uploaded files there" from the serial log alone.
    server.on("/api/fsinfo", HTTP_GET, [](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["mount_ok"]    = g_fsMountOk;
        doc["used_bytes"]  = LittleFS.usedBytes();
        doc["total_bytes"] = LittleFS.totalBytes();
        JsonArray files = doc["files"].to<JsonArray>();
        File root = LittleFS.open("/");
        File f = root.openNextFile();
        while (f) {
            JsonObject entry = files.add<JsonObject>();
            entry["name"] = String(f.name());
            entry["size"] = f.size();
            f = root.openNextFile();
        }
        String out; serializeJson(doc, out);
        request->send(200, "application/json", out);
    });

    // Diagnostic: PSRAM detection + boot-time read/write test result. Lets
    // us verify the PSRAM chip is actually storing/returning data correctly
    // from the browser, independent of the intermittent early-boot serial
    // "PSRAM ID read error" - and reports live free/total PSRAM so a chip
    // that enumerated but under-reports its size is visible too.
    server.on("/api/psramtest", HTTP_GET, [](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["psram_found"]    = g_psramOk;
        doc["test_result"]    = g_psramTestResult;
        doc["psram_size"]     = ESP.getPsramSize();
        doc["psram_free"]     = ESP.getFreePsram();
        String out; serializeJson(doc, out);
        request->send(200, "application/json", out);
    });

    server.on("/api/status", HTTP_GET, [&ws](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["effect"]            = g_currentEffect;
        doc["size"]              = PANEL_SIZE;
        doc["connected_clients"] = ws.count();
        doc["free_heap"]         = ESP.getFreeHeap();
        doc["uptime"]            = (millis() - g_bootMillis) / 1000;
        // Video-stream diagnostics: expected_pkt_len is what a correctly-sized
        // frame must be (2 header bytes + PANEL_SIZE^2 * 3). If last_pkt_len
        // is non-zero but != expected, the browser cube size doesn't match
        // PANEL_SIZE and every frame is being rejected (rejects climbing,
        // frames_rcvd stuck at 0). If frames_rcvd climbs, streaming works.
        doc["ever_streamed"]     = g_everStreamed;
        doc["frames_rcvd"]       = g_videoFramesRcvd;
        doc["pkt_rejects"]       = g_videoPktRejects;
        doc["last_pkt_len"]      = g_lastVideoPktLen;
        doc["last_pkt_face"]     = g_lastVideoPktFace;
        doc["expected_pkt_len"]  = (uint32_t)(2 + FACE_BYTES);
        doc["num_faces"]         = NUM_FACES;
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
