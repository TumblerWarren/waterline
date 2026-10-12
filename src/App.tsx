import { t, useLanguage, currentLanguage } from './language';
import { MemberPress } from './components/MemberPress';
import { AccessDenied } from './components/AccessDenied';
import { SignInFeedback } from './components/SignInFeedback';
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
  | 'profile'
  | 'invite'
  | 'alerts'
  | 'diagnostics'
  | 'signin'
  | 'calibration'
  | 'remove'
  | 'leave'
  | null;
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
  if (!at) return t('No reading yet');
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  return seconds < 5
    ? t('Just now')
    : seconds < 60
      ? currentLanguage() === 'bn'
        ? `${seconds} সেকেন্ড আগে`
        : `${seconds}s ago`
      : seconds < 3600
        ? currentLanguage() === 'bn'
          ? `${Math.floor(seconds / 60)} মিনিট আগে`
          : `${Math.floor(seconds / 60)}m ago`
        : currentLanguage() === 'bn'
          ? `${Math.floor(seconds / 3600)} ঘণ্টা আগে`
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
  const { language, setLanguage } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
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
    if (sourceInFlight.current) throw new Error(t('Wait for the current board request to finish.'));
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
    home?.reading,
  );
  async function signOut() {
    if (sourceInFlight.current)
      throw new Error(t('Wait for the current board request before signing out.'));
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
    if (next === 'history' && cloudHome) void model.refreshHistory();
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
        text: error instanceof Error ? error.message : t('Something went wrong. Please try again.'),
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const [signInPending, setSignInPending] = useState(false);
  const [signInError, setSignInError] = useState<string>();
  function signIn() {
    if (signInPending) return;
    if (!session.configured) {
      setModal('signin');
      return;
    }
    setSignInError(undefined);
    setSignInPending(true);
    void session
      .login()
      .catch(() => {
        setSignInError(
          t('Check your connection and try signing in again. Your household data is safe.'),
        );
      })
      .finally(() => setSignInPending(false));
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
    healthy: t('Connected'),
    offline: t('Offline'),
    fault: t('Sensor fault'),
    uncalibrated: t('Needs calibration'),
    unpaired: t('No device connected'),
  }[condition];
  const meaningfulBand = uncertain ? t('Not confirmed') : t(bandLabels[band]);
  const greeting =
    condition === 'offline'
      ? t('A little out of touch.')
      : condition === 'fault'
        ? t('Let’s check the probes.')
        : condition === 'uncalibrated'
          ? t('A reading starts with calibration.')
          : band === 'low'
            ? t('Time for a refill.')
            : band === 'full'
              ? t('All topped up.')
              : t('Your water, at a glance.');
  const inviteForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await run(async () => {
      await model.invite(
        String(values.get('email')).trim().toLowerCase(),
        values.get('role') as 'viewer' | 'operator',
      );
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
      preview ? 'Settings saved for this preview session.' : t('Household settings saved.'),
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
        <SignInFeedback
          pending={signInPending}
          error={signInError}
          dismiss={() => setSignInError(undefined)}
        />
        <LandingPage
          native={isNative}
          loading={session.loading}
          error={signInError || session.error}
          signIn={signIn}
          nearby={() => {
            setSourcePreference('bluetooth');
            navigate('bluetooth');
          }}
        />
        {modal === 'signin' ? (
          <Dialog title={t('Sign in to Waterline')} close={() => setModal(null)}>
            <p>
              {t('Sign-in is not configured in this browser build. Use the installed Android app.')}
            </p>
            <button
              className="button primary"
              onClick={() => {
                setModal(null);
              }}
            >
              {t('Close')}
            </button>
          </Dialog>
        ) : null}
      </>
    );
  }
  return (
    <div className="app-shell">
      <SignInFeedback
        pending={signInPending}
        error={signInError}
        dismiss={() => setSignInError(undefined)}
      />
      <a className="skip-link" href="#main">
        {t('Skip to content')}
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
            <strong>{home?.name ?? t('Your household')}</strong>
            <small>Household dashboard</small>
          </div>
        </div>
        <p className="nav-label">{t('WORKSPACE')}</p>
        <nav aria-label="Main navigation">
          {mainPages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{t(item.name)}</span>
              {page === item.id ? <span className="nav-active-dot" /> : null}
            </button>
          ))}
        </nav>
        <button
          className="profile-trigger"
          aria-label={t('Open profile menu')}
          aria-haspopup="dialog"
          onClick={() => setModal('profile')}
        >
          {session.authenticated ? (
            (session.name || t('You'))
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
              {t('A little peace of mind.')}
              <br />
              <span>{t('One reading at a time.')}</span>
            </p>
          </div>
          <button className="help-button" onClick={() => setModal('diagnostics')}>
            <CircleHelp size={17} />
            {t('Device & connection')}
          </button>
          <div className="profile">
            <span className="avatar">
              {preview ? 'YO' : (session.name || t('You')).slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{preview ? 'Preview household' : session.name || t('Your account')}</strong>
              <small>
                {home
                  ? t(roleLabels[home.role])
                  : session.authenticated
                    ? t('Signed in')
                    : t('Not signed in')}
              </small>
            </div>
            <button
              className="icon-button"
              title={session.authenticated && !preview ? t('Sign out') : t('Sign in')}
              aria-label={session.authenticated && !preview ? t('Sign out') : t('Sign in')}
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
            <span>{home?.name ?? t('Your household')}</span>
            <span className="slash">/</span>
            <strong>{t(pages.find((item) => item.id === page)?.name ?? '')}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={15} />
              {t('Private household')}
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
            <section className="source-bar" aria-label={t('Reading connection')}>
              <div>
                <span
                  className={`source-dot ${freshSource(activeHome?.reading ?? null, source, now) ? 'fresh' : ''}`}
                />
                <strong>
                  {source === 'bluetooth' ? 'Nearby · Bluetooth' : t('Cloud connection')}
                </strong>
                <small>
                  {freshSource(activeHome?.reading ?? null, source, now)
                    ? t('Live readings')
                    : t('Waiting for fresh readings')}
                </small>
              </div>
              <label>
                <span className="sr-only">{t('Reading and control source')}</span>
                <ThemedSelect
                  label={t('Reading and control source')}
                  value={sourcePreference}
                  disabled={sourceBusy || busy || nearby.busy}
                  onValueChange={(value) => setSourcePreference(value as SourcePreference)}
                >
                  <option value="auto">{t('Auto')}</option>
                  <option value="cloud">{t('Cloud')}</option>
                  <option value="bluetooth">{t('Bluetooth')}</option>
                </ThemedSelect>
              </label>
              {source === 'bluetooth' && !nearby.connected ? (
                <button className="text-button" onClick={() => navigate('bluetooth')}>
                  {t('Connect')}
                  <ArrowRight size={15} />
                </button>
              ) : null}
            </section>
          ) : null}
          {invitationToken && !preview ? (
            <section className="join-panel">
              <Users size={28} />
              <h1>{t('You’re invited.')}</h1>
              <p>
                {t(
                  'Sign in with the email address the invitation was sent to, then join your household.',
                )}
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
                    }, t('Welcome to your household.'))
                  }
                >
                  {t('Join household')}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button className="button primary" onClick={signIn}>
                  {t('Sign in to join')}
                  <ArrowRight size={16} />
                </button>
              )}
            </section>
          ) : null}
          {!home ? (
            <section className="welcome-panel">
              {page === 'calibration' ? (
                <p className="inline-note">
                  {t(
                    'Calibration capture needs a signed-in Cloud connection. Bluetooth capture is not supported. Nearby live readings remain available in Overview.',
                  )}
                </p>
              ) : null}
              {page === 'history' && nearby.connected ? (
                <p className="inline-note">
                  {t(
                    'Cloud history is unavailable here. Your live Bluetooth readings remain available in Overview.',
                  )}
                </p>
              ) : null}
              <div className="welcome-art">
                <Droplet size={64} strokeWidth={1} fill="#b4e6cf" />
              </div>
              <p className="eyebrow">{t('A LITTLE PEACE OF MIND')}</p>
              <h1>
                Keep your home
                <br />
                {t('in balance.')}
              </h1>
              {source === 'bluetooth' ? (
                <button className="button primary" onClick={() => navigate('bluetooth')}>
                  {t('Connect nearby board')}
                  <Bluetooth size={18} />
                </button>
              ) : null}
              <p>
                {t(
                  'One place for your tank’s readings, alerts and the people you share your home with.',
                )}
              </p>
              {session.loading || model.loading ? (
                <p role="status">{t('Loading your household…')}</p>
              ) : session.authenticated ? (
                <>
                  <p>
                    Signed in as{' '}
                    <strong>{session.name || session.email || 'a household member'}</strong>.
                  </p>
                  {session.email ? <p>{session.email}</p> : null}
                  {session.emailVerified === false ? (
                    <p className="message warning">
                      {t('Verify your email before joining a household.')}
                    </p>
                  ) : null}
                  {model.pendingInvitations.map((invite) => (
                    <div className="panel email-join-card" key={invite.id}>
                      <h2>Join {invite.householdName}</h2>
                      <p>Your verified email has been added with {invite.role} access.</p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await model.request('/api/invitations/accept', 'POST', {
                              invitationId: invite.id,
                              name: session.name,
                            });
                            await model.refresh();
                          }, t('Welcome to your household.'))
                        }
                      >
                        {t('Join household')}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ))}
                  <p className="message warning">
                    {model.pendingInvitations.length
                      ? t('Choose your household above to finish joining.')
                      : model.error ||
                        t('Ask the owner to add your email address, then try again.')}
                  </p>
                  <button className="button secondary" onClick={() => void model.refresh()}>
                    {t('Try again')}
                    <RefreshCw size={15} />
                  </button>
                  <button className="text-button" onClick={() => void run(signOut)} disabled={busy}>
                    {t('Sign out')}
                  </button>
                </>
              ) : (
                <>
                  <button className="button primary" onClick={signIn}>
                    {t('Sign in to your household')}
                    <ArrowRight size={17} />
                  </button>
                  {session.error ? <p className="message warning">{t(session.error)}</p> : null}
                </>
              )}
            </section>
          ) : (
            <>
              {page === 'overview' ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">{t('HOME, IN BALANCE')}</p>
                      <h1>{greeting}</h1>
                      <p>{t('A clear view of your tank. Wherever you are.')}</p>
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
                          <span className="eyebrow">{t('YOUR TANK')}</span>
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
                            {condition === 'offline'
                              ? t('LAST KNOWN LEVEL')
                              : t('CONFIRMED LEVEL BAND')}
                          </p>
                          <div className={`level-display ${uncertain ? 'level-unknown' : ''}`}>
                            {meaningfulBand}
                          </div>
                          <p className="level-description">
                            {condition === 'offline'
                              ? t('Waiting for the device to reconnect.')
                              : condition === 'fault'
                                ? (reading?.fault ? t(reading.fault) : '') ||
                                  t('Waiting for a fresh, stable measurement.')
                                : condition === 'uncalibrated'
                                  ? t('Calibrate the installed probes to confirm the level.')
                                  : condition === 'unpaired'
                                    ? t('Your device has not been paired yet.')
                                    : band === 'full'
                                      ? t('Water has reached the full electrode.')
                                      : band === 'low'
                                        ? t('Water is below the lowest electrode.')
                                        : language === 'bn'
                                          ? `${(reading?.probes ?? []).map((p) => `${p.level}%`).join(', ')} ইলেকট্রোড দিয়ে পরিমাপ করা।`
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
                              <span>
                                {level}% {t('Probe')}
                              </span>
                              <strong>
                                {!probe || uncertain
                                  ? t('Unknown')
                                  : probe.state === 'wet'
                                    ? t('Wet')
                                    : t('Dry')}
                              </strong>
                            </div>
                          );
                        })}
                      </div>
                      <p className="tank-footnote">
                        <Info size={13} />
                        {condition === 'offline'
                          ? t('Probe states are historical until the device reconnects.')
                          : t('A level band, rather than an exact volume measurement.')}
                      </p>
                    </section>
                    <section className="panel overview-alarm-summary">
                      <div className="panel-heading">
                        <h2>{t('Water alarms')}</h2>
                        <Bell size={21} />
                      </div>
                      <strong>
                        {home.reading?.levelAlarms?.filter((a) => a.active).length ?? 0} active
                        alarms
                      </strong>
                      <p>
                        {home.reading?.buzzerEnabled
                          ? t('Automatic buzzer enabled')
                          : t('Automatic buzzer disabled')}
                      </p>
                      <div className="alarm-mini-levels">
                        {[20, 50, 80, 100].map((level) => (
                          <span className={`probe-level-${level}`} key={level}>
                            {level === 20 ? '<20%' : `${level}%`}
                          </span>
                        ))}
                      </div>
                      <LevelAlarms
                        home={home}
                        now={now}
                        preview={preview}
                        externalBusy={sourceBusy || busy || nearby.busy}
                        transport={source}
                        save={(rules) => sourceAction(() => saveAlarms(rules))}
                        acknowledge={(alarms) => sourceAction(() => acknowledgeLevels(alarms))}
                        compact
                      />
                      <button
                        className="button secondary full-width"
                        onClick={() => navigate('alarm')}
                      >
                        {t('Open alarms')}
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
                            ? t('Device disconnected')
                            : reading
                              ? source === 'bluetooth'
                                ? 'Nearby Bluetooth connection'
                                : t('Cloud connection')
                              : t('Device setup pending')}
                        </strong>
                        <small>
                          {preview
                            ? 'Simulated connection'
                            : reading
                              ? source === 'bluetooth'
                                ? t('Direct from your paired board')
                                : t('Readings received through your cloud backend')
                              : t('Waiting for the ESP32’s first upload')}
                        </small>
                      </div>
                    </div>
                    <div>
                      <small>{t('Last contact')}</small>
                      <strong>{age(reading?.lastSeen ?? null)}</strong>
                    </div>
                    <div>
                      <small>{t('Probe calibration')}</small>
                      <strong>
                        {reading
                          ? reading.calibrated
                            ? preview
                              ? 'Sample calibration ready'
                              : t('Calibration ready')
                            : t('Not calibrated')
                          : t('Awaiting device')}
                      </strong>
                    </div>
                    <button className="text-button" onClick={() => setModal('diagnostics')}>
                      {t('Details')}
                      <ArrowRight size={14} />
                    </button>
                  </section>
                  <div className="bottom-grid">
                    <section className="panel history-preview">
                      <div className="panel-heading">
                        <div>
                          <h2>{t('The past 24 hours')}</h2>
                          <p>{t('Confirmed bands, one step at a time.')}</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={t('View full history')}
                          onClick={() => navigate('history')}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                      <HistoryChart
                        points={(cloudHome?.history ?? []).filter(
                          (point) => point.at >= now - 86400000,
                        )}
                        compact
                      />
                    </section>
                    <section className="panel activity-panel">
                      <div className="panel-heading">
                        <h2>{t('Recent activity')}</h2>
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
                            <strong>{t(event.title)}</strong>
                            <small>{age(event.at)}</small>
                          </div>
                        </div>
                      ))}
                      {!home.activities.length ? (
                        <p className="empty-copy">
                          {t('Activity will appear as your household gets set up.')}
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
                      <p className="eyebrow">{t('STAY IN THE KNOW')}</p>
                      <h1>{t('Your water alarms.')}</h1>
                      <p>{t('Choose when to sound. Quiet them when you’re ready.')}</p>
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
                      <h2>{t('Local alarm')}</h2>
                      <span className="small-icon">
                        <Volume2 size={19} />
                      </span>
                    </div>
                    <div className="alarm-state">
                      <span className={`status-pill ${reading?.buzzerEnabled ? 'good' : 'muted'}`}>
                        {reading
                          ? reading.buzzerEnabled
                            ? t('Enabled')
                            : t('Disabled')
                          : t('Not connected')}
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
                      {t(
                        'All automatic alarms use the buzzer settings below. A test sounds for ten seconds and disables automatic alarms; re-enable them after testing.',
                      )}
                    </p>
                    {!preview && source === 'cloud' && home.buzzerCommand ? (
                      <p role="status">
                        {home.buzzerCommand.status === 'queued'
                          ? t('Request queued. Waiting for the board…')
                          : home.buzzerCommand.status === 'started'
                            ? t('Board accepted the request…')
                            : home.buzzerCommand.status === 'complete'
                              ? t('Board completed the request.')
                              : home.buzzerCommand.status === 'expired'
                                ? t('Request expired. Try again when the board is connected.')
                                : t('Board could not complete the request. Please retry.')}
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
                            : t('Test requested.'),
                        )
                      }
                    >
                      <Volume2 size={16} />
                      {buzzerTesting ? t('Test in progress') : t('Test buzzer · 10 seconds')}
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
                      {reading?.buzzerEnabled ? t('Disable local alarm') : t('Enable local alarm')}
                    </button>
                    {home.role === 'viewer' ? (
                      <small className="permission-note">
                        {t('Operator or Owner access is needed for controls.')}
                      </small>
                    ) : condition === 'offline' ? (
                      <small className="permission-note">
                        {t('Controls are unavailable while the device is offline.')}
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
                    <h2>{t('Phone alarm notifications')}</h2>
                    <p>
                      {t(
                        'New board alarms ring continuously on this phone. Silence or dismiss stops only the phone; acknowledge the board in the Alarm tab.',
                      )}
                    </p>
                    <button className="button secondary" disabled={!phoneNotifications.supported || !phoneNotifications.enabled} onClick={()=>void run(phoneNotifications.testPhone)}>{t('Test phone ringtone · 10 seconds')}</button>
                    {phoneNotifications.ringing ? <div className="message warning" role="status">
                      <p>{t('Phone alarm is active')}</p>
                      <button className="button secondary" onClick={()=>void run(phoneNotifications.silence)}>{t('Silence phone')}</button>
                      <button className="text-button" onClick={()=>void run(phoneNotifications.silence)}>{t('Dismiss phone alarm')}</button>
                    </div> : null}
                    {phoneNotifications.phoneError ? <p className="form-error" role="alert">{t(phoneNotifications.phoneError)}</p> : null}
                    <p role="status">
                      {phoneNotifications.supported
                        ? t(phoneNotifications.status)
                        : t('Available in the signed-in Android app.')}
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
                        ? t('Disable phone notifications')
                        : t('Enable phone notifications')}
                    </button>
                    <p>
                      {t(
                        'Phone ringing uses Android alarm volume and respects system restrictions. A board stop event ends ringing when delivered. Without internet, use Silence or Dismiss.',
                      )}
                    </p>
                  </section>

                  {source === 'cloud' && home.alerts.length ? (
                    <section className="panel cloud-alert-list">
                      <h2>{t('Household alerts')}</h2>
                      {home.alerts.map((a) => (
                        <article className="alert-item" key={a.id}>
                          <div>
                            <strong>{t(a.title)}</strong>
                            <p>{t(a.detail)}</p>
                            <small>
                              {age(a.at)} ·{' '}
                              {a.acknowledged ? t('Acknowledged') : t('Reported by the board')}
                            </small>
                          </div>
                        </article>
                      ))}
                    </section>
                  ) : null}
                  {source === 'bluetooth' ? (
                    <p className="inline-note">
                      {t(
                        'Bluetooth changes are saved directly on your paired board. Phone notifications still need a signed-in account and internet.',
                      )}
                    </p>
                  ) : null}
                </>
              ) : null}
              {page === 'bluetooth' ? <NearbyBoard /> : null}

              {page === 'history' ? (
                <>
                  <p className="inline-note">
                    {t(
                      'Cloud history · Bluetooth readings are live and are not added to this chart.',
                    )}
                  </p>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">{t('A LITTLE PERSPECTIVE')}</p>
                      <h1>{t('Your tank over time.')}</h1>
                      <p>{t('Level changes and the moments that matter.')}</p>
                    </div>
                    <div className="segmented" aria-label={t('History time range')}>
                      <button
                        className={range === '24h' ? 'selected' : ''}
                        onClick={() => setRange('24h')}
                      >
                        {t('24 hours')}
                      </button>
                      <button
                        className={range === '7d' ? 'selected' : ''}
                        onClick={() => setRange('7d')}
                      >
                        {t('7 days')}
                      </button>
                    </div>
                  </div>
                  <div className="history-refresh-controls">
                    <button
                      className="button secondary"
                      disabled={model.historyLoading || !cloudHome}
                      onClick={() => void model.refreshHistory()}
                    >
                      {model.historyLoading ? t('Fetching history…') : t('Refresh history')}
                    </button>
                    <p role="status">
                      {model.historyError
                        ? t(model.historyError)
                        : t(
                            'History refreshes on opening and every 15 minutes while the app is open.',
                          )}
                    </p>
                  </div>
                  <section className="panel full-history">
                    <div className="panel-heading">
                      <h2>{home.tankName}</h2>
                      <span className="subtle-label">
                        {range === '7d'
                          ? t('Available readings from the past 7 days')
                          : 'Past 24 hours'}
                        {preview ? ' · sample history' : ''}
                      </span>
                    </div>
                    <HistoryChart key={range} points={historyPoints} />
                    <p className="tank-footnote">
                      <Info size={14} />
                      {t(
                        'Offline and uncertain readings appear as gaps. This chart does not measure litres or consumption.',
                      )}
                    </p>
                  </section>
                  <section className="panel event-list">
                    <div className="panel-heading">
                      <h2>{t('Household activity')}</h2>
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
                          <strong>{t(event.title)}</strong>
                          <p>{t(event.detail)}</p>
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
                      <p className="empty-copy">{t('No activity yet.')}</p>
                    ) : null}
                  </section>
                </>
              ) : null}

              {page === 'household' ? (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">{t('BETTER, TOGETHER')}</p>
                      <h1>{t('Your people. Your home.')}</h1>
                      <p>{t('Everyone gets their own sign-in and the access they need.')}</p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!owner}
                      onClick={() => {
                        setInviteCreated(false);
                        setModal('invite');
                      }}
                    >
                      <Plus size={17} />
                      {t('Invite family')}
                    </button>
                  </div>
                  {home.role === 'viewer' ? (
                    <section className="panel access-section viewer-management-notice">
                      <AccessDenied
                        area="Household management"
                        owner={home.members.find((m) => m.role === 'owner')?.name}
                      />
                    </section>
                  ) : null}
                  <section className="panel members-panel access-section">
                    <div className="panel-heading">
                      <h2>{t('Household members')}</h2>
                      <span className="subtle-label">
                        {home.members.length} members{preview ? ' · sample people' : ''}
                      </span>
                    </div>
                    <div className="membership-help">
                      <p>
                        {owner
                          ? t('Long press a member to remove their access.')
                          : t('Long press your own membership to leave the household.')}
                      </p>
                      {!owner ? (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => setModal('leave')}
                        >
                          {t('Leave household')}
                        </button>
                      ) : null}
                    </div>
                    {home.members.map((member) => (
                      <MemberPress
                        key={member.id}
                        enabled={!busy && (owner ? member.role !== 'owner' : member.isYou)}
                        label={
                          member.isYou ? t('Leave household') : `${t('Remove')} ${member.name}`
                        }
                        onAction={() => {
                          if (!owner && member.isYou) setModal('leave');
                          else if (owner && member.role !== 'owner') {
                            setSelectedMember(member);
                            setModal('remove');
                          }
                        }}
                      >
                        <span className={`avatar ${member.isYou ? '' : 'soft'}`}>
                          {member.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="member-name">
                          <strong>
                            {member.name}
                            {member.isYou ? <span className="you-label">{t('You')}</span> : null}
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
                              <option value="viewer">{t('Viewer')}</option>
                              <option value="operator">{t('Operator')}</option>
                            </ThemedSelect>
                          </>
                        ) : (
                          <span className="role-pill">
                            <ShieldCheck size={13} />
                            {t(roleLabels[member.role])}
                          </span>
                        )}
                      </MemberPress>
                    ))}
                  </section>
                  {home.invitations.length ? (
                    <section className="panel invitations-panel">
                      <div className="panel-heading">
                        <h2>{t('Pending invitations')}</h2>
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
                                : `${t('Expires')} ${new Date(invite.expiresAt).toLocaleDateString(document.documentElement.lang === 'bn' ? 'bn-IN' : 'en-IN')}`}
                            </small>
                          </div>
                          <span className="role-pill">{t(roleLabels[invite.role])}</span>
                          {owner ? (
                            <button
                              className="icon-button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => model.revokeInvitation(invite.id),
                                  t('Invitation cancelled.'),
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
                        <h3>{t(roleLabels[role])}</h3>
                        <p>{t(roleDescriptions[role])}</p>
                      </div>
                    ))}
                  </div>
                  {!owner ? (
                    <p className="permission-note">
                      <Info size={14} />
                      {t('Only the household owner can change access or invite family.')}
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
                      <p className="eyebrow">{t('SET UP YOUR PROBES')}</p>
                      <h1>{t('Calibration.')}</h1>
                      <p>{t('Capture dry and wet readings with your cloud-connected board.')}</p>
                    </div>
                  </div>
                  <p className="inline-note">
                    {t(
                      'Calibration capture uses Cloud. Bluetooth capture is not supported; reconnect the board to Wi-Fi to begin.',
                    )}
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
                  <div className="settings-intro">
                    <section className="panel app-info">
                      <h2>Waterline 0.2.12</h2>
                      <p>
                        {t('Your household’s tank, connected through Cloud or nearby Bluetooth.')}
                      </p>
                    </section>
                    <section className="panel language-settings">
                      <h2>{t('Language')}</h2>
                      <ThemedSelect
                        id="language"
                        label={t('Language')}
                        value={language}
                        onValueChange={(value) => setLanguage(value as 'en' | 'bn')}
                      >
                        <option value="en">English</option>
                        <option value="bn">বাংলা</option>
                      </ThemedSelect>
                      <p>
                        {t(
                          t(
                            'Language applies to navigation and common controls. Device diagnostics retain their original wording.',
                          ),
                        )}
                      </p>
                    </section>
                  </div>
                  <div className="page-heading">
                    <div>
                      <p className="eyebrow">{t('MAKE IT YOURS')}</p>
                      <h1>{t('A home that suits you.')}</h1>
                      <p>{t('Simple preferences, shared across your household.')}</p>
                    </div>
                  </div>
                  <form
                    key={`${preview}-${home.id}-${home.role}-${model.resetVersion}`}
                    onSubmit={settingsForm}
                    className="settings-form"
                  >
                    <section className="panel settings-panel">
                      <div className="settings-heading">
                        <h2>{t('Your tank')}</h2>
                        <p>{t('A familiar name makes it easier to keep track.')}</p>
                      </div>
                      <label htmlFor="tankName">{t('Tank name')}</label>
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
                        <h2>{t('In-app alerts')}</h2>
                        <p>{t('Choose the conditions your household sees in the app.')}</p>
                      </div>
                      {(
                        [
                          {
                            key: 'low',
                            label: t('Low water'),
                            detail: t('Water falls below the 20% electrode.'),
                          },
                          {
                            key: 'full',
                            label: t('Tank full'),
                            detail: t(
                              'Water reaches the 100% electrode. Configure its buzzer in the Alarm tab.',
                            ),
                          },
                          {
                            key: 'fault',
                            label: t('Sensor fault'),
                            detail: t('Probe readings disagree or cannot be trusted.'),
                          },
                          {
                            key: 'offline',
                            label: t('Device offline'),
                            detail: t('The device stops reporting fresh readings.'),
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
                          {t(
                            'These preferences apply to in-app alerts. Phone sound notifications follow the board’s enabled buzzer alarms and are controlled in the Alarm tab.',
                          )}
                        </p>
                      </div>
                    </section>
                    <div className="settings-footer">
                      <span>
                        {preview
                          ? 'Changes stay in this preview session.'
                          : t('Preferences apply to your household.')}
                      </span>
                      <button className="button primary" disabled={!owner || busy} type="submit">
                        <Check size={16} />
                        {busy ? t('Saving…') : t('Save preferences')}
                      </button>
                    </div>
                  </form>
                  <section className="panel calibration-panel">
                    <div>
                      <h2>{t('Probe calibration')}</h2>
                      <p>
                        {t(
                          'Capture dry and wet readings once the electrodes are installed in the tank.',
                        )}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={!owner}
                      onClick={() => navigate('calibration')}
                    >
                      {t('Open calibration')}
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
              {t('Waterline · A little peace of mind')}
            </span>
            <span>{preview ? 'Preview workspace' : t('Private household workspace')}</span>
          </footer>
        </main>
      </div>

      {modal === 'profile' ? (
        <ProfileSheet close={() => setModal(null)}>
          <div className="sheet-account">
            <span className="avatar">
              {session.authenticated ? (
                (session.name || t('You'))
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
              <strong>{preview ? 'Preview household' : session.name || t('Your account')}</strong>
              <small>
                {session.email ||
                  (nearby.connected ? t('Paired Bluetooth access') : t('Not signed in'))}
              </small>
              <small>
                {cloudHome ? t(roleLabels[cloudHome.role]) : t('Nearby controls use board pairing')}
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
                <span>{t(item.name)}</span>
                <ArrowRight size={17} />
              </button>
            ))}
            <button onClick={() => setModal('diagnostics')}>
              <span className="menu-icon">
                <CircleHelp size={21} />
              </span>
              <span>{t('Device & connection')}</span>
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
              <span>{session.authenticated && !preview ? t('Sign out') : t('Sign in')}</span>
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
          <div className="feedback-copy">
            {toast.error ? <strong>{t('Could not complete the request')}</strong> : null}
            <span>{t(toast.text)}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label={t('Dismiss message')}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {modal === 'signin' ? (
        <Dialog title={t('Your household, securely connected.')} close={() => setModal(null)}>
          <div className="dialog-symbol">
            <ShieldCheck size={32} />
          </div>
          <p>
            {t(
              'Sign-in will be available once Auth0 is configured. Every family member will have their own account.',
            )}
          </p>
          <p className="inline-note">
            {t('Use the installed Android app to access your household.')}
          </p>
          <button
            className="button primary full-width"
            onClick={() => {
              setModal(null);
            }}
          >
            {t('Close')}
            <ArrowRight size={16} />
          </button>
        </Dialog>
      ) : null}
      {modal === 'alerts' ? (
        <Dialog title={t('Household alerts')} close={() => setModal(null)}>
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
                  <strong>{t(alert.title)}</strong>
                  <p>{t(alert.detail)}</p>
                  <small>{age(alert.at)}</small>
                  {alert.acknowledged ? (
                    <span className="acknowledged">
                      <Check size={14} />
                      {t('Acknowledged')}
                    </span>
                  ) : (
                    <button className="text-button" onClick={() => model.acknowledge(alert.id)}>
                      {t('Acknowledge')}
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-alerts">
              <CheckCheck size={36} />
              <h3>{t('Nothing needs your attention.')}</h3>
              <p>
                {home
                  ? t('New alerts will appear here.')
                  : t('Your alerts will appear once your household is connected.')}
              </p>
            </div>
          )}
          <p className="dialog-footnote">
            {t('Water-level acknowledgements silence those probe alarms after the board confirms.')}
          </p>
        </Dialog>
      ) : null}
      {modal === 'invite' ? (
        <Dialog
          title={inviteCreated ? t('Email added') : t('A place for your family.')}
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
                  : t(
                      'Email added. They can sign in with this verified email address and tap Join household. No link is needed.',
                    )}
              </p>

              <button className="button secondary full-width" onClick={() => setModal(null)}>
                {t('Done')}
              </button>
            </>
          ) : (
            <form onSubmit={inviteForm}>
              <p>
                {t('Invite someone to your household. They’ll get only the access you choose.')}
              </p>
              <label htmlFor="invite-email">{t('Email address')}</label>
              <input
                type="email"
                id="invite-email"
                name="email"
                placeholder="name@example.com"
                maxLength={254}
                required
                autoFocus
              />
              <label htmlFor="invite-role">{t('Household access')}</label>
              <ThemedSelect
                label={t('Household access')}
                id="invite-role"
                name="role"
                defaultValue="viewer"
              >
                <option value="viewer">{t('Viewer — readings and alerts')}</option>
                <option value="operator">{t('Operator — readings and device controls')}</option>
              </ThemedSelect>
              <p className="dialog-footnote">
                {preview
                  ? 'Preview only. No invitation email will be sent.'
                  : t(
                      'They can join after signing in with this verified email. Pending access expires in seven days.',
                    )}
              </p>
              <button className="button primary full-width" disabled={busy} type="submit">
                {busy ? t('Preparing…') : t('Add email')}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Dialog>
      ) : null}
      {modal === 'leave' && !owner ? (
        <Dialog title={t('Leave household?')} close={() => setModal(null)}>
          {owner ? (
            <p>{t('The household owner cannot leave while holding Owner access.')}</p>
          ) : (
            <>
              <p>
                {t(
                  t(
                    'You will lose access to this household’s readings, controls and phone notifications. You can join again if an owner adds your email.',
                  ),
                )}
              </p>
              <div className="dialog-actions">
                <button className="button secondary" onClick={() => setModal(null)}>
                  {t('Cancel')}
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await model.leaveHousehold();
                      await phoneNotifications.disable().catch(() => {});
                      setModal(null);
                      navigate('overview');
                    }, t('You left the household.'))
                  }
                >
                  {t('Leave household')}
                </button>
              </div>
            </>
          )}
        </Dialog>
      ) : null}
      {modal === 'remove' && selectedMember ? (
        <Dialog title={`${t('Remove')} ${selectedMember.name}?`} close={() => setModal(null)}>
          <p>{t('They will lose access to this household’s readings and controls.')}</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              {t('Keep access')}
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await model.changeMember(selectedMember.id, null);
                  setModal(null);
                }, t('Household access removed.'))
              }
            >
              {t('Remove access')}
            </button>
          </div>
        </Dialog>
      ) : null}
      {modal === 'diagnostics' ? (
        <Dialog title={t('Device & connection')} close={() => setModal(null)}>
          <div className="diagnostic-status">
            <span className={`status-pill ${condition === 'healthy' ? 'good' : 'warn'}`}>
              {conditionLabel}
            </span>
            {preview ? <span className="subtle-label">Simulated device</span> : null}
          </div>
          <dl className="diagnostic-list">
            <div>
              <dt>{t('Tank')}</dt>
              <dd>{home?.tankName ?? t('Not set up')}</dd>
            </div>
            <div>
              <dt>{t('Last measurement')}</dt>
              <dd>{age(reading?.measuredAt ?? null)}</dd>
            </div>
            <div>
              <dt>{t('Last device contact')}</dt>
              <dd>{age(reading?.lastSeen ?? null)}</dd>
            </div>
            <div>
              <dt>{t('Calibration')}</dt>
              <dd>
                {reading?.calibrated
                  ? preview
                    ? 'Sample calibration ready'
                    : t('Calibration ready')
                  : t('Not confirmed')}
              </dd>
            </div>
            <div>
              <dt>{t('Motor feedback')}</dt>
              <dd>{t('Not connected')}</dd>
            </div>
          </dl>
          {reading?.probes.length ? (
            <table className="probe-table">
              <caption>Probe diagnostics{preview ? ' · sample values' : ''}</caption>
              <thead>
                <tr>
                  <th>{t('Probe')}</th>
                  <th>GPIO</th>
                  <th>{t('Median')}</th>
                  <th>{t('State')}</th>
                </tr>
              </thead>
              <tbody>
                {reading.probes.map((probe) => (
                  <tr key={probe.level}>
                    <td>{probe.level}%</td>
                    <td>{probe.gpio}</td>
                    <td>{probe.median}</td>
                    <td>{t(probe.state)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="inline-note">
            {preview
              ? 'These values are sample data. The app is not reading your physical ESP32.'
              : t(
                  'Use Cloud for remote readings or Bluetooth for nearby access. Board Wi-Fi and pairing recovery use its local setup page.',
                )}
          </p>
        </Dialog>
      ) : null}
      {modal === 'calibration' ? (
        <Dialog title={t('Calibrate the installed tank.')} close={() => setModal(null)}>
          <p>{t('Final calibration uses the actual tank, cable and electrode positions.')}</p>
          <ol className="calibration-steps">
            <li>
              <strong>{t('Capture dry')}</strong>
              <p>
                {t(
                  'Keep the sensing electrodes clean, dry and separated. Capture their dry readings.',
                )}
              </p>
            </li>
            <li>
              <strong>{t('Capture wet')}</strong>
              <p>
                {t(
                  'Immerse all four level electrodes and the common electrode in the same water, without touching each other.',
                )}
              </p>
            </li>
            <li>
              <strong>{t('Check separation')}</strong>
              <p>
                {t(
                  'Confirm stable dry/wet separation, then test each level transition in the tank.',
                )}
              </p>
            </li>
          </ol>
          <p className="inline-note">
            {t(
              'Open Calibration from your profile to capture readings. Each 20-cycle capture takes about 100 seconds after delivery.',
            )}
          </p>
          <button className="button secondary full-width" onClick={() => setModal(null)}>
            {t('Got it')}
          </button>
        </Dialog>
      ) : null}
    </div>
  );
}
