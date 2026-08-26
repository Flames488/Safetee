import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, PasswordInput } from '../components/ui';
import Logo from '../components/Logo';
import Turnstile, { turnstileEnabled } from '../components/Turnstile';
import { useAuth } from '../context/AuthContext';
import './login.css';

// Best-effort, silent location for the backend to attach if this login
// happens to be a fake-PIN duress match (see POST /auth/login) — never
// requests permission itself, since a prompt appearing on an otherwise
// ordinary-looking login screen would be exactly the kind of visible tell
// duress mode exists to avoid. Only reads a location already granted from
// an earlier session (e.g. from using the SOS button before), and gives up
// fast so a slow GPS fix never makes a normal login feel slower.
async function silentLocation() {
  if (!navigator.geolocation || !navigator.permissions) return {};
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    if (perm.state !== 'granted') return {};
  } catch {
    return {};
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({}),
      { timeout: 1500, maximumAge: 60_000 },
    );
  });
}

export default function Login() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waking, setWaking] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  if (status === 'authenticated') return <Navigate to="/app" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || !password) return;
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification check.');
      return;
    }
    setSubmitting(true);
    setError('');
    // Past this threshold, say something rather than leaving a plain
    // spinner up — the backend is an always-on VPS now, so this is just
    // "this is taking a while" (slow network, momentary load), not a
    // cold-start explanation.
    const slowTimer = setTimeout(() => setWaking(true), 4000);
    try {
      const { lat, lng } = await silentLocation();
      await login(phone, password, lat, lng, turnstileToken);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      clearTimeout(slowTimer);
      setSubmitting(false);
      setWaking(false);
    }
  };

  return (
    <form className="lg-screen" onSubmit={handleSubmit}>
      <button type="button" className="lg-back" onClick={() => navigate('/')} aria-label="Back to home">
        <ArrowLeft size={18} strokeWidth={2.2} />
      </button>
      <Logo size={40} />
      <h1 className="lg-h1">Welcome back</h1>
      <p className="lg-p">Sign in to keep your safety network active.</p>
      <div className="lg-form">
        <label className="lg-field">
          <span className="mono">Phone number</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 810 000 0000"
            autoComplete="tel"
            required
          />
        </label>
        <label className="lg-field">
          <span className="mono">Password</span>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="button" className="lg-forgot" onClick={() => navigate('/forgot-password')}>
          Forgot password?
        </button>
      </div>
      <Turnstile onToken={setTurnstileToken} />
      {error && <p className="lg-error" role="alert">{error}</p>}
      {waking && (
        <p className="lg-hint" role="status">Still working on it. This is taking longer than usual.</p>
      )}
      <Button full size="lg" type="submit" disabled={submitting}>
        {submitting ? (waking ? 'Still signing in…' : 'Signing in…') : 'Log in'}
      </Button>
      <button type="button" className="lg-link mono" onClick={() => navigate('/onboarding')}>
        Create a new account
      </button>
    </form>
  );
}
