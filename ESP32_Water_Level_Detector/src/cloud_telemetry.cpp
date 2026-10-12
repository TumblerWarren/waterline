#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <Preferences.h>
#include "cloud_telemetry.h"
#include "cloud_secrets.h"
#include "cloud_ca.h"
#include "probe_test.h"
#include "buzzer.h"
#include "level_alarms.h"

namespace {
struct Snapshot { char json[4096]; uint32_t queuedAt, measurementAge, testRemaining; };
QueueHandle_t snapshots=nullptr;
struct Command { char id[33]; uint8_t kind; uint32_t expires; };
QueueHandle_t commands=nullptr;
struct AlarmDelivery { char config[128]; char acknowledgements[224]; };
QueueHandle_t alarmDeliveries=nullptr;
Preferences commandStorage;
String commandId, commandResult, buzzerCommandId, buzzerCommandResult;
portMUX_TYPE resultLock=portMUX_INITIALIZER_UNLOCKED;
int lastResult=0;
void uploadTask(void*) {
 Snapshot snapshot;
 for(;;) {
  if(xQueueReceive(snapshots,&snapshot,portMAX_DELAY)!=pdTRUE) continue;
  if(WiFi.status()!=WL_CONNECTED) continue;
  time_t clock=time(nullptr);
  // Certificate validity and anti-replay timestamps both require a real clock.
  if(clock<1760000000) continue;
  uint32_t age=millis()-snapshot.queuedAt;
  if(age>15000) continue;
  String payload(snapshot.json);payload.remove(payload.length()-1);
  payload += ",\"measurementAgeMs\":";
  payload += snapshot.measurementAge==UINT32_MAX?String("null"):String(static_cast<uint64_t>(snapshot.measurementAge)+age);
  payload += ",\"buzzerTestRemainingMs\":"+String(snapshot.testRemaining>age?snapshot.testRemaining-age:0);
  payload += ",\"sentAt\":"+String(static_cast<uint64_t>(clock)*1000ULL)+"}";
  WiFiClientSecure client;
  client.setCACert(CLOUD_CA); // Validate chain and hostname; never setInsecure().
  client.setHandshakeTimeout(8);
  HTTPClient http;http.setConnectTimeout(8000);http.setTimeout(8000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  int result=-1;
  if(http.begin(client,CLOUD_TELEMETRY_URL)) {
   const char* responseHeaders[]={"X-Waterline-Calibration","X-Waterline-Buzzer","X-Waterline-Alarms","X-Waterline-Alarm-Ack"};
   http.collectHeaders(responseHeaders,4);
   http.addHeader("Content-Type","application/json");
   http.addHeader("Authorization",String("Bearer ")+CLOUD_DEVICE_TOKEN);
   result=http.POST(payload);
   if(result==200 && commands) {
    String header=http.header("X-Waterline-Calibration");
    Command command{};char mode[4]={};unsigned long expires=0;char extra=0;
    if(header.length()<64 && sscanf(header.c_str(),"%32[0-9a-f]:%3[a-z]:%lu%c",command.id,mode,&expires,&extra)==3 &&
       strlen(command.id)==32 && (!strcmp(mode,"dry")||!strcmp(mode,"wet")) &&
       expires>static_cast<unsigned long>(time(nullptr)) && expires<=static_cast<unsigned long>(time(nullptr))+305) {
      command.kind=!strcmp(mode,"wet")?1:0;command.expires=expires;
      xQueueSend(commands,&command,0);
    }
    header=http.header("X-Waterline-Buzzer");
    command={};char action[8]={};expires=0;extra=0;
    if(header.length()<64 && sscanf(header.c_str(),"%32[0-9a-f]:%7[a-z]:%lu%c",command.id,action,&expires,&extra)==3 &&
       strlen(command.id)==32 && (!strcmp(action,"test")||!strcmp(action,"enable")||!strcmp(action,"disable")) &&
       expires>static_cast<unsigned long>(time(nullptr)) && expires<=static_cast<unsigned long>(time(nullptr))+65) {
      command.kind=!strcmp(action,"test")?2:(!strcmp(action,"enable")?3:4);command.expires=expires;
      xQueueSend(commands,&command,0);
    }
   }
   if(result==200 && alarmDeliveries) {
    String config=http.header("X-Waterline-Alarms"),ack=http.header("X-Waterline-Alarm-Ack");
    if(config.length()<128 && ack.length()<224 && (config.length()||ack.length())) {
     AlarmDelivery delivery{};config.toCharArray(delivery.config,sizeof(delivery.config));
     ack.toCharArray(delivery.acknowledgements,sizeof(delivery.acknowledgements));
     xQueueOverwrite(alarmDeliveries,&delivery);
    }
   }
   http.end();
  }
  portENTER_CRITICAL(&resultLock);lastResult=result;portEXIT_CRITICAL(&resultLock);
  Serial.printf("Cloud telemetry HTTP status: %d\n",result);
  vTaskDelay(pdMS_TO_TICKS(result==200?1000:10000));
 }
}
}
void cloudBegin() {
 configTime(0,0,"pool.ntp.org","time.google.com");
 snapshots=xQueueCreate(1,sizeof(Snapshot));
 commands=xQueueCreate(4,sizeof(Command));
 alarmDeliveries=xQueueCreate(1,sizeof(AlarmDelivery));
 commandStorage.begin("cloud-capture",false);
 commandId=commandStorage.getString("last-id","");
 // A reboot must never replay a capture. An interrupted request is rejected.
 commandResult=commandId.length()?"rejected":"";
 buzzerCommandId=commandStorage.getString("last-buzz","");
 buzzerCommandResult=buzzerCommandId.length()?"rejected":"";
 if(snapshots && xTaskCreate(uploadTask,"cloud-upload",16384,nullptr,1,nullptr)!=pdPASS) {
  vQueueDelete(snapshots);snapshots=nullptr;
 }
}
void cloudTick() {
 static bool pendingAck=false;
 bool handled=false;
 if(alarmDeliveries && !probeExcited()) {
  AlarmDelivery delivery{};
  if(xQueueReceive(alarmDeliveries,&delivery,0)==pdTRUE) {
   if(delivery.config[0]) handled=levelAlarmsConfigure(String(delivery.config));
   char* entry=strtok(delivery.acknowledgements,",");
   while(entry) {
    int level=0;char episode[33]={},extra=0;unsigned long expires=0;
    if(sscanf(entry,"%d:%32[0-9a-f]:%lu%c",&level,episode,&expires,&extra)==3 && strlen(episode)==32)
     handled=levelAlarmsAcknowledge(level,episode,expires)||handled;
    entry=strtok(nullptr,",");
   }
  }
 }
 if(commands && !probeExcited()) {
  Command command{};
  if(xQueueReceive(commands,&command,0)==pdTRUE) {
   if(command.kind<2 && commandId!=command.id) {
    commandId=command.id;commandResult="rejected";handled=true;
    if(command.expires>static_cast<uint32_t>(time(nullptr)) &&
       commandStorage.putString("last-id",commandId)==commandId.length() && probeCalibrate(command.kind==1,-1)) {
     commandResult="started";buzzerSetAlarm(0);
    }
   } else if(command.kind>=2 && buzzerCommandId!=command.id) {
    buzzerCommandId=command.id;buzzerCommandResult="rejected";handled=true;
    if(command.expires>static_cast<uint32_t>(time(nullptr)) &&
       commandStorage.putString("last-buzz",buzzerCommandId)==buzzerCommandId.length()) {
     bool ok=command.kind==2?buzzerTest(true):buzzerEnable(command.kind==3);
     if(ok) buzzerCommandResult="started";
    }
   }
  }
 }
 if(!snapshots || WiFi.status()!=WL_CONNECTED || probeExcited()) return;
 static uint32_t lastQueued=0;
 if(handled) pendingAck=true;
 uint32_t now=millis();if(now-lastQueued<(pendingAck?5000U:10000U)) return;lastQueued=now;pendingAck=false;
 Snapshot snapshot{};snapshot.queuedAt=now;snapshot.measurementAge=probeMeasurementAge();
 bool enabled=false;buzzerCloudState(enabled,snapshot.testRemaining);
 String payload=probeStatusJson();payload.remove(payload.length()-1);
 char sampleId[33];for(int i=0;i<4;i++) snprintf(sampleId+i*8,9,"%08lx",static_cast<unsigned long>(esp_random()));
 payload += ",\"schema\":3,\"sampleId\":\""+String(sampleId)+"\",\"buzzerEnabled\":"+String(enabled?"true":"false");
 if(commandId.length()) payload += ",\"calibrationCommandId\":\""+commandId+"\",\"calibrationCommandResult\":\""+commandResult+"\"";
 payload += ",\"buzzerControlSupported\":true";
 if(buzzerCommandId.length()) payload += ",\"buzzerCommandId\":\""+buzzerCommandId+"\",\"buzzerCommandResult\":\""+buzzerCommandResult+"\"";
 payload += levelAlarmsJson();
 payload += "}";
 if(payload.length()>=sizeof(snapshot.json)) return;
 payload.toCharArray(snapshot.json,sizeof(snapshot.json));
 xQueueOverwrite(snapshots,&snapshot); // Keep only the newest snapshot while offline.
}
int cloudLastResult() {
 portENTER_CRITICAL(&resultLock);int value=lastResult;portEXIT_CRITICAL(&resultLock);return value;
}
