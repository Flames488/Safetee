import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Minus, Plus, Mail, User, Users, Building2 } from 'lucide-react';
import { Button, Field } from './ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import '../pages/pricing.css';

const TIER_ICON = { individual: User, family: Users, organization: Building2 };
const MOST_POPULAR = 'family';

function formatNaira(kobo) {
  return `₦${(kobo / 100).toLocaleString()}`;
}

export default function PlanPicker() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'annual'
  const [plans, setPlans] = useState(null); // null = loading
  const [plansError, setPlansError] = useState(false);
  const [extraSeats, setExtraSeats] = useState(0);
  const [checkingOut, setCheckingOut] = useState(null); // tier id currently checking out
  const [actionTier, setActionTier] = useState(null); // which tier's error/prompt is showing
  const [error, setError] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    api.listPlans()
      .then((data) => {
        setPlans(data);
        if (!data || data.length === 0) setPlansError(true);
      })
      .catch(() => { setPlans([]); setPlansError(true); });
  }, []);

  const startCheckout = async (tierId) => {
    setError('');
    setNeedsEmail(false);
    setActionTier(tierId);
    setCheckingOut(tierId);
    try {
      const seats = tierId === 'organization' ? extraSeats : 0;
      const { authorization_url } = await api.checkout(tierId, billing, seats);
      window.location.href = authorization_url;
    } catch (err) {
      if (err.status === 400 && /email/i.test(err.message)) {
        setNeedsEmail(true);
      } else {
        setError(err.message || 'Could not start checkout. Please try again.');
      }
      setCheckingOut(null);
    }
  };

  const handleChoose = (tierId) => {
    // Only reachable on the public pricing page — anywhere inside the app
    // shell, status is already 'authenticated' by definition of being able
    // to navigate there. Carry the chosen tier through onboarding via
    // router state — otherwise a visitor who deliberately picked a paid
    // tier lands on the dashboard afterward with no memory of that choice.
    if (status !== 'authenticated') {
      navigate('/onboarding', { state: { intendedTier: tierId, intendedBilling: billing } });
      return;
    }
    startCheckout(tierId);
  };

  const saveEmailAndRetry = async (tierId) => {
    if (!emailDraft) return;
    setSavingEmail(true);
    setError('');
    try {
      await api.updateProfile({ email: emailDraft });
      setNeedsEmail(false);
      await startCheckout(tierId);
    } catch (err) {
      setError(err.message || 'Could not save that email. Please try again.');
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <>
      <div className="pr-toggle">
        <button className={billing === 'monthly' ? 'pr-toggle-on' : ''} onClick={() => setBilling('monthly')}>Monthly</button>
        <button className={billing === 'annual' ? 'pr-toggle-on' : ''} onClick={() => setBilling('annual')}>
          Annual <span className="pr-save">Save 20%</span>
        </button>
      </div>

      {plans === null && <p className="pr-loading">Loading pricing…</p>}
      {plansError && (
        <p className="pr-loading pr-fetch-error">
          Couldn't load pricing right now, since the billing service may not be reachable. Please try again shortly.
        </p>
      )}

      {plans && plans.length > 0 && (
        <div className="pr-tiers">
          {plans.map((plan) => {
            const isOrg = plan.id === 'organization';
            const isPopular = plan.id === MOST_POPULAR;
            const Icon = TIER_ICON[plan.id] || User;
            const seats = isOrg ? extraSeats : 0;
            const base = billing === 'annual' ? plan.annual_kobo : plan.monthly_kobo;
            const perSeat = billing === 'annual' ? plan.extra_seat_annual_kobo : plan.extra_seat_monthly_kobo;
            const total = base + (isOrg ? seats * (perSeat || 0) : 0);

            return (
              <div key={plan.id} className={`pr-card ${isPopular ? 'pr-card-popular' : ''}`}>
                {isPopular && <span className="pr-ribbon">Most popular</span>}
                <div className="pr-card-top">
                  <span className="pr-tier-icon"><Icon size={18} strokeWidth={2} /></span>
                  <h3>{plan.name}</h3>
                </div>
                <p className="pr-tagline">{plan.tagline}</p>

                <div className="pr-price">
                  <span className="pr-amount">{formatNaira(total)}</span>
                  <span className="pr-interval">/{billing === 'monthly' ? 'month' : 'year'}</span>
                </div>
                <p className="pr-seats-included">
                  Includes {plan.seats_included} seat{plan.seats_included === 1 ? '' : 's'}
                  {isOrg && perSeat ? ` · +${formatNaira(perSeat)}/seat/${billing === 'monthly' ? 'mo' : 'yr'} after that` : ''}
                </p>

                {isOrg && (
                  <div className="pr-seat-stepper">
                    <span>Extra seats</span>
                    <div className="pr-seat-controls">
                      <button onClick={() => setExtraSeats((s) => Math.max(0, s - 1))} aria-label="Fewer seats"><Minus size={14} /></button>
                      <span className="pr-seat-count">{extraSeats}</span>
                      <button onClick={() => setExtraSeats((s) => s + 1)} aria-label="More seats"><Plus size={14} /></button>
                    </div>
                  </div>
                )}

                <ul className="pr-included">
                  {plan.features.map((f) => (
                    <li key={f}><span className="pr-check"><Check size={11} strokeWidth={3} /></span> {f}</li>
                  ))}
                </ul>

                {needsEmail && actionTier === plan.id && (
                  <div className="pr-email-prompt">
                    <div className="pr-email-prompt-head"><Mail size={14} strokeWidth={2.2} /> Add your email to continue: Paystack sends your receipt there.</div>
                    <Field type="email" placeholder="you@example.com" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                    <Button size="sm" full disabled={!emailDraft || savingEmail} onClick={() => saveEmailAndRetry(plan.id)}>
                      {savingEmail ? 'Saving…' : 'Save and continue'}
                    </Button>
                  </div>
                )}
                {error && actionTier === plan.id && <p className="pr-error" role="alert">{error}</p>}

                <Button
                  full size="lg" variant={isPopular ? 'primary' : 'outline'}
                  onClick={() => handleChoose(plan.id)} disabled={checkingOut === plan.id} icon={<ArrowRight size={17} />}
                >
                  {checkingOut === plan.id ? 'Redirecting…' : status === 'authenticated' ? `Choose ${plan.name}` : 'Start free trial'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
