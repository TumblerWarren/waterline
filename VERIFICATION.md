# Nearby Bluetooth - version 0.1.14, 11 October 2026

- BLE readings and controls added with passkey pairing and encrypted GATT access. Dedicated offline panel, five-second live refresh and reconnect to a previously paired board when cloud data is unavailable.
- 117 tests, TypeScript, Android build/lint and APK signature pass; app installed. Backend 692f45a6-ca2c-4e21-8020-4f7dc9bea8c8 deployed with newer-board alarm revision reconciliation. Firmware compiles within the existing partition and was USB-flashed with verified hash. Running v12 status and retained calibration checked; cloud uploads HTTP 200. User confirmed passkey pairing and live Bluetooth readings. User confirmed readings continue updating and the buzzer test works with phone Wi-Fi and mobile data off, Bluetooth on. Board-router loss and physical acknowledgement/settings-save tests were not separately exercised. See BLUETOOTH.md.

# Android alarm notifications - version 0.1.13, 11 October 2026

- Notification-ready backend deployed (8aa39577-beb9-4f74-bb5f-656575afb6b3), migration 0007 applied, signed debug APK installed. Android permission granted and user reports Phone registered.
- All 111 tests, TypeScript, Android build/lint and APK signature checks pass. Settings checked at phone width with no horizontal overflow. Firebase Waterline app registered separately in the existing project; no board change.
- Sender provisioning explicitly approved and completed: dedicated waterline-push identity, custom role with only cloudmessaging.messages.create, FCM enabled and Worker secret uploaded. Real FCM HTTP 200 test delivered to the registered phone; user confirmed appearance and sound. Fresh physical probe alarm integration remains to observe; no alarm jobs were queued during verification. See NOTIFICATIONS.md for delivery limitations.

# Individual Probes page - version 0.1.12, 11 October 2026

- Added a separate Probes tab for all four electrodes: raw ADC, filtered median, contact state, calibration captures, wet-minus-dry gap and capture spreads. Stale contact is labeled; preview uses Sample readings. Phone navigation fits six tabs at 390px with no horizontal overflow; card padding visually checked.
- Existing firmware already uploads raw data; backend normalization now validates and retains optional raw ADC values. Legacy samples remain accepted. No board update or credential/encryption change was performed.
- All 105 tests pass, including end-to-end raw value retention and invalid raw ADC rejection. TypeScript, Android assembleDebug/lintDebug and signature verification pass.
- Backend 9e485465-2b07-4ee1-96ff-be8ee8d606ba deployed at waterline.devbuildtool.com. A real D1 query confirms all four probes contain raw, median, water contact and calibration values.
- Android versionCode 13 / 0.1.12 installed successfully on the reconnected phone; installed package version confirmed. Physical phone display of the Probes page remains for the user to check.

APK: releases/waterline-0.1.12-probes.apk

SHA-256: 1847DE1EB17F4189F7E0A37994840F3A3B4F6D10BF520B9AE27DAB902D97390E

# Below-20% configurable alarm - version 0.1.11, 11 October 2026

- Added enable, beep-burst and silence settings for below 20%. Defaults retain one minute of 0.5-second ON/OFF beeping every ten minutes (60-second burst + 540-second silence). It stops on acknowledgement or when the 20% probe becomes wet, and re-arms after wet then dry.
- All 99 tests pass, including low-alarm acknowledgement clearing and legacy three-rule telemetry compatibility. TypeScript, Android build/lint and APK signature checks pass. Firmware compiled and USB-flashed at 57600, hash verified, retaining calibration and Wi-Fi.
- Migration 0006 preserves prior settings/acknowledgements; Worker 9602f17b-1d92-45fe-8140-80cea42c4413 deployed. Android versionCode 12 / 0.1.11 installed on the connected phone.
- Production telemetry confirms desired and board revision 2, low alarm enabled 60/540 and inactive while its probe is wet. The 50% and 80% acknowledgements are retained.
- Physical below-20% triggering and phone editing of this new rule still require a user check. No probes were moved or calibration changed.

APK: releases/waterline-0.1.11-low-alarm.apk

SHA-256: 8C2821B0BF0114A68B923313F61CC37D09A654FF2B12F9EFCC1602246067CE08

# Waterline deployment and Android verification

## Version 0.1.10 alarm status correction - 11 October 2026

