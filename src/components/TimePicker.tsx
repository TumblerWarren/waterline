import { useState } from 'react';
import { Clock3 } from 'lucide-react';
import { Dialog } from './Dialog';
import { t } from '../language';
export function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [part, setPart] = useState<'hour' | 'minute'>('hour');
  const [hour, minute] = draft.split(':').map(Number);
  const update = (h: number, m: number) =>
    setDraft(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
  const numbers = Array.from({ length: 12 }, (_, i) => (part === 'hour' ? i + 1 : i * 5));
  return (
    <div className="time-field">
      <span>{t(label)}</span>
      <button
        type="button"
        className="time-trigger"
        onClick={() => {
          setDraft(value);
          setPart('hour');
          setOpen(true);
        }}
        aria-label={`${t(label)} ${value}`}
      >
        <Clock3 size={20} />
        <strong>{value}</strong>
      </button>
      {open ? (
        <Dialog title={label} close={() => setOpen(false)}>
          <div
            className="themed-clock"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                onChange(draft);
                setOpen(false);
              }
            }}
          >
            <div className="clock-display">
              <button
                type="button"
                className={part === 'hour' ? 'selected' : ''}
                onClick={() => setPart('hour')}
              >
                {String(hour).padStart(2, '0')}
              </button>
              <span>:</span>
              <button
                type="button"
                className={part === 'minute' ? 'selected' : ''}
                onClick={() => setPart('minute')}
              >
                {String(minute).padStart(2, '0')}
              </button>
            </div>
            <div className="clock-period">
              {['AM', 'PM'].map((p, i) => (
                <button
                  type="button"
                  key={p}
                  className={Math.floor(hour / 12) === i ? 'selected' : ''}
                  onClick={() => update((hour % 12) + i * 12, minute)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="clock-dial" aria-label={t(part === 'hour' ? 'Hour' : 'Minute')}>
              <span
                className="clock-hand"
                style={{
                  transform: `rotate(${part === 'hour' ? (hour % 12) * 30 : minute * 6}deg)`,
                }}
              />
              {numbers.map((n, i) => {
                const angle = ((part === 'hour' ? n % 12 : i) * Math.PI) / 6;
                return (
                  <button
                    type="button"
                    key={n}
                    style={{
                      left: `${50 + 39 * Math.sin(angle)}%`,
                      top: `${50 - 39 * Math.cos(angle)}%`,
                    }}
                    className={
                      (part === 'hour' ? (hour % 12 || 12) === n : minute === n) ? 'selected' : ''
                    }
                    aria-label={`${t(part === 'hour' ? 'Hour' : 'Minute')} ${n}`}
                    onClick={() => {
                      if (part === 'hour') {
                        update((n % 12) + Math.floor(hour / 12) * 12, minute);
                        setPart('minute');
                      } else update(hour, n);
                    }}
                  >
                    {String(n).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
            <label className="exact-minute">
              {t('Minute')}
              <input
                type="number"
                min="0"
                max="59"
                value={minute}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (Number.isInteger(m) && m >= 0 && m <= 59) update(hour, m);
                }}
              />
            </label>
            <div className="clock-actions">
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                {t('Set time')}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
