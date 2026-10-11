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
      setError(error instanceof Error ? error.message : 'Capture could not be requested.');
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="calibration-workspace">
      <div className="panel">
        <h2>Calibrate all four probes</h2>
        <p>
          Use the connected cable and electrodes. A bucket is fine for initial testing; repeat
          calibration after the final tank installation.
        </p>
        <p>
          Each capture takes about 100 seconds after delivery. Cloud progress refreshes every ten
          seconds. Keep the electrodes in position until the capture finishes. Automatic low-water
          beeping stays silent during calibration.
        </p>
        {!connected ? (
          <p role="status">Waiting for the ESP32 to connect.</p>
        ) : !supported ? (
          <p role="status">Waiting for the calibration firmware update.</p>
        ) : !fresh ? (
          <p role="status">
            Waiting for a fresh probe update. Your preparation confirmation stays selected.
          </p>
        ) : null}
        {cooldown && !commandActive && !capturing ? (
          <p role="status">
            Ready for the next capture in{' '}
            {Math.max(0, Math.ceil((120000 - (now - command!.requestedAt)) / 1000))} seconds.
          </p>
        ) : null}
        {preview ? <p>Preview only. Physical calibration is available after signing in.</p> : null}
        {home.role !== 'owner' ? <p>Only the household owner can start calibration.</p> : null}
        {command ? (
          <p role="status">
            Last {command.mode.toUpperCase()} request:{' '}
            {command.expiresAt < now && ['queued', 'started'].includes(command.status)
              ? 'expired — check connectivity and request again'
              : command.status === 'queued'
                ? 'waiting for the ESP32'
                : command.status === 'started'
                  ? 'capturing readings'
                  : command.status === 'complete'
                    ? 'capture finished'
                    : command.status === 'rejected'
                      ? 'rejected or interrupted — check the electrodes and try again'
                      : command.status}
            .
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
      <div className="panel">
        <h2>1. Capture DRY</h2>
        <p>
          Remove all four level electrodes from the water. Clean and dry them, and keep them
          separated. This replaces the previous dry and wet calibration.
        </p>
        <label className="capture-confirm">
          <input
            type="checkbox"
            checked={prepared === 'dry'}
            disabled={!canPrepare}
            onChange={(e) => setPrepared(e.target.checked ? 'dry' : null)}
          />{' '}
          All four level electrodes are dry, out of water and separated.
        </label>
        <button
          className="button primary"
          disabled={!ready || prepared !== 'dry'}
          onClick={() => void start('dry')}
        >
          {sending ? 'Requesting…' : 'Capture DRY'}
        </button>
      </div>
      <div className="panel">
        <h2>2. Capture WET</h2>
        <p>
          After DRY finishes, immerse the 20%, 50%, 80% and 100% electrodes and the common electrode
          in the same water. Keep every electrode from touching another.
        </p>
        {!dryReady ? <p>Complete DRY on all four probes first.</p> : null}
        <label className="capture-confirm">
          <input
            type="checkbox"
            checked={prepared === 'wet'}
            disabled={!canPrepare || !dryReady}
            onChange={(e) => setPrepared(e.target.checked ? 'wet' : null)}
          />{' '}
          All four level electrodes and common are immersed, without touching.
        </label>
        <button
          className="button primary"
          disabled={!ready || !dryReady || prepared !== 'wet'}
          onClick={() => void start('wet')}
        >
          Capture WET
        </button>
      </div>
      <div className="panel table-scroll">
        <h2>3. Check the results</h2>
        <table className="diagnostic-table">
          <caption>Live calibration values</caption>
          <thead>
            <tr>
              <th>Probe</th>
              <th>Dry</th>
              <th>Wet</th>
              <th>Capture variation</th>
              <th>Progress / result</th>
            </tr>
          </thead>
          <tbody>
            {reading?.probes.map((p) => (
              <tr key={p.gpio}>
                <td>
                  {p.level}% · GPIO{p.gpio}
                </td>
                <td>{p.calibration?.dryReady ? p.calibration.dry : 'Pending'}</td>
                <td>{p.calibration?.wetReady ? p.calibration.wet : 'Pending'}</td>
                <td>
                  {p.calibration?.dryNoise !== undefined && p.calibration.wetNoise !== undefined
                    ? `Dry ${p.calibration.dryNoise} / Wet ${p.calibration.wetNoise}`
                    : 'Not reported'}
                </td>
                <td>
                  {p.calibration?.capture !== undefined && p.calibration.capture !== 'none'
                    ? `${p.calibration.capture.toUpperCase()} ${p.calibration.cycles}/${p.calibration.targetCycles ?? 20}`
                    : p.calibrated
                      ? 'Good separation'
                      : p.calibration?.wetReady
                        ? 'WET − DRY must exceed 500 — check water contact / wiring'
                        : 'Needs calibration'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          After WET finishes, allow about 15 seconds for stable confirmation. Then test each
          electrode transition. Tank readings should follow 20% → 50% → 80% → 100% as water rises.
        </p>
      </div>
    </section>
  );
}
