import { useEffect, useState } from 'react';
import { Plus, Phone, MessageCircle, MapPin, ShieldCheck, X, Trash2, ChevronUp, ChevronDown, Users } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Avatar, Card, Pill, Button, Field, ConfirmDialog, ErrorState, SkeletonRow, useToast } from '../components/ui';
import { api } from '../lib/api';
import './contacts.css';

// Mirrors the backend's _MAX_CONTACTS_PER_USER (contacts.py) — shown as
// a progress count, not enforced client-side (the server is the real gate).
const MAX_CONTACTS = 25;

// Wider than it sounds necessary because last_active_at is only persisted
// roughly every 15 minutes (see deps.py's _LAST_ACTIVE_THROTTLE) — someone
// continuously using the app can still have a stamp up to that long ago,
// and a narrower window here would flicker the dot off on someone who
// never actually left.
const ACTIVE_WITHIN_MS = 20 * 60 * 1000;
function isActiveNow(lastActiveAt) {
  return Boolean(lastActiveAt) && Date.now() - new Date(lastActiveAt).getTime() < ACTIVE_WITHIN_MS;
}

export default function Contacts() {
  // null = still loading. Never a fake/fallback list — an empty array is a
  // real, honest "you have no trusted contacts yet" state.
  const [contacts, setContacts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', relationship_label: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [requestedIds, setRequestedIds] = useState(() => new Set());
  // Requesting someone's location requires *them* to have added you back
  // as their own trusted contact (enforced server-side in
  // POST /locations/requests) — having their number saved here isn't
  // enough on its own. watcherIds is who's actually done that, so the
  // button only shows where a request would actually succeed.
  const [watcherIds, setWatcherIds] = useState(null);
  useEffect(() => {
    api.getWatchers().then((list) => setWatcherIds(new Set(list.map((w) => w.user_id)))).catch(() => setWatcherIds(new Set()));
  }, []);
  const toast = useToast();

  const askForLocation = (contact) => {
    setRequestedIds((s) => new Set(s).add(contact.id));
    api.requestLocation(contact.matched_user_id)
      .then(() => toast(`Location request sent to ${contact.name}.`))
      .catch((err) => {
        setRequestedIds((s) => { const next = new Set(s); next.delete(contact.id); return next; });
        toast(err.message || `Could not request ${contact.name}'s location.`, { tone: 'bad' });
      });
  };

  const load = () => {
    api.listContacts()
      .then(setContacts)
      .catch(() => { setContacts([]); setLoadError(true); });
  };

  useEffect(load, []);

  const addContact = async () => {
    if (!form.name || !form.phone) return;
    setSaving(true);
    setFormError('');
    try {
      const created = await api.addContact({
        name: form.name,
        relationship_label: form.relationship_label || null,
        phone: form.phone,
      });
      // Use exactly what the server persisted (real id, real priority,
      // is_verified: false) rather than guessing the shape locally —
      // that guess is what was drifting from the real contact record.
      setContacts((c) => [...(c || []), created]);
      setForm({ name: '', relationship_label: '', phone: '' });
      setShowAdd(false);
    } catch (err) {
      setFormError(err.message || 'Could not save this contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const moveContact = async (id, direction) => {
    setMovingId(id);
    try {
      setContacts(await api.moveContact(id, direction));
    } catch (err) {
      toast(err.message || 'Could not reorder contacts right now.', { tone: 'bad' });
    } finally {
      setMovingId(null);
    }
  };

  const removeContact = async (id) => {
    setDeletingId(id);
    try {
      await api.deleteContact(id);
      setContacts((c) => c.filter((x) => x.id !== id));
    } catch (err) {
      toast(err.message || 'Could not remove this contact right now.', { tone: 'bad' });
    } finally {
      setDeletingId(null);
      setRemoveTarget(null);
    }
  };

  return (
    <>
      <TopBar
        title="Trusted contacts"
        back={false}
        subtitle={contacts ? `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'} will be alerted` : 'Loading…'}
        action={
          <button className="ct-add" onClick={() => setShowAdd(true)} aria-label="Add contact">
            <Plus size={18} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="ct-list">
        {contacts !== null && contacts.length > 0 && (
          <div className="ct-hero">
            <div className="ct-hero-cluster">
              <span className="ct-hero-center"><Users size={22} strokeWidth={2} /></span>
              {contacts.slice(0, 4).map((c, i) => (
                <span key={c.id} className={`ct-hero-avatar ct-hero-avatar-${i}`}>
                  <Avatar src={c.avatar_url} name={c.name} />
                </span>
              ))}
            </div>
            <p className="ct-hero-label">
              <strong>Your Trusted Contacts</strong> — {contacts.length}/{MAX_CONTACTS} added
            </p>
          </div>
        )}

        {showAdd && (
          <Card className="ct-form">
            <div className="ct-form-head">
              <span>New trusted contact</span>
              <button onClick={() => { setShowAdd(false); setFormError(''); }} aria-label="Close"><X size={16} /></button>
            </div>
            <Field
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Field
              placeholder="Relationship (e.g. Sister)"
              value={form.relationship_label}
              onChange={(e) => setForm({ ...form, relationship_label: e.target.value })}
            />
            <Field
              type="tel"
              autoComplete="off"
              placeholder="Phone number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            {formError && <p className="ct-error" role="alert">{formError}</p>}
            <Button full onClick={addContact} disabled={!form.name || !form.phone || saving}>
              {saving ? 'Saving…' : 'Save contact'}
            </Button>
          </Card>
        )}

        {contacts === null && (
          <Card className="ct-card"><SkeletonRow columns={3} /></Card>
        )}

        {contacts !== null && loadError && contacts.length === 0 && (
          <ErrorState message="Couldn't load your contacts right now." onRetry={load} />
        )}

        {contacts !== null && !loadError && contacts.length === 0 && !showAdd && (
          <Card className="ct-empty">
            <p>You haven't added anyone yet. Trusted contacts are the people notified, in order, the moment you trigger an alert.</p>
            <Button onClick={() => setShowAdd(true)} icon={<Plus size={16} />}>Add your first contact</Button>
          </Card>
        )}

        {contacts?.map((c, i) => (
          <Card key={c.id} className="ct-card">
            {contacts.length > 1 && (
              <div className="ct-reorder">
                <button
                  aria-label={`Move ${c.name} up`}
                  onClick={() => moveContact(c.id, 'up')}
                  disabled={i === 0 || movingId === c.id}
                >
                  <ChevronUp size={14} strokeWidth={2.4} />
                </button>
                <button
                  aria-label={`Move ${c.name} down`}
                  onClick={() => moveContact(c.id, 'down')}
                  disabled={i === contacts.length - 1 || movingId === c.id}
                >
                  <ChevronDown size={14} strokeWidth={2.4} />
                </button>
              </div>
            )}
            <div className="ct-avatar-wrap">
              <div className="ct-avatar mono"><Avatar src={c.avatar_url} name={c.name} /></div>
              {isActiveNow(c.last_active_at) && <span className="ct-active-dot" aria-label={`${c.name} is active now`} />}
            </div>
            <div className="ct-info">
              <div className="ct-name-row">
                <strong>{c.name}</strong>
                {i === 0 && <Pill tone="good">Primary</Pill>}
              </div>
              <span className="ct-role">{c.relationship_label || 'Trusted contact'} · {c.phone}</span>
              <span className={`ct-verify ${c.is_verified ? 'ct-verify-yes' : ''}`}>
                <ShieldCheck size={12} strokeWidth={2.4} />
                {c.is_verified ? 'Verified' : 'Pending verification'}
              </span>
            </div>
            <div className="ct-quick">
              <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}><Phone size={15} strokeWidth={2.2} /></a>
              <a href={`sms:${c.phone}`} aria-label={`Message ${c.name}`}><MessageCircle size={15} strokeWidth={2.2} /></a>
              {c.is_app_user && c.matched_user_id && watcherIds?.has(c.matched_user_id) && (
                <button
                  aria-label={requestedIds.has(c.id) ? `Location requested from ${c.name}` : `Request ${c.name}'s location`}
                  onClick={() => askForLocation(c)}
                  disabled={requestedIds.has(c.id)}
                >
                  <MapPin size={15} strokeWidth={2.2} />
                </button>
              )}
              <button
                aria-label={`Remove ${c.name}`}
                className="ct-quick-danger"
                onClick={() => setRemoveTarget(c)}
                disabled={deletingId === c.id}
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          </Card>
        ))}

        {contacts !== null && contacts.length > 0 && (
          <p className="ct-note">Contacts are notified in priority order. The first person reached confirms your alert.</p>
        )}

        {contacts !== null && contacts.length > 0 && contacts.length < MAX_CONTACTS && !showAdd && (
          <div className="ct-cta-add">
            <Button full icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
              Add Trusted Contact
            </Button>
          </div>
        )}
      </div>
      <BottomNav />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeContact(removeTarget.id)}
        title="Remove this contact?"
        body={removeTarget && `${removeTarget.name} will no longer be notified if you trigger an SOS alert.`}
        confirmLabel="Remove contact"
        tone="danger"
        busy={deletingId === removeTarget?.id}
      />
    </>
  );
}
