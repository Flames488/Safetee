import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, PasswordInput } from '../components/ui';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import './login.css';

export default function Login() {
  const navigate = useNavigate();
  const { login, status } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [waking, setWaking] = useState(false);

  if (status === 'authenticated') return <Navigate to="/app" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || !password) return;
    setSubmitting(true);
    setError('');
    // The free-tier API host spins down when idle and can take up to a
    // minute to wake on the first request — past this threshold, assume
    // that's what's happening rather than leaving a plain spinner up.
    const wakeTimer = setTimeout(() => setWaking(true), 2500);
    try {
      await login(phone, password);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      clearTimeout(wakeTimer);
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
      {error && <p className="lg-error" role="alert">{error}</p>}
      {waking && (
        <p className="lg-hint" role="status">Waking up the server — this can take up to a minute on the first try.</p>
      )}
      <Button full size="lg" type="submit" disabled={submitting}>
        {submitting ? (waking ? 'Waking up server…' : 'Signing in…') : 'Log in'}
      </Button>
      <button type="button" className="lg-link mono" onClick={() => navigate('/onboarding')}>
        Create a new account
      </button>
    </form>
  );
}
