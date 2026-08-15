import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Navigation2, ChevronDown, Trash2, Square, SquareCheck } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, IconTile, EmptyState, ErrorState, SkeletonRow, Button, Modal, PasswordInput } from '../components/ui';
import { api } from '../lib/api';
import './history.css';

// Mirrors the backend's own eligibility rule (clear_history in
// backend/app/api/v1/history.py) so selection never offers to remove an
// entry the server is actually going to leave behind.
const SOS_CLEARABLE = new Set(['resolved', 'cancelled']);
const JOURNEY_CLEARABLE = new Set(['arrived', 'escalated', 'cancelled']);
const isClearable = (e) => (e.kind === 'sos' ? SOS_CLEARABLE : JOURNEY_CLEARABLE).has(e.status);

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

  // Selection replaced the old single-tap "clear everything" button — the
  // person deciding what disappears from their own record should be able
  // to pick exactly which entries, not just all-or-nothing.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [clearOpen, setClearOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);

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

  const clearableEvents = events?.filter(isClearable) ?? [];
  const hasClearable = clearableEvents.length > 0;
  const allSelected = hasClearable && clearableEvents.every((e) => selectedIds.has(e.id));

  const startSelecting = () => { setSelecting(true); setSelectedIds(new Set()); };
  const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()); };
  const toggleOne = (id) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(clearableEvents.map((e) => e.id)));
  };

  const closeClear = () => { setClearOpen(false); setPassword(''); setClearError(''); };

  const handleClear = () => {
    if (!password) { setClearError('Enter your password to confirm.'); return; }
    setClearError('');
    setClearing(true);
    const sosIds = events.filter((e) => e.kind === 'sos' && selectedIds.has(e.id)).map((e) => e.id);
    const journeyIds = events.filter((e) => e.kind === 'journey' && selectedIds.has(e.id)).map((e) => e.id);
    api.clearHistory(password, { sosIds, journeyIds })
      .then(() => { closeClear(); stopSelecting(); load(); })
      .catch((err) => { setClearError(err.message || 'Could not clear the selected entries.'); setClearing(false); });
  };

  return (
    <>
      <TopBar
        title="Emergency history"
        back={false}
        subtitle="Every alert and journey, kept for your records"
        action={hasClearable ? (
          selecting ? (
            <Button size="sm" variant="ghost" onClick={stopSelecting}>Cancel</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={startSelecting}>
              <Trash2 size={14} strokeWidth={2.2} /> Select
            </Button>
          )
        ) : undefined}
      />
      {selecting && (
        <div className="hs-select-bar">
          <button className="hs-select-all" onClick={toggleAll}>
            {allSelected ? <SquareCheck size={16} strokeWidth={2.2} /> : <Square size={16} strokeWidth={2.2} />}
            Select all
          </button>
          <Button size="sm" variant="danger" disabled={selectedIds.size === 0} onClick={() => setClearOpen(true)}>
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </Button>
        </div>
      )}
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
          const clearable = isClearable(e);
          const selected = selectedIds.has(e.id);
          return (
            <Card key={e.id} className="hs-card">
              <button
                className="hs-row"
                onClick={() => {
                  if (selecting) { if (clearable) toggleOne(e.id); return; }
                  setOpen(isOpen ? null : e.id);
                }}
              >
                {selecting && (
                  clearable
                    ? (selected ? <SquareCheck size={18} strokeWidth={2.2} className="hs-check" /> : <Square size={18} strokeWidth={2.2} className="hs-check" />)
                    : <span className="hs-check hs-check-spacer" />
                )}
                <IconTile icon={e.kind === 'sos' ? ShieldAlert : Navigation2} tone={meta.tone} size={32} />
                <span className="hs-text">
                  <strong>{meta.title}</strong>
                  <span>{e.kind === 'journey' ? e.destination_label : `Triggered via ${TRIGGER_LABEL[e.trigger] || e.trigger}`}</span>
                  <span className="hs-date mono">{fmt(e.created_at)}</span>
                </span>
                <Pill tone={meta.tone}>{e.status}</Pill>
                {!selecting && <ChevronDown size={15} className={`hs-chev ${isOpen ? 'hs-chev-open' : ''}`} />}
              </button>
              {isOpen && !selecting && (
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
              {isOpen && !selecting && e.kind === 'sos' && (
                <Link className="hs-evidence-link" to={`/track/${e.id}/evidence`}>View evidence</Link>
              )}
            </Card>
          );
        })}
      </div>
      <BottomNav />

      <Modal open={clearOpen} onClose={closeClear} title={`Delete ${selectedIds.size} selected ${selectedIds.size === 1 ? 'entry' : 'entries'}?`} width={420}>
        <p className="confirm-body">
          Anything still active or pending is kept regardless of selection. This can't be undone.
        </p>
        <PasswordInput
          value={password}
          onChange={(e) => { setPassword(e.target.value); setClearError(''); }}
          placeholder="Enter your password to confirm"
          autoComplete="current-password"
        />
        {clearError && <p className="hs-error" role="alert">{clearError}</p>}
        <div className="confirm-actions">
          <Button variant="ghost" onClick={closeClear} disabled={clearing}>Cancel</Button>
          <Button variant="danger" disabled={clearing} onClick={handleClear}>
            {clearing ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
