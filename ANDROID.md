# Waterline for Android

Android is the primary platform. Capacitor bundles Waterline's interface locally, with a native bridge to the official Auth0 Android SDK. The cloud backend runs separately on Cloudflare. Package ID: `com.waterline.household`.

## Updated test build

Version 0.1.14 uses `https://waterline.devbuildtool.com` and automatically refreshes real cloud readings while the app is visible. Native Auth0 sign-in and encrypted sessions remain configured. Your account is provisioned as household Owner. Preview remains available with clearly labeled sample readings. See [BACKEND.md](BACKEND.md) for device telemetry and cloud deployment.

The Calibration page guides four-probe DRY/WET captures, shows cloud command delivery and live per-probe calibration values and capture variation, with progress out of 20 cycles, and requires physical-preparation confirmation. Only the household Owner can request captures.

Updated APK: `releases/waterline-0.1.14-bluetooth.apk`. This is a debug build for testing, not a Play Store release. Installation is performed only for the user's requested connected phone. See [VERIFICATION.md](VERIFICATION.md) for checks and limitations.

Requirements: Node 24, JDK 21 and Android SDK 36. Minimum Android version is 7 / API 24. This machine uses SDK `E:\Program\android_sdk` and JDK `C:\Users\sdsan\.jdks\openjdk-21.0.2`.

```powershell
npm ci
npm run android:sync
$env:JAVA_HOME = 'C:\Users\sdsan\.jdks\openjdk-21.0.2'
Set-Location android
.\gradlew.bat assembleDebug --no-daemon
```

Run these steps sequentially. `android:sync` generates native public configuration from the same Android environment Vite uses and copies current interface assets. Run it before Gradle after any interface or configuration change. Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Auth0 setup

Use the existing **Native** application, with Token Endpoint Authentication Method **None**. No client secret belongs in this app. The SDK is pinned to `com.auth0.android:auth0:3.21.0`, the stable 3.x line compatible with Android 7; SDK 4.x requires Android 8.

For this project's custom domain, put this exact value in both **Allowed Callback URLs** and **Allowed Logout URLs**:

```text
com.waterline.household://auth.devbuildtool.com/android/com.waterline.household/callback
```

The SDK uses `auth.devbuildtool.com` for authorization, token renewal and logout. Its RedirectActivity handles the callback, PKCE and state validation. MainActivity handles only household invitation links. There is no JavaScript OAuth callback handler on Android. The React SDK remains for a separately configured optional browser app; its callback is the browser origin.

Create the API under **Applications → APIs**:

- Name: `Waterline API`
- Identifier: `https://waterline.devbuildtool.com/api` (creation confirmed)
- Signing algorithm: **RS256**
- User-delegated access: **Per-app authorization**
- Client access: **No apps allowed**

In **Application Access**, authorize the Waterline Native application for **User-Delegated Access**, leaving Client Access disabled. In API Settings, enable **Allow Offline Access**. Enable Refresh Token Rotation on the Native application; ensure its Refresh Token grant is enabled. Family roles are enforced by Waterline's database, so no custom API permissions or Auth0 roles are needed for this implementation.

The API identifier does not need a working website. It is the Audience and can differ from the eventual Cloudflare server address. After creation, put its exact value in `.env.android.local`:

```dotenv
VITE_AUTH0_DOMAIN=auth.devbuildtool.com
VITE_AUTH0_CLIENT_ID=your-existing-native-client-id
VITE_AUTH0_AUDIENCE=https://waterline.devbuildtool.com/api
VITE_API_BASE_URL=https://waterline.devbuildtool.com
```

The API URL is the deployed Cloudflare HTTPS origin, without a path or credentials. The Worker validates the same custom-domain issuer and audience. Changing the client, domain or audience clears old native credentials and requires a fresh login, so tokens from an earlier configuration cannot be reused.

Auth0's **SecureCredentialsManager** encrypts credentials with Android Keystore-backed keys and renews expired access tokens through the SDK. Refresh and ID tokens never pass to JavaScript. Only an access token needed for an API request enters JavaScript memory; it is not placed in browser storage. Credential operations are serialized so an in-flight renewal cannot restore a session after logout. Local credentials are cleared even if browser logout is cancelled; the app explains that the browser session may remain.

The custom callback scheme does not require a certificate fingerprint. Auth0's Android application settings can include the debug SHA-256 fingerprint for future verified App Links:

```text
42:EF:12:9C:5C:C3:66:F9:15:EA:FF:EF:28:0A:83:5E:D2:47:EE:33:12:E2:1E:BF:BB:BA:91:A5:B9:8E:36:F9
```

A production release needs its own signing certificate and corresponding Auth0 settings. Verified HTTPS App Links can replace the custom scheme once the release certificate and domain are ready.

Android invitations use `com.waterline.household://join?token=…`. They require the app, a verified invited email and explicit acceptance; opening a link never grants access by itself.

## Remaining setup

- Test login, cancellation, logout, closing/reopening the app and token renewal on a real Android phone.
- Cloudflare/D1 and the first Owner are configured. Verify authenticated family membership and invitation flows against the real backend.
- Device credentials are explicitly provisioned for the household. HTTPS telemetry and recent history are implemented; self-service pairing, push notifications and command acknowledgements remain future work.
- Implement phone push delivery/permissions when cloud alerts are ready. Motor control still requires verified starter wiring and commissioning.
- Replace debug signing with a release keystore and prepare the Play Store bundle/privacy requirements before publication.

Official references: [Auth0 Android SDK](https://github.com/auth0/Auth0.Android), [Android quickstart](https://auth0.com/docs/quickstart/native/android), [API access policies](https://auth0.com/blog/developers-guide-api-access-policies-auth0/), [Capacitor Android environment](https://capacitorjs.com/docs/getting-started/environment-setup).

The Probes tab shows each level electrode raw ADC, filtered median, water contact, saved DRY/WET calibration, separation and capture spread. It uses existing schema-3 board telemetry; no board update is needed. Old samples without raw ADC display Not supplied. Stale contact is explicitly labeled.

Phone alarm notifications are installed and the cloud sender is configured. A real test appeared and sounded on the registered phone; see NOTIFICATIONS.md.


Nearby Bluetooth readings and controls are installed in version 0.1.14. Pairing is separate from cloud accounts; see BLUETOOTH.md for offline setup and revocation.


Latest Android build: 0.2.1 (versionCode 17), installed successfully. Preview removed. APK: releases/waterline-0.2.1-redesign.apk. See REDESIGN.md for changes and verification limits.
