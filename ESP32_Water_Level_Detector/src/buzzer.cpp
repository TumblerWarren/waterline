#include <Arduino.h>
#include <esp_timer.h>
#include <esp_arduino_version.h>
#include "hardware_config.h"
#include "buzzer.h"
#include "level_alarms.h"

namespace {
SemaphoreHandle_t mutex=nullptr;
esp_timer_handle_t timer=nullptr;
bool ready=false, enabled=false, sounding=false, testing=false, sustainedTest=false;
int alarmMode=0, lastMode=-1;
uint32_t patternAt=0, testAt=0, alarmUpdatedAt=0;
void duty(bool on,int frequency) {
 if(BUZZER_IS_ACTIVE) {
  digitalWrite(BUZZER_PIN,on?HIGH:LOW);
  sounding=on;
  return;
 }
#if ESP_ARDUINO_VERSION_MAJOR >= 3
 if(on) ledcWriteTone(BUZZER_PIN,frequency); else ledcWrite(BUZZER_PIN,0);
#else
 if(on) ledcWriteTone(0,frequency); else ledcWrite(0,0);
#endif
 sounding=on;
}
void tick(void*) {
 if(!mutex || xSemaphoreTake(mutex,0)!=pdTRUE) return;
 uint32_t now=millis();
 if(testing && now-testAt>=(sustainedTest?10000U:1000U)) testing=false;
 int mode=ready && testing?3:0;
 if(mode!=lastMode) { lastMode=mode;patternAt=now; }
 uint32_t elapsed=now-patternAt;
 bool on=false;
 if(mode==3) on=sustainedTest || elapsed<200 || (elapsed>=400 && elapsed<600);
 // All automatic alarms, including below-20%, use persisted configurable rules.
 else if(ready && enabled && !testing) on=levelAlarmsDrive(now);
 if(on!=sounding) duty(on,mode==1?1800:2500);
 xSemaphoreGive(mutex);
}
}
void buzzerBegin() {
 mutex=xSemaphoreCreateMutex();
 if(!mutex || !BUZZER_HARDWARE_VERIFIED) return;
 if(BUZZER_IS_ACTIVE) {
  digitalWrite(BUZZER_PIN,LOW);pinMode(BUZZER_PIN,OUTPUT);ready=true;
 } else {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
 ready=ledcAttach(BUZZER_PIN,2000,8);
#else
 ready=ledcSetup(0,2000,8)>0;
 if(ready) ledcAttachPin(BUZZER_PIN,0);
#endif
 }
 if(!ready) return;
 duty(false,2000);
 esp_timer_create_args_t args={};args.callback=tick;args.name="buzzer-pattern";
 if(esp_timer_create(&args,&timer)!=ESP_OK || esp_timer_start_periodic(timer,10000)!=ESP_OK) ready=false;
 enabled=ready && BUZZER_ALARMS_DEFAULT_ENABLED;
}
void buzzerStop() {
 if(!mutex) return;
 xSemaphoreTake(mutex,portMAX_DELAY);enabled=false;testing=false;alarmMode=0;lastMode=-1;
 if(ready) duty(false,2000);xSemaphoreGive(mutex);
}
void buzzerSetAlarm(int value) {
 if(!mutex) return;
 xSemaphoreTake(mutex,portMAX_DELAY);alarmMode=value;alarmUpdatedAt=millis();xSemaphoreGive(mutex);
}
bool buzzerEnable(bool value) {
 if(!mutex) return false;
 xSemaphoreTake(mutex,portMAX_DELAY);
 bool ok=ready;
 if(ok) { enabled=value;if(!value) { testing=false;duty(false,2000); } }
 xSemaphoreGive(mutex);return ok;
}
bool buzzerTest(bool sustained) {
 if(!mutex) return false;
 xSemaphoreTake(mutex,portMAX_DELAY);
 bool ok=ready;
 if(ok) { enabled=false;testing=true;sustainedTest=sustained;testAt=millis();lastMode=-1; }
 xSemaphoreGive(mutex);return ok;
}
String buzzerStatusHtml() {
 if(!mutex) return "Unavailable";
 xSemaphoreTake(mutex,portMAX_DELAY);
 String result=!ready?"Unavailable / hardware not verified":String(enabled?"Alarms enabled":"Alarms disabled")+
              (testing?(sustainedTest?"; 10-second test running":"; test running"):(sounding?"; drive ON":"; silent"));
 xSemaphoreGive(mutex);return result;
}
void buzzerCloudState(bool& value, uint32_t& remaining) {
 value=false;remaining=0;if(!mutex) return;
 xSemaphoreTake(mutex,portMAX_DELAY);
 value=ready && enabled;
 uint32_t duration=sustainedTest?10000U:1000U, elapsed=millis()-testAt;
 if(ready && testing && elapsed<duration) remaining=duration-elapsed;
 xSemaphoreGive(mutex);
}

