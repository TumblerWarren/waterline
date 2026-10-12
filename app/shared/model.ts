export type Role = 'viewer' | 'operator' | 'owner';
export type Scenario = 'normal' | 'low' | 'full' | 'fault' | 'offline' | 'uncalibrated';
export type Band = 'low' | 'middle' | 'high' | 'upper-middle' | 'near-full' | 'full' | 'unknown';
export type ProbeState = 'wet' | 'dry' | 'unknown';
export type BuzzerAction = 'test' | 'enable' | 'disable';
export type AlarmLevel = 20 | 50 | 80 | 100;
export interface AlarmRule {
  level: AlarmLevel;
  enabled: boolean;
  onSeconds: number;
  offSeconds: number;
}
export interface LevelAlarm extends AlarmRule {
  episode: string;
  wet: boolean;
  acknowledged: boolean;
  active: boolean;
}
export const alarmTriggered = (alarm: Pick<LevelAlarm, 'level' | 'wet'>) =>
  alarm.level === 20 ? !alarm.wet : alarm.wet;
export function alarmAcknowledgementState(
  requested: Pick<LevelAlarm, 'level' | 'episode'>[],
  reported: LevelAlarm[] | undefined,
) {
  if (
    requested.length &&
    requested.every((r) =>
      reported?.some((a) => a.level === r.level && a.episode === r.episode && a.acknowledged),
    )
  )
    return 'confirmed';
  if (requested.some((r) => reported?.some((a) => a.level === r.level && a.episode !== r.episode)))
    return 'changed';
  return 'pending';
}
export const defaultAlarmRules = (): AlarmRule[] =>
  [20, 50, 80, 100].map((level) => ({
    level: level as AlarmLevel,
    enabled: true,
    onSeconds: level === 20 ? 60 : 10,
    offSeconds: level === 20 ? 540 : 50,
  }));
export interface Probe {
  level: 20 | 50 | 80 | 100;
  gpio: number;
  state: ProbeState;
  median: number;
  raw?: number;
  calibrated: boolean;
  calibration?: {
    dry: number;
    wet: number;
    dryReady: boolean;
    wetReady: boolean;
    capture: 'none' | 'dry' | 'wet';
    cycles: number;
    targetCycles?: number;
    dryNoise?: number;
    wetNoise?: number;
  };
}
export interface Reading {
  band: Band;
  connected: boolean;
  fault: string | null;
  calibrated: boolean;
  measuredAt: number | null;
  lastSeen: number | null;
  probes: Probe[];
  buzzerEnabled: boolean;
  buzzerTestingUntil: number | null;
  calibrationSupported?: boolean;
  buzzerControlSupported?: boolean;
  alarmRevision?: number;
  levelAlarms?: LevelAlarm[];
}
export interface CalibrationCommand {
  id: string;
  mode: 'dry' | 'wet';
  requestedAt: number;
  expiresAt: number;
  status: 'queued' | 'started' | 'complete' | 'rejected' | 'expired';
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  isYou: boolean;
}
export interface Invitation {
  id: string;
  email: string;
  role: 'viewer' | 'operator';
  expiresAt: number;
}
export interface Activity {
  id: string;
  at: number;
  title: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning';
}
export interface Alert {
  id: string;
  title: string;
  detail: string;
  at: number;
  acknowledged: boolean;
}
export interface HistoryPoint {
  at: number;
  band: Band | 'offline';
}
export interface Preferences {
  low: boolean;
  full: boolean;
  fault: boolean;
  offline: boolean;
}
export interface Household {
  id: string;
  name: string;
  tankName: string;
  role: Role;
  reading: Reading | null;
  members: Member[];
  invitations: Invitation[];
  activities: Activity[];
  alerts: Alert[];
  history: HistoryPoint[];
  preferences: Preferences;
  calibrationCommand?: CalibrationCommand | null;
  alarmSettings?: { revision: number; rules: AlarmRule[] };
  alarmAcknowledgements?: {
    level: AlarmLevel;
    episode: string;
    status: 'queued' | 'complete' | 'rejected' | 'expired';
  }[];
  buzzerCommand?: {
    id: string;
    action: BuzzerAction;
    requestedAt: number;
    expiresAt: number;
    status: 'queued' | 'started' | 'complete' | 'rejected' | 'expired';
  } | null;
}
export const bandLabels: Record<Band, string> = {
  low: 'Below 20%',
  middle: '20–50%',
  high: '50–100%', // Legacy three-probe readings remain accurately labeled.
  'upper-middle': '50–80%',
  'near-full': '80–100%',
  full: 'Full',
  unknown: 'Unknown',
};
export function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'operator' || value === 'viewer';
}
export function mayOperate(role: Role) {
  return role === 'operator' || role === 'owner';
}
export function mayManage(role: Role) {
  return role === 'owner';
}
export function readingCondition(reading: Reading | null, now: number) {
  if (!reading) return 'unpaired';
  if (!reading.connected || reading.lastSeen === null || now - reading.lastSeen > 30_000)
    return 'offline';
  if (!reading.calibrated) return 'uncalibrated';
  if (
    reading.fault ||
    reading.measuredAt === null ||
    !hasFreshCloudMeasurement(reading, now) ||
    reading.band === 'unknown'
  )
    return 'fault';
  return 'healthy';
}
// Five-second sampling + ten-second upload + ten-second app polling can make a
// valid displayed sample 25 seconds old. Device-side staleness stays stricter.
export const CLOUD_MEASUREMENT_MAX_AGE_MS = 30_000;
export function hasFreshCloudMeasurement(reading: Reading | null, now: number) {
  return (
    reading?.measuredAt !== null &&
    reading?.measuredAt !== undefined &&
    now - reading.measuredAt <= CLOUD_MEASUREMENT_MAX_AGE_MS
  );
}
export function canTestBuzzer(role: Role, reading: Reading | null, now: number) {
  // Diagnostics may test a buzzer with sensor faults; they still require a fresh connection.
  return (
    mayOperate(role) &&
    reading !== null &&
    reading.connected &&
    reading.lastSeen !== null &&
    now - reading.lastSeen <= 30_000
  );
}
