# Android alarm notifications

Android 0.1.13 / versionCode 14 includes @capacitor/push-notifications 8.1.3 and Firebase application com.waterline.household in project gen-lang-client-0607918582. Settings provides permission/registration and disable controls. The Water-level alarms channel has high importance, default sound and vibration, in foreground and background. Tapping opens Overview. Android volume, channel settings, Do Not Disturb, force-stop and network connectivity affect delivery. It is a sound notification, not a continuous ringtone or guaranteed alarm clock.

Firebase Android configuration is ignored at android/app/google-services.json. The server credential must be a Cloudflare secret named FCM_SERVICE_ACCOUNT containing a dedicated Google service-account JSON, never included in the Android app or committed. Sender setup was explicitly approved and completed on 11 October 2026. FCM_SERVICE_ACCOUNT is deployed on waterline-api; the temporary local private key was removed after verification.

Completed approved scope: enable fcm.googleapis.com in gen-lang-client-0607918582; create dedicated service account waterline-push; create/bind custom role WaterlineFcmSender containing only cloudmessaging.messages.create; generate its private key and store it as the Waterline Worker secret. The role permits sending messages within this shared Firebase project, so protect the key and do not reuse another app's service account.

Backend API: authenticated household members may POST /api/push/register with installation UUID and FCM token, or DELETE the same endpoint to disable their own installation. GET /api/push/status reports sender readiness. Cross-account token/installation takeover is rejected. Logout unregisters Firebase and removes the subscription; membership removal cascades subscription deletion. Registration tokens are private delivery addresses stored in D1; logs do not contain them.

Migration 0007_push.sql implements per-phone, per-device, per-level, per-episode deduplication. Only fresh, calibrated, non-faulted readings with global buzzer enabled and a current active unacknowledged alarm enqueue messages. Registered phones receive one alert for each current/new episode, not each buzzer cycle. Highest-priority audible board scheduling stays on the ESP32. Queue processing rechecks membership and current alarm state, uses a lease, retries on later telemetry or minute cron, and stops after five attempts. Invalid FCM tokens are removed. Google acceptance is not proof of sound heard. Ambiguous network failures can produce duplicate delivery despite deduplication; notification tags replace prior alerts for a level. Already-delivered notifications cannot be recalled when the board alarm clears.

Delivery uses FCM HTTP v1 with short-lived Google OAuth tokens derived from the dedicated secret. The board initiates telemetry; ctx.waitUntil keeps push delivery out of its response path. No ESP32 firmware update is required.

Verification: 111 tests pass, including household isolation, raw probe data, queued alarm deduplication, muted suppression, mocked OAuth/FCM delivery and cancellation after acknowledgement. Android build/lint and APK signature verify. Version 0.1.13 is installed and Android POST_NOTIFICATIONS is granted. Backend 8aa39577-beb9-4f74-bb5f-656575afb6b3 and migration 0007 deployed. User reports Phone registered. A real FCM HTTP v1 test returned HTTP 200 using the dedicated send-only account and registered phone. The user confirmed the notification appeared and sounded. The Worker secret and single-permission custom role were verified. No current alarm delivery jobs were queued during this check, so a fresh physical probe alarm remains the separate board-to-cloud integration check.

APK: releases/waterline-0.1.13-notifications.apk
SHA-256: 0BCDF4BD5AB80E7DE6D544A0FF2FF58BE4EDE8F258A48DE8CB2E88092FA73383

References:
- https://capacitorjs.com/docs/apis/push-notifications
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
- https://firebase.google.com/docs/cloud-messaging/android/receive-messages

