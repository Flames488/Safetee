import { useState } from 'react';
import { Plus, Phone, MessageCircle, ShieldCheck, GripVertical, X } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, Button } from '../components/ui';
import './contacts.css';

const INITIAL = [
  { id: 1, name: 'Amaka Obi', role: 'Sister', phone: '+234 810 000 1234', priority: 'Primary', verified: true },
  { id: 2, name: 'Tunde Bakare', role: 'Best friend', phone: '+234 703 555 0192', priority: 'Secondary', verified: true },
  { id: 3, name: 'Dr. Ifeoma Eze', role: 'Family doctor', phone: '+234 802 447 8801', priority: 'Secondary', verified: false },
];

export default function Contacts() {
  const [contacts, setContacts] = useState(INITIAL);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', phone: '' });

  const addContact = () => {
    if (!form.name || !form.phone) return;
    setContacts([...contacts, { id: Date.now(), ...form, priority: 'Secondary', verified: false }]);
    setForm({ name: '', role: '', phone: '' });
    setShowAdd(false);
  };

  return (
    <>
      <TopBar
        title="Trusted contacts"
        back={false}
        subtitle={`${contacts.length} people will be alerted`}
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
              <button onClick={() => setShowAdd(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Relationship (e.g. Sister)" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            <input placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Button full onClick={addContact}>Save contact</Button>
          </Card>
        )}

        {contacts.map((c, i) => (
          <Card key={c.id} className="ct-card">
            <span className="ct-grip"><GripVertical size={15} strokeWidth={2} /></span>
            <div className="ct-avatar mono">{c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
            <div className="ct-info">
              <div className="ct-name-row">
                <strong>{c.name}</strong>
                {i === 0 && <Pill tone="good">Primary</Pill>}
              </div>
              <span className="ct-role">{c.role || 'Trusted contact'} · {c.phone}</span>
              <span className={`ct-verify ${c.verified ? 'ct-verify-yes' : ''}`}>
                <ShieldCheck size={12} strokeWidth={2.4} />
                {c.verified ? 'Verified' : 'Pending verification'}
              </span>
            </div>
            <div className="ct-quick">
              <button aria-label={`Call ${c.name}`}><Phone size={15} strokeWidth={2.2} /></button>
              <button aria-label={`Message ${c.name}`}><MessageCircle size={15} strokeWidth={2.2} /></button>
            </div>
          </Card>
        ))}

        <p className="ct-note">Contacts are notified in priority order — the first person reached confirms your alert.</p>
      </div>
      <BottomNav />
    </>
  );
}
