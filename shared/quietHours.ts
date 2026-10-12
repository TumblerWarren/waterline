export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}
export const defaultQuietHours = (): QuietHours => ({
  enabled: false,
  start: '22:00',
  end: '07:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
export function validQuietHours(value: unknown): value is QuietHours {
  if (!value || typeof value !== 'object') return false;
  const v = value as QuietHours;
  if (
    typeof v.enabled !== 'boolean' ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.end) ||
    v.start === v.end ||
    typeof v.timezone !== 'string'
  )
    return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: v.timezone });
    return true;
  } catch {
    return false;
  }
}
function parts(now: number, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: +values.year,
    month: +values.month,
    day: +values.day,
    hour: +values.hour,
    minute: +values.minute,
    second: +values.second,
  };
}
function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function isQuietHours(q: QuietHours, now = Date.now()) {
  if (!q.enabled) return false;
  const p = parts(now, q.timezone),
    current = p.hour * 60 + p.minute,
    start = minutes(q.start),
    end = minutes(q.end);
  return start < end ? current >= start && current < end : current >= start || current < end;
}
export function nextQuietEnd(q: QuietHours, now = Date.now()) {
  const p = parts(now, q.timezone),
    end = minutes(q.end);
  const wall = Date.UTC(
    p.year,
    p.month - 1,
    p.day + (p.hour * 60 + p.minute >= end ? 1 : 0),
    Math.floor(end / 60),
    end % 60,
  );
  let candidate = wall;
  for (let n = 0; n < 4; n++) {
    const x = parts(candidate, q.timezone);
    const offset =
      Date.UTC(x.year, x.month - 1, x.day, x.hour, x.minute, x.second) -
      Math.floor(candidate / 1000) * 1000;
    const next = wall - offset;
    if (next === candidate) break;
    candidate = next;
  }
  const target=new Date(wall),actual=parts(candidate,q.timezone);
  const onTargetDate=(x:ReturnType<typeof parts>)=>x.year===target.getUTCFullYear() && x.month===target.getUTCMonth()+1 && x.day===target.getUTCDate();
  if(onTargetDate(actual) && actual.hour*60+actual.minute===end && candidate>now)return candidate;
  // Resolve skipped clock times to the first valid minute after the requested end.
  for(let at=candidate-3*3600000;at<=candidate+3*3600000;at+=60000) {
    const x=parts(at,q.timezone);
    if(at>now && onTargetDate(x) && x.hour*60+x.minute>=end)return at;
  }
  return candidate+86400000;
}
