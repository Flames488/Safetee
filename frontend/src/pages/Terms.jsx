import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import './simple-page.css';

export default function Terms() {
  return (
    <div className="sp">
      <MarketingNav />
      <div className="sp-hero">
        <h1 className="sp-h1">Terms of use.</h1>
        <p className="sp-lede">Last updated August 2026. The short version: use Safetee responsibly, keep your account secure, and never rely on it as your only line to emergency help.</p>
      </div>
      <div className="sp-body">
        <div className="sp-section">
          <h2>Not a replacement for emergency services</h2>
          <p>Safetee notifies your trusted contacts — it does not dispatch police, medical, or fire services. In immediate danger, always contact your local emergency number first. Safetee is a supplement to that, not a substitute.</p>
        </div>
        <div className="sp-section">
          <h2>Your account</h2>
          <p>You're responsible for keeping your password and hidden-trigger PIN confidential, and for the accuracy of the trusted contacts you add — they'll only be reachable during an alert if their phone number is correct.</p>
        </div>
        <div className="sp-section">
          <h2>Fair use</h2>
          <p>Triggering false alerts repeatedly, or using Safetee to harass or falsely alarm someone listed as a trusted contact, is a violation of these terms and may result in account suspension.</p>
        </div>
        <div className="sp-section">
          <h2>Service availability</h2>
          <p>We aim for high reliability, including automatic fallback between SMS providers, but no service can guarantee delivery in every network condition. Safetee is provided as-is, without warranty that any given alert will reach its recipients.</p>
        </div>
        <div className="sp-section">
          <h2>Changes to these terms</h2>
          <p>We'll update this page when our terms change, and note the date at the top. Continued use of Safetee after a change means you accept the updated terms.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
