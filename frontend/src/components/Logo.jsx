// The recurring "gradient chip + glow" mark used everywhere the
// wordmark lockup appears (marketing nav, auth split-screen, sidebar,
// footer) — one place to keep that treatment consistent.
export default function Logo({ size = 24, className = '' }) {
  const pad = Math.round(size * 0.28);
  const box = size + pad;
  return (
    <span
      className={`chip-gradient ${className}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: box, height: box, borderRadius: box * 0.32, flexShrink: 0,
      }}
    >
      <img src="/logo-mark.svg" alt="" width={size} height={size} style={{ display: 'block' }} />
    </span>
  );
}
