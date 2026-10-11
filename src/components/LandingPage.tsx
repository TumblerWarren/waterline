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
      <p className="eyebrow">YOUR HOME. YOUR WATER.</p>
      <h1>
        A little clarity.
        <br />
        <span>A lot of peace of mind.</span>
      </h1>
      <p className="landing-copy">
        Your tank, alarms and family—all connected. Check your water wherever you are, or connect
        nearby with Bluetooth.
      </p>
      <div className="landing-actions">
        <button className="button primary" onClick={signIn} disabled={loading}>
          {loading ? 'Opening your household…' : 'Sign in to Waterline'}
          <ArrowRight size={19} />
        </button>
        {native ? (
          <button className="button secondary" onClick={nearby}>
            <Bluetooth size={19} />
            Connect nearby board
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="landing-features">
        <span>
          <Waves size={18} />
          Live tank readings
        </span>
        <span>
          <ShieldCheck size={18} />
          Private family access
        </span>
      </div>
    </main>
  );
}
