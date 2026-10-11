# Waterline

A household water-level app for the existing ESP32 detector. **Android first**, using Capacitor with React and TypeScript, Auth0 and a Cloudflare Worker + D1. Built in `F:\Projects\IoT\Water-Level\app`. Start with [ANDROID.md](ANDROID.md) for the APK, Native Auth0 configuration and phone setup. The browser version is also available as a development preview.

## What works now

- Responsive overview, band-based tank illustration, history, alerts, family access and preferences.
- A clearly labelled, session-only preview: normal, low, full, sensor fault, offline and uncalibrated scenarios. Change the preview role to explore Owner, Operator and Viewer access. Reset or reload to discard preview changes.
- A simulated ten-second buzzer test, followed by automatic alarms staying disabled until re-enabled. No request is sent to physical hardware from preview mode.
- Auth0 Universal Login integration and server validation of RS256 API access tokens, issuer, audience, expiry and subject.
- Household database, server-enforced roles, one-use invitations restricted to a verified email address, expiry/revocation, and audit events for settings and membership changes.
- Android project, native Back navigation, system-browser login callbacks, packaged UI, HTTPS cloud API configuration and restricted Android-origin CORS. Native login requires an Auth0 Native client.
- Optional installable web app shell with icons, manifest and a separate offline page. Offline browser navigation never shows cached household readings or authentication tokens.

The backend is deployed with Auth0 and HTTPS device uploads at `https://waterline.devbuildtool.com`. Real household snapshots return the provisioned device's latest uploaded reading and recent history. Preview data never populates the real database. The Owner can calibrate all four probes through the app. Owners and Operators can test the real buzzer for ten seconds and enable or disable automatic alarms through the mobile app, with board acknowledgement shown. Phone push notifications and remote motor commands remain unavailable.

The current firmware uses GPIO36 (20%), GPIO34 (50%), GPIO33 (80%), GPIO32 (100%), GPIO14 (common) and GPIO23 (active buzzer). The local LOW alarm remains one minute of intermittent beeping every ten minutes below 20%, stopping when the 20% probe is wet. 50%, 80% and 100% now have configurable alarms, initially 10 seconds ON / 50 seconds OFF until acknowledged or dry. Firmware includes outbound HTTPS telemetry. The fourth probe changes shared excitation loading, so all four channels require fresh dry/wet calibration; Wi-Fi settings remain saved. Final tank calibration and the motor starter interface still need physical commissioning.

## Run locally

Use **Node.js 24 LTS** and npm. In this folder:

```powershell
npm ci
npm run cf:types
npm run db:migrate:local
npm run dev
```

Open **http://127.0.0.1:5173/**. Without Auth0 settings it opens the preview. The development server listens only on this computer. It is not an internet-accessible deployment.

```powershell
npm test
npm run typecheck
npm run build
npm run deploy:check
```

Tests cover cryptographic token validation, household isolation, role enforcement, invitation handling and stale/device fault states. API tests run the actual migration and queries against in-memory SQLite, with an injected identity; separate authentication tests verify real JWT signatures. Auth0 login itself needs a tenant to verify end to end. `deploy:check` performs a local bundle dry run and does not publish. Wrangler may need normal OS access to start its local runtime.

## Prepare Auth0 for the optional browser version

1. Create an Auth0 tenant, then a **Single Page Application** named Waterline. Use Universal Login. The SPA uses Authorization Code with PKCE; do not put a client secret in this app.
2. Create an Auth0 **API** with an identifier you choose, such as `https://waterline.example/api`, and **RS256** signing. The identifier is an audience string, not a URL that must serve a page. Require email verification before joining via invitations. Auth0 verifies the user; the app database decides household access.
3. On the SPA, configure these local values exactly:

   | Auth0 setting         | Local value             |
   | --------------------- | ----------------------- |
   | Allowed Callback URLs | `http://127.0.0.1:5173` |
   | Allowed Logout URLs   | `http://127.0.0.1:5173` |
   | Allowed Web Origins   | `http://127.0.0.1:5173` |

   If you use `localhost` instead, register that exact origin too. Add the production HTTPS origin to all three settings before going live. No wildcard origins.

