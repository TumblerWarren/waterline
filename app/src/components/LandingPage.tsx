import { t } from '../language';
import { ArrowRight, Bluetooth, ShieldCheck, Waves } from 'lucide-react';
export function LandingPage({
  signIn,
  nearby,
  loading,
  error,
  native,
}: {
  signIn: () => void;
  nearby: () => void;
  loading: boolean;
  error?: string;
  native: boolean;
}) {
  return (
    <main className="landing-page">
      <header className="landing-brand">
        <img src="/waterline-icon.png" alt="" />
        <span>
          waterline<span className="brand-dot">.</span>
        </span>
      </header>
      <div className="landing-orbit">
        <div className="landing-halo" />
        <img src="/waterline-icon.png" alt="Waterline blue droplet with a wave" />
      </div>
      <p className="eyebrow">{t('YOUR HOME. YOUR WATER.')}</p>
      <h1>
        {t('A little clarity.')}
        <br />
        <span>{t('A lot of peace of mind.')}</span>
      </h1>
      <p className="landing-copy">
        {t(
          'Your tank, alarms and family—all connected. Check your water wherever you are, or connect nearby with Bluetooth.',
        )}
      </p>
      <div className="landing-actions">
        <button className="button primary" onClick={signIn} disabled={loading}>
          {loading ? t('Opening your household…') : t('Sign in to Waterline')}
          <ArrowRight size={19} />
        </button>
        {native ? (
          <button className="button secondary" onClick={nearby}>
            <Bluetooth size={19} />
            {t('Connect nearby board')}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      ) : null}
      <div className="landing-features">
        <span>
          <Waves size={18} />
          {t('Live tank readings')}
        </span>
        <span>
          <ShieldCheck size={18} />
          {t('Private family access')}
        </span>
      </div>
    </main>
  );
}