- User screenshots confirmed live readings and acknowledged 50/80% episodes. Replaced lingering request-waiting text with board-confirmed acknowledgement status; changed water episodes replace the stale message too. Overview description now lists the actual installed probes, including 80%.
- Added acknowledgement-display checks for pending, confirmed, partially confirmed and changed episodes. All 97 tests passed. Android build, lint and signature checks passed. Installed versionCode 11 / version 0.1.10 on the connected phone. No further firmware or backend update was necessary.
- Production telemetry confirms saved alarm revision 1 matches board revision 1; 50% and 80% acknowledged=true, active=false, and 100% dry. The physical user confirmed sound stopped.

APK: releases/waterline-0.1.10-alarm-status.apk
SHA-256: 70C65C2F2364D01BACDC06127182F623C240699AEA16D2F16E22EC2BA8A4AFA3

## Version 0.1.9 configurable level alarms - 11 October 2026

- Added Owner-editable 50%, 80%, 100% alarm enable/sound/silence settings. Defaults: 10 seconds ON, 50 seconds OFF, repeating until acknowledged or probe dry. Existing below-20% alarm remains. Highest unacknowledged level controls sound; single/all level acknowledgements are available to Owners/Operators from Overview and Alerts.
- Revisioned settings sync through authenticated upload replies and save to board NVS. Episode-scoped acknowledgements have 60-second TTL and persist across restart. Dry re-arms the probe. Unknown/faulted measurements pause sound without clearing acknowledgements; stale commands cannot silence later water episodes.
- 94 tests passed, including timing validation, role guards, settings revision delivery, all-level acknowledgement, board-confirmed completion, changed episodes, expiration/retry, offline checks and malformed alarm telemetry. Firmware compile-time checks cover the 10/50 cadence boundaries. TypeScript, Android assembleDebug/lintDebug and APK signature verification passed.
- Migration 0005_level_alarms.sql applied. Worker version 0a2b3071-2689-414e-bfaa-92798b00f745 deployed at waterline.devbuildtool.com. Firmware water-level-v10-level-alarms USB flash at 57600 succeeded and hash-verified, preserving calibration and Wi-Fi. Actual uploads show default rules and active 50/80% alarms, with 100% dry.
- Installed versionCode 10 / version 0.1.9 on connected phone. Browser preview checked at 390px: all three rule controls render without horizontal overflow; preview editing remains isolated. React review checked hooks, labels, fieldsets, role gating and status messages.
- User reported that acknowledgement stopped the buzzer and supplied live app screenshots confirming 50% and 80% acknowledged, with 100% dry. Actual cloud telemetry subsequently confirmed both episodes acknowledged=true/active=false. Initial 10/50 rules were explicitly provisioned into cloud storage without overwriting app-saved settings; saved revision 1 and board revision 1 match. Acknowledgement rows are temporary and may be cleaned up, so durable telemetry episode state is the final confirmation. Physical dry/wet re-arm and restart persistence still require commissioning tests; they were not simulated on production probes.

APK: releases/waterline-0.1.9-level-alarms.apk
SHA-256: 34B8632729322B21825A70F4C2352805FED85919DA484B45F3D712A68D1F0D81

## Version 0.1.8 mobile buzzer controls - 11 October 2026

- Mobile Test buzzer requests a ten-second sustained hardware test through Cloudflare; Enable/Disable local alarm also supported. Owner/Operator access required. Device-scoped commands expire after 60 seconds, have a 15-second cooldown, and firmware persists IDs before applying them. Queued/started/complete/rejected/expired status is visible. Test disables automatic alarms until re-enabled.
- 84 tests passed, including command delivery/acknowledgement, role checks, duplicate requests, expiry, unsupported firmware, offline devices and rejection of motor commands. TypeScript, Android assembleDebug/lintDebug and APK signature checks passed.
- Applied migration 0004_buzzer_commands.sql; deployed Worker version 7f7b13d8-48ed-481a-897b-7ce1283045bd at waterline.devbuildtool.com.
- First USB flash stopped midway; retry at 57600 succeeded and verified firmware hash. Local device reports water-level-v9-buzzer-cloud, all four saved calibrations intact, 80–100% band and fault None. Actual cloud upload confirms buzzerControlSupported=true.
- Installed versionCode 9 / version 0.1.8 on connected phone. No physical buzzer test was triggered during deployment; audible verification awaits the user pressing Test in the phone app.

APK: releases/waterline-0.1.8-buzzer.apk
SHA-256: 05ED597334416CD4ECB82EB2AD695E60FF3DEEA608D173CF5D53D7E8CA248707

## Version 0.1.7 gap above 500 - 11 October 2026

