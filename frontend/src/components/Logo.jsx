// The mark used everywhere the wordmark lockup appears (marketing nav,
// auth split-screen, sidebar, footer) — one place to keep it consistent.
// Rendered directly rather than inside a colored chip: unlike the old
// thin-line glyph (which needed a brand-gradient backing to read as
// intentional), this artwork is already a fully-shaded, self-contained
// mark, so a wrapper chip would just fight it for attention. Width is
// slightly narrower than height (the source art isn't a perfect square),
// so `size` sets the height and width follows its own aspect ratio.
export default function Logo({ size = 24, className = '' }) {
  return (
    <img
      src="/logo-mark.png" alt=""
      style={{ height: size, width: 'auto', display: 'block', flexShrink: 0 }}
      className={className}
    />
  );
}
