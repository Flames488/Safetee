import { Signal, Wifi, BatteryFull } from 'lucide-react';
import './phone-shell.css';

export default function PhoneShell({ children, bare = false }) {
  return (
    <div className="phone-stage">
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-statusbar">
          <span className="mono status-time">9:41</span>
          <div className="status-icons">
            <Signal size={14} strokeWidth={2.4} />
            <Wifi size={14} strokeWidth={2.4} />
            <BatteryFull size={16} strokeWidth={2.4} />
          </div>
        </div>
        <div className={`phone-content ${bare ? 'phone-content-bare' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
