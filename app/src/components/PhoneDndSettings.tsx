import { useState } from 'react';
import { t } from '../language';
import { validQuietHours, type QuietHours } from '../../shared/quietHours';
import { TimePicker } from './TimePicker';
export function PhoneDndSettings({
  saved,
  supported,
  active,
  status,
  save,
}: {
  saved: QuietHours;
  supported: boolean;
  active: boolean;
  status: string;
  save: (q: QuietHours) => Promise<void>;
}) {
  const [draft, setDraft] = useState(saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || status.includes('Cloud sync failed');
  async function submit() {
    if (!validQuietHours(draft)) {
      setError(t('Choose different valid start and end times.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await save(draft);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel phone-dnd">
      <h2>{t('Phone DND')}</h2>
      <p>{t('Quiet hours for this phone only. Board alarms keep working.')}</p>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          <span>{t('DND ON / OFF')}</span>
        </label>
        {draft.enabled ? (
          <div className="dnd-times">
            <TimePicker
              label="Start time"
              value={draft.start}
              onChange={(start) => setDraft({ ...draft, start })}
            />
            <TimePicker
              label="End time"
              value={draft.end}
              onChange={(end) => setDraft({ ...draft, end })}
            />
          </div>
        ) : null}
        <p>
          {t(
            'No phone notifications or ringing during quiet hours. If a board alarm is still active afterward, ringing resumes after a fresh cloud check. Internet is required; allow about a minute plus delivery time.',
          )}
        </p>
        <p>
          {t('Time zone')}: {saved.timezone}
        </p>
        <button
          className={`button ${dirty ? 'primary' : 'secondary'}`}
          disabled={!supported || busy || !dirty}
        >
          {busy ? t('Saving…') : t('Save phone DND')}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : status ? (
          <p role="status">{t(status)}</p>
        ) : null}
        {active ? <p role="status">{t('DND is active. Phone alerts are paused.')}</p> : null}
      </form>
    </section>
  );
}
