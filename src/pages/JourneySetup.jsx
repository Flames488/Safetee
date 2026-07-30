import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation2, Check } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Button } from '../components/ui';
import './journey.css';

const DURATIONS = [15, 30, 45, 60];
const CONTACTS = ['Amaka Obi', 'Tunde Bakare', 'Dr. Ifeoma Eze'];

export default function JourneySetup() {
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState(30);
  const [notify, setNotify] = useState(['Amaka Obi']);
  const navigate = useNavigate();

  const toggleContact = (name) =>
    setNotify((n) => (n.includes(name) ? n.filter((x) => x !== name) : [...n, name]));

  return (
    <>
      <TopBar title="Journey setup" subtitle="We'll check in automatically until you arrive" />
      <div className="jr-body">
        <Card className="jr-route">
          <div className="jr-route-row">
            <span className="jr-dot jr-dot-a" />
            <span>Current location</span>
          </div>
          <div className="jr-route-line" />
          <div className="jr-route-row">
            <span className="jr-dot jr-dot-b" />
            <input placeholder="Where are you headed?" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
        </Card>

        <span className="section-label jr-label">Expected travel time</span>
        <div className="jr-duration-row">
          {DURATIONS.map((d) => (
            <button key={d} className={`jr-chip ${duration === d ? 'jr-chip-on' : ''}`} onClick={() => setDuration(d)}>
              {d} min
            </button>
          ))}
        </div>

        <span className="section-label jr-label">Notify while I'm en route</span>
        <div className="jr-contact-list">
          {CONTACTS.map((name) => {
            const on = notify.includes(name);
            return (
              <button key={name} className={`jr-contact ${on ? 'jr-contact-on' : ''}`} onClick={() => toggleContact(name)}>
                <span>{name}</span>
                {on && <Check size={15} strokeWidth={2.6} />}
              </button>
            );
          })}
        </div>

        <Card className="jr-info">
          <Navigation2 size={16} strokeWidth={2.2} color="var(--blue)" />
          <p>If you don't confirm you've arrived within {duration + 10} minutes, Safetee automatically alerts {notify.length || 0} contact{notify.length === 1 ? '' : 's'} with your last known location.</p>
        </Card>

        <Button full size="lg" disabled={!destination} onClick={() => navigate('/app/tracking')}>
          Start journey
        </Button>
      </div>
    </>
  );
}
