import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BatteryMedium, LocateFixed, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { VitalDot } from '../components/VitalRing';
import { Card, Button, Pill, ConfirmDialog } from '../components/ui';
import { api } from '../lib/api';
import { connectJourneyTracking } from '../lib/journeyTracking';
import { joinNames } from '../lib/time';
import './tracking.css';

// maplibre-gl is a heavy dependency (~1MB) — only worth loading for
// someone actually on this screen, not bundled into every page load.
const LiveMap = lazy(() => import('../components/LiveMap'));

const CHECKIN_INTERVAL_MS = 30_000;

export default function LiveTracking() {
  const navigate = useNavigate();
  const { journeyId } = useParams();
  const { state } = useLocation();
  const isRealJourney = journeyId && journeyId !== 'demo';

  // Navigation state is the fast path (no refetch needed right after
  // starting a journey) but it's gone on a page refresh — falling back to
  // it alone meant a refresh would silently claim nobody was notified
  // even when they genuinely were. Real state, refetched from the
  // backend whenever the fast path isn't available.
  const [journey, setJourney] = useState(state?.journey || null);
  const [notifyContacts, setNotifyContacts] = useState(state?.notifyContacts || null); // null = still resolving

  useEffect(() => {
    if (!isRealJourney || (journey && notifyContacts !== null)) return;
    Promise.all([api.getJourney(journeyId), api.listContacts()])
      .then(([j, contacts]) => {
        setJourney(j);
        const ids = new Set(j.notify_contact_ids || []);
        setNotifyContacts(contacts.filter((c) => ids.has(c.id)));
      })
      .catch(() => setNotifyContacts([]));
  }, [journeyId, isRealJourney]);

  const [seconds, setSeconds] = useState((state?.journey?.expected_minutes || 30) * 60);
  // Captured once, from the very first render — the ring below shows time
  // remaining as a fraction of the original countdown, not of whatever
  // `seconds` happens to be on a given re-render.
  const totalSeconds = useRef(seconds).current || 1;
  const [lastCheckin, setLastCheckin] = useState(null); // 'ok' | 'error' | null
  const [checkinAgo, setCheckinAgo] = useState(0);
  const [battery, setBattery] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => setBattery(Math.round(b.level * 100))).catch(() => setBattery(null));
    }
  }, []);

  // A single continuous GPS watch for the lifetime of this screen, rather
  // than a fresh getCurrentPosition cold-start on every 30s check-in.
  // enableHighAccuracy only *requests* GPS — if a real fix hasn't locked
  // on within the timeout (common indoors, or on a cold start), the
  // browser silently falls back to coarse network/cell-tower positioning
  // instead, no error raised. Restarting acquisition from scratch every
  // 30s with a 5s timeout rarely gave GPS the time it needs to lock on at
  // all, which is what produced accuracy readings in the tens of
  // kilometers for the contact watching this journey. Letting the chip
  // stay warm across the whole journey gives it a real chance to refine.
  const latestFixRef = useRef(null);
  // Resolved once by the watch's first callback — see getPosition below
  // for why the very first check-in needs this instead of reading
  // latestFixRef directly.
  const firstFixResolveRef = useRef(null);
  const firstFixPromiseRef = useRef(new Promise((resolve) => { firstFixResolveRef.current = resolve; }));

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latestFixRef.current = pos.coords;
        firstFixResolveRef.current?.(pos.coords);
        firstFixResolveRef.current = null;
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // A fresh watchPosition's first callback is always asynchronous, even
  // with maximumAge set — so checkin() firing immediately at mount would
  // otherwise always read a still-null latestFixRef on its very first
  // call, silently writing the hardcoded Lagos fallback as the journey's
  // real starting point (and skipping the websocket publish entirely
  // for that tick). Waits briefly for the watch's first fix instead;
  // every call after the first one already has latestFixRef populated
  // and returns immediately, unaffected.
  const getPosition = async () => {
    if (latestFixRef.current) return latestFixRef.current;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
    return Promise.race([firstFixPromiseRef.current, timeout]);
  };

  // The websocket is what actually makes a notified contact's share link
  // show live movement — the HTTP check-in below (already existed) only
  // ever updated last_checkin_at for the overdue-journey sweep, nothing
  // ever streamed a real-time position to anyone watching. Owner-only:
  // opens once the journey is real, publishes alongside each check-in.
  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState(null);
  useEffect(() => {
    if (!isRealJourney) return;
    const conn = connectJourneyTracking(journeyId, { onStatus: setWsStatus });
    wsRef.current = conn;
    return () => { wsRef.current = null; conn.close(); };
  }, [journeyId, isRealJourney]);

  // Sends a live check-in every 30s while this screen is mounted — this is
  // what lets the backend's auto-escalation sweep tell "still moving,
  // running late" apart from "went silent." Runs for the demo/mock journey
  // too, so the trust-signal UI (last check-in status) still has something
  // to show, but only actually calls the API for a real journey id.
  useEffect(() => {
    let cancelled = false;
    let latestRequestId = 0;

    const checkin = async () => {
      // Every scheduled check-in still actually sends its ping to the
      // server unconditionally (each is a real, distinct check-in, not a
      // redundant poll) — requestId only guards which one's result is
      // allowed to update the displayed "last check-in" state, so a slow
      // earlier call resolving after a faster later one can't show stale
      // freshness info.
      const requestId = ++latestRequestId;
      const isLatest = () => !cancelled && requestId === latestRequestId;

      const coords = await getPosition();
      if (cancelled) return;
      if (coords && isLatest()) setAccuracy(Math.round(coords.accuracy));
      if (coords) {
        wsRef.current?.publish({ lat: coords.latitude, lng: coords.longitude, accuracy_m: coords.accuracy });
      }
      if (!isRealJourney) {
        if (isLatest()) { setLastCheckin(coords ? 'ok' : 'error'); setCheckinAgo(0); }
        return;
      }
      try {
        await api.checkinJourney(journeyId, {
          lat: coords?.latitude ?? 6.5244,
          lng: coords?.longitude ?? 3.3792,
          accuracy_m: coords?.accuracy ?? null,
        });
        if (isLatest()) { setLastCheckin('ok'); setCheckinAgo(0); }
      } catch {
        if (isLatest()) setLastCheckin('error');
      }
    };

    checkin();
    const interval = setInterval(checkin, CHECKIN_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [journeyId, isRealJourney]);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
      setCheckinAgo((a) => a + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleArrived = async () => {
    if (isRealJourney) {
      try { await api.markArrived(journeyId); } catch { /* still navigate */ }
    }
    navigate('/app');
  };

  const handleCancel = async () => {
    setCancelling(true);
    if (isRealJourney) {
      try { await api.cancelJourney(journeyId); } catch { /* still navigate */ }
    }
    navigate('/app');
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="tk-wrap">
      <div className="tk-map">
        <Suspense fallback={<div className="tk-map-loading" />}>
          <LiveMap
            destination={
              journey?.destination_lat && journey?.destination_lng
                ? { lat: journey.destination_lat, lng: journey.destination_lng, label: journey.destination_label }
                : null
            }
          />
        </Suspense>
        <div className="tk-map-topbar">
          <Pill tone="good">Journey active</Pill>
          <button className="tk-close mono" onClick={() => navigate('/app')}>Minimize</button>
        </div>
      </div>

      <div className="tk-sheet">
        <div className="tk-eta">
          <div className="tk-ring">
            <svg viewBox="0 0 100 100" className="tk-ring-svg">
              <circle cx="50" cy="50" r="45" className="tk-ring-track" />
              <circle
                cx="50" cy="50" r="45" className="tk-ring-progress"
                style={{ strokeDashoffset: 283 * (1 - seconds / totalSeconds) }}
              />
            </svg>
            <div className="tk-ring-core">
              <ShieldCheck size={22} strokeWidth={2} className="tk-ring-icon" />
              <span className="tk-ring-label">Journey Active</span>
              <span className="tk-eta-time mono">{mm}:{ss}</span>
            </div>
          </div>
          <span className="section-label">Arriving at {journey?.destination_label || 'your destination'} in</span>
        </div>

        <div className="tk-stats">
          <div className="tk-stat"><LocateFixed size={15} strokeWidth={2.2} color="var(--green)" /><span>{accuracy != null ? `±${accuracy}m accuracy` : 'Locating…'}</span></div>
          <div className="tk-stat"><BatteryMedium size={15} strokeWidth={2.2} color="var(--green)" /><span>{battery != null ? `${battery}%` : '—'}</span></div>
        </div>

        <div className="tk-checkin">
          <VitalDot color={lastCheckin === 'error' ? 'amber' : 'green'} size={7} active={lastCheckin !== null} />
          <span>
            {lastCheckin === null && 'Sending first check-in…'}
            {lastCheckin === 'ok' && `Last check-in ${checkinAgo}s ago`}
            {lastCheckin === 'error' && 'Check-in delayed, retrying'}
          </span>
        </div>

        <Card className="tk-note">
          <p>
            {notifyContacts === null && 'Checking who\'s been notified…'}
            {notifyContacts?.length > 0 &&
              `${joinNames(notifyContacts.map((c) => c.name))} ${notifyContacts.length === 1 ? 'is' : 'are'} receiving live updates on your location every 30 seconds.`}
            {notifyContacts?.length === 0 &&
              "No one is being notified on this journey. Add a trusted contact next time to share live updates."}
          </p>
          {notifyContacts?.length > 0 && wsStatus === 'reconnecting' && (
            <p className="tk-note-warn">Reconnecting live updates. Contacts may see a brief gap.</p>
          )}
        </Card>

        <Button full size="lg" icon={<CheckCircle2 size={18} />} onClick={handleArrived}>
          I've arrived safely
        </Button>
        <button className="tk-cancel" onClick={() => setShowCancelConfirm(true)} disabled={cancelling}>
          <XCircle size={15} strokeWidth={2.2} /> {cancelling ? 'Cancelling…' : 'Cancel journey'}
        </button>
        <button className="tk-sos" onClick={() => navigate('/app/sos')}>Something's wrong, send SOS</button>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel this journey?"
        body={`Trusted contacts ${notifyContacts?.length ? 'currently receiving live updates ' : ''}will stop being notified, and check-ins will end.`}
        confirmLabel="Cancel journey"
        tone="danger"
        busy={cancelling}
      />
    </div>
  );
}
