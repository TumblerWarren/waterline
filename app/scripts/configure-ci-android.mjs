import { writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const { ANDROID_ENV_FILE, GOOGLE_SERVICES_JSON } = process.env;
if (!ANDROID_ENV_FILE || !GOOGLE_SERVICES_JSON)
  throw new Error('Set the ANDROID_ENV_FILE and GOOGLE_SERVICES_JSON repository Actions secrets.');

const env = parseEnv(ANDROID_ENV_FILE);
for (const key of [
  'VITE_AUTH0_DOMAIN',
  'VITE_AUTH0_CLIENT_ID',
  'VITE_AUTH0_AUDIENCE',
  'VITE_API_BASE_URL',
]) {
  if (!env[key]?.trim()) throw new Error(`ANDROID_ENV_FILE is missing ${key}.`);
}
let firebase;
try {
  firebase = JSON.parse(GOOGLE_SERVICES_JSON);
} catch {
  throw new Error('GOOGLE_SERVICES_JSON must contain valid Firebase Android configuration JSON.');
}
if (
  !firebase.project_info?.project_id ||
  !firebase.client?.some(
    (client) => client.client_info?.android_client_info?.package_name === 'com.waterline.household',
  )
)
  throw new Error('GOOGLE_SERVICES_JSON must configure the com.waterline.household Android app.');

// Write only after both inputs validate. Never print configuration into Actions logs.
writeFileSync('.env.android.local', ANDROID_ENV_FILE, { mode: 0o600 });
writeFileSync('android/app/google-services.json', GOOGLE_SERVICES_JSON, { mode: 0o600 });
console.log('Android build configuration restored.');
