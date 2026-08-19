import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Button, Pill } from '../components/ui';
import { VitalDot } from '../components/VitalRing';
import { connectJourneyTracking } from '../lib/journeyTracking';
import { timeAgo } from '../lib/time';
import './tracking.css';
import './history.css';
import './network.css';

// The contact-facing half of journey tracking — reached via the SMS link
// sent when a journey starts (see POST /journeys). No account required:
// authorizes purely via the share_token in the URL, same as the
// websocket itself checks — there's no separate REST status endpoint for
// a non-account viewer, so this page's state is driven entirely by the
// connection's own status/frames. No embedded map library exists
// anywhere in this app, so real numbers are shown honestly rather than
// faking a map — same approach as LocationShareView.jsx.
export default function JourneyShareView() {
  const { journeyId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [wsStatus, setWsStatus] = useState('connecting');
  const [frame, setFrame] = useState(null);
  const [frameAt, setFrameAt] = useState(null);
  const [, setTick] = useState(0); // forces a re-render each second so timeAgo stays live
  const connRef = useRef(null);

  useEffect(() => {
    const conn = connectJourneyTracking(journeyId, {
      token,
      onFrame: (f) => { setFrame(f); setFrameAt(Date.now()); },
      onStatus: setWsStatus,
    });
    connRef.current = conn;
    return () => conn.close();
  }, [journeyId, token]);

  useEffect(() => {
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const mapsLink = frame ? `https://maps.google.com/?q=${frame.lat},${frame.lng}` : null;

  return (
    <div className="tk-wrap">
      <TopBar title="Live journey" subtitle="Shared with you as a trusted contact" />
      <div className="hs-list">
        {wsStatus === 'ended' && (
          <Card className="hs-card net-empty">
            This journey is no longer being tracked — it may have ended, or this link has expired.
          </Card>
        )}
        {wsStatus !== 'ended' && (
          <Card className="hs-card net-duration-card">
            <div className="hs-row">
              <Pill tone="good"><VitalDot color="green" size={7} /> LIVE</Pill>
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
            ) : (
              <p>Connecting…</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
