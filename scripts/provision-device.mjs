import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const target = new URL('../../ESP32_Water_Level_Detector/include/cloud_secrets.h', import.meta.url);
if (existsSync(target))
  throw new Error(
    'Device already provisioned locally. Review credential rotation before replacing it.',
  );
const token = `wl_${randomBytes(32).toString('hex')}`;
const hash = createHash('sha256').update(token).digest('hex');
mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../.wrangler/device.sql', import.meta.url),
  `INSERT INTO devices(id,household_id,token_hash) VALUES('rooftop-esp32','home','${hash}');\n`,
  { mode: 0o600 },
);
writeFileSync(
  target,
  `#pragma once\nconstexpr const char* CLOUD_TELEMETRY_URL="https://waterline.devbuildtool.com/api/device/telemetry";\nconstexpr const char* CLOUD_DEVICE_TOKEN="${token}";\n`,
  { mode: 0o600 },
);
console.log(
  'Generated private device header and D1 SQL containing only its hash. No credential printed.',
);
