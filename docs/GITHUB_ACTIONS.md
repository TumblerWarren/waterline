# GitHub Actions and main protection

The **Build** workflow runs on pull requests targeting `main`, pushes to `main`,
and manual runs. It uses Node 24, JDK 21 and Android SDK 36.

- **Tests and build** runs the test suite, browser build and backend dry-run check.
- **Android build and lint** builds a debug APK, runs Android lint and verifies the APK signature.
- Pull requests build without Auth0/Firebase configuration and do not upload an APK.
- Pushes to `main` and manual runs on `main` restore the configuration from Actions
  secrets and upload a configured debug APK, retained for 14 days.
- This workflow does not deploy the backend, flash firmware or publish a release.

## One-time configuration

Open [repository Actions secrets](https://github.com/TumblerWarren/waterline/settings/secrets/actions)
and add these repository secrets before the first build on `main`:

| Secret                 | Value                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `ANDROID_ENV_FILE`     | Entire contents of the existing `app/.env.android.local` file, as plain text               |
| `GOOGLE_SERVICES_JSON` | Entire contents of the existing `app/android/app/google-services.json` file, as plain JSON |

Do not use a Firebase service-account file. The Android client configuration is
the `google-services.json` file. Keep Auth0 Native client configuration; no Auth0
client secret is needed. The workflow fails with an explanatory message if either
secret is absent or invalid. Local configuration files remain ignored by Git.

After merging the workflow, open [Actions](https://github.com/TumblerWarren/waterline/actions),
select **Build**, and choose **Run workflow** on `main` to rebuild manually.
Download `waterline-debug-<run number>` from a successful run's **Artifacts** section
and extract the APK.

GitHub runners use their own debug signing certificate. Updating an app installed
from this computer can fail because the signatures differ. Uninstalling the old
app allows installation but removes its local session/preferences. Keep using the
local build if you need to preserve that installation. A stable release-signing
keystore is a separate setup; these artifacts are debug/test builds.

## Protect main

After the PR checks have run at least once, open
[Settings → Rules → Rulesets](https://github.com/TumblerWarren/waterline/settings/rules),
choose **New ruleset → New branch ruleset**, name it `Protect main`, set enforcement
to **Active**, and target the default branch (`main`). Leave the bypass list empty.

Enable:

1. **Restrict deletions**.
2. **Block force pushes**.
3. **Require a pull request before merging**.
4. **Require conversation resolution before merging** (under the pull request rule).
5. **Require status checks to pass**, adding **Tests and build** and
   **Android build and lint** from GitHub Actions. Enable **Require branches to be
   up to date before merging**.

If you are the only maintainer, use **0 required approvals**: your own PR still
needs passing checks, and GitHub does not allow you to approve your own PR.
With another reviewer, require **1 approval** and dismiss stale approvals when
new commits are pushed. Save the ruleset. Do not enable **Restrict updates**;
that would also prevent normal PR merges without bypass access.

Future changes go on a branch such as `codex/my-change`, then through a PR into
`main`. The empty bypass list makes the rules apply to the owner too.

Branch rulesets are available for public repositories on GitHub Free. Private
repositories require an eligible paid plan. See the
[GitHub rules documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
