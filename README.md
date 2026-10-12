# Waterline

Water-level monitoring for a household, with an Android app, Cloudflare backend
and ESP32 probe firmware.

- [App setup and development](app/README.md)
- [Android build instructions](app/ANDROID.md)
- [Backend setup](app/BACKEND.md)
- [ESP32 firmware and wiring](ESP32_Water_Level_Detector/README.md)
- [Bluetooth access](app/BLUETOOTH.md)
- [Phone notifications](app/NOTIFICATIONS.md)

The root `.gitignore` covers all projects. Dependencies, build outputs, APKs,
local diagnostics and credentials remain local. Copy the supplied configuration
templates and provide your own credentials before building or deploying.
