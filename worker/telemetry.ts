import { HttpError } from './auth';
import type { ApiEnv } from './index';
import type { Band, Reading, Probe } from '../shared/model';
import { calibrationReply, latestCalibration } from './calibration';
import { buzzerReply, latestBuzzer } from './buzzer';
import { alarmTelemetry, alarmReply, readAlarmSettings, alarmAcknowledgements } from './alarms';
import { queueAlarmPush, deliverPush } from './push';

export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
export function normalizeTelemetry(data: Record<string, unknown>, now: number): Reading {
  if (
    (data.schema !== 1 && data.schema !== 2 && data.schema !== 3) ||
    typeof data.sentAt !== 'number' ||
    !Number.isSafeInteger(data.sentAt) ||
    data.sentAt > now + 5000 ||
    data.sentAt < now - 30000 ||
    typeof data.sampleId !== 'string' ||
    !/^[a-f0-9]{32}$/.test(data.sampleId) ||
    typeof data.buzzerEnabled !== 'boolean' ||
    (data.buzzerControlSupported !== undefined &&
      typeof data.buzzerControlSupported !== 'boolean') ||
    typeof data.buzzerTestRemainingMs !== 'number' ||
    !Number.isInteger(data.buzzerTestRemainingMs) ||
    data.buzzerTestRemainingMs < 0 ||
    data.buzzerTestRemainingMs > 10000 ||
    typeof data.fault !== 'string' ||
    data.fault.length > 160 ||
    !Array.isArray(data.probes) ||
    data.probes.length !== (data.schema === 1 ? 3 : 4) ||
    (data.measurementAgeMs !== null &&
      (typeof data.measurementAgeMs !== 'number' ||
        !Number.isInteger(data.measurementAgeMs) ||
        data.measurementAgeMs < 0 ||
        data.measurementAgeMs > 0xffffffff))
  )
    throw new HttpError(400, 'Invalid telemetry.');
  const pins = new Map([
    [20, 36],
    [50, 34],
    [100, 32],
  ]);
  if (data.schema !== 1) pins.set(80, 33);
  const seen = new Set<number>();
  const probes: Probe[] = data.probes
    .map((item: unknown): Probe => {
      if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid probe.');
      const p = item as Record<string, unknown>;
      if (
        typeof p.level !== 'number' ||
        !pins.has(p.level) ||
        seen.has(p.level) ||
        pins.get(p.level) !== p.gpio ||
        typeof p.calibrated !== 'boolean' ||
        typeof p.state !== 'string' ||
        p.state.length > 80 ||
        typeof p.median !== 'number' ||
        !Number.isInteger(p.median) ||
        p.median < 0 ||
        p.median > 4095 ||
        (p.raw !== undefined &&
          (typeof p.raw !== 'number' || !Number.isInteger(p.raw) || p.raw < 0 || p.raw > 4095))
      )
        throw new HttpError(400, 'Invalid probe.');
      seen.add(p.level);
      let calibration: Probe['calibration'];
      if (data.schema === 3) {
        const c = p.calibration as Record<string, unknown> | undefined;
        if (
          !c ||
          typeof c !== 'object' ||
          typeof c.dryReady !== 'boolean' ||
          typeof c.wetReady !== 'boolean' ||
          !['none', 'dry', 'wet'].includes(c.capture as string) ||
          typeof c.cycles !== 'number' ||
          !Number.isInteger(c.cycles) ||
          c.cycles < 0 ||
          c.cycles > 20 ||
          typeof c.dry !== 'number' ||
          !Number.isInteger(c.dry) ||
          c.dry < 0 ||
          c.dry > 4095 ||
          typeof c.wet !== 'number' ||
          !Number.isInteger(c.wet) ||
          c.wet < 0 ||
          c.wet > 4095
        )
          throw new HttpError(400, 'Invalid calibration progress.');
        if (
          (c.targetCycles !== undefined && c.targetCycles !== 5 && c.targetCycles !== 20) ||
          (typeof c.targetCycles === 'number' && c.cycles > c.targetCycles) ||
          [c.dryNoise, c.wetNoise].some(
            (n) =>
              n !== undefined &&
              (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 4095),
          )
        )
          throw new HttpError(400, 'Invalid calibration quality.');
        calibration = {
          ...(typeof c.targetCycles === 'number' ? { targetCycles: c.targetCycles } : {}),
          ...(typeof c.dryNoise === 'number' ? { dryNoise: c.dryNoise } : {}),
          ...(typeof c.wetNoise === 'number' ? { wetNoise: c.wetNoise } : {}),
          dry: c.dry,
          wet: c.wet,
          dryReady: c.dryReady,
          wetReady: c.wetReady,
          capture: c.capture as 'none' | 'dry' | 'wet',
          cycles: c.cycles,
        };
      }
      return {
        ...(calibration ? { calibration } : {}),
        level: p.level as Probe['level'],
        gpio: p.gpio as number,
        median: p.median,
        ...(typeof p.raw === 'number' ? { raw: p.raw } : {}),
        calibrated: p.calibrated,
        state:
          p.calibrated && p.median < 4080
            ? p.state === 'WET'
              ? 'wet'
              : p.state === 'DRY'
                ? 'dry'
                : 'unknown'
            : 'unknown',
      };
    })
    .sort((a, b) => a.level - b.level);
  const calibrated = probes.every((p) => p.calibrated);
  let fault = data.fault === 'None' ? null : data.fault;
  if (data.measurementAgeMs === null) fault = 'Waiting for measurement';
  else if (now - data.sentAt + data.measurementAgeMs > 15000) fault = 'Stale measurements';
  if (
    probes.some(
      (p, i) => p.state === 'wet' && probes.slice(0, i).some((lower) => lower.state === 'dry'),
    )
  )
    fault = 'Inconsistent probes: upper wet while lower dry';
  if (probes.some((p) => p.median >= 4080)) fault = 'ADC saturation';
  if (!calibrated) fault = 'Calibration required';
  let band: Band = 'unknown';
  if (calibrated && !fault && probes.every((p) => p.state !== 'unknown'))
    band =
      probes.find((p) => p.level === 100)?.state === 'wet'
        ? 'full'
        : probes.find((p) => p.level === 80)?.state === 'wet'
          ? 'near-full'
          : probes.find((p) => p.level === 50)?.state === 'wet'
            ? data.schema !== 1
              ? 'upper-middle'
              : 'high'
            : probes[0].state === 'wet'
              ? 'middle'
              : 'low';
  return {
    ...alarmTelemetry(data),
    band,
    connected: true,
    fault,
    calibrated,
    measuredAt: data.measurementAgeMs === null ? null : data.sentAt - data.measurementAgeMs,
    lastSeen: now,
    probes,
    buzzerEnabled: data.buzzerEnabled,
    calibrationSupported: data.schema === 3,
    buzzerControlSupported: data.schema === 3 && data.buzzerControlSupported === true,
    buzzerTestingUntil: data.buzzerTestRemainingMs
      ? data.sentAt + data.buzzerTestRemainingMs
      : null,
  };
}
export async function ingestTelemetry(
  request: Request,
  env: ApiEnv,
  readBody: (request: Request) => Promise<Record<string, unknown>>,
  ctx?: Pick<ExecutionContext, 'waitUntil'>,
) {
  // Opaque device credentials grant upload access only. Auth0 user tokens cannot upload.
  const token = request.headers.get('Authorization')?.match(/^Bearer (wl_[a-f0-9]{64})$/)?.[1];
  if (!token) throw new HttpError(401, 'Invalid device credential.');
  const digest = await tokenHash(token);
  const device = await env.DB.prepare('SELECT id FROM devices WHERE token_hash = ? AND enabled = 1')
    .bind(digest)
    .first<{ id: string }>();
  if (!device) throw new HttpError(401, 'Invalid device credential.');
  const data = await readBody(request);
  const now = Date.now();
  const reading = normalizeTelemetry(data, now);
  // The conditional insert enforces per-device throttling atomically. Only a newly
  // inserted sample may update last-seen; retries cannot make old readings fresh.
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO telemetry(device_id,sample_id,received_at,band)
      SELECT id,?,?,? FROM devices WHERE id = ? AND enabled = 1 AND token_hash = ? AND (last_seen IS NULL OR last_seen <= ?)`,
    ).bind(data.sampleId, now, reading.band, device.id, digest, now - 4000),
    env.DB.prepare(
      `UPDATE devices SET last_seen = ?, latest = ? WHERE id = ? AND enabled = 1 AND token_hash = ? AND (last_seen IS NULL OR last_seen <= ?)
      AND changes() = 1 AND EXISTS(SELECT 1 FROM telemetry WHERE device_id = ? AND sample_id = ? AND received_at = ?)`,
    ).bind(
      now,
      JSON.stringify(reading),
      device.id,
      digest,
      now - 4000,
      device.id,
      data.sampleId,
      now,
    ),
    env.DB.prepare('DELETE FROM telemetry WHERE device_id = ? AND received_at < ?').bind(
      device.id,
      now - 86400000,
    ),
  ]);
  if (result[0].meta.changes !== 1)
    throw new HttpError(429, 'Sample already received or upload too frequent.');
  const command = await calibrationReply(env, device.id, data, reading, now);
  const buzzer = await buzzerReply(env, device.id, data, reading, now);
  const alarmHeaders = await alarmReply(env, device.id, reading, now);
  await queueAlarmPush(env, device.id, reading, now);
  if (typeof ctx?.waitUntil === 'function')
    ctx.waitUntil(
      deliverPush(env).catch(() => console.error(JSON.stringify({ event: 'push_worker_failed' }))),
    );
  return Response.json(
    { ok: true },
    {
      headers: {
        ...alarmHeaders,
        'Cache-Control': 'no-store',
        ...(command ? { 'X-Waterline-Calibration': command } : {}),
        ...(buzzer ? { 'X-Waterline-Buzzer': buzzer } : {}),
      },
    },
  );
}
export async function householdTelemetry(env: ApiEnv, householdId: string) {
  const device = await env.DB.prepare(
    'SELECT id, last_seen, latest FROM devices WHERE household_id = ? AND enabled = 1',
  )
    .bind(householdId)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  const reading: Reading | null = device?.latest ? JSON.parse(device.latest) : null;
  if (reading)
    reading.connected = device!.last_seen !== null && Date.now() - device!.last_seen! <= 30000;
  const points = device
    ? await env.DB.prepare(
        `SELECT received_at AS at, band FROM telemetry WHERE device_id = ?
    AND received_at >= ? ORDER BY received_at DESC LIMIT 120`,
      )
        .bind(device.id, Date.now() - 86400000)
        .all<{ at: number; band: Band }>()
    : { results: [] };
  return {
    reading,
    alarmSettings: device ? await readAlarmSettings(env, device.id) : undefined,
    alarmAcknowledgements: device ? await alarmAcknowledgements(env, device.id) : [],
    history: points.results.reverse(),
    calibrationCommand: device ? await latestCalibration(env, device.id) : null,
    buzzerCommand: device ? await latestBuzzer(env, device.id) : null,
  };
}
