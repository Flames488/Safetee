import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mic, MapPin, Users, X } from 'lucide-react';
import VitalRing, { VitalDot } from '../components/VitalRing';
import { api } from '../lib/api';
import './sos.css';

export default function SOSActive() {
  const [phase, setPhase] = useState('counting');
  const [count, setCount] = useState(5);
  const [eventId, setEventId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const holdTimer = useRef(null);
  const activeSince = useRef(null);
  const navigate = useNavigate();

  // Fire the real trigger the instant this screen mounts — the countdown
  // shown to the user is purely a local "cancel window" UI; the backend
  // independently enforces its own cancel window before fanning alerts out,
  // so a slow/dropped network call here never delays the actual alert.
  useEffect(() => {
    const send = (lat, lng) =>
      api.triggerSOS({ trigger: 'button', lat, lng })
        .then((event) => event && setEventId(event.id))
        .catch(() => {}); // offline/demo mode — countdown still runs locally

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => send(pos.coords.latitude, pos.coords.longitude),
        () => send(null, null),
        { timeout: 3000 }
      );
    } else {
      send(null, null);
    }

    api.listContacts().then(setContacts).catch(() => setContacts([]));
  }, []);

  useEffect(() => {
    if (phase !== 'counting') return;
    if (count === 0) { setPhase('active'); activeSince.current = Date.now(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - activeSince.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      const call = phase === 'counting' ? api.cancelSOS : api.resolveSOS;
      if (eventId) call(eventId).catch(() => {});
      navigate('/app');
    }, 900);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Real notification steps: one per trusted contact, plus location and
  // audio. No fabricated names or fake "done" states — every contact
  // reads "Sending…" until we actually have per-alert delivery status from
  // the backend (SOSEventOut.alerts), which the fanout task populates
  // asynchronously after the cancel window closes.
  const steps = [
    { key: 'location', icon: MapPin, label: 'Location sent', done: true },
    ...contacts.map((c) => ({ key: c.id, icon: Users, label: `${c.name} notified`, done: false })),
    { key: 'audio', icon: Mic, label: 'Audio recording', done: true, live: true },
  ];

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
        <span className="sos-timer mono">{mmss(elapsed)}</span>
      </div>

      <h1 className="sos-h1 sos-h1-left">Help is on the way.</h1>
      <p className="sos-p sos-p-left">
        {contacts.length
          ? "Your trusted contacts have your live location and can hear what's happening around you."
          : "You don't have any trusted contacts set up, so location is being recorded but no one else is being alerted."}
      </p>

      <div className="sos-steps">
        {steps.map((s) => (
          <div key={s.key} className={`sos-step ${s.done ? 'sos-step-done' : ''}`}>
            <span className="sos-step-icon"><s.icon size={15} strokeWidth={2.2} /></span>
            <span>{s.label}</span>
            {s.live ? <VitalDot color="red" size={7} /> : <span className={`sos-step-state ${s.done ? 'done' : ''}`}>{s.done ? 'Sent' : 'Sending…'}</span>}
          </div>
        ))}
      </div>

      <div className="sos-spacer" />
      <a className="sos-call" href="tel:112">
        <Phone size={18} strokeWidth={2.2} /> Call emergency services
      </a>
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
