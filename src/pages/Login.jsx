import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui';
import './login.css';

export default function Login() {
  const navigate = useNavigate();
  return (
    <div className="lg-screen">
      <ShieldCheck size={34} strokeWidth={1.8} color="var(--green)" />
      <h1 className="lg-h1">Welcome back</h1>
      <p className="lg-p">Sign in to keep your safety network active.</p>
      <div className="lg-form">
        <label className="lg-field"><span className="mono">Phone or email</span><input placeholder="you@example.com" /></label>
        <label className="lg-field"><span className="mono">Password</span><input type="password" placeholder="••••••••" /></label>
      </div>
      <Button full size="lg" onClick={() => navigate('/app')}>Log in</Button>
      <button className="lg-link mono" onClick={() => navigate('/onboarding')}>Create a new account</button>
    </div>
  );
}
