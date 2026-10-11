import type { HistoryPoint } from './model';
export const historyValues = {
  low: 0,
  middle: 1,
  high: 2,
  'upper-middle': 2,
  'near-full': 3,
  full: 4,
  unknown: -1,
  offline: -1,
};
export const historyColors = ['#d97706', '#0891b2', '#2563eb', '#7c3aed', '#0f766e'];
export function historyLayout(input: HistoryPoint[], width = 760) {
  const points = input
    .filter((p) => Number.isFinite(p.at))
    .slice()
    .sort((a, b) => a.at - b.at);
  const first = points[0]?.at ?? 0,
    last = points.at(-1)?.at ?? first;
  const x = (at: number) =>
    last === first ? (width + 40) / 2 : 70 + ((at - first) / (last - first)) * (width - 100);
  const segments: { from: HistoryPoint; to: HistoryPoint; value: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1],
      to = points[i];
    if (historyValues[from.band] >= 0 && historyValues[to.band] >= 0)
      segments.push({ from, to, value: historyValues[from.band] });
  }
  return { points, first, last, x, segments };
}
