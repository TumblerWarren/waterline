#pragma once
#include <Arduino.h>
void levelAlarmsBegin();
void levelAlarmsObserve(int wetMask); // -1 means unknown/faulted; never re-arms.
bool levelAlarmsDrive(uint32_t now);
bool levelAlarmsConfigure(const String& header,bool local=false);
bool levelAlarmsAcknowledge(int level,const char* episode,uint32_t expires);
String levelAlarmsJson();
