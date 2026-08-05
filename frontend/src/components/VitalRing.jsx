import './vital-ring.css';

/**
 * VitalRing — Safetee's signature element.
 * A calm, heartbeat-paced pulse used anywhere the product is "listening":
 * behind the SOS button, on live-status dots, and on the tracking screen.
 * color: 'green' | 'red' | 'blue'
 */
export default function VitalRing({ size = 220, color = 'green', active = true, children }) {
  return (
    <div className={`vital-ring vital-${color}`} style={{ width: size, height: size }}>
      {active && (
        <>
          <span className="vital-wave vital-wave-1" />
          <span className="vital-wave vital-wave-2" />
          <span className="vital-wave vital-wave-3" />
        </>
      )}
      <div className="vital-core">{children}</div>
    </div>
  );
}

export function VitalDot({ color = 'green', size = 8, active = true }) {
  return (
    <span className={`vital-dot vital-dot-${color}`} style={{ width: size, height: size }}>
      {active && <span className="vital-dot-ping" />}
    </span>
  );
}
