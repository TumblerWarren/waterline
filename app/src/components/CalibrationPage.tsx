import { t } from '../language';
import { AccessDenied } from './AccessDenied';
import { useState } from 'react';
import { hasFreshCloudMeasurement, type Household } from '../../shared/model';

export function CalibrationPage({
  home,
  now,
  preview,
  capture,
}: {
  home: Household;
  now: number;
  preview: boolean;
  capture: (mode: 'dry' | 'wet') => Promise<void>;
}) {
  const [prepared, setPrepared] = useState<'dry' | 'wet' | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const reading = home.reading;
  const command = home.calibrationCommand;
  const commandActive =
    command && command.expiresAt > now && ['queued', 'started'].includes(command.status);
  const capturing = reading?.probes.some((p) => p.calibration && p.calibration.capture !== 'none');
  const cooldown = command && now - command.requestedAt < 120000;
  const connected =
    reading?.connected && reading.lastSeen !== null && now - reading.lastSeen <= 30000;
  const fresh = hasFreshCloudMeasurement(reading, now);
  const supported = reading?.calibrationSupported;
  const dryReady =
    reading?.probes.length === 4 && reading.probes.every((p) => p.calibration?.dryReady);
  const ready =
    !preview &&
    home.role === 'owner' &&
    connected &&
    fresh &&
    supported &&
    !commandActive &&
    !capturing &&
    !cooldown &&
    !sending;
  const canPrepare = !preview && home.role === 'owner' && !sending && !commandActive && !capturing;
  async function start(mode: 'dry' | 'wet') {
    if (!ready || prepared !== mode) return;
    setSending(true);
    setError('');
    try {
      await capture(mode);
      setPrepared(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Capture could not be requested.'));
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="calibration-workspace access-section">
      {home.role !== 'owner' ? (
        <AccessDenied
          area="Calibration"
          owner={home.members.find((m) => m.role === 'owner')?.name}
        />
      ) : null}
      <div className="panel">
        <h2>{t('Calibrate all four probes')}</h2>
        <ul className="calibration-instructions">
          <li>{t('Use the connected cable and electrodes.')}</li>
          <li>
            {t(
              'A bucket is fine for initial testing; repeat calibration after the final tank installation.',
            )}
          </li>
        </ul>
        <ul className="calibration-instructions">
          <li>{t('Each capture takes about 100 seconds after delivery.')}</li>
          <li>{t('Cloud progress refreshes every ten seconds.')}</li>
          <li>{t('Keep the electrodes in position until the capture finishes.')}</li>
          <li>{t('Automatic low-water beeping stays silent during calibration.')}</li>
        </ul>
        {!connected ? (
          <p role="status">{t('Waiting for the ESP32 to connect.')}</p>
        ) : !supported ? (
          <p role="status">{t('Waiting for the calibration firmware update.')}</p>
        ) : !fresh ? (
          <p role="status">
            {t('Waiting for a fresh probe update. Your preparation confirmation stays selected.')}
          </p>
        ) : null}
        {cooldown && !commandActive && !capturing ? (
          <p role="status">
            {t('Ready for the next capture in')}{' '}
            {Math.max(0, Math.ceil((120000 - (now - command!.requestedAt)) / 1000))}
            {t('seconds.')}
          </p>
        ) : null}
        {capturing ? (
          <div className="calibration-progress" role="status">
            <strong>{t('Capturing readings')}</strong>
            {reading?.probes
              .filter((p) => p.calibration?.capture !== 'none')
              .map((p) => (
                <div key={p.gpio}>
                  <span>
                    {p.level}% · {p.calibration?.cycles ?? 0}/{p.calibration?.targetCycles ?? 20}{' '}
                    {t('cycles')}
                  </span>
                  <progress
                    aria-label={`${p.level}% probe capture`}
                    max={p.calibration?.targetCycles ?? 20}
                    value={p.calibration?.cycles ?? 0}
                  />
                </div>
              ))}
          </div>
        ) : null}
        {preview ? <p>Preview only. Physical calibration is available after signing in.</p> : null}
        {home.role !== 'owner' ? (
          <p>{t('Only the household owner can start calibration.')}</p>
        ) : null}
        {command ? (
          <p role="status">
            {t('Last')} {command.mode.toUpperCase()} {t('request:')}{' '}
            {command.expiresAt < now && ['queued', 'started'].includes(command.status)
              ? t('expired — check connectivity and request again')
              : command.status === 'queued'
                ? t('waiting for the ESP32')
                : command.status === 'started'
                  ? t('capturing readings')
                  : command.status === 'complete'
                    ? t('capture finished')
                    : command.status === 'rejected'
                      ? t('rejected or interrupted — check the electrodes and try again')
                      : command.status}
            .
          </p>
        ) : null}
        {error ? <p role="alert">{t(error)}</p> : null}
      </div>
      <div className="panel">
        <h2>{t('1. Capture DRY')}</h2>
        <ul className="calibration-instructions">
          <li>{t('Remove all four level electrodes from the water.')}</li>
          <li>{t('Clean and dry them, and keep them separated.')}</li>
          <li>{t('This replaces the previous dry and wet calibration.')}</li>
        </ul>
        <label className="capture-confirm">
          <input
            type="checkbox"
            checked={prepared === 'dry'}
            disabled={!canPrepare}
            onChange={(e) => setPrepared(e.target.checked ? 'dry' : null)}
          />
          <span>{t('All four level electrodes are dry, out of water and separated.')}</span>
        </label>
        <button
          className="button primary"
          disabled={!ready || prepared !== 'dry'}
          onClick={() => void start('dry')}
        >
          {sending ? t('Requesting…') : t('Capture DRY')}
        </button>
      </div>
      <div className="panel">
        <h2>{t('2. Capture WET')}</h2>
        <ul className="calibration-instructions">
          <li>
            {t(
              'After DRY finishes, immerse the 20%, 50%, 80% and 100% electrodes and the common electrode in the same water.',
            )}
          </li>
          <li>{t('Keep every electrode from touching another.')}</li>
        </ul>
        {!dryReady ? <p>{t('Complete DRY on all four probes first.')}</p> : null}
        <label className="capture-confirm">
          <input
            type="checkbox"
            checked={prepared === 'wet'}
            disabled={!canPrepare || !dryReady}
            onChange={(e) => setPrepared(e.target.checked ? 'wet' : null)}
          />
          <span>{t('All four level electrodes and common are immersed, without touching.')}</span>
        </label>
        <button
          className="button primary"
          disabled={!ready || !dryReady || prepared !== 'wet'}
          onClick={() => void start('wet')}
        >
          {t('Capture WET')}
        </button>
      </div>
      <div className="panel calibration-results">
        <h2>{t('3. Check the results')}</h2>
        <p className="calibration-swipe-hint">{t('Swipe left or right to see all results.')}</p>
        <div
          className="calibration-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Calibration results, scroll horizontally"
        >
          <table className="diagnostic-table calibration-table">
            <caption>{t('Live calibration values')}</caption>
            <thead>
              <tr>
                <th>{t('Probe')}</th>
                <th>{t('Dry')}</th>
                <th>{t('Wet')}</th>
                <th>{t('Capture variation')}</th>
                <th>{t('Progress / result')}</th>
              </tr>
            </thead>
            <tbody>
              {reading?.probes.map((p) => (
                <tr key={p.gpio}>
                  <td>
                    {p.level}% · GPIO{p.gpio}
                  </td>
                  <td>{p.calibration?.dryReady ? p.calibration.dry : t('Pending')}</td>
                  <td>{p.calibration?.wetReady ? p.calibration.wet : t('Pending')}</td>
                  <td>
                    {p.calibration?.dryNoise !== undefined && p.calibration.wetNoise !== undefined
                      ? `${t('Dry')} ${p.calibration.dryNoise} / ${t('Wet')} ${p.calibration.wetNoise}`
                      : t('Not reported')}
                  </td>
                  <td>
                    {p.calibration?.capture !== undefined && p.calibration.capture !== 'none'
                      ? `${t(p.calibration.capture.toUpperCase())} ${p.calibration.cycles}/${p.calibration.targetCycles ?? 20}`
                      : p.calibrated
                        ? t('Good separation')
                        : p.calibration?.wetReady
                          ? t('WET − DRY must exceed 500 — check water contact / wiring')
                          : t('Needs calibration')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="calibration-instructions">
          <li>{t('After WET finishes, allow about 15 seconds for stable confirmation.')}</li>
          <li>{t('Then test each electrode transition.')}</li>
          <li>{t('Tank readings should follow 20% → 50% → 80% → 100% as water rises.')}</li>
        </ul>
      </div>
    </section>
  );
}
