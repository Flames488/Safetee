import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, PasswordInput } from '../components/ui';
import Logo from '../components/Logo';
import Turnstile, { turnstileEnabled } from '../components/Turnstile';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './login.css';

const STEP = { REQUEST: 0, RESET: 1, DONE: 2 };

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [step, setStep] = useState(STEP.REQUEST);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const requestCode = async (e) => {
    e.preventDefault();
    if (!phone) return;
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification check.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.forgotPassword(phone, turnstileToken);
      setStep(STEP.RESET);
    } catch (err) {
      // Deliberately vague — the backend never confirms whether a phone
      // number is registered, so neither should this message.
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (!otp || !newPassword) return;
    setSubmitting(true);
    setError('');
    try {
      await resetPassword({ phone, otp, new_password: newPassword });
      setStep(STEP.DONE);
    } catch (err) {
      setError(err.message || 'That code is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === STEP.DONE) {
    return (
      <div className="lg-screen">
        <Logo size={40} />
        <h1 className="lg-h1">Password reset</h1>
        <p className="lg-p">Your password has been changed and you're signed in.</p>
        <Button full size="lg" onClick={() => navigate('/app')}>Go to dashboard</Button>
      </div>
    );
  }

  if (step === STEP.RESET) {
    return (
      <form className="lg-screen" onSubmit={submitReset}>
        <button type="button" className="lg-back" onClick={() => setStep(STEP.REQUEST)} aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <Logo size={40} />
        <h1 className="lg-h1">Check your phone</h1>
        <p className="lg-p">We sent a 6-digit code to {phone}. It expires in 10 minutes.</p>
        <div className="lg-form">
          <label className="lg-field">
            <span className="mono">6-digit code</span>
            <input
              inputMode="numeric" maxLength={6} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000" autoComplete="one-time-code" required
            />
          </label>
          <label className="lg-field">
            <span className="mono">New password</span>
            <PasswordInput
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required
            />
          </label>
        </div>
        {error && <p className="lg-error" role="alert">{error}</p>}
        <Button full size="lg" type="submit" disabled={submitting}>
          {submitting ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    );
  }

  return (
    <form className="lg-screen" onSubmit={requestCode}>
      <button type="button" className="lg-back" onClick={() => navigate('/login')} aria-label="Back to log in">
        <ArrowLeft size={18} strokeWidth={2.2} />
      </button>
      <Logo size={40} />
      <h1 className="lg-h1">Forgot your password?</h1>
      <p className="lg-p">Enter your phone number and we'll text you a code to reset it.</p>
      <div className="lg-form">
        <label className="lg-field">
          <span className="mono">Phone number</span>
          <input
            type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 810 000 0000" autoComplete="tel" required
          />
        </label>
      </div>
      <Turnstile onToken={setTurnstileToken} />
      {error && <p className="lg-error" role="alert">{error}</p>}
      <Button full size="lg" type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset code'}
      </Button>
    </form>
  );
}
