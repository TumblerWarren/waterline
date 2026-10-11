import { useEffect, useRef, useState } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import {
  BLE_SERVICE,
  BLE_REQUEST,
  BLE_RESPONSE,
  nearbyReading,
  nearbySettings,
} from '../../shared/nearby';
import {
  bandLabels,
  type Reading,
  type Household,
  type AlarmRule,
  type LevelAlarm,
} from '../../shared/model';
import { ProbesPage } from './ProbesPage';
import { LevelAlarms } from './LevelAlarms';

export function NearbyBoard({ cloudAvailable = true }: { cloudAvailable?: boolean }) {
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Use Bluetooth when your board has no Wi-Fi or internet.'),
    [reading, setReading] = useState<Reading | null>(null);
  const device = useRef(''),
    working = useRef(false),
    alive = useRef(true);
  const autoAttempted = useRef(false);
  const readingRef = useRef(reading);
  readingRef.current = reading;
  async function command(action: string) {
    const target = device.current;
    if (!target) throw new Error('Connect to the nearby board first.');
    const id = crypto.randomUUID().slice(0, 8);
    const bytes = new TextEncoder().encode(`${id}|${action}`);
    await BleClient.write(target, BLE_SERVICE, BLE_REQUEST, new DataView(bytes.buffer));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && device.current === target) {
      const value = await BleClient.read(target, BLE_SERVICE, BLE_RESPONSE);
      const text = new TextDecoder().decode(value);
      if (text.startsWith(`${id}|`)) {
        const result = text.substring(id.length + 1);
        if (result.startsWith('ERROR'))
          throw new Error(result.substring(6) || 'Board could not complete the request.');
        return result;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error(
      'Board did not confirm. Reconnect and check its current state before retrying.',
    );
  }
  async function refresh() {
    const capturedAt = Date.now();
    let text = '';
    for (let offset = 0; offset <= 4096; offset += 450) {
      const result = await command(`read:${offset}`);
      if (!result.startsWith('DATA:')) throw new Error('Unsupported board response.');
      const chunk = result.substring(5);
      text += chunk;
      if (chunk.length < 450) {
        const data = nearbyReading(text, capturedAt, Date.now());
        if (alive.current) {
          setReading(data);
          setStatus('Connected over encrypted Bluetooth. Readings refresh every five seconds.');
        }
        return;
      }
    }
    throw new Error('Board snapshot was too large.');
  }
  async function perform(task: () => Promise<void>) {
    if (working.current) throw new Error('Wait for the current board request.');
    working.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function disconnect() {
    localStorage.removeItem('waterline-nearby-device');
    const id = device.current;
    device.current = '';
    setConnected(false);
    setReading(null);
    if (id) await BleClient.disconnect(id).catch(() => undefined);
    setStatus('Disconnected. Cloud readings remain available when internet returns.');
  }
  async function connect(savedId?: string) {
    await perform(async () => {
      let id = '';
      try {
        await BleClient.initialize({ androidNeverForLocation: true });
        id = savedId || (await BleClient.requestDevice({ services: [BLE_SERVICE] })).deviceId;
        if (!alive.current) return;
        setStatus(
          'Connecting… accept Android pairing and enter the code from the board’s Bluetooth setup page.',
        );
        await BleClient.connect(id, () => {
          if (device.current === id) {
            device.current = '';
            if (alive.current) {
              setConnected(false);
              setReading(null);
              setStatus('Bluetooth disconnected. Move closer and reconnect.');
            }
          }
        });
        if (!alive.current) {
          await BleClient.disconnect(id);
          return;
        }
        device.current = id;
        if (!(await BleClient.isBonded(id))) await BleClient.createBond(id, { timeout: 60000 });
        if (device.current !== id) throw new Error('Pairing failed. Check the code and try again.');
        await refresh();
        if (alive.current) {
          setConnected(true);
          localStorage.setItem('waterline-nearby-device', id);
        }
      } catch (e) {
        device.current = '';
        if (id) await BleClient.disconnect(id).catch(() => undefined);
        if (alive.current) {
          setConnected(false);
          setReading(null);
          setStatus(e instanceof Error ? e.message : 'Unable to connect.');
        }
      }
    });
  }
  useEffect(() => {
    if (cloudAvailable) {
      autoAttempted.current = false;
      return;
    }
    if (device.current || working.current || autoAttempted.current) return;
    const saved = localStorage.getItem('waterline-nearby-device');
    if (!saved) return;
    autoAttempted.current = true;
    const timer = window.setTimeout(() => void connect(saved).catch(() => undefined), 2000);
    return () => window.clearTimeout(timer);
  }, [cloudAvailable]);
  useEffect(() => {
    alive.current = true;
    const timer = window.setInterval(() => {
      if (!device.current || working.current || document.visibilityState === 'hidden') return;
      working.current = true;
      void refresh()
        .catch((e) => {
          if (alive.current) {
            setReading(null);
            setStatus(e instanceof Error ? e.message : 'Reading failed.');
          }
        })
        .finally(() => {
          working.current = false;
        });
    }, 5000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      const id = device.current;
      device.current = '';
      if (id) void BleClient.disconnect(id).catch(() => undefined);
    };
  }, []);
  const now = Date.now();
  const fresh = !!reading?.measuredAt && now - reading.measuredAt < 15000;
  const localHome: Household = {
    id: 'nearby',
    name: 'Nearby board',
    tankName: 'Rooftop tank',
    role: 'owner',
    reading,
    members: [],
    invitations: [],
    activities: [],
    alerts: [],
    history: [],
    preferences: { low: false, full: false, fault: false, offline: false },
    alarmSettings: reading?.levelAlarms
      ? { revision: reading.alarmRevision!, rules: reading.levelAlarms }
      : undefined,
  };
  async function control(action: string) {
    await perform(async () => {
      await command(action);
      await refresh();
    });
  }
  async function save(rules: AlarmRule[]) {
    await control(nearbySettings(readingRef.current?.alarmRevision ?? -1, rules));
  }
  async function acknowledge(alarms: LevelAlarm[]) {
    await perform(async () => {
      for (const a of alarms) await command(`ack:${a.level}:${a.episode}`);
      await refresh();
    });
  }
  return (
    <details className="panel nearby-panel" open={!cloudAvailable || connected}>
      <summary>
        <strong>Nearby board · Bluetooth</strong>
        {connected ? ' · Connected' : ''}
      </summary>
      <p role="status">{status}</p>
      <p>
        After you connect once, Waterline tries that paired board when cloud readings are
        unavailable. Bluetooth works nearby while the app is open.
      </p>
      <p>
        First pairing: open the board’s local <strong>Bluetooth setup page (/bluetooth)</strong>{' '}
        using its admin login. Keep that private six-digit code for Android’s pairing prompt. Paired
        phones have local control access independently of cloud accounts. Revoke phones on that
        setup page.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void (connected ? disconnect() : connect()).catch((e) => setStatus(String(e)))
        }
      >
        {busy ? 'Please wait…' : connected ? 'Disconnect Bluetooth' : 'Connect nearby board'}
      </button>
      {connected && reading ? (
        <>
          <h2>{bandLabels[reading.band]}</h2>
          <p>
            Live nearby reading. Cloud history and remote phone notifications resume when the board
            reconnects to internet.
          </p>
          <ProbesPage reading={reading} now={now} preview={false} />
          <div className="nearby-actions">
            {['test', 'enable', 'disable'].map((action) => (
              <button
                key={action}
                className="button secondary"
                disabled={busy || !fresh}
                onClick={() => void control(action).catch((e) => setStatus(String(e)))}
              >
                {action === 'test'
                  ? 'Test buzzer · 10 seconds'
                  : action === 'enable'
                    ? 'Enable local alarm'
                    : 'Disable local alarm'}
              </button>
            ))}
          </div>
          <p>A buzzer test disables automatic sound; enable the local alarm again afterward.</p>
          <LevelAlarms
            home={localHome}
            now={now}
            preview={false}
            save={save}
            acknowledge={acknowledge}
            transport="bluetooth"
          />
          <LevelAlarms
            key={reading.alarmRevision}
            home={localHome}
            now={now}
            preview={false}
            edit
            save={save}
            acknowledge={acknowledge}
            transport="bluetooth"
          />
        </>
      ) : null}
    </details>
  );
}
