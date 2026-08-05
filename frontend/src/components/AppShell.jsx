import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Navigation, Users, Clock, CreditCard, Settings2, LogOut, Search, Bell, ShieldAlert, Shield } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './app-shell.css';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: Home, end: true },
  { to: '/app/journey', label: 'Journey', icon: Navigation },
  { to: '/app/contacts', label: 'Contacts', icon: Users },
  { to: '/app/history', label: 'History', icon: Clock },
  { to: '/app/settings/billing', label: 'Billing', icon: CreditCard },
  { to: '/app/settings', label: 'Settings', icon: Settings2, end: true },
];

function useCloseOnOutsideClick(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// The real app shell: a full-width top bar plus a persistent sidebar on
// desktop, replaced by the existing per-page BottomNav below the
// breakpoint (see app-shell.css / bottom-nav.css) — the top bar itself is
// desktop-only too, since every page already carries its own mobile header.
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const NAV_ITEMS = user && user.admin_role !== 'none'
    ? [...NAV, { to: '/app/admin', label: 'Admin', icon: Shield }]
    : NAV;
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);
  useCloseOnOutsideClick(searchRef, () => setSearchOpen(false));
  useCloseOnOutsideClick(notifRef, () => setNotifOpen(false));
  useCloseOnOutsideClick(profileRef, () => setProfileOpen(false));

  useEffect(() => {
    api.listContacts().then(setContacts).catch(() => {});
  }, []);

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

  const results = query.trim()
    ? contacts.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const unverifiedCount = contacts.filter((c) => !c.is_verified).length;

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-brand mono">
          <Logo size={19} />
          SAFETEE
        </div>

        <div className="app-topbar-search" ref={searchRef}>
          <Search size={15} strokeWidth={2.2} className="app-search-icon" />
          <input
            placeholder="Search your trusted contacts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && query.trim() && (
            <div className="app-dropdown app-search-dropdown">
              {results.length === 0 && <p className="app-dropdown-empty">No contacts match "{query.trim()}"</p>}
              {results.map((c) => (
                <button
                  key={c.id}
                  className="app-search-result"
                  onClick={() => { navigate('/app/contacts'); setSearchOpen(false); setQuery(''); }}
                >
                  <strong>{c.name}</strong>
                  <span>{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="app-topbar-actions">
          <ThemeToggle />
          <div className="app-topbar-item" ref={notifRef}>
            <button className="app-icon-btn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
              <Bell size={18} strokeWidth={2.1} />
              {unverifiedCount > 0 && <span className="app-badge-dot" />}
            </button>
            {notifOpen && (
              <div className="app-dropdown app-notif-dropdown">
                {unverifiedCount > 0 ? (
                  <button className="app-notif-item" onClick={() => { navigate('/app/contacts'); setNotifOpen(false); }}>
                    <ShieldAlert size={15} strokeWidth={2.1} color="var(--amber)" />
                    <span>{unverifiedCount} contact{unverifiedCount === 1 ? '' : 's'} pending verification</span>
                  </button>
                ) : (
                  <p className="app-dropdown-empty">You're all caught up.</p>
                )}
              </div>
            )}
          </div>

          <div className="app-topbar-item" ref={profileRef}>
            <button className="app-avatar-btn mono" onClick={() => setProfileOpen((o) => !o)} aria-label="Account menu">
              {initials || '—'}
            </button>
            {profileOpen && (
              <div className="app-dropdown app-profile-dropdown">
                <button onClick={() => { navigate('/app/profile'); setProfileOpen(false); }}>View profile</button>
                <button onClick={handleLogout} className="app-dropdown-danger">
                  <LogOut size={14} strokeWidth={2.2} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <nav className="app-nav">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`}
              >
                <Icon size={18} strokeWidth={2.1} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
