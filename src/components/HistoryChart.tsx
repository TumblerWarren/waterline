import { t, useLanguage } from '../language';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { bandLabels, type HistoryPoint } from '../../shared/model';
import { historyColors, historyLayout, historyValues } from '../../shared/history';
export const HistoryChart = memo(function HistoryChart({
  points: input,
  compact = false,
}: {
  points: HistoryPoint[];
  compact?: boolean;
}) {
  const { language } = useLanguage();
  const chartRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setWidth] = useState(360);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const span =
    input.length > 1
      ? Math.max(...input.map((p) => p.at)) - Math.min(...input.map((p) => p.at))
      : 0;
  const width = compact
    ? viewportWidth - 85
    : Math.max(viewportWidth - 85, span > 86400000 ? 1600 : 900);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [width, Boolean(input.length)]);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(Math.max(260, Math.min(760, measured)));
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [Boolean(input.length)]);
  const {
    points,
    first,
    last,
    x: layoutX,
    segments,
  } = useMemo(() => historyLayout(input, width + 50), [input, width]);
  const x = (at: number) => layoutX(at) - 50;
  const legacy = points.some((p) => p.band === 'high');
  const [selectedAt, setSelectedAt] = useState<number | null>(null);
  const found =
    selectedAt === null ? points.length - 1 : points.findIndex((p) => p.at >= selectedAt);
  const index = found < 0 ? points.length - 1 : found;
  const selected = points[index];
  const height = compact ? 175 : 260;
  const y = (value: number) => height - 35 - (value * (height - 70)) / 4;
  const label = (p: HistoryPoint) => (p.band === 'offline' ? t('Offline') : t(bandLabels[p.band]));
  if (!points.length)
    return (
      <div ref={chartRef} className="chart-empty">
        {t('Your level history will appear after a device is connected.')}
      </div>
    );
  return (
    <div ref={chartRef} className="history-chart">
      {!compact ? (
        <p className="chart-swipe-hint">{t('Swipe left or right to explore earlier readings.')}</p>
      ) : null}
      <div className="history-plot-shell">
        <svg
          className="history-fixed-axis"
          width="85"
          height={height}
          viewBox={`0 0 85 ${height}`}
          aria-hidden="true"
        >
          {(['low', 'middle', 'upper-middle', 'near-full', 'full'] as const).map((band, i) => (
            <text key={band} x="80" y={y(i) + 4} textAnchor="end" fill="#526985" fontSize="12">
              {band === 'upper-middle' && legacy ? '50%+' : t(bandLabels[band])}
            </text>
          ))}
        </svg>
        <div
          ref={scrollRef}
          className="history-plot-viewport"
          tabIndex={compact ? -1 : 0}
          role="region"
          aria-label="Scrollable level history"
        >
          <svg
            style={{ width, height, maxWidth: 'none', flexShrink: 0 }}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Stepped tank-level history. Unknown readings and offline periods appear as gaps."
            onPointerDown={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerCancel={() => {
              pointer.current = null;
            }}
            onPointerUp={(e) => {
              const start = pointer.current;
              pointer.current = null;
              if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const atX = ((e.clientX - rect.left) / rect.width) * width;
              const nearest = points.reduce(
                (best, p) => (Math.abs(x(p.at) - atX) < Math.abs(x(best.at) - atX) ? p : best),
                points[0],
              );
              setSelectedAt(nearest.at);
            }}
          >
            {(['low', 'middle', 'upper-middle', 'near-full', 'full'] as const).map((band, i) => (
              <g key={band}>
                <line
                  x1="20"
                  x2={width - 25}
                  y1={y(i)}
                  y2={y(i)}
                  stroke="#dce8f6"
                  strokeDasharray="3 5"
                />
              </g>
            ))}
            {segments.map((s, i) => (
              <path
                className="chart-trace"
                key={`${s.from.at}-${s.to.at}-${i}`}
                pathLength="1"
                d={`M${x(s.from.at)} ${y(s.value)}H${x(s.to.at)}V${y(historyValues[s.to.band])}`}
                fill="none"
                stroke={historyColors[s.value]}
                strokeWidth="3"
                strokeLinejoin="round"
              />
            ))}
            {points.map((p, i) =>
              historyValues[p.band] >= 0 ? (
                <circle
                  key={`${p.at}-${i}`}
                  cx={x(p.at)}
                  cy={y(historyValues[p.band])}
                  r={p.at === selected?.at ? 5 : 2.5}
                  fill={historyColors[historyValues[p.band]]}
                />
              ) : null,
            )}
            {selected ? (
              <line
                x1={x(selected.at)}
                x2={x(selected.at)}
                y1="22"
                y2={height - 28}
                stroke="#64748b"
                strokeDasharray="3 5"
                opacity=".5"
              />
            ) : null}
            {[points[0], points[Math.floor(points.length / 2)], points[points.length - 1]]
              .filter((p, i, a) => a.findIndex((v) => v.at === p.at) === i)
              .map((p) => (
                <text
                  key={p.at}
                  x={x(p.at)}
                  y={height - 7}
                  textAnchor="middle"
                  fill="#526985"
                  fontSize="12"
                >
                  {new Date(p.at).toLocaleTimeString(
                    language === 'bn' ? 'bn-IN' : 'en-IN',
                    last - first > 86400000
                      ? { month: 'short', day: 'numeric' }
                      : { hour: '2-digit', minute: '2-digit' },
                  )}
                </text>
              ))}
          </svg>
        </div>
      </div>
      {!compact && selected ? (
        <div className="chart-inspector">
          <button
            className="icon-button"
            aria-label={t('Previous history reading')}
            disabled={index === 0}
            onClick={() => setSelectedAt(points[index - 1].at)}
          >
            ‹
          </button>
          <div>
            <strong>{label(selected)}</strong>
            <span>
              {new Date(selected.at).toLocaleString(language === 'bn' ? 'bn-IN' : 'en-IN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label={t('Next history reading')}
            disabled={index === points.length - 1}
            onClick={() => setSelectedAt(points[index + 1].at)}
          >
            ›
          </button>
        </div>
      ) : null}
      <div className="chart-legend">
        {[t('Low'), '20–50%', legacy ? '50%+' : '50–80%', '80–100%', t('Full')].map((text, i) => (
          <span key={text}>
            <i style={{ background: historyColors[i] }} />
            {t(text)}
          </span>
        ))}
      </div>
    </div>
  );
});
