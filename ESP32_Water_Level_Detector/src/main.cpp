#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Update.h>
#include "hardware_config.h"
#include "wifi_secrets.h"
#include "probe_test.h"
#include "buzzer.h"
#include "level_alarms.h"
#include "cloud_telemetry.h"
#include "nearby_ble.h"

WebServer server(80);
Preferences preferences;
String token, pendingSsid, pendingPassword;
bool apRunning = false, connectPending = false, restartPending = false;
bool uploadAuthorized = false, uploadFinished = false;
uint32_t connectAt = 0, restartAt = 0, disconnectedAt = 0;

void safeOutputs() {
    buzzerStop();
    pinMode(COMMON_PROBE_PIN, INPUT);
    digitalWrite(BUZZER_PIN, LOW);
    pinMode(BUZZER_PIN, OUTPUT);
}

String htmlEscape(String value) {
    value.replace("&", "&amp;"); value.replace("<", "&lt;");
    value.replace(">", "&gt;"); value.replace("\"", "&quot;");
    value.replace("'", "&#39;"); return value;
}

bool authenticated() {
    if (server.authenticate("admin", DEVICE_PASSWORD)) return true;
    server.requestAuthentication(); return false;
}

String pageStart() {
    return "<!doctype html><html><head><meta charset='utf-8'>"
           "<meta name='viewport' content='width=device-width,initial-scale=1'>"
           "<title>Water Level Detector</title><style>"
           "body{font:16px system-ui;background:#eef3f7;color:#163047;max-width:640px;margin:24px auto;padding:16px}"
           "section{background:white;border-radius:16px;padding:24px;margin-bottom:16px}"
           "input,button{font:inherit;box-sizing:border-box;width:100%;padding:12px;margin:8px 0}"
           "button{background:#156c9c;color:white;border:0;border-radius:8px;cursor:pointer}"
           "a{color:#156c9c}dt{font-weight:bold;margin-top:14px}dd{margin:4px 0}"
           "</style></head><body><h1>Water Level Detector</h1>";
}

void sendPage(const String& page) {
    server.sendHeader("Cache-Control", "no-store");
    server.sendHeader("X-Content-Type-Options", "nosniff");
    server.send(200, "text/html; charset=utf-8", page);
}

void startAP() {
    if (apRunning) return;
    WiFi.mode(WIFI_AP_STA);
    apRunning = WiFi.softAP("Water-Level-Setup", DEVICE_PASSWORD);
    Serial.println(apRunning ? "Setup Wi-Fi: Water-Level-Setup; page http://192.168.4.1" : "Setup Wi-Fi failed");
}

