import type { AlarmRule, Band, LevelAlarm, Probe, Reading } from './model';
export const BLE_SERVICE = 'b0a10000-5b7d-4fb0-9b7d-1b4ea17e0001';
export const BLE_REQUEST = 'b0a10001-5b7d-4fb0-9b7d-1b4ea17e0001';
export const BLE_RESPONSE = 'b0a10002-5b7d-4fb0-9b7d-1b4ea17e0001';
const levels = [20, 50, 80, 100] as const;
const pins = [36, 34, 33, 32];
function invalid(): never {
  throw new Error('The nearby board returned an unsupported reading.');
}
export function nearbyReading(text: string, capturedAt: number, receivedAt = capturedAt): Reading {
  const data = JSON.parse(text);
  if (
    data.protocol !== 1 ||
    data.deviceId !== 'rooftop-esp32' ||
    !Array.isArray(data.probes) ||
    data.probes.length !== 4 ||
    typeof data.fault !== 'string' ||
    typeof data.buzzerEnabled !== 'boolean' ||
    !Number.isInteger(data.buzzerTestRemainingMs) ||
    data.buzzerTestRemainingMs < 0 ||
    data.buzzerTestRemainingMs > 10000 ||
    !(
      data.measurementAgeMs === null ||
      (Number.isInteger(data.measurementAgeMs) &&
        data.measurementAgeMs >= 0 &&
        data.measurementAgeMs <= 0xffffffff)
    )
  )
    invalid();
  const probes: Probe[] = levels.map((level, i) => {
    const p = data.probes.find((p: { level: number }) => p.level === level);
    if (
      !p ||
      p.gpio !== pins[i] ||
      typeof p.calibrated !== 'boolean' ||
      typeof p.state !== 'string' ||
      p.state.length > 160 ||
      ![p.raw, p.median].every((n) => Number.isInteger(n) && n >= 0 && n <= 4095)
    )
      invalid();
    const c = p.calibration;
    if (
      !c ||
      ![c.dry, c.wet, c.dryNoise, c.wetNoise].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 4095,
      ) ||
      typeof c.dryReady !== 'boolean' ||
      typeof c.wetReady !== 'boolean' ||
      !['none', 'dry', 'wet'].includes(c.capture) ||
      c.targetCycles !== 20 ||
      !Number.isInteger(c.cycles) ||
      c.cycles < 0 ||
      c.cycles > 20
    )
      invalid();
    return {
      ...p,
      state:
        p.calibrated && p.median < 4080
          ? p.state === 'WET'
            ? 'wet'
            : p.state === 'DRY'
              ? 'dry'
              : 'unknown'
          : 'unknown',
    };
  });
  const calibrated = probes.every((p) => p.calibrated);
  let fault: string | null = data.fault === 'None' ? null : data.fault;
  if (!calibrated) fault = 'Calibration required';
  if (
    probes.some(
      (p, i) => p.state === 'wet' && probes.slice(0, i).some((lower) => lower.state === 'dry'),
    )
  )
    fault = 'Probes disagree';
  if (probes.some((p) => p.median >= 4080)) fault = 'ADC saturation';
  if (data.measurementAgeMs === null || receivedAt - capturedAt + data.measurementAgeMs > 15000)
    fault = 'Waiting for fresh measurement';
  let band: Band = 'unknown';
  if (calibrated && !fault && probes.every((p) => p.state !== 'unknown'))
    band =
      probes[3].state === 'wet'
        ? 'full'
        : probes[2].state === 'wet'
          ? 'near-full'
          : probes[1].state === 'wet'
            ? 'upper-middle'
            : probes[0].state === 'wet'
              ? 'middle'
              : 'low';
  if (
    !Number.isInteger(data.alarmRevision) ||
    data.alarmRevision < 0 ||
    data.alarmRevision > 0xffffffff ||
    !Array.isArray(data.levelAlarms) ||
    data.levelAlarms.length !== 4
  )
    invalid();
  const alarms: LevelAlarm[] = levels.map((level) => {
    const a = data.levelAlarms.find((a: { level: number }) => a.level === level);
    if (
      !a ||
      ![a.enabled, a.wet, a.active, a.acknowledged].every((v) => typeof v === 'boolean') ||
      !Number.isInteger(a.onSeconds) ||
      a.onSeconds < 1 ||
      a.onSeconds > 60 ||
      !Number.isInteger(a.offSeconds) ||
      a.offSeconds < 1 ||
      a.offSeconds > 3600 ||
      typeof a.episode !== 'string' ||
      (a.episode !== '' && !/^[a-f0-9]{32}$/.test(a.episode))
    )
      invalid();
    return a;
  });
  return {
    band,
    fault,
    calibrated,
    connected: true,
    measuredAt: data.measurementAgeMs === null ? null : capturedAt - data.measurementAgeMs,
    lastSeen: receivedAt,
    probes,
    buzzerEnabled: data.buzzerEnabled,
    buzzerTestingUntil: data.buzzerTestRemainingMs ? capturedAt + data.buzzerTestRemainingMs : null,
    buzzerControlSupported: true,
    alarmRevision: data.alarmRevision,
    levelAlarms: alarms,
  };
}
export function nearbySettings(revision: number, rules: AlarmRule[]) {
  if (!Number.isInteger(revision) || revision < 0 || revision >= 0xffffffff || rules.length !== 4)
    throw new Error('Refresh board settings before saving.');
  const sorted = levels.map((level) => rules.find((r) => r.level === level));
  if (
    sorted.some(
      (r) =>
        !r ||
        typeof r.enabled !== 'boolean' ||
        !Number.isInteger(r.onSeconds) ||
        r.onSeconds < 1 ||
        r.onSeconds > 60 ||
        !Number.isInteger(r.offSeconds) ||
        r.offSeconds < 1 ||
        r.offSeconds > 3600,
    )
  )
    throw new Error('Sound must be 1–60 seconds; silence must be 1–3600 seconds.');
  return `settings:v2:${revision + 1}:${sorted.flatMap((r) => [r!.enabled ? 1 : 0, r!.onSeconds, r!.offSeconds]).join(':')}`;
}
