import { importPKCS8, SignJWT } from 'jose';
import { HttpError } from './auth';
import type { ApiEnv } from './index';
import type { Reading } from '../shared/model';

export function pushConfigured(env: ApiEnv) {
  return Boolean(env.FCM_SERVICE_ACCOUNT);
}
export async function registerPush(env: ApiEnv, subject: string, data: Record<string, unknown>) {
  if (
    typeof data.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(data.id) ||
    typeof data.token !== 'string' ||
    data.token.length < 20 ||
    data.token.length > 2048 ||
    !/^[a-zA-Z0-9_:\-]+$/.test(data.token)
  )
    throw new HttpError(400, 'Invalid phone registration.');
  const existing = await env.DB.prepare(
    'SELECT subject FROM push_installations WHERE id=? OR token=?',
  )
    .bind(data.id, data.token)
    .all<{ subject: string }>();
  if (existing.results.some((p) => p.subject !== subject))
    throw new HttpError(
      409,
      'This phone belongs to another signed-in account. Disable notifications before switching accounts.',
    );
  await env.DB.prepare(
    `INSERT INTO push_installations(id,subject,token,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET token=excluded.token,enabled=1,updated_at=excluded.updated_at WHERE subject=excluded.subject`,
  )
    .bind(data.id, subject, data.token, Date.now())
    .run();
}
export async function disablePush(env: ApiEnv, subject: string, data: Record<string, unknown>) {
  if (typeof data.id !== 'string') throw new HttpError(400, 'Invalid phone registration.');
  await env.DB.prepare('DELETE FROM push_installations WHERE id=? AND subject=?')
    .bind(data.id, subject)
    .run();
}
export function soundingAlarms(reading: Reading, now: number) {
  if (
    !reading.buzzerEnabled ||
    reading.fault ||
    !reading.calibrated ||
    reading.measuredAt === null ||
    now - reading.measuredAt > 30000
  )
    return [];
  return (
    reading.levelAlarms?.filter((a) => a.enabled && a.active && !a.acknowledged && a.episode) ?? []
  );
}
export async function queueAlarmPush(env: ApiEnv, deviceId: string, reading: Reading, now: number) {
  const alarms = soundingAlarms(reading, now);
  const inserts = alarms.map((a) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO push_deliveries(installation_id,device_id,level,episode,next_at,created_at)
    SELECT p.id,d.id,?,?,?,? FROM push_installations p JOIN memberships m ON m.subject=p.subject
    JOIN devices d ON d.household_id=m.household_id WHERE d.id=? AND p.enabled=1 AND p.updated_at>?`,
    ).bind(a.level, a.episode, now, now, deviceId, now - 90 * 86400000),
  );
  if (inserts.length) await env.DB.batch(inserts);
}
async function googleToken(env: ApiEnv) {
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT!);
  if (
    account.project_id !== 'gen-lang-client-0607918582' ||
    typeof account.client_email !== 'string' ||
    typeof account.private_key !== 'string'
  )
    throw new Error('Invalid FCM configuration');
  const key = await importPKCS8(account.private_key, 'RS256');
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(4000),
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) throw new Error('FCM authorization unavailable');
  const data = await response.json<{ access_token: string }>();
  return data.access_token;
}
export function pushMessage(token: string, level: number, tank: string) {
  return {
    message: {
      token,
      notification: {
        title: level === 20 ? 'Waterline: low water' : `Waterline: ${level}% reached`,
        body: `${tank}: ${level === 20 ? 'water is below 20%' : `water has reached ${level}%`}. Open Waterline to check or acknowledge the alarm.`,
      },
      data: { page: 'overview', level: String(level) },
      android: {
        priority: 'high',
        ttl: '60s',
        notification: {
          channel_id: 'waterline_alarms_v1',
          sound: 'default',
          tag: `waterline-level-${level}`,
          visibility: 'PRIVATE',
        },
      },
    },
  };
}
export async function deliverPush(env: ApiEnv) {
  if (!pushConfigured(env)) return;
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT j.*,p.token,d.latest,d.last_seen,h.tank_name FROM push_deliveries j
    JOIN push_installations p ON p.id=j.installation_id JOIN memberships m ON m.subject=p.subject
    JOIN devices d ON d.id=j.device_id AND d.household_id=m.household_id JOIN households h ON h.id=d.household_id
    WHERE p.enabled=1 AND d.enabled=1 AND (j.status='pending' OR j.status='sending') AND j.next_at<=? LIMIT 4`,
  )
    .bind(now)
    .all<{
      installation_id: string;
      device_id: string;
      level: number;
      episode: string;
      token: string;
      latest: string;
      last_seen: number;
      tank_name: string;
      attempts: number;
    }>();
  if (!rows.results.length) return;
  let access = '';
  for (const row of rows.results) {
    const identity = [row.installation_id, row.device_id, row.level, row.episode];
    const valid =
      row.last_seen >= now - 30000 &&
      row.latest &&
      soundingAlarms(JSON.parse(row.latest), now).some(
        (a) => a.level === row.level && a.episode === row.episode,
      );
    if (!valid || row.attempts >= 5) {
      await env.DB.prepare(
        "UPDATE push_deliveries SET status='cancelled' WHERE installation_id=? AND device_id=? AND level=? AND episode=?",
      )
        .bind(...identity)
        .run();
      continue;
    }
    const claimed = await env.DB.prepare(
      "UPDATE push_deliveries SET status='sending',attempts=attempts+1,next_at=? WHERE installation_id=? AND device_id=? AND level=? AND episode=? AND status IN ('pending','sending') AND next_at<=?",
    )
      .bind(now + 60000, ...identity, now)
      .run();
    if (!claimed.meta.changes) continue;
    try {
      access ||= await googleToken(env);
      const result = await fetch(
        'https://fcm.googleapis.com/v1/projects/gen-lang-client-0607918582/messages:send',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(4000),
          body: JSON.stringify(pushMessage(row.token, row.level, row.tank_name)),
        },
      );
      if (result.ok)
        await env.DB.prepare(
          "UPDATE push_deliveries SET status='sent' WHERE installation_id=? AND device_id=? AND level=? AND episode=?",
        )
          .bind(...identity)
          .run();
      else {
        const error = await result.json<{ error?: { details?: { errorCode?: string }[] } }>();
        if (error.error?.details?.some((d) => d.errorCode === 'UNREGISTERED'))
          await env.DB.prepare('DELETE FROM push_installations WHERE id=? AND token=?')
            .bind(row.installation_id, row.token)
            .run();
        else console.error(JSON.stringify({ event: 'push_send_failed', status: result.status }));
      }
    } catch {
      console.error(JSON.stringify({ event: 'push_send_retry' }));
    }
  }
}
