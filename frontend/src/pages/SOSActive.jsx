import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, Mic, MapPin, Users, X, Video, Camera, WifiOff, MessageCircle } from 'lucide-react';
import VitalRing, { VitalDot } from '../components/VitalRing';
import { Button, Modal, PasswordInput } from '../components/ui';
import { api } from '../lib/api';
import { startEvidenceCapture } from '../lib/evidenceCapture';
import { cacheContacts, getCachedContacts } from '../lib/contactsCache';
import { useAuth } from '../context/AuthContext';
import './sos.css';

// iOS wants `sms:number&body=`, everything else wants `sms:number?body=`.
// Using both delimiters together is a well-known cross-platform trick: each
// OS parses the one it recognizes and ignores the other as a harmless
// leading empty param, so one href works everywhere.
function smsHref(phone, body) {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

// One contact can have multiple alert channels (push + SMS fallback) — pick
// the best status across them so "delivered on SMS after push failed" reads
// as delivered, not failed.
const STATUS_RANK = { failed: 0, queued: 1, sent: 2, delivered: 3 };
function contactAlertState(alerts, contactId, sendFailed) {
  const rows = alerts.filter((a) => a.contact_id === contactId);
  // No rows yet because the trigger itself never reached the backend (no
  // connection) reads as "queued forever" otherwise — sendFailed is what
  // turns that into an honest "Not delivered" instead.
  if (rows.length === 0) return sendFailed ? 'failed' : 'queued';
  return rows.reduce((best, r) => (STATUS_RANK[r.status] > STATUS_RANK[best] ? r.status : best), rows[0].status);
}
const STATE_LABEL = {
  queued: 'Sending…', sent: 'Sent', delivered: 'Sent', failed: 'Not delivered',
  simulated: 'Would notify (drill)',
};

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
  const { user } = useAuth();
  const location = useLocation();
  // Reached either from the Dashboard's hold-for-SOS button (no state,
  // defaults to 'button') or from the secret-gesture shake detector in
  // AppShell.jsx, which passes { trigger: 'gesture' }. Unlike button, a
  // gesture trigger skips the visible countdown entirely (see trigger_sos
  // on the backend, which fans out immediately for it too) — the whole
  // point of a covert gesture is that reaching for a big red "cancel"
  // screen isn't safe to do in front of whoever the alert is being hidden
  // from, so this jumps straight to 'active' instead.
  const trigger = location.state?.trigger || 'button';
  const [phase, setPhase] = useState(trigger === 'gesture' ? 'active' : 'counting');
  const [count, setCount] = useState(5);
  const [eventId, setEventId] = useState(null);
  const [isPractice, setIsPractice] = useState(false);
  // 'sending' | 'sent' | 'failed' — whether the trigger itself has ever
  // reached the backend, independent of per-contact delivery below.
  const [sendState, setSendState] = useState('sending');
  const coordsRef = useRef({ lat: null, lng: null });
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [evidenceStatus, setEvidenceStatus] = useState({ audio: null, video: null, photo: null });
  const [safeOpen, setSafeOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [safeError, setSafeError] = useState('');
  const [resolving, setResolving] = useState(false);
  const holdTimer = useRef(null);
  // Set immediately for a gesture trigger, which starts in 'active' phase
  // directly (see `phase` above) — the counting-phase effect below is what
  // sets this for every other trigger, once its countdown reaches 0.
  const activeSince = useRef(trigger === 'gesture' ? Date.now() : null);
  const navigate = useNavigate();

  // Fire the real trigger the instant this screen mounts — the countdown
  // shown to the user is purely a local "cancel window" UI; the backend
  // independently enforces its own cancel window before fanning alerts out,
  // so a slow/dropped network call here never delays the actual alert.
  //
  // A dropped connection here used to be swallowed silently, leaving every
  // contact stuck on "Sending…" forever with no alert ever sent and no
  // indication anything was wrong — a false sense of security in exactly
  // the moment it matters most. Instead: report the failure honestly (see
  // sendState below, and the manual sms: fallback in the render), and keep
  // retrying automatically — immediately on the browser's 'online' event,
  // and every few seconds regardless in case that event doesn't fire on
  // this device. `inFlight`/`succeeded` guard against a race between the
  // timer and the online listener firing two overlapping requests — the
  // backend has no dedup, so a duplicate call here would double-alert
  // every contact with a second, separate SOS event.
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let succeeded = false;
    let retryTimer = null;

    const attempt = () => {
      if (stopped || succeeded || inFlight) return;
      inFlight = true;
      api.triggerSOS({ trigger, lat: coordsRef.current.lat, lng: coordsRef.current.lng })
        .then((event) => {
          inFlight = false;
          if (stopped) return;
          succeeded = true;
          if (event) {
            setEventId(event.id);
            setIsPractice(Boolean(event.is_practice));
          }
          setSendState('sent');
        })
        .catch(() => {
          inFlight = false;
          if (stopped || succeeded) return;
          setSendState('failed');
          retryTimer = setTimeout(attempt, 6000);
        });
    };

    const onOnline = () => { clearTimeout(retryTimer); attempt(); };
    window.addEventListener('online', onOnline);

    // The backend independently nulls lat/lng out server-side if this
    // preference is off, but there's no reason to prompt for GPS or spend
    // battery on it client-side when the value would just get discarded.
    // Geolocation itself runs on GPS hardware, not the network, so this
    // still resolves — and is worth having for the manual sms: fallback
    // below — even with zero data connection.
    if (navigator.geolocation && (user?.share_location_enabled ?? true)) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; attempt(); },
        () => attempt(),
        { timeout: 3000 }
      );
    } else {
      attempt();
    }

    // Falls back to the last-synced contact list (cached whenever AppShell
    // last fetched it while online) so the manual fallback below still has
    // someone to text even when this call itself can't reach the backend.
    api.listContacts()
      .then((list) => { setContacts(list); cacheContacts(list); })
      .catch(() => setContacts(getCachedContacts()));

    return () => { stopped = true; clearTimeout(retryTimer); window.removeEventListener('online', onOnline); };
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
    let latestRequestId = 0;
    const poll = () => {
      const requestId = ++latestRequestId;
      api.getActiveSOS()
        .then((event) => {
          // A slower earlier poll resolving after a faster later one
          // would otherwise clobber fresher delivery-status data with
          // stale data — the exact signal this poll exists to show.
          if (!cancelled && requestId === latestRequestId && event?.id === eventId) setAlerts(event.alerts || []);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [phase, eventId]);

  // ?? true matches the backend's own default — only an explicit false (a
  // preference the user actually saved) turns a type off. Read as three
  // primitive booleans, not the whole `user` object, so the capture effect
  // below only restarts (dropping mid-segment recording) when one of
  // these actually changes — not on every AuthContext `user` reference
  // change, which currently only happens once per session but would be a
  // latent trap the moment something like a profile refetch is added.
  const audioEnabled = user?.evidence_audio_enabled ?? true;
  const videoEnabled = user?.evidence_video_enabled ?? true;
  const photoEnabled = user?.evidence_photo_enabled ?? true;

  // Mic/camera are only ever touched here — once the local cancel window
  // (the "counting" phase, see startHold) has actually closed on a real
  // SOS event, never elsewhere in the app. A cancelled/practice trigger
  // never requests a permission prompt or records anything.
  useEffect(() => {
    if (phase !== 'active' || !eventId || isPractice) return;
    let cancelled = false;
    let stop = () => {};
    const enabled = { audio: audioEnabled, video: videoEnabled, photo: photoEnabled };
    startEvidenceCapture(eventId, enabled, (mediaType, status) =>
      setEvidenceStatus((s) => ({ ...s, [mediaType]: status }))
    ).then((fn) => { if (cancelled) fn(); else stop = fn; });
    return () => { cancelled = true; stop(); };
  }, [phase, eventId, isPractice, audioEnabled, videoEnabled, photoEnabled]);

  // Without this, a hold started right as the screen unmounts (e.g. the
  // event auto-resolved and something else navigated away) would still
  // fire later against a stale context — the timer only cleared on
  // mouseup/touchend/mouseleave before, never on unmount.
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  // During the countdown, silencing this is still just aborting a false
  // alarm before anyone's been told anything — no contact alerted yet, no
  // evidence captured, nothing to protect against someone else's hand on
  // the phone. Once an alert has actually fanned out (the 'active' phase,
  // which is the only time resolveSOS is ever called), that's no longer
  // true, so marking safe opens a password prompt instead of firing
  // immediately — see handleMarkSafe.
  const startHold = () => {
    holdTimer.current = setTimeout(() => {
      if (phase === 'counting') {
        if (eventId) api.cancelSOS(eventId).catch(() => {});
        navigate('/app');
      } else {
        setSafeOpen(true);
      }
    }, 900);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const closeSafe = () => { setSafeOpen(false); setPassword(''); setSafeError(''); };

  const handleMarkSafe = () => {
    if (!password) { setSafeError('Enter your password to confirm.'); return; }
    setSafeError('');
    setResolving(true);
    api.resolveSOS(eventId, password)
      .then(() => navigate('/app'))
      .catch((err) => { setSafeError(err.message || 'Could not verify password.'); setResolving(false); });
  };

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Real notification + evidence steps. No fabricated names or fake "done"
  // states — each contact's state comes straight from the backend's
  // per-alert delivery status (polled above), and each evidence row comes
  // straight from evidenceCapture.js reporting what the mic/camera are
  // actually doing, not a client-side guess.
  const steps = [
    {
      key: 'location', icon: MapPin, label: 'Location sent',
      done: sendState === 'sent', failed: sendState === 'failed', live: sendState === 'sending',
      stateLabel: sendState === 'sent' ? 'Sent' : sendState === 'failed' ? 'Not delivered' : 'Sending…',
    },
    ...contacts.map((c) => {
      const state = contactAlertState(alerts, c.id, sendState === 'failed');
      return {
        key: c.id, icon: Users, label: `${c.name} notified`,
        done: state === 'sent' || state === 'delivered' || state === 'simulated', failed: state === 'failed', live: false,
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
    <>
    <div className="sos-screen sos-active">
      <div className="sos-active-top">
        {isPractice ? (
          <span className="sos-live-pill mono"><VitalDot color="green" size={7} /> PRACTICE DRILL</span>
        ) : (
          <span className="sos-live-pill mono"><VitalDot color="red" size={7} /> SOS ACTIVE</span>
        )}
        <span className="sos-timer mono">{mmss(elapsed)}</span>
      </div>

      {isPractice ? (
        <>
          <h1 className="sos-h1 sos-h1-left">This is a practice drill.</h1>
          <p className="sos-p sos-p-left">
            No real alert was sent and nothing was recorded. The checklist below shows exactly who
            would have been notified if this were real.
          </p>
        </>
      ) : (
        <>
          <h1 className="sos-h1 sos-h1-left">Help is on the way.</h1>
          <p className="sos-p sos-p-left">
            {contacts.length
              ? "Your trusted contacts have your live location and can hear what's happening around you."
              : "You don't have any trusted contacts set up, so location is being recorded but no one else is being alerted."}
          </p>
        </>
      )}

      {sendState === 'failed' && (
        <div className="sos-offline-banner" role="alert">
          <p className="sos-offline-title">
            <WifiOff size={15} strokeWidth={2.2} /> Couldn't reach Safetee — retrying automatically
          </p>
          <p className="sos-offline-body">
            Your alert hasn't gone out yet. While it keeps retrying, text your contacts directly right now —
            this works over your carrier's SMS, not the internet:
          </p>
          {contacts.length === 0 ? (
            <p className="sos-offline-body">No trusted contacts saved on this device to text.</p>
          ) : (
            <div className="sos-offline-contacts">
              {contacts.map((c) => (
                <a
                  key={c.id}
                  className="sos-offline-contact"
                  href={smsHref(
                    c.phone,
                    coordsRef.current.lat != null
                      ? `SOS — I need help and couldn't reach Safetee to alert you automatically. Please call me or send help. My last known location: https://maps.google.com/?q=${coordsRef.current.lat},${coordsRef.current.lng}`
                      : "SOS — I need help and couldn't reach Safetee to alert you automatically. Please call me or send help."
                  )}
                >
                  <MessageCircle size={14} strokeWidth={2.2} /> Text {c.name}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

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

    <Modal open={safeOpen} onClose={closeSafe} title="Mark yourself safe?" width={420}>
      <p className="confirm-body">
        This stops the alert and evidence capture for everyone tracking it. Enter your password to confirm
        it's really you.
      </p>
      <PasswordInput
        value={password}
        onChange={(e) => { setPassword(e.target.value); setSafeError(''); }}
        placeholder="Enter your password to confirm"
        autoComplete="current-password"
      />
      {safeError && <p className="sos-error" role="alert">{safeError}</p>}
      <div className="confirm-actions">
        <Button variant="ghost" onClick={closeSafe} disabled={resolving}>Keep alert active</Button>
        <Button variant="danger" disabled={resolving} onClick={handleMarkSafe}>
          {resolving ? 'Verifying…' : "I'm safe"}
        </Button>
      </div>
    </Modal>
    </>
  );
}
