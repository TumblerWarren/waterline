#pragma once
#include <Arduino.h>
constexpr int LEVEL_PROBE_PINS[] = {32, 33, 34, 36};
constexpr int LEVEL_PERCENT[] = {100, 80, 50, 20};
constexpr int PROBE_COUNT = 4;
constexpr int COMMON_PROBE_PIN = 14;
constexpr int BUZZER_PIN = 23;
constexpr bool BUZZER_HARDWARE_VERIFIED = true;
// User confirmed continuous sound when directly powered by DC: active buzzer.
constexpr bool BUZZER_IS_ACTIVE = true;
constexpr bool BUZZER_ALARMS_DEFAULT_ENABLED = true;
constexpr uint32_t PROBE_INTERVAL_MS = 5000;
constexpr uint32_t PROBE_SETTLE_MS = 500;
constexpr uint32_t PROBE_SAMPLE_INTERVAL_MS = 2;
constexpr int PROBE_SAMPLES = 15;
constexpr int CALIBRATION_CYCLES = 20;
constexpr int MIN_CALIBRATION_GAP = 500; // User-selected minimum saved WET minus DRY.
constexpr bool calibrationGapAccepted(int dry, int wet) {
 return wet-dry > MIN_CALIBRATION_GAP && wet < 4080;
}
static_assert(!calibrationGapAccepted(0,500), "A difference of exactly 500 does not pass");
static_assert(calibrationGapAccepted(0,501), "A difference above 500 passes");
static_assert(!calibrationGapAccepted(0,4080), "Saturated calibration remains invalid");
constexpr int DEBOUNCE_CYCLES = 3;
// GPIO35 is unused. GPIO33 is 80%; GPIO34 is 50%.
// As-built: 100k series, 1M pulldown, 22nF capacitor on every sensing node.
