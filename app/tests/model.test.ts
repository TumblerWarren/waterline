import { alarmAcknowledgementState, type LevelAlarm } from '../shared/model';
import { describe, expect, it } from 'vitest';
import { canTestBuzzer, mayManage, mayOperate, readingCondition } from '../shared/model';
import { scenarioReading } from '../src/demo';
const now = 1000000;
describe('device state and control permissions', () => {
  it.each([
    ['normal', 'healthy'],
    ['low', 'healthy'],
    ['full', 'healthy'],
    ['fault', 'fault'],
    ['offline', 'offline'],
    ['uncalibrated', 'uncalibrated'],
  ] as const)('reports %s correctly', (scenario, state) => {
    expect(readingCondition(scenarioReading(scenario, now), now)).toBe(state);
  });
  it('reports never-paired devices separately', () =>
    expect(readingCondition(null, now)).toBe('unpaired'));
  it('treats an old heartbeat as offline and blocks commands', () => {
    const reading = { ...scenarioReading('normal', now), lastSeen: now - 30001 };
    expect(readingCondition(reading, now)).toBe('offline');
    expect(canTestBuzzer('owner', reading, now)).toBe(false);
  });
  it('does not call old sensor measurements healthy even with a fresh heartbeat', () => {
    expect(
      readingCondition({ ...scenarioReading('normal', now), measuredAt: now - 30001 }, now),
    ).toBe('fault');
  });
  it('keeps a normally delayed cloud sample healthy across an app polling cycle', () => {
    const reading = { ...scenarioReading('normal', now), measuredAt: now - 5000 };
    expect(readingCondition(reading, now + 10000)).toBe('healthy');
    expect(readingCondition(reading, now + 20000)).toBe('healthy');
    expect(readingCondition(reading, now + 25001)).toBe('fault');
  });
  it('allows buzzer diagnosis during a sensor fault only for operators and owners', () => {
    const reading = scenarioReading('fault', now);
    expect(canTestBuzzer('viewer', reading, now)).toBe(false);
    expect(canTestBuzzer('operator', reading, now)).toBe(true);
    expect(canTestBuzzer('owner', reading, now)).toBe(true);
  });
  it('does not grant management to operators', () => {
    expect(mayManage('operator')).toBe(false);
    expect(mayManage('viewer')).toBe(false);
    expect(mayManage('owner')).toBe(true);
    expect(mayOperate('viewer')).toBe(false);
  });
});

describe('alarm acknowledgement display', () => {
  const alarm: LevelAlarm = {
    level: 50,
    enabled: true,
    onSeconds: 10,
    offSeconds: 50,
    episode: 'a'.repeat(32),
    wet: true,
    acknowledged: false,
    active: true,
  };
  it('keeps waiting until the board confirms the same episode', () => {
    expect(alarmAcknowledgementState([alarm], [alarm])).toBe('pending');
    expect(
      alarmAcknowledgementState([alarm], [{ ...alarm, acknowledged: true, active: false }]),
    ).toBe('confirmed');
  });
  it('does not confirm only some of an all-level request', () => {
    const second = { ...alarm, level: 80 as const, episode: 'b'.repeat(32) };
    expect(
      alarmAcknowledgementState([alarm, second], [{ ...alarm, acknowledged: true }, second]),
    ).toBe('pending');
  });
  it('replaces waiting text when the water event has changed', () => {
    expect(
      alarmAcknowledgementState([alarm], [{ ...alarm, wet: false, active: false, episode: '' }]),
    ).toBe('changed');
  });
});
