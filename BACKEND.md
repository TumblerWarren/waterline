# Waterline cloud backend

Deployed on 11 October 2026 to the connected Cloudflare account.

- Worker: `waterline-api`
- HTTPS origin: `https://waterline.devbuildtool.com`
- Health: `https://waterline.devbuildtool.com/api/health`
- D1 database: `waterline`, region APAC
- Database ID: `3fd3d55d-31f0-4bf9-af07-330d047e15d3`
- Auth0 issuer: `https://auth.devbuildtool.com/`
- Audience: `https://waterline.devbuildtool.com/api`
- Initial deployment version: `8f295bd4-db4b-4da8-bb82-56a106d86982`

The dedicated backend uses `wrangler.backend.jsonc`. It publishes the API only, so the optional web interface can be designed separately. Requests outside `/api/` return 404. `wrangler.jsonc` remains the optional web application's development/deployment configuration; its production web Client ID is still unconfigured. Do not use the web deployment command to update this backend.

The household and device migrations are applied to the remote database. The supplied Auth0 account is provisioned as the Owner of `Our home`; public signup does not assign ownership. Family invitations, role enforcement, preferences and audit history are implemented. The ESP32 upload endpoint and real reading/history storage are implemented. Phone push delivery and device commands are not implemented yet.

## Device readings

The ESP32 sends `POST /api/device/telemetry` over certificate-verified HTTPS every ten seconds. Its private 256-bit credential grants upload access only; D1 stores only its SHA-256 hash. Auth0 user tokens cannot upload telemetry. The credential's database record fixes the household; the payload cannot choose a household. Provisioning uses `scripts/provision-device.mjs`, which writes an ignored private firmware header and hash-only SQL. Run it once per device; do not replace an existing key without planning rotation. Disable a device by setting its `enabled` field to 0 in D1.

Uploads have bounded JSON, exact probe/pin validation, short timestamp validity, sample deduplication and atomic per-device throttling. Faulted or uncalibrated readings remain unknown. The latest snapshot uses cloud receipt time for last contact and device measurement age for freshness. Heartbeats older than 30 seconds are offline. History retains 24 hours in D1 and returns the newest 120 points. Expired history is pruned during uploads. No sample data is written to the production database.

The firmware's HTTPS work runs in a separate task with bounded timeouts and a single newest-snapshot queue. Local probe sampling and the existing LOW buzzer schedule keep running without internet. An SNTP clock is required for TLS and upload timestamps; clock synchronization failure prevents uploads. Public CA roots are generated using `scripts/configure-device-ca.mjs`; review and refresh trust roots if the backend's certificate chain changes.

The Android app polls household data every ten seconds while visible and refreshes when brought back to the foreground. The Owner can use POST /api/calibration with mode dry/wet and prepared=true. Fresh schema 3 readings are required; WET requires DRY on every probe. Commands are device-scoped, expire after five minutes, and have a 120-second request cooldown. The next upload response delivers the queued command; the device persists its ID before applying it in the main loop and reports progress. Duplicate requests cannot replay captures. Migration 0003_calibration.sql stores command status; the household snapshot includes the latest status. The local ESP32 dashboard remains available. Owners and Operators can request POST /api/commands actions buzzer.test, buzzer.enable and buzzer.disable. Migration 0004_buzzer_commands.sql stores device-scoped requests with a 60-second expiry and 15-second cooldown. Capable firmware receives the command in X-Waterline-Buzzer on its next authenticated upload, persists the ID before execution, and acknowledges it through telemetry. Ten-second tests disable automatic alarms until explicitly re-enabled. Expired commands and previously applied IDs are never replayed. Household snapshots include buzzerCommand status. Remote motor delivery remains unavailable.

## Update the backend

```powershell
npm run cf:types
npm test
npm run backend:check
npm run backend:deploy
```

`backend:check` validates the target, public Auth0 settings, database ID, types and deployment bundle without publishing. `backend:deploy` performs those checks and publishes `waterline-api` to the configured account. Update the database with `npm run db:migrate:remote` only when a reviewed migration is needed. Owner provisioning SQL stays in ignored `.wrangler/owner.sql` rather than source control.

## Live verification

```powershell
node scripts/verify-backend.mjs https://waterline.devbuildtool.com
```

The remote checks verify health, 404 outside API routes, 401 for absent/invalid tokens, Android CORS, rejection of untrusted origins, and Auth0 custom-domain issuer/JWKS discovery. A read-only D1 query confirmed the Owner record. Authenticated user access still requires an actual Google login through the Android app; no user token or password was requested or fabricated.

Android's `.env.android.local` now contains the confirmed Audience and deployed HTTPS origin. Its native SDK callback and logout URL are:

```text
com.waterline.household://auth.devbuildtool.com/android/com.waterline.household/callback
```

Auth0 API User-Delegated Access for the Native application was confirmed by the user. Enable the API's **Allow Offline Access**, and enable the Native application's **Refresh Token grant** and **Refresh Token Rotation**, to support renewal. The SDK handles browser authentication, encrypted credentials and renewal. The backend validates RS256, the custom-domain issuer, audience and token expiry, then checks the household role.

The user-added custom domain is preserved in `wrangler.backend.jsonc` as a Custom Domain route. The original workers.dev endpoint remains available. The API audience stays unchanged.

## Configurable level alarms

Migration 0005_level_alarms.sql stores per-device desired rules and episode-scoped acknowledgements. POST /api/alarms/settings is Owner-only and accepts all four rules (20,50,80,100): enabled, onSeconds (1–60), offSeconds (1–3600). Below 20% triggers on a dry 20% probe, defaulting to a 60-second beep burst followed by 540 seconds silence. Higher rules trigger wet, defaulting to 10 seconds sound / 50 seconds silence. Migration 0006_low_alarm.sql preserves existing settings and acknowledgements while adding the low rule and incrementing the revision. Saving offline is supported; revisioned rules are repeatedly delivered in X-Waterline-Alarms until the board reports the revision. The firmware persists settings in NVS before acknowledging.

POST /api/alarms/ack is Owner/Operator-only, requires fresh device contact and current active episode IDs. Up to four alarms may be acknowledged together. Requests expire after 60 seconds, are delivered through X-Waterline-Alarm-Ack, and are complete only after telemetry reports the same episode acknowledged. A changed episode rejects stale acknowledgements. Firmware stores wet/acknowledged episode state across restarts; a confirmed dry probe resets it, and becoming wet generates a new episode. Unknown/faulted readings pause sound without resetting acknowledgements. The highest unacknowledged enabled wet level controls the sound rhythm. Below-20% acknowledgements clear when its probe becomes wet; another dry transition re-arms it. Its burst uses 0.5 seconds ON / 0.5 seconds OFF. The v2 settings header delivers four rules in ascending level order. Global Disable/test can mute automatic alarms. Phone acknowledgement needs connectivity; board scheduling does not.
