import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, MapPin, Users } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, IconTile, EmptyState, ErrorState, SkeletonRow, SectionLabel, Button, DurationPicker } from '../components/ui';
import { api } from '../lib/api';
import './history.css';
import './network.css';

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

// Guards a poll loop against a slower earlier response clobbering fresher
// data after a faster later one resolves — same pattern used across
// Dashboard/SOSActive/LiveTracking's own polling.
function useGuardedPoll(fetcher, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const latestRequestId = useRef(0);
  const cancelledRef = useRef(false);

  const load = useCallback(() => {
    const requestId = ++latestRequestId.current;
    fetcher()
      .then((result) => {
        if (!cancelledRef.current && requestId === latestRequestId.current) { setData(result); setError(false); }
      })
      .catch(() => {
        if (!cancelledRef.current && requestId === latestRequestId.current) setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const interval = setInterval(load, intervalMs);
    return () => { cancelledRef.current = true; clearInterval(interval); };
  }, [load, intervalMs]);

  return { data, error, reload: load };
}

// The in-app counterpart to the SMS alert, plus the location
// request/share network — for trusted contacts who also use Safetee, so
// none of this depends on an SMS link arriving or still being unexpired.
export default function IncomingAlerts() {
  const navigate = useNavigate();
  const { data: alerts, error: alertsError, reload: reloadAlerts } = useGuardedPoll(api.getIncomingAlerts, REFRESH_MS);
  const { data: requests, error: requestsError, reload: reloadRequests } = useGuardedPoll(api.getIncomingLocationRequests, REFRESH_MS);

  const [watchers, setWatchers] = useState(null);
  const [requestedIds, setRequestedIds] = useState(() => new Set());
  useEffect(() => {
    api.getWatchers().then(setWatchers).catch(() => setWatchers([]));
  }, []);

  const [respondingId, setRespondingId] = useState(null); // which request's duration picker is open
  const [duration, setDuration] = useState(30);
  const [busyId, setBusyId] = useState(null);

  const askForLocation = (userId) => {
    setRequestedIds((s) => new Set(s).add(userId));
    api.requestLocation(userId).catch(() => {
      setRequestedIds((s) => { const next = new Set(s); next.delete(userId); return next; });
    });
  };

  const decline = (id) => {
    setBusyId(id);
    api.declineLocationRequest(id).then(reloadRequests).finally(() => setBusyId(null));
  };

  const accept = (id) => {
    setBusyId(id);
    api.acceptLocationRequest(id, duration)
      .then(() => navigate('/app/share-location'))
      .catch(() => setBusyId(null));
  };

  return (
    <>
      <TopBar title="Network" back={false} subtitle="Alerts, location requests, and people who trust you" />
      <div className="hs-list">
        <SectionLabel>Location requests</SectionLabel>
        {requests === null && !requestsError && <Card className="hs-card"><SkeletonRow columns={2} /></Card>}
        {requestsError && <ErrorState message="Couldn't load location requests." onRetry={reloadRequests} />}
        {requests?.length === 0 && !requestsError && (
          <Card className="hs-card net-empty">Nobody's asked for your location right now.</Card>
        )}
        {requests?.map((r) => (
          <Card key={r.id} className="hs-card">
            <div className="hs-row">
              <IconTile icon={MapPin} tone="info" size={32} />
              <span className="hs-text">
                <strong>{r.viewer_name}</strong>
                <span>wants to see your location</span>
                <span className="hs-date mono">{fmt(r.created_at)}</span>
              </span>
            </div>
            {respondingId === r.id ? (
              <div className="net-respond">
                <DurationPicker value={duration} onChange={setDuration} />
                <div className="net-respond-actions">
                  <Button size="sm" variant="ghost" onClick={() => setRespondingId(null)} disabled={busyId === r.id}>Cancel</Button>
                  <Button size="sm" onClick={() => accept(r.id)} disabled={busyId === r.id}>
                    {busyId === r.id ? 'Starting…' : 'Start sharing'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="net-respond-actions">
                <Button size="sm" variant="ghost" onClick={() => decline(r.id)} disabled={busyId === r.id}>Decline</Button>
                <Button size="sm" onClick={() => { setRespondingId(r.id); setDuration(30); }} disabled={busyId === r.id}>Accept</Button>
              </div>
            )}
          </Card>
        ))}

        <SectionLabel>Emergency alerts</SectionLabel>
        {alerts === null && !alertsError && (
          <>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
          </>
        )}
        {alertsError && <ErrorState message="Couldn't load your alerts right now." onRetry={reloadAlerts} />}
        {alerts !== null && alerts.length === 0 && !alertsError && (
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

        <SectionLabel>People who trust you</SectionLabel>
        {watchers === null && <Card className="hs-card"><SkeletonRow columns={2} /></Card>}
        {watchers?.length === 0 && (
          <Card className="hs-card net-empty">Nobody who's added you as a trusted contact is on Safetee yet.</Card>
        )}
        {watchers?.map((w) => {
          const requested = requestedIds.has(w.user_id);
          return (
            <Card key={w.user_id} className="hs-card">
              <div className="hs-row">
                <IconTile icon={Users} tone="brand" size={32} />
                <span className="hs-text"><strong>{w.full_name}</strong></span>
                <Button size="sm" variant={requested ? 'ghost' : 'secondary'} disabled={requested} onClick={() => askForLocation(w.user_id)}>
                  {requested ? 'Requested' : 'Request location'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <BottomNav />
    </>
  );
}