- User explicitly requested accepting saved WET minus DRY above 500. Removed the 3-times-noise rejection; variation remains informational. Both captures must still be saved and WET must remain below ADC saturation. Twenty-cycle captures, hysteresis and debounce remain.
- Compile-time firmware checks confirm exactly 500 fails, 501 passes and saturated calibration fails. Firmware build succeeded: program 1,017,505 bytes, static RAM 48,616 bytes. USB application flash completed and hash-verified, preserving calibration and Wi-Fi. Local API confirms water-level-v8-gap500.
- Latest saved WET values were 1841/1721/1682/1731 for 100/80/50/20%, with DRY=0 on every channel. All four now report calibrated=true; live states are DRY/WET/WET/WET, band 80-100%, fault None. These are the actual saved values present after reboot, not a new capture initiated by this update.
- Android build/type checks and APK signature verification succeeded. Installed versionCode 8 / version 0.1.7 on the connected phone. Updated result text describes the requested gap rule. No backend or database change was needed; it consumes firmware calibration state.

APK: releases/waterline-0.1.7-gap500.apk

SHA-256: 55EC12B816F95DE20C31F571949EA792F5542ADB250440392889D6306CE4913F

## Version 0.1.6 twenty-cycle capture - 11 October 2026

- Increased calibration from 5 to 20 cycles (about 100 seconds), including local progress, Android progress target and backend validation. Commands now expire after five minutes, with a 120-second request cooldown. Stored DRY calibration is preserved. The original noise/separation rule remains enabled.
- Firmware reports targetCycles, dryNoise and wetNoise; the app displays capture variation. Noise is the full range of the cycle medians, not the current ADC value. All 79 tests, type checks, deployment dry run, firmware build, Android build/lint and APK signature checks pass.
- Deployed Worker aa0e7975-007f-4ba9-94a1-860e277cbf06. Flashed water-level-v7-calibration20 over USB and verified its application hash. Program flash 1,017,517 bytes; static RAM 48,616 bytes.
- At the user's request, started a real all-channel WET capture through the authenticated local endpoint. Observed progress 16/20, then completion 20/20. All saved DRY values and dryNoise were 0. Saved WET / wetNoise: GPIO36 1903 / 1450; GPIO34 1952 / 1313; GPIO33 1898 / 1301; GPIO32 17 / 251. All channels failed quality. GPIO32 showed no clear wet signal; other channels retained excessive capture variation. No stability check was bypassed.
- Android APK signature verified. After the user reconnected the phone, USB installation succeeded; package inspection confirms versionCode 7 / version 0.1.6.

APK: releases/waterline-0.1.6-calibration20.apk

SHA-256: AA3D10CC41D044FE784A387EF5F55DE0927049D90ED9D3BAFEB383DEE28D0F5E

## Version 0.1.5 calibration timing - 11 October 2026

- USB installation succeeded on the user's reconnected phone; package inspection confirms versionCode 6 / version 0.1.5. The physical capture and button behavior still need the user's phone retry.
- Fixed the calibration controls becoming disabled between normal cloud updates. Five-second sampling, ten-second device uploads and ten-second app polling can produce a displayed sample age of about 25 seconds. Cloud measurement availability now uses one shared 30-second allowance in the app and calibration API; device-side and ingest validation still reject measurements stale at their source.
- Physical-preparation checkboxes no longer depend on momentary network freshness. Capture buttons still require the Owner, fresh connected capable hardware and no active capture/request. The page explains stale-update waits and shows the remaining request cooldown.
- All 79 tests pass, including normal sampling/upload/poll delay and rejection beyond the limit. A deterministic duplicate-timestamp test also exposed and fixed a telemetry heartbeat race: updating the latest snapshot now requires the preceding conditional insert to have changed one row.
- TypeScript, deployment dry run, Android build/lint and APK signature verification pass. Worker 6253158c-5d84-4b6b-8b66-8de25f8759bd deployed to waterline.devbuildtool.com; a read-only D1 query confirmed continuing real four-probe telemetry. No firmware changes or calibration captures were required for this update.

APK: releases/waterline-0.1.5-calibration-timing.apk (6,324,207 bytes)

SHA-256: B7C4178B774AFB4CD64479750276C45104B81C75333384A1916D879C44D8CF8E

## Version 0.1.4 four-probe calibration - 11 October 2026

