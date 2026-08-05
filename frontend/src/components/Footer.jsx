import { Link } from 'react-router-dom';
import Logo from './Logo';
import './footer.css';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="ft">
      <div className="ft-inner">
        <Link to="/" className="ft-logo mono">
          <Logo size={16} /> SAFETEE
        </Link>
        <nav className="ft-links">
          <Link to="/about">About</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of use</Link>
        </nav>
        <span className="ft-copy">© {year} Safetee. Built to be there when it matters.</span>
      </div>
    </footer>
  );
}
