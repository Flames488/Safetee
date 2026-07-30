import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mic, MapPin, Users, X } from 'lucide-react';
import VitalRing, { VitalDot } from '../components/VitalRing';
import './sos.css';

const STEPS = [
  { icon: MapPin, label: 'Location sent', done: true },
  { icon: Users, label: 'Amaka Obi notified', done: true },
  { icon: Users, label: 'Tunde Bakare notified', done: false },
  { icon: Mic, label: 'Audio recording', done: true, live: true },
];

export default function SOSActive() {
  const [phase, setPhase] = useState('counting');
  const [count, setCount] = useState(5);
  const holdTimer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (phase !== 'counting') return;
    if (count === 0) { setPhase('active'); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  const startHold = () => { holdTimer.current = setTimeout(() => navigate('/app'), 900); };
  const endHold = () => clearTimeout(holdTimer.current);

  if (phase === 'counting') {
    return (
      <div className="sos-screen sos-counting">
        <p className="sos-eyebrow mono">SENDING ALERT</p>
        <VitalRing size={200} color="red">
          <span className="sos-countdown mono">{count}</span>
        </VitalRing>
        <h1 className="sos-h1">Alerting your trusted<br />contacts in {count}s</h1>
        <p className="sos-p">Location, audio and your emergency profile will be shared automatically.</p>
        <button
          className="sos-cancel-btn"
          onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold}
          onTouchStart={startHold} onTouchEnd={endHold}
        >
          Hold to cancel
        </button>
      </div>
    );
  }

  return (
    <div className="sos-screen sos-active">
      <div className="sos-active-top">
        <span className="sos-live-pill mono"><VitalDot color="red" size={7} /> SOS ACTIVE</span>
        <span className="sos-timer mono">02:14</span>
      </div>

      <h1 className="sos-h1 sos-h1-left">Help is on the way.</h1>
      <p className="sos-p sos-p-left">Your trusted contacts have your live location and can hear what's happening around you.</p>

      <div className="sos-steps">
        {STEPS.map((s) => (
          <div key={s.label} className={`sos-step ${s.done ? 'sos-step-done' : ''}`}>
            <span className="sos-step-icon"><s.icon size={15} strokeWidth={2.2} /></span>
            <span>{s.label}</span>
            {s.live ? <VitalDot color="red" size={7} /> : <span className={`sos-step-state ${s.done ? 'done' : ''}`}>{s.done ? 'Sent' : 'Sending…'}</span>}
          </div>
        ))}
      </div>

      <div className="sos-spacer" />
      <button className="sos-call">
        <Phone size={18} strokeWidth={2.2} /> Call emergency services
      </button>
      <button
        className="sos-cancel-btn sos-cancel-btn-active"
        onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold}
        onTouchStart={startHold} onTouchEnd={endHold}
      >
        <X size={15} strokeWidth={2.4} /> Hold to mark as safe
      </button>
    </div>
  );
}