void setup() {
    safeOutputs(); Serial.begin(115200); delay(250);
    Serial.println("ESP32 Water Level Detector: water-level-v12-ble initialized; all four probes; automatic alarms configured");
    token = String(esp_random(), HEX) + String(esp_random(), HEX);
    preferences.begin("water-wifi", false);
    WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setHostname("water-level");
    const String config = preferences.isKey("config") ? preferences.getString("config", "") : String("");
    const int separator = config.indexOf('\n');
    const String ssid = separator >= 0 ? config.substring(0, separator) : String("");
    const String password = separator >= 0 ? config.substring(separator + 1) : String("");
    if (ssid.isEmpty()) startAP(); else WiFi.begin(ssid.c_str(), password.c_str());
    disconnectedAt = millis();

    server.on("/", HTTP_GET, [] {
        if (!authenticated()) return;
        const bool connected = WiFi.status() == WL_CONNECTED;
        String page = pageStart();
        page += "<section><h2>Device status</h2><dl><dt>Home Wi-Fi</dt><dd>";
        page += connected ? String("Connected to ") + htmlEscape(WiFi.SSID()) : String("Disconnected / connecting");
        page += "</dd><dt>Home network address</dt><dd>";
        page += connected ? WiFi.localIP().toString() : String("Not assigned yet");
        page += "</dd><dt>Cloud upload HTTP status</dt><dd>" + String(cloudLastResult()) + " (200 = uploaded; 0 = waiting)</dd>";
        page += "<dt>Uptime</dt><dd>" + String(millis() / 1000) + " seconds</dd>";
        page += "<dt>Water level band</dt><dd>" + probeBand() + "</dd><dt>Sensor fault / readiness</dt><dd>" + probeFault() +
                "</dd><dt>Buzzer</dt><dd>" + buzzerStatusHtml() + "</dd><dt>Firmware</dt><dd>water-level-v12-ble</dd></dl>"
                "<p><a href='/probe'>Four probes and calibration</a></p><p><a href='/buzzer'>Buzzer controls</a></p>"
                "<p><a href='/bluetooth'>Bluetooth pairing setup</a></p><p><a href='/'>Refresh status</a></p></section>"
                "<section><h2>Connect to home Wi-Fi</h2><p>Use a 2.4 GHz network. "
                "Wi-Fi details are saved on this device.</p><form method='post' action='/wifi'>"
                "<input type='hidden' name='token' value='" + token + "'>"
                "<label>Network name (SSID)<input name='ssid' maxlength='32' required autocomplete='off'></label>"
                "<label>Wi-Fi password<input name='password' type='password' maxlength='64' autocomplete='off'></label>"
                "<button>Save and connect</button></form></section>"
                "<section><h2>Wireless firmware updates</h2><p><a href='/update'>Open firmware uploader</a></p>"
                "<p>Keep the device powered during an update.</p></section></body></html>";
        sendPage(page);
    });

    server.on("/wifi", HTTP_POST, [] {
        if (!authenticated()) return;
        if (server.arg("token") != token) { server.send(403, "text/plain", "Invalid request token"); return; }
        const String ssid = server.arg("ssid"), password = server.arg("password");
        if (ssid.isEmpty() || ssid.indexOf('\n') >= 0 || ssid.length() > 32 || password.length() > 64 ||
            (!password.isEmpty() && password.length() < 8)) {
            server.send(400, "text/plain", "Check SSID and password length"); return;
        }
        // Store one record atomically, so SSID and password cannot become mismatched.
        const String config = ssid + '\n' + password;
        if (preferences.putString("config", config) != config.length()) {
            server.send(500, "text/plain", "Unable to save Wi-Fi settings"); return;
        }
        pendingSsid = ssid; pendingPassword = password;
        connectAt = millis() + 500; connectPending = true;
        sendPage(pageStart() + "<section><h2>Wi-Fi details saved</h2>"
                 "<p>Wait 15 seconds, then refresh status to find the home network address.</p>"
                 "<p><a href='/'>Open status</a></p></section></body></html>");
    });

    server.on("/update", HTTP_GET, [] {
        if (!authenticated()) return;
        sendPage(pageStart() + "<section><h2>Upload firmware</h2>"
                 "<p>Select the PlatformIO <strong>firmware.bin</strong> for this ESP32 project. "
                 "Keep power connected until it restarts.</p><form method='post' action='/update?token=" + token +
                 "' enctype='multipart/form-data'><input type='file' name='firmware' accept='.bin' required>"
                 "<button>Upload and restart</button></form><p><a href='/'>Back to status</a></p>"
                 "</section></body></html>");
    });

    server.on("/update", HTTP_POST, [] {
        if (!authenticated()) return;
        if (!uploadAuthorized) { server.send(403, "text/plain", "Invalid update request"); return; }
        if (!uploadFinished || Update.hasError()) {
            probePause(false);
            server.send(500, "text/plain", "Update failed; current firmware remains active"); return;
        }
        server.send(200, "text/plain", "Update verified. Restarting; reopen status in 15 seconds.");
        restartPending = true; restartAt = millis() + 1000;
    }, [] {
        HTTPUpload& upload = server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            uploadAuthorized = server.authenticate("admin", DEVICE_PASSWORD) && server.arg("token") == token;
            uploadFinished = false;
            if (!uploadAuthorized) return;
            probePause(true);
            safeOutputs();
            if (!upload.filename.endsWith(".bin")) { uploadAuthorized = false; probePause(false); return; }
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (uploadAuthorized && !Update.hasError() &&
                Update.write(upload.buf, upload.currentSize) != upload.currentSize) Update.printError(Serial);
            delay(1); // Let the idle task service the watchdog during large OTA uploads.
        } else if (upload.status == UPLOAD_FILE_END) {
            if (uploadAuthorized) {
                uploadFinished = !Update.hasError() && Update.end(true);
                Serial.println(uploadFinished ? "Wireless firmware update verified" : "Wireless update failed");
            }
        } else if (upload.status == UPLOAD_FILE_ABORTED) {
            if (uploadAuthorized) Update.abort(); uploadFinished = false;
            probePause(false);
        }
    });
    server.on("/probe", HTTP_GET, [] {
        if (!authenticated()) return;
        String page = pageStart() + "<meta http-equiv='refresh' content='5'><section><h2>Four-probe sensing</h2>" +
            probeStatusHtml() + "<p>Final calibration can wait until installation. Uncalibrated channels remain UNKNOWN.</p>"
            "<p>Capture DRY with all probes clean, dry and separated. For WET, immerse the common and all four level probes "
            "in the same water without touching. Allow 20 cycles (about 100 seconds) per capture.</p>"
            "<form method='post' action='/calibrate'><input type='hidden' name='token' value='" + token + "'>"
            "<label>Calibration channels<select name='channel'><option value='-1'>All four probes</option>";
        for (int i=0;i<PROBE_COUNT;i++) page += "<option value='"+String(i)+"'>"+String(LEVEL_PERCENT[i])+"% / GPIO"+LEVEL_PROBE_PINS[i]+"</option>";
        page += "</select></label><button name='mode' value='dry'>Capture DRY</button>"
                "<button name='mode' value='wet'>Capture WET</button></form>"
                "<p><a href='/'>Dashboard</a> | <a href='/buzzer'>Buzzer controls</a></p></section></body></html>";
        sendPage(page);
    });
    server.on("/api/status", HTTP_GET, [] {
        if (!authenticated()) return;
        server.sendHeader("Cache-Control", "no-store");
        String data=probeStatusJson(); data.remove(data.length()-1);
        data += ",\"firmware\":\"water-level-v12-ble\",\"wifiConnected\":"+String(WiFi.status()==WL_CONNECTED?"true":"false")+
                ",\"buzzer\":\""+buzzerStatusHtml()+"\"}";
        server.send(200,"application/json",data);
    });
    server.on("/calibrate", HTTP_POST, [] {
        if (!authenticated()) return;
        if (server.arg("token") != token) { server.send(403,"text/plain","Invalid request token"); return; }
        String mode=server.arg("mode"), channel=server.arg("channel");
        bool validChannel=channel=="-1" || channel=="0" || channel=="1" || channel=="2" || channel=="3";
        if (!validChannel || (mode!="dry" && mode!="wet") || !probeCalibrate(mode=="wet",channel.toInt())) {
            server.send(409,"text/plain","Capture DRY first and wait for the active capture to finish");return;
        }
        buzzerSetAlarm(0);
        server.sendHeader("Location","/probe");server.send(303);
    });
    server.on("/buzzer",HTTP_GET,[] {
        if (!authenticated()) return;
        sendPage(pageStart()+"<section><h2>Buzzer controls</h2><p>"+buzzerStatusHtml()+"</p>"
            "<p>The LOW alarm enables automatically after restart. Below 20%, it beeps for one minute every ten minutes (0.5 seconds on, 0.5 seconds off), starting when LOW is confirmed. It stops when 20% is confirmed wet. 50%, 80% and 100% use app-configured alarms until acknowledged or dry. "
            "Unknown, faulted or uncalibrated levels suppress automatic alarms.</p>"
            "<form method='post' action='/buzzer'><input type='hidden' name='token' value='"+token+"'>"
            "<button name='action' value='test'>Test two short beeps</button><button name='action' value='measure'>10-second voltage test</button>"
            "<button name='action' value='enable'>Enable automatic alarms</button>"
            "<button name='action' value='disable'>Disable and stop buzzer</button></form>"
            "<p><a href='/'>Dashboard</a></p></section></body></html>");
    });
    server.on("/buzzer",HTTP_POST,[] {
        if (!authenticated()) return;
        if(server.arg("token")!=token) {server.send(403,"text/plain","Invalid request token");return;}
        String action=server.arg("action");
        bool ok=action=="measure"?buzzerTest(true):(action=="test"?buzzerTest():(action=="enable"?buzzerEnable(true):(action=="disable"?buzzerEnable(false):false)));
        if(!ok) {server.send(409,"text/plain","Buzzer unavailable or invalid action");return;}
        server.sendHeader("Location","/buzzer");server.send(303);
    });
    server.onNotFound([] { if (authenticated()) server.send(404, "text/plain", "Page not found"); });
    levelAlarmsBegin();
    buzzerBegin();
    probeBegin();
    cloudBegin();
    nearbyBegin();
    server.on("/bluetooth",HTTP_GET,[] {
        if(!authenticated()) return;
        sendPage(pageStart()+"<section><h2>Nearby Bluetooth</h2><p>In Waterline choose Nearby board, then Waterline-Rooftop. Enter this private code in Android's pairing prompt:</p><h2>"+nearbyPairingCode()+"</h2><p>Anyone with this code can read and control the board nearby. Paired phones reconnect without entering it again.</p><form method='post' action='/bluetooth'><input type='hidden' name='token' value='"+token+"'><button>Forget all phones and change pairing code</button></form></section></body></html>");
    });
    server.on("/bluetooth",HTTP_POST,[] {
        if(!authenticated()) return;
        if(server.arg("token")!=token) { server.send(403,"text/plain","Invalid request token");return; }
        nearbyForgetPhones();server.sendHeader("Location","/bluetooth");server.send(303);
    });
    server.begin();
}

