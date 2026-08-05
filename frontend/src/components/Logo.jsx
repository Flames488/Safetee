export default function Logo({ size = 24, className = '' }) {
  return (
    <img
      src="/logo-mark.svg"
      alt="Safetee"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  );
}
