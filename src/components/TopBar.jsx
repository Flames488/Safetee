import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import './topbar.css';

export default function TopBar({ title, back = true, action, subtitle }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <div className="topbar-left">
        {back && (
          <button className="topbar-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
        )}
        <div>
          <h1 className="topbar-title">{title}</h1>
          {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="topbar-action">{action}</div>}
    </div>
  );
}
