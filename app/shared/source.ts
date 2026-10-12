import { hasFreshCloudMeasurement, type Reading } from './model';

export type ReadingSource = 'cloud' | 'bluetooth';
export type SourcePreference = ReadingSource | 'auto';

export function freshSource(reading: Reading | null, source: ReadingSource, now: number) {
  return Boolean(
    reading?.connected &&
    reading.lastSeen !== null &&
    now - reading.lastSeen <= (source === 'bluetooth' ? 15000 : 30000) &&
    hasFreshCloudMeasurement(reading, now) &&
    (source !== 'bluetooth' || now - reading.measuredAt! <= 15000),
  );
}

export function selectSource(
  preference: SourcePreference,
  cloud: Reading | null,
  bluetooth: Reading | null,
  now: number,
): ReadingSource {
  if (preference !== 'auto') return preference;
  if (freshSource(cloud, 'cloud', now)) return 'cloud';
  return freshSource(bluetooth, 'bluetooth', now) ? 'bluetooth' : 'cloud';
}
