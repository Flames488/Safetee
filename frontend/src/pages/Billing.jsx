import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, Receipt, ShieldCheck } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Pill, Button, SectionLabel } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './billing.css';

const STATUS_TONE = {
  trialing: 'info',
  active: 'good',
  past_due: 'warn',
  cancelled: 'warn',
  expired: 'bad',
};
const STATUS_LABEL = {
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Payment past due',
  cancelled: 'Cancelling at period end',
  expired: 'Expired',
};
const PAYMENT_STATUS_TONE = { success: 'good', pending: 'warn', failed: 'bad', abandoned: 'neutral' };

function daysUntil(dateStr) {
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000));
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtNaira(kobo) {
  return `₦${(kobo / 100).toLocaleString()}`;
}

export default function Billing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user && user.admin_role !== 'none';
  const [sub, setSub] = useState(null); // null = loading
  const [history, setHistory] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.getSubscription().then(setSub).catch(() => setSub(false));
    api.paymentHistory().then(setHistory).catch(() => setHistory([]));
  };
  useEffect(load, []);

  const handleCancel = async () => {
    setError('');
    setCancelling(true);
    try {
      const updated = await api.cancelSubscription();
      setSub(updated);
    } catch (err) {
      setError(err.message || 'Could not cancel right now. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <TopBar title="Billing" subtitle="Your plan, renewal date, and payment history" />
      <div className="bl-body">
        {isAdmin ? (
          <Card className="bl-current">
            <div className="bl-current-head">
              <span className="bl-current-icon bl-icon-good"><ShieldCheck size={20} strokeWidth={2} /></span>
              <div className="bl-current-head-text">
                <strong>Admin access</strong>
                <Pill tone="good">Free — no subscription required</Pill>
              </div>
            </div>
            <p className="bl-admin-note">
              Your {user.admin_role === 'super_admin' ? 'super admin' : 'admin'} role gives you full access to Safetee without needing a paid plan.
            </p>
          </Card>
        ) : (
          <>
        {sub === null && <p className="bl-note">Loading your subscription…</p>}
        {sub === false && <p className="bl-note">Couldn't load your subscription right now — check your connection and reopen this page.</p>}

        {sub && (
          <Card className="bl-current">
            <div className="bl-current-head">
              <span className={`bl-current-icon bl-icon-${STATUS_TONE[sub.status]}`}><CreditCard size={20} strokeWidth={2} /></span>
              <div className="bl-current-head-text">
                <strong>
                  {sub.tier
                    ? `${sub.tier[0].toUpperCase()}${sub.tier.slice(1)} — ${sub.billing_interval === 'annual' ? 'Annual' : 'Monthly'}${sub.extra_seats ? ` + ${sub.extra_seats} extra seat${sub.extra_seats === 1 ? '' : 's'}` : ''}`
                    : 'No plan selected yet'}
                </strong>
                <Pill tone={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</Pill>
              </div>
            </div>

            {sub.status === 'trialing' && (
              <div className="bl-highlight">
                <Calendar size={16} strokeWidth={2.1} />
                <div>
                  <strong>{daysUntil(sub.trial_ends_at) === 0 ? 'Trial ends today' : `${daysUntil(sub.trial_ends_at)} day${daysUntil(sub.trial_ends_at) === 1 ? '' : 's'} left in your trial`}</strong>
                  <span>Ends {fmtDate(sub.trial_ends_at)}</span>
                </div>
              </div>
            )}
            {sub.current_period_end && sub.status !== 'trialing' && (
              <div className="bl-highlight">
                <Calendar size={16} strokeWidth={2.1} />
                <div>
                  <strong>{sub.cancel_at_period_end ? 'Access ends' : 'Renews'} {fmtDate(sub.current_period_end)}</strong>
                  <span>{sub.cancel_at_period_end ? "You won't be charged again" : 'Billed automatically on this date'}</span>
                </div>
              </div>
            )}

            {error && <p className="bl-error" role="alert">{error}</p>}

            <div className="bl-actions">
              <Button onClick={() => navigate('/app/settings/billing/choose-plan')}>
                {sub.status === 'active' ? 'Change plan' : 'Choose a plan'}
              </Button>
              {sub.status === 'active' && !sub.cancel_at_period_end && (
                <Button variant="ghost" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel subscription'}
                </Button>
              )}
            </div>
          </Card>
        )}

        <SectionLabel><Receipt size={12} strokeWidth={2.4} /> Payment history</SectionLabel>
        {history === null && <p className="bl-note">Loading…</p>}
        {history?.length === 0 && <p className="bl-note">No payments yet.</p>}
        {history?.map((p) => (
          <Card key={p.id} className="bl-payment-row">
            <span className={`bl-payment-icon bl-icon-${PAYMENT_STATUS_TONE[p.status]}`}><Receipt size={15} strokeWidth={2.1} /></span>
            <div className="bl-payment-text">
              <strong>
                {p.tier[0].toUpperCase()}{p.tier.slice(1)} ({p.billing_interval}{p.extra_seats ? ` +${p.extra_seats} seats` : ''}) — {fmtNaira(p.amount_kobo)}
              </strong>
              <span>{fmtDate(p.paid_at || p.created_at)}</span>
            </div>
            <Pill tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Pill>
          </Card>
        ))}
          </>
        )}
      </div>
    </>
  );
}
