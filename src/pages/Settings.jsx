import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Mic, MessageSquare, Bell, KeyRound, Power, Fingerprint, User, Lock, ChevronRight, LogOut } from 'lucide-react';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import { Card, Pill, Toggle, SectionLabel, Button } from '../components/ui';
import './settings.css';

const PERMISSIONS = [
  { icon: MapPin, name: 'Location', status: 'Granted', on: true },
  { icon: Mic, name: 'Microphone', status: 'Granted', on: true },
  { icon: MessageSquare, name: 'SMS fallback', status: 'Granted', on: true },
  { icon: Bell, name: 'Notifications', status: 'Not enabled', on: false },
];

const TRIGGERS = [
  { icon: KeyRound, name: 'Fake PIN', desc: '4821', on: true },
  { icon: Power, name: 'Power button ×5', desc: 'Works from any screen', on: true },
  { icon: Fingerprint, name: 'Secret gesture', desc: 'Not configured', on: false },
];

export default function Settings() {
  const [perms, setPerms] = useState(PERMISSIONS);
  const [triggers, setTriggers] = useState(TRIGGERS);
  const navigate = useNavigate();

  const flip = (list, setList, i) => setList(list.map((x, idx) => (idx === i ? { ...x, on: !x.on } : x)));

  return (
    <>
      <TopBar title="Settings" back={false} subtitle="Permissions, triggers and your account" />
      <div className="st-body">
        <SectionLabel>Permissions</SectionLabel>
        <Card className="st-group">
          {perms.map((p, i) => (
            <div key={p.name} className="st-row">
              <span className="st-icon"><p.icon size={16} strokeWidth={2.1} /></span>
              <span className="st-row-text">
                <strong>{p.name}</strong>
                <Pill tone={p.on ? 'good' : 'warn'}>{p.status}</Pill>
              </span>
              <Toggle checked={p.on} onChange={() => flip(perms, setPerms, i)} label={p.name} />
            </div>
          ))}
        </Card>

        <SectionLabel>Hidden SOS trigger</SectionLabel>
        <Card className="st-group">
          {triggers.map((t, i) => (
            <div key={t.name} className="st-row">
              <span className="st-icon"><t.icon size={16} strokeWidth={2.1} /></span>
              <span className="st-row-text">
                <strong>{t.name}</strong>
                <span className="st-desc">{t.desc}</span>
              </span>
              <Toggle checked={t.on} onChange={() => flip(triggers, setTriggers, i)} label={t.name} />
            </div>
          ))}
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card className="st-group">
          <button className="st-link" onClick={() => navigate('/app/profile')}>
            <span className="st-icon"><User size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text"><strong>Profile</strong></span>
            <ChevronRight size={16} color="var(--ink-2)" />
          </button>
          <button className="st-link">
            <span className="st-icon"><Lock size={16} strokeWidth={2.1} /></span>
            <span className="st-row-text"><strong>Privacy &amp; data controls</strong></span>
            <ChevronRight size={16} color="var(--ink-2)" />
          </button>
        </Card>

        <Button variant="outline-danger" full icon={<LogOut size={16} />} onClick={() => navigate('/')}>
          Log out
        </Button>
      </div>
      <BottomNav />
    </>
  );
}
