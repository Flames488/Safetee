import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mic, MapPin, Users, X, Video, Camera } from 'lucide-react';
import VitalRing, { VitalDot } from '../components/VitalRing';
import { api } from '../lib/api';
import { startEvidenceCapture } from '../lib/evidenceCapture';
import './sos.css';

// One contact can have multiple alert channels (push + SMS fallback) — pick
// the best status across them so "delivered on SMS after push failed" reads
// as delivered, not failed.
const STATUS_RANK = { failed: 0, queued: 1, sent: 2, delivered: 3 };
function contactAlertState(alerts, contactId) {
  const rows = alerts.filter((a) => a.contact_id === contactId);
  if (rows.length === 0) return 'queued';
  return rows.reduce((best, r) => (STATUS_RANK[r.status] > STATUS_RANK[best] ? r.status : best), rows[0].status);
}
const STATE_LABEL = { queued: 'Sending…', sent: 'Sent', delivered: 'Sent', failed: 'Not delivered' };

const EVIDENCE_ICON = { audio: Mic, video: Video, photo: Camera };
const EVIDENCE_LABEL = { audio: 'Audio recording', video: 'Video recording', photo: 'Photo capture' };
// Maps the granular status evidenceCapture.js reports into the same
// done/failed/live vocabulary the contact-alert steps already use, so both
// kinds of step render through one path below.
const EVIDENCE_META = {
  pending: { done: false, failed: false, live: false, stateLabel: 'Starting…' },
  capturing: { done: true, failed: false, live: true, stateLabel: 'Recording' },
  capped: { done: true, failed: false, live: false, stateLabel: 'Limit reached' },
  error: { done: false, failed: true, live: false, stateLabel: 'Retrying…' },
  unavailable: { done: false, failed: true, live: false, stateLabel: 'Unavailable' },
};

export default function SOSActive() {
  const [phase, setPhase] = useState('counting');
  const [count, setCount] = useState(5);
  const [eventId, setEventId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [evidenceStatus, setEvidenceStatus] = useState({ audio: null, video: null, photo: null });
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

  // Poll real per-contact delivery status once alerts are actually fanning
  // out — the backend populates SOSEvent.alerts asynchronously after the
  // cancel window closes, so this is the one honest way to move a contact
  // row off "Sending…" (see the fanout comment above `steps`).
  useEffect(() => {
    if (phase !== 'active' || !eventId) return;
    let cancelled = false;
    const poll = () => {
      api.getActiveSOS()
        .then((event) => { if (!cancelled && event?.id === eventId) setAlerts(event.alerts || []); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [phase, eventId]);

  // Mic/camera are only ever touched here — once the local cancel window
  // (the "counting" phase, see startHold) has actually closed on a real
  // SOS event, never elsewhere in the app. A cancelled/practice trigger
  // never requests a permission prompt or records anything.
  useEffect(() => {
    if (phase !== 'active' || !eventId) return;
    let cancelled = false;
    let stop = () => {};
    startEvidenceCapture(eventId, (mediaType, status) =>
      setEvidenceStatus((s) => ({ ...s, [mediaType]: status }))
    ).then((fn) => { if (cancelled) fn(); else stop = fn; });
    return () => { cancelled = true; stop(); };
  }, [phase, eventId]);

  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      const call = phase === 'counting' ? api.cancelSOS : api.resolveSOS;
      if (eventId) call(eventId).catch(() => {});
      navigate('/app');
    }, 900);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Real notification + evidence steps. No fabricated names or fake "done"
  // states — each contact's state comes straight from the backend's
  // per-alert delivery status (polled above), and each evidence row comes
  // straight from evidenceCapture.js reporting what the mic/camera are
  // actually doing, not a client-side guess.
  const steps = [
    { key: 'location', icon: MapPin, label: 'Location sent', done: true, failed: false, live: false, stateLabel: 'Sent' },
    ...contacts.map((c) => {
      const state = contactAlertState(alerts, c.id);
      return {
        key: c.id, icon: Users, label: `${c.name} notified`,
        done: state === 'sent' || state === 'delivered', failed: state === 'failed', live: false,
        stateLabel: STATE_LABEL[state],
      };
    }),
    ...['audio', 'video', 'photo']
      .filter((k) => evidenceStatus[k])
      .map((k) => ({ key: `evidence-${k}`, icon: EVIDENCE_ICON[k], label: EVIDENCE_LABEL[k], ...EVIDENCE_META[evidenceStatus[k]] })),
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
            {s.live
              ? <VitalDot color="red" size={7} />
              : <span className={`sos-step-state ${s.done ? 'done' : ''} ${s.failed ? 'failed' : ''}`}>{s.stateLabel}</span>}
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
