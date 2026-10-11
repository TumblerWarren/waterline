import { ThemedSelect } from './components/ThemedSelect';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity as ActivityIcon,
  Bluetooth,
  UserRound,
  ArrowDownLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Copy,
  Droplet,
  FlaskConical,
  Gauge,
  History,
  House,
  Info,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  Volume2,
  VolumeX,
  Waves,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useSession } from './auth';
import { useHousehold } from './useHousehold';
import {
  bandLabels,
  canTestBuzzer,
  mayManage,
  readingCondition,
  type Member,
  type Preferences,
} from '../shared/model';
import { Dialog } from './components/Dialog';
import { Tank } from './components/Tank';
import { HistoryChart } from './components/HistoryChart';
import { CalibrationPage } from './components/CalibrationPage';
import { LevelAlarms } from './components/LevelAlarms';
import { ProbesPage } from './components/ProbesPage';
import { usePhoneNotifications } from './notifications';
import { NearbyBoard, useNearby } from './components/NearbyBoard';
import { ProfileSheet } from './components/ProfileSheet';
import { LandingPage } from './components/LandingPage';
import {
  freshSource,
  selectSource,
  type SourcePreference,
  type ReadingSource,
} from '../shared/source';
import { isNative } from './native';
import { minimizeApp, useNativeNavigation, useMotionVisibility } from './native';

type Page =
  | 'overview'
  | 'history'
  | 'alarm'
  | 'bluetooth'
  | 'household'
  | 'settings'
  | 'calibration'
  | 'probes';
type Modal =
  'profile' | 'invite' | 'alerts' | 'diagnostics' | 'signin' | 'calibration' | 'remove' | null;
