import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Mic, MessageSquare, Bell, KeyRound, Fingerprint, User, Lock, CreditCard, Shield, ChevronRight, LogOut, X } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, Toggle, SectionLabel, Button, PasswordInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { queryPermission } from '../lib/useReliability';
import { subscribeToPush } from '../lib/push';
import { motionPermissionNeeded, requestMotionPermission } from '../lib/shakeDetector';
import { api } from '../lib/api';
import './settings.css';

function permStatus(state) {
  if (state === 'granted') return { label: 'Granted', on: true };
  if (state === 'denied') return { label: 'Blocked in browser', on: false };
  if (state === 'unsupported') return { label: 'Not supported here', on: false };
  if (state === 'prompt') return { label: 'Not enabled', on: false };
  return { label: 'Checking…', on: false };
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout, setUser } = useAuth();

  const [location, setLocation] = useState('checking');
  const [mic, setMic] = useState('checking');
  const [notif, setNotif] = useState('checking');
  const [smsStatus, setSmsStatus] = useState(null); // system-level, not per-user

  const [triggerBusy, setTriggerBusy] = useState(false);
  const [pinDraft, setPinDraft] = useState(null); // null = form closed
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [gestureError, setGestureError] = useState('');

  useEffect(() => {
    queryPermission('geolocation').then(setLocation);
    queryPermission('microphone').then(setMic);
    if ('Notification' in window) {
      setNotif(Notification.permission === 'default' ? 'prompt' : Notification.permission);
      // Re-syncing an already-granted subscription happens centrally in
      // AuthContext.jsx on every authenticated app load, not here — this
      // effect only reads current permission state for display.
    } else {
      setNotif('unsupported');
    }
    api.systemStatus()
      .then((s) => setSmsStatus(Boolean(s.sms_primary_configured || s.sms_fallback_configured)))
      .catch(() => setSmsStatus(false));
  }, []);

  // Trusts the actual callback outcome rather than re-querying the
  // Permissions API afterward — see the matching comment in useReliability.js
  // for why (iOS Safari's geolocation permission query is unreliable).
  const requestLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => setLocation('granted'),
      (error) => { if (error.code === error.PERMISSION_DENIED) setLocation('denied'); }
    );
  };

  const requestMic = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic('granted');
    } catch (err) {
      if (err.name === 'NotAllowedError') setMic('denied');
    }
  };

  const requestNotif = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotif(result);
    // Best-effort — SMS is still the reliable fallback for every alert
    // regardless of whether push subscription succeeds. Logged (not
    // silently swallowed) so a real failure is at least diagnosable.
    if (result === 'granted') subscribeToPush().catch((err) => console.error('Push subscription failed:', err));
  };

  const PERMISSIONS = [
    { icon: MapPin, name: 'Location', ...permStatus(location), onClick: location === 'prompt' ? requestLocation : null },
    { icon: Mic, name: 'Microphone', ...permStatus(mic), onClick: mic === 'prompt' ? requestMic : null },
    { icon: Bell, name: 'Notifications', ...permStatus(notif), onClick: notif === 'prompt' ? requestNotif : null },
  ];

  const patchTriggers = async (payload) => {
    setTriggerBusy(true);
    try {
      const updated = await api.updateTriggers(payload);
      setUser(updated);
    } catch {
      // leave state as-is on failure — no optimistic flip to undo
    } finally {
      setTriggerBusy(false);
    }
  };

  const submitPin = async () => {
    if (pinValue.length < 4) { setPinError('PIN must be at least 4 digits.'); return; }
    setPinError('');
    await patchTriggers({ fake_pin: pinValue });
    setPinDraft(null);
    setPinValue('');
  };

  // iOS gates the accelerometer behind an explicit permission prompt that
  // only works fired from directly inside a click handler — can't be
  // requested silently ahead of time, so the toggle itself is what asks.
  // Android has no such gate; requestMotionPermission() resolves true
  // immediately there.
  const toggleGesture = async (enabled) => {
    setGestureError('');
    if (enabled) {
      const granted = await requestMotionPermission();
      if (!granted) {
        setGestureError(
          motionPermissionNeeded()
            ? 'Motion access was denied. Enable it for this site in your phone settings, then try again.'
            : "This device doesn't support motion detection, so the shake trigger can't work here."
        );
        return;
      }
    }
    patchTriggers({ gesture_trigger_enabled: enabled });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <TopBar title="Settings" back={false} subtitle="Permissions, triggers and your account" />
      <div className="st-body">
        <SectionLabel>Permissions</SectionLabel>
        <Card className="st-group">
          {PERMISSIONS.map((p) => {
            const Tag = p.onClick ? 'button' : 'div';
            return (
              <Tag key={p.name} className={`st-row ${p.onClick ? 'st-row-actionable' : ''}`} onClick={p.onClick || undefined}>
                <span className="st-icon"><p.icon size={16} strokeWidth={2.1} /></span>
                <span className="st-row-text">
                  <strong>{p.name}</strong>
                  <Pill tone={p.on ? 'good' : 'warn'}>{p.label}</Pill>
                </span>
                {p.onClick && <span className="st-row-action mono">Tap to enable</span>}
              </Tag>
            );
          })}
          <div className="st-row">
            <span className="st-icon"><MessageSquare size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>SMS fallback</strong>
              <span className="st-desc">Configured on Safetee's servers, not per-device</span>
            </span>
            <Pill tone={smsStatus ? 'good' : 'warn'}>{smsStatus === null ? 'Checking…' : smsStatus ? 'Available' : 'Not configured'}</Pill>
          </div>
        </Card>

        <SectionLabel>Hidden SOS trigger</SectionLabel>
        <Card className="st-group">
          <div className="st-row">
            <span className="st-icon"><KeyRound size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Fake PIN</strong>
              <span className="st-desc">
                {user?.has_fake_pin
                  ? "Entering it at login silently alerts your contacts. You'll be signed in normally, with no visible sign anything happened"
                  : 'Enter it instead of your password at login to silently alert your contacts, with no visible sign anything happened'}
              </span>
            </span>
            {user?.has_fake_pin ? (
              <Button size="sm" variant="ghost" disabled={triggerBusy} onClick={() => patchTriggers({ clear_fake_pin: true })}>Remove</Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={triggerBusy} onClick={() => setPinDraft('open')}>Set up</Button>
            )}
          </div>
          {pinDraft && (
            <div className="st-pin-form">
              <div className="st-pin-form-head">
                <span>Choose a 4–6 digit fake PIN</span>
                <button onClick={() => { setPinDraft(null); setPinValue(''); setPinError(''); }} aria-label="Cancel"><X size={14} /></button>
              </div>
              <PasswordInput
                placeholder="e.g. 4821" inputMode="numeric" maxLength={6}
                value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
              />
              <p className="st-pin-hint">
                Use it in the password field on the login screen instead of your real password.
                It won't look any different from a normal sign-in, but it silently alerts your trusted contacts.
              </p>
              {pinError && <p className="st-pin-error">{pinError}</p>}
              <Button size="sm" onClick={submitPin} disabled={triggerBusy}>Save PIN</Button>
            </div>
          )}

          <div className="st-row">
            <span className="st-icon"><Fingerprint size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Shake to alert</strong>
              <span className="st-desc">
                {user?.gesture_trigger_enabled
                  ? 'Shake your phone firmly 3 times while Safetee is open to silently alert your contacts'
                  : "Shake your phone firmly 3 times while Safetee is open. Works only while the app is open, not from a locked screen"}
              </span>
            </span>
            <Toggle
              checked={Boolean(user?.gesture_trigger_enabled)}
              onChange={toggleGesture}
              label="Shake-to-alert trigger"
            />
          </div>
          {gestureError && <p className="st-pin-error st-gesture-error">{gestureError}</p>}
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card className="st-group">
          <button className="st-link" onClick={() => navigate('/app/profile')}>
            <span className="st-icon"><User size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text"><strong>Profile</strong></span>
            <ChevronRight size={16} color="var(--ink-2)" />
          </button>
          <button className="st-link" onClick={() => navigate('/app/settings/billing')}>
            <span className="st-icon"><CreditCard size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text"><strong>Plan &amp; billing</strong></span>
            <ChevronRight size={16} color="var(--ink-2)" />
          </button>
          <button className="st-link" onClick={() => navigate('/app/settings/privacy')}>
            <span className="st-icon"><Lock size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text"><strong>Privacy &amp; data controls</strong></span>
            <ChevronRight size={16} color="var(--ink-2)" />
          </button>
          {/* Desktop reaches this via the sidebar's "Platform" group
              (AppShell.jsx) — mobile has no sidebar, and Admin isn't one
              of BottomNav's 5 fixed tabs, so without this link admins on
              mobile had no way to reach the panel at all. */}
          {user && user.admin_role !== 'none' && (
            <button className="st-link" onClick={() => navigate('/app/admin')}>
              <span className="st-icon"><Shield size={16} strokeWidth={2.1} /></span>
              <span className="st-row-text"><strong>Admin panel</strong></span>
              <ChevronRight size={16} color="var(--ink-2)" />
            </button>
          )}
        </Card>

        <Button variant="outline-danger" full icon={<LogOut size={16} />} onClick={handleLogout}>
          Log out
        </Button>
      </div>
      <BottomNav />
    </>
  );
}
