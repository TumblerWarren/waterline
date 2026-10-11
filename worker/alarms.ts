import { HttpError } from './auth';
import type { ApiEnv } from './index';
import {
  defaultAlarmRules,
  alarmTriggered,
  type AlarmRule,
  type LevelAlarm,
  type Reading,
  type Household,
} from '../shared/model';

export function validateRules(value: unknown, legacy = false): AlarmRule[] {
  if (!Array.isArray(value) || (value.length !== 4 && !(legacy && value.length === 3)))
    throw new HttpError(400, 'Configure all four level alarms.');
  const rules = value
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid alarm settings.');
      const r = item as AlarmRule;
      if (
        !(value.length === 3 ? [50, 80, 100] : [20, 50, 80, 100]).includes(r.level) ||
        typeof r.enabled !== 'boolean' ||
        !Number.isInteger(r.onSeconds) ||
        r.onSeconds < 1 ||
        r.onSeconds > 60 ||
        !Number.isInteger(r.offSeconds) ||
        r.offSeconds < 1 ||
        r.offSeconds > 3600
      )
        throw new HttpError(400, 'Sound must be 1–60 seconds; silence must be 1–3600 seconds.');
      return {
        level: r.level,
        enabled: r.enabled,
        onSeconds: r.onSeconds,
        offSeconds: r.offSeconds,
      };
    })
    .sort((a, b) => a.level - b.level);
  if (new Set(rules.map((r) => r.level)).size !== value.length)
    throw new HttpError(400, 'Duplicate alarm level.');
  return rules;
}
export function alarmTelemetry(data: Record<string, unknown>) {
  if (data.alarmRevision === undefined && data.levelAlarms === undefined) return {};
  if (!Number.isSafeInteger(data.alarmRevision) || (data.alarmRevision as number) < 0)
    throw new HttpError(400, 'Invalid alarm revision.');
  const rules = validateRules(data.levelAlarms, true);
  const alarms = rules.map((rule) => {
    const a = (data.levelAlarms as LevelAlarm[]).find((a) => a.level === rule.level)!;
    if (
      typeof a.wet !== 'boolean' ||
      typeof a.acknowledged !== 'boolean' ||
      typeof a.active !== 'boolean' ||
      typeof a.episode !== 'string' ||
      (a.episode !== '' && !/^[a-f0-9]{32}$/.test(a.episode)) ||
      (a.level !== 20 && a.wet && !a.episode) ||
      (a.acknowledged && !a.episode) ||
      (a.active && (!alarmTriggered(a) || !a.enabled || a.acknowledged || !a.episode))
    )
      throw new HttpError(400, 'Invalid alarm state.');
    return {
      ...rule,
      wet: a.wet,
      episode: a.episode,
      acknowledged: a.acknowledged,
      active: a.active,
    };
  });
  return { alarmRevision: data.alarmRevision as number, levelAlarms: alarms };
}
export async function readAlarmSettings(env: ApiEnv, deviceId: string) {
  const row = await env.DB.prepare('SELECT revision,rules FROM alarm_settings WHERE device_id=?')
    .bind(deviceId)
    .first<{ revision: number; rules: string }>();
  const device = await env.DB.prepare('SELECT latest FROM devices WHERE id=?')
    .bind(deviceId)
    .first<{ latest: string | null }>();
  const reported = device?.latest ? (JSON.parse(device.latest) as Reading) : null;
  // Local Bluetooth edits are authoritative once a newer board revision uploads.
  if (
    reported?.levelAlarms?.length === 4 &&
    reported.alarmRevision !== undefined &&
    reported.alarmRevision > (row?.revision ?? 0)
  )
    return { revision: reported.alarmRevision, rules: validateRules(reported.levelAlarms) };
  return row
    ? { revision: row.revision, rules: validateRules(JSON.parse(row.rules)) }
    : { revision: 0, rules: defaultAlarmRules() };
}
async function deviceFor(env: ApiEnv, householdId: string) {
  const device = await env.DB.prepare(
    'SELECT id,last_seen,latest FROM devices WHERE household_id=? AND enabled=1',
  )
    .bind(householdId)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  if (!device) throw new HttpError(409, 'No enabled ESP32 is connected to this household.');
  return device;
}
export async function saveAlarmSettings(
  env: ApiEnv,
  householdId: string,
  data: Record<string, unknown>,
) {
  const rules = validateRules(data.rules);
  const device = await deviceFor(env, householdId);
  await env.DB.prepare(
    `INSERT INTO alarm_settings(device_id,revision,rules) VALUES(?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET revision=MAX(alarm_settings.revision,excluded.revision-1)+1,rules=excluded.rules`,
  )
    .bind(
      device.id,
      ((device.latest ? (JSON.parse(device.latest) as Reading).alarmRevision : 0) ?? 0) + 1,
      JSON.stringify(rules),
    )
    .run();
}
export async function acknowledgeAlarms(
  env: ApiEnv,
  householdId: string,
  data: Record<string, unknown>,
) {
  const device = await deviceFor(env, householdId);
  const now = Date.now();
  if (!device.last_seen || now - device.last_seen > 30000 || !device.latest)
    throw new HttpError(409, 'Reconnect the board before acknowledging.');
  const reading = JSON.parse(device.latest) as Reading;
  if (!Array.isArray(data.alarms) || !data.alarms.length || data.alarms.length > 4)
    throw new HttpError(400, 'Choose the active level alarms.');
  const seen = new Set<number>();
  const statements = data.alarms.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid acknowledgement.');
    const a = item as LevelAlarm;
    if (
      ![20, 50, 80, 100].includes(a.level) ||
      seen.has(a.level) ||
      typeof a.episode !== 'string' ||
      !/^[a-f0-9]{32}$/.test(a.episode)
    )
      throw new HttpError(400, 'Invalid acknowledgement.');
    seen.add(a.level);
    if (
      !reading.levelAlarms?.some(
        (current) => current.level === a.level && current.episode === a.episode && current.active,
      )
    )
      throw new HttpError(409, 'This alarm has changed. Refresh and try again.');
    return env.DB.prepare(
      `INSERT INTO alarm_acknowledgements(device_id,level,episode,expires_at,status) VALUES(?,?,?,?,'queued')
      ON CONFLICT(device_id,level,episode) DO UPDATE SET status='queued',expires_at=excluded.expires_at
      WHERE alarm_acknowledgements.status!='complete' AND alarm_acknowledgements.expires_at<?`,
    ).bind(device.id, a.level, a.episode, now + 60000, now);
  });
  await env.DB.batch(statements);
}
export async function alarmAcknowledgements(
  env: ApiEnv,
  deviceId: string,
): Promise<NonNullable<Household['alarmAcknowledgements']>> {
  const rows = await env.DB.prepare(
    'SELECT level,episode,status,expires_at FROM alarm_acknowledgements WHERE device_id=? AND expires_at>?',
  )
    .bind(deviceId, Date.now() - 60000)
    .all<{
      level: 20 | 50 | 80 | 100;
      episode: string;
      status: 'queued' | 'complete' | 'rejected';
      expires_at: number;
    }>();
  return rows.results.map((r) => ({
    level: r.level,
    episode: r.episode,
    status: r.status === 'queued' && r.expires_at < Date.now() ? 'expired' : r.status,
  }));
}
export async function alarmReply(env: ApiEnv, deviceId: string, reading: Reading, now: number) {
  if (!reading.levelAlarms || reading.alarmRevision === undefined) return {};
  await env.DB.prepare('DELETE FROM alarm_acknowledgements WHERE device_id=? AND expires_at<?')
    .bind(deviceId, now - 60000)
    .run();
  const rows = await env.DB.prepare(
    "SELECT level,episode,expires_at FROM alarm_acknowledgements WHERE device_id=? AND status='queued' AND expires_at>=?",
  )
    .bind(deviceId, now)
    .all<{ level: number; episode: string; expires_at: number }>();
  const pending: string[] = [];
  for (const row of rows.results) {
    const current = reading.levelAlarms.find((a) => a.level === row.level);
    if (current?.episode !== row.episode || !alarmTriggered(current) || current.acknowledged) {
      await env.DB.prepare(
        'UPDATE alarm_acknowledgements SET status=? WHERE device_id=? AND level=? AND episode=?',
      )
        .bind(
          current?.episode === row.episode && current.acknowledged ? 'complete' : 'rejected',
          deviceId,
          row.level,
          row.episode,
        )
        .run();
    } else pending.push(`${row.level}:${row.episode}:${Math.floor(row.expires_at / 1000)}`);
  }
  const config = await readAlarmSettings(env, deviceId);
  return {
    ...(config.revision > reading.alarmRevision && reading.levelAlarms.length === 4
      ? {
          'X-Waterline-Alarms': [
            'v2',
            config.revision,
            ...config.rules.flatMap((r) => [Number(r.enabled), r.onSeconds, r.offSeconds]),
          ].join(':'),
        }
      : {}),
    ...(pending.length ? { 'X-Waterline-Alarm-Ack': pending.join(',') } : {}),
  };
}
