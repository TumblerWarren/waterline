import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import {
  BLE_SERVICE,
  BLE_REQUEST,
  BLE_RESPONSE,
  nearbyReading,
  nearbySettings,
} from '../../shared/nearby';
import { type Reading, type Household, type AlarmRule, type LevelAlarm } from '../../shared/model';
import { isNative } from '../native';
import { Bluetooth, ShieldCheck, WifiOff } from 'lucide-react';

function useNearbyState() {
  const [cloudAvailable, setCloudAvailable] = useState(true);
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Use Bluetooth when your board has no Wi-Fi or internet.'),
    [reading, setReading] = useState<Reading | null>(null);
  const device = useRef(''),
    working = useRef(false),
    alive = useRef(true);
  const autoAttempted = useRef(false);
  const activeTarget = useRef('');
  const readingRef = useRef(reading);
  readingRef.current = reading;
  async function command(action: string) {
    const target = device.current;
    if (!target) throw new Error('Connect to the nearby board first.');
    if (activeTarget.current && activeTarget.current !== target)
      throw new Error('Bluetooth connection changed. Please retry.');
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
    activeTarget.current = device.current;
    setBusy(true);
    try {
      await task();
    } finally {
      working.current = false;
      activeTarget.current = '';
      if (alive.current) setBusy(false);
    }
  }
  async function disconnect() {
    if (working.current) throw new Error('Wait for the current board request.');
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
    if (!isNative) return;
    if (cloudAvailable) {
      autoAttempted.current = false;
      return;
    }
    if (device.current || working.current || autoAttempted.current) return;
    const saved = localStorage.getItem('waterline-nearby-device');
    if (!saved) return;
    const timer = window.setTimeout(() => {
      autoAttempted.current = true;
      void connect(saved).catch(() => undefined);
    }, 2000);
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
  return {
    connected,
    busy,
    status,
    reading,
    localHome,
    connect,
    disconnect,
    control,
    save,
    acknowledge,
    setCloudAvailable,
  };
}
const NearbyContext = createContext<ReturnType<typeof useNearbyState> | null>(null);
export function NearbyProvider({ children }: { children: ReactNode }) {
  const value = useNearbyState();
  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>;
}
export function useNearby() {
  const value = useContext(NearbyContext);
  if (!value) throw new Error('NearbyProvider is required.');
  return value;
}
export function NearbyBoard() {
  const nearby = useNearby();
  return (
    <section className="bluetooth-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLOSER TO HOME</p>
          <h1>Connect nearby.</h1>
          <p>Your board, even without internet.</p>
        </div>
      </div>
      <div className={`panel bluetooth-card ${nearby.connected ? 'is-connected' : ''}`}>
        <div className="bluetooth-orb">
          <Bluetooth size={46} />
        </div>
        <span className="status-pill">
          {nearby.connected ? 'Connected over Bluetooth' : 'Not connected'}
        </span>
        <h2>{nearby.connected ? 'Waterline · Rooftop' : 'Your tank is a tap away.'}</h2>
        <p role="status">{nearby.status}</p>
        <button
          className="button primary"
          disabled={!isNative || nearby.busy}
          onClick={() =>
            void (nearby.connected ? nearby.disconnect() : nearby.connect()).catch((e) =>
              console.error(e),
            )
          }
        >
          {nearby.busy
            ? 'Please wait…'
            : nearby.connected
              ? 'Disconnect Bluetooth'
              : 'Connect nearby board'}
        </button>
        {!isNative ? <p>Bluetooth pairing is available in the Android app.</p> : null}
        {nearby.connected ? (
          <p>
            Live readings and controls are available in Overview, Probes and Alarm. Choose Bluetooth
            in the connection selector.
          </p>
        ) : null}
      </div>
      <div className="panel bluetooth-guide">
        <h2>First connection</h2>
        <ol>
          <li>Keep Bluetooth on and move close to your board.</li>
          <li>Tap Connect nearby board and select Waterline-Rooftop.</li>
          <li>
            Accept Android pairing and enter your private six-digit code from the board’s local
            Bluetooth setup page (/bluetooth).
          </li>
        </ol>
        <p>
          <ShieldCheck size={18} /> Bluetooth is encrypted. Pairing grants local control
          independently of cloud accounts. Revoke paired phones on the board’s setup page.
        </p>
        <p>
          <WifiOff size={18} /> Nearby readings work while this app is open. History and remote
          phone notifications need internet. Calibration capture needs the cloud connection.
        </p>
      </div>
    </section>
  );
}
