import { useNavigate } from 'react-router-dom';
import { Edit3, HeartPulse, CreditCard, HelpCircle, ChevronRight, LogOut } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Pill, Button } from '../components/ui';
import './profile.css';

const MENU = [
  { icon: Edit3, label: 'Edit profile' },
  { icon: HeartPulse, label: 'Emergency medical info' },
  { icon: CreditCard, label: 'Plan & billing' },
  { icon: HelpCircle, label: 'Help & support' },
];

export default function Profile() {
  const navigate = useNavigate();
  return (
    <>
      <TopBar title="Profile" />
      <div className="pf-body">
        <div className="pf-head">
          <div className="pf-avatar mono">CO</div>
          <h1 className="pf-name">Chidi Okafor</h1>
          <span className="pf-phone">+234 810 000 5521</span>
          <Pill tone="good">Premium plan</Pill>
        </div>

        <div className="pf-stats">
          <div className="pf-stat"><strong>3</strong><span>Trusted contacts</span></div>
          <div className="pf-stat"><strong>12</strong><span>Journeys tracked</span></div>
          <div className="pf-stat"><strong>1</strong><span>Alerts resolved</span></div>
        </div>

        <Card className="pf-menu">
          {MENU.map((m) => (
            <button key={m.label} className="pf-menu-row">
              <span className="pf-menu-icon"><m.icon size={16} strokeWidth={2.1} /></span>
              <span>{m.label}</span>
              <ChevronRight size={16} color="var(--ink-2)" />
            </button>
          ))}
        </Card>

        <Button variant="outline-danger" full icon={<LogOut size={16} />} onClick={() => navigate('/')}>
          Log out
        </Button>
      </div>
    </>
  );
}
