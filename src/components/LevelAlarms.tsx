import { t } from '../language';
import { AccessDenied } from './AccessDenied';
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
  compact = false,
  save,
  acknowledge,
  transport = 'cloud',
  externalBusy = false,
}: {
  home: Household;
  now: number;
  preview: boolean;
  edit?: boolean;
  compact?: boolean;
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
        ? t('Board confirmed. Acknowledged alarms are quiet until their condition clears.')
        : ackState === 'changed'
          ? t('Water level changed. Current alarm states are shown above.')
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
      setError(e instanceof Error ? e.message : t('Please retry.'));
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
          ? t('Board confirmed and saved these settings.')
          : t('Settings saved in cloud. Waiting for the board to confirm.'),
    );
  }
  return (
    <section
      className={
        compact
          ? 'overview-acknowledgement'
          : 'panel settings-panel level-alarm-panel access-section'
      }
    >
      {edit && home.role !== 'owner' ? (
        <AccessDenied
          area="Buzzer alarm settings"
          owner={home.members.find((m) => m.role === 'owner')?.name}
        />
      ) : null}
      <div className={compact ? 'sr-only' : 'settings-heading'}>
        <h2>{edit ? t('Buzzer alarm settings') : t('Water-level alarms')}</h2>
        <p>
          {t(
            'Below 20% sounds when the lowest probe is dry. The 50%, 80% and 100% alarms sound when their probes are wet. Each stops when acknowledged or its condition clears.',
          )}
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
              <legend>{r.level === 20 ? t('Below 20%') : `${r.level}% ${t('Probe')}`}</legend>
              <label className="setting-row">
                <span>{t('Enable this alarm')}</span>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => update(r.level, { enabled: e.target.checked })}
                />
              </label>
              <div className="alarm-times">
                <label>
                  {r.level === 20 ? t('Beep burst (seconds)') : t('Sound (seconds)')}
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
                  {t('Silence (seconds)')}
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
                  {t(
                    'During each burst: 0.5 seconds ON, 0.5 seconds OFF. Stops when the 20% probe becomes wet.',
                  )}
                </small>
              ) : null}
            </fieldset>
          ))}
          <button
            className="button primary"
            type="submit"
            disabled={home.role !== 'owner' || busy || externalBusy || (!preview && !connected)}
          >
            {busy ? t('Saving…') : t('Save buzzer alarms')}
          </button>
          <p role="status">
            {preview
              ? 'Preview only.'
              : !reported
                ? t('Waiting for alarm firmware.')
                : applied
                  ? t('Settings confirmed and saved on board.')
                  : t('Settings waiting to reach the board.')}
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
                    {r.level === 20 ? t('Below 20%') : `${r.level}%`} ·{' '}
                    {r.enabled
                      ? `${r.onSeconds} ${t('seconds')} ${r.level === 20 ? t('beeps') : t('sound')} / ${r.offSeconds} ${t('seconds')} ${t('silence')}`
                      : t('Disabled')}
                  </strong>
                  <small>
                    {!connected
                      ? t('Waiting for fresh connection')
                      : !a
                        ? t('Waiting for firmware')
                        : ack?.status === 'queued'
                          ? t('Acknowledgement waiting for board')
                          : a.acknowledged
                            ? r.level === 20
                              ? t('Acknowledged · quiet until water reaches 20%')
                              : t('Acknowledged · quiet until this probe dries')
                            : a.active
                              ? t('Alarm active')
                              : a.wet
                                ? t('Water at this probe')
                                : t('Below this probe')}
                  </small>
                </span>
                {a?.active ? (
                  <button
                    className="text-button"
                    disabled={!canAck || ack?.status === 'queued'}
                    onClick={() =>
                      void perform(
                        () => acknowledge([a]),
                        t('Acknowledgement sent. Waiting for board confirmation.'),
                        [a],
                      )
                    }
                  >
                    {t('Acknowledge')}
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
                t('Acknowledgements sent. Waiting for board confirmation.'),
                active,
              )
            }
          >
            {t('Acknowledge all active alarms')}
          </button>
        </div>
      )}
      <p>
        {t(
          'Rising-level alarms re-arm after their probe dries and becomes wet again. Below 20% re-arms after its probe becomes wet and later dries. Saved settings and acknowledgements survive a restart.',
        )}
      </p>
      {!preview && home.reading && !home.reading.buzzerEnabled ? (
        <p>{t('Automatic alarms are disabled. Use Enable local alarm to allow sound.')}</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      {statusMessage ? <p role="status">{t(statusMessage)}</p> : null}
    </section>
  );
}