- Added the user's fourth probe: 80% on GPIO33. Firmware reads 20/50/80/100%, schema 3 telemetry includes calibration values and capture progress, and the app distinguishes 50-80% from 80-100%. Legacy three-probe uploads/history retain their original meaning.
- Calibration version 3 intentionally requires fresh captures on all four probes after changed common-electrode loading. Wi-Fi settings remain saved.
- Added an Owner-only Calibration page with DRY/WET preparation confirmations, live per-probe values, progress and separation quality. User confirmed that all four probes and controls appear on the installed phone.
- Migration 0003_calibration.sql applied remotely. Deployed Worker a7d85af8-7d03-450f-8b1a-79998721c4a5 to waterline.devbuildtool.com. Commands are household/device scoped, require fresh capable readings, expire after two minutes and enforce one pending request plus a 45-second cooldown. Device acknowledgements and capture flags distinguish queued/started/complete/rejected/expired. Complete means capture finished, not guaranteed separation quality.
- Firmware hands commands from the HTTPS task to the main loop and persists command IDs before capture to prevent replay across reboot or retries. Reboot interruptions are rejected. Automatic alarms remain suppressed for unknown/uncalibrated readings. Motor and remote buzzer delivery remain unavailable.
- All 76 tests and TypeScript checks pass. Tests cover all four-probe bands, malformed/missing GPIO33, permissions, physical confirmation, capability/freshness, DRY prerequisites, duplicates, delivery/acknowledgement/progress/completion, expiry and reboot rejection. Android build and lint pass; React review found stable hooks, probe keys, accessible confirmation labels and fresh-connection guards.
- Firmware build: program 1,016,777 bytes (77.6%); static RAM 48,376 bytes (14.8%). Application flash completed and hash-verified. Local API confirms water-level-v6-calibration and four calibration channels. Read-only remote D1 query confirms four probes and calibrationSupported=true from the actual ESP32.
- Signed debug APK installed successfully; package inspection confirms versionCode 5 / 0.1.4. The user confirmed the Calibration page on the physical phone. Physical DRY/WET captures have not been performed yet, so live command execution and resulting calibrated levels still require commissioning through that page. No synthetic production reading or capture command was submitted.

APK: releases/waterline-0.1.4-calibration.apk (6,324,095 bytes)

SHA-256: F633A6DB649B8C3C3E909F7AE2F0312FEE36FB6E5AC0D05037C624F136CE7F27

## Version 0.1.2 telemetry — 11 October 2026

- Deployed the telemetry API to `https://waterline.devbuildtool.com`, Worker version `4b6de061-4f4a-405b-89e0-38754d52a2bb`. The Custom Domain is preserved in source configuration.
- Applied `0002_device_telemetry.sql` and provisioned `rooftop-esp32` for `home` with a generated 256-bit credential. Only its hash is stored in D1; the firmware header is ignored. No fabricated production readings were uploaded.
- All **61 automated tests**, TypeScript, formatting and deployment dry run pass. Tests exercise credential isolation/revocation, per-household readings, offline detection, duplicate/rate rejection, malformed data, timestamp expiry and unknown/fault states. Live health, Android CORS, access protection and Auth0 discovery checks pass on the custom domain.
- Firmware `water-level-v4-cloud` compiles successfully: 998,165 bytes of program flash (76.2%), 48,200 bytes of static RAM (14.7%). HTTPS work runs in a separate task with certificate validation and an SNTP clock, keeping local sensing and alarms independent of network waits.
- After two failed wireless transfers and unsuccessful automatic USB bootloader entry, cold power-on with BOOT held allowed manual flashing. Bootloader, partition table, boot selection and application were written and hash-verified; NVS was preserved. Local status confirms the new firmware, connected Wi-Fi and retained three-probe calibration. No soldered wiring changed. Wireless update reliability remains unverified after the new updater yield.
- Serial diagnostics confirmed repeated cloud HTTP 200 responses while probe cycles and heartbeat logs continued. A remote read-only D1 query confirmed 14 genuine samples, a fresh contact timestamp and band `high` (50–100%), calibrated with no fault. These prove device-to-cloud transport; actual Android household display still needs a phone check.
- Android versionCode 3 / version 0.1.2 includes the custom domain, ten-second foreground polling, visible reading-age updates and bounded network waits. The debug build is for testing, not Play Store publication. Push notifications, self-service pairing and remote device commands remain unavailable.
- Final Android build and lint succeeded. APK signature verification passed, and USB installation on the connected phone succeeded. Package inspection confirms versionCode 3 / version 0.1.2.

APK: `releases/waterline-0.1.2-telemetry.apk` (6,502,747 bytes)

