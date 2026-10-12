#include <Arduino.h>
#include <Preferences.h>
#include <algorithm>
#include "hardware_config.h"
#include "probe_test.h"

namespace {
Preferences storage;
// Four-probe loading requires fresh dry/wet calibration on every channel.
struct Calibration { int version=3, dry=0, wet=0, dryNoise=0, wetNoise=0, dryReady=0, wetReady=0; };
struct Channel {
 Calibration cal;
 int raw=0, filtered=0, samples[PROBE_SAMPLES]={}, count=0;
 bool confirmed=false, wet=false, candidate=false;
 int captureMode=0, captureCount=0, capture[CALIBRATION_CYCLES]={};
};
Channel channels[PROBE_COUNT];
enum class Phase { Idle, Settle, Sample };
Phase phase=Phase::Idle;
bool paused=false, measured=false, saveFailed=false;
int sampleCount=0;
uint32_t cycleAt=0, phaseAt=0, sampleAt=0, measuredAt=0;
int median(int* values,int count) { std::sort(values,values+count); return values[count/2]; }
bool valid(const Channel& c) {
 const auto& k=c.cal;
 return k.dryReady && k.wetReady && calibrationGapAccepted(k.dry,k.wet);
}
void save(int i) {
 char key[12]; snprintf(key,sizeof(key),"gpio%d",LEVEL_PROBE_PINS[i]);
 if(storage.putBytes(key,&channels[i].cal,sizeof(Calibration))!=sizeof(Calibration)) saveFailed=true;
}
bool allReady() {
 if(!measured || millis()-measuredAt>15000 || paused || saveFailed) return false;
 for(const auto& c:channels) if(!valid(c)||!c.confirmed||c.captureMode||c.filtered>=4080) return false;
 return true;
}
bool inconsistent() {
 for(int i=0;i<PROBE_COUNT;i++) if(channels[i].confirmed && channels[i].wet)
  for(int j=i+1;j<PROBE_COUNT;j++) if(channels[j].confirmed && !channels[j].wet) return true;
 return false;
}
void complete(uint32_t now) {
 measured=true; measuredAt=now;
 for(int i=0;i<PROBE_COUNT;i++) {
  auto& c=channels[i]; auto& k=c.cal;
  c.filtered=median(c.samples,PROBE_SAMPLES);
  if(c.captureMode) {
   c.capture[c.captureCount++]=c.filtered;
   if(c.captureCount==CALIBRATION_CYCLES) {
    int value=median(c.capture,CALIBRATION_CYCLES);
    int noise=c.capture[CALIBRATION_CYCLES-1]-c.capture[0];
    if(c.captureMode==1) { k.dry=value;k.dryNoise=noise;k.dryReady=1; }
    else { k.wet=value;k.wetNoise=noise;k.wetReady=1; }
    c.captureMode=0;c.count=0;c.confirmed=false;save(i);
   }
  } else if(valid(c) && c.filtered<4080) {
   int gap=k.wet-k.dry;
   bool observed=c.confirmed?c.wet:c.filtered>=k.dry+gap/2;
   if(c.filtered>=k.dry+gap*6/10) observed=true;
   else if(c.filtered<=k.dry+gap*4/10) observed=false;
   if(!c.count || c.candidate!=observed) { c.candidate=observed;c.count=1; }
   else if(c.count<DEBOUNCE_CYCLES) ++c.count;
   if(c.count>=DEBOUNCE_CYCLES) { c.wet=observed;c.confirmed=true; }
  } else { c.confirmed=false;c.count=0; }
  Serial.printf("GPIO%d raw=%d median=%d state=%s\n",LEVEL_PROBE_PINS[i],c.raw,c.filtered,
    c.confirmed?(c.wet?"WET":"DRY"):"UNKNOWN");
 }
 Serial.printf("Band: %s; fault: %s\n",probeBand().c_str(),probeFault().c_str());
}
String state(const Channel& c) {
 if(!measured || millis()-measuredAt>15000 || paused) return "UNKNOWN";
 if(c.filtered>=4080) return "FAULT: ADC saturation";
 if(c.captureMode) return String(c.captureMode==1?"Capturing DRY ":"Capturing WET ")+c.captureCount+"/"+String(CALIBRATION_CYCLES);
 if(!valid(c)) return "UNCALIBRATED / wet-dry difference must exceed 500";
 if(!c.confirmed) return "Confirming";
 return c.wet?"WET":"DRY";
}
}

