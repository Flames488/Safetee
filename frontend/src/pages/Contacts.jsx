import { useEffect, useState } from 'react';
import { Plus, Phone, MessageCircle, ShieldCheck, GripVertical, X, Trash2 } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, Button } from '../components/ui';
import { api } from '../lib/api';
import './contacts.css';

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

  const removeContact = async (id) => {
    setDeletingId(id);
    try {
      await api.deleteContact(id);
      setContacts((c) => c.filter((x) => x.id !== id));
    } catch {
      // leave the contact in place if the delete didn't actually happen
    } finally {
      setDeletingId(null);
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
        {showAdd && (
          <Card className="ct-form">
            <div className="ct-form-head">
              <span>New trusted contact</span>
              <button onClick={() => { setShowAdd(false); setFormError(''); }} aria-label="Close"><X size={16} /></button>
            </div>
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Relationship (e.g. Sister)"
              value={form.relationship_label}
              onChange={(e) => setForm({ ...form, relationship_label: e.target.value })}
            />
            <input
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

        {contacts === null && <p className="ct-note">Loading your trusted contacts…</p>}

        {contacts !== null && loadError && contacts.length === 0 && (
          <p className="ct-note">Couldn't load your contacts right now — check your connection and reopen this page.</p>
        )}

        {contacts !== null && !loadError && contacts.length === 0 && !showAdd && (
          <Card className="ct-empty">
            <p>You haven't added anyone yet. Trusted contacts are the people notified — in order — the moment you trigger an alert.</p>
            <Button onClick={() => setShowAdd(true)} icon={<Plus size={16} />}>Add your first contact</Button>
          </Card>
        )}

        {contacts?.map((c, i) => (
          <Card key={c.id} className="ct-card">
            <span className="ct-grip"><GripVertical size={15} strokeWidth={2} /></span>
            <div className="ct-avatar mono">{c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
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
              <button
                aria-label={`Remove ${c.name}`}
                className="ct-quick-danger"
                onClick={() => removeContact(c.id)}
                disabled={deletingId === c.id}
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          </Card>
        ))}

        {contacts !== null && contacts.length > 0 && (
          <p className="ct-note">Contacts are notified in priority order — the first person reached confirms your alert.</p>
        )}
      </div>
      <BottomNav />
    </>
  );
}
