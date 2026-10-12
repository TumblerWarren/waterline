#include <Arduino.h>
#include <Preferences.h>
#include <time.h>
#include "level_alarms.h"
#include "alarm_timing.h"
namespace {
constexpr int levels[]={20,50,80,100};
struct Rule { uint32_t onSeconds=10,offSeconds=50; uint8_t enabled=1,wet=0,ack=0; char episode[33]={}; };
struct SavedV1 { uint32_t version=1,revision=0; Rule rules[3]; };
struct Saved { uint32_t version=2,revision=0; Rule rules[4]; };
Saved saved;
Preferences storage;
SemaphoreHandle_t mutex=nullptr;
bool known=false;
uint32_t observedAt=0,startedAt[4]={};
bool persist() { return storage.putBytes("saved",&saved,sizeof(saved))==sizeof(saved); }
bool triggered(int i,const Rule& r) { return i==0?!r.wet:r.wet; }
void newEpisode(Rule& r) {
 for(int i=0;i<4;i++) snprintf(r.episode+i*8,9,"%08lx",static_cast<unsigned long>(esp_random()));
 r.ack=0;
}
}
void levelAlarmsBegin() {
 saved.rules[0].onSeconds=60;saved.rules[0].offSeconds=540;
 mutex=xSemaphoreCreateMutex();storage.begin("level-alarms",false);
 if(storage.getBytesLength("saved")==sizeof(Saved)) {
  Saved loaded;storage.getBytes("saved",&loaded,sizeof(loaded));
  bool valid=loaded.version==2;
  for(const auto& r:loaded.rules) valid=valid && r.onSeconds>=1 && r.onSeconds<=60 && r.offSeconds>=1 && r.offSeconds<=3600 && r.enabled<=1 && r.wet<=1 && r.ack<=1 && r.episode[32]==0 && (r.episode[0]==0 || strlen(r.episode)==32);
  if(valid) saved=loaded;
 }
 if(storage.getBytesLength("saved")==sizeof(SavedV1)) {
  SavedV1 old;storage.getBytes("saved",&old,sizeof(old));
  bool valid=old.version==1;
  for(const auto& r:old.rules) valid=valid && r.onSeconds>=1 && r.onSeconds<=60 && r.offSeconds>=1 && r.offSeconds<=3600 && r.enabled<=1 && r.wet<=1 && r.ack<=1 && r.episode[32]==0;
  if(valid) { saved.revision=old.revision;for(int i=0;i<3;i++) saved.rules[i+1]=old.rules[i];persist(); }
 }
 for(auto& start:startedAt) start=millis();
}
void levelAlarmsObserve(int mask) {
 if(!mutex) return;
 xSemaphoreTake(mutex,portMAX_DELAY);
 known=mask>=0;observedAt=millis();
 if(known) {
  Saved previous=saved;bool changed=false;
  for(int i=0;i<4;i++) {
   auto& r=saved.rules[i];bool wet=mask&(1<<i);
   bool trigger=i==0?!wet:wet;
   if(wet!=static_cast<bool>(r.wet) || (trigger && !r.episode[0]) || (!trigger && r.episode[0])) {
    r.wet=wet;r.ack=0;changed=true;startedAt[i]=millis();
    if(trigger) newEpisode(r); else r.episode[0]=0;
   }
  }
  if(changed && !persist()) { saved=previous;known=false; }
 }
 xSemaphoreGive(mutex);
}
bool levelAlarmsDrive(uint32_t now) {
 if(!mutex || xSemaphoreTake(mutex,0)!=pdTRUE) return false;
 bool on=false;
 if(known && now-observedAt<=15000) for(int i=3;i>=0;i--) {
  auto& r=saved.rules[i];
  if(r.enabled && triggered(i,r) && !r.ack) {
   uint32_t elapsed=now-startedAt[i];
   on=alarmSoundPhase(elapsed,r.onSeconds,r.offSeconds) && (i!=0 || elapsed%1000U<500U);break; // Highest unacknowledged level wins.
  }
 }
 xSemaphoreGive(mutex);return on;
}
bool levelAlarmsConfigure(const String& header,bool local) {
 unsigned long values[13]={};char extra=0;
 if(header.length()>127 || sscanf(header.c_str(),"v2:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu:%lu%c",
   &values[0],&values[1],&values[2],&values[3],&values[4],&values[5],&values[6],&values[7],&values[8],&values[9],&values[10],&values[11],&values[12],&extra)!=13) return false;
 for(int i=0;i<4;i++) if(values[1+i*3]>1 || values[2+i*3]<1 || values[2+i*3]>60 || values[3+i*3]<1 || values[3+i*3]>3600) return false;
 if(!mutex) return false;xSemaphoreTake(mutex,portMAX_DELAY);
 bool ok=false;
 if(values[0]>saved.revision && (!local || values[0]==saved.revision+1)) {
  Saved previous=saved;saved.revision=values[0];
  for(int i=0;i<4;i++) {
   auto& r=saved.rules[i];
   if(!r.enabled && values[1+i*3] && triggered(i,r)) newEpisode(r);
   r.enabled=values[1+i*3];r.onSeconds=values[2+i*3];r.offSeconds=values[3+i*3];
   startedAt[i]=millis();
  }
  ok=persist();if(!ok) saved=previous;
 }
 xSemaphoreGive(mutex);return ok;
}
bool levelAlarmsAcknowledge(int level,const char* episode,uint32_t expires) {
 if(!mutex || expires<=static_cast<uint32_t>(time(nullptr)) || expires>static_cast<uint32_t>(time(nullptr))+65) return false;
 xSemaphoreTake(mutex,portMAX_DELAY);bool ok=false;
 for(int i=0;i<4;i++) if(levels[i]==level) {
  auto& r=saved.rules[i];
  if(triggered(i,r) && r.episode[0] && !strcmp(r.episode,episode)) {
   if(r.ack) ok=true;
   else { r.ack=1;ok=persist();if(!ok) r.ack=0; }
  }
 }
 xSemaphoreGive(mutex);return ok;
}
String levelAlarmsJson() {
 if(!mutex) return "";
 xSemaphoreTake(mutex,portMAX_DELAY);
 String json=",\"alarmRevision\":"+String(saved.revision)+",\"levelAlarms\":[";
 for(int i=0;i<4;i++) {
  if(i) json+=",";auto& r=saved.rules[i];
  bool active=known && millis()-observedAt<=15000 && triggered(i,r) && r.enabled && !r.ack;
  json+="{\"level\":"+String(levels[i])+",\"enabled\":"+(r.enabled?"true":"false")+",\"onSeconds\":"+String(r.onSeconds)+",\"offSeconds\":"+String(r.offSeconds)+",\"wet\":"+(r.wet?"true":"false")+",\"acknowledged\":"+(r.ack?"true":"false")+",\"active\":"+(active?"true":"false")+",\"episode\":\""+r.episode+"\"}";
 }
 json+="]";xSemaphoreGive(mutex);return json;
}
