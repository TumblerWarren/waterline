import { useCallback, useEffect, useState } from 'react';
import { useSession } from './auth';
import { isNative } from './native';
import { apiBase } from '../shared/mobile';
import { initialHousehold, scenarioReading, activity } from './demo';
import {
  canTestBuzzer,
  mayManage,
  mayOperate,
  type Household,
  type Scenario,
  type Role,
  type Preferences,
  type BuzzerAction,
  type AlarmRule,
  type LevelAlarm,
} from '../shared/model';

export function useHousehold(preview: boolean) {
  const session = useSession();
  const [demo, setDemo] = useState(initialHousehold);
  const [pendingInvitations, setPendingInvitations] = useState<
    Array<{ id: string; householdName: string; role: 'viewer' | 'operator'; expiresAt: number }>
  >([]);
  const [live, setLive] = useState<Household | null>(null);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [role, setRole] = useState<Role>('owner');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const request = useCallback(
    async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
      const origin = apiBase(import.meta.env.VITE_API_BASE_URL, isNative);
      const token = await session.token();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${origin}${path}`, {
          signal: controller.signal,
          method,
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await response.json()) as T & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to complete that action.');
        return data;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [session],
  );
  const refresh = useCallback(async () => {
    if (preview || !session.authenticated) return;
    setLoading(true);
    setError('');
    try {
      setLive(await request<Household>('/api/household'));
      setPendingInvitations([]);
    } catch (error) {
      setLive(null);
      try {
        setPendingInvitations(
          (await request<{ invitations: typeof pendingInvitations }>('/api/invitations/pending'))
            .invitations,
        );
      } catch {
        setPendingInvitations([]);
      }
      setError(error instanceof Error ? error.message : 'Unable to load your household.');
    } finally {
      setLoading(false);
    }
  }, [preview, session.authenticated, request]);
  useEffect(() => {
    let active = true;
    if (preview || !session.authenticated) {
      setLive(null);
      setPendingInvitations([]);
      return;
    }
    setLoading(true);
    let fetching = false;
    const poll = () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      request<Household>('/api/household')
        .then((data) => {
          if (active) {
            setLive(data);
            setPendingInvitations([]);
            setError('');
          }
        })
        .catch(async (error) => {
          try {
            const data = await request<{ invitations: typeof pendingInvitations }>(
              '/api/invitations/pending',
            );
            if (active) setPendingInvitations(data.invitations);
          } catch {
            if (active) setPendingInvitations([]);
          }
          if (active) {
            setError(error instanceof Error ? error.message : 'Unable to load your household.');
          }
        })
        .finally(() => {
          fetching = false;
          if (active) setLoading(false);
        });
    };
    poll();
    const timer = window.setInterval(poll, 10000);
    const resume = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [preview, session.authenticated, request]);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(
      () =>
        setDemo((current) => {
          if (!current.reading) return current;
          const now = Date.now();
          return {
            ...current,
            reading: {
              ...current.reading,
              ...(scenario === 'offline' ? {} : { measuredAt: now, lastSeen: now }),
              buzzerTestingUntil:
                current.reading.buzzerTestingUntil && current.reading.buzzerTestingUntil > now
                  ? current.reading.buzzerTestingUntil
                  : null,
            },
          };
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [preview, scenario]);
  const household = preview ? { ...demo, role } : live;
  function requireOwner() {
    if (!household || !mayManage(household.role))
      throw new Error('Only the household owner can do that.');
  }
  function chooseScenario(value: Scenario) {
    if (!preview) return;
    setScenario(value);
    setDemo((current) => {
      const reading = scenarioReading(value);
      const alertTitle =
        value === 'low' && current.preferences.low
          ? 'Water is below 20%'
          : value === 'full' && current.preferences.full
            ? 'Tank is full'
            : value === 'fault' && current.preferences.fault
              ? 'Check the tank probes'
              : value === 'offline' && current.preferences.offline
                ? 'Device is offline'
                : value === 'uncalibrated'
                  ? 'Calibration is needed'
                  : '';
      return {
        ...current,
        reading,
        alerts: alertTitle
          ? [
              {
                id: crypto.randomUUID(),
                title: alertTitle,
                detail:
                  value === 'low'
                    ? 'The 20% electrode is dry. Local beeping follows the device alarm schedule.'
                    : value === 'full'
                      ? 'The 100% electrode is wet. The local buzzer stays silent.'
                      : value === 'offline'
                        ? 'The displayed level is the last known reading. Controls are unavailable.'
                        : reading.fault ||
                          'Complete dry and wet calibration before relying on this reading.',
                at: Date.now(),
                acknowledged: false,
              },
            ]
          : [],
        activities: [
          activity(
            'Preview scenario changed',
            `Showing ${value === 'normal' ? 'normal level' : value}.`,
          ),
          ...current.activities,
        ].slice(0, 30),
        history: [
          ...current.history,
          { at: Date.now(), band: value === 'offline' ? ('offline' as const) : reading.band },
        ].slice(-60),
      };
    });
  }
  async function buzzer(action: BuzzerAction) {
    if (!household || !mayOperate(household.role))
      throw new Error('Viewer access cannot operate controls.');
    if (!canTestBuzzer(household.role, household.reading, Date.now()))
      throw new Error('The device needs a fresh connection before it can receive this command.');
    if (!preview) {
      setLive(await request<Household>('/api/commands', 'POST', { action: `buzzer.${action}` }));
      return;
    }
    setDemo((current) => ({
      ...current,
      reading: current.reading
        ? {
            ...current.reading,
            buzzerEnabled: action === 'test' ? false : action === 'enable',
            buzzerTestingUntil: action === 'test' ? Date.now() + 10000 : null,
          }
        : null,
      activities: [
        activity(
          action === 'test'
            ? 'Buzzer test simulated'
            : `Local alarm ${action === 'enable' ? 'enabled' : 'disabled'} in preview`,
          action === 'test'
            ? 'A simulated ten-second test. Automatic alarms are now disabled until re-enabled.'
            : 'No command was sent to the ESP32.',
        ),
        ...current.activities,
      ].slice(0, 30),
    }));
  }
  async function saveSettings(tankName: string, preferences: Preferences) {
    requireOwner();
    if (!tankName.trim() || tankName.length > 60)
      throw new Error('Choose a tank name between 1 and 60 characters.');
    if (preview)
      setDemo((current) => ({
        ...current,
        tankName,
        preferences,
        activities: [
          activity('Preview settings saved', 'Changes apply to this preview session only.'),
          ...current.activities,
        ],
      }));
    else setLive(await request<Household>('/api/settings', 'PATCH', { tankName, preferences }));
  }
  async function invite(email: string, inviteRole: 'viewer' | 'operator'): Promise<string | null> {
    requireOwner();
    if (preview) {
      setDemo((current) => ({
        ...current,
        invitations: [
          ...current.invitations.filter((invite) => invite.email !== email),
          {
            id: crypto.randomUUID(),
            email,
            role: inviteRole,
            expiresAt: Date.now() + 7 * 86400000,
          },
        ],
        activities: [
          activity(
            'Preview invitation created',
            'This demonstration invitation cannot be used to join.',
          ),
          ...current.activities,
        ],
      }));
      return null;
    }
    const result = await request<{
      invitationUrl: string;
      mobileInvitationUrl: string;
      household: Household;
    }>('/api/invitations', 'POST', { email, role: inviteRole });
    setLive(result.household);
    return isNative ? result.mobileInvitationUrl : result.invitationUrl;
  }
  async function changeMember(id: string, memberRole: 'viewer' | 'operator' | null) {
    requireOwner();
    if (household?.members.find((member) => member.id === id)?.role === 'owner')
      throw new Error('Owner access cannot be changed here.');
    if (preview)
      setDemo((current) => ({
        ...current,
        members: memberRole
          ? current.members.map((member) =>
              member.id === id ? { ...member, role: memberRole } : member,
            )
          : current.members.filter((member) => member.id !== id),
        activities: [
          activity('Preview access updated', 'Family permissions changed for this session.'),
          ...current.activities,
        ],
      }));
    else
      setLive(
        await request<Household>(
          `/api/members/${encodeURIComponent(id)}`,
          memberRole ? 'PATCH' : 'DELETE',
          memberRole ? { role: memberRole } : undefined,
        ),
      );
  }
  async function revokeInvitation(id: string) {
    requireOwner();
    if (preview)
      setDemo((current) => ({
        ...current,
        invitations: current.invitations.filter((invite) => invite.id !== id),
      }));
    else setLive(await request<Household>(`/api/invitations/${encodeURIComponent(id)}`, 'DELETE'));
  }
  async function saveAlarms(rules: AlarmRule[]) {
    requireOwner();
    if (preview)
      setDemo((current) => ({
        ...current,
        alarmSettings: { revision: (current.alarmSettings?.revision ?? 0) + 1, rules },
      }));
    else setLive(await request<Household>('/api/alarms/settings', 'POST', { rules }));
  }
  async function acknowledgeLevels(alarms: LevelAlarm[]) {
    if (!household) throw new Error('Join your household before acknowledging alarms.');
    if (preview)
      setDemo((current) => ({
        ...current,
        reading: current.reading
          ? {
              ...current.reading,
              levelAlarms: current.reading.levelAlarms?.map((a) =>
                alarms.some((r) => r.episode === a.episode && r.level === a.level)
                  ? { ...a, acknowledged: true, active: false }
                  : a,
              ),
            }
          : null,
      }));
    else
      setLive(
        await request<Household>('/api/alarms/ack', 'POST', {
          alarms: alarms.map((a) => ({ level: a.level, episode: a.episode })),
        }),
      );
  }
  function acknowledge(id: string) {
    if (preview)
      setDemo((current) => ({
        ...current,
        alerts: current.alerts.map((alert) =>
          alert.id === id ? { ...alert, acknowledged: true } : alert,
        ),
      }));
  }
  function reset() {
    setResetVersion((value) => value + 1);
    setDemo(initialHousehold());
    setScenario('normal');
    setRole('owner');
  }
  return {
    household,
    pendingInvitations,
    scenario,
    role,
    setRole,
    chooseScenario,
    reset,
    resetVersion,
    buzzer,
    saveSettings,
    invite,
    changeMember,
    revokeInvitation,
    acknowledge,
    saveAlarms,
    acknowledgeLevels,
    error,
    loading,
    refresh,
    request,
  };
}
