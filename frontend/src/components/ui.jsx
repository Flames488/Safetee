import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './ui.css';

export function Button({ variant = 'primary', size = 'md', full, icon, children, ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${full ? 'btn-full' : ''}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Card({ children, className = '', ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
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
