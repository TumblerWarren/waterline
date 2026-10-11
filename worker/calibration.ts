import { HttpError } from './auth';
import type { ApiEnv } from './index';
import { hasFreshCloudMeasurement, type CalibrationCommand, type Reading } from '../shared/model';

export async function latestCalibration(env: ApiEnv, deviceId: string) {
  const command = await env.DB.prepare(
    `SELECT id,mode,requested_at AS requestedAt,expires_at AS expiresAt,status
    FROM calibration_commands WHERE device_id = ? ORDER BY requested_at DESC LIMIT 1`,
  )
    .bind(deviceId)
    .first<CalibrationCommand>();
  if (
    command &&
    (command.status === 'queued' || command.status === 'started') &&
    command.expiresAt < Date.now()
  )
    command.status = 'expired';
  return command;
}
export async function queueCalibration(
  env: ApiEnv,
  householdId: string,
  subject: string,
  data: Record<string, unknown>,
) {
  if ((data.mode !== 'dry' && data.mode !== 'wet') || data.prepared !== true)
    throw new HttpError(400, 'Confirm the electrodes are prepared for this capture.');
  const now = Date.now();
  const device = await env.DB.prepare(
    'SELECT id,last_seen,latest FROM devices WHERE household_id = ? AND enabled = 1',
  )
    .bind(householdId)
    .first<{ id: string; last_seen: number | null; latest: string | null }>();
  if (!device?.last_seen || now - device.last_seen > 30000 || !device.latest)
    throw new HttpError(409, 'Connect the ESP32 before calibrating.');
  const reading = JSON.parse(device.latest) as Reading;
  if (!reading.calibrationSupported || !hasFreshCloudMeasurement(reading, now))
    throw new HttpError(409, 'Waiting for fresh calibration-capable firmware readings.');
  if (reading.probes.some((p) => !p.calibration || p.calibration.capture !== 'none'))
    throw new HttpError(409, 'Wait for the active capture to finish.');
  if (data.mode === 'wet' && reading.probes.some((p) => !p.calibration?.dryReady))
    throw new HttpError(409, 'Capture DRY on all four probes first.');
  const id = crypto.randomUUID().replaceAll('-', '');
  // One conditional SQL statement prevents concurrent clicks creating two captures.
  const result = await env.DB.prepare(
    `INSERT INTO calibration_commands(id,device_id,mode,requested_at,expires_at,status,requested_by)
    SELECT ?,?,?,?,?, 'queued',? WHERE NOT EXISTS(SELECT 1 FROM calibration_commands
      WHERE device_id = ? AND ((status IN ('queued','started') AND expires_at > ?) OR requested_at > ?))`,
  )
    .bind(id, device.id, data.mode, now, now + 300000, subject, device.id, now, now - 120000)
    .run();
  if (result.meta.changes !== 1)
    throw new HttpError(409, 'A capture was just requested. Wait for its result.');
}
export async function calibrationReply(
  env: ApiEnv,
  deviceId: string,
  data: Record<string, unknown>,
  reading: Reading,
  now: number,
) {
  if (!reading.calibrationSupported) return null;
  if (
    typeof data.calibrationCommandId === 'string' &&
    /^[a-f0-9]{32}$/.test(data.calibrationCommandId) &&
    (data.calibrationCommandResult === 'started' || data.calibrationCommandResult === 'rejected')
  ) {
    await env.DB.prepare(
      `UPDATE calibration_commands SET status = ? WHERE id = ? AND device_id = ? AND
       (status = 'queued' OR (status = 'started' AND ? = 'rejected')) AND expires_at >= ?`,
    )
      .bind(
        data.calibrationCommandResult,
        data.calibrationCommandId,
        deviceId,
        data.calibrationCommandResult,
        now,
      )
      .run();
    const command = await latestCalibration(env, deviceId);
    if (
      command?.id === data.calibrationCommandId &&
      command.status === 'started' &&
      reading.probes.every(
        (p) =>
          p.calibration?.capture === 'none' &&
          (command.mode === 'dry' ? p.calibration.dryReady : p.calibration.wetReady),
      )
    ) {
      await env.DB.prepare(
        "UPDATE calibration_commands SET status = 'complete' WHERE id = ? AND device_id = ? AND status = 'started'",
      )
        .bind(command.id, deviceId)
        .run();
    }
  }
  const command = await latestCalibration(env, deviceId);
  return command?.status === 'queued'
    ? `${command.id}:${command.mode}:${Math.floor(command.expiresAt / 1000)}`
    : null;
}
