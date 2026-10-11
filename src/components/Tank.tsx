import { useId } from 'react';
import type { Band } from '../../shared/model';
export function Tank({
  band,
  uncertain,
  stale = false,
}: {
  band: Band;
  uncertain: boolean;
  stale?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const lower =
    band === 'full'
      ? 100
      : band === 'near-full'
        ? 80
        : band === 'high' || band === 'upper-middle'
          ? 50
          : band === 'middle'
            ? 20
            : 0;
  const upper =
    band === 'full'
      ? 100
      : band === 'near-full' || band === 'high'
        ? 100
        : band === 'upper-middle'
          ? 80
          : band === 'middle'
            ? 50
            : band === 'low'
              ? 20
              : 0;
  const y = (percent: number) => 264 - percent * 2.08;
  const colors = ['#d97706', '#0891b2', '#2563eb', '#7c3aed'];
  const wave = 'M-184 0 Q-138 -9 -92 0 T0 0 T92 0 T184 0 T276 0 T368 0 T460 0 T552 0 V260 H-184Z';
  return (
    <div className={`tank-motion ${stale || uncertain ? 'motion-paused' : ''}`}>
      <svg
        className={`tank-illustration ${uncertain ? 'uncertain' : ''}`}
        viewBox="0 0 360 330"
        role="img"
        aria-label={
          uncertain
            ? 'Tank level cannot currently be confirmed'
            : `${stale ? 'Last known' : 'Confirmed'} ${band} level band, not an exact percentage`
        }
      >
        <defs>
          <linearGradient id={`${id}-body`}>
            <stop stopColor="#dbeafe" stopOpacity=".85" />
            <stop offset=".45" stopColor="#fff" />
            <stop offset="1" stopColor="#bfdbfe" stopOpacity=".8" />
          </linearGradient>
          <linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#22d3ee" />
            <stop offset=".55" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
          <pattern
            id={`${id}-band`}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="#e0f2fe" />
            <rect width="2" height="8" fill="#93c5fd" opacity=".5" />
          </pattern>
          <clipPath id={`${id}-clip`}>
            <path d="M86 62C86 33 270 33 270 62V262C270 293 86 293 86 262Z" />
          </clipPath>
        </defs>
        <ellipse cx="178" cy="303" rx="107" ry="14" fill="#2563eb" opacity=".08" />
        <path
          d="M86 62C86 33 270 33 270 62V262C270 293 86 293 86 262Z"
          fill={`url(#${id}-body)`}
          stroke="#a8c9ec"
          strokeWidth="2"
        />
        <g clipPath={`url(#${id}-clip)`}>
          {!uncertain && upper > lower ? (
            <rect
              className="tank-band"
              x="86"
              y={y(upper)}
              width="184"
              height={y(lower) - y(upper)}
              fill={`url(#${id}-band)`}
            />
          ) : null}
          {!uncertain && lower > 0 ? (
            <g className="water-level" style={{ transform: `translateY(${y(lower)}px)` }}>
              <rect x="86" y="0" width="184" height="260" fill={`url(#${id}-water)`} />
              <g transform="translate(86 0)">
                <path className="water-wave wave-back" d={wave} fill="#67e8f9" opacity=".52" />
                <path className="water-wave wave-front" d={wave} fill={`url(#${id}-water)`} />
              </g>
              <ellipse cx="178" cy="1" rx="91" ry="9" fill="#a5f3fc" opacity=".26" />
            </g>
          ) : null}
          {[20, 50, 80, 100].map((percent) => (
            <path
              key={percent}
              d={`M86 ${y(percent)}Q178 ${y(percent) + 20} 270 ${y(percent)}`}
              fill="none"
              stroke={percent <= lower && !uncertain ? '#e0f2fe' : '#a8c9ec'}
              strokeDasharray="4 5"
              opacity=".6"
            />
          ))}
          <path
            d="M109 78V244"
            stroke="#fff"
            strokeWidth="10"
            opacity=".37"
            strokeLinecap="round"
          />
          <path
            d="M249 79V242"
            stroke="#1d4ed8"
            strokeWidth="5"
            opacity=".08"
            strokeLinecap="round"
          />
        </g>
        <ellipse cx="178" cy="62" rx="92" ry="22" fill="#f0f7ff" stroke="#a8c9ec" strokeWidth="2" />
        <ellipse cx="178" cy="59" rx="41" ry="9" fill="#dbeafe" />
        <path d="M86 262C86 293 270 293 270 262" fill="none" stroke="#93bce5" strokeWidth="2" />
        {[20, 50, 80, 100].map((percent, i) => (
          <g key={percent}>
            <path d={`M272 ${y(percent)}h18`} stroke={colors[i]} opacity=".55" />
            <circle
              cx="268"
              cy={y(percent)}
              r="4"
              fill={!uncertain && percent <= lower ? colors[i] : '#fff'}
              stroke={colors[i]}
              strokeWidth="1.5"
            />
            <text x="299" y={y(percent) + 4} fill="#526985" fontSize="12">
              {percent}%
            </text>
          </g>
        ))}
        {uncertain ? (
          <text x="178" y="178" textAnchor="middle" fontSize="48" fill="#7c91aa">
            ?
          </text>
        ) : null}
      </svg>
    </div>
  );
}
