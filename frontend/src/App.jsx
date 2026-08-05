import { HashRouter, Routes, Route } from 'react-router-dom';
import { ShieldCheck, LocateFixed, Users, Radio } from 'lucide-react';
import AppShell from './components/AppShell';
import InstallPrompt from './components/InstallPrompt';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import Home from './pages/Home';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import JourneySetup from './pages/JourneySetup';
import LiveTracking from './pages/LiveTracking';
import SOSActive from './pages/SOSActive';
import History from './pages/History';
import Settings from './pages/Settings';
import PrivacyControls from './pages/PrivacyControls';
import Billing from './pages/Billing';
import ChoosePlan from './pages/ChoosePlan';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import MedicalInfo from './pages/MedicalInfo';

// Full app screens (post sign-in) live inside the responsive shell — a
// persistent sidebar on desktop, the existing bottom nav on mobile.
function AppScreen({ children, admin }) {
  const Guard = admin ? AdminRoute : ProtectedRoute;
  return (
    <AppShell>
      <Guard>{children}</Guard>
    </AppShell>
  );
}

// Single-focus screens (auth, live SOS, live tracking) render full-bleed on
// mobile. On desktop they never appear inside a floating device-shaped
// card — that reads as a phone mockup, not a real product. Instead:
//   - "auth" screens sit in a genuine SaaS split-screen layout: a fixed
//     brand panel plus a full-height content column.
//   - "immersive" screens (active SOS, live tracking) stay edge-to-edge
//     and centered at any size — nothing should distract from an active
//     emergency state.
function FocusScreen({ children, guarded, variant = 'auth' }) {
  const content = guarded ? <ProtectedRoute>{children}</ProtectedRoute> : children;
  if (variant === 'immersive') {
    return (
      <div className="focus-page focus-immersive">
        <div className="focus-stage">{content}</div>
      </div>
    );
  }
  return (
    <div className="focus-page focus-auth">
      <aside className="focus-brand">
        <div className="focus-brand-top mono">
          <ShieldCheck size={18} strokeWidth={2.2} /> SAFETEE
        </div>
        <div className="focus-brand-mid">
          <h2>Help reaches you before panic does.</h2>
          <p>One tap notifies your trusted contacts, shares your live location, and starts recording — instantly.</p>
        </div>
        <ul className="focus-brand-points">
          <li><LocateFixed size={15} strokeWidth={2.1} /> Live location shared the moment an alert goes out</li>
          <li><Users size={15} strokeWidth={2.1} /> Trusted contacts notified in the order you choose</li>
          <li><Radio size={15} strokeWidth={2.1} /> Falls back to SMS the instant data drops</li>
        </ul>
      </aside>
      <div className="focus-stage">{content}</div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InstallPrompt />
        <HashRouter>
          <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/login" element={<FocusScreen><Login /></FocusScreen>} />
          <Route path="/forgot-password" element={<FocusScreen><ForgotPassword /></FocusScreen>} />
          <Route path="/onboarding" element={<FocusScreen><Onboarding /></FocusScreen>} />

          <Route path="/app" element={<AppScreen><Dashboard /></AppScreen>} />
          <Route path="/app/contacts" element={<AppScreen><Contacts /></AppScreen>} />
          <Route path="/app/journey" element={<AppScreen><JourneySetup /></AppScreen>} />
          <Route path="/app/tracking/:journeyId?" element={<FocusScreen guarded variant="immersive"><LiveTracking /></FocusScreen>} />
          <Route path="/app/sos" element={<FocusScreen guarded variant="immersive"><SOSActive /></FocusScreen>} />
          <Route path="/app/history" element={<AppScreen><History /></AppScreen>} />
          <Route path="/app/settings" element={<AppScreen><Settings /></AppScreen>} />
          <Route path="/app/settings/privacy" element={<AppScreen><PrivacyControls /></AppScreen>} />
          <Route path="/app/settings/billing" element={<AppScreen><Billing /></AppScreen>} />
          <Route path="/app/settings/billing/choose-plan" element={<AppScreen><ChoosePlan /></AppScreen>} />
          <Route path="/app/admin" element={<AppScreen admin><AdminDashboard /></AppScreen>} />
          <Route path="/app/profile" element={<AppScreen><Profile /></AppScreen>} />
          <Route path="/app/profile/edit" element={<AppScreen><EditProfile /></AppScreen>} />
          <Route path="/app/profile/medical" element={<AppScreen><MedicalInfo /></AppScreen>} />
        </Routes>
      </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
