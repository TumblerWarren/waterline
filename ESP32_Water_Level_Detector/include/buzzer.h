#pragma once
#include <Arduino.h>
void buzzerBegin();
void buzzerStop();
void buzzerSetAlarm(int alarm);
bool buzzerEnable(bool enabled);
bool buzzerTest(bool sustained = false);
String buzzerStatusHtml();
void buzzerCloudState(bool& enabled, uint32_t& testRemainingMs);
