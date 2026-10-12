#pragma once
#include <Arduino.h>
void probeBegin();
void probeTick();
bool probeExcited();
void probePause(bool paused);
bool probeCalibrate(bool wet, int channel);
String probeStatusHtml();
String probeStatusJson();
uint32_t probeMeasurementAge(); // UINT32_MAX when no measurement is available
String probeBand();
String probeFault();
int probeAlarm(); // 0: silent, 1: low; FULL is silent
int probeLevelMask(); // bits 0/1/2/3 = 20/50/80/100 wet; -1 when not trustworthy
