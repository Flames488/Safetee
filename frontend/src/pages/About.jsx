import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import { Button, Pill } from '../components/ui';
import './simple-page.css';

export default function About() {
  const navigate = useNavigate();
  return (
    <div className="sp">
      <MarketingNav />
      <div className="sp-hero">
        <div className="sp-eyebrow"><Pill tone="good">About Safetee</Pill></div>
        <h1 className="sp-h1">Built for the seconds<br />that matter most.</h1>
        <p className="sp-lede">Safetee exists so that when something goes wrong, the people who can help are already on their way, before you've had to explain, dial, or wait.</p>
      </div>
      <div className="sp-body">
        <div className="sp-section">
          <h2>Our mission</h2>
          <p>Most personal-safety tools assume you'll have time to open an app, find a contact, and make a call. We don't make that assumption. Safetee is built so a single tap, or a hidden trigger you can use without anyone noticing, is enough to get your location, audio, and an alert to the people you trust.</p>
        </div>
        <div className="sp-section">
          <h2>Our vision</h2>
          <p>A world where personal safety isn't a premium feature or an afterthought, but something everyone has quiet, reliable access to: on any phone, on any network, with a safety net that doesn't depend on a single point of failure.</p>
        </div>
        <div className="sp-section">
          <h2>Why we built this</h2>
          <p>Safetee started from a simple frustration: the moment you actually need a safety app is the moment you're least able to use one normally. So we designed backward from that moment, with hidden triggers instead of buried menus, automatic SMS fallback instead of assuming perfect signal, and a trusted-contacts system that notifies people in the order that actually helps.</p>
        </div>
        <div className="sp-cta">
          <Button size="lg" onClick={() => navigate('/onboarding')} icon={<ArrowRight size={17} />}>Set up Safetee</Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
