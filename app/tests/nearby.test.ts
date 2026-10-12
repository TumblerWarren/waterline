import { describe, it, expect } from 'vitest';
import { nearbyReading, nearbySettings } from '../shared/nearby';
import { defaultAlarmRules } from '../shared/model';
const now = 100000;
function sample() {
  return {
    protocol: 1,
    deviceId: 'rooftop-esp32',
    fault: 'None',
    measurementAgeMs: 1000,
    buzzerEnabled: true,
    buzzerTestRemainingMs: 0,
    alarmRevision: 5,
    probes: [20, 50, 80, 100].map((level, i) => ({
      level,
      gpio: [36, 34, 33, 32][i],
      raw: level === 100 ? 0 : 1700,
      median: level === 100 ? 0 : 1700,
      state: level === 100 ? 'DRY' : 'WET',
      calibrated: true,
      calibration: {
        dry: 0,
        wet: 1700,
        dryReady: true,
        wetReady: true,
        capture: 'none',
        cycles: 0,
        targetCycles: 20,
        dryNoise: 0,
        wetNoise: 10,
      },
    })),
    levelAlarms: defaultAlarmRules().map((r) => ({
      ...r,
      wet: r.level !== 100,
      active: r.level === 50 || r.level === 80,
      acknowledged: false,
      episode: r.level === 50 || r.level === 80 ? 'a'.repeat(32) : '',
    })),
  };
}
describe('nearby board transport', () => {
  it('normalizes a four-probe snapshot and uses local measurement age without a board wall clock', () => {
    const data = nearbyReading(JSON.stringify(sample()), now, now + 2000);
    expect(data.band).toBe('near-full');
    expect(data.measuredAt).toBe(now - 1000);
    expect(data.lastSeen).toBe(now + 2000);
    expect(data.probes[0].raw).toBe(1700);
  });
  it('suppresses a stale or inconsistent level', () => {
    const input = sample();
    input.probes[0].state = 'DRY';
    expect(nearbyReading(JSON.stringify(input), now).band).toBe('unknown');
    expect(nearbyReading(JSON.stringify(sample()), now, now + 16000).fault).toBe(
      'Waiting for fresh measurement',
    );
  });
  it('shows confirming and uncalibrated states safely', () => {
    const input = sample();
    input.probes[0].state = 'Confirming';
    expect(nearbyReading(JSON.stringify(input), now).band).toBe('unknown');
    input.probes[0].calibrated = false;
    input.probes[0].state = 'UNCALIBRATED / wet-dry difference must exceed 500';
    expect(nearbyReading(JSON.stringify(input), now).calibrated).toBe(false);
  });
  it('rejects foreign board protocols and invalid ADC values', () => {
    const input = sample();
    input.protocol = 2;
    expect(() => nearbyReading(JSON.stringify(input), now)).toThrow();
    input.protocol = 1;
    input.probes[0].median = 5000;
    expect(() => nearbyReading(JSON.stringify(input), now)).toThrow();
  });
  it('encodes bounded four-rule edits with the next board revision', () => {
    expect(nearbySettings(5, defaultAlarmRules())).toBe(
      'settings:v2:6:1:60:540:1:10:50:1:10:50:1:10:50',
    );
    expect(() =>
      nearbySettings(
        5,
        defaultAlarmRules().map((r) => ({ ...r, onSeconds: 61 })),
      ),
    ).toThrow();
  });
});