void loop() {
    probeTick();
    buzzerSetAlarm(probeAlarm());
    levelAlarmsObserve(probeLevelMask());
    // Service HTTP only while excitation is off, so a slow client cannot extend it.
    if (probeExcited()) { delay(1); return; }
    nearbyTick();
    if (!restartPending && !uploadAuthorized) cloudTick();
    server.handleClient(); const uint32_t now = millis();
    if (connectPending && static_cast<int32_t>(now - connectAt) >= 0) {
        connectPending = false; WiFi.begin(pendingSsid.c_str(), pendingPassword.c_str());
        pendingPassword = ""; disconnectedAt = now;
    }
    static bool wasConnected = false;
    const bool connected = WiFi.status() == WL_CONNECTED;
    if (connected && !wasConnected) {
        Serial.print("Home Wi-Fi connected. Dashboard: http://"); Serial.println(WiFi.localIP());
    }
    if (connected) disconnectedAt = now;
    else if (now - disconnectedAt >= 30000) startAP();
    wasConnected = connected;
    if (restartPending && static_cast<int32_t>(now - restartAt) >= 0) ESP.restart();
    static uint32_t lastHeartbeat = 0;
    if (now - lastHeartbeat >= 2000) {
        lastHeartbeat = now;
        Serial.printf("Heartbeat: uptime %lu ms; Wi-Fi %s; all four probes\n",
                      static_cast<unsigned long>(now), connected ? "connected" : "disconnected");
    }
    delay(1);
}

