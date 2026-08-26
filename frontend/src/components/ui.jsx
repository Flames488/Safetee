import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ArrowUpRight, ArrowDownRight, X, AlertCircle, Inbox } from 'lucide-react';
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

export function initialsOf(name) {
  return name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

// Drop-in content for any of the app's avatar-shaped slots (the header
// button, sidebar chip, Dashboard button, Profile header — all already
// sized/shaped by their own className, this just supplies what goes inside
// it). Renders the real photo when there is one; falls back to initials
// on load failure just as readily as when there's no photo at all, so a
// broken/misconfigured avatar_url degrades to the old look instead of a
// broken-image icon.
export function Avatar({ src, name }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} />;
  }
  return initialsOf(name) || '—';
}

// Same broken-load fallback as Avatar, for a full-bleed decorative photo
// (marketing hero/CTA/tile backgrounds) rather than an avatar-shaped slot.
// Renders nothing on a failed load — instead of a broken-image icon — so
// whatever background/gradient already sits behind it in the page's own
// CSS shows through untouched. className positions it (typically
// absolute inset-0, object-fit: cover) via the page's own stylesheet.
export function BgPhoto({ src, className }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt="" className={className} onError={() => setBroken(true)} />;
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

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

const DEFAULT_DURATIONS = [15, 30, 60];

// Shared between accepting a location request and starting a "share at
// will" — every live location share is time-boxed (see LocationShare's
// backend docstring), never indefinite, so both flows need the same
// "how long" picker.
export function DurationPicker({ value, onChange, options = DEFAULT_DURATIONS }) {
  return (
    <div className="duration-picker">
      {options.map((mins) => (
        <button
          key={mins}
          type="button"
          className={`duration-chip ${value === mins ? 'duration-chip-active' : ''}`}
          onClick={() => onChange(mins)}
        >
          {mins < 60 ? `${mins}m` : `${mins / 60}h`}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children }) {
  return <div className="section-label mono">{children}</div>;
}

export function ProgressDots({ total, active, onSelect }) {
  return (
    <div className="progress-dots">
      {Array.from({ length: total }).map((_, i) => (
        onSelect ? (
          <button
            key={i}
            type="button"
            className={`dot ${i === active ? 'dot-active' : i < active ? 'dot-done' : ''}`}
            aria-label={`Go to item ${i + 1} of ${total}`}
            aria-current={i === active}
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
          />
        ) : (
          <span key={i} className={`dot ${i === active ? 'dot-active' : i < active ? 'dot-done' : ''}`} />
        )
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

// Keeps the last-focused element inside `ref` while `active`, and returns
// focus to whatever was focused before opening once it becomes inactive —
// shared by Modal and Drawer so both trap keyboard focus the same way.
function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement;
    const focusables = () =>
      container.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex]:not([tabindex="-1"])');

    const first = focusables()[0];
    (first || container).focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = Array.from(focusables());
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}

// Locks background scroll while any overlay (Modal/Drawer) is open —
// a ref-counted lock so nesting or rapid open/close never leaves the
// body stuck with overflow:hidden.
let scrollLockCount = 0;
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    if (scrollLockCount === 0) document.body.style.overflow = 'hidden';
    scrollLockCount += 1;
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) document.body.style.overflow = '';
    };
  }, [active]);
}

// Centered dialog — the base every confirmation/detail overlay in the app
// builds on. Closes on Escape or a backdrop click; traps focus while open.
export function Modal({ open, onClose, title, children, width }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        style={width ? { maxWidth: width } : undefined}
      >
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="overlay-close" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={2.2} /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// The single confirmation pattern for every destructive/high-stakes action
// in the app (cancel subscription, delete contact, log out, ...) — built on
// Modal so all of them look and behave identically.
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'danger', busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      {body && <p className="confirm-body">{body}</p>}
      <div className="confirm-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ConfirmDialog's sibling for actions that need an admin to actually write
// down why (suspend/ban/soft-delete a user) rather than rubber-stamp a
// confirm button — see AdminDashboard.jsx. reasonRequired defaults on;
// pass false for actions where a reason is good practice but optional
// (reinstate, force-logout).
export function ReasonConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'danger', busy,
  reason, onReasonChange, reasonRequired = true, reasonPlaceholder = 'Reason for this action…',
}) {
  const canConfirm = !reasonRequired || reason.trim().length >= 3;
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      {body && <p className="confirm-body">{body}</p>}
      <textarea
        className="field-input reason-textarea"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder={reasonPlaceholder}
        rows={3}
      />
      <div className="confirm-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy || !canConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// Slide-in panel from the right — for secondary detail views (e.g. a user's
// full record from an admin table) that don't warrant leaving the page.
export function Drawer({ open, onClose, title, children }) {
  const ref = useRef(null);
  useFocusTrap(ref, open);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="overlay-close" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={2.2} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

// ── Toast — app-wide notification queue ──
// ToastProvider wraps the app once (see App.jsx); any component then calls
// `const toast = useToast(); toast('Saved', { tone: 'good' })`. Purely a UI
// concern (no business state), styled with the same semantic tone tokens
// as Pill/KpiCard so success/warn/danger read consistently everywhere.
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, { tone = 'neutral', duration = 4500 } = {}) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, tone }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={13} strokeWidth={2.2} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>');
  return toast;
}

