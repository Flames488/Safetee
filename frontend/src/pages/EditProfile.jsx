import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { Avatar, Button, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { uploadAvatar } from '../lib/avatarUpload';
import './profile-forms.css';

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be re-picked later (e.g. after a failed upload)
    if (!file) return;
    setAvatarError('');
    setAvatarBusy(true);
    try {
      setUser(await uploadAvatar(file));
    } catch (err) {
      setAvatarError(err.message || 'Could not upload your photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarError('');
    setAvatarBusy(true);
    try {
      setUser(await api.deleteAvatar());
    } catch (err) {
      setAvatarError(err.message || 'Could not remove your photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Edit profile" subtitle="Your name, photo, and email address" />
      <div className="pfm-avatar-section">
        <div className="pfm-avatar avatar-slot chip-gradient mono">
          <Avatar src={user?.avatar_url} name={user?.full_name} />
        </div>
        <div className="pfm-avatar-actions">
          <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={avatarBusy}>
            {avatarBusy ? 'Uploading…' : 'Change photo'}
          </Button>
          {user?.avatar_url && (
            <Button type="button" size="sm" variant="ghost" onClick={handleRemovePhoto} disabled={avatarBusy}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {avatarError && <p className="pfm-error" role="alert">{avatarError}</p>}
      </div>

      <form className="pfm-body" onSubmit={handleSave}>
        <Field
          className="pfm-field" label="Full name"
          value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required
        />
        <Field
          className="pfm-field" label="Email" type="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        />
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
