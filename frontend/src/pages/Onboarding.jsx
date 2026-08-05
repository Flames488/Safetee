import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Mic, MessageSquare, Bell, ChevronRight, ArrowLeft, UserPlus, KeyRound, Power, Fingerprint, Check, User } from 'lucide-react';
import VitalRing from '../components/VitalRing';
import Logo from '../components/Logo';
import { Button, ProgressDots, Pill, PasswordInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './onboarding.css';

const PERMISSIONS = [
  { icon: MapPin, name: 'Location', why: 'Lets contacts see exactly where you are the moment you tap SOS.' },
  { icon: Mic, name: 'Microphone', why: 'Records ambient audio as evidence during an active alert.' },
  { icon: MessageSquare, name: 'SMS', why: 'Sends your location by text if you lose data or signal.' },
  { icon: Bell, name: 'Notifications', why: 'Confirms your alert was delivered and contacts responded.' },
];

const TRIGGERS = [
  { id: 'pin', icon: KeyRound, name: 'Fake PIN', desc: 'A decoy code silently sends an alert while unlocking your phone normally.' },
  { id: 'power', icon: Power, name: 'Power button', desc: 'Five quick presses trigger SOS without opening the app.' },
  { id: 'gesture', icon: Fingerprint, name: 'Secret gesture', desc: 'A custom hold-and-swipe pattern from any screen.' },
];

// Step order: welcome -> scenario -> create account -> permissions ->
// trusted contact -> hidden trigger -> done. The account step has to exist
// before the contact step, since saving a contact requires an authenticated
// session.
const STEP = { WELCOME: 0, SCENARIO: 1, ACCOUNT: 2, PERMISSIONS: 3, CONTACT: 4, TRIGGER: 5, DONE: 6 };
const TOTAL_STEPS = 7;

export default function Onboarding() {
  const [step, setStep] = useState(STEP.WELCOME);
  const [granted, setGranted] = useState([]);
  const [account, setAccount] = useState({ full_name: '', phone: '', password: '' });
  const [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '' });
  const [contactError, setContactError] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [trigger, setTrigger] = useState('pin');
  const { signup, status } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const intendedTier = state?.intendedTier || null;

  if (status === 'authenticated' && step === STEP.WELCOME) return <Navigate to="/app" replace />;

  // Once the account exists, going back can't land on the account-creation
  // form again — resubmitting it would just hit a "phone already
  // registered" error. Permissions is as far back as that case can go.
  const minStep = status === 'authenticated' ? STEP.PERMISSIONS : STEP.SCENARIO;
  const goBack = () => setStep((s) => Math.max(minStep, s - 1));

  const toggleGrant = (name) => setGranted((g) => (g.includes(name) ? g.filter((x) => x !== name) : [...g, name]));

  const handleCreateAccount = async () => {
    setAccountBusy(true);
    setAccountError('');
    try {
      await signup({
        full_name: account.full_name,
        phone: account.phone,
        password: account.password,
      });
      setStep(STEP.PERMISSIONS);
    } catch (err) {
      setAccountError(err.message || 'Could not create your account. Please try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSaveContact = async () => {
    setContactBusy(true);
    setContactError('');
    try {
      await api.addContact({ name: contact.name, phone: contact.phone });
      setStep(STEP.TRIGGER);
    } catch (err) {
      setContactError(err.message || 'Could not save this contact. You can add them later from Contacts.');
    } finally {
      setContactBusy(false);
    }
  };

  return (
    <div className="ob-screen">
      {step > STEP.WELCOME && (
        <div className="ob-top">
          {step > minStep && step !== STEP.DONE && (
            <button className="ob-back" onClick={goBack} aria-label="Previous step">
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          )}
          <ProgressDots total={TOTAL_STEPS - 1} active={step - 1} />
          {step !== STEP.ACCOUNT && step !== STEP.DONE && <button className="ob-skip mono" onClick={() => navigate('/app')}>Skip</button>}
        </div>
      )}

      {step === STEP.WELCOME && (
        <div className="ob-step ob-welcome">
          <VitalRing size={172} color="green">
            <div className="ob-mark"><Logo size={50} /></div>
          </VitalRing>
          <h1 className="ob-h1">Help reaches you<br />faster.</h1>
          <p className="ob-p">Safetee turns one tap into location, audio and a call for help — sent to the people you trust, in seconds.</p>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={() => setStep(STEP.SCENARIO)}>Get started</Button>
          <button className="ob-link mono" onClick={() => navigate('/login')}>I already have an account</button>
        </div>
      )}

      {step === STEP.SCENARIO && (
        <div className="ob-step">
          <Pill tone="bad">Scenario</Pill>
          <h1 className="ob-h1 ob-h1-tight">What if you couldn't<br />make a call?</h1>
          <p className="ob-p">Most emergencies don't give you time to dial, explain, and wait. Safetee is built for the seconds when speaking isn't an option.</p>
          <div className="ob-stat-card">
            <span className="ob-stat mono">&lt; 3 sec</span>
            <span className="ob-stat-label">to send your location, once SOS is triggered</span>
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={() => setStep(STEP.ACCOUNT)}>Continue</Button>
        </div>
      )}

      {step === STEP.ACCOUNT && (
        <div className="ob-step">
          <div className="ob-icon-badge"><User size={22} strokeWidth={2} color="var(--green)" /></div>
          <h1 className="ob-h1 ob-h1-tight">Create your<br />account.</h1>
          <p className="ob-p">This is what keeps your safety network — and your alert history — tied to you.</p>
          <div className="ob-form">
            <label className="ob-field">
              <span className="mono">Full name</span>
              <input
                value={account.full_name}
                onChange={(e) => setAccount({ ...account, full_name: e.target.value })}
                placeholder="e.g. Chidi Okafor"
                minLength={2}
              />
            </label>
            <label className="ob-field">
              <span className="mono">Phone number</span>
              <input
                value={account.phone}
                onChange={(e) => setAccount({ ...account, phone: e.target.value })}
                placeholder="+234 810 000 0000"
                minLength={8}
              />
            </label>
            <label className="ob-field">
              <span className="mono">Password</span>
              <PasswordInput
                value={account.password}
                onChange={(e) => setAccount({ ...account, password: e.target.value })}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
              />
            </label>
          </div>
          {accountError && <p className="ob-error" role="alert">{accountError}</p>}
          <div className="ob-spacer" />
          <Button
            full size="lg" onClick={handleCreateAccount}
            disabled={accountBusy || !account.full_name.trim() || account.phone.trim().length < 8 || account.password.length < 8}
          >
            {accountBusy ? 'Creating account…' : 'Create account'}
          </Button>
        </div>
      )}

      {step === STEP.PERMISSIONS && (
        <div className="ob-step">
          <h1 className="ob-h1 ob-h1-tight">A few permissions<br />keep it reliable.</h1>
          <p className="ob-p">Nothing runs in the background without your say-so. You can change any of this later in Settings.</p>
          <div className="ob-list">
            {PERMISSIONS.map((p) => {
              const on = granted.includes(p.name);
              return (
                <button key={p.name} className={`ob-perm ${on ? 'ob-perm-on' : ''}`} onClick={() => toggleGrant(p.name)}>
                  <span className="ob-perm-icon"><p.icon size={18} strokeWidth={2} /></span>
                  <span className="ob-perm-text">
                    <strong>{p.name}</strong>
                    <em>{p.why}</em>
                  </span>
                  <span className="ob-perm-check">{on && <Check size={16} strokeWidth={3} />}</span>
                </button>
              );
            })}
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={() => setStep(STEP.CONTACT)}>Allow &amp; continue</Button>
        </div>
      )}

      {step === STEP.CONTACT && (
        <div className="ob-step">
          <div className="ob-icon-badge"><UserPlus size={22} strokeWidth={2} color="var(--green)" /></div>
          <h1 className="ob-h1 ob-h1-tight">Add your first<br />trusted contact.</h1>
          <p className="ob-p">This is who gets notified first when you trigger an alert. Add more anytime.</p>
          <div className="ob-form">
            <label className="ob-field">
              <span className="mono">Full name</span>
              <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="e.g. Amaka Obi" />
            </label>
            <label className="ob-field">
              <span className="mono">Phone number</span>
              <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+234 810 000 0000" />
            </label>
          </div>
          {contactError && <p className="ob-error" role="alert">{contactError}</p>}
          <div className="ob-spacer" />
          <Button full size="lg" onClick={handleSaveContact} disabled={!contact.name || !contact.phone || contactBusy}>
            {contactBusy ? 'Saving…' : 'Save contact'}
          </Button>
          <button className="ob-skip-step mono" onClick={() => setStep(STEP.TRIGGER)}>I'll add contacts later</button>
        </div>
      )}

      {step === STEP.TRIGGER && (
        <div className="ob-step">
          <h1 className="ob-h1 ob-h1-tight">Pick a silent way<br />to call for help.</h1>
          <p className="ob-p">Use this when opening the app or speaking out loud isn't safe. Choose your default — you can set up the rest in Settings.</p>
          <div className="ob-list">
            {TRIGGERS.map((t) => (
              <button key={t.id} className={`ob-trigger ${trigger === t.id ? 'ob-trigger-on' : ''}`} onClick={() => setTrigger(t.id)}>
                <span className="ob-perm-icon"><t.icon size={18} strokeWidth={2} /></span>
                <span className="ob-perm-text">
                  <strong>{t.name}</strong>
                  <em>{t.desc}</em>
                </span>
              </button>
            ))}
          </div>
          <div className="ob-spacer" />
          <Button full size="lg" onClick={() => setStep(STEP.DONE)}>Set as my trigger</Button>
        </div>
      )}

      {step === STEP.DONE && (
        <div className="ob-step ob-welcome">
          <VitalRing size={172} color="green">
            <div className="ob-mark"><Check size={44} strokeWidth={2.4} color="var(--green)" /></div>
          </VitalRing>
          <h1 className="ob-h1">You're covered.</h1>
          <p className="ob-p">
            Your trigger, contact and permissions are set. Safetee is now watching quietly in the background.
            {intendedTier && ' One more step to finish choosing your plan.'}
          </p>
          <div className="ob-spacer" />
          <Button
            full size="lg" icon={<ChevronRight size={18} />}
            onClick={() => navigate(intendedTier ? '/app/settings/billing/choose-plan' : '/app')}
          >
            {intendedTier ? 'Continue to plan' : 'Go to dashboard'}
          </Button>
        </div>
      )}
    </div>
  );
}
