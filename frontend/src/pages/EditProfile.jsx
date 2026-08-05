import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './profile-forms.css';

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await api.updateProfile({ full_name: fullName, email: email || null });
      setUser(updated);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Could not save your changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="Edit profile" subtitle="Your name and email address" />
      <form className="pfm-body" onSubmit={handleSave}>
        <label className="pfm-field">
          <span>Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required />
        </label>
        <label className="pfm-field">
          <span>Email</span>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <p className="pfm-hint">Your phone number ({user?.phone}) is your login and can't be changed here.</p>
        {error && <p className="pfm-error" role="alert">{error}</p>}
        {success && <p className="pfm-success">Saved.</p>}
        <Button full size="lg" type="submit" disabled={saving || fullName.trim().length < 2}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button full variant="ghost" type="button" onClick={() => navigate('/app/profile')}>Back to profile</Button>
      </form>
    </>
  );
}