4. Copy `.env.example` to `.env.local` and fill in the **public** domain, SPA client ID and API audience. Copy `.dev.vars.example` to `.dev.vars` and use the same domain and audience for local server validation:

   ```dotenv
   # .env.local: public SPA configuration
   VITE_AUTH0_DOMAIN=your-tenant.auth0.com
   VITE_AUTH0_CLIENT_ID=your-spa-client-id
   VITE_AUTH0_AUDIENCE=https://waterline.example/api
   ```

   ```dotenv
   # .dev.vars: local Worker configuration
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_AUDIENCE=https://waterline.example/api
   ```

5. Restart the development server. Sign in and verify your email. Get your **User ID (`sub`, e.g. `auth0|…`)** from Auth0 User Management. A new account initially has no household membership; public sign-up never creates an Owner.
6. Provision the household and first Owner explicitly. Save the following as `.wrangler/owner.sql`, replacing the sample subject, name and email with the verified owner account. Escape literal SQL apostrophes as `''`. Run it once:

   ```sql
   INSERT INTO households (id, name, tank_name)
   VALUES ('home', 'Our home', 'Rooftop tank');
   INSERT INTO memberships (id, household_id, subject, name, email, role)
   VALUES ('first-owner', 'home', 'REPLACE_WITH_AUTH0_USER_ID', 'Your name', 'owner@example.com', 'owner');
   ```

   ```powershell
   npx wrangler d1 execute waterline --local --file .wrangler/owner.sql
   ```

7. Refresh the app. A real reading appears after the provisioned ESP32 uploads its first snapshot. The Owner can save preferences and create a private invitation link. Share it manually with the invited person; the app does not send email. Invites expire after seven days and require that person's verified email. Only Owners can change roles or remove members. Owner removal/promotion is intentionally unavailable in the app.

The SDK keeps access tokens in memory. The app does not store Auth0 access tokens in local storage. Pending invitation tokens temporarily use session storage to survive the login redirect and are removed after acceptance.

## Backend deployed

The Android backend is deployed independently at `https://waterline.devbuildtool.com`, with Auth0 configured and the first Owner provisioned. Use `npm run backend:deploy` to update it. See [BACKEND.md](BACKEND.md) for the deployment, verification and remaining device work. The following setup applies to the optional browser application, which has not been deployed.

## Prepare the optional browser deployment when ready

1. Create/link your Cloudflare account and a D1 database named `waterline`. Replace the all-zero placeholder `database_id` in `wrangler.jsonc` with its actual ID. The deployment guard supports comments and trailing commas in this JSONC configuration.
2. Set `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` in `wrangler.jsonc` `vars` to match the SPA configuration. These are public identifiers. Configure the matching `VITE_AUTH0_*` build variables locally or in CI.
3. Apply migrations to the remote database explicitly with `npx wrangler d1 migrations apply waterline --remote`, then provision the first verified Owner against that remote database. Review `.wrangler/owner.sql` before using `--remote`.
4. Register the chosen HTTPS app origin in Auth0 callback, logout and web origins. `npm run deploy` first checks for missing Auth0 configuration and a placeholder database ID, then builds and publishes the app. Running this command is an explicit deployment action. The development-only runtime explorer is not a production API.
5. Verify login/logout, cross-household access rejection, invite acceptance/replay, role changes and mobile install against the deployed origin. Re-run `npm run cf:types` after changing Worker bindings.

The ESP32 uploads outbound over authenticated TLS with its own device credential; no router port forwarding is needed. Local sensing and alarms continue without the app or internet. Self-service pairing and commands with acknowledgements remain future work. Motor control follows verified starter integration, state feedback and fail-safe commissioning.

## Reference

- [Full project plan](../APP_PLAN.md)
- [Auth0 React quickstart](https://auth0.com/docs/quickstart/spa/react)
- [Auth0 access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [Cloudflare React + Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)

The generated `worker-configuration.d.ts` comes from `npm run cf:types`. `.env*` (except examples), `.dev.vars*`, local database state and provisioning SQL under `.wrangler` are ignored by Git. Never commit credentials, invitation links or household exports.

Configure each level in Settings → Buzzer alarm settings. Overview and the Alerts dialog provide per-level acknowledgement and Acknowledge all active alarms. Changes sync over Wi-Fi; board-confirmed status is shown. Saved settings and acknowledgements survive restart. Only Owners edit timing; Owners and Operators can acknowledge.
