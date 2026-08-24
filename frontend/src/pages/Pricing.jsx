import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import PlanPicker from '../components/PlanPicker';
import { BgPhoto } from '../components/ui';
import './simple-page.css';
import './pricing.css';

const FAQ = [
  { q: 'What happens when my trial ends?', a: "You'll be asked to pick a plan to keep your account active. Nothing is charged automatically without you choosing a plan first." },
  { q: 'Can I switch plans or billing periods?', a: 'Yes, from Settings, at any time. Switching applies from your next billing date.' },
  { q: 'How do I cancel?', a: "From Settings → Billing, any time, no phone call or email required. You'll keep access until the end of your current billing period." },
  { q: 'Why is Organization priced per seat instead of per member?', a: "Because your congregation, student body, or team isn't who needs a safety trigger in their pocket. It's the people who actually drive or travel on the organization's behalf. A seat is one protected person; you only pay for as many as you actually need covered, and can add more any time." },
  { q: 'What payment methods are supported?', a: 'Card, bank transfer, and USSD, all through Paystack, the same processor used by most Nigerian banks and fintechs.' },
];

export default function Pricing() {
  return (
    <div className="pr">
      <MarketingNav />

      <div className="pr-hero pr-hero-photo">
        <div className="pr-hero-photo-media">
          <BgPhoto src="https://loremflickr.com/1600/900/security,control-room?lock=5" className="pr-hero-photo-img" />
        </div>
        <div className="pr-hero-photo-inner">
          <h1 className="sp-h1">Simple pricing.<br />30 days free, no card required.</h1>
          <p className="sp-lede">One plan for you, one for your family, one for the people your organization actually needs to protect.</p>
        </div>
      </div>

      <PlanPicker />

      <div className="pr-faq">
        <h2 className="pr-faq-title">Questions</h2>
        {FAQ.map((item) => (
          <details key={item.q} className="pr-faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>

      <Footer />
    </div>
  );
}