const mainPages = [
  { id: 'overview' as const, name: 'Overview', icon: Gauge },
  { id: 'history' as const, name: 'History', icon: History },
  { id: 'alarm' as const, name: 'Alarm', icon: Bell },
  { id: 'bluetooth' as const, name: 'Bluetooth', icon: Bluetooth },
];
const profilePages = [
  { id: 'settings' as const, name: 'Settings', icon: Settings },
  { id: 'calibration' as const, name: 'Calibration', icon: FlaskConical },
  { id: 'probes' as const, name: 'Probes', icon: ActivityIcon },
  { id: 'household' as const, name: 'Household', icon: Users },
];
const pages = [...mainPages, ...profilePages];
const roleLabels = { viewer: 'Viewer', operator: 'Operator', owner: 'Owner' };
const roleDescriptions = {
  viewer: 'See readings, history and alerts.',
  operator: 'View the tank and use available device controls.',
  owner: 'Manage members, settings and device setup.',
};
function age(at: number | null) {
  if (!at) return 'No reading yet';
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return seconds < 5
    ? 'Just now'
    : seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : `${Math.floor(seconds / 3600)}h ago`;
}
function initialPage(): Page {
  const value = window.location.hash.slice(1);
  return pages.some((page) => page.id === value) ? (value as Page) : 'overview';
}
function initialInvitation() {
  const match = window.location.hash.match(/^#join=([a-f0-9]{64})$/);
  if (match) {
    sessionStorage.setItem('waterline-invite', match[1]);
    window.history.replaceState({}, '', '/');
  }
  return sessionStorage.getItem('waterline-invite') || '';
}

export default function App() {
  const session = useSession();
  const [invitationToken, setInvitationToken] = useState(initialInvitation);
  const preview = false;
  const model = useHousehold(preview);
  const cloudHome = model.household;
  const nearby = useNearby();
  const [sourcePreference, setSourcePreference] = useState<SourcePreference>('auto');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [commandSource, setCommandSource] = useState<ReadingSource | null>(null);
  const sourceInFlight = useRef(false);
  const [page, setPage] = useState<Page>(initialPage);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [inviteCreated, setInviteCreated] = useState(false);
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [now, setNow] = useState(Date.now);
  const historyPoints = useMemo(
    () =>
      (cloudHome?.history ?? []).filter(
        (point) => point.at >= Date.now() - (range === '24h' ? 1 : 7) * 86400000,
      ),
    [cloudHome?.history, range],
  );
  const cloudFresh = freshSource(cloudHome?.reading ?? null, 'cloud', now);
  const source =
    commandSource ??
    (preview
      ? 'cloud'
      : selectSource(sourcePreference, cloudHome?.reading ?? null, nearby.reading, now));
  const activeHome =
    source === 'bluetooth'
      ? {
          ...nearby.localHome,
          reading: nearby.reading
            ? { ...nearby.reading, connected: freshSource(nearby.reading, 'bluetooth', now) }
            : null,
        }
      : cloudHome;
  const home =
    page === 'bluetooth'
      ? (activeHome ?? nearby.localHome)
      : ['overview', 'alarm', 'probes'].includes(page)
        ? activeHome
        : cloudHome;
  const setCloudAvailable = nearby.setCloudAvailable;
  useEffect(() => {
    setCloudAvailable(preview || cloudFresh);
  }, [preview, cloudFresh, setCloudAvailable]);
  useMotionVisibility(() => setNow(Date.now()));
  async function sourceAction<T>(action: () => Promise<T>) {
    if (sourceInFlight.current) throw new Error('Wait for the current board request to finish.');
    sourceInFlight.current = true;
    setCommandSource(source);
    setSourceBusy(true);
    try {
      return await action();
    } finally {
      sourceInFlight.current = false;
      setSourceBusy(false);
      setCommandSource(null);
    }
  }
  const saveAlarms = source === 'bluetooth' ? nearby.save : model.saveAlarms;
  const acknowledgeLevels = source === 'bluetooth' ? nearby.acknowledge : model.acknowledgeLevels;
  const buzzer = source === 'bluetooth' ? nearby.control : model.buzzer;

  const phoneNotifications = usePhoneNotifications(
    session.authenticated,
    preview,
    model.request,
    () => {
      setSourcePreference('cloud');
      navigate('alarm');
      void model.refresh();
    },
  );
  async function signOut() {
    if (sourceInFlight.current)
      throw new Error('Wait for the current board request before signing out.');
    if (nearby.connected) await nearby.disconnect();
    setSourcePreference('auto');
    navigate('overview');
    try {
      await phoneNotifications.disable();
    } finally {
      await session.logout();
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useNativeNavigation(
    () => {
      if (modal) setModal(null);
      else if (page !== 'overview') navigate('overview');
      else void minimizeApp();
    },
    (token) => {
      sessionStorage.setItem('waterline-invite', token);
      setInvitationToken(token);
    },
  );
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.error ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function navigate(next: Page) {
    setPage(next);
    window.history.replaceState({}, '', `/#${next}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function run(task: () => Promise<unknown>, message?: string) {
    setBusy(true);
    try {
      await task();
      if (message) setToast({ text: message, error: false });
      return true;
    } catch (error) {
      setToast({
        text: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  function signIn() {
    if (!session.configured) {
      setModal('signin');
      return;
    }
    void run(session.login);
  }
  const condition = readingCondition(home?.reading ?? null, now);
  const reading = home?.reading;
  const owner = cloudHome ? mayManage(cloudHome.role) : false;
  const testAllowed = home
    ? canTestBuzzer(home.role, home.reading, now) &&
      (preview || home.reading?.buzzerControlSupported === true)
    : false;
  const buzzerPending =
    source === 'cloud' &&
    home?.buzzerCommand &&
    ['queued', 'started'].includes(home.buzzerCommand.status) &&
    home.buzzerCommand.expiresAt > now;
  const buzzerTesting = Boolean(
    home?.reading?.buzzerTestingUntil && home.reading.buzzerTestingUntil > now,
  );
  const unread =
    (home?.alerts.filter((alert) => !alert.acknowledged).length ?? 0) +
    (home?.reading?.levelAlarms?.filter((a) => a.active).length ?? 0);
  const uncertain =
    condition === 'fault' || condition === 'uncalibrated' || condition === 'unpaired';
  const band = reading?.band ?? 'unknown';
  const conditionLabel = {
    healthy: 'Connected',
    offline: 'Offline',
    fault: 'Sensor fault',
    uncalibrated: 'Needs calibration',
    unpaired: 'No device connected',
  }[condition];
  const meaningfulBand = uncertain ? 'Not confirmed' : bandLabels[band];
  const greeting =
    condition === 'offline'
      ? 'A little out of touch.'
      : condition === 'fault'
        ? 'Let’s check the probes.'
        : condition === 'uncalibrated'
          ? 'A reading starts with calibration.'
          : band === 'low'
            ? 'Time for a refill.'
            : band === 'full'
              ? 'All topped up.'
              : 'Your water, at a glance.';
  const inviteForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await run(async () => {
      const link = await model.invite(
        String(values.get('email')).trim().toLowerCase(),
        values.get('role') as 'viewer' | 'operator',
      );
      setInvitationUrl(link);
      setInviteCreated(true);
    });
  };
  const settingsForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const preferences: Preferences = {
      low: values.has('low'),
      full: values.has('full'),
      fault: values.has('fault'),
      offline: values.has('offline'),
    };
    await run(
      () => model.saveSettings(String(values.get('tankName')).trim(), preferences),
      preview ? 'Settings saved for this preview session.' : 'Household settings saved.',
    );
  };

  if (
    !session.authenticated &&
    !preview &&
    page !== 'bluetooth' &&
    !nearby.connected &&
    !invitationToken
  ) {
    return (
      <>
        <LandingPage
          native={isNative}
          loading={session.loading}
          error={session.error}
          signIn={signIn}
          nearby={() => {
            setSourcePreference('bluetooth');
            navigate('bluetooth');
          }}
        />
        {modal === 'signin' ? (
          <Dialog title="Sign in to Waterline" close={() => setModal(null)}>
            <p>Sign-in is not configured in this browser build. Use the installed Android app.</p>
            <button
              className="button primary"
              onClick={() => {
                setModal(null);
              }}
            >
              Close
            </button>
          </Dialog>
        ) : null}
      </>
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          href="/#overview"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate('overview');
          }}
        >
          <span className="brand-mark">
            <img src="/waterline-icon.png" alt="" />
          </span>
          <span>
            waterline<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="home-switch">
          <span className="home-icon">
            <House size={18} />
          </span>
          <div>
            <strong>{home?.name ?? 'Your household'}</strong>
            <small>Household dashboard</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {mainPages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {page === item.id ? <span className="nav-active-dot" /> : null}
            </button>
          ))}
        </nav>
        <button
          className="profile-trigger"
          aria-label="Open profile menu"
          aria-haspopup="dialog"
          onClick={() => setModal('profile')}
        >
          {session.authenticated ? (
            (session.name || 'You')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
          ) : (
            <UserRound size={22} />
          )}
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Waves size={22} />
            <p>
              A little peace of mind.
              <br />
              <span>One reading at a time.</span>
            </p>
          </div>
          <button className="help-button" onClick={() => setModal('diagnostics')}>
            <CircleHelp size={17} />
            Device & connection
          </button>
          <div className="profile">
            <span className="avatar">
              {preview ? 'YO' : (session.name || 'You').slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{preview ? 'Preview household' : session.name || 'Your account'}</strong>
              <small>
                {home
                  ? roleLabels[home.role]
                  : session.authenticated
                    ? 'Signed in'
                    : 'Not signed in'}
              </small>
            </div>
            <button
              className="icon-button"
              title={session.authenticated && !preview ? 'Sign out' : 'Sign in'}
              aria-label={session.authenticated && !preview ? 'Sign out' : 'Sign in'}
              onClick={() => setModal('profile')}
            >
              {session.authenticated && !preview ? <LogOut size={17} /> : <LogIn size={17} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <House size={15} />
            <span>{home?.name ?? 'Your household'}</span>
            <span className="slash">/</span>
            <strong>{pages.find((item) => item.id === page)?.name}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={15} />
              Private household
            </span>
            <button
              className="icon-button notification-button"
              onClick={() => navigate('alarm')}
              aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}
            >
              <Bell size={19} />
              {unread ? <span className="notification-dot" /> : null}
            </button>
          </div>
        </header>

        <main id="main" className="main-content">
          {['overview', 'alarm', 'probes'].includes(page) && !preview ? (
            <section className="source-bar" aria-label="Reading connection">
              <div>
                <span
                  className={`source-dot ${freshSource(activeHome?.reading ?? null, source, now) ? 'fresh' : ''}`}
                />
                <strong>
                  {source === 'bluetooth' ? 'Nearby · Bluetooth' : 'Cloud connection'}
                </strong>
                <small>
                  {freshSource(activeHome?.reading ?? null, source, now)
                    ? 'Live readings'
                    : 'Waiting for fresh readings'}
                </small>
              </div>
              <label>
                <span className="sr-only">Reading and control source</span>
                <ThemedSelect
                  label="Reading and control source"
                  value={sourcePreference}
                  disabled={sourceBusy || busy || nearby.busy}
                  onValueChange={(value) => setSourcePreference(value as SourcePreference)}
                >
                  <option value="auto">Auto</option>
                  <option value="cloud">Cloud</option>
                  <option value="bluetooth">Bluetooth</option>
                </ThemedSelect>
              </label>
              {source === 'bluetooth' && !nearby.connected ? (
                <button className="text-button" onClick={() => navigate('bluetooth')}>
                  Connect
                  <ArrowRight size={15} />
                </button>
              ) : null}
            </section>
          ) : null}
          {invitationToken && !preview ? (
            <section className="join-panel">
              <Users size={28} />
              <h1>You’re invited.</h1>
              <p>
                Sign in with the email address the invitation was sent to, then join your household.
              </p>
              {session.authenticated ? (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await model.request('/api/invitations/accept', 'POST', {
                        token: invitationToken,
                        name: session.name,
                      });
                      sessionStorage.removeItem('waterline-invite');
                      setInvitationToken('');
                      await model.refresh();
                    }, 'Welcome to your household.')
                  }
                >
                  Join household
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button className="button primary" onClick={signIn}>
                  Sign in to join
                  <ArrowRight size={16} />
                </button>
              )}
            </section>
          ) : null}
          {!home ? (
            <section className="welcome-panel">
              {page === 'calibration' ? (
                <p className="inline-note">
                  Calibration capture needs a signed-in Cloud connection. Bluetooth capture is not
                  supported. Nearby live readings remain available in Overview.
                </p>
              ) : null}
              {page === 'history' && nearby.connected ? (
                <p className="inline-note">
                  Cloud history is unavailable here. Your live Bluetooth readings remain available
                  in Overview.
                </p>
              ) : null}
              <div className="welcome-art">
                <Droplet size={64} strokeWidth={1} fill="#b4e6cf" />
              </div>
              <p className="eyebrow">A LITTLE PEACE OF MIND</p>
              <h1>
                Keep your home
                <br />
                in balance.
              </h1>
              {source === 'bluetooth' ? (
                <button className="button primary" onClick={() => navigate('bluetooth')}>
                  Connect nearby board
                  <Bluetooth size={18} />
                </button>
              ) : null}
              <p>
                One place for your tank’s readings, alerts and the people you share your home with.
              </p>
              {session.loading || model.loading ? (
                <p role="status">Loading your household…</p>
              ) : session.authenticated ? (
                <>
                  <p>
                    Signed in as{' '}
                    <strong>{session.name || session.email || 'a household member'}</strong>.
                  </p>
                  {session.email ? <p>{session.email}</p> : null}
                  {session.emailVerified === false ? (
                    <p className="message warning">Verify your email before joining a household.</p>
                  ) : null}
                  <p className="message warning">
                    {model.error || 'Your household is being prepared.'}
                  </p>
                  <button className="button secondary" onClick={() => void model.refresh()}>
                    Try again
                    <RefreshCw size={15} />
                  </button>
                  <button className="text-button" onClick={() => void run(signOut)} disabled={busy}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button className="button primary" onClick={signIn}>
                    Sign in to your household
                    <ArrowRight size={17} />
                  </button>
                  {session.error ? <p className="message warning">{session.error}</p> : null}
                </>
              )}
            </section>
          ) : (
            <>
              {page === 'overview' ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">HOME, IN BALANCE</p>
                      <h1>{greeting}</h1>
                      <p>A clear view of your tank. Wherever you are.</p>
                    </div>
                    <span className="date-label">
                      {new Date().toLocaleDateString([], {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <div className="dashboard-grid">
                    <section
                      className={`panel tank-panel ${band === 'low' && !uncertain ? 'low-tank' : ''}`}
                    >
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">YOUR TANK</span>
                          <h2>{home.tankName}</h2>
                        </div>
                        <span
                          className={`status-pill ${condition === 'healthy' ? 'good' : condition === 'offline' ? 'muted' : 'warn'}`}
                        >
                          <span className="status-dot" />
                          {conditionLabel}
                        </span>
                      </div>
                      <div className="tank-content">
                        <div className="tank-text">
                          <p className="small-label">
                            {condition === 'offline' ? 'LAST KNOWN LEVEL' : 'CONFIRMED LEVEL BAND'}
                          </p>
                          <div className={`level-display ${uncertain ? 'level-unknown' : ''}`}>
                            {meaningfulBand}
                          </div>
                          <p className="level-description">
                            {condition === 'offline'
                              ? 'Waiting for the device to reconnect.'
                              : condition === 'fault'
                                ? reading?.fault || 'Waiting for a fresh, stable measurement.'
                                : condition === 'uncalibrated'
                                  ? 'Calibrate the installed probes to confirm the level.'
                                  : condition === 'unpaired'
                                    ? 'Your device has not been paired yet.'
                                    : band === 'full'
                                      ? 'Water has reached the full electrode.'
                                      : band === 'low'
                                        ? 'Water is below the lowest electrode.'
                                        : `Measured by the ${(reading?.probes ?? []).map((p) => `${p.level}%`).join(', ')} electrodes.`}
                          </p>
                          <div className="reading-time">
                            <Clock3 size={14} />
                            {age(reading?.measuredAt ?? null)}
                            {preview && condition === 'healthy' ? (
                              <span className="live-dot" />
                            ) : null}
                          </div>
                        </div>
                        <Tank band={band} uncertain={uncertain} stale={condition === 'offline'} />
                      </div>
                      <div className="probe-strip">
                        {([20, 50, 80, 100] as const).map((level) => {
                          const probe = reading?.probes.find((probe) => probe.level === level);
                          return (
                            <div className={`probe-level-${level}`} key={level}>
                              <span
                                className={`probe-dot ${probe?.state === 'wet' && !uncertain ? 'wet' : ''}`}
                              />
                              <span>{level}% probe</span>
                              <strong>
                                {!probe || uncertain
                                  ? 'Unknown'
                                  : probe.state === 'wet'
                                    ? 'Wet'
                                    : 'Dry'}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                      <p className="tank-footnote">
                        <Info size={13} />
                        {condition === 'offline'
                          ? 'Probe states are historical until the device reconnects.'
                          : 'A level band, rather than an exact volume measurement.'}
                      </p>
                    </section>
                    <section className="panel overview-alarm-summary">
                      <div className="panel-heading">
                        <h2>Water alarms</h2>
                        <Bell size={21} />
                      </div>
                      <strong>
                        {home.reading?.levelAlarms?.filter((a) => a.active).length ?? 0} active
                        alarms
                      </strong>
                      <p>
                        {home.reading?.buzzerEnabled
                          ? 'Automatic buzzer enabled'
                          : 'Automatic buzzer disabled'}
                      </p>
                      <div className="alarm-mini-levels">
                        {[20, 50, 80, 100].map((level) => (
                          <span className={`probe-level-${level}`} key={level}>
                            {level === 20 ? '<20%' : `${level}%`}
                          </span>
                        ))}
                      </div>
                      <button
                        className="button secondary full-width"
                        onClick={() => navigate('alarm')}
                      >
                        Open alarms
                        <ArrowRight size={17} />
                      </button>
                    </section>
                  </div>
                  <section className="connection-strip">
                    <div>
                      <span className="connection-icon">
                        {condition === 'offline' ? <WifiOff size={19} /> : <Wifi size={19} />}
                      </span>
                      <div>
                        <strong>
                          {condition === 'offline'
                            ? 'Device disconnected'
                            : reading
                              ? source === 'bluetooth'
                                ? 'Nearby Bluetooth connection'
                                : 'Cloud connection'
                              : 'Device setup pending'}
                        </strong>
                        <small>
                          {preview
                            ? 'Simulated connection'
                            : reading
                              ? source === 'bluetooth'
                                ? 'Direct from your paired board'
                                : 'Readings received through your cloud backend'
                              : 'Waiting for the ESP32’s first upload'}
                        </small>
                      </div>
                    </div>
                    <div>
                      <small>Last contact</small>
                      <strong>{age(reading?.lastSeen ?? null)}</strong>
                    </div>
                    <div>
                      <small>Probe calibration</small>
                      <strong>
                        {reading
                          ? reading.calibrated
                            ? preview
                              ? 'Sample calibration ready'
                              : 'Calibration ready'
                            : 'Not calibrated'
                          : 'Awaiting device'}
                      </strong>
                    </div>
                    <button className="text-button" onClick={() => setModal('diagnostics')}>
                      Details
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  <div className="bottom-grid">
                    <section className="panel history-preview">
                      <div className="panel-heading">
                        <div>
                          <h2>The past 24 hours</h2>
                          <p>Confirmed bands, one step at a time.</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="View full history"
                          onClick={() => navigate('history')}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                      <HistoryChart points={cloudHome?.history ?? []} compact />
                    </section>
                    <section className="panel activity-panel">
                      <div className="panel-heading">
                        <h2>Recent activity</h2>
                        <ActivityIcon size={17} />
                      </div>
                      {home.activities.slice(0, 3).map((event) => (
                        <div className="activity-row" key={event.id}>
                          <span className={`event-icon ${event.tone}`}>
                            {event.tone === 'success' ? (
                              <Check size={14} />
                            ) : (
                              <ArrowDownLeft size={14} />
                            )}
                          </span>
                          <div>
                            <strong>{event.title}</strong>
                            <small>{age(event.at)}</small>
                          </div>
                        </div>
                      ))}
                      {!home.activities.length ? (
                        <p className="empty-copy">
                          Activity will appear as your household gets set up.
                        </p>
                      ) : null}
                    </section>
                  </div>
                </>
              ) : null}

              {page === 'alarm' ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">STAY IN THE KNOW</p>
                      <h1>Your water alarms.</h1>
                      <p>Choose when to sound. Quiet them when you’re ready.</p>
                    </div>
                  </div>
                  <LevelAlarms
                    key={`status-${source}`}
                    home={home}
                    now={now}
                    preview={preview}
                    externalBusy={sourceBusy || busy || nearby.busy}
                    transport={source}
                    save={(rules) => sourceAction(() => saveAlarms(rules))}
                    acknowledge={(alarms) => sourceAction(() => acknowledgeLevels(alarms))}
                  />
                  <section className="panel control-panel">
                    <div className="panel-heading">
                      <h2>Local alarm</h2>
                      <span className="small-icon">
                        <Volume2 size={19} />
                      </span>
                    </div>
                    <div className="alarm-state">
                      <span className={`status-pill ${reading?.buzzerEnabled ? 'good' : 'muted'}`}>
                        {reading
                          ? reading.buzzerEnabled
                            ? 'Enabled'
                            : 'Disabled'
                          : 'Not connected'}
                      </span>
                      {buzzerTesting ? (
                        <span className="test-countdown" role="status">
                          Testing ·{' '}
                          {Math.max(
                            0,
                            Math.ceil(((reading?.buzzerTestingUntil ?? now) - now) / 1000),
                          )}
                          s
                        </span>
                      ) : null}
                    </div>
                    <p>
                      All automatic alarms use the buzzer settings below. A test sounds for ten
                      seconds and disables automatic alarms; re-enable them after testing.
                    </p>
                    {!preview && source === 'cloud' && home.buzzerCommand ? (
                      <p role="status">
                        {home.buzzerCommand.status === 'queued'
                          ? 'Request queued. Waiting for the board…'
                          : home.buzzerCommand.status === 'started'
                            ? 'Board accepted the request…'
                            : home.buzzerCommand.status === 'complete'
                              ? 'Board completed the request.'
                              : home.buzzerCommand.status === 'expired'
                                ? 'Request expired. Try again when the board is connected.'
                                : 'Board could not complete the request. Please retry.'}
                      </p>
                    ) : null}
                    <button
                      className="button secondary full-width"
                      disabled={
                        !testAllowed ||
                        busy ||
                        sourceBusy ||
                        nearby.busy ||
                        buzzerTesting ||
                        Boolean(buzzerPending)
                      }
                      onClick={() =>
                        void run(
                          () => sourceAction(() => buzzer('test')),
                          preview
                            ? 'Ten-second test simulated. Re-enable the alarm after testing.'
                            : 'Test requested.',
                        )
                      }
                    >
                      <Volume2 size={16} />
                      {buzzerTesting ? 'Test in progress' : 'Test buzzer · 10 seconds'}
                    </button>
                    <button
                      className="text-button alarm-toggle"
                      disabled={
                        !testAllowed || busy || sourceBusy || nearby.busy || Boolean(buzzerPending)
                      }
                      onClick={() =>
                        void run(
                          () =>
                            sourceAction(() =>
                              buzzer(reading?.buzzerEnabled ? 'disable' : 'enable'),
                            ),
                          preview
                            ? 'Alarm setting changed in preview.'
                            : 'Alarm setting requested.',
                        )
                      }
                    >
                      {reading?.buzzerEnabled ? <VolumeX size={15} /> : <Volume2 size={15} />}{' '}
                      {reading?.buzzerEnabled ? 'Disable local alarm' : 'Enable local alarm'}
                    </button>
                    {home.role === 'viewer' ? (
                      <small className="permission-note">
                        Operator or Owner access is needed for controls.
                      </small>
                    ) : condition === 'offline' ? (
                      <small className="permission-note">
                        Controls are unavailable while the device is offline.
                      </small>
                    ) : null}
                  </section>

                  <LevelAlarms
                    key={`edit-${source}-${home.id}-${home.alarmSettings?.revision ?? 0}`}
                    home={home}
                    now={now}
                    preview={preview}
                    edit
                    externalBusy={sourceBusy || busy || nearby.busy}
                    transport={source}
                    save={(rules) => sourceAction(() => saveAlarms(rules))}
                    acknowledge={(alarms) => sourceAction(() => acknowledgeLevels(alarms))}
                  />
                  <section className="panel calibration-panel">
                    <h2>Phone alarm notifications</h2>
                    <p>
                      Receive a sound notification for each new below-20%, 50%, 80% or 100% buzzer
                      alarm. Tap it to open Waterline. Acknowledged alarms do not send another alert
                      until re-armed.
                    </p>
                    <p role="status">
                      {phoneNotifications.supported
                        ? phoneNotifications.status
                        : 'Available in the signed-in Android app.'}
                    </p>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!phoneNotifications.supported || busy}
                      onClick={() =>
                        phoneNotifications.enabled
                          ? void run(phoneNotifications.disable)
                          : phoneNotifications.enable()
                      }
                    >
                      {phoneNotifications.enabled
                        ? 'Disable phone notifications'
                        : 'Enable phone notifications'}
                    </button>
                    <p>
                      Sound follows Android notification volume and Do Not Disturb. Delivery needs
                      internet and may be delayed. The board buzzer continues independently.
                    </p>
                  </section>

                  {source === 'cloud' && home.alerts.length ? (
                    <section className="panel cloud-alert-list">
                      <h2>Household alerts</h2>
                      {home.alerts.map((a) => (
                        <article className="alert-item" key={a.id}>
                          <div>
                            <strong>{a.title}</strong>
                            <p>{a.detail}</p>
                            <small>
                              {age(a.at)} ·{' '}
                              {a.acknowledged ? 'Acknowledged' : 'Reported by the board'}
                            </small>
                          </div>
                        </article>
                      ))}
                    </section>
                  ) : null}
                  {source === 'bluetooth' ? (
                    <p className="inline-note">
                      Bluetooth changes are saved directly on your paired board. Phone notifications
                      still need a signed-in account and internet.
                    </p>
                  ) : null}
                </>
              ) : null}
              {page === 'bluetooth' ? <NearbyBoard /> : null}

              {page === 'history' ? (
                <>
                  <p className="inline-note">
                    Cloud history · Bluetooth readings are live and are not added to this chart.
                  </p>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">A LITTLE PERSPECTIVE</p>
                      <h1>Your tank over time.</h1>
                      <p>Level changes and the moments that matter.</p>
                    </div>
                    <div className="segmented" aria-label="History time range">
                      <button
                        className={range === '24h' ? 'selected' : ''}
                        onClick={() => setRange('24h')}
                      >
                        24 hours
                      </button>
                      <button
                        className={range === '7d' ? 'selected' : ''}
                        onClick={() => setRange('7d')}
                      >
                        7 days
                      </button>
                    </div>
                  </div>
                  <section className="panel full-history">
                    <div className="panel-heading">
                      <h2>{home.tankName}</h2>
                      <span className="subtle-label">
                        {range === '7d'
                          ? 'Available readings from the past 7 days'
                          : 'Past 24 hours'}
                        {preview ? ' · sample history' : ''}
                      </span>
                    </div>
                    <HistoryChart key={range} points={historyPoints} />
                    <p className="tank-footnote">
                      <Info size={14} />
                      Offline and uncertain readings appear as gaps. This chart does not measure
                      litres or consumption.
                    </p>
                  </section>
                  <section className="panel event-list">
                    <div className="panel-heading">
                      <h2>Household activity</h2>
                      <span className="subtle-label">{home.activities.length} events</span>
                    </div>
                    {home.activities.map((event) => (
                      <div className="event-list-row" key={event.id}>
                        <span className={`event-icon ${event.tone}`}>
                          {event.tone === 'success' ? (
                            <Check size={15} />
                          ) : (
                            <ActivityIcon size={15} />
                          )}
                        </span>
                        <div>
                          <strong>{event.title}</strong>
                          <p>{event.detail}</p>
                        </div>
                        <time dateTime={new Date(event.at).toISOString()}>
                          {new Date(event.at).toLocaleString([], {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                    ))}
                    {!home.activities.length ? (
                      <p className="empty-copy">No activity yet.</p>
                    ) : null}
                  </section>
                </>
              ) : null}

              {page === 'household' ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">BETTER, TOGETHER</p>
                      <h1>Your people. Your home.</h1>
                      <p>Everyone gets their own sign-in and the access they need.</p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!owner}
                      onClick={() => {
                        setInviteCreated(false);
                        setInvitationUrl(null);
                        setModal('invite');
                      }}
                    >
                      <Plus size={17} />
                      Invite family
                    </button>
                  </div>
                  <section className="panel members-panel">
                    <div className="panel-heading">
                      <h2>Household members</h2>
                      <span className="subtle-label">
                        {home.members.length} members{preview ? ' · sample people' : ''}
                      </span>
                    </div>
                    {home.members.map((member) => (
                      <div className="member-row" key={member.id}>
                        <span className={`avatar ${member.isYou ? '' : 'soft'}`}>
                          {member.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="member-name">
                          <strong>
                            {member.name}
                            {member.isYou ? <span className="you-label">You</span> : null}
                          </strong>
                          <small>{member.email}</small>
                        </div>
                        {owner && member.role !== 'owner' ? (
                          <>
                            <label className="sr-only" htmlFor={`role-${member.id}`}>
                              Access for {member.name}
                            </label>
                            <ThemedSelect
                              id={`role-${member.id}`}
                              disabled={busy}
                              label={'Access for ' + member.name}
                              value={member.role}
                              onValueChange={(value) =>
                                void run(
                                  () =>
                                    model.changeMember(member.id, value as 'viewer' | 'operator'),
                                  'Access updated.',
                                )
                              }
                            >
                              <option value="viewer">Viewer</option>
                              <option value="operator">Operator</option>
                            </ThemedSelect>
                            <button
                              className="icon-button"
                              onClick={() => {
                                setSelectedMember(member);
                                setModal('remove');
                              }}
                              aria-label={`Remove ${member.name}`}
                            >
                              <Trash2 size={17} />
                            </button>
                          </>
                        ) : (
                          <span className="role-pill">
                            <ShieldCheck size={13} />
                            {roleLabels[member.role]}
                          </span>
                        )}
                      </div>
                    ))}
                  </section>
                  {home.invitations.length ? (
                    <section className="panel invitations-panel">
                      <div className="panel-heading">
                        <h2>Pending invitations</h2>
                        <span className="subtle-label">Expire after 7 days</span>
                      </div>
                      {home.invitations.map((invite) => (
                        <div className="member-row" key={invite.id}>
                          <span className="avatar soft">
                            <Clock3 size={18} />
                          </span>
                          <div className="member-name">
                            <strong>{invite.email}</strong>
                            <small>
                              {preview
                                ? 'Preview invitation · cannot be accepted'
                                : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                            </small>
                          </div>
                          <span className="role-pill">{roleLabels[invite.role]}</span>
                          {owner ? (
                            <button
                              className="icon-button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => model.revokeInvitation(invite.id),
                                  'Invitation cancelled.',
                                )
                              }
                              aria-label={`Cancel invitation for ${invite.email}`}
                            >
                              <X size={18} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ) : null}
                  <div className="role-guide">
                    {(['viewer', 'operator', 'owner'] as const).map((role) => (
                      <div key={role}>
                        <ShieldCheck size={21} />
                        <h3>{roleLabels[role]}</h3>
                        <p>{roleDescriptions[role]}</p>
                      </div>
                    ))}
                  </div>
                  {!owner ? (
                    <p className="permission-note">
                      <Info size={14} />
                      Only the household owner can change access or invite family.
                    </p>
                  ) : null}
                </>
              ) : null}

              {page === 'probes' ? (
                <ProbesPage reading={home.reading} now={now} preview={preview} />
              ) : null}
              {page === 'calibration' && home ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">SET UP YOUR PROBES</p>
                      <h1>Calibration.</h1>
                      <p>Capture dry and wet readings with your cloud-connected board.</p>
                    </div>
                  </div>
                  <p className="inline-note">
                    Calibration capture uses Cloud. Bluetooth capture is not supported; reconnect
                    the board to Wi-Fi to begin.
                  </p>
                  <CalibrationPage
                    home={home}
                    now={now}
                    preview={preview}
                    capture={async (mode) => {
                      await model.request('/api/calibration', 'POST', { mode, prepared: true });
                      await model.refresh();
                    }}
                  />
                </>
              ) : null}
              {page === 'settings' ? (
                <>
                  <section className="panel app-info">
                    <h2>Waterline 0.2.2</h2>
                    <p>Your household’s tank, connected through Cloud or nearby Bluetooth.</p>
                  </section>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">MAKE IT YOURS</p>
                      <h1>A home that suits you.</h1>
                      <p>Simple preferences, shared across your household.</p>
                    </div>
                  </div>
                  <form
                    key={`${preview}-${home.id}-${home.role}-${model.resetVersion}`}
                    onSubmit={settingsForm}
                    className="settings-form"
                  >
                    <section className="panel settings-panel">
                      <div className="settings-heading">
                        <h2>Your tank</h2>
                        <p>A familiar name makes it easier to keep track.</p>
                      </div>
                      <label htmlFor="tankName">Tank name</label>
                      <input
                        id="tankName"
                        name="tankName"
                        defaultValue={home.tankName}
                        maxLength={60}
                        required
                        disabled={!owner}
                      />
                    </section>
                    <section className="panel settings-panel">
                      <div className="settings-heading">
                        <h2>In-app alerts</h2>
                        <p>Choose the conditions your household sees in the app.</p>
                      </div>
                      {(
                        [
                          {
                            key: 'low',
                            label: 'Low water',
                            detail: 'Water falls below the 20% electrode.',
                          },
                          {
                            key: 'full',
                            label: 'Tank full',
                            detail:
                              'Water reaches the 100% electrode. Configure its buzzer in the Alarm tab.',
                          },
                          {
                            key: 'fault',
                            label: 'Sensor fault',
                            detail: 'Probe readings disagree or cannot be trusted.',
                          },
                          {
                            key: 'offline',
                            label: 'Device offline',
                            detail: 'The device stops reporting fresh readings.',
                          },
                        ] as const
                      ).map((item) => (
                        <label className="setting-row" key={item.key}>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </span>
                          <input
                            className="switch"
                            type="checkbox"
                            name={item.key}
                            defaultChecked={home.preferences[item.key]}
                            disabled={!owner}
                          />
                        </label>
                      ))}
                      <div className="inline-note">
                        <Bell size={17} />
                        <p>
                          These preferences apply to in-app alerts. Phone sound notifications follow
                          the board’s enabled buzzer alarms and are controlled in the Alarm tab.
                        </p>
                      </div>
                    </section>
                    <div className="settings-footer">
                      <span>
                        {preview
                          ? 'Changes stay in this preview session.'
                          : 'Preferences apply to your household.'}
                      </span>
                      <button className="button primary" disabled={!owner || busy} type="submit">
                        <Check size={16} />
                        {busy ? 'Saving…' : 'Save preferences'}
                      </button>
                    </div>
                  </form>
                  <section className="panel calibration-panel">
                    <div>
                      <h2>Probe calibration</h2>
                      <p>
                        Capture dry and wet readings once the electrodes are installed in the tank.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!owner}
                      onClick={() => navigate('calibration')}
                    >
                      Open calibration
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </>
              ) : null}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Droplet size={13} />
              Waterline · A little peace of mind
            </span>
            <span>{preview ? 'Preview workspace' : 'Private household workspace'}</span>
          </footer>
        </main>
      </div>

      {modal === 'profile' ? (
        <ProfileSheet close={() => setModal(null)}>
          <div className="sheet-account">
            <span className="avatar">
              {session.authenticated ? (
                (session.name || 'You')
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              ) : (
                <UserRound size={25} />
              )}
            </span>
            <div>
              <strong>{preview ? 'Preview household' : session.name || 'Your account'}</strong>
              <small>
                {session.email || (nearby.connected ? 'Paired Bluetooth access' : 'Not signed in')}
              </small>
              <small>
                {cloudHome ? roleLabels[cloudHome.role] : 'Nearby controls use board pairing'}
              </small>
            </div>
          </div>
          <nav className="sheet-menu" aria-label="Profile navigation">
            {profilePages.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setModal(null);
                  navigate(item.id);
                }}
              >
                <span className={`menu-icon menu-${item.id}`}>
                  <item.icon size={21} />
                </span>
                <span>{item.name}</span>
                <ArrowRight size={17} />
              </button>
            ))}
            <button onClick={() => setModal('diagnostics')}>
              <span className="menu-icon">
                <CircleHelp size={21} />
              </span>
              <span>Device & connection</span>
              <ArrowRight size={17} />
            </button>
            <button
              onClick={() => {
                setModal(null);
                if (session.authenticated && !preview) void run(signOut);
                else {
                  signIn();
                }
              }}
            >
              <span className="menu-icon">
                {session.authenticated && !preview ? <LogOut size={21} /> : <LogIn size={21} />}
              </span>
              <span>{session.authenticated && !preview ? 'Sign out' : 'Sign in'}</span>
              <ArrowRight size={17} />
            </button>
          </nav>
        </ProfileSheet>
      ) : null}
      {toast ? (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <TriangleAlert size={18} /> : <CheckCheck size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {modal === 'signin' ? (
        <Dialog title="Your household, securely connected." close={() => setModal(null)}>
          <div className="dialog-symbol">
            <ShieldCheck size={32} />
          </div>
          <p>
            Sign-in will be available once Auth0 is configured. Every family member will have their
            own account.
          </p>
          <p className="inline-note">Use the installed Android app to access your household.</p>
          <button
            className="button primary full-width"
            onClick={() => {
              setModal(null);
            }}
          >
            Close
            <ArrowRight size={16} />
          </button>
        </Dialog>
      ) : null}
      {modal === 'alerts' ? (
        <Dialog title="Household alerts" close={() => setModal(null)}>
          {home?.reading?.levelAlarms ? (
            <LevelAlarms
              home={home}
              now={now}
              preview={preview}
              save={model.saveAlarms}
              acknowledge={model.acknowledgeLevels}
            />
          ) : null}
          {home?.alerts.length ? (
            home.alerts.map((alert) => (
              <div className="alert-item" key={alert.id}>
                <span className="event-icon warning">
                  <TriangleAlert size={16} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                  <small>{age(alert.at)}</small>
                  {alert.acknowledged ? (
                    <span className="acknowledged">
                      <Check size={14} />
                      Acknowledged
                    </span>
                  ) : (
                    <button className="text-button" onClick={() => model.acknowledge(alert.id)}>
                      Acknowledge
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-alerts">
              <CheckCheck size={36} />
              <h3>Nothing needs your attention.</h3>
              <p>
                {home
                  ? 'New alerts will appear here.'
                  : 'Your alerts will appear once your household is connected.'}
              </p>
            </div>
          )}
          <p className="dialog-footnote">
            Water-level acknowledgements silence those probe alarms after the board confirms.
          </p>
        </Dialog>
      ) : null}
      {modal === 'invite' ? (
        <Dialog
          title={inviteCreated ? 'Invitation prepared' : 'A place for your family.'}
          close={() => setModal(null)}
        >
          {inviteCreated ? (
            <>
              <div className="dialog-symbol">
                <Users size={30} />
              </div>
              <p>
                {preview
                  ? 'This is a preview invitation. No email was sent, and it cannot be used to join a household.'
                  : 'Share this invitation link with the person you invited. They must sign in with that verified email address.'}
              </p>
              {invitationUrl ? (
                <>
                  <label htmlFor="invitation-link">Private invitation link</label>
                  <input id="invitation-link" value={invitationUrl} readOnly />
                  <button
                    className="button primary full-width"
                    onClick={() =>
                      void run(
                        () => navigator.clipboard.writeText(invitationUrl),
                        'Invitation link copied.',
                      )
                    }
                  >
                    <Copy size={16} />
                    Copy invitation link
                  </button>
                </>
              ) : null}
              <button className="button secondary full-width" onClick={() => setModal(null)}>
                Done
              </button>
            </>
          ) : (
            <form onSubmit={inviteForm}>
              <p>Invite someone to your household. They’ll get only the access you choose.</p>
              <label htmlFor="invite-email">Email address</label>
              <input
                type="email"
                id="invite-email"
                name="email"
                placeholder="name@example.com"
                maxLength={254}
                required
                autoFocus
              />
              <label htmlFor="invite-role">Household access</label>
              <ThemedSelect
                label="Household access"
                id="invite-role"
                name="role"
                defaultValue="viewer"
              >
                <option value="viewer">Viewer — readings and alerts</option>
                <option value="operator">Operator — readings and device controls</option>
              </ThemedSelect>
              <p className="dialog-footnote">
                {preview
                  ? 'Preview only. No invitation email will be sent.'
                  : 'You’ll get a private link to share. It expires in seven days.'}
              </p>
              <button className="button primary full-width" disabled={busy} type="submit">
                {busy ? 'Preparing…' : 'Create invitation'}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Dialog>
      ) : null}
      {modal === 'remove' && selectedMember ? (
        <Dialog title={`Remove ${selectedMember.name}?`} close={() => setModal(null)}>
          <p>They will lose access to this household’s readings and controls.</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Keep access
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await model.changeMember(selectedMember.id, null);
                  setModal(null);
                }, 'Household access removed.')
              }
            >
              Remove access
            </button>
          </div>
        </Dialog>
      ) : null}
      {modal === 'diagnostics' ? (
        <Dialog title="Device & connection" close={() => setModal(null)}>
          <div className="diagnostic-status">
            <span className={`status-pill ${condition === 'healthy' ? 'good' : 'warn'}`}>
              {conditionLabel}
            </span>
            {preview ? <span className="subtle-label">Simulated device</span> : null}
          </div>
          <dl className="diagnostic-list">
            <div>
              <dt>Tank</dt>
              <dd>{home?.tankName ?? 'Not set up'}</dd>
            </div>
            <div>
              <dt>Last measurement</dt>
              <dd>{age(reading?.measuredAt ?? null)}</dd>
            </div>
            <div>
              <dt>Last device contact</dt>
              <dd>{age(reading?.lastSeen ?? null)}</dd>
            </div>
            <div>
              <dt>Calibration</dt>
              <dd>
                {reading?.calibrated
                  ? preview
                    ? 'Sample calibration ready'
                    : 'Calibration ready'
                  : 'Not confirmed'}
              </dd>
            </div>
            <div>
              <dt>Motor feedback</dt>
              <dd>Not connected</dd>
            </div>
          </dl>
          {reading?.probes.length ? (
            <table className="probe-table">
              <caption>Probe diagnostics{preview ? ' · sample values' : ''}</caption>
              <thead>
                <tr>
                  <th>Probe</th>
                  <th>GPIO</th>
                  <th>Median</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {reading.probes.map((probe) => (
                  <tr key={probe.level}>
                    <td>{probe.level}%</td>
                    <td>{probe.gpio}</td>
                    <td>{probe.median}</td>
                    <td>{probe.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="inline-note">
            {preview
              ? 'These values are sample data. The app is not reading your physical ESP32.'
              : 'Use Cloud for remote readings or Bluetooth for nearby access. Board Wi-Fi and pairing recovery use its local setup page.'}
          </p>
        </Dialog>
      ) : null}
      {modal === 'calibration' ? (
        <Dialog title="Calibrate the installed tank." close={() => setModal(null)}>
          <p>Final calibration uses the actual tank, cable and electrode positions.</p>
          <ol className="calibration-steps">
            <li>
              <strong>Capture dry</strong>
              <p>
                Keep the sensing electrodes clean, dry and separated. Capture their dry readings.
              </p>
            </li>
            <li>
              <strong>Capture wet</strong>
              <p>
                Immerse all four level electrodes and the common electrode in the same water,
                without touching each other.
              </p>
            </li>
            <li>
              <strong>Check separation</strong>
              <p>Confirm stable dry/wet separation, then test each level transition in the tank.</p>
            </li>
          </ol>
          <p className="inline-note">
            Open Calibration from your profile to capture readings. Each 20-cycle capture takes
            about 100 seconds after delivery.
          </p>
          <button className="button secondary full-width" onClick={() => setModal(null)}>
            Got it
          </button>
        </Dialog>
      ) : null}
    </div>
  );
}

