import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3, HeartPulse, CreditCard, HelpCircle, ChevronRight, LogOut } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Pill, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './profile.css';

const MENU = [
  { icon: Edit3, label: 'Edit profile', to: '/app/profile/edit' },
  { icon: HeartPulse, label: 'Emergency medical info', to: '/app/profile/medical' },
  { icon: CreditCard, label: 'Plan & billing', to: '/app/settings/billing' },
  { icon: HelpCircle, label: 'Help & support', to: '/contact' },
];

const PLAN_LABEL = {
  trialing: 'Free trial',
  active: 'Active plan',
  past_due: 'Payment past due',
  cancelled: 'Cancelling',
  expired: 'Plan expired',
};
const PLAN_TONE = {
  trialing: 'info',
  active: 'good',
  past_due: 'warn',
  cancelled: 'warn',
  expired: 'bad',
};

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null); // null = loading
  const [sub, setSub] = useState(null); // null = loading, false = error

  useEffect(() => {
    Promise.all([
      api.listContacts().catch(() => []),
      api.journeyHistory().catch(() => []),
      api.sosHistory().catch(() => []),
    ]).then(([contacts, journeys, sos]) => {
      setStats({
        contacts: contacts.length,
        journeys: journeys.length,
        resolved: sos.filter((s) => s.status === 'resolved').length,
      });
    });
    api.getSubscription().then(setSub).catch(() => setSub(false));
  }, []);

  const isAdmin = user && user.admin_role !== 'none';
  const planPill = isAdmin
    ? { tone: 'good', label: 'Admin access' }
    : sub
    ? { tone: PLAN_TONE[sub.status] || 'neutral', label: PLAN_LABEL[sub.status] || sub.status }
    : { tone: 'neutral', label: sub === false ? 'Plan unavailable' : 'Loading…' };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <TopBar title="Profile" />
      <div className="pf-body">
        <div className="pf-col-identity">
          <div className="pf-head">
            <div className="pf-avatar mono">{initials || '—'}</div>
            <h1 className="pf-name">{user?.full_name || 'Loading…'}</h1>
            <span className="pf-phone">{user?.phone || ''}</span>
            <Pill tone={planPill.tone}>{planPill.label}</Pill>
          </div>

          <div className="pf-stats">
            <div className="pf-stat"><strong>{stats ? stats.contacts : '—'}</strong><span>Trusted contacts</span></div>
            <div className="pf-stat"><strong>{stats ? stats.journeys : '—'}</strong><span>Journeys tracked</span></div>
            <div className="pf-stat"><strong>{stats ? stats.resolved : '—'}</strong><span>Alerts resolved</span></div>
          </div>
        </div>

        <div className="pf-col-menu">
          <Card className="pf-menu">
            {MENU.map((m) => (
              <button key={m.label} className="pf-menu-row" onClick={m.to ? () => navigate(m.to) : undefined}>
                <span className="pf-menu-icon"><m.icon size={16} strokeWidth={2.1} /></span>
                <span>{m.label}</span>
                <ChevronRight size={16} color="var(--ink-2)" />
              </button>
            ))}
          </Card>

          <Button variant="outline-danger" full icon={<LogOut size={16} />} onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </>
  );
}
