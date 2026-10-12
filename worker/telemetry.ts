import { HttpError } from './auth';
import type { ApiEnv } from './index';
import type { Band, Reading, Probe, HistoryPoint } from '../shared/model';
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
  const device = await env.DB.prepare(
    'SELECT id, last_seen, latest FROM devices WHERE token_hash = ? AND enabled = 1',
  )
    .bind(digest)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  if (!device) throw new HttpError(401, 'Invalid device credential.');
  const data = await readBody(request);
  const now = Date.now();
  const reading = normalizeTelemetry(data, now);
  type StoredReading = Reading & {
    _storage?: { lastSampleId: string; lastSentAt: number; historyAt: number };
  };
  const previous: StoredReading | null = device.latest ? JSON.parse(device.latest) : null;
  const storage = previous?._storage;
  // Reject retries and older sender timestamps, including samples omitted from history.
  if (
    storage &&
    (storage.lastSampleId === data.sampleId || Number(data.sentAt) < storage.lastSentAt)
  )
    throw new HttpError(429, 'Sample already received or upload too frequent.');
  const historyAt = storage?.historyAt ?? device.last_seen ?? 0;
  const gap = device.last_seen !== null && now - device.last_seen > 60000;
  const changed =
    previous &&
    (previous.band !== reading.band ||
      previous.fault !== reading.fault ||
      previous.calibrated !== reading.calibrated);
  const save = !previous || gap || changed || now - historyAt >= 300000;
  const entries: { sample: string; at: number; band: HistoryPoint['band'] }[] = [];
  const sample = `sparse:${data.sampleId}`;
  if (gap) {
    entries.push({
      sample: sample + ':end',
      at: device.last_seen!,
      band: previous?.band ?? 'unknown',
    });
    entries.push({ sample: sample + ':offline', at: device.last_seen! + 30000, band: 'offline' });
    entries.push({ sample: sample + ':resume', at: now - 1, band: 'offline' });
  } else if (changed && device.last_seen !== null) {
    entries.push({ sample: sample + ':before', at: device.last_seen, band: previous!.band });
  }
  if (save) entries.push({ sample, at: now, band: reading.band });
  const stored: StoredReading = {
    ...reading,
    _storage: {
      lastSampleId: String(data.sampleId),
      lastSentAt: Number(data.sentAt),
      historyAt: save ? now : historyAt,
    },
  };
  // Compare-and-swap heartbeat plus optional history rows is one transaction.
  // A history checkpoint is no longer required for live freshness or command delivery.
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE devices SET last_seen=?, latest=? WHERE id=? AND enabled=1 AND token_hash=? AND last_seen IS ? AND (last_seen IS NULL OR last_seen<=?)
      AND NOT EXISTS(SELECT 1 FROM telemetry WHERE device_id=? AND sample_id IN (?,?))`,
    ).bind(
      now,
      JSON.stringify(stored),
      device.id,
      digest,
      device.last_seen,
      now - 4000,
      device.id,
      data.sampleId,
      sample,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO telemetry(device_id,sample_id,received_at,band)
      SELECT ?,json_extract(value,'$.sample'),json_extract(value,'$.at'),json_extract(value,'$.band') FROM json_each(?) WHERE changes()=1`,
    ).bind(device.id, JSON.stringify(entries)),
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
export async function householdTelemetry(
  env: ApiEnv,
  householdId: string,
  includeHistory = true,
  freshHistory = false,
) {
  const device = await env.DB.prepare(
    'SELECT id, last_seen, latest FROM devices WHERE household_id = ? AND enabled = 1',
  )
    .bind(householdId)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  const reading: Reading | null = device?.latest ? JSON.parse(device.latest) : null;
  if (reading) delete (reading as Reading & { _storage?: unknown })._storage;
  if (reading)
    reading.connected = device!.last_seen !== null && Date.now() - device!.last_seen! <= 30000;
  // Cache only history, never identities, membership or live controls. Revocation is
  // checked on every request before this private server-side cache is consulted.
  const historyKey =
    device && includeHistory
      ? new Request(
          `https://waterline-history.internal/${freshHistory ? 'fresh-v3' : 'v3'}/${encodeURIComponent(device.id)}`,
        )
      : null;
  const cache = typeof caches !== 'undefined' ? caches.default : undefined;
  const cached = cache && historyKey ? await cache.match(historyKey) : undefined;
  let points: {
    results: {
      at: number;
      band: HistoryPoint['band'];
      previous_at: number | null;
      sparse?: boolean;
    }[];
  };
  if (!includeHistory) points = { results: [] };
  else if (cached) points = await cached.json<typeof points>();
  else if (device && includeHistory) {
    // Older history changes only through retention. Reuse it for a day, while
    // rebuilding the recent tail every fifteen minutes. No cached user access.
    const archiveKey = new Request(
      `https://waterline-history.internal/archive-v3/${encodeURIComponent(device.id)}`,
    );
    const archived = cache ? await cache.match(archiveKey) : undefined;
    let archive: {
      cutoff: number;
      rows: { at: number; band: HistoryPoint['band']; sparse?: boolean }[];
    };
    if (archived) archive = await archived.json<typeof archive>();
    else {
      const cutoff = Date.now() - 86400000;
      const older = await env.DB.prepare(
        `SELECT received_at AS at, band, sample_id LIKE 'sparse:%' AS sparse FROM telemetry WHERE device_id=? AND received_at>=? AND received_at<? ORDER BY received_at`,
      )
        .bind(device.id, Date.now() - 7 * 86400000, cutoff)
        .all<{ at: number; band: HistoryPoint['band']; sparse?: boolean }>();
      archive = { cutoff, rows: older.results };
      if (cache)
        await cache
          .put(
            archiveKey,
            new Response(JSON.stringify(archive), {
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
            }),
          )
          .catch(() => {});
    }
    const recent = await env.DB.prepare(
      `SELECT received_at AS at, band, sample_id LIKE 'sparse:%' AS sparse FROM telemetry WHERE device_id=? AND received_at>=? ORDER BY received_at`,
    )
      .bind(device.id, archive.cutoff)
      .all<{ at: number; band: HistoryPoint['band']; sparse?: boolean }>();
    const rows = [...archive.rows, ...recent.results].filter(
      (p) => p.at >= Date.now() - 7 * 86400000,
    );
    // Reduce returned points in memory, avoiding several SQL window-function scans.
    // Keep bucket boundaries, every band change, and both sides of real outages.
    points = {
      results: rows.flatMap((point, index) => {
        const previous = rows[index - 1],
          next = rows[index + 1];
        const bucket = Math.floor(point.at / 300000);
        const keep =
          !previous ||
          !next ||
          Math.floor(previous.at / 300000) !== bucket ||
          Math.floor(next.at / 300000) !== bucket ||
          previous.band !== point.band ||
          next.band !== point.band ||
          point.at - previous.at > 60000 ||
          next.at - point.at > 60000;
        return keep ? [{ ...point, previous_at: previous?.at ?? null }] : [];
      }),
    };
    if (cache && historyKey) {
      await cache
        .put(
          historyKey,
          new Response(JSON.stringify(points), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': freshHistory ? 'max-age=60' : 'max-age=900',
            },
          }),
        )
        .catch(() => {});
    }
  } else points = { results: [] };
  return {
    reading,
    alarmSettings: device ? await readAlarmSettings(env, device.id) : undefined,
    alarmAcknowledgements: device ? await alarmAcknowledgements(env, device.id) : [],
    history: points.results.flatMap((point, index) => {
      const previous = points.results[index - 1];
      return previous &&
        !point.sparse &&
        point.previous_at !== null &&
        point.at - point.previous_at > 60000
        ? [
            { at: point.previous_at! + 30000, band: 'offline' as Band },
            { at: point.at - 1, band: 'offline' as Band },
            point,
          ]
        : [{ at: point.at, band: point.band }];
    }),
    calibrationCommand: device ? await latestCalibration(env, device.id) : null,
    buzzerCommand: device ? await latestBuzzer(env, device.id) : null,
  };
}

export async function pruneTelemetry(env: ApiEnv, now = Date.now()) {
  // One scheduled cleanup replaces a delete on every ten-second heartbeat.
  const devices = await env.DB.prepare('SELECT id FROM devices').all<{ id: string }>();
  for (const device of devices.results) {
    await env.DB.prepare('DELETE FROM telemetry WHERE device_id = ? AND received_at < ?')
      .bind(device.id, now - 7 * 86400000)
      .run();
  }
}
