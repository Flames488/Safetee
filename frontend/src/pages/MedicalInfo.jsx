import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './profile-forms.css';

export default function MedicalInfo() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [medicalInfo, setMedicalInfo] = useState(user?.medical_info || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await api.updateProfile({ medical_info: medicalInfo });
      setUser(updated);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Could not save this. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="Emergency medical info" subtitle="Visible to you at a glance during an emergency" />
      <form className="pfm-body" onSubmit={handleSave}>
        <p className="pfm-hint">
          Allergies, conditions, medications, blood type: anything worth someone knowing quickly.
          This is stored on your account for your own reference; it is not automatically included
          in SOS alerts sent to your trusted contacts.
        </p>
        <label className="pfm-field">
          <span>Medical info</span>
          <textarea
            value={medicalInfo}
            onChange={(e) => setMedicalInfo(e.target.value)}
            placeholder="e.g. Type 1 diabetic. Allergic to penicillin. Blood type O+."
            maxLength={2000}
          />
        </label>
        {error && <p className="pfm-error" role="alert">{error}</p>}
        {success && <p className="pfm-success">Saved.</p>}
        <Button full size="lg" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button full variant="ghost" type="button" onClick={() => navigate('/app/profile')}>Back to profile</Button>
      </form>
    </>
  );
}