// Card-based empty/error placeholders — replace bare "Loading…"/error <p>
// text so every list/section in the app fails or empties the same way.
export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <Card className="state-card">
      <span className="state-icon"><Icon size={22} strokeWidth={1.8} /></span>
      {title && <strong>{title}</strong>}
      {message && <p>{message}</p>}
      {action}
    </Card>
  );
}

export function ErrorState({ icon: Icon = AlertCircle, title = 'Something went wrong', message, onRetry }) {
  return (
    <Card className="state-card state-card-danger">
      <span className="state-icon state-icon-danger"><Icon size={22} strokeWidth={1.8} /></span>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}

// Generic shimmer row/table — extends the existing .skel/.skel-line
// treatment (already used by KpiCardSkeleton) to list/table content.
export function SkeletonRow({ columns = 3 }) {
  return (
    <div className="skel-row">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="skel skel-line" style={{ width: i === 0 ? '34%' : `${58 / columns}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 3 }) {
  return (
    <div className="skel-table">
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} columns={columns} />)}
    </div>
  );
}

// The tone-colored icon-in-rounded-square motif, previously hand-rolled
// separately in Billing/History/Contacts/SOS — one primitive, same tint
// system as KpiCard (kpi-tint-*).
export function IconTile({ icon: Icon, tone = 'brand', size = 38 }) {
  return (
    <span className={`icon-tile icon-tile-${tone}`} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.45)} strokeWidth={2.1} />
    </span>
  );
}

// Same slot IconTile fills in a list row, but for a specific *person*
// rather than an activity type: shows their real uploaded photo when one
// exists (a trusted contact who's also a registered user, an alerter, a
// watcher — anywhere else in the app one person's identity is shown next
// to another's), falling back to the tone-coded activity icon exactly as
// before when they have none. Avatar's own onError handling covers a
// broken/stale avatar_url the same way.
export function PersonTile({ icon: Icon, tone = 'brand', size = 38, avatarUrl, name }) {
  if (!avatarUrl) return <IconTile icon={Icon} tone={tone} size={size} />;
  return (
    <span className="icon-tile person-tile" style={{ width: size, height: size }}>
      <Avatar src={avatarUrl} name={name} />
    </span>
  );
}

// Labeled text input — replaces raw <input> markup duplicated across
// Contacts' add-contact form, EditProfile, MedicalInfo, and PlanPicker's
// email prompt with one consistently styled, accessible field.
export function Field({ label, error, hint, className = '', ...rest }) {
  return (
    <label className={`field ${error ? 'field-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <input className="field-input" {...rest} />
      {error && <span className="field-msg field-msg-error">{error}</span>}
      {!error && hint && <span className="field-msg">{hint}</span>}
    </label>
  );
}
