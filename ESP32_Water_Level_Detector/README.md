# ESP32 Water Level Detector

Current firmware: **water-level-v3**, with three ADC1 probes.

| Level | GPIO |
|---|---|
| 100% | 32 / P32 |
| 50% | 34 / P34 (previously 60%) |
| 20% | 36 / SVP |

GPIO33 and GPIO35 are no longer sampled. With power unplugged, disconnect the
unused electrode circuits and place the GPIO34 electrode at the 50% height.
Common remains GPIO14 through 100k; buzzer remains GPIO23 through 1k to the
BC547B base, with a 10k base-to-GND resistor. Emitter to GND, collector to
active buzzer negative, buzzer positive to regulated 5V. Each sensing circuit
retains 100k series, 1M pull-down and 22nF capacitor. Never apply 5V to GPIO/3V3.

## Current controls and behavior

- Dashboard: http://192.168.0.119/
- Three probes and calibration: /probe
- Active buzzer test, 10-second voltage test, alarm enable and stop: /buzzer
- Wireless update: /update
- Authenticated JSON: /api/status

Detection retains five-second cycles, 500ms settling, 15-reading median filtering,
relative 40%/60% hysteresis and three-cycle debounce. The common electrode is
high impedance between cycles and before HTTP or calibration writes. A wet upper
probe above a confirmed dry lower probe is a fault. Unknown, uncalibrated,
saturated or stale channels suppress valid level bands and automatic alarms.

Bands: below 20% (LOW); 20% to below 50%; 50% to below 100%; at or above the
100% electrode (FULL). These are stepped bands rather than continuous percentages.

Final calibration can wait. Previous five-probe calibration is invalidated because
changing the number of wet probes changes the load through the common resistor.
For final calibration, capture DRY with sensing electrodes clean, dry and separated,
then WET with all three plus the common immersed in the same water without
contacting each other. Each capture uses five cycles, up to 25 seconds. The page
supports all three together or individual channels. Capturing DRY invalidates WET.

The active buzzer uses direct HIGH/LOW drive, controlled by an independent timer.
LOW: one minute of beeps every ten minutes, starting when LOW is confirmed
(500ms ON, 500ms OFF). FULL is silent; its buzzer alarm has been removed. Alarms enable automatically after reboot. Diagnostic tests and the manual stop
button disable them until re-enabled or restarted. LOW stops when the 20% probe is confirmed wet. Normal or unknown levels remain
silent. Three-cycle confirmation can take up to approximately 15 seconds. The voltage test stops automatically at 10 seconds. Actual audible buzzer
operation remains unresolved; GPIO23 HIGH was measured at 3.30V, while the user
reported 0.177V base-to-emitter. Continue transistor-path measurements separately.

## Current verification

PlatformIO build passed, application size 816737 bytes (62.3% of slot).
Wi-Fi deployment and API mapping are checked after upload; snapshot is
`three-probe-verification.json`. Final tank/cable calibration remains pending.
No relay, pump, motor starter, or mains interface is implemented.

The following sections describe historical development and earlier one/five-probe
tests. Their old pin mapping and firmware versions are superseded by the table above.

## Environment findings

- Connected USB interface: CP2102, USB VID 10C4 / PID EA60.
- Driver installation verified: Silicon Labs CP210x on COM11, Windows error code 0 (OK).
- Downloaded CP210x driver package 11.6.0 extracted to `../drivers/CP210x`.
- Driver catalog signature verified as valid (Microsoft Windows Hardware Compatibility Publisher).
- Initial pnputil installation lacked administrator privileges; subsequent user installation succeeded.
- Installed signed driver: 11.6.0.420, INF oem192.inf.
- Python 3.14 responds; the Python launcher lists 3.10, but local environment creation
  with `py -3.10` failed with `No installed Python found`. The operational CLI uses
  PlatformIO's own Python environment instead.
- PlatformIO Core 6.2.0 operational; Espressif32 platform pinned to 7.1.3.
- Heartbeat firmware compiled and uploaded successfully at 115200 baud to COM11.
- Upload identified ESP32-D0WD-V3 revision 3.1 and verified written flash hashes.
- Serial verification passed after reset: initialization and heartbeats at 2000,
  4000, 6000, and 8000 ms. Evidence: `heartbeat-serial-log.txt`.
