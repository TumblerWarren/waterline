# Waterline application

The Android app and Cloudflare backend live in this directory. Start with the
[root project README](../README.md) for the current features, architecture,
permissions, security, build instructions and limitations.

## Common commands

Run from this directory using Node.js 24:

```powershell
npm ci
npm run dev
npm test
npm run typecheck
npm run android:sync
npm run backend:check
```

`android:sync` builds/copies the interface into the native project. Build an APK
with `android/gradlew.bat assembleDebug` from the `android` directory.
`backend:check` does not deploy; `backend:deploy` publishes the dedicated API.

## Component documentation

- [Android and Auth0 setup](ANDROID.md)
- [Cloudflare backend provisioning](BACKEND.md)
- [Bluetooth access](BLUETOOTH.md)
- [Firebase sender configuration](NOTIFICATIONS.md)
- [Release notes and current redesign](REDESIGN.md)
- [Verification record](VERIFICATION.md)

Older component notes record earlier releases; the root README summarizes the
current implementation. Preview controls and invitation-link sharing have been
removed from the normal interface, and phone push/continuous alarms are now
implemented. All components use the repository-root `.gitignore`.
