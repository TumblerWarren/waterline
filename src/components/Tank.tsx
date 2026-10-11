import { useId } from 'react';
import type { Band } from '../../shared/model';
export function Tank({ band, uncertain }: { band: Band; uncertain: boolean }) {
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
  return (
    <svg
      className={`tank-illustration ${uncertain ? 'uncertain' : ''}`}
      viewBox="0 0 360 330"
      role="img"
      aria-label={
        uncertain
          ? 'Tank level cannot currently be confirmed'
          : `Tank illustration showing the ${band} level band, not an exact percentage`
      }
    >
      <defs>
        <linearGradient id={`${id}-body`}>
          <stop stopColor="#ecf3ed" />
          <stop offset=".5" stopColor="#fff" />
          <stop offset="1" stopColor="#e2eeea" />
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4ebfa7" />
          <stop offset="1" stopColor="#188878" />
        </linearGradient>
        <pattern
          id={`${id}-band`}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#ccebe0" />
          <rect width="2" height="8" fill="#afd8c7" />
        </pattern>
        <clipPath id={`${id}-clip`}>
          <path d="M86 62C86 33 270 33 270 62V262C270 293 86 293 86 262Z" />
        </clipPath>
      </defs>
      <ellipse cx="178" cy="300" rx="108" ry="15" fill="#0d4c3d" opacity=".07" />
      <path
        d="M86 62C86 33 270 33 270 62V262C270 293 86 293 86 262Z"
        fill={`url(#${id}-body)`}
        stroke="#b7d0c4"
        strokeWidth="2"
      />
      <g clipPath={`url(#${id}-clip)`}>
        {!uncertain && upper > lower ? (
          <rect
            x="86"
            y={y(upper)}
            width="184"
            height={y(lower) - y(upper)}
            fill={`url(#${id}-band)`}
          />
        ) : null}
        {!uncertain && lower > 0 ? (
          <rect x="86" y={y(lower)} width="184" height="240" fill={`url(#${id}-water)`} />
        ) : null}
        {!uncertain && lower > 0 ? (
          <ellipse cx="178" cy={y(lower)} rx="92" ry="16" fill="#6bc9b1" />
        ) : null}
        {[20, 50, 80, 100].map((percent) => (
          <path
            key={percent}
            d={`M86 ${y(percent)}Q178 ${y(percent) + 20} 270 ${y(percent)}`}
            fill="none"
            stroke={percent <= lower && !uncertain ? '#b9ecda' : '#b6cfc3'}
            strokeDasharray="4 5"
            opacity=".7"
          />
        ))}
        <path d="M112 73V245" stroke="#fff" strokeWidth="9" opacity=".28" strokeLinecap="round" />
      </g>
      <ellipse cx="178" cy="62" rx="92" ry="22" fill="#f6faf5" stroke="#b7d0c4" strokeWidth="2" />
      <ellipse cx="178" cy="58" rx="39" ry="9" fill="#dfeae0" />
      <path d="M86 262C86 293 270 293 270 262" fill="none" stroke="#8eb9a5" strokeWidth="2" />
      {[20, 50, 80, 100].map((percent) => (
        <g key={percent}>
          <path d={`M272 ${y(percent)}h18`} stroke="#97b9a8" />
          <circle
            cx="268"
            cy={y(percent)}
            r="4"
            fill={!uncertain && percent <= lower ? '#123d43' : '#f8faf7'}
            stroke="#628b78"
            strokeWidth="1.5"
          />
          <text x="299" y={y(percent) + 4} fill="#688172" fontSize="12" fontFamily="inherit">
            {percent}%
          </text>
        </g>
      ))}
      {uncertain ? (
        <text x="178" y="178" textAnchor="middle" fontSize="48" fill="#799285">
          ?
        </text>
      ) : null}
    </svg>
  );
}
