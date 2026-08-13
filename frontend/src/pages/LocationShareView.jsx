import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, ExternalLink } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Button, Pill, EmptyState, ErrorState } from '../components/ui';
import { VitalDot } from '../components/VitalRing';
import { api } from '../lib/api';
import { connectLocationShare } from '../lib/locationSharing';
import { timeLeft, timeAgo } from '../lib/time';
import './tracking.css';
import './history.css';
import './network.css';

const POLL_MS = 15_000;

const EMPTY_STATE_META = {
  pending: (ownerName) => ({ title: 'Not shared yet', message: `${ownerName} hasn't responded to this yet.` }),
  declined: (ownerName) => ({ title: 'Request declined', message: `${ownerName} chose not to share their location.` }),
  stopped: (ownerName) => ({ title: 'Sharing ended', message: `${ownerName} stopped sharing their location.` }),
  expired: () => ({ title: 'Share expired', message: 'This live location session has ended.' }),
};

// The viewer side of a location share — reused for both an accepted
// request and a self-initiated "share at will" (same underlying
// LocationShare either way, see the backend model). No embedded map
// library exists anywhere in this app (LiveTracking.jsx's "map" is
// decorative CSS, not real geography), so this shows the real numbers
// honestly — last known coordinates, accuracy, staleness — plus a link
// out to Google Maps, rather than faking a live map view.
export default function LocationShareView() {
  const { shareId } = useParams();
  const [share, setShare] = useState(null);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(null); // last {lat, lng, accuracy_m}
  const [frameAt, setFrameAt] = useState(null);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [, setTick] = useState(0); // forces a re-render each second so timeLeft/timeAgo stay live
  const connRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getShare(shareId)
        .then((data) => { if (!cancelled) { setShare(data); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this share.'); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [shareId]);

  const isLive = share?.status === 'active' && new Date(share.expires_at) > new Date();

  useEffect(() => {
    if (!isLive) return;
    const conn = connectLocationShare(shareId, {
      onFrame: (f) => { setFrame(f); setFrameAt(Date.now()); },
      onStatus: setWsStatus,
    });
    connRef.current = conn;
    return () => conn.close();
  }, [shareId, isLive]);

  useEffect(() => {
    if (!isLive) return;
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tick);
  }, [isLive]);

  const emptyKey = share && !isLive
    ? (share.status === 'active' ? 'expired' : share.status)
    : null;
  const emptyMeta = emptyKey ? EMPTY_STATE_META[emptyKey]?.(share.owner_name) : null;

  const mapsLink = frame ? `https://maps.google.com/?q=${frame.lat},${frame.lng}` : null;

  return (
    <div className="tk-wrap">
      <TopBar title="Live location" subtitle={share ? `${share.owner_name}'s location` : undefined} />
      <div className="hs-list">
        {!share && !error && <Card className="hs-card">Loading…</Card>}
        {error && <ErrorState message={error} />}
        {emptyMeta && <EmptyState icon={MapPin} title={emptyMeta.title} message={emptyMeta.message} />}

        {isLive && (
          <Card className="hs-card net-duration-card">
            <div className="hs-row">
              <Pill tone="good"><VitalDot color="green" size={7} /> LIVE</Pill>
              <span className="hs-date mono">{timeLeft(share.expires_at)}</span>
            </div>
            {frame ? (
              <>
                <p>Last update {timeAgo(new Date(frameAt).toISOString())} · ±{Math.round(frame.accuracy_m || 0)}m accuracy</p>
                <Button icon={<ExternalLink size={15} />} onClick={() => window.open(mapsLink, '_blank', 'noopener')}>
                  Open in Google Maps
                </Button>
              </>
            ) : wsStatus === 'reconnecting' ? (
              <p>Reconnecting… the server may be waking up after being idle, this can take up to a minute.</p>
            ) : wsStatus === 'connecting' ? (
              <p>Connecting…</p>
            ) : (
              <p>Waiting for {share.owner_name} to send their first location update…</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
