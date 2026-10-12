import { describe, it, expect } from 'vitest';
import { isQuietHours, nextQuietEnd, validQuietHours } from '../shared/quietHours';
const q = { enabled: true, start: '22:00', end: '07:00', timezone: 'Asia/Kolkata' };
describe('phone quiet hours', () => {
  it('includes start, excludes end, and supports midnight', () => {
    expect(isQuietHours(q, Date.parse('2026-10-12T16:30:00Z'))).toBe(true);
    expect(isQuietHours(q, Date.parse('2026-10-12T20:00:00Z'))).toBe(true);
    expect(isQuietHours(q, Date.parse('2026-10-13T01:30:00Z'))).toBe(false);
    expect(isQuietHours({ ...q, enabled: false }, Date.parse('2026-10-12T20:00:00Z'))).toBe(false);
  });
  it('calculates the next daily end in the phone timezone', () => {
    expect(nextQuietEnd(q, Date.parse('2026-10-12T20:00:00Z'))).toBe(
      Date.parse('2026-10-13T01:30:00Z'),
    );
    expect(nextQuietEnd(q, Date.parse('2026-10-13T01:30:00Z'))).toBe(
      Date.parse('2026-10-14T01:30:00Z'),
    );
  });
  it('supports daytime windows', () => {
    const daytime = { ...q, start: '10:00', end: '11:00', timezone: 'UTC' };
    expect(isQuietHours(daytime, Date.parse('2026-10-12T10:30:00Z'))).toBe(true);
    expect(isQuietHours(daytime, Date.parse('2026-10-12T11:00:00Z'))).toBe(false);
  });
  it('accounts for DST when ending an overnight window', () => {
    const dst = { ...q, timezone: 'America/New_York' };
    expect(nextQuietEnd(dst, Date.parse('2026-03-08T04:00:00Z'))).toBe(
      Date.parse('2026-03-08T11:00:00Z'),
    );
  });
  it('ends at the first valid minute when daylight saving skips the end time',()=>{
    expect(nextQuietEnd({...q,end:'02:30',timezone:'America/New_York'},Date.parse('2026-03-08T04:00:00Z'))).toBe(Date.parse('2026-03-08T07:00:00Z'));
  });
  it('rejects equal times, bad times and unknown zones', () => {
    expect(validQuietHours(q)).toBe(true);
    for (const change of [{ end: '22:00' }, { start: '24:00' }, { timezone: 'bad-zone' }])
      expect(validQuietHours({ ...q, ...change })).toBe(false);
  });
});
