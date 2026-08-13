import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Navigation2, ChevronDown } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, IconTile, EmptyState, ErrorState, SkeletonRow } from '../components/ui';
import { api } from '../lib/api';
import './history.css';

// Mirrors the same status → label mapping Dashboard.jsx uses for the
// "Recent activity" preview, so the two never describe the same event
// differently.
const META = {
  journey: {
    active: { title: 'Journey in progress', tone: 'info' },
    arrived: { title: 'Journey completed safely', tone: 'good' },
    escalated: { title: 'Journey escalated — missed check-in', tone: 'bad' },
    cancelled: { title: 'Journey cancelled', tone: 'neutral' },
  },
  sos: {
    pending: { title: 'SOS alert triggered', tone: 'bad' },
    active: { title: 'SOS alert active', tone: 'bad' },
    resolved: { title: 'SOS alert resolved', tone: 'good' },
    cancelled: { title: 'SOS alert cancelled', tone: 'neutral' },
  },
};

const TRIGGER_LABEL = {
  button: 'SOS button',
  fake_pin: 'fake PIN',
  power_button: 'power button',
  gesture: 'shake to alert',
  journey_timeout: 'missed journey check-in',
};

function fmt(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function History() {
  const [events, setEvents] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(null);

  const load = () => {
    setEvents(null);
    setLoadError(false);
    Promise.all([api.journeyHistory().catch(() => null), api.sosHistory().catch(() => null)])
      .then(([journeys, sos]) => {
        if (journeys === null && sos === null) { setEvents([]); setLoadError(true); return; }
        const merged = [
          ...(journeys || []).map((j) => ({ kind: 'journey', ...j })),
          ...(sos || []).map((s) => ({ kind: 'sos', ...s })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setEvents(merged);
      });
  };
  useEffect(load, []);

  return (
    <>
      <TopBar title="Emergency history" back={false} subtitle="Every alert and journey, kept for your records" />
      <div className="hs-list">
        {events === null && (
          <>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
            <Card className="hs-card"><SkeletonRow columns={3} /></Card>
          </>
        )}
        {loadError && <ErrorState message="Couldn't load your history right now." onRetry={load} />}
        {events !== null && events.length === 0 && !loadError && (
          <EmptyState title="Nothing here yet" message="Your journeys and alerts will show up as you use Safetee." />
        )}
        {events?.map((e) => {
          const meta = META[e.kind][e.status] || { title: e.status, tone: 'neutral' };
          const isOpen = open === e.id;
          return (
            <Card key={e.id} className="hs-card">
              <button className="hs-row" onClick={() => setOpen(isOpen ? null : e.id)}>
                <IconTile icon={e.kind === 'sos' ? ShieldAlert : Navigation2} tone={meta.tone} size={32} />
                <span className="hs-text">
                  <strong>{meta.title}</strong>
                  <span>{e.kind === 'journey' ? e.destination_label : `Triggered via ${TRIGGER_LABEL[e.trigger] || e.trigger}`}</span>
                  <span className="hs-date mono">{fmt(e.created_at)}</span>
                </span>
                <Pill tone={meta.tone}>{e.status}</Pill>
                <ChevronDown size={15} className={`hs-chev ${isOpen ? 'hs-chev-open' : ''}`} />
              </button>
              {isOpen && (
                <p className="hs-detail">
                  {e.kind === 'journey'
                    ? `Expected to arrive within ${e.expected_minutes} min · Expected by ${fmt(e.expected_arrival_at)}`
                    : (
                      <>
                        {e.alerts?.length
                          ? `${e.alerts.length} contact${e.alerts.length === 1 ? '' : 's'} alerted`
                          : 'No contacts alerted yet'}
                        {e.resolved_at ? ` · Resolved ${fmt(e.resolved_at)}` : ''}
                      </>
                    )}
                </p>
              )}
              {isOpen && e.kind === 'sos' && (
                <Link className="hs-evidence-link" to={`/track/${e.id}/evidence`}>View evidence</Link>
              )}
            </Card>
          );
        })}
      </div>
      <BottomNav />
    </>
  );
}
