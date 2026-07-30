import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BatteryMedium, Gauge, LocateFixed, CheckCircle2 } from 'lucide-react';
import { VitalDot } from '../components/VitalRing';
import { Card, Button, Pill } from '../components/ui';
import './tracking.css';

export default function LiveTracking() {
  const [seconds, setSeconds] = useState(18 * 60 + 24);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="tk-wrap">
      <div className="tk-map">
        <div className="tk-map-grid" />
        <div className="tk-map-route" />
        <div className="tk-map-pin tk-map-pin-start" />
        <div className="tk-map-pin tk-map-pin-end" />
        <div className="tk-map-me">
          <VitalDot color="blue" size={14} />
        </div>
        <div className="tk-map-topbar">
          <Pill tone="good">Journey active</Pill>
          <button className="tk-close mono" onClick={() => navigate('/app')}>Minimize</button>
        </div>
      </div>

      <div className="tk-sheet">
        <div className="tk-eta">
          <span className="section-label">Arriving at Ikeja City Mall in</span>
          <span className="tk-eta-time mono">{mm}:{ss}</span>
        </div>

        <div className="tk-stats">
          <div className="tk-stat"><Gauge size={15} strokeWidth={2.2} color="var(--blue)" /><span>12 km/h</span></div>
          <div className="tk-stat"><LocateFixed size={15} strokeWidth={2.2} color="var(--green)" /><span>±4m accuracy</span></div>
          <div className="tk-stat"><BatteryMedium size={15} strokeWidth={2.2} color="var(--green)" /><span>68%</span></div>
        </div>

        <Card className="tk-note">
          <p>Amaka Obi and Tunde Bakare are receiving live updates on your location every 30 seconds.</p>
        </Card>

        <Button full size="lg" icon={<CheckCircle2 size={18} />} onClick={() => navigate('/app')}>
          I've arrived safely
        </Button>
        <button className="tk-sos" onClick={() => navigate('/app/sos')}>Something's wrong — send SOS</button>
      </div>
    </div>
  );
}
