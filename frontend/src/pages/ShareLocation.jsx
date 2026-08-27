import { useEffect, useRef, useState } from 'react';
import { MapPin, Users, X } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, IconTile, Button, DurationPicker, EmptyState, SectionLabel, SkeletonRow } from '../components/ui';
import { api } from '../lib/api';
import { connectLocationShare } from '../lib/locationSharing';
import { timeLeft } from '../lib/time';
import './history.css';
import './network.css';

const REFRESH_MS = 15_000;
const BROADCAST_INTERVAL_MS = 15_000;

// "Share at will" — the self-initiated half of the location feature (see
// IncomingAlerts.jsx for the request/accept half). Mirrors
// LiveTracking.jsx's "only sends updates while this screen is mounted"
// pattern for journeys — closing this page stops broadcasting, same
// tradeoff, same reason (keeping continuous location updates working in
// the background with the app fully closed needs native OS support this
// PWA doesn't have).
export default function ShareLocation() {
  const [contacts, setContacts] = useState(null);
  const [activeShares, setActiveShares] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [duration, setDuration] = useState(30);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [wsStatuses, setWsStatuses] = useState({}); // shareId -> 'connecting'|'connected'|'reconnecting'|'ended'
  const [geoError, setGeoError] = useState(false);

  const connectionsRef = useRef(new Map()); // shareId -> {publish, close}

  const loadActiveShares = () => api.getActiveShares().then(setActiveShares).catch(() => {});

  useEffect(() => {
    api.listContacts().then((list) => setContacts(list.filter((c) => c.is_app_user))).catch(() => setContacts([]));
    loadActiveShares();
    // Catches a share going live from an accepted request elsewhere, or
    // one expiring, without needing a manual refresh.
    const interval = setInterval(loadActiveShares, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Opens/closes a websocket per active share as the list changes.
  useEffect(() => {
    const activeIds = new Set(activeShares.map((s) => s.id));
    for (const [id, conn] of connectionsRef.current) {
      if (!activeIds.has(id)) { conn.close(); connectionsRef.current.delete(id); }
    }
    for (const share of activeShares) {
      if (!connectionsRef.current.has(share.id)) {
        connectionsRef.current.set(
          share.id,
          connectLocationShare(share.id, {
            onStatus: (status) => setWsStatuses((s) => ({ ...s, [share.id]: status })),
          })
        );
      }
    }
  }, [activeShares]);

  // One geolocation loop, fanned out to every open connection — cheaper
  // than a separate watch per viewer, and viewers only ever see frames
  // while this page stays open (see the file-level comment above).
  useEffect(() => {
    if (activeShares.length === 0 || !navigator.geolocation) return;
    const publish = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoError(false);
          const frame = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy };
          connectionsRef.current.forEach((conn) => conn.publish(frame));
        },
        () => setGeoError(true),
        // Without enableHighAccuracy, the browser defaults to the
        // cheapest method available (WiFi/cell-tower/IP-based) rather
        // than GPS — indoors especially, that's tens of kilometers off,
        // not the precise position this feature exists to share.
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      );
    };
    publish();
    const interval = setInterval(publish, BROADCAST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeShares.length]);

  useEffect(() => () => {
    connectionsRef.current.forEach((conn) => conn.close());
    connectionsRef.current.clear();
  }, []);

  const startShare = async () => {
    if (!selectedContactId) return;
    setStarting(true);
    setError('');
    try {
      await api.shareLocation(selectedContactId, duration);
      setSelectedContactId(null);
      loadActiveShares();
    } catch (err) {
      setError(err.message || 'Could not start sharing.');
    } finally {
      setStarting(false);
    }
  };

  const stop = (id) => api.stopShare(id).then(loadActiveShares).catch(() => {});

  return (
    <>
      <TopBar title="Share my location" subtitle="Live, time-boxed, and you're always in control" />
      <div className="hs-list">
        {activeShares.length > 0 && (
          <>
            <SectionLabel>Currently sharing</SectionLabel>
            {geoError && (
              <Card className="hs-card net-duration-card">
                <p className="net-error" role="alert">
                  Can't read your location. Check that location access is allowed for this site, then reopen this page.
                </p>
              </Card>
            )}
            {activeShares.map((s) => {
              const wsStatus = wsStatuses[s.id];
              const connLabel = wsStatus === 'reconnecting' ? 'Reconnecting…' : wsStatus === 'connecting' ? 'Connecting…' : null;
              return (
                <Card key={s.id} className="hs-card">
                  <div className="hs-row">
                    <IconTile icon={MapPin} tone="good" size={32} />
                    <span className="hs-text">
                      <strong>{s.viewer_name}</strong>
                      <span>{connLabel || timeLeft(s.expires_at)}</span>
                    </span>
                    <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => stop(s.id)}>Stop</Button>
                  </div>
                </Card>
              );
            })}
          </>
        )}

        <SectionLabel>Share with a contact</SectionLabel>
        {contacts === null && <Card className="hs-card"><SkeletonRow columns={2} /></Card>}
        {contacts?.length === 0 && (
          <EmptyState
            icon={Users}
            title="No eligible contacts yet"
            message="Only trusted contacts who also use Safetee can receive a live location share."
          />
        )}
        {contacts?.map((c) => (
          <Card key={c.id} className="hs-card">
            <button className="hs-row" onClick={() => setSelectedContactId(c.id)}>
              <IconTile icon={Users} tone="brand" size={32} />
              <span className="hs-text"><strong>{c.name}</strong></span>
              {selectedContactId === c.id && <Pill tone="brand">Selected</Pill>}
            </button>
          </Card>
        ))}

        {selectedContactId && (
          <Card className="hs-card net-duration-card">
            <DurationPicker value={duration} onChange={setDuration} />
            {error && <p className="net-error" role="alert">{error}</p>}
            <Button onClick={startShare} disabled={starting}>{starting ? 'Starting…' : 'Start sharing'}</Button>
          </Card>
        )}
      </div>
      <BottomNav />
    </>
  );
}
