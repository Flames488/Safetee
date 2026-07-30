import { useState } from 'react';
import { ShieldAlert, Navigation2, ChevronDown } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill } from '../components/ui';
import './history.css';

const EVENTS = [
  { id: 1, type: 'journey', title: 'Journey completed', place: 'Home → Ikeja City Mall', date: 'Yesterday, 6:42 PM', status: 'Safe', tone: 'good', detail: '32 min · 2 contacts notified · Arrived on time' },
  { id: 2, type: 'sos', title: 'SOS alert', place: 'Along Allen Avenue', date: 'Aug 14, 11:05 PM', status: 'Resolved', tone: 'good', detail: 'Marked safe after 6 min · Amaka Obi responded first' },
  { id: 3, type: 'journey', title: 'Journey completed', place: 'Office → Home', date: 'Aug 12, 7:58 PM', status: 'Safe', tone: 'good', detail: '41 min · 1 contact notified · Arrived on time' },
  { id: 4, type: 'sos', title: 'SOS alert', place: 'Test alert', date: 'Aug 3, 2:14 PM', status: 'Cancelled', tone: 'neutral', detail: 'Cancelled 4s after trigger · No contacts notified' },
];

export default function History() {
  const [open, setOpen] = useState(null);

  return (
    <>
      <TopBar title="Emergency history" back={false} subtitle="Every alert and journey, kept for your records" />
      <div className="hs-list">
        {EVENTS.map((e) => (
          <Card key={e.id} className="hs-card">
            <button className="hs-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className={`hs-icon ${e.type === 'sos' ? 'hs-icon-sos' : ''}`}>
                {e.type === 'sos' ? <ShieldAlert size={16} strokeWidth={2.1} /> : <Navigation2 size={16} strokeWidth={2.1} />}
              </span>
              <span className="hs-text">
                <strong>{e.title}</strong>
                <span>{e.place}</span>
                <span className="hs-date mono">{e.date}</span>
              </span>
              <Pill tone={e.tone}>{e.status}</Pill>
              <ChevronDown size={15} className={`hs-chev ${open === e.id ? 'hs-chev-open' : ''}`} />
            </button>
            {open === e.id && <p className="hs-detail">{e.detail}</p>}
          </Card>
        ))}
      </div>
      <BottomNav />
    </>
  );
}