void probeBegin() {
 pinMode(COMMON_PROBE_PIN,INPUT);analogReadResolution(12);storage.begin("all-probes",false);
 for(int i=0;i<PROBE_COUNT;i++) {
  pinMode(LEVEL_PROBE_PINS[i],INPUT);analogSetPinAttenuation(LEVEL_PROBE_PINS[i],ADC_11db);
  char key[12];snprintf(key,sizeof(key),"gpio%d",LEVEL_PROBE_PINS[i]);
  if(storage.getBytesLength(key)==sizeof(Calibration)) {
   storage.getBytes(key,&channels[i].cal,sizeof(Calibration));
   if(channels[i].cal.version!=3) channels[i].cal=Calibration{};
  }
 }
 cycleAt=millis()-PROBE_INTERVAL_MS;
}
bool probeExcited() { return phase!=Phase::Idle; }
void probePause(bool value) { paused=value;pinMode(COMMON_PROBE_PIN,INPUT);phase=Phase::Idle;cycleAt=millis(); }
void probeTick() {
 if(paused) return;
 uint32_t now=millis();
 if(phase==Phase::Idle && now-cycleAt>=PROBE_INTERVAL_MS) {
  cycleAt=now;digitalWrite(COMMON_PROBE_PIN,HIGH);pinMode(COMMON_PROBE_PIN,OUTPUT);phase=Phase::Settle;phaseAt=now;
 } else if(phase==Phase::Settle && now-phaseAt>=PROBE_SETTLE_MS) {
  sampleCount=0;sampleAt=now-PROBE_SAMPLE_INTERVAL_MS;phase=Phase::Sample;
 } else if(phase==Phase::Sample && now-sampleAt>=PROBE_SAMPLE_INTERVAL_MS) {
  sampleAt=now;
  for(int i=0;i<PROBE_COUNT;i++) {
   analogRead(LEVEL_PROBE_PINS[i]); // discard conversion after switching channels
   channels[i].raw=analogRead(LEVEL_PROBE_PINS[i]);channels[i].samples[sampleCount]=channels[i].raw;
  }
  if(++sampleCount==PROBE_SAMPLES) { pinMode(COMMON_PROBE_PIN,INPUT);phase=Phase::Idle;complete(now); }
 }
}
bool probeCalibrate(bool wet,int channel) {
 if(channel < -1 || channel>=PROBE_COUNT || paused) return false;
 for(int i=0;i<PROBE_COUNT;i++) if(channel==-1||channel==i)
  if(channels[i].captureMode || (wet&&!channels[i].cal.dryReady)) return false;
 for(int i=0;i<PROBE_COUNT;i++) if(channel==-1||channel==i) {
  auto& c=channels[i];
  if(!wet) { c.cal.dryReady=0;c.cal.wetReady=0;save(i); }
  c.captureMode=wet?2:1;c.captureCount=0;c.confirmed=false;c.count=0;
 }
 return true;
}
String probeFault() {
 if(saveFailed) return "Calibration storage failed";
 if(paused) return "Measurements paused for update";
 if(!measured) return "Waiting for measurement";
 if(millis()-measuredAt>15000) return "Stale measurements";
 for(int i=0;i<PROBE_COUNT;i++) if(channels[i].filtered>=4080) return String("ADC saturation on GPIO")+LEVEL_PROBE_PINS[i];
 if(inconsistent()) return "Inconsistent probes: upper wet while lower dry";
 for(const auto& c:channels) if(c.captureMode) return "Calibration in progress";
 for(const auto& c:channels) if(!valid(c)) return "Calibration required / wet-dry difference must exceed 500";
 for(const auto& c:channels) if(!c.confirmed) return "Waiting for stable readings";
 return "None";
}
String probeBand() {
 if(!allReady()||inconsistent()) return "UNKNOWN";
 for(int i=0;i<PROBE_COUNT;i++) if(channels[i].wet) {
  if(i==0) return "At or above 100% electrode (FULL)";
  return String(LEVEL_PERCENT[i])+"% to below "+LEVEL_PERCENT[i-1]+"%";
 }
 return "Below 20% (LOW)";
}
int probeAlarm() {
 if(!allReady()||inconsistent()) return 0;
 if(!channels[PROBE_COUNT-1].wet) return 1;
 return 0;
}
int probeLevelMask() {
 if(!allReady()||inconsistent()) return -1;
 return (channels[3].wet?1:0)|(channels[2].wet?2:0)|(channels[1].wet?4:0)|(channels[0].wet?8:0);
}
String probeStatusHtml() {
 String html="<dl><dt>Detected level band</dt><dd>"+probeBand()+"</dd><dt>Sensor fault / readiness</dt><dd>"+probeFault()+"</dd>";
 html+="<dt>Last successful ADC cycle</dt><dd>"+(measured?String(measuredAt)+" ms since boot; age "+String((millis()-measuredAt)/1000)+" seconds":String("Never"))+"</dd></dl>";
 for(int i=0;i<PROBE_COUNT;i++) {
  auto& c=channels[i];auto& k=c.cal;
  html+="<h3>"+String(LEVEL_PERCENT[i])+"% - GPIO"+LEVEL_PROBE_PINS[i]+"</h3><p>"+state(c)+"</p><p>Raw / median: "+c.raw+" / "+c.filtered+"</p>";
  html+="<p>Dry / wet: "+(k.dryReady?String(k.dry):String("Not captured"))+" / "+(k.wetReady?String(k.wet):String("Not captured"))+"</p>";
  if(valid(c)) html+="<p>Hysteresis: "+String(k.dry+(k.wet-k.dry)*4/10)+" / "+String(k.dry+(k.wet-k.dry)*6/10)+"</p>";
 }
 return html;
}
String probeStatusJson() {
 String json="{\"band\":\""+probeBand()+"\",\"fault\":\""+probeFault()+"\",\"lastMeasurementMs\":"+String(measuredAt)+",\"measurementAvailable\":"+(measured?"true":"false")+",\"probes\":[";
 for(int i=0;i<PROBE_COUNT;i++) {
  if(i) json+=",";
  auto& c=channels[i];json+="{\"level\":"+String(LEVEL_PERCENT[i])+",\"gpio\":"+LEVEL_PROBE_PINS[i]+",\"raw\":"+c.raw+",\"median\":"+c.filtered+",\"state\":\""+state(c)+"\",\"calibrated\":"+(valid(c)?"true":"false");
  json += ",\"calibration\":{\"dry\":"+String(c.cal.dry)+",\"wet\":"+String(c.cal.wet)+",\"dryReady\":"+(c.cal.dryReady?String("true"):String("false"))+",\"wetReady\":"+(c.cal.wetReady?String("true"):String("false"))+",\"capture\":\""+(c.captureMode==1?String("dry"):c.captureMode==2?String("wet"):String("none"))+"\",\"cycles\":"+String(c.captureCount)+",\"targetCycles\":"+String(CALIBRATION_CYCLES)+",\"dryNoise\":"+String(c.cal.dryNoise)+",\"wetNoise\":"+String(c.cal.wetNoise)+"}}";
 }
 return json+"]}";
}
uint32_t probeMeasurementAge() { return measured ? millis()-measuredAt : UINT32_MAX; }
