import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, IconTile, EmptyState, ErrorState, SkeletonRow } from '../components/ui';
import { api } from '../lib/api';
import './history.css';

const REFRESH_MS = 20_000;

const STATUS_META = {
  pending: { label: 'Alert triggered', tone: 'bad' },
  active: { label: 'Alert active', tone: 'bad' },
  resolved: { label: 'Marked safe', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const TRIGGER_LABEL = { button: 'SOS button', power_button: 'Power button', gesture: 'Secret gesture', fake_pin: 'Fake PIN' };

function fmt(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// The in-app counterpart to the SMS alert — for trusted contacts who also
// use Safetee, so they don't have to depend on the SMS link arriving (or
// still being unexpired) to check on someone. See GET /sos/incoming.
export default function IncomingAlerts() {
  const [alerts, setAlerts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const latestRequestId = useRef(0);
  const cancelledRef = useRef(false);

  // A slower earlier poll resolving after a faster later one would
  // otherwise clobber fresher data with stale data — requestId guards
  // against that. Exposed via useCallback (not just effect-local) so the
  // ErrorState's manual "Try again" button can trigger the same
  // well-guarded load.
  const load = useCallback(() => {
    const requestId = ++latestRequestId.current;
    api.getIncomingAlerts()
      .then((data) => {
        if (!cancelledRef.current && requestId === latestRequestId.current) { setAlerts(data); setLoadError(false); }
      })
      .catch(() => {
        if (!cancelledRef.current && requestId === latestRequestId.current) setLoadError(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelledRef.current = true; clearInterval(interval); };
  }, [load]);

  return (
    <>
      <TopBar title="Alerts" back={false} subtitle="Emergencies from people who trust you as a contact" />
      <div className="hs-list">
        {alerts === null && !loadError && (
          <>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
          </>
        )}
        {loadError && <ErrorState message="Couldn't load your alerts right now." onRetry={load} />}
        {alerts !== null && alerts.length === 0 && !loadError && (
          <EmptyState
            icon={ShieldAlert}
            title="Nothing here"
            message="If someone who has you listed as a trusted contact triggers an SOS, it'll show up here — as well as by text message."
          />
        )}
        {alerts?.map((a) => {
          const meta = STATUS_META[a.status] || { label: a.status, tone: 'neutral' };
          const mapsLink = a.origin_lat != null && a.origin_lng != null
            ? `https://maps.google.com/?q=${a.origin_lat},${a.origin_lng}`
            : null;
          return (
            <Card key={a.id} className="hs-card">
              <div className="hs-row">
                <IconTile icon={ShieldAlert} tone={meta.tone} size={32} />
                <span className="hs-text">
                  <strong>{a.alerter_name}</strong>
                  <span>Triggered via {TRIGGER_LABEL[a.trigger] || a.trigger}</span>
                  <span className="hs-date mono">{fmt(a.created_at)}</span>
                </span>
                <Pill tone={meta.tone}>{meta.label}</Pill>
              </div>
              {mapsLink && (
                <p className="hs-detail">
                  <a href={mapsLink} target="_blank" rel="noreferrer">View last known location</a>
                </p>
              )}
              <Link className="hs-evidence-link" to={`/track/${a.id}/evidence`}>View evidence</Link>
            </Card>
          );
        })}
      </div>
      <BottomNav />
    </>
  );
}
