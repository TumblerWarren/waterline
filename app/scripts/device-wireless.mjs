import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
const host = process.argv[2];
const mode = process.argv[3] || 'status';
if (
  !host ||
  !/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
  !['status', 'upload', 'wet'].includes(mode)
)
  throw new Error('Provide the ESP32 local IP and status, upload or wet.');
const header = readFileSync(
  new URL('../../ESP32_Water_Level_Detector/include/wifi_secrets.h', import.meta.url),
  'utf8',
);
const password = header.match(/DEVICE_PASSWORD\[\]\s*=\s*"([^"\r\n]+)"/)?.[1];
if (!password) throw new Error('Device admin credential is not configured.');
const headers = { Authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` };
const origin = `http://${host}`;
if (mode === 'status') {
  const r = await fetch(`${origin}/api/status`, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Device status HTTP ${r.status}`);
  console.log(JSON.stringify(await r.json()));
} else if (mode === 'wet') {
  const status = await fetch(`${origin}/api/status`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!status.ok) throw new Error(`Device status HTTP ${status.status}`);
  const data = await status.json();
  if (
    data.probes?.length !== 4 ||
    data.probes.some(
      (p) =>
        !p.calibration?.dryReady ||
        p.calibration.targetCycles !== 20 ||
        p.calibration.capture !== 'none',
    )
  )
    throw new Error(
      'All four probes must have DRY saved and 20-cycle firmware idle before WET capture.',
    );
  const page = await fetch(`${origin}/probe`, { headers, signal: AbortSignal.timeout(10000) });
  if (!page.ok) throw new Error(`Calibration page HTTP ${page.status}`);
  const token = (await page.text()).match(/name='token' value='([a-f0-9]+)'/)?.[1];
  if (!token) throw new Error('Calibration form not recognized.');
  const result = await fetch(`${origin}/calibrate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, mode: 'wet', channel: '-1' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok && result.status !== 303 && result.status !== 302)
    throw new Error(`WET capture HTTP ${result.status}`);
  console.log('WET capture requested on all four probes; 20 cycles, about 100 seconds.');
} else {
  const r = await fetch(`${origin}/update`, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Device updater HTTP ${r.status}`);
  const token = (await r.text()).match(/action='\/update\?token=([a-f0-9]+)'/)?.[1];
  if (!token) throw new Error('Device updater form not recognized.');
  const binary = readFileSync(
    new URL(
      '../../ESP32_Water_Level_Detector/.pio/build/nodemcu-32s/firmware.bin',
      import.meta.url,
    ),
  );
  const boundary = 'WaterlineFirmwareBoundary';
  const start = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="firmware"; filename="firmware.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([start, binary, end]);
  // Pace the legacy Arduino WebServer parser so its idle task can service Wi-Fi
  // and the watchdog rather than buffering a continuous megabyte-long stream.
  await new Promise((resolve, reject) => {
    const req = request(
      `${origin}/update?token=${token}`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
          Connection: 'close',
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200)
            reject(new Error(`Device firmware upload HTTP ${res.statusCode}`));
          else {
            console.log(text);
            resolve();
          }
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('Upload timed out.')));
    (async () => {
      for (let offset = 0; offset < payload.length; offset += 2048) {
        if (req.destroyed) return;
        if (!req.write(payload.subarray(offset, offset + 2048))) await once(req, 'drain');
        await delay(60);
      }
      req.end();
    })().catch(reject);
  });
}
