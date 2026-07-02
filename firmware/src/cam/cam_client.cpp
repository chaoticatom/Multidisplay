#include "cam_client.h"
#include <HTTPClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

static CamConfig _cfg;
static uint8_t* _jpegBuf = nullptr;
static size_t   _jpegLen = 0;
static SemaphoreHandle_t _mutex = nullptr;
static TaskHandle_t _task = nullptr;
static uint32_t _fetchCount = 0, _errCount = 0;
static bool _running = false;

static void camTask(void*) {
  HTTPClient http;
  while (_running) {
    if (_cfg.enabled && strlen(_cfg.snapUrl) > 0) {
      http.begin(_cfg.snapUrl);
      http.setTimeout(3000);
      int code = http.GET();
      if (code == 200) {
        int len = http.getSize();
        if (len > 0 && len < 256*1024) {
          uint8_t* tmp = (uint8_t*)ps_malloc(len);
          if (tmp) {
            WiFiClient* stream = http.getStreamPtr();
            size_t got = 0;
            while (got < (size_t)len) {
              int avail = stream->available();
              if (avail > 0) got += stream->readBytes(tmp+got, avail);
              else vTaskDelay(1);
            }
            xSemaphoreTake(_mutex, portMAX_DELAY);
            if (_jpegBuf) free(_jpegBuf);
            _jpegBuf = tmp; _jpegLen = got;
            xSemaphoreGive(_mutex);
            _fetchCount++;
          }
        }
      } else { _errCount++; }
      http.end();
    }
    vTaskDelay(_cfg.intervalMs / portTICK_PERIOD_MS);
  }
  vTaskDelete(nullptr);
}

bool camInit(const CamConfig& cfg) {
  _cfg = cfg;
  if (!_mutex) _mutex = xSemaphoreCreateMutex();
  _running = true;
  return xTaskCreatePinnedToCore(camTask, "cam", 8192, nullptr, 1, &_task, 1) == pdPASS;
}

void camStop() {
  _running = false;
  if (_task) { vTaskDelay(500/portTICK_PERIOD_MS); _task = nullptr; }
}

bool camGetLatestJpeg(const uint8_t** buf, size_t* len) {
  if (!_mutex || !_jpegBuf) return false;
  xSemaphoreTake(_mutex, portMAX_DELAY);
  *buf = _jpegBuf; *len = _jpegLen;
  return true; // caller must release
}

void camReleaseJpeg() { if (_mutex) xSemaphoreGive(_mutex); }
uint32_t camGetFetchCount() { return _fetchCount; }
uint32_t camGetErrorCount() { return _errCount; }
bool camIsRunning() { return _running; }
