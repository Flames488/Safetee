import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, User, HeartPulse, Download, ShieldAlert, X } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, SectionLabel, Button, PasswordInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './settings.css';
import './privacy-controls.css';

// Backs Settings' "Privacy & data controls" row. The Privacy Policy promises
// contacts and account data can be "reviewed, edited, or deleted at any time
// from Settings" — this page has to actually deliver that, not just link out
// to the policy text itself.
export default function PrivacyControls() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safetee-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message || 'Could not export your data right now.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!password) { setDeleteError('Enter your password to confirm.'); return; }
    setDeleteError('');
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message || 'Could not delete your account.');
      setDeleting(false);
    }
  };

  return (
    <>
      <TopBar title="Privacy & data controls" subtitle="Review, export, or delete your data" />
      <div className="st-body">
        <SectionLabel>Your data</SectionLabel>
        <Card className="st-group">
          <button className="st-link" onClick={() => navigate('/app/contacts')}>
            <span className="st-icon"><Users size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Trusted contacts</strong>
              <span className="st-desc">Review, edit, or remove who gets notified</span>
            </span>
          </button>
          <button className="st-link" onClick={() => navigate('/app/profile/edit')}>
            <span className="st-icon"><User size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Profile</strong>
              <span className="st-desc">Your name and email</span>
            </span>
          </button>
          <button className="st-link" onClick={() => navigate('/app/profile/medical')}>
            <span className="st-icon"><HeartPulse size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Medical info</strong>
              <span className="st-desc">What's shared during an emergency</span>
            </span>
          </button>
        </Card>

        <SectionLabel>Export</SectionLabel>
        <Card className="st-group">
          <div className="st-row">
            <span className="st-icon"><Download size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Download my data</strong>
              <span className="st-desc">Your profile, contacts, journeys and SOS history as a JSON file</span>
            </span>
            <Button size="sm" variant="secondary" disabled={exporting} onClick={handleExport}>
              {exporting ? 'Preparing…' : 'Download'}
            </Button>
          </div>
        </Card>
        {exportError && <p className="pc-error" role="alert">{exportError}</p>}

        <SectionLabel>Danger zone</SectionLabel>
        <Card className="pc-danger">
          <div className="st-row pc-danger-row">
            <span className="st-icon pc-danger-icon"><ShieldAlert size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Delete my account</strong>
              <span className="st-desc">Permanently erases your profile, contacts, journeys and SOS history. This can't be undone.</span>
            </span>
            {!deleteOpen && (
              <Button size="sm" variant="outline-danger" onClick={() => setDeleteOpen(true)}>Delete account</Button>
            )}
          </div>
          {deleteOpen && (
            <div className="pc-confirm">
              <div className="pc-confirm-head">
                <span>Enter your password to permanently delete your account</span>
                <button onClick={() => { setDeleteOpen(false); setPassword(''); setDeleteError(''); }} aria-label="Cancel">
                  <X size={14} />
                </button>
              </div>
              <PasswordInput
                value={password}
                onChange={(e) => { setPassword(e.target.value); setDeleteError(''); }}
                placeholder="Your password"
                autoComplete="current-password"
              />
              {deleteError && <p className="pc-error" role="alert">{deleteError}</p>}
              <Button size="sm" variant="outline-danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Permanently delete my account'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