- Probe, buzzer, and Wi-Fi hardware tests have not been performed.
- Wi-Fi setup firmware compiled, USB upload succeeded, and startup/access-point
  creation were verified in `wifi-startup-serial-log.txt`. First boot has no saved
  Wi-Fi config; the Preferences `config NOT_FOUND` message is expected then.
- Home network connection, web page access, and actual wireless firmware upload
  subsequently verified on SANDIP at 192.168.0.119: HTTP 200 dashboard, HTTP 200
  wireless application upload, and probe-test-v1 dashboard after restart.
- Live GPIO36 readings verified via `/probe`: first observed raw 3277 / median
  3164, uncalibrated. This does not prove dry/wet detection or wiring correctness.
  Evidence: `wireless-probe-test-log.txt`. Physical calibration remains pending.

## Driver installation

Official source: https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers

Open Device Manager, find CP2102 USB to UART Bridge Controller, choose Update driver,
Browse my computer for drivers, and select the extracted `drivers/CP210x` folder.
Include subfolders and approve the Windows administrator prompt.
Alternatively, run an administrator PowerShell:

```powershell
pnputil /add-driver "F:\Projects\IoT\Water-Level\drivers\CP210x\silabser.inf" /install
```

COM11 was verified for this board. Rediscover the port if Windows changes it.
Bluetooth COM ports are not the ESP32.

## First firmware test

PlatformIO environment: nodemcu-32s, Arduino, upload and monitor at 115200 baud.
Build with `pio run`; upload with `pio run -t upload --upload-port COMx`, using the
discovered port. Monitor with `pio device monitor --port COMx --baud 115200`.
Expected output: initialization message and heartbeat every two seconds.

The IDE-independent CLI can be invoked from PowerShell in this project folder:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m platformio run
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m platformio run -t upload
& "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m platformio device monitor
```

Close the serial monitor before uploading to avoid port conflicts.
The Microsoft C/C++ extension's displayed license restriction applies to its use
in Antigravity; these CLI build/upload commands do not depend on that extension.

## Planned wiring

| Probe | GPIO |
|---|---|
| 100% | 32 |
| 80% | 33 |
| 60% | 34 |
| 40% | 35 |
| 20% | 36 / SVP |
| Common excitation | 14 |
| Buzzer transistor drive | 23 |

Each level probe: probe wire through 100 kΩ to ADC node; 1 MΩ and 100 nF from
that node to GND. Common electrode through 100 kΩ to GPIO14. GPIO34–36 are
input-only. All sensing pins are ADC1.

Buzzer: GPIO23 through 1 kΩ to BC547B base, 10 kΩ base to GND, emitter to GND,
collector to buzzer negative, buzzer positive to regulated 5V. Verify the actual
transistor pinout and buzzer current against component ratings. A magnetic buzzer
requires a flyback diode across it (cathode to +5V, anode to collector).
Keep buzzer disabled until wiring is verified.

Power through ESP32 USB-C. Never apply 5V to GPIO or the 3V3 pin.
No relays, pump control, motor starter, or mains connections.

## Verification order

1. Driver and ESP32 COM port.
2. Heartbeat build and upload.
3. Actual serial heartbeat output.
4. Common electrode plus one sensing probe, with dry/wet calibration.
5. All five probes, filtering, hysteresis, debounce, and inconsistent-state faults.
6. Verified transistor circuit and non-blocking buzzer patterns.
7. Wi-Fi dashboard, with credentials excluded from version control.

Compilation alone does not establish any hardware test result.

## Wi-Fi setup and wireless updates

1. Initially upload this Wi-Fi firmware over USB once.
2. On your phone, join `Water-Level-Setup`. Read the password in
   `WIFI_ACCESS_PRIVATE.md` (excluded from version control).
3. Stay connected even though this network has no Internet. Open
   `http://192.168.4.1`; log in as `admin` with the same password.
4. Enter your home **2.4 GHz** SSID and password. Wait 15 seconds and refresh
   the status page to find the home network IP address.
