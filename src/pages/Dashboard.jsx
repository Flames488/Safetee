import { useNavigate } from 'react-router-dom';
import { Wifi, BatteryMedium, LocateFixed, Users, Clock, Navigation, Settings2, ChevronRight, User } from 'lucide-react';
import VitalRing from '../components/VitalRing';
import { Card, Pill } from '../components/ui';
import BottomNav from '../components/BottomNav';
import './dashboard.css';

const STATUS = [
  { icon: Wifi, label: 'Connection', value: 'Online', tone: 'good' },
  { icon: LocateFixed, label: 'GPS accuracy', value: '4m', tone: 'good' },
  { icon: BatteryMedium, label: 'Battery', value: '68%', tone: 'good' },
];

const ACTIONS = [
  { icon: Navigation, label: 'Start a journey', to: '/app/journey', tone: 'green' },
  { icon: Users, label: 'Trusted contacts', to: '/app/contacts', tone: 'blue' },
  { icon: Clock, label: 'Emergency history', to: '/app/history', tone: 'blue' },
  { icon: Settings2, label: 'Permissions', to: '/app/settings', tone: 'blue' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  return (
    <>
      <div className="dash">
        <div className="dash-header">
          <div>
            <p className="dash-eyebrow mono">Good evening</p>
            <h1 className="dash-name">Chidi Okafor</h1>
          </div>
          <button className="dash-avatar" onClick={() => navigate('/app/profile')} aria-label="Open profile">
            <User size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="dash-status-row">
          {STATUS.map((s) => (
            <div key={s.label} className="dash-status-card">
              <s.icon size={15} strokeWidth={2.2} color="var(--green)" />
              <span className="dash-status-value mono">{s.value}</span>
              <span className="dash-status-label">{s.label}</span>
            </div>
          ))}
        </div>

        <Card className="dash-sos-card">
          <Pill tone="good">Protected · Monitoring active</Pill>
          <button className="dash-sos-btn" onClick={() => navigate('/app/sos')}>
            <VitalRing size={168} color="green">
              <span className="dash-sos-inner mono">HOLD FOR<br /><strong>SOS</strong></span>
            </VitalRing>
          </button>
          <p className="dash-sos-hint">Press and hold 2 seconds to alert your trusted contacts</p>
        </Card>

        <div className="dash-section-head">
          <span className="section-label">Quick actions</span>
        </div>
        <div className="dash-actions-grid">
          {ACTIONS.map((a) => (
            <button key={a.label} className="dash-action" onClick={() => navigate(a.to)}>
              <span className={`dash-action-icon dash-action-${a.tone}`}><a.icon size={17} strokeWidth={2} /></span>
              <span>{a.label}</span>
              <ChevronRight size={15} className="dash-action-chev" strokeWidth={2} />
            </button>
          ))}
        </div>

        <div className="dash-section-head">
          <span className="section-label">Recent activity</span>
        </div>
        <Card className="dash-activity">
          <div className="dash-activity-dot" />
          <div className="dash-activity-text">
            <strong>Journey completed safely</strong>
            <span>Home → Ikeja City Mall · Yesterday, 6:42 PM</span>
          </div>
        </Card>
      </div>
      <BottomNav />
    </>
  );
}
