import { useState, type FormEvent } from 'react';
import {
  defaultAlarmRules,
  alarmAcknowledgementState,
  type AlarmRule,
  type Household,
  type LevelAlarm,
} from '../../shared/model';

export function LevelAlarms({
  home,
  now,
  preview,
  edit = false,
  save,
  acknowledge,
  transport = 'cloud',
  externalBusy = false,
}: {
  home: Household;
  now: number;
  preview: boolean;
  edit?: boolean;
  save: (rules: AlarmRule[]) => Promise<void>;
  acknowledge: (alarms: LevelAlarm[]) => Promise<void>;
  transport?: 'cloud' | 'bluetooth';
  externalBusy?: boolean;
}) {
  const [rules, setRules] = useState(() => home.alarmSettings?.rules ?? defaultAlarmRules());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const reported = home.reading?.levelAlarms;
  const [requestedAcks, setRequestedAcks] = useState<Pick<LevelAlarm, 'level' | 'episode'>[]>([]);
  const ackState = alarmAcknowledgementState(requestedAcks, reported);
  const statusMessage =
    requestedAcks.length && message
      ? ackState === 'confirmed'
        ? 'Board confirmed. Acknowledged alarms are quiet until their condition clears.'
        : ackState === 'changed'
          ? 'Water level changed. Current alarm states are shown above.'
          : message
      : message;
  const active = reported?.filter((a) => a.active) ?? [];
  const connected = Boolean(
    home.reading?.connected &&
    home.reading.lastSeen !== null &&
    home.reading?.lastSeen !== undefined &&
    now - home.reading.lastSeen <= 30_000,
  );
  const canAck = !preview && connected && !busy && !externalBusy;
  const pending = home.alarmAcknowledgements?.some(
    (a) =>
      a.status === 'queued' && active.some((r) => r.level === a.level && r.episode === a.episode),
  );
  const applied = home.reading?.alarmRevision === home.alarmSettings?.revision;
  async function perform(action: () => Promise<void>, success: string, alarms: LevelAlarm[] = []) {
    setBusy(true);
    setError('');
    setMessage('');
    setRequestedAcks(alarms.map((a) => ({ level: a.level, episode: a.episode })));
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setRequestedAcks([]);
      setError(e instanceof Error ? e.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  }
  function update(level: number, change: Partial<AlarmRule>) {
    setRules((current) => current.map((r) => (r.level === level ? { ...r, ...change } : r)));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void perform(
      () => save(rules),
      preview
        ? 'Saved in preview.'
        : transport === 'bluetooth'
          ? 'Board confirmed and saved these settings.'
          : 'Settings saved in cloud. Waiting for the board to confirm.',
    );
  }
  return (
    <section className="panel settings-panel level-alarm-panel">
      <div className="settings-heading">
        <h2>{edit ? 'Buzzer alarm settings' : 'Water-level alarms'}</h2>
        <p>
          Below 20% sounds when the lowest probe is dry. The 50%, 80% and 100% alarms sound when
          their probes are wet. Each stops when acknowledged or its condition clears.
        </p>
      </div>
      {edit ? (
        <form onSubmit={submit}>
          {rules.map((r) => (
            <fieldset
              className={`level-alarm-rule probe-level-${r.level}`}
              key={r.level}
              disabled={home.role !== 'owner' || busy || externalBusy || (!preview && !connected)}
            >
              <legend>{r.level === 20 ? 'Below 20%' : `${r.level}% probe`}</legend>
              <label className="setting-row">
                <span>Enable this alarm</span>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => update(r.level, { enabled: e.target.checked })}
                />
              </label>
              <div className="alarm-times">
                <label>
                  {r.level === 20 ? 'Beep burst (seconds)' : 'Sound (seconds)'}
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={Number.isFinite(r.onSeconds) ? r.onSeconds : ''}
                    onChange={(e) => update(r.level, { onSeconds: e.target.valueAsNumber })}
                  />
                </label>
                <label>
                  Silence (seconds)
                  <input
                    type="number"
                    min="1"
                    max="3600"
                    required
                    value={Number.isFinite(r.offSeconds) ? r.offSeconds : ''}
                    onChange={(e) => update(r.level, { offSeconds: e.target.valueAsNumber })}
                  />
                </label>
              </div>
              {r.level === 20 ? (
                <small>
                  During each burst: 0.5 seconds ON, 0.5 seconds OFF. Stops when the 20% probe
                  becomes wet.
                </small>
              ) : null}
            </fieldset>
          ))}
          <button
            className="button primary"
            type="submit"
            disabled={home.role !== 'owner' || busy || externalBusy || (!preview && !connected)}
          >
            {busy ? 'Saving…' : 'Save buzzer alarms'}
          </button>
          <p role="status">
            {preview
              ? 'Preview only.'
              : !reported
                ? 'Waiting for alarm firmware.'
                : applied
                  ? 'Settings confirmed and saved on board.'
                  : 'Settings waiting to reach the board.'}
          </p>
        </form>
      ) : (
        <div>
          {(home.alarmSettings?.rules ?? defaultAlarmRules()).map((r) => {
            const a = reported?.find((a) => a.level === r.level);
            const ack = home.alarmAcknowledgements?.find(
              (ack) => ack.level === r.level && ack.episode === a?.episode,
            );
            return (
              <div className={`setting-row alarm-row probe-level-${r.level}`} key={r.level}>
                <span>
                  <strong>
                    {r.level === 20 ? 'Below 20%' : `${r.level}%`} ·{' '}
                    {r.enabled
                      ? `${r.onSeconds}s ${r.level === 20 ? 'beeps' : 'sound'} / ${r.offSeconds}s silence`
                      : 'Disabled'}
                  </strong>
                  <small>
                    {!connected
                      ? 'Waiting for fresh connection'
                      : !a
                        ? 'Waiting for firmware'
                        : ack?.status === 'queued'
                          ? 'Acknowledgement waiting for board'
                          : a.acknowledged
                            ? r.level === 20
                              ? 'Acknowledged · quiet until water reaches 20%'
                              : 'Acknowledged · quiet until this probe dries'
                            : a.active
                              ? 'Alarm active'
                              : a.wet
                                ? 'Water at this probe'
                                : 'Below this probe'}
                  </small>
                </span>
                {a?.active ? (
                  <button
                    className="text-button"
                    disabled={!canAck || ack?.status === 'queued'}
                    onClick={() =>
                      void perform(
                        () => acknowledge([a]),
                        'Acknowledgement sent. Waiting for board confirmation.',
                        [a],
                      )
                    }
                  >
                    Acknowledge
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            className="button secondary full-width"
            disabled={!canAck || !active.length || pending}
            onClick={() =>
              void perform(
                () => acknowledge(active),
                'Acknowledgements sent. Waiting for board confirmation.',
                active,
              )
            }
          >
            Acknowledge all active alarms
          </button>
        </div>
      )}
      <p>
        Rising-level alarms re-arm after their probe dries and becomes wet again. Below 20% re-arms
        after its probe becomes wet and later dries. Saved settings and acknowledgements survive a
        restart.
      </p>
      {!preview && home.reading && !home.reading.buzzerEnabled ? (
        <p>Automatic alarms are disabled. Use Enable local alarm to allow sound.</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {statusMessage ? <p role="status">{statusMessage}</p> : null}
    </section>
  );
}
