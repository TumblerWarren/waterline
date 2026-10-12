import { HttpError } from './auth';
import type { ApiEnv } from './index';
import type { Household, Reading } from '../shared/model';

export async function latestBuzzer(env: ApiEnv, deviceId: string) {
  const command = await env.DB.prepare(
    `SELECT id,action,requested_at AS requestedAt,expires_at AS expiresAt,status
    FROM buzzer_commands WHERE device_id = ? ORDER BY requested_at DESC LIMIT 1`,
  )
    .bind(deviceId)
    .first<NonNullable<Household['buzzerCommand']>>();
  if (command && ['queued', 'started'].includes(command.status) && command.expiresAt < Date.now())
    command.status = 'expired';
  return command;
}
export async function queueBuzzer(
  env: ApiEnv,
  householdId: string,
  subject: string,
  data: Record<string, unknown>,
) {
  if (!['buzzer.test', 'buzzer.enable', 'buzzer.disable'].includes(data.action as string))
    throw new HttpError(400, 'Choose test, enable or disable for the buzzer.');
  const now = Date.now();
  const device = await env.DB.prepare(
    'SELECT id,last_seen,latest FROM devices WHERE household_id = ? AND enabled = 1',
  )
    .bind(householdId)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  if (!device?.last_seen || now - device.last_seen > 30000 || !device.latest)
    throw new HttpError(409, 'Connect the ESP32 before using buzzer controls.');
  const reading = JSON.parse(device.latest) as Reading;
  if (!reading.buzzerControlSupported)
    throw new HttpError(409, 'Waiting for buzzer-control firmware.');
  const id = crypto.randomUUID().replaceAll('-', '');
  const result = await env.DB.prepare(
    `INSERT INTO buzzer_commands(id,device_id,action,requested_at,expires_at,status,requested_by)
    SELECT ?,?,?,?,?, 'queued',? WHERE NOT EXISTS(SELECT 1 FROM buzzer_commands WHERE device_id = ? AND
      ((status IN ('queued','started') AND expires_at > ?) OR requested_at > ?))`,
  )
    .bind(
      id,
      device.id,
      (data.action as string).slice(7),
      now,
      now + 60000,
      subject,
      device.id,
      now,
      now - 15000,
    )
    .run();
  if (result.meta.changes !== 1)
    throw new HttpError(409, 'Wait for the previous buzzer request to finish.');
}
export async function buzzerReply(
  env: ApiEnv,
  deviceId: string,
  data: Record<string, unknown>,
  reading: Reading,
  now: number,
) {
  if (!reading.buzzerControlSupported) return null;
  if (
    typeof data.buzzerCommandId === 'string' &&
    /^[a-f0-9]{32}$/.test(data.buzzerCommandId) &&
    ['started', 'rejected'].includes(data.buzzerCommandResult as string)
  ) {
    await env.DB.prepare(
      `UPDATE buzzer_commands SET status = ? WHERE id = ? AND device_id = ? AND
      (status = 'queued' OR (status = 'started' AND ? = 'rejected')) AND expires_at >= ?`,
    )
      .bind(data.buzzerCommandResult, data.buzzerCommandId, deviceId, data.buzzerCommandResult, now)
      .run();
    const command = await latestBuzzer(env, deviceId);
    if (
      command?.id === data.buzzerCommandId &&
      command.status === 'started' &&
      (command.action !== 'test' ||
        !reading.buzzerTestingUntil ||
        reading.buzzerTestingUntil <= now)
    ) {
      await env.DB.prepare(
        "UPDATE buzzer_commands SET status = 'complete' WHERE id = ? AND device_id = ? AND status = 'started'",
      )
        .bind(command.id, deviceId)
        .run();
    }
  }
  const command = await latestBuzzer(env, deviceId);
  return command?.status === 'queued'
    ? `${command.id}:${command.action}:${Math.floor(command.expiresAt / 1000)}`
    : null;
}
