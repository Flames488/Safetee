import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import VitalRing from './VitalRing';

export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <VitalRing size={96} color="green">
          <ShieldCheck size={28} strokeWidth={1.8} color="var(--green)" />
        </VitalRing>
        <span className="mono" style={{ color: 'var(--ink-2)', fontSize: 13 }}>Checking your session…</span>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
