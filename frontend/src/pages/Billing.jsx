import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Calendar, Receipt, ShieldCheck } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Pill, Button, SectionLabel, IconTile, ConfirmDialog, EmptyState, ErrorState, useToast } from '../components/ui';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user && user.admin_role !== 'none';
  const [sub, setSub] = useState(null); // null = loading
  const [history, setHistory] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const load = () => {
    api.getSubscription().then(setSub).catch(() => setSub(false));
    api.paymentHistory().then(setHistory).catch(() => setHistory([]));
  };

  // Paystack redirects back here with ?reference=... (also sent as
  // ?trxref=... for older integrations) the instant payment finishes —
  // its webhook to our backend is a separate, asynchronous call that can
  // land a few seconds after this redirect, or in rare cases be delayed
  // further. Verifying the same reference here closes that gap instead
  // of showing the user their pre-payment status right after they paid.
  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference) { load(); return; }

    setConfirmingPayment(true);
    api.verifyPayment(reference)
      .then(setSub)
      .catch(() => {}) // webhook will still land and correct this if verify itself failed
      .finally(() => {
        setConfirmingPayment(false);
        setSearchParams({}, { replace: true }); // don't re-verify on refresh
        api.paymentHistory().then(setHistory).catch(() => setHistory([]));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const updated = await api.cancelSubscription();
      setSub(updated);
      toast('Your subscription will end at the close of this billing period.', { tone: 'good' });
    } catch (err) {
      toast(err.message || 'Could not cancel right now. Please try again.', { tone: 'bad' });
    } finally {
      setCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  return (
    <>
      <TopBar title="Billing" subtitle="Your plan, renewal date, and payment history" />
      <div className="bl-body">
        {confirmingPayment && (
          <Card className="bl-current bl-confirming">
            <div className="skel skel-line" style={{ width: 22, height: 22, borderRadius: '50%' }} />
            <span>Confirming your payment…</span>
          </Card>
        )}
        {isAdmin ? (
          <Card className="bl-current">
            <div className="bl-current-head">
              <IconTile icon={ShieldCheck} tone="good" size={44} />
              <div className="bl-current-head-text">
                <strong>Admin access</strong>
                <Pill tone="good">Free, no subscription required</Pill>
              </div>
            </div>
            <p className="bl-admin-note">
              Your {user.admin_role === 'super_admin' ? 'super admin' : 'admin'} role gives you full access to Safetee without needing a paid plan.
            </p>
          </Card>
        ) : (
          <>
        {sub === null && (
          <Card className="bl-current"><div className="skel skel-line" style={{ width: '60%', height: 20 }} /></Card>
        )}
        {sub === false && <ErrorState message="Couldn't load your subscription right now." onRetry={load} />}

        {sub && (
          <Card className="bl-current">
            <div className="bl-current-head">
              <IconTile icon={CreditCard} tone={STATUS_TONE[sub.status]} size={44} />
              <div className="bl-current-head-text">
                <strong>
                  {sub.tier
                    ? `${sub.tier[0].toUpperCase()}${sub.tier.slice(1)} · ${sub.billing_interval === 'annual' ? 'Annual' : 'Monthly'}${sub.extra_seats ? ` + ${sub.extra_seats} extra seat${sub.extra_seats === 1 ? '' : 's'}` : ''}`
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

            <div className="bl-actions">
              <Button onClick={() => navigate('/app/settings/billing/choose-plan')}>
                {sub.status === 'active' ? 'Change plan' : 'Choose a plan'}
              </Button>
              {sub.status === 'active' && !sub.cancel_at_period_end && (
                <Button variant="ghost" onClick={() => setShowCancelConfirm(true)} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel subscription'}
                </Button>
              )}
            </div>
          </Card>
        )}

        <SectionLabel><Receipt size={12} strokeWidth={2.4} /> Payment history</SectionLabel>
        {history === null && <div className="skel skel-line" style={{ width: '100%', height: 48 }} />}
        {history?.length === 0 && <EmptyState title="No payments yet" message="Your receipts will show up here once you're on a paid plan." />}
        {history?.map((p) => (
          <Card key={p.id} className="bl-payment-row">
            <IconTile icon={Receipt} tone={PAYMENT_STATUS_TONE[p.status]} size={32} />
            <div className="bl-payment-text">
              <strong>
                {p.tier[0].toUpperCase()}{p.tier.slice(1)} ({p.billing_interval}{p.extra_seats ? ` +${p.extra_seats} seats` : ''}) · {fmtNaira(p.amount_kobo)}
              </strong>
              <span>{fmtDate(p.paid_at || p.created_at)}</span>
            </div>
            <Pill tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Pill>
          </Card>
        ))}
          </>
        )}
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel your subscription?"
        body="You'll keep full access until the end of your current billing period. After that your plan won't renew."
        confirmLabel="Cancel subscription"
        tone="danger"
        busy={cancelling}
      />
    </>
  );
}
