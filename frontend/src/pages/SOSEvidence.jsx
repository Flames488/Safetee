import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Mic, Video } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, SectionLabel, EmptyState, ErrorState } from '../components/ui';
import { api, ApiError } from '../lib/api';
import './settings.css';
import './evidence.css';

const REFRESH_MS = 15_000;

// Reachable two ways, matching the backend's own get_evidence auth check:
// the event's owner (normal login, viewed from inside the app) or a
// trusted contact holding a share link (?token=..., no account at all —
// see notify_contacts_of_evidence, which is what mints that link). Not
// wrapped in ProtectedRoute for exactly that reason.
export default function SOSEvidence() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('token');

  const [evidence, setEvidence] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      api.getEvidence(eventId, shareToken)
        .then((data) => {
          if (cancelled) return;
          setEvidence(data);
          setError('');
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 403) {
            setError("You don't have access to this evidence. The link may have expired.");
          } else if (err instanceof ApiError && err.status === 404) {
            setError('This SOS event no longer exists.');
          } else {
            setError('Could not load evidence right now.');
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    };

    load();
    // New chunks land every 15-30s throughout an active SOS (see
    // confirm_evidence) — re-fetching on an interval is what surfaces them,
    // and also mints fresh signed URLs before the previous batch's expire.
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [eventId, shareToken]);

  const hasAudio = evidence?.audio_urls?.length > 0;
  const hasVideo = evidence?.video_urls?.length > 0;
  const hasPhotos = evidence?.photo_urls?.length > 0;
  const hasAnything = hasAudio || hasVideo || hasPhotos;

  return (
    <div className="ev-wrap">
      <TopBar
        title="SOS evidence"
        back
        subtitle={shareToken ? 'Shared with you as a trusted contact' : 'Audio, photo and video captured during this alert'}
      />
      <div className="st-body">
        {loading && !evidence && (
          <Card className="ev-loading"><p>Loading evidence…</p></Card>
        )}

        {error && !loading && (
          <ErrorState title="Can't show this evidence" message={error} />
        )}

        {evidence && !error && !hasAnything && (
          <EmptyState
            icon={ShieldCheck}
            title="No evidence yet"
            message="Nothing has been captured for this alert yet. This page updates automatically as new audio, photo, or video comes in."
          />
        )}

        {hasAudio && (
          <>
            <SectionLabel>Audio</SectionLabel>
            <Card className="st-group">
              {evidence.audio_urls.map((url, i) => (
                <div className="st-row ev-row" key={url}>
                  <span className="st-icon"><Mic size={16} strokeWidth={2.1} /></span>
                  <div className="st-row-text ev-media-col">
                    <strong>Clip {i + 1}</strong>
                    <audio controls src={url} preload="none" />
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}

        {hasVideo && (
          <>
            <SectionLabel>Video</SectionLabel>
            <Card className="st-group">
              {evidence.video_urls.map((url, i) => (
                <div className="st-row ev-row" key={url}>
                  <span className="st-icon"><Video size={16} strokeWidth={2.1} /></span>
                  <div className="st-row-text ev-media-col">
                    <strong>Clip {i + 1}</strong>
                    <video controls src={url} preload="none" />
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}

        {hasPhotos && (
          <>
            <SectionLabel>Photos</SectionLabel>
            <Card className="st-group ev-photos">
              {evidence.photo_urls.map((url, i) => (
                <a className="ev-photo" href={url} target="_blank" rel="noreferrer" key={url}>
                  <img src={url} alt={`Evidence photo ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
