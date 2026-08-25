import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, MapPin, Users } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, PersonTile, EmptyState, ErrorState, SkeletonRow, SectionLabel, Button, DurationPicker, KpiCard, useToast } from '../components/ui';
import { api } from '../lib/api';
import { markSeen } from '../lib/seenAlerts';
import { timeLeft } from '../lib/time';
import './history.css';
import './network.css';

const REFRESH_MS = 20_000;
// Faster than REFRESH_MS — this is currently the *only* confirmation a
// requester gets that their location request was accepted, since push
// can silently not be set up (denied permission, never subscribed). A
// tighter poll here is a direct, deliberate trade of a bit more traffic
// for actually noticing the acceptance quickly.
const LOCATION_REFRESH_MS = 8_000;

const STATUS_META = {
  pending: { label: 'Alert triggered', tone: 'bad' },
  active: { label: 'Alert active', tone: 'bad' },
  resolved: { label: 'Marked safe', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const TRIGGER_LABEL = { button: 'SOS button', power_button: 'Power button', gesture: 'Shake to alert', fake_pin: 'Fake PIN' };

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
  // Visiting this page is what clears the nav badge — same distinction as
  // a phone's own inbox between "seen" and "replied to" (the backend's
  // separate, deliberate "Acknowledge" action below, for actually
  // confirming you're aware and responding).
  useEffect(() => { if (alerts) markSeen(alerts.map((a) => a.id)); }, [alerts]);
  const { data: requests, error: requestsError, reload: reloadRequests } = useGuardedPoll(api.getIncomingLocationRequests, LOCATION_REFRESH_MS);
  const { data: viewing, error: viewingError, reload: reloadViewing } = useGuardedPoll(api.getViewingShares, LOCATION_REFRESH_MS);

  const [watchers, setWatchers] = useState(null);
  const [requestedIds, setRequestedIds] = useState(() => new Set());
  useEffect(() => {
    api.getWatchers().then(setWatchers).catch(() => setWatchers([]));
  }, []);

  const [respondingId, setRespondingId] = useState(null); // which request's duration picker is open
  const [duration, setDuration] = useState(30);
  const [busyId, setBusyId] = useState(null);
  const [ackingId, setAckingId] = useState(null);
  const toast = useToast();

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

  const acknowledge = (id) => {
    setAckingId(id);
    api.acknowledgeAlert(id)
      .then(reloadAlerts)
      // A failed acknowledge used to fail completely silently — the button
      // just went back to normal with nothing to show for it, which reads
      // exactly like "I clicked Acknowledge and it did nothing" even
      // though a real error (expired session, dropped connection) is what
      // actually happened. Surfacing it means a genuine failure is now
      // visible and retryable instead of indistinguishable from a bug.
      .catch((err) => toast(err.message || "Couldn't acknowledge that alert. Try again.", { tone: 'bad' }))
      .finally(() => setAckingId(null));
  };

  // Real counts only — same "no fabricated states" rule as everywhere else
  // in the app. null while a list hasn't loaded yet reads as 0 here, which
  // is fine: the KPI tiles below already show their own skeleton via
  // ProgressDots-less loading (SkeletonRow covers each list section).
  const activeAlertsCount = (alerts || []).filter((a) => a.status === 'pending' || a.status === 'active').length;
  const pendingRequestsCount = (requests || []).length;
  const watchersCount = (watchers || []).length;
  const heroLine = activeAlertsCount > 0
    ? `${activeAlertsCount} active alert${activeAlertsCount > 1 ? 's' : ''} — check evidence and respond below.`
    : pendingRequestsCount > 0
      ? `${pendingRequestsCount} location request${pendingRequestsCount > 1 ? 's' : ''} waiting on your response.`
      : "Everything's quiet — you'll see alerts and requests here the moment they come in.";

  return (
    <>
      <TopBar title="Network" back={false} subtitle="Alerts, location requests, and people who trust you" />
      <div className="hs-list">
      <div className="net-hero">
        <div className="net-hero-glow" />
        <div className="net-hero-top">
          <span className="net-eyebrow"><ShieldAlert size={13} strokeWidth={2.4} /> YOUR NETWORK</span>
        </div>
        <p className="net-hero-line">{heroLine}</p>
        <div className="net-hero-kpis">
          <div className="net-kpi-wrap"><KpiCard icon={ShieldAlert} label="Active alerts" value={activeAlertsCount} tint={activeAlertsCount > 0 ? 'danger' : 'brand'} /></div>
          <div className="net-kpi-wrap"><KpiCard icon={MapPin} label="Requests" value={pendingRequestsCount} tint="info" /></div>
          <div className="net-kpi-wrap"><KpiCard icon={Users} label="Watching you" value={watchersCount} tint="brand" /></div>
        </div>
      </div>
      <div className="net-columns">
      <div className="net-col">
        <SectionLabel>Location requests</SectionLabel>
        {requests === null && !requestsError && <Card className="hs-card"><SkeletonRow columns={2} /></Card>}
        {requestsError && <ErrorState message="Couldn't load location requests." onRetry={reloadRequests} />}
        {requests?.length === 0 && !requestsError && (
          <Card className="hs-card net-empty">Nobody's asked for your location right now.</Card>
        )}
        {requests?.map((r) => (
          <Card key={r.id} className="hs-card">
            <div className="hs-row">
              <PersonTile icon={MapPin} tone="info" size={32} avatarUrl={r.viewer_avatar_url} name={r.viewer_name} />
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

        <SectionLabel>Shared with you</SectionLabel>
        {viewing === null && !viewingError && <Card className="hs-card"><SkeletonRow columns={2} /></Card>}
        {viewingError && <ErrorState message="Couldn't load shared locations." onRetry={reloadViewing} />}
        {viewing?.length === 0 && !viewingError && (
          <Card className="hs-card net-empty">Nobody's currently sharing their location with you.</Card>
        )}
        {viewing?.map((s) => (
          <Card key={s.id} className="hs-card">
            <Link className="hs-row" to={`/track/location/${s.id}`}>
              <PersonTile icon={MapPin} tone="good" size={32} avatarUrl={s.owner_avatar_url} name={s.owner_name} />
              <span className="hs-text">
                <strong>{s.owner_name}</strong>
                <span>{timeLeft(s.expires_at)}</span>
              </span>
              <Pill tone="good">View live</Pill>
            </Link>
          </Card>
        ))}
      </div>

      <div className="net-col">
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
            message="If someone who has you listed as a trusted contact triggers an SOS, it'll show up here, as well as by text message."
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
                <PersonTile icon={ShieldAlert} tone={meta.tone} size={32} avatarUrl={a.alerter_avatar_url} name={a.alerter_name} />
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
              <div className="net-respond-actions">
                <Link className="hs-evidence-link" to={`/track/${a.id}/evidence`}>View evidence</Link>
                <Button size="sm" variant="ghost" onClick={() => acknowledge(a.id)} disabled={ackingId === a.id}>
                  {ackingId === a.id ? 'Acknowledging…' : 'Acknowledge'}
                </Button>
              </div>
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
                <PersonTile icon={Users} tone="brand" size={32} avatarUrl={w.avatar_url} name={w.full_name} />
                <span className="hs-text"><strong>{w.full_name}</strong></span>
                <Button size="sm" variant={requested ? 'ghost' : 'secondary'} disabled={requested} onClick={() => askForLocation(w.user_id)}>
                  {requested ? 'Requested' : 'Request location'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      </div>
      </div>
      <BottomNav />
    </>
  );
}
