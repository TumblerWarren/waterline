import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Authentication has separate cryptographic tests. Here identities are injected to
// exercise the real route guards and migration SQL against an in-memory database.
vi.mock('../worker/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('../worker/auth')>();
  return {
    ...original,
    authenticate: vi.fn(async (request: Request) => {
      const subject = request.headers.get('authorization')?.replace('Bearer ', '');
      if (!subject) throw new original.HttpError(401, 'Please sign in.');
      return { subject, token: subject };
    }),
    verifiedEmail: vi.fn(async (identity: { subject: string }) =>
      identity.subject === 'new-user' ? 'invitee@example.com' : 'wrong@example.com',
    ),
  };
});
import worker from '../worker/index';
import { tokenHash } from '../worker/telemetry';
import { deliverPush } from '../worker/push';
import { generateKeyPair, exportPKCS8 } from 'jose';
let sqlite: DatabaseSync;
function prepared(sql: string, args: unknown[] = []): any {
  const execute = () => sqlite.prepare(sql);
  return {
    bind: (...values: unknown[]) => prepared(sql, values),
    first: async () => execute().get(...(args as any[])) ?? null,
    all: async () => ({ results: execute().all(...(args as any[])) }),
    run: async () => ({ meta: { changes: Number(execute().run(...(args as any[])).changes) } }),
  };
}
const env = {
  DB: {
    prepare: prepared,
    batch: async (statements: any[]) => {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
  AUTH0_DOMAIN: 'test.auth0.com',
  AUTH0_AUDIENCE: 'test',
};
async function call(
  path: string,
  subject = 'owner',
  method = 'GET',
  data?: unknown,
  origin = 'https://waterline.example',
) {
  const request = new Request(`https://waterline.example/api/${path}`, {
    method,
    headers: {
      ...(subject ? { Authorization: `Bearer ${subject}` } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      'Content-Type': 'application/json',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return worker.fetch(request, env as unknown as Env, {} as ExecutionContext);
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_households.sql', import.meta.url), 'utf8'));
  sqlite.exec(
    readFileSync(new URL('../migrations/0002_device_telemetry.sql', import.meta.url), 'utf8'),
  );
  sqlite.exec(readFileSync(new URL('../migrations/0003_calibration.sql', import.meta.url), 'utf8'));
  sqlite.exec(
    readFileSync(new URL('../migrations/0004_buzzer_commands.sql', import.meta.url), 'utf8'),
  );
  sqlite.exec(
    readFileSync(new URL('../migrations/0005_level_alarms.sql', import.meta.url), 'utf8'),
  );
  sqlite.exec(readFileSync(new URL('../migrations/0006_low_alarm.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0007_push.sql', import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO households (id,name,tank_name) VALUES ('home','Our home','Tank'),('other','Another home','Other tank');
    INSERT INTO memberships VALUES ('owner-id','home','owner','Owner','owner@example.com','owner'),
      ('viewer-id','home','viewer','Viewer','viewer@example.com','viewer'),
      ('operator-id','home','operator','Operator','operator@example.com','operator'),
      ('foreign-id','other','foreign','Other','foreign@example.com','viewer');`);
});
afterEach(() => {
  sqlite.close();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe('ESP32 telemetry', () => {
  const credential = `wl_${'a'.repeat(64)}`;
  const sample = () => ({
    schema: 1,
    sampleId: 'b'.repeat(32),
    sentAt: Date.now(),
    measurementAgeMs: 1000,
    fault: 'None',
    buzzerEnabled: true,
    buzzerTestRemainingMs: 0,
    probes: [
      { level: 100, gpio: 32, median: 200, state: 'DRY', calibrated: true },
      { level: 50, gpio: 34, median: 200, state: 'DRY', calibrated: true },
      { level: 20, gpio: 36, median: 1000, state: 'WET', calibrated: true },
    ],
  });
  async function provision() {
    sqlite
      .prepare('INSERT INTO devices(id,household_id,token_hash) VALUES(?,?,?)')
      .run('esp32', 'home', await tokenHash(credential));
  }
  const upload = (data: unknown, token = credential) =>
    call('device/telemetry', token, 'POST', data);
  it('retains raw probe readings for the individual probe page', async () => {
    await provision();
    const data = sample();
    const payload = { ...data, probes: data.probes.map((p) => ({ ...p, raw: 1234 })) };
    expect((await upload(payload)).status).toBe(200);
    const home = await (await call('household')).json();
    expect(home.reading.probes.every((p: { raw: number }) => p.raw === 1234)).toBe(true);
  });
  it.each([-1, 4096, 1.5, '123', null])('rejects an invalid raw reading %s', async (raw) => {
    await provision();
    const data = sample();
    expect(
      (await upload({ ...data, probes: data.probes.map((p) => ({ ...p, raw })) })).status,
    ).toBe(400);
  });
  const calibrationSample = () => ({
    ...sample(),
    schema: 3,
    probes: [
      ...sample().probes,
      { level: 80, gpio: 33, median: 200, state: 'DRY', calibrated: false },
    ].map((p) => ({
      ...p,
      calibration: { dry: 0, wet: 0, dryReady: false, wetReady: false, capture: 'none', cycles: 0 },
    })),
    calibrationCommandId: '',
    calibrationCommandResult: '',
  });
  async function nextCalibrationUpload(data: ReturnType<typeof calibrationSample>) {
    sqlite.exec('UPDATE devices SET last_seen=1');
    data.sampleId = crypto.randomUUID().replaceAll('-', '');
    data.sentAt = Date.now();
    return upload(data);
  }
  const alarmSample = () => ({
    ...calibrationSample(),
    alarmRevision: 0,
    levelAlarms: [20, 50, 80, 100].map((level) => ({
      level,
      enabled: true,
      onSeconds: 10,
      offSeconds: 50,
      wet: level !== 20,
      active: true,
      acknowledged: false,
      episode: String(level).padStart(32, 'a'),
    })),
  });
  it('scopes phone registrations and deletion to the signed-in member', async () => {
    const registration = { id: crypto.randomUUID(), token: 'fcm_test_token_1234567890' };
    expect((await call('push/register', 'viewer', 'POST', registration)).status).toBe(200);
    expect((await call('push/register', 'foreign', 'POST', registration)).status).toBe(409);
    await call('push/register', 'foreign', 'DELETE', { id: registration.id });
    expect(sqlite.prepare('SELECT count(*) AS n FROM push_installations').get()).toEqual({ n: 1 });
    await call('push/register', 'viewer', 'DELETE', { id: registration.id });
    expect(sqlite.prepare('SELECT count(*) AS n FROM push_installations').get()).toEqual({ n: 0 });
  });
  it('queues each alarm episode once per household phone and excludes other households', async () => {
    await provision();
    await call('push/register', 'owner', 'POST', {
      id: crypto.randomUUID(),
      token: 'owner_token_1234567890',
    });
    await call('push/register', 'foreign', 'POST', {
      id: crypto.randomUUID(),
      token: 'foreign_token_1234567890',
    });
    const data = alarmSample();
    data.probes.forEach((p) => (p.calibrated = true));
    expect((await upload(data)).status).toBe(200);
    await nextCalibrationUpload(data);
    const rows = sqlite.prepare('SELECT level FROM push_deliveries ORDER BY level').all();
    expect(rows).toEqual([{ level: 20 }, { level: 50 }, { level: 80 }, { level: 100 }]);
    data.buzzerEnabled = false;
    data.levelAlarms.forEach((a) => (a.episode = 'a'.repeat(32)));
    await nextCalibrationUpload(data);
    expect(sqlite.prepare('SELECT count(*) AS n FROM push_deliveries').get()).toEqual({ n: 4 });
  });
  it('does not claim push is ready without its cloud secret', async () => {
    expect(await (await call('push/status')).json()).toEqual({ configured: false });
  });
  it('delivers queued alarm notifications once and cancels acknowledged episodes', async () => {
    await provision();
    await call('push/register', 'owner', 'POST', {
      id: crypto.randomUUID(),
      token: 'owner_token_1234567890',
    });
    const data = alarmSample();
    data.probes.forEach((p) => (p.calibrated = true));
    await upload(data);
    const keys = await generateKeyPair('RS256', { extractable: true });
    const sender = {
      ...env,
      FCM_SERVICE_ACCOUNT: JSON.stringify({
        project_id: 'gen-lang-client-0607918582',
        client_email: 'test@example.com',
        private_key: await exportPKCS8(keys.privateKey),
      }),
    };
    const send = vi.fn(async (url: string) =>
      Response.json(
        url.includes('oauth2') ? { access_token: 'test-access' } : { name: 'accepted' },
      ),
    );
    vi.stubGlobal('fetch', send);
    await deliverPush(sender);
    expect(send).toHaveBeenCalledTimes(5);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM push_deliveries WHERE status='sent'").get(),
    ).toEqual({ n: 4 });
    await deliverPush(sender);
    expect(send).toHaveBeenCalledTimes(5);
    data.levelAlarms.forEach((a) => (a.episode = 'd'.repeat(32)));
    await nextCalibrationUpload(data);
    data.levelAlarms.forEach((a) => {
      a.acknowledged = true;
      a.active = false;
    });
    await nextCalibrationUpload(data);
    await deliverPush(sender);
    expect(send).toHaveBeenCalledTimes(5);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM push_deliveries WHERE status='cancelled'").get(),
    ).toEqual({ n: 4 });
  });
  it('saves owner settings and delivers them until the board confirms its revision', async () => {
    await provision();
    const data = alarmSample();
    await upload(data);
    const rules = data.levelAlarms.map((a) => ({ ...a, onSeconds: 5, offSeconds: 120 }));
    for (const role of ['viewer', 'operator', 'foreign'])
      expect((await call('alarms/settings', role, 'POST', { rules })).status).toBe(403);
    expect((await call('alarms/settings', 'owner', 'POST', { rules })).status).toBe(202);
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarms')).toBe(
      'v2:1:1:5:120:1:5:120:1:5:120:1:5:120',
    );
    data.alarmRevision = 1;
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarms')).toBeNull();
    const home = await (await call('household')).json();
    expect(home.alarmSettings.revision).toBe(1);
  });
  it.each([0, 61, -1, 1.5])('rejects invalid sound duration %s', async (onSeconds) => {
    await provision();
    const rules = alarmSample().levelAlarms.map((a) => ({ ...a, onSeconds }));
    expect((await call('alarms/settings', 'owner', 'POST', { rules })).status).toBe(400);
  });
  it('adopts newer Bluetooth board settings and saves subsequent cloud edits with a newer revision', async () => {
    await provision();
    const data = alarmSample();
    data.alarmRevision = 7;
    data.levelAlarms.forEach((a) => {
      a.onSeconds = 8;
      a.offSeconds = 90;
    });
    expect((await upload(data)).status).toBe(200);
    let home = await (await call('household')).json();
    expect(home.alarmSettings.revision).toBe(7);
    expect(home.alarmSettings.rules[0].onSeconds).toBe(8);
    const rules = data.levelAlarms.map((a) => ({ ...a, onSeconds: 9 }));
    expect((await call('alarms/settings', 'owner', 'POST', { rules })).status).toBe(202);
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarms')).toContain(
      'v2:8:',
    );
    home = await (await call('household')).json();
    expect(home.alarmSettings.revision).toBe(8);
  });
  it('rejects duplicate rules and invalid silence', async () => {
    await provision();
    const rules = alarmSample().levelAlarms;
    expect(
      (await call('alarms/settings', 'owner', 'POST', { rules: [rules[0], rules[0], rules[2]] }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('alarms/settings', 'owner', 'POST', {
          rules: rules.map((r) => ({ ...r, offSeconds: 3601 })),
        })
      ).status,
    ).toBe(400);
  });
  it('acknowledges all current episodes and waits for physical board confirmation', async () => {
    await provision();
    const data = alarmSample();
    await upload(data);
    const alarms = data.levelAlarms.map((a) => ({ level: a.level, episode: a.episode }));
    expect((await call('alarms/ack', 'viewer', 'POST', { alarms })).status).toBe(403);
    expect((await call('alarms/ack', 'operator', 'POST', { alarms })).status).toBe(202);
    expect((await call('alarms/ack', 'owner', 'POST', { alarms })).status).toBe(202);
    const delivery = (await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack');
    expect(delivery?.split(',')).toHaveLength(4);
    expect(sqlite.prepare('SELECT count(*) AS count FROM alarm_acknowledgements').get()).toEqual({
      count: 4,
    });
    data.levelAlarms = data.levelAlarms.map((a) => ({ ...a, acknowledged: true, active: false }));
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack')).toBeNull();
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM alarm_acknowledgements WHERE status='complete'")
        .get(),
    ).toEqual({ count: 4 });
  });
  it('never silences a new water episode with an old acknowledgement', async () => {
    await provision();
    const data = alarmSample();
    await upload(data);
    await call('alarms/ack', 'operator', 'POST', { alarms: [data.levelAlarms[0]] });
    data.levelAlarms[0].episode = 'c'.repeat(32);
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack')).toBeNull();
    expect(sqlite.prepare('SELECT status FROM alarm_acknowledgements').get()).toEqual({
      status: 'rejected',
    });
    expect(
      (
        await call('alarms/ack', 'operator', 'POST', {
          alarms: [{ level: 50, episode: 'a'.repeat(32) }],
        })
      ).status,
    ).toBe(409);
  });
  it('expires acknowledgements, permits retry and rejects offline requests', async () => {
    await provision();
    const data = alarmSample();
    await upload(data);
    await call('alarms/ack', 'operator', 'POST', { alarms: [data.levelAlarms[0]] });
    sqlite.exec('UPDATE alarm_acknowledgements SET expires_at=1');
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack')).toBeNull();
    expect(
      (await call('alarms/ack', 'operator', 'POST', { alarms: [data.levelAlarms[0]] })).status,
    ).toBe(202);
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack')).toContain(
      data.levelAlarms[0].episode,
    );
    sqlite.exec('UPDATE devices SET last_seen=1');
    expect(
      (await call('alarms/ack', 'operator', 'POST', { alarms: [data.levelAlarms[0]] })).status,
    ).toBe(409);
  });
  it('stops and rejects low-alarm acknowledgements after the 20% probe becomes wet', async () => {
    await provision();
    const data = alarmSample();
    await upload(data);
    await call('alarms/ack', 'operator', 'POST', { alarms: [data.levelAlarms[0]] });
    data.levelAlarms[0] = { ...data.levelAlarms[0], wet: true, active: false, episode: '' };
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarm-Ack')).toBeNull();
    expect(sqlite.prepare('SELECT status FROM alarm_acknowledgements').get()).toEqual({
      status: 'rejected',
    });
  });
  it('accepts old three-alarm telemetry during upgrade without sending incompatible settings', async () => {
    await provision();
    const data = alarmSample();
    data.levelAlarms = data.levelAlarms.filter((a) => a.level !== 20);
    expect((await upload(data)).status).toBe(200);
    await call('alarms/settings', 'owner', 'POST', { rules: alarmSample().levelAlarms });
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Alarms')).toBeNull();
  });
  it('rejects malformed alarm telemetry', async () => {
    await provision();
    const data = alarmSample();
    data.levelAlarms[0].acknowledged = true;
    expect((await upload(data)).status).toBe(400);
  });
  it.each(['test', 'enable', 'disable'])(
    'delivers and acknowledges buzzer %s without replay',
    async (action) => {
      await provision();
      const data = {
        ...calibrationSample(),
        buzzerControlSupported: true,
        buzzerCommandId: '',
        buzzerCommandResult: '',
      };
      await upload(data);
      expect(
        (await call('commands', 'viewer', 'POST', { action: `buzzer.${action}` })).status,
      ).toBe(403);
      expect(
        (await call('commands', 'operator', 'POST', { action: `buzzer.${action}` })).status,
      ).toBe(202);
      expect((await call('commands', 'owner', 'POST', { action: `buzzer.${action}` })).status).toBe(
        409,
      );
      const response = await nextCalibrationUpload(data);
      expect(response.headers.get('X-Waterline-Buzzer')).toMatch(
        new RegExp(`^[a-f0-9]{32}:${action}:\\d+$`),
      );
      data.buzzerCommandId = response.headers.get('X-Waterline-Buzzer')!.split(':')[0];
      data.buzzerCommandResult = 'started';
      data.buzzerTestRemainingMs = action === 'test' ? 9000 : 0;
      data.buzzerEnabled = action === 'enable';
      expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Buzzer')).toBeNull();
      expect(sqlite.prepare('SELECT status FROM buzzer_commands').get()).toEqual({
        status: action === 'test' ? 'started' : 'complete',
      });
      data.buzzerTestRemainingMs = 0;
      await nextCalibrationUpload(data);
      expect(sqlite.prepare('SELECT status FROM buzzer_commands').get()).toEqual({
        status: 'complete',
      });
    },
  );
  it('rejects unsupported, offline and motor requests', async () => {
    await provision();
    await upload(calibrationSample());
    expect((await call('commands', 'owner', 'POST', { action: 'buzzer.test' })).status).toBe(409);
    expect((await call('commands', 'owner', 'POST', { action: 'motor.start' })).status).toBe(400);
    sqlite.exec('UPDATE devices SET last_seen=1');
    expect((await call('commands', 'owner', 'POST', { action: 'buzzer.test' })).status).toBe(409);
  });
  it('does not deliver expired buzzer requests', async () => {
    await provision();
    const data = { ...calibrationSample(), buzzerControlSupported: true };
    await upload(data);
    await call('commands', 'owner', 'POST', { action: 'buzzer.test' });
    sqlite.exec('UPDATE buzzer_commands SET expires_at=1');
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Buzzer')).toBeNull();
  });
  it('restricts calibration to prepared owner requests on fresh capable devices', async () => {
    await provision();
    expect(
      (await call('calibration', 'viewer', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(403);
    expect(
      (await call('calibration', 'operator', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(403);
    expect(
      (await call('calibration', 'foreign', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(403);
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(409);
    await upload(sample());
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(409);
    await nextCalibrationUpload(calibrationSample());
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: false })).status,
    ).toBe(400);
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'on', prepared: true })).status,
    ).toBe(400);
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'wet', prepared: true })).status,
    ).toBe(409);
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(202);
    expect(
      (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true })).status,
    ).toBe(409);
  });
  it('delivers once, reports capture progress, then completes without replay', async () => {
    await provision();
    const data = calibrationSample();
    await upload(data);
    const response = await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true });
    const { calibrationCommand } = await response.json();
    const delivery = await nextCalibrationUpload(data);
    expect(delivery.headers.get('X-Waterline-Calibration')).toContain(
      `${calibrationCommand.id}:dry:`,
    );
    data.calibrationCommandId = calibrationCommand.id;
    data.calibrationCommandResult = 'started';
    data.probes.forEach((p) => {
      p.calibration.capture = 'dry';
      p.calibration.cycles = 2;
    });
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Calibration')).toBeNull();
    let home = await (await call('household')).json();
    expect(home.calibrationCommand.status).toBe('started');
    expect(home.reading.probes[0].calibration.cycles).toBe(2);
    data.probes.forEach((p) => {
      p.calibration.capture = 'none';
      p.calibration.cycles = 20;
      p.calibration.dryReady = true;
    });
    await nextCalibrationUpload(data);
    home = await (await call('household')).json();
    expect(home.calibrationCommand.status).toBe('complete');
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Calibration')).toBeNull();
  });
  it.each([
    [24000, 202],
    [30001, 409],
  ])(
    'handles cloud polling delay %i without premature calibration expiry',
    async (delay, status) => {
      await provision();
      const data = calibrationSample();
      await upload(data);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(data.sentAt + delay);
      try {
        expect(
          (await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true })).status,
        ).toBe(status);
      } finally {
        clock.mockRestore();
      }
    },
  );
  it.each(['expired', 'rejected', 'restart'])('does not redeliver a %s capture', async (kind) => {
    await provision();
    const data = calibrationSample();
    await upload(data);
    const response = await call('calibration', 'owner', 'POST', { mode: 'dry', prepared: true });
    const { calibrationCommand } = await response.json();
    data.calibrationCommandId = calibrationCommand.id;
    data.calibrationCommandResult = 'rejected';
    if (kind === 'expired') sqlite.exec('UPDATE calibration_commands SET expires_at=1');
    if (kind === 'restart') sqlite.exec("UPDATE calibration_commands SET status='started'");
    expect((await nextCalibrationUpload(data)).headers.get('X-Waterline-Calibration')).toBeNull();
    expect((await (await call('household')).json()).calibrationCommand.status).toBe(
      kind === 'expired' ? 'expired' : 'rejected',
    );
  });
  it('rejects malformed calibration progress', async () => {
    await provision();
    const data = calibrationSample();
    data.probes[0].calibration.cycles = 21;
    expect((await upload(data)).status).toBe(400);
  });
  it('rejects user tokens, unknown credentials and revoked devices', async () => {
    await provision();
    expect((await upload(sample(), 'owner')).status).toBe(401);
    expect((await upload(sample(), `wl_${'c'.repeat(64)}`)).status).toBe(401);
    sqlite.exec('UPDATE devices SET enabled=0');
    expect((await upload(sample())).status).toBe(401);
  });
  it('stores a real reading for its household only, then marks it offline', async () => {
    await provision();
    expect((await upload(sample())).status).toBe(200);
    const home = await (await call('household')).json();
    expect(home.reading.band).toBe('middle');
    expect(home.reading.connected).toBe(true);
    expect(home.reading.probes).toHaveLength(3);
    expect(home.history).toHaveLength(1);
    expect((await (await call('household', 'foreign')).json()).reading).toBeNull();
    sqlite.exec('UPDATE devices SET last_seen=1');
    expect((await (await call('household')).json()).reading.connected).toBe(false);
  });
  it.each([
    [[], 'low'],
    [[20], 'middle'],
    [[20, 50], 'upper-middle'],
    [[20, 50, 80], 'near-full'],
    [[20, 50, 80, 100], 'full'],
  ])('derives four-probe bands from wet levels %j', async (wet, band) => {
    await provision();
    const data = sample();
    data.schema = 2;
    data.probes.push({ level: 80, gpio: 33, median: 1000, state: 'DRY', calibrated: true });
    data.probes.forEach((p) => {
      p.state = wet.includes(p.level) ? 'WET' : 'DRY';
    });
    expect((await upload(data)).status).toBe(200);
    const home = await (await call('household')).json();
    expect(home.reading.band).toBe(band);
    expect(home.reading.probes).toHaveLength(4);
  });
  it.each(['missing', 'wrong-pin', 'uncalibrated', 'inconsistent'])(
    'validates the fourth probe: %s',
    async (kind) => {
      await provision();
      const data = sample();
      data.schema = 2;
      if (kind !== 'missing')
        data.probes.push({
          level: 80,
          gpio: kind === 'wrong-pin' ? 35 : 33,
          median: 1000,
          state: kind === 'inconsistent' ? 'WET' : 'DRY',
          calibrated: kind !== 'uncalibrated',
        });
      const result = await upload(data);
      expect(result.status).toBe(kind === 'missing' || kind === 'wrong-pin' ? 400 : 200);
      if (result.ok) expect((await (await call('household')).json()).reading.band).toBe('unknown');
    },
  );
  it('deduplicates uploads and does not refresh a duplicate heartbeat', async () => {
    await provision();
    const data = sample();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(data.sentAt);
    try {
      expect((await upload(data)).status).toBe(200);
      expect((await upload({ ...data, sampleId: 'd'.repeat(32) })).status).toBe(429);
      sqlite.exec('UPDATE devices SET last_seen=1');
      expect((await upload({ ...data, sentAt: Date.now() })).status).toBe(429);
      expect(sqlite.prepare('SELECT last_seen FROM devices').get()?.last_seen).toBe(1);
      expect(sqlite.prepare('SELECT * FROM telemetry').all()).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });
  it.each(['bad-pin', 'duplicate-level', 'old-timestamp', 'invalid-median', 'missing-age'])(
    'rejects malformed telemetry: %s',
    async (kind) => {
      await provision();
      const data = sample();
      if (kind === 'bad-pin') data.probes[0].gpio = 23;
      if (kind === 'duplicate-level') data.probes[0] = data.probes[1];
      if (kind === 'old-timestamp') data.sentAt -= 31000;
      if (kind === 'invalid-median') data.probes[0].median = 4096;
      if (kind === 'missing-age') delete (data as Partial<typeof data>).measurementAgeMs;
      expect((await upload(data)).status).toBe(400);
      expect(sqlite.prepare('SELECT * FROM telemetry').all()).toHaveLength(0);
    },
  );
  it.each(['uncalibrated', 'inconsistent', 'stale', 'saturated'])(
    'keeps %s readings unknown',
    async (kind) => {
      await provision();
      const data = sample();
      if (kind === 'uncalibrated') data.probes[0].calibrated = false;
      if (kind === 'inconsistent') data.probes[0].state = 'WET';
      if (kind === 'stale') data.measurementAgeMs = 16000;
      if (kind === 'saturated') data.probes[0].median = 4095;
      expect((await upload(data)).status).toBe(200);
      const home = await (await call('household')).json();
      expect(home.reading.band).toBe('unknown');
      expect(home.reading.fault).toBeTruthy();
    },
  );
});
describe('household API isolation and permissions', () => {
  it('requires sign-in and explicit membership', async () => {
    expect((await call('household', '')).status).toBe(401);
    expect((await call('household', 'stranger')).status).toBe(403);
  });
  it('returns only the current household and no simulated readings', async () => {
    const response = await call('household', 'viewer');
    const home = await response.json();
    expect(home.id).toBe('home');
    expect(home.members).toHaveLength(3);
    expect(home.role).toBe('viewer');
    expect(home.reading).toBeNull();
    expect(home.history).toEqual([]);
    expect(home.invitations).toEqual([]);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['viewer', 'operator'])(
    'blocks %s from managing settings and invitations',
    async (role) => {
      expect((await call('settings', role, 'PATCH', { tankName: 'changed' })).status).toBe(403);
      expect(
        (await call('invitations', role, 'POST', { email: 'test@example.com', role: 'viewer' }))
          .status,
      ).toBe(403);
      expect((await call('members/viewer-id', role, 'DELETE')).status).toBe(403);
    },
  );
  it('saves settings for the owner with an audit record', async () => {
    const result = await call('settings', 'owner', 'PATCH', {
      tankName: 'New tank',
      preferences: { low: true, full: false, fault: true, offline: false },
    });
    expect(result.status).toBe(200);
    expect((await result.json()).tankName).toBe('New tank');
    expect(sqlite.prepare('SELECT * FROM audit_events').all()).toHaveLength(1);
  });
  it('does not modify a member in another household', async () => {
    expect((await call('members/foreign-id', 'owner', 'DELETE')).status).toBe(404);
    expect(sqlite.prepare("SELECT * FROM memberships WHERE id='foreign-id'").get()).toBeTruthy();
  });
  it('enforces household roles for Android-origin settings requests too', async () => {
    const settings = {
      tankName: 'Android tank',
      preferences: { low: true, full: false, fault: true, offline: true },
    };
    expect((await call('settings', 'viewer', 'PATCH', settings, 'https://localhost')).status).toBe(
      403,
    );
    const response = await call('settings', 'owner', 'PATCH', settings, 'https://localhost');
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
    expect((await response.json()).tankName).toBe('Android tank');
  });
  it('protects the owner against removal or demotion', async () => {
    expect((await call('members/owner-id', 'owner', 'DELETE')).status).toBe(409);
    expect((await call('members/owner-id', 'owner', 'PATCH', { role: 'viewer' })).status).toBe(409);
  });
  it('prevents promotion through member or invitation input', async () => {
    expect((await call('members/viewer-id', 'owner', 'PATCH', { role: 'owner' })).status).toBe(400);
    expect(
      (await call('invitations', 'owner', 'POST', { email: 'new@example.com', role: 'owner' }))
        .status,
    ).toBe(400);
  });
  it('rejects cross-origin mutations and oversized input', async () => {
    expect((await call('settings', 'owner', 'PATCH', {}, 'https://attacker.example')).status).toBe(
      403,
    );
    expect((await call('settings', 'owner', 'PATCH', { tankName: 'x'.repeat(5000) })).status).toBe(
      413,
    );
  });
  it('never pretends to deliver a physical device command', async () => {
    expect((await call('commands', 'viewer', 'POST', { action: 'buzzer.test' })).status).toBe(403);
    expect((await call('commands', 'operator', 'POST', { action: 'buzzer.test' })).status).toBe(
      409,
    );
  });
});
describe('household invitations', () => {
  async function create() {
    const response = await call('invitations', 'owner', 'POST', {
      email: 'invitee@example.com',
      role: 'operator',
    });
    expect(response.status).toBe(201);
    const { invitationUrl } = await response.json();
    return invitationUrl.split('#join=')[1];
  }
  it('stores a hash, checks the email, and consumes an invitation only once', async () => {
    const token = await create();
    const row = sqlite.prepare('SELECT token_hash FROM invitations').get();
    expect(row?.token_hash).not.toBe(token);
    expect((await call('invitations/accept', 'wrong-user', 'POST', { token })).status).toBe(410);
    expect((await call('invitations/accept', 'new-user', 'POST', { token })).status).toBe(200);
    expect(
      sqlite.prepare("SELECT role FROM memberships WHERE subject='new-user'").get()?.role,
    ).toBe('operator');
    expect((await call('invitations/accept', 'new-user', 'POST', { token })).status).toBe(410);
  });
  it('rejects expired, revoked and replaced invitations', async () => {
    const old = await create();
    const fresh = await create();
    expect((await call('invitations/accept', 'new-user', 'POST', { token: old })).status).toBe(410);
    sqlite.exec('UPDATE invitations SET expires_at=1');
    expect((await call('invitations/accept', 'new-user', 'POST', { token: fresh })).status).toBe(
      410,
    );
    const revoked = await create();
    const row = sqlite.prepare('SELECT id FROM invitations').get();
    expect((await call(`invitations/${row?.id}`, 'owner', 'DELETE')).status).toBe(200);
    expect((await call('invitations/accept', 'new-user', 'POST', { token: revoked })).status).toBe(
      410,
    );
  });
});
