import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, MapPin, Users, Mic, Timer, MessageSquare, EyeOff, ArrowRight,
  UserPlus, Fingerprint, Send, Lock, KeyRound, Radio,
} from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import { Button, Pill, BgPhoto } from '../components/ui';
import './home.css';

// picsum.photos (Lorem Picsum) rather than Unsplash's old "Source" random-
// by-keyword redirect (source.unsplash.com) — Unsplash discontinued Source
// years ago, so those URLs resolved to nothing. Picsum doesn't support a
// keyword/topic query, but a seed always resolves to a real photo, so each
// of these renders reliably instead of matching the section's theme exactly.
const picsum = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const FEATURES = [
  { icon: ShieldCheck, name: 'One-touch SOS', desc: 'A single tap sends your location and audio to the people who can help fastest.', photo: picsum('safetee-sos', 800, 600) },
  { icon: EyeOff, name: 'Hidden trigger', desc: 'A fake PIN at login, or a secret shake while the app is open, for when opening the real SOS screen isn\'t safe.', photo: picsum('safetee-hidden-trigger', 800, 600) },
  { icon: MapPin, name: 'Live GPS sharing', desc: 'Real-time location, shared automatically the moment an alert goes out.', photo: picsum('safetee-gps', 800, 600) },
  { icon: Users, name: 'Trusted contacts', desc: 'Choose who\'s notified, in what order, every time.', photo: picsum('safetee-contacts', 800, 600) },
  { icon: MessageSquare, name: 'SMS fallback', desc: 'No data connection? Your alert still goes out by text.', photo: picsum('safetee-sms', 800, 600) },
  { icon: Mic, name: 'Audio, photo & video', desc: 'Ambient audio, photos, and video captured automatically as evidence during an alert.', photo: picsum('safetee-evidence', 800, 600) },
  { icon: Timer, name: 'Safe journey timer', desc: 'Set a destination and time, and Safetee checks in until you\'re there.', photo: picsum('safetee-journey', 800, 600) },
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

// Real, verifiable facts pulled straight from the product and the copy
// above — deliberately not a "10,000+ users protected" style vanity
// counter, since Safetee has no user base to honestly claim one.
const STATS = [
  { icon: Timer, value: '<3 min', label: 'To add contacts and set your hidden trigger' },
  { icon: Radio, value: '2', label: 'Independent SMS providers, automatic fallback' },
  { icon: Lock, value: '30 days', label: 'Free trial, no card required' },
  { icon: MapPin, value: '0', label: 'Background location tracking outside an active alert' },
];

export default function Home() {
  const navigate = useNavigate();
  return (
    <div className="hm">
      <MarketingNav />

      <section className="hm-hero">
        <div className="hm-hero-media">
          <BgPhoto src={picsum('safetee-hero', 1600, 1000)} className="hm-hero-photo-img" />
        </div>
        <div className="hm-hero-inner">
          <div className="hm-hero-copy">
            <Pill tone="bad">If something happens, seconds matter</Pill>
            <h1 className="hm-h1">When every second matters,<br /><span className="text-gradient">Safetee acts instantly.</span></h1>
            <p className="hm-lede">One tap can notify your trusted contacts, share your live location, and begin recording, so you're never facing an emergency alone.</p>
            <div className="hm-hero-actions">
              <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Set up Safetee</Button>
              <Button size="lg" variant="secondary" onClick={() => navigate('/app')}>See it in action</Button>
            </div>
          </div>

          <div className="hm-status-card glass">
            <div className="hm-status-head">
              <span className="hm-status-dot" />
              <span>All systems operational</span>
            </div>
            <div className="hm-status-rows">
              <div className="hm-status-row">
                <span className="hm-status-icon"><Radio size={15} strokeWidth={2} /></span>
                <div>
                  <strong>SMS delivery</strong>
                  <span>Primary + independent backup provider</span>
                </div>
              </div>
              <div className="hm-status-row">
                <span className="hm-status-icon"><MapPin size={15} strokeWidth={2} /></span>
                <div>
                  <strong>Location sharing</strong>
                  <span>Only during an active alert or journey</span>
                </div>
              </div>
              <div className="hm-status-row">
                <span className="hm-status-icon"><Timer size={15} strokeWidth={2} /></span>
                <div>
                  <strong>Setup time</strong>
                  <span>Under 3 minutes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="hm-stats">
        <div className="hm-stats-inner">
          {STATS.map((s) => (
            <div key={s.label} className="hm-stat">
              <span className="hm-stat-icon"><s.icon size={17} strokeWidth={2} /></span>
              <div>
                <div className="hm-stat-value stat-figure">{s.value}</div>
                <div className="hm-stat-label">{s.label}</div>
              </div>
            </div>
          ))}
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
        <div className="hm-tile-grid">
          {FEATURES.map((f) => (
            <div key={f.name} className="hm-tile">
              <div className="hm-tile-media">
                <BgPhoto src={f.photo} className="hm-tile-photo-img" />
              </div>
              <div className="hm-tile-body">
                <span className="hm-tile-icon"><f.icon size={17} strokeWidth={2} /></span>
                <strong>{f.name}</strong>
                <p>{f.desc}</p>
              </div>
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
        <div className="hm-cta-media">
          <BgPhoto src={picsum('safetee-cta', 1600, 900)} className="hm-cta-photo-img" />
        </div>
        <div className="hm-cta-inner">
          <h2 className="hm-h2">Set it up before you need it.</h2>
          <p className="hm-lede hm-cta-lede">Takes under three minutes. Free to start.</p>
          <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Get started free</Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
