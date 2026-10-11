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
          <p className="eyebrow">INDIVIDUAL READINGS</p>
          <h1>Your water probes.</h1>
          <p>Each electrode’s latest reading, saved calibration and water contact.</p>
        </div>
      </div>
      <div className="panel probe-summary" role="status">
        <strong>
          {preview ? 'Sample readings' : fresh ? 'Live readings' : 'Waiting for fresh readings'}
        </strong>
        <p>
          {reading?.measuredAt !== null && reading?.measuredAt !== undefined
            ? `Last measurement: ${new Date(reading.measuredAt).toLocaleString()}`
            : 'No measurement received yet.'}
        </p>
        <p>
          Refreshes automatically while this page is open. Values are ADC counts from 0 to 4095.
        </p>
        {reading?.fault ? <p className="form-error">{reading.fault}</p> : null}
      </div>
      {!probes.length ? (
        <div className="panel">Probe data will appear after the board uploads a reading.</div>
      ) : null}
      <div className="probe-detail-grid">
        {probes.map((probe) => {
          const c = probe.calibration;
          const gap = c?.dryReady && c.wetReady ? c.wet - c.dry : null;
          return (
            <article className={`panel probe-detail probe-level-${probe.level}`} key={probe.gpio}>
              <div className="settings-heading">
                <h2>{probe.level}% probe</h2>
                <span className="probe-contact">
                  {fresh
                    ? probe.state === 'wet'
                      ? 'Wet'
                      : probe.state === 'dry'
                        ? 'Dry'
                        : 'Unknown'
                    : 'Reading stale'}
                </span>
              </div>
              <p>GPIO{probe.gpio}</p>
              <dl className="probe-values">
                <div>
                  <dt>Raw reading</dt>
                  <dd>{probe.raw ?? 'Not supplied'}</dd>
                </div>
                <div>
                  <dt>Filtered median</dt>
                  <dd>{probe.median}</dd>
                </div>
                <div>
                  <dt>Saved dry</dt>
                  <dd>{c?.dryReady ? c.dry : 'Not captured'}</dd>
                </div>
                <div>
                  <dt>Saved wet</dt>
                  <dd>{c?.wetReady ? c.wet : 'Not captured'}</dd>
                </div>
                <div>
                  <dt>Wet − dry</dt>
                  <dd>{gap ?? 'Not available'}</dd>
                </div>
                <div>
                  <dt>Calibration</dt>
                  <dd>{probe.calibrated ? 'Ready' : 'Required'}</dd>
                </div>
                {c?.dryNoise !== undefined ? (
                  <div>
                    <dt>Dry capture spread</dt>
                    <dd>{c.dryNoise}</dd>
                  </div>
                ) : null}
                {c?.wetNoise !== undefined ? (
                  <div>
                    <dt>Wet capture spread</dt>
                    <dd>{c.wetNoise}</dd>
                  </div>
                ) : null}
              </dl>
              {c && c.capture !== 'none' ? (
                <p role="status">
                  Capturing {c.capture.toUpperCase()}: {c.cycles} / {c.targetCycles ?? 20} cycles
                </p>
              ) : null}
              {gap !== null ? (
                <p>
                  {gap > 500
                    ? 'Dry/wet difference exceeds 500.'
                    : 'Dry/wet difference must exceed 500.'}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
