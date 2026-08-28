import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, EmptyState, ErrorState } from '../components/ui';
import { api } from '../lib/api';
import { connectLocationShare } from '../lib/locationSharing';
import './tracking.css';

// maplibre-gl is a heavy dependency — only worth loading for someone
// actually viewing this screen, not bundled into every page load.
const MultiPersonMap = lazy(() => import('../components/MultiPersonMap'));

const POLL_MS = 15_000;

// Everyone currently sharing their location with you, together on one
// map, instead of opening each person's share one at a time (the
// pre-existing per-person /track/location/:shareId view still exists for
// that). Mirrors ShareLocation.jsx's own "open/close a websocket per
// active share as the list changes" pattern, just for the viewer side.
export default function TeamMap() {
  const [shares, setShares] = useState(null);
  const [error, setError] = useState('');
  const [frames, setFrames] = useState({}); // shareId -> {position, updatedAt}
  const connectionsRef = useRef(new Map()); // shareId -> connection

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getViewingShares()
        .then((list) => { if (!cancelled) { setShares(list); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message || 'Could not load shared locations.'); });
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!shares) return;
    const activeIds = new Set(shares.map((s) => s.id));
    for (const [id, conn] of connectionsRef.current) {
      if (!activeIds.has(id)) {
        conn.close();
        connectionsRef.current.delete(id);
        setFrames((f) => { const next = { ...f }; delete next[id]; return next; });
      }
    }
    for (const share of shares) {
      if (!connectionsRef.current.has(share.id)) {
        connectionsRef.current.set(
          share.id,
          connectLocationShare(share.id, {
            onFrame: (frame) => {
              setFrames((f) => ({ ...f, [share.id]: { position: { lat: frame.lat, lng: frame.lng }, updatedAt: Date.now() } }));
            },
          })
        );
      }
    }
  }, [shares]);

  useEffect(() => () => {
    connectionsRef.current.forEach((conn) => conn.close());
    connectionsRef.current.clear();
  }, []);

  const people = (shares || []).map((s) => ({
    id: s.id,
    name: s.owner_name,
    position: frames[s.id]?.position || null,
    updatedAt: frames[s.id]?.updatedAt || null,
  }));

  return (
    <div className="tk-wrap">
      <TopBar title="Team map" subtitle="Everyone currently sharing their location with you" />
      {error && <ErrorState message={error} />}
      {shares?.length === 0 && !error && (
        <EmptyState icon={Users} title="Nobody's sharing yet" message="When someone shares their location with you, they'll show up here together on one map." />
      )}
      {shares?.length > 0 && (
        <div className="tk-map" style={{ height: 'calc(100dvh - 140px)' }}>
          <Suspense fallback={null}>
            <MultiPersonMap people={people} />
          </Suspense>
        </div>
      )}
      {shares === null && !error && <Card className="hs-card">Loading…</Card>}
    </div>
  );
}
