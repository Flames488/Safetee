import MarketingNav from '../components/MarketingNav';
import Footer from '../components/Footer';
import './simple-page.css';

export default function Privacy() {
  return (
    <div className="sp">
      <MarketingNav />
      <div className="sp-hero">
        <h1 className="sp-h1">Privacy policy.</h1>
        <p className="sp-lede">Last updated August 2026. This is a plain-language summary of how Safetee handles your data — not a substitute for reading it if something here matters to you.</p>
      </div>
      <div className="sp-body">
        <div className="sp-section">
          <h2>What we collect</h2>
          <p>Your name, phone number, and password (stored hashed, never in plain text). The trusted contacts you add. Location data, but only when you start a Safe Journey or trigger an SOS alert — never tracked in the background otherwise. Audio, photo, and video recorded during an active SOS alert, used solely as evidence for that alert.</p>
        </div>
        <div className="sp-section">
          <h2>How we use it</h2>
          <ul>
            <li>To notify your trusted contacts and share your location when you trigger an alert or start a journey</li>
            <li>To send SMS alerts through our delivery providers when you're offline or your primary provider fails</li>
            <li>To maintain your alert and journey history for your own records</li>
          </ul>
        </div>
        <div className="sp-section">
          <h2>What we don't do</h2>
          <p>We don't sell your data. We don't track your location outside an active journey or alert. We don't share your trusted contacts' information with anyone other than you and the alert-delivery providers needed to reach them during an emergency.</p>
        </div>
        <div className="sp-section">
          <h2>Your rights</h2>
          <p>You can review, edit, or delete your trusted contacts and account data at any time from Settings. To request full account deletion, contact us using the details on our Contact page.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
