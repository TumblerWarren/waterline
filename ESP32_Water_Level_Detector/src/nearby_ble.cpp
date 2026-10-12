#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <time.h>
#include "nearby_ble.h"
#include "probe_test.h"
#include "buzzer.h"
#include "level_alarms.h"

namespace {
constexpr char serviceId[]="b0a10000-5b7d-4fb0-9b7d-1b4ea17e0001";
constexpr char requestId[]="b0a10001-5b7d-4fb0-9b7d-1b4ea17e0001";
constexpr char responseId[]="b0a10002-5b7d-4fb0-9b7d-1b4ea17e0001";
struct Command { uint16_t connection; char text[200]; };
QueueHandle_t commands=nullptr;
NimBLECharacteristic* response=nullptr;
Preferences prefs;
uint32_t passkey=0;
String captured;
uint16_t capturedConnection=BLE_HS_CONN_HANDLE_NONE;
class ServerCallbacks : public NimBLEServerCallbacks {
 void onDisconnect(NimBLEServer*,NimBLEConnInfo&,int) override { NimBLEDevice::startAdvertising(); }
 uint32_t onPassKeyDisplay() override { return passkey; }
 void onAuthenticationComplete(NimBLEConnInfo& info) override {
  if(!info.isEncrypted() || !info.isAuthenticated()) NimBLEDevice::getServer()->disconnect(info.getConnHandle());
 }
} serverCallbacks;
class Commands : public NimBLECharacteristicCallbacks {
 void onWrite(NimBLECharacteristic* characteristic,NimBLEConnInfo& info) override {
  if(!info.isEncrypted() || !info.isAuthenticated()) return;
  const auto value=characteristic->getValue();
  if(value.size()==0 || value.size()>=sizeof(Command::text)) return;
  Command command{}; command.connection=info.getConnHandle();
  memcpy(command.text,value.data(),value.size());
  // BLE task never samples probes or changes outputs. The Arduino loop owns commands.
  xQueueSend(commands,&command,0);
 }
} commandCallbacks;
String snapshot() {
 bool enabled=false;uint32_t remaining=0;buzzerCloudState(enabled,remaining);
 String data=probeStatusJson();data.remove(data.length()-1);
 data+=",\"deviceId\":\"rooftop-esp32\",\"protocol\":1,\"measurementAgeMs\":";
 const uint32_t age=probeMeasurementAge();
 data+=age==UINT32_MAX?String("null"):String(age);
 data+=",\"buzzerEnabled\":"+String(enabled?"true":"false")+",\"buzzerTestRemainingMs\":"+String(remaining);
 data+=levelAlarmsJson();return data+"}";
}
}
String nearbyPairingCode() { char code[7];snprintf(code,sizeof(code),"%06lu",static_cast<unsigned long>(passkey));return code; }
void nearbyForgetPhones() {
 auto* server=NimBLEDevice::getServer();
 if(server->getConnectedCount()) server->disconnect(server->getPeerInfo(0).getConnHandle());
 NimBLEDevice::deleteAllBonds();
 passkey=100000+esp_random()%900000;prefs.putUInt("pin",passkey);NimBLEDevice::setSecurityPasskey(passkey);
}
void nearbyBegin() {
 prefs.begin("water-ble",false);passkey=prefs.getUInt("pin",0);
 if(passkey<100000 || passkey>999999) { passkey=100000+esp_random()%900000;prefs.putUInt("pin",passkey); }
 commands=xQueueCreate(4,sizeof(Command));if(!commands) return;
 NimBLEDevice::init("Waterline-Rooftop");
 NimBLEDevice::setMTU(512);
 NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
 NimBLEDevice::setSecurityAuth(true,true,true);
 NimBLEDevice::setSecurityPasskey(passkey);
 auto* server=NimBLEDevice::createServer();server->setCallbacks(&serverCallbacks);
 auto* service=server->createService(serviceId);
 auto* request=service->createCharacteristic(requestId,NIMBLE_PROPERTY::WRITE|NIMBLE_PROPERTY::WRITE_AUTHEN,200);
 request->setCallbacks(&commandCallbacks);
 response=service->createCharacteristic(responseId,NIMBLE_PROPERTY::READ|NIMBLE_PROPERTY::READ_AUTHEN,500);
 response->setValue("0|WAIT");service->start();
 auto* advertising=NimBLEDevice::getAdvertising();advertising->setName("Waterline-Rooftop");
 advertising->addServiceUUID(serviceId);advertising->enableScanResponse(true);advertising->start();
}
void nearbyTick() {
 if(!commands || probeExcited()) return;
 Command command{};if(xQueueReceive(commands,&command,0)!=pdTRUE) return;
 NimBLEConnInfo connection=NimBLEDevice::getServer()->getPeerInfoByHandle(command.connection);
 if(!connection.isEncrypted() || !connection.isAuthenticated()) return;
 String text(command.text);int split=text.indexOf('|');
 if(split<=0 || split>10) return;
 String id=text.substring(0,split),action=text.substring(split+1);String result="ERROR";
 if(action.startsWith("read:")) {
  String offsetText=action.substring(5);bool digits=!offsetText.isEmpty();
  for(size_t i=0;i<offsetText.length();i++) digits=digits && isDigit(offsetText[i]);
  uint32_t offset=offsetText.toInt();
  if(digits && offset<=4096) {
   if(offset==0) { captured=snapshot();capturedConnection=command.connection; }
   if(capturedConnection==command.connection && offset<=captured.length()) result="DATA:"+captured.substring(offset,offset+450);
  }
 } else if(action=="test") result=buzzerTest(true)?"OK":"ERROR";
 else if(action=="enable") result=buzzerEnable(true)?"OK":"ERROR";
 else if(action=="disable") result=buzzerEnable(false)?"OK":"ERROR";
 else if(action.startsWith("settings:")) result=levelAlarmsConfigure(action.substring(9),true)?"OK":"ERROR:Settings changed; refresh and retry";
 else if(action.startsWith("ack:")) {
  int separator=action.indexOf(':',4);String episode=action.substring(separator+1);
  if(separator>4 && episode.length()==32) {
   // Local commands expire immediately; no internet clock is needed for a BLE acknowledgement.
   result=levelAlarmsAcknowledge(action.substring(4,separator).toInt(),episode.c_str(),static_cast<uint32_t>(time(nullptr))+30)?"OK":"ERROR:Alarm changed";
  }
 }
 response->setValue((id+"|"+result).c_str());
}
