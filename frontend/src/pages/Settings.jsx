import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Mic, MessageSquare, Bell, KeyRound, Power, Fingerprint, User, Lock, CreditCard, ChevronRight, LogOut, X } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, Toggle, SectionLabel, Button, PasswordInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { queryPermission } from '../lib/useReliability';
import { subscribeToPush } from '../lib/push';
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

  useEffect(() => {
    queryPermission('geolocation').then(setLocation);
    queryPermission('microphone').then(setMic);
    if ('Notification' in window) {
      const permission = Notification.permission === 'default' ? 'prompt' : Notification.permission;
      setNotif(permission);
      // Covers anyone who already granted notification permission before
      // this feature existed — their device was never registered for
      // push, so quietly do that now rather than waiting for them to
      // toggle something that already looks "on".
      if (permission === 'granted') subscribeToPush().catch(() => {});
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
    // regardless of whether push subscription succeeds.
    if (result === 'granted') subscribeToPush().catch(() => {});
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
              <span className="st-desc">{user?.has_fake_pin ? 'A PIN is set on this account' : 'Not configured'}</span>
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
              {pinError && <p className="st-pin-error">{pinError}</p>}
              <Button size="sm" onClick={submitPin} disabled={triggerBusy}>Save PIN</Button>
            </div>
          )}

          <div className="st-row">
            <span className="st-icon"><Power size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Power button ×5</strong>
              <span className="st-desc">Works from any screen</span>
            </span>
            <Toggle
              checked={Boolean(user?.power_button_trigger_enabled)}
              onChange={(v) => patchTriggers({ power_button_trigger_enabled: v })}
              label="Power button trigger"
            />
          </div>
          <div className="st-row">
            <span className="st-icon"><Fingerprint size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text">
              <strong>Secret gesture</strong>
              <span className="st-desc">{user?.gesture_trigger_enabled ? 'Enabled' : 'Not configured'}</span>
            </span>
            <Toggle
              checked={Boolean(user?.gesture_trigger_enabled)}
              onChange={(v) => patchTriggers({ gesture_trigger_enabled: v })}
              label="Secret gesture trigger"
            />
          </div>
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
        </Card>

        <Button variant="outline-danger" full icon={<LogOut size={16} />} onClick={handleLogout}>
          Log out
        </Button>
      </div>
      <BottomNav />
    </>
  );
}
