import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, MapPin, Users, Mic, Timer, MessageSquare, EyeOff, ArrowRight,
  UserPlus, Fingerprint, Send, Lock, KeyRound, Radio,
} from 'lucide-react';
import VitalRing from '../components/VitalRing';
import Logo from '../components/Logo';
import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import { Button, Pill } from '../components/ui';
import './home.css';

const FEATURES = [
  { icon: ShieldCheck, name: 'One-touch SOS', desc: 'A single tap sends your location and audio to the people who can help fastest.' },
  { icon: EyeOff, name: 'Hidden trigger', desc: 'A fake PIN at login, or a secret shake while the app is open, for when opening the real SOS screen isn\'t safe.' },
  { icon: MapPin, name: 'Live GPS sharing', desc: 'Real-time location, shared automatically the moment an alert goes out.' },
  { icon: Users, name: 'Trusted contacts', desc: 'Choose who\'s notified, in what order, every time.' },
  { icon: MessageSquare, name: 'SMS fallback', desc: 'No data connection? Your alert still goes out by text.' },
  { icon: Mic, name: 'Audio, photo & video', desc: 'Ambient audio, photos, and video captured automatically as evidence during an alert.' },
  { icon: Timer, name: 'Safe journey timer', desc: 'Set a destination and time, and Safetee checks in until you\'re there.' },
];

const STEPS = [
  { icon: UserPlus, name: 'Set up in minutes', desc: 'Add your trusted contacts and choose a hidden trigger: a fake PIN, or a secret shake.' },
  { icon: Fingerprint, name: 'Trigger silently, or with one tap', desc: 'Hold for SOS from the app, use your fake PIN at login, or shake your phone while Safetee is open.' },
  { icon: Send, name: 'Help finds you', desc: 'Your location, audio, and alert reach your trusted contacts immediately, and by SMS if you lose signal.' },
];

const TRUST = [
  { icon: Lock, name: 'Privacy', desc: 'Your location is only ever shared during an active alert or a Safe Journey you started yourself, never tracked in the background otherwise.' },
  { icon: KeyRound, name: 'Security', desc: 'Passwords are hashed with bcrypt, sessions use short-lived tokens that refresh automatically, and every request is authenticated end to end.' },
  { icon: Radio, name: 'Reliability', desc: "If your primary SMS provider fails, alerts automatically retry through a second, independent provider, so one bad connection doesn't mean nobody hears from you." },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="hm">
      <MarketingNav />

      <section className="hm-hero">
        <div className="hm-hero-inner">
          <Pill tone="bad">If something happens, seconds matter</Pill>
          <h1 className="hm-h1">When every second matters,<br />Safetee acts instantly.</h1>
          <p className="hm-lede">One tap can notify your trusted contacts, share your live location, and begin recording, so you're never facing an emergency alone.</p>
          <div className="hm-hero-actions">
            <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Set up Safetee</Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/app')}>See it in action</Button>
          </div>
        </div>
        <div className="hm-hero-visual">
          <VitalRing size={240} color="green">
            <div className="hm-visual-core"><Logo size={60} /></div>
          </VitalRing>
        </div>
      </section>

      <section className="hm-steps">
        <span className="section-label hm-section-label">How it works</span>
        <h2 className="hm-h2">Three steps, set up once, ready always.</h2>
        <div className="hm-steps-grid">
          {STEPS.map((s, i) => (
            <div key={s.name} className="hm-step">
              <span className="hm-step-num mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="hm-card-icon"><s.icon size={19} strokeWidth={1.9} /></span>
              <strong>{s.name}</strong>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
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
        <span className="section-label hm-section-label">Built to be trusted, not just used</span>
        <h2 className="hm-h2">This is how, not just a promise.</h2>
        <div className="hm-trust-grid">
          {TRUST.map((t) => (
            <div key={t.name} className="hm-trust-card">
              <span className="hm-card-icon"><t.icon size={19} strokeWidth={1.9} /></span>
              <strong>{t.name}</strong>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hm-pricing-teaser">
        <p className="section-label hm-pricing-eyebrow">Pricing</p>
        <h2 className="hm-h2">One plan. Everything included.</h2>
        <p className="hm-lede">30 days free, then a simple monthly or annual price, no feature gates, no upsells.</p>
        <button className="hm-pricing-link" onClick={() => navigate('/pricing')}>
          See pricing <ArrowRight size={15} />
        </button>
      </section>

      <section className="hm-cta">
        <h2 className="hm-h2">Set it up before you need it.</h2>
        <p className="hm-lede hm-cta-lede">Takes under three minutes. Free to start.</p>
        <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Get started free</Button>
      </section>

      <Footer />
    </div>
  );
}
