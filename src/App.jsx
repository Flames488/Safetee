import { HashRouter, Routes, Route } from 'react-router-dom';
import PhoneShell from './components/PhoneShell';

import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import JourneySetup from './pages/JourneySetup';
import LiveTracking from './pages/LiveTracking';
import SOSActive from './pages/SOSActive';
import History from './pages/History';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

// App screens (post sign-in) are mobile-first, so they're rendered inside a
// simulated phone frame. The marketing site and auth screens use their own layout.
function AppScreen({ children }) {
  return <PhoneShell>{children}</PhoneShell>;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AppScreen><Login /></AppScreen>} />
        <Route path="/onboarding" element={<AppScreen><Onboarding /></AppScreen>} />

        <Route path="/app" element={<AppScreen><Dashboard /></AppScreen>} />
        <Route path="/app/contacts" element={<AppScreen><Contacts /></AppScreen>} />
        <Route path="/app/journey" element={<AppScreen><JourneySetup /></AppScreen>} />
        <Route path="/app/tracking" element={<AppScreen bare><LiveTracking /></AppScreen>} />
        <Route path="/app/sos" element={<AppScreen bare><SOSActive /></AppScreen>} />
        <Route path="/app/history" element={<AppScreen><History /></AppScreen>} />
        <Route path="/app/settings" element={<AppScreen><Settings /></AppScreen>} />
        <Route path="/app/profile" element={<AppScreen><Profile /></AppScreen>} />
      </Routes>
    </HashRouter>
  );
}
