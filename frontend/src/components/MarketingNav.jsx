import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from './ui';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import './marketing-nav.css';

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/contact', label: 'Contact' },
];

export default function MarketingNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // A route change always means a link was just followed (including the
  // logo or the actions below) — the open panel should never survive that.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <header className="mn-nav">
      <div className="mn-nav-inner">
        <NavLink to="/" className="mn-logo mono">
          <Logo size={19} /> SAFETEE
        </NavLink>
        <nav className="mn-links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `mn-link ${isActive ? 'mn-link-active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mn-actions">
          <ThemeToggle />
          <button className="mn-link mn-actions-login" onClick={() => navigate('/login')}>Log in</button>
          <Button size="sm" onClick={() => navigate('/onboarding')}>Get started</Button>
          <button
            className="mn-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} strokeWidth={2.2} /> : <Menu size={20} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="mn-mobile-menu">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `mn-mobile-link ${isActive ? 'mn-mobile-link-active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
          <button className="mn-mobile-link" onClick={() => navigate('/login')}>Log in</button>
        </nav>
      )}
    </header>
  );
}
