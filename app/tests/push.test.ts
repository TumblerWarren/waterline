import { describe, expect, it } from 'vitest';
import { pushMessage, soundingAlarms, phoneAlarmMessage } from '../worker/push';
import { scenarioReading } from '../src/demo';

describe('phone alarm notifications', () => {
  const now = Date.now();
  const reading = () => ({
    ...scenarioReading('normal', now),
    levelAlarms: [
      {
        level: 50 as const,
        enabled: true,
        onSeconds: 10,
        offSeconds: 50,
        wet: true,
        active: true,
        acknowledged: false,
        episode: 'a'.repeat(32),
      },
    ],
  });
  it('uses data-only start/stop events with episode identity for native alarms', () => {
    const start=phoneAlarmMessage('token','device',20,'a'.repeat(32),'Tank','start').message;
    expect(start.data).toMatchObject({kind:'waterline_alarm',action:'start',device:'device',level:'20',episode:'a'.repeat(32)});
    expect(start).not.toHaveProperty('notification');expect(start.android.ttl).toBe('60s');
    const stop=phoneAlarmMessage('token','device',20,'a'.repeat(32),'Tank','stop').message;
    expect(stop.data.action).toBe('stop');expect(stop.android.ttl).toBe('86400s');
  });
  it('uses an audible high-priority notification on the alarm channel', () => {
    const message = pushMessage('test-token', 20, 'Roof tank').message;
    expect(message.notification.title).toContain('low water');
    expect(message.android).toMatchObject({
      priority: 'high',
      ttl: '60s',
      notification: { sound: 'default', channel_id: 'waterline_alarms_v1', visibility: 'PRIVATE' },
    });
  });
  it('notifies an active alarm but suppresses disabled, acknowledged, faulted and stale alarms', () => {
    expect(soundingAlarms(reading(), now)).toHaveLength(1);
    expect(soundingAlarms({ ...reading(), buzzerEnabled: false }, now)).toHaveLength(0);
    expect(soundingAlarms({ ...reading(), fault: 'Probe fault' }, now)).toHaveLength(0);
    expect(soundingAlarms({ ...reading(), measuredAt: now - 30001 }, now)).toHaveLength(0);
    const ack = reading();
    ack.levelAlarms[0].acknowledged = true;
    expect(soundingAlarms(ack, now)).toHaveLength(0);
  });
});
