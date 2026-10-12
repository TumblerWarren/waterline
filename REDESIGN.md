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

## Email-based household joining — 0.2.3

The owner adds a verified email and Viewer/Operator role. A signed-in non-member discovers pending access through GET /api/invitations/pending and explicitly joins using POST /api/invitations/accept with invitationId. The backend verifies the identity email through Auth0 and only exposes matching, unexpired invitations. Acceptance rechecks email, expiry, membership and invitation existence inside the existing transactional insertion. Role is read from the stored owner invitation, not user input. Existing pending invitations work. Owner UI no longer displays or copies invitation links; older deep links remain compatible.

126 tests pass, including email-only discovery/join, wrong-email rejection, role retention, expiry/revocation, replay and verified-email requirements. TypeScript, backend deployment dry-run, Android build/lint and signature verification pass. Backend deployed as d22e75b9-5f87-4bfa-9e5e-b1454c6da946; health OK and unauthenticated discovery returns 401. Physical sign-in/join using a second family account remains to be confirmed by the user.

APK: releases/waterline-0.2.3-email-join.apk. Includes themed dropdowns, varied card patterns, local Outfit/Manrope fonts, smaller launcher droplet, sign-in progress and error cards.

0.2.4: Viewers can acknowledge active household alarms; alarm settings, buzzer tests and device control permissions unchanged. Board confirmation remains required. Includes popup close-button alignment fix. 126 tests, typecheck, backend dry-run, Android build/lint and APK verification passed. Backend version f07a2c9c-3c31-432b-819a-c6c6618148f0. APK: releases/waterline-0.2.4-viewer-ack.apk.

## 0.2.7 household, language and history update
- Owner long-press and accessible menu actions open member removal confirmation; scrolling cancels the long press.
- Viewers/operators may leave their own household after confirmation. The API removes membership and phone registrations atomically. Owners cannot leave while retaining Owner access.
- Settings offers saved English/Bengali navigation, headings and common controls; detailed diagnostics and some dynamic messages remain English. No board changes.
- History plots scroll horizontally within the card for 24-hour and seven-day ranges, retain timestamp spacing/gaps, and distinguish a swipe from tapping a sample.
- Validation: 130 tests, typecheck, Android build/lint and APK signature passed. Backend deployed. Physical phone gesture/language checks remain pending; phone was not connected at delivery.

## 0.2.8 reported clipping, language and history fixes
- Header participates in sticky document flow. Shared app/card width constraints prevent child content from widening the phone viewport; bottom navigation remains within the viewport.
- Bengali coverage expanded across screens, preparation instructions, status feedback and dynamic labels. User-entered names and hardware identifiers remain unchanged.
- History API previously returned only 120 recent samples from one day. It now summarizes seven days into first/last five-minute samples while retaining every band change and the edges of real offline gaps. Overview explicitly filters to 24 hours.
- Regression test verifies yesterday/six-day-old records remain visible despite 200 recent samples, old records are excluded, brief changes retained and gaps explicit. 131 tests pass.
- Type checking, Android build/lint and APK signature pass. Actual components checked at 360/393/430 px with no document overflow and inner horizontal scrolling. Installed on connected Android phone. Cloud database confirms 4,270 samples starting 11 October 2026 12:51 IST. No firmware changes.

## 0.2.10 database efficiency
Live polling uses authenticated /api/reading without history or household-list scans. Household/history refresh every fifteen minutes while visible; History navigation and refresh button request the recent tail with a sixty-second cache. Older history has a daily server cache and recent history a fifteen-minute cache; SQL window scans replaced by indexed range reads and in-memory reduction preserving transitions and outages. Hourly indexed retention cleanup keeps seven days rather than deleting at each heartbeat. Raw telemetry uploads and firmware remain unchanged to preserve heartbeat deduplication and diagnostic fidelity. Tests: 134 passed; Android build/lint and APK signature verified. Backend deployed; actual remote read/write savings await the quota reset.

## 0.2.11 quota optimization
History stores five-minute checkpoints, level/fault/calibration transitions and explicit offline boundaries. Heartbeats still update latest readings and deliver commands on each accepted upload. CAS and sender timestamp/sample checks protect retries; no schema or firmware changes. Live app polling is 30 seconds normally, 5 seconds for pending commands, exponential backoff to five minutes on failures and fifteen minutes on quota errors; hidden app stops polling. Last successful in-memory readings remain visible with existing freshness labels. History on-click and fifteen-minute refresh remain. Private server db_usage logs sample foreground operation row counts, exclude credentials and SQL, and log scheduled delivery/cleanup usage. Tests: 135 passed including thirty unchanged uploads, checkpoint spacing, transitions, gaps and duplicate handling; Android build/lint and APK signature passed. Backend version 4aafe940-ff80-4033-8d30-b0779b629a5a. Remote usage savings cannot be measured until the exhausted daily quota resets.
