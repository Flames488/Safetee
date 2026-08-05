import { NavLink } from 'react-router-dom';
import { Home, Users, Clock, Settings2 } from 'lucide-react';
import './bottom-nav.css';

const tabs = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/contacts', label: 'Contacts', icon: Users },
  { to: '/app/history', label: 'History', icon: Clock },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}>
          <Icon size={20} strokeWidth={2.2} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
