# Waterline Android redesign — 0.2.1

Implemented the light blue theme, generated droplet/wave branding, four main tabs (Overview, History, Alarm, Bluetooth), separate signed-out landing screen, and profile bottom sheet. Settings, Calibration, Probes and Household remain available through the profile sheet. Preview entry points and sample controls have been removed; runtime preview is disabled.

The SVG tank retains confirmed level bands, shaded water, moving waves and stale-data motion suppression. History uses timestamp-spaced stepped segments, missing-data gaps and selectable details. Reduced-motion styles and background visibility handling are included.

Bluetooth state lives above screen navigation. Auto chooses fresh Cloud data, then fresh paired Bluetooth data. Explicit selection remains explicit; controls retain the source selected at submission. History and calibration capture remain Cloud-only. No firmware or backend schema changes were made.

## Verification

123 tests passed, TypeScript passed, Android assembleDebug and lintDebug passed. Browser layout checks covered 360–430 px screens and all four main tabs plus profile destinations, with no horizontal overflow. Final signed-out landing check confirms there is no preview button. APK installed successfully on the connected phone.

Full physical-phone interaction checks (Back, sign-in callbacks, Bluetooth continuity, alarms and notifications) remain to be exercised on this build. The phone screenshot was black, so visual verification on the phone was not completed. Large-text and keyboard-open verification remain pending.

APK: releases/waterline-0.2.1-redesign.apk
SHA256: 8A8CEA7B4D7AAFA879EAED466715FF2B0776F878805510783EDAC6EFA70F8705
Android identity retained: com.waterline.household, versionCode 17.

## Icon assets

Generated with the built-in image generation tool, transparent background, then packaged with scripts/generate-launcher-assets.ps1. Master: assets/waterline-icon-master.png. Web artwork: public/waterline-icon.png. Android assets include adaptive foreground/background, legacy and round launcher icons, monochrome themed icon, and splash artwork. The existing white notification silhouette is retained.

Generation prompt: Create a polished Waterline Android app icon foreground: a single centered blue water droplet containing a smooth curling cyan wave as an integral part of the droplet, softly dimensional glossy shading, royal blue #2563EB to cyan #22D3EE, elegant restrained depth, distinct simple silhouette legible at 32 pixels. No text, lettering, border, square tile, watermark or external cast shadow. Transparent background. Square canvas, icon occupies central 60% width and 70% height with Android adaptive cropping margin.
