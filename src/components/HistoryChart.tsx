import { bandLabels, type HistoryPoint } from '../../shared/model';
export function HistoryChart({
  points,
  compact = false,
}: {
  points: HistoryPoint[];
  compact?: boolean;
}) {
  const values = {
    low: 0,
    middle: 1,
    high: 2,
    'upper-middle': 2,
    'near-full': 3,
    full: 4,
    unknown: -1,
    offline: -1,
  };
  const width = 760,
    height = compact ? 155 : 245;
  const x = (i: number) => 70 + (i * (width - 95)) / Math.max(points.length - 1, 1);
  const y = (value: number) => height - 35 - (value * (height - 70)) / 4;
  const segments: string[] = [];
  let path = '';
  points.forEach((point, i) => {
    const value = values[point.band];
    if (value < 0) {
      if (path) segments.push(path);
      path = '';
      return;
    }
    path += path ? `H${x(i)}V${y(value)}` : `M${x(i)} ${y(value)}`;
  });
  if (path) segments.push(path);
  if (!points.length)
    return (
      <div className="chart-empty">Your level history will appear after a device is connected.</div>
    );
  return (
    <div className="history-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stepped tank-level history. Unknown readings and offline periods appear as gaps."
      >
        {(['low', 'middle', 'upper-middle', 'near-full', 'full'] as const).map((band, i) => (
          <g key={band}>
            <line x1="70" x2="740" y1={y(i)} y2={y(i)} stroke="#e6ece7" strokeDasharray="3 5" />
            <text x="55" y={y(i) + 4} textAnchor="end" fill="#7b8980" fontSize="11">
              {bandLabels[band]}
            </text>
          </g>
        ))}
        {segments.map((segment, i) => (
          <path
            key={i}
            d={segment}
            fill="none"
            stroke="#2a8e79"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {points
          .filter(
            (_, i) => i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1,
          )
          .map((point) => (
            <text
              key={point.at}
              x={x(points.indexOf(point))}
              y={height - 7}
              textAnchor="middle"
              fill="#7b8980"
              fontSize="11"
            >
              {new Date(point.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
          ))}
      </svg>
    </div>
  );
}
