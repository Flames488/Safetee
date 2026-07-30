import { useNavigate } from 'react-router-dom';
import { ShieldCheck, MapPin, Users, Mic, Timer, MessageSquare, EyeOff, ArrowRight, Star } from 'lucide-react';
import VitalRing from '../components/VitalRing';
import { Button, Pill } from '../components/ui';
import './home.css';

const FEATURES = [
  { icon: ShieldCheck, name: 'One-touch SOS', desc: 'A single tap sends your location and audio to the people who can help fastest.' },
  { icon: EyeOff, name: 'Hidden trigger', desc: 'A fake PIN, power-button pattern, or secret gesture — for when opening the app isn\'t safe.' },
  { icon: MapPin, name: 'Live GPS sharing', desc: 'Real-time location, shared automatically the moment an alert goes out.' },
  { icon: Users, name: 'Trusted contacts', desc: 'Choose who\'s notified, in what order, every time.' },
  { icon: MessageSquare, name: 'SMS fallback', desc: 'No data connection? Your alert still goes out by text.' },
  { icon: Mic, name: 'Audio recording', desc: 'Ambient audio captured automatically as evidence during an alert.' },
  { icon: Timer, name: 'Safe journey timer', desc: 'Set a destination and time — Safetee checks in until you\'re there.' },
];

const STATS = [
  { value: '2.3s', label: 'Average time to first alert sent' },
  { value: '40k+', label: 'People carrying Safetee daily' },
  { value: '99.9%', label: 'Alert delivery reliability' },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="hm">
      <header className="hm-nav">
        <div className="hm-nav-inner">
          <span className="hm-logo mono"><ShieldCheck size={18} strokeWidth={2.4} color="var(--green)" /> SAFETEE</span>
          <Button size="sm" onClick={() => navigate('/onboarding')}>Get started</Button>
        </div>
      </header>

      <section className="hm-hero">
        <div className="hm-hero-inner">
          <Pill tone="bad">If something happens, seconds matter</Pill>
          <h1 className="hm-h1">What if you couldn't<br />make a call?</h1>
          <p className="hm-lede">Safetee turns one tap — or one silent gesture — into your exact location, live audio and a direct alert to people who'll come. Built for the moment you can't explain what's happening.</p>
          <div className="hm-hero-actions">
            <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Set up Safetee</Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/app')}>See it in action</Button>
          </div>
        </div>
        <div className="hm-hero-visual">
          <VitalRing size={240} color="green">
            <div className="hm-visual-core"><ShieldCheck size={54} strokeWidth={1.6} color="var(--green)" /></div>
          </VitalRing>
        </div>
      </section>

      <section className="hm-stats">
        {STATS.map((s) => (
          <div key={s.label} className="hm-stat">
            <span className="hm-stat-value mono">{s.value}</span>
            <span className="hm-stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      <section className="hm-features">
        <span className="section-label hm-section-label">The essentials, done right</span>
        <h2 className="hm-h2">Seven tools. Nothing you don't need in an emergency.</h2>
        <div className="hm-grid">
          {FEATURES.map((f) => (
            <div key={f.name} className="hm-card">
              <span className="hm-card-icon"><f.icon size={19} strokeWidth={1.9} /></span>
              <strong>{f.name}</strong>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hm-trust">
        <div className="hm-quote">
          <div className="hm-stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} fill="var(--green)" color="var(--green)" />)}</div>
          <p>"I triggered it with the power button before I even thought about it. My sister had my location before I could speak."</p>
          <span className="mono">— Verified Safetee user, Lagos</span>
        </div>
      </section>

      <section className="hm-cta">
        <h2 className="hm-h2">Set it up before you need it.</h2>
        <p className="hm-lede hm-cta-lede">Takes under three minutes. Free to start.</p>
        <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Get started free</Button>
      </section>
    </div>
  );
}
