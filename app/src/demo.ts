import type { Household, Reading, Scenario, Band } from '../shared/model';
export const scenarios: { id: Scenario; label: string }[] = [
  { id: 'normal', label: 'Normal level' },
  { id: 'low', label: 'Low water' },
  { id: 'full', label: 'Tank full' },
  { id: 'fault', label: 'Sensor fault' },
  { id: 'offline', label: 'Device offline' },
  { id: 'uncalibrated', label: 'Not calibrated' },
];
export function scenarioReading(scenario: Scenario, now = Date.now()): Reading {
  const band: Band =
    scenario === 'low'
      ? 'low'
      : scenario === 'full'
        ? 'full'
        : scenario === 'fault' || scenario === 'uncalibrated'
          ? 'unknown'
          : 'upper-middle';
  const wetLevels =
    scenario === 'low'
      ? []
      : scenario === 'full'
        ? [20, 50, 80, 100]
        : scenario === 'fault'
          ? [100]
          : [20, 50];
  return {
    band,
    connected: scenario !== 'offline',
    fault: scenario === 'fault' ? 'Upper probe is wet while lower probes are dry.' : null,
    calibrated: scenario !== 'uncalibrated',
    measuredAt: scenario === 'offline' ? now - 180000 : now,
    lastSeen: scenario === 'offline' ? now - 180000 : now,
    buzzerEnabled: true,
    buzzerTestingUntil: null,
    probes: ([20, 50, 80, 100] as const).map((level, i) => ({
      level,
      gpio: [36, 34, 33, 32][i],
      state: scenario === 'uncalibrated' ? 'unknown' : wetLevels.includes(level) ? 'wet' : 'dry',
      median: wetLevels.includes(level) ? [2704, 2674, 2680, 2700][i] : [12, 19, 23, 20][i],
      calibrated: scenario !== 'uncalibrated',
    })),
  };
}
export function initialHousehold(now = Date.now()): Household {
  const bands: Band[] = [
    'full',
    'full',
    'full',
    'high',
    'high',
    'high',
    'middle',
    'middle',
    'middle',
    'low',
    'low',
    'middle',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
    'high',
  ];
  return {
    id: 'preview-home',
    name: 'Our home',
    tankName: 'Rooftop tank',
    role: 'owner',
    reading: scenarioReading('normal', now),
    members: [
      { id: 'you', name: 'You', email: 'owner@example.com', role: 'owner', isYou: true },
      {
        id: 'family',
        name: 'Family member',
        email: 'family@example.com',
        role: 'viewer',
        isYou: false,
      },
    ],
    invitations: [],
    preferences: { low: true, full: false, fault: true, offline: true },
    alerts: [],
    history: bands.map((band, i) => ({ band, at: now - (24 - i) * 3600000 })),
    activities: [
      {
        id: 'level',
        at: now - 600000,
        title: 'Water reached the 50% probe',
        detail: 'Level confirmed between 50% and full.',
        tone: 'success',
      },
      {
        id: 'alarm',
        at: now - 5 * 3600000,
        title: 'Low-water alert resolved',
        detail: 'The 20% probe was confirmed wet. Local beeping stopped.',
        tone: 'neutral',
      },
      {
        id: 'online',
        at: now - 8 * 3600000,
        title: 'Device connected',
        detail: 'Readings resumed over home Wi-Fi.',
        tone: 'neutral',
      },
    ],
  };
}
export function activity(
  title: string,
  detail: string,
  tone: 'neutral' | 'success' | 'warning' = 'neutral',
) {
  return { id: crypto.randomUUID(), at: Date.now(), title, detail, tone };
}
