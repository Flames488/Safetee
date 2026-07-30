import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, MapPin, Mic, MessageSquare, Bell, ChevronRight, UserPlus, KeyRound, Power, Fingerprint, Check } from 'lucide-react';
import VitalRing from '../components/VitalRing';
import { Button, ProgressDots, Pill } from '../components/ui';
import './onboarding.css';

const PERMISSIONS = [
  { icon: MapPin, name: 'Location', why: 'Lets contacts see exactly where you are the moment you tap SOS.' },
  { icon: Mic, name: 'Microphone', why: 'Records ambient audio as evidence during an active alert.' },
  { icon: MessageSquare, name: 'SMS', why: 'Sends your location by text if you lose data or signal.' },
  { icon: Bell, name: 'Notifications', why: 'Confirms your alert was delivered and contacts responded.' },
];

const TRIGGERS = [
  { id: 'pin', icon: KeyRound, name: 'Fake PIN', desc: 'A decoy code silently sends an alert while unlocking your phone normally.' },
  { id: 'power', icon: Power, name: 'Power button', desc: 'Five quick presses trigger SOS without opening the app.' },
  { id: 'gesture', icon: Fingerprint, name: 'Secret gesture', desc: 'A custom hold-and-swipe pattern from any screen.' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [granted, setGranted] = useState([]);
  const [contact, setContact] = useState({ name: '', phone: '' });
  const [trigger, setTrigger] = useState('pin');
  const navigate = useNavigate();
  const total = 6;

  const next = () => (step < total - 1 ? setStep(step + 1) : navigate('/app'));
  const toggleGrant = (name) => setGranted((g) => (g.includes(name) ? g.filter((x) => x !== name) : [...g, name]));

  return (
    <div className="ob-screen">
      {step > 0 && (
        <div className="ob-top">
          <ProgressDots total={total - 1} active={step - 1} />
          <button className="ob-skip mono" onClick={() => navigate('/app')}>Skip</button>
        </div>
      )}

      {step === 0 && (
        <div className="ob-step ob-welcome">
          <VitalRing size={172} color="green">
            <div className="ob-mark"><ShieldCheck size={44} strokeWidth={1.8} color="var(--green)" /></div>
          </VitalRing>
          <h1 className="ob-h1">Help reaches you<br />faster.</h1>
          <p className="ob-p">Safetee turns one tap into location, audio and a call for help — sent to the people you trust, in seconds.</p>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={next}>Get started</Button>
          <button className="ob-link mono" onClick={() => navigate('/login')}>I already have an account</button>
        </div>
      )}

      {step === 1 && (
        <div className="ob-step">
          <Pill tone="bad">Scenario</Pill>
          <h1 className="ob-h1 ob-h1-tight">What if you couldn't<br />make a call?</h1>
          <p className="ob-p">Most emergencies don't give you time to dial, explain, and wait. Safetee is built for the seconds when speaking isn't an option.</p>
          <div className="ob-stat-card">
            <span className="ob-stat mono">&lt; 3 sec</span>
            <span className="ob-stat-label">to send your location, once SOS is triggered</span>
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={next}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="ob-step">
          <h1 className="ob-h1 ob-h1-tight">A few permissions<br />keep it reliable.</h1>
          <p className="ob-p">Nothing runs in the background without your say-so. You can change any of this later in Settings.</p>
          <div className="ob-list">
            {PERMISSIONS.map((p) => {
              const on = granted.includes(p.name);
              return (
                <button key={p.name} className={`ob-perm ${on ? 'ob-perm-on' : ''}`} onClick={() => toggleGrant(p.name)}>
                  <span className="ob-perm-icon"><p.icon size={18} strokeWidth={2} /></span>
                  <span className="ob-perm-text">
                    <strong>{p.name}</strong>
                    <em>{p.why}</em>
                  </span>
                  <span className="ob-perm-check">{on && <Check size={16} strokeWidth={3} />}</span>
                </button>
              );
            })}
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={next}>Allow &amp; continue</Button>
        </div>
      )}

      {step === 3 && (
        <div className="ob-step">
          <div className="ob-icon-badge"><UserPlus size={22} strokeWidth={2} color="var(--green)" /></div>
          <h1 className="ob-h1 ob-h1-tight">Add your first<br />trusted contact.</h1>
          <p className="ob-p">This is who gets notified first when you trigger an alert. Add more anytime.</p>
          <div className="ob-form">
            <label className="ob-field">
              <span className="mono">Full name</span>
              <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="e.g. Amaka Obi" />
            </label>
            <label className="ob-field">
              <span className="mono">Phone number</span>
              <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+234 810 000 0000" />
            </label>
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={next} disabled={!contact.name || !contact.phone}>Save contact</Button>
        </div>
      )}

      {step === 4 && (
        <div className="ob-step">
          <h1 className="ob-h1 ob-h1-tight">Pick a silent way<br />to call for help.</h1>
          <p className="ob-p">Use this when opening the app or speaking out loud isn't safe. Choose your default — you can set up the rest in Settings.</p>
          <div className="ob-list">
            {TRIGGERS.map((t) => (
              <button key={t.id} className={`ob-trigger ${trigger === t.id ? 'ob-trigger-on' : ''}`} onClick={() => setTrigger(t.id)}>
                <span className="ob-perm-icon"><t.icon size={18} strokeWidth={2} /></span>
                <span className="ob-perm-text">
                  <strong>{t.name}</strong>
                  <em>{t.desc}</em>
                </span>
              </button>
            ))}
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={next}>Set as my trigger</Button>
        </div>
      )}

      {step === 5 && (
        <div className="ob-step ob-welcome">
          <VitalRing size={172} color="green">
            <div className="ob-mark"><Check size={44} strokeWidth={2.4} color="var(--green)" /></div>
          </VitalRing>
          <h1 className="ob-h1">You're covered.</h1>
          <p className="ob-p">Your trigger, contact and permissions are set. Safetee is now watching quietly in the background.</p>
          <div className="ob-spacer" />
          <Button full size="lg" icon={<ChevronRight size={18} />} onClick={next}>Go to dashboard</Button>
        </div>
      )}
    </div>
  );
}
