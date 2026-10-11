import { describe, expect, it } from 'vitest';
import { freshSource, selectSource } from '../shared/source';
import { historyLayout } from '../shared/history';
import { initialHousehold } from '../src/demo';

describe('reading source selection', () => {
  const now = Date.now();
  const fresh = {
    ...initialHousehold().reading!,
    connected: true,
    measuredAt: now - 1000,
    lastSeen: now - 1000,
  };
  it('prefers fresh cloud and falls back to fresh nearby data', () => {
    expect(selectSource('auto', fresh, fresh, now)).toBe('cloud');
    expect(selectSource('auto', { ...fresh, lastSeen: now - 31000 }, fresh, now)).toBe('bluetooth');
    expect(selectSource('auto', null, fresh, now)).toBe('bluetooth');
  });
  it('does not silently change an explicitly chosen source', () => {
    expect(selectSource('bluetooth', fresh, null, now)).toBe('bluetooth');
    expect(selectSource('cloud', null, fresh, now)).toBe('cloud');
  });
  it('rejects stale measurements even when device contact is recent', () => {
    expect(freshSource({ ...fresh, measuredAt: now - 16000 }, 'bluetooth', now)).toBe(false);
    expect(freshSource({ ...fresh, measuredAt: now - 16000 }, 'cloud', now)).toBe(true);
    expect(freshSource({ ...fresh, measuredAt: now - 31000 }, 'cloud', now)).toBe(false);
    expect(freshSource({ ...fresh, connected: false }, 'bluetooth', now)).toBe(false);
    expect(freshSource(null, 'cloud', now)).toBe(false);
  });
});
describe('timestamp-based stepped history', () => {
  it('positions irregular samples by time rather than sample number', () => {
    const chart = historyLayout([
      { at: 100, band: 'middle' },
      { at: 110, band: 'upper-middle' },
      { at: 200, band: 'near-full' },
    ]);
    expect(chart.x(110) - chart.x(100)).toBeCloseTo(66);
    expect(chart.x(200) - chart.x(110)).toBeCloseTo(594);
  });
  it('does not join known readings across uncertain or offline intervals', () => {
    const chart = historyLayout([
      { at: 1, band: 'low' },
      { at: 2, band: 'offline' },
      { at: 3, band: 'middle' },
      { at: 4, band: 'unknown' },
      { at: 5, band: 'full' },
    ]);
    expect(chart.segments).toHaveLength(0);
  });
  it('sorts without mutating input and handles isolated or empty samples', () => {
    const input = [
      { at: 200, band: 'full' as const },
      { at: 100, band: 'low' as const },
    ];
    expect(historyLayout(input).points[0].at).toBe(100);
    expect(input[0].at).toBe(200);
    expect(historyLayout([input[0]]).x(200)).toBe(400);
    expect(historyLayout([]).segments).toHaveLength(0);
  });
});
