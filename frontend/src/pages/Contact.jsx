import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, ShieldAlert, Clock } from 'lucide-react';
import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import { Button } from '../components/ui';
import './simple-page.css';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  // No fake "message sent" state — this opens the person's own email client
  // with everything prefilled, so it's a real send, not a form that quietly
  // goes nowhere without a backend behind it.
  const mailtoHref = `mailto:support@safetee.app?subject=${encodeURIComponent(
    `Message from ${form.name || 'the Safetee site'}`
  )}&body=${encodeURIComponent(`${form.message}\n\n— ${form.name}${form.email ? ` (${form.email})` : ''}`)}`;

  return (
    <div className="sp">
      <MarketingNav />
      <div className="sp-hero">
        <h1 className="sp-h1">Get in touch.</h1>
        <p className="sp-lede">Questions, feedback, or something not working right — here's how to reach us directly.</p>
      </div>
      <div className="sp-body">
        <div className="sp-contact-list">
          <a className="sp-contact-card" href="mailto:support@safetee.app">
            <span className="sp-contact-icon"><Mail size={17} strokeWidth={2} /></span>
            <span className="sp-contact-text">
              <strong>support@safetee.app</strong>
              <span>General questions and account support — we reply within a day.</span>
            </span>
          </a>
          <a className="sp-contact-card" href="mailto:trust@safetee.app">
            <span className="sp-contact-icon"><ShieldAlert size={17} strokeWidth={2} /></span>
            <span className="sp-contact-text">
              <strong>trust@safetee.app</strong>
              <span>Report a safety or security concern with the app itself.</span>
            </span>
          </a>
          <a className="sp-contact-card" href="https://wa.me/2348000000000" target="_blank" rel="noreferrer">
            <span className="sp-contact-icon"><MessageCircle size={17} strokeWidth={2} /></span>
            <span className="sp-contact-text">
              <strong>Chat with us on WhatsApp</strong>
              <span>Fastest way to reach a real person during business hours.</span>
            </span>
          </a>
          <div className="sp-contact-card sp-contact-static">
            <span className="sp-contact-icon"><Clock size={17} strokeWidth={2} /></span>
            <span className="sp-contact-text">
              <strong>Business hours</strong>
              <span>Monday–Friday, 9am–6pm WAT. Messages outside these hours are answered the next business day.</span>
            </span>
          </div>
        </div>

        <form className="sp-form" onSubmit={(e) => e.preventDefault()}>
          <h2 className="sp-form-title">Or send a message directly</h2>
          <input
            placeholder="Your name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="email" placeholder="Your email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <textarea
            placeholder="How can we help?" rows={4} value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
          <a href={mailtoHref}>
            <Button full disabled={!form.message}>Open in email</Button>
          </a>
        </form>

        <div className="sp-section">
          <h2>In an active emergency</h2>
          <p>Safetee is not a replacement for local emergency services. If you're in immediate danger, contact your local emergency number first — Safetee's SOS trigger notifies your trusted contacts in parallel, not instead of that call.</p>
        </div>

        <div className="sp-section">
          <h2>More questions?</h2>
          <p>
            Check the <Link to="/pricing" className="sp-inline-link">pricing FAQ</Link> for billing and trial questions, or reach out above for anything else.
          </p>
          <div className="sp-social">
            <a href="https://twitter.com/safeteeapp" target="_blank" rel="noreferrer">Twitter</a>
            <a href="https://instagram.com/safeteeapp" target="_blank" rel="noreferrer">Instagram</a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
