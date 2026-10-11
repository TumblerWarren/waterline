import { t } from '../language';
import { hasFreshCloudMeasurement, type Reading } from '../../shared/model';

export function ProbesPage({
  reading,
  now,
  preview,
}: {
  reading: Reading | null;
  now: number;
  preview: boolean;
}) {
  const fresh =
    hasFreshCloudMeasurement(reading, now) &&
    reading?.connected &&
    reading.lastSeen !== null &&
    now - reading.lastSeen <= 30000;
  const probes = [...(reading?.probes ?? [])].sort((a, b) => a.level - b.level);
  return (
    <section className="probe-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('INDIVIDUAL READINGS')}</p>
          <h1>{t('Your water probes.')}</h1>
          <p>{t('Each electrode’s latest reading, saved calibration and water contact.')}</p>
        </div>
      </div>
      <div className="panel probe-summary" role="status">
        <strong>
          {preview
            ? 'Sample readings'
            : fresh
              ? t('Live readings')
              : t('Waiting for fresh readings')}
        </strong>
        <p>
          {reading?.measuredAt !== null && reading?.measuredAt !== undefined
            ? `${t('Last measurement')}: ${new Date(reading.measuredAt).toLocaleString(document.documentElement.lang === 'bn' ? 'bn-IN' : 'en-IN')}`
            : t('No measurement received yet.')}
        </p>
        <p>
          {t(
            'Refreshes automatically while this page is open. Values are ADC counts from 0 to 4095.',
          )}
        </p>
        {reading?.fault ? <p className="form-error">{t(reading.fault)}</p> : null}
      </div>
      {!probes.length ? (
        <div className="panel">
          {t('Probe data will appear after the board uploads a reading.')}
        </div>
      ) : null}
      <div className="probe-detail-grid">
        {probes.map((probe) => {
          const c = probe.calibration;
          const gap = c?.dryReady && c.wetReady ? c.wet - c.dry : null;
          return (
            <article className={`panel probe-detail probe-level-${probe.level}`} key={probe.gpio}>
              <div className="settings-heading">
                <h2>
                  {probe.level}% {t('Probe')}
                </h2>
                <span className="probe-contact">
                  {fresh
                    ? probe.state === 'wet'
                      ? t('Wet')
                      : probe.state === 'dry'
                        ? t('Dry')
                        : t('Unknown')
                    : t('Reading stale')}
                </span>
              </div>
              <p>GPIO{probe.gpio}</p>
              <dl className="probe-values">
                <div>
                  <dt>{t('Raw reading')}</dt>
                  <dd>{probe.raw ?? t('Not supplied')}</dd>
                </div>
                <div>
                  <dt>{t('Filtered median')}</dt>
                  <dd>{probe.median}</dd>
                </div>
                <div>
                  <dt>{t('Saved dry')}</dt>
                  <dd>{c?.dryReady ? c.dry : t('Not captured')}</dd>
                </div>
                <div>
                  <dt>{t('Saved wet')}</dt>
                  <dd>{c?.wetReady ? c.wet : t('Not captured')}</dd>
                </div>
                <div>
                  <dt>{t('Wet − dry')}</dt>
                  <dd>{gap ?? t('Not available')}</dd>
                </div>
                <div>
                  <dt>{t('Calibration')}</dt>
                  <dd>{probe.calibrated ? t('Ready') : t('Required')}</dd>
                </div>
                {c?.dryNoise !== undefined ? (
                  <div>
                    <dt>{t('Dry capture spread')}</dt>
                    <dd>{c.dryNoise}</dd>
                  </div>
                ) : null}
                {c?.wetNoise !== undefined ? (
                  <div>
                    <dt>{t('Wet capture spread')}</dt>
                    <dd>{c.wetNoise}</dd>
                  </div>
                ) : null}
              </dl>
              {c && c.capture !== 'none' ? (
                <p role="status">
                  {t('Capturing')} {t(c.capture.toUpperCase())}: {c.cycles} / {c.targetCycles ?? 20}{' '}
                  {t('cycles')}
                </p>
              ) : null}
              {gap !== null ? (
                <p>
                  {gap > 500
                    ? t('Dry/wet difference exceeds 500.')
                    : t('Dry/wet difference must exceed 500.')}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