SHA-256: `9FB6C43CA55469AAF8C6F36636B7C2705DEDB5FBC89FB699FC12E9FEA225CEBF`

## Version 0.1.1 and cloud backend — 11 October 2026

- Installed version 0.1.1 on the connected physical phone. The user subsequently confirmed successful login after correcting Auth0 API application access.
- Investigated the phone's home-screen fetch failure: Android logs showed a failed CORS preflight, but public health requests also returned Cloudflare HTTP 404 / error 1042 before the API ran. Reapplied the backend triggers with the supported Wrangler command; public health, access protection, Android CORS and Auth0 discovery checks then passed. No APK or CORS source change was needed. Authenticated home-screen access still needs a phone retry.
- Deployed `waterline-api` to `https://waterline-api.sdsand81.workers.dev`, version `8f295bd4-db4b-4da8-bb82-56a106d86982`. No web interface was published.
- Created D1 database `waterline` in APAC, applied the household migration and provisioned the supplied Auth0 account as Owner. A remote read-only query confirmed the record.
- Live checks verified health, 401 for absent/invalid tokens, 404 outside API routes, Android CORS, rejection of untrusted origins and custom-domain Auth0 discovery/JWKS. These do not substitute for a real authenticated user request.
- All **49 automated tests** pass. TypeScript, deployment dry run and formatting checks pass.
- Official Auth0 Android SDK **3.21.0** is integrated through a registered native Capacitor plugin. The merged manifest has the SDK RedirectActivity at `/android/com.waterline.household/callback`; MainActivity handles only `join` invitation links.
- Native sessions use SecureCredentialsManager, Android Keystore-backed encryption and SDK renewal. JavaScript receives profile fields and transient API access tokens, never refresh or ID tokens. Credential operations are serialized; changing the client/domain/audience invalidates old credentials.
- Android build and lint completed successfully. Lint reports 0 errors and 28 existing/general warnings, mainly launcher icon/resource suggestions. Native unit-test tasks completed; no real Auth0 browser/session instrumentation was run.
- The final APK includes the confirmed API audience, custom Auth0 domain and deployed HTTPS cloud origin. All **13 bundled interface files** match current Android assets byte for byte.
- APK signature verifies and its debug certificate SHA-256 matches the fingerprint supplied for Auth0. Package `com.waterline.household`, versionCode 2, version 0.1.1, minimum API 24 and target API 36.

APK: `releases/waterline-0.1.1-auth0.apk` (6,876,103 bytes)

SHA-256: `55A965027E185AE299CBCB829AB0D95F891E47BB92DB48C45CC75ED790784506`

Still required: real Google login/logout on Android, process restart/session restoration, token renewal and authenticated household/invitation checks. The user confirmed API creation and Native User-Delegated Access; offline access and refresh-rotation settings were documented but not inspected through an authenticated Auth0 dashboard. Device telemetry, phone push delivery and motor commands are still unavailable. No firmware or electrical wiring changed.

## Earlier version 0.1.0 preview

Verified locally on 11 October 2026. Version 0.1.0, package `com.waterline.household`.

- Android debug APK built successfully with JDK 21 and Android SDK 36. Its signature verifies; minimum Android version is 7 / API 24, target API 36.
- All 12 bundled interface assets match the latest Android build byte for byte.
- TypeScript checks and formatting checks pass. All 45 automated checks pass across token validation, household permissions, invitation lifecycle, reading freshness and Android configuration/CORS.
- Cloudflare deployment bundle validates in a dry run. The deployment guard correctly stops publication while Auth0 configuration and the real database ID are missing. No cloud deployment was performed.
- The local server returns health status successfully, rejects unauthenticated household access, accepts the Android origin preflight and rejects unknown origins.
- The shared interface was checked in the browser at phone width, including preview scenarios, role restrictions, buzzer simulation, invitations, preferences, alert acknowledgement and clearing unsaved settings when resetting the preview.

The APK has not been installed or exercised on a physical Android phone or emulator. Native back-button behavior, sign-in/logout callbacks, invitation opening and token renewal need an actual Android test after Auth0 and the backend are configured.

Sample data and simulated buzzer actions are explicitly labeled in preview mode. The real backend currently has no ESP32 transport, readings/history storage, phone push delivery or motor command delivery. No device firmware or electrical wiring was changed for this app work.

APK: `releases/waterline-0.1.0-preview.apk`

SHA-256: `E3978D7647F82BD17F902BDE5E828DAF69C8D5C6D4532FD8E0DB11A8174023BE`





