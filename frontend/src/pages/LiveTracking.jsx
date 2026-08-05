import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BatteryMedium, LocateFixed, CheckCircle2, XCircle } from 'lucide-react';
import { VitalDot } from '../components/VitalRing';
import { Card, Button, Pill } from '../components/ui';
import { api } from '../lib/api';
import { joinNames } from '../lib/time';
import './tracking.css';

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
  const [lastCheckin, setLastCheckin] = useState(null); // 'ok' | 'error' | null
  const [checkinAgo, setCheckinAgo] = useState(0);
  const [battery, setBattery] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => setBattery(Math.round(b.level * 100))).catch(() => setBattery(null));
    }
  }, []);

  const getPosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { timeout: 5000 }
      );
    });

  // Sends a live check-in every 30s while this screen is mounted — this is
  // what lets the backend's auto-escalation sweep tell "still moving,
  // running late" apart from "went silent." Runs for the demo/mock journey
  // too, so the trust-signal UI (last check-in status) still has something
  // to show, but only actually calls the API for a real journey id.
  useEffect(() => {
    let cancelled = false;

    const checkin = async () => {
      const coords = await getPosition();
      if (cancelled) return;
      if (coords) setAccuracy(Math.round(coords.accuracy));
      if (!isRealJourney) {
        setLastCheckin(coords ? 'ok' : 'error');
        setCheckinAgo(0);
        return;
      }
      try {
        await api.checkinJourney(journeyId, {
          lat: coords?.latitude ?? 6.5244,
          lng: coords?.longitude ?? 3.3792,
          accuracy_m: coords?.accuracy ?? null,
        });
        if (!cancelled) { setLastCheckin('ok'); setCheckinAgo(0); }
      } catch {
        if (!cancelled) setLastCheckin('error');
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
        <div className="tk-map-grid" />
        <div className="tk-map-route" />
        <div className="tk-map-pin tk-map-pin-start" />
        <div className="tk-map-pin tk-map-pin-end" />
        <div className="tk-map-me">
          <VitalDot color="blue" size={14} />
        </div>
        <div className="tk-map-topbar">
          <Pill tone="good">Journey active</Pill>
          <button className="tk-close mono" onClick={() => navigate('/app')}>Minimize</button>
        </div>
      </div>

      <div className="tk-sheet">
        <div className="tk-eta">
          <span className="section-label">Arriving at {journey?.destination_label || 'your destination'} in</span>
          <span className="tk-eta-time mono">{mm}:{ss}</span>
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
            {lastCheckin === 'error' && 'Check-in delayed — retrying'}
          </span>
        </div>

        <Card className="tk-note">
          <p>
            {notifyContacts === null && 'Checking who\'s been notified…'}
            {notifyContacts?.length > 0 &&
              `${joinNames(notifyContacts.map((c) => c.name))} ${notifyContacts.length === 1 ? 'is' : 'are'} receiving live updates on your location every 30 seconds.`}
            {notifyContacts?.length === 0 &&
              "No one is being notified on this journey — add a trusted contact next time to share live updates."}
          </p>
        </Card>

        <Button full size="lg" icon={<CheckCircle2 size={18} />} onClick={handleArrived}>
          I've arrived safely
        </Button>
        <button className="tk-cancel" onClick={handleCancel} disabled={cancelling}>
          <XCircle size={15} strokeWidth={2.2} /> {cancelling ? 'Cancelling…' : 'Cancel journey'}
        </button>
        <button className="tk-sos" onClick={() => navigate('/app/sos')}>Something's wrong — send SOS</button>
      </div>
    </div>
  );
}