5. Rejoin your home Wi-Fi and open that IP address in a browser. Your computer
   and ESP32 must be on a network that permits communication between devices.

Home Wi-Fi credentials are stored in ESP32 NVS, never printed or embedded in
source. Setup Wi-Fi remains available for this boot if it was started; on the
next boot the device tries saved Wi-Fi first. If it cannot connect for 30 seconds,
the password-protected setup network becomes available again.

After setup, power the ESP32 from a regulated 5V USB supply near the tank.
It does not need to be plugged into the computer for normal operation.

For subsequent updates, build with `platformio run`, open `/update` on the
ESP32 dashboard, and select `.pio/build/nodemcu-32s/firmware.bin`.
Upload the application binary only, not bootloader.bin or partitions.bin.
Keep power connected and wait for the device to restart. Later firmware must
retain Wi-Fi setup and the update handler to preserve wireless access.
USB remains the recovery method if firmware cannot boot or wireless updates fail.
This uploader uses the Arduino Update library and the default OTA partitions;
it is a browser upload rather than PlatformIO's espota protocol.

Admin pages and updates require the private device password; mutating requests
also require a token generated at each boot. Use on your private local network
only, without port forwarding: the dashboard uses HTTP, not TLS.

For a fresh checkout, copy `include/wifi_secrets.example.h` to
`include/wifi_secrets.h` and choose a unique 12-63 character password before
building. Preserve the existing local header for updates to this device.

References: Arduino ESP32 OTA web update documentation:
https://docs.espressif.com/projects/arduino-esp32/en/latest/ota_web_update.html

## One-probe calibration

The device was located at `http://192.168.0.119` on SANDIP by matching its
known MAC address; the authenticated Wi-Fi dashboard returned HTTP 200.
The setup SSID normally disappears after a successful home-network boot.
The address may change after DHCP renewal; consider a router DHCP reservation.

Open `/probe` for GPIO36 readings and calibration. The page refreshes every
five seconds. Login remains `admin` with the private device password.

1. Keep electrodes clean, dry, separated, and untouched. Select Capture DRY.
   Wait for all five cycles (up to 25 seconds).
2. Immerse both electrodes in the same water without touching each other.
   Select Capture WET and wait for all five cycles.
3. A valid calibration requires the wet median to exceed the dry median by at
   least the configurable minimum gap and more than three times the observed
   calibration spread. Otherwise the page reports unknown / insufficient separation.
4. After calibration, move only the level electrode into and out of the water
   while the common stays immersed. Allow three cycles (up to 15 seconds) for
   a state change. Record dry and wet readings; compilation is not a sensor test.

Measurements excite GPIO14 for 500 ms settling plus 15 ADC readings spaced
2 ms apart. Excitation is high impedance between cycles, repeated every five
seconds. HTTP is serviced only while excitation is off so a slow client cannot
hold the electrode energized. OTA pauses sensing and keeps excitation off.

The median rejects isolated spikes. Wet/dry hysteresis boundaries use 60%/40%
of the calibrated dry-to-wet gap; three consistent cycles confirm a change.
Calibration survives restart. Capturing DRY invalidates the previous WET
calibration; capture WET again afterward. Raw value, median, calibration values,
boundaries, and measurement age are displayed. Near-saturation ADC values and
stale measurements are reported as faults. The minimum gap is a signal-quality
check, not a guaranteed wet threshold. Validate using the actual water and cable.

A single probe only indicates below or at/above its electrode. Five-channel
consistency faults, tank bands, 10 m cable validation, and buzzer patterns are
still pending.

### Observed one-probe hardware results

User completed dry and wet calibration: dry 0, wet 3251; derived hysteresis
boundaries 1300 / 1950. Authenticated dashboard reported WET with median 3303.
After the user removed the level electrode while retaining the immersed common,
consecutive dashboard checks reported DRY with median 0. A raw spike of 94 in
one check did not change the median or state. See `probe-dry-transition-log.txt`.
This verifies the observed wet-to-dry response for this one probe setup; it does
not validate the other channels, long cable, buzzer, or full tank installation.
