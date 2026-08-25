import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Navigation, Users, Clock, CreditCard, Settings2, LogOut, Search, Bell, ShieldAlert, Shield, ChevronRight } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { Avatar } from './ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { startShakeDetection } from '../lib/shakeDetector';
import { useIncomingAlertsCount } from '../lib/useIncomingAlertsCount';
import { cacheContacts } from '../lib/contactsCache';
import './app-shell.css';

// Grouped nav (label + items) rather than one flat list — the single
// biggest structural upgrade for a sidebar's "wayfinding" quality: it
// tells the user the shape of the app before they've clicked anything.
const NAV_GROUPS = [
  {
    label: 'Safety',
    items: [
      { to: '/app', label: 'Dashboard', icon: Home, end: true },
      { to: '/app/journey', label: 'Journey', icon: Navigation },
      { to: '/app/contacts', label: 'Trusted contacts', icon: Users },
      { to: '/app/alerts', label: 'Alerts', icon: Bell },
      { to: '/app/history', label: 'History', icon: Clock },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/app/settings/billing', label: 'Billing', icon: CreditCard },
      { to: '/app/settings', label: 'Settings', icon: Settings2, end: true },
    ],
  },
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
  const alertCount = useIncomingAlertsCount();
  const isAdmin = user && user.admin_role !== 'none';
  const navGroups = isAdmin
    ? [...NAV_GROUPS, { label: 'Platform', items: [{ to: '/app/admin', label: 'Admin', icon: Shield }] }]
    : NAV_GROUPS;
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
    // Mounted on every /app/* page, so this is the one place that reliably
    // keeps the offline SOS fallback's contact cache warm during normal,
    // connected use — not just when the Contacts page itself is visited.
    api.listContacts().then((list) => { setContacts(list); cacheContacts(list); }).catch(() => {});
  }, []);

  // Secret gesture trigger — only active while an AppShell-wrapped screen
  // is mounted (Dashboard, Contacts, Settings, etc.), not on the immersive
  // SOS/tracking screens, which don't use AppShell at all — shaking again
  // mid-SOS would be pointless anyway. Navigating away from any /app/*
  // page unmounts this effect and stops listening, same as it stops
  // listening entirely once the toggle is off.
  useEffect(() => {
    if (!user?.gesture_trigger_enabled) return;
    const stop = startShakeDetection(() => {
      navigate('/app/sos', { state: { trigger: 'gesture' } });
    });
    return stop;
  }, [user?.gesture_trigger_enabled, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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
            <button className="app-avatar-btn chip-gradient mono avatar-slot" onClick={() => setProfileOpen((o) => !o)} aria-label="Account menu">
              <Avatar src={user?.avatar_url} name={user?.full_name} />
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
            {navGroups.map((group) => (
              <div className="app-nav-group" key={group.label}>
                <span className="app-nav-group-label">{group.label}</span>
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`}
                  >
                    <span className="app-nav-icon">
                      <Icon size={17} strokeWidth={2.1} />
                      {to === '/app/alerts' && alertCount > 0 && <span className="app-nav-dot" />}
                    </span>
                    <span>{label}</span>
                    <ChevronRight size={13} className="app-nav-chevron" />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <button className="app-sidebar-user" onClick={() => navigate('/app/profile')}>
            <span className="app-sidebar-avatar chip-gradient mono avatar-slot"><Avatar src={user?.avatar_url} name={user?.full_name} /></span>
            <span className="app-sidebar-user-text">
              <strong>{user?.full_name || 'Your account'}</strong>
              <span>{user?.phone}</span>
            </span>
          </button>
        </aside>

        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
