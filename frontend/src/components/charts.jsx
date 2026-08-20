import { useState } from 'react';
import './charts.css';

// Small inline trend line — no axis chrome, just a shape (e.g. inside a
// KpiCard's sub-area). Deliberately minimal per the "one meaningful trend
// chart beats five decorative ones" research finding.
export function Sparkline({ data, width = 120, height = 32, color = 'var(--brand-bright)' }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="sparkline" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The dashboard's one real trend visualization — a filled line chart with
// a hover tooltip. `data` is `[{ label, value }]` already bucketed by the
// caller (e.g. signups per day derived client-side from user records).
export function TrendChart({ data, height = 180, formatValue = (v) => v, emptyLabel = 'Not enough data yet' }) {
  const [hover, setHover] = useState(null);
  if (!data || data.length < 2) {
    return <div className="chart-empty" style={{ height }}>{emptyLabel}</div>;
  }

  const width = 600;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = width / (data.length - 1);
  const points = data.map((d, i) => [i * stepX, height - (d.value / max) * (height - 28) - 6]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div className="trend-chart" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="trend-chart-svg" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--brand-bright)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={hover === i ? 5 : 0} fill="var(--brand-bright)" style={{ transition: 'r var(--dur-fast) var(--ease-out)' }} />
        ))}
        {points.map(([x], i) => (
          <rect key={`hit-${i}`} x={x - stepX / 2} y={0} width={stepX} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div className="trend-tooltip" style={{ left: `${(hover / (data.length - 1)) * 100}%` }}>
          <strong>{formatValue(data[hover].value)}</strong>
          <span>{data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

// Breakdown — one row per segment, each with its own proportional bar.
// Used for the subscription-status mix. `segments` is `[{ label, value,
// tone }]`; tone maps to the existing pill/kpi tint tokens
// (good/info/warn/danger/neutral). A per-row layout (rather than one
// combined bar plus a separate legend) scales its own height with the
// number of segments, so it holds its own next to a tall chart instead
// of leaving a block of empty card below a single thin bar.
export function BreakdownBar({ segments, format = (n) => n.toLocaleString(), onSegmentClick }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className="breakdown">
      {segments.map((s) => {
        const pct = (s.value / total) * 100;
        const clickable = Boolean(onSegmentClick);
        return (
          <div
            className={`breakdown-row ${clickable ? 'breakdown-row-clickable' : ''}`}
            key={s.label}
            onClick={clickable ? () => onSegmentClick(s) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div className="breakdown-row-head">
              <span className="breakdown-row-label">
                <span className={`breakdown-dot breakdown-dot-${s.tone || 'neutral'}`} />
                {s.label}
              </span>
              <span className="breakdown-row-value">
                <strong>{format(s.value)}</strong>
                <span className="breakdown-row-pct">{Math.round(pct)}%</span>
              </span>
            </div>
            <div className="breakdown-track">
              <span className={`breakdown-fill breakdown-fill-${s.tone || 'neutral'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
