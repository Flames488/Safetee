import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, PasswordInput } from '../components/ui';
import Logo from '../components/Logo';
import Turnstile, { turnstileEnabled } from '../components/Turnstile';
import { useAuth } from '../context/AuthContext';
import './login.css';

export default function RecoverAccount() {
  const navigate = useNavigate();
  const { recoverAccount } = useAuth();
  const [phone, setPhone] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || !backupCode || !newPassword) return;
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification check.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await recoverAccount({ phone, backup_code: backupCode, new_password: newPassword, turnstile_token: turnstileToken });
      navigate('/app');
    } catch (err) {
      setError(err.message || 'That backup code is invalid or has already been used.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="lg-screen" onSubmit={handleSubmit}>
      <button type="button" className="lg-back" onClick={() => navigate('/login')} aria-label="Back to log in">
        <ArrowLeft size={18} strokeWidth={2.2} />
      </button>
      <Logo size={40} />
      <h1 className="lg-h1">Recover your account</h1>
      <p className="lg-p">
        Lost your phone and forgot your password? Use one of the backup codes you saved from
        Settings to get back in and set a new password.
      </p>
      <div className="lg-form">
        <label className="lg-field">
          <span className="mono">Phone number</span>
          <input
            type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 810 000 0000" autoComplete="tel" required
          />
        </label>
        <label className="lg-field">
          <span className="mono">Backup code</span>
          <input
            value={backupCode} onChange={(e) => setBackupCode(e.target.value)}
            placeholder="XXXXX-XXXXX" autoComplete="off" required
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
      <Turnstile onToken={setTurnstileToken} />
      {error && <p className="lg-error" role="alert">{error}</p>}
      <Button full size="lg" type="submit" disabled={submitting}>
        {submitting ? 'Recovering…' : 'Recover account'}
      </Button>
    </form>
  );
}
