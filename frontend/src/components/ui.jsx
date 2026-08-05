import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import './ui.css';

export function Button({ variant = 'primary', size = 'md', full, icon, children, ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${full ? 'btn-full' : ''}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Card({ children, className = '', interactive, ...rest }) {
  return <div className={`card ${interactive ? 'card-interactive' : ''} ${className}`} {...rest}>{children}</div>;
}

// Animates from 0 (or its previous value) to `value` whenever `value`
// changes — used for hero/KPI figures so real data updates read as
// alive rather than just replacing text instantly.
export function CountUp({ value, duration = 700, format = (n) => Math.round(n).toLocaleString() }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = typeof value === 'number' ? value : 0;
    if (from === to) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className="count-up">{format(display)}</span>;
}

// The stat-tile primitive used across Dashboard/Admin — a labelled
// figure with a tinted icon chip and an optional up/down trend pill.
export function KpiCard({ icon: Icon, label, value, sub, trend, tint = 'brand', format }) {
  return (
    <div className={`kpi kpi-tint-${tint}`}>
      <div className="kpi-head">
        {Icon && <span className="kpi-icon"><Icon size={17} strokeWidth={2.1} /></span>}
        {trend != null && (
          <span className={`kpi-trend ${trend >= 0 ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
            {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div>
        <div className="kpi-value stat-figure">
          {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
        </div>
        <div className="kpi-label">{label}</div>
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="kpi kpi-skeleton">
      <div className="kpi-head"><span className="kpi-icon" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skel skel-line" style={{ width: '52%', height: 24 }} />
        <div className="skel skel-line" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

// Config-driven status pill — one lookup table instead of a pill-tone
// prop threaded through every call site, so adding a new status only
// means adding a row here.
const STATUS_TONES = {
  active: 'good', trialing: 'info', past_due: 'warn', cancelled: 'warn', expired: 'bad',
  suspended: 'bad', pending: 'warn', resolved: 'good', escalated: 'bad',
  none: 'neutral', viewer: 'info', super_admin: 'good',
};
export function StatusBadge({ status, label }) {
  const tone = STATUS_TONES[status] || 'neutral';
  return <Pill tone={tone}>{label || String(status).replace(/_/g, ' ')}</Pill>;
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function SectionLabel({ children }) {
  return <div className="section-label mono">{children}</div>;
}

export function ProgressDots({ total, active }) {
  return (
    <div className="progress-dots">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`dot ${i === active ? 'dot-active' : i < active ? 'dot-done' : ''}`} />
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => onChange && onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

// Drop-in replacement for a plain `<input type="password">` — same props,
// plus a show/hide toggle. Meant to sit inside whatever label wrapper the
// page already uses (.lg-field, .ob-field, etc.) so it inherits their
// existing input styling.
export function PasswordInput({ value, onChange, placeholder, autoComplete, minLength, required, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        {...rest}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
    </div>
  );
}
