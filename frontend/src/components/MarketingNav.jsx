import { NavLink, useNavigate } from 'react-router-dom';
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
          <button className="mn-link" onClick={() => navigate('/login')}>Log in</button>
          <Button size="sm" onClick={() => navigate('/onboarding')}>Get started</Button>
        </div>
      </div>
    </header>
  );
}
