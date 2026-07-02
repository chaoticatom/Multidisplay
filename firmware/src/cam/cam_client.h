#pragma once
#include <Arduino.h>

struct CamConfig {
  char snapUrl[256];   // full Reolink snapshot URL
  uint16_t intervalMs; // fetch interval (min 67 = ~15fps)
  bool enabled;
};

bool camInit(const CamConfig& cfg);
void camStop();
// Returns true if a JPEG is available; caller must call camReleaseJpeg() after use
bool camGetLatestJpeg(const uint8_t** buf, size_t* len);
void camReleaseJpeg();
uint32_t camGetFetchCount();
uint32_t camGetErrorCount();
bool camIsRunning();
