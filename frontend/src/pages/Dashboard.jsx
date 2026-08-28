import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LocateFixed, MapPin, BatteryMedium, Users, Navigation, MessageSquare, Mic,
  ChevronRight, ShieldCheck, ShieldAlert, Clock, UserCheck, AlertCircle, Sparkles,
} from 'lucide-react';
import VitalRing from '../components/VitalRing';
import { Avatar, Card, Pill, Button, KpiCard, IconTile, EmptyState, SkeletonRow, ProgressDots } from '../components/ui';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { useReliability } from '../lib/useReliability';
import { timeAgo } from '../lib/time';
import { api } from '../lib/api';
import './dashboard.css';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function daysUntil(dateStr) {
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86_400_000));
}

function subscriptionBanner(sub, adminRole) {
  if (!sub) return null;
  // Viewer and super_admin accounts never see trial/payment prompts —
  // admin access to this app isn't tied to having a paid subscription.
  if (adminRole && adminRole !== 'none') return null;
  if (sub.status === 'trialing') {
    const days = daysUntil(sub.trial_ends_at);
    return {
      tone: days <= 3 ? 'warn' : 'info',
      text: days === 0 ? 'Free trial, ends today' : `Free trial, ${days} day${days === 1 ? '' : 's'} remaining`,
      detail: 'Full access to every feature during your trial. Choose a plan any time to keep your safety network active without interruption.',
      action: 'Choose a plan', to: '/app/settings/billing/choose-plan',
    };
  }
  if (sub.status === 'past_due') {
    return {
      tone: 'bad', text: 'Payment failed',
      detail: "Your last payment didn't go through. Update your billing details to avoid losing access.",
      action: 'Update billing', to: '/app/settings/billing',
    };
  }
  if (sub.status === 'expired') {
    return {
      tone: 'bad', text: 'Your plan has expired',
      detail: 'Choose a plan to restore full access to SOS alerts, journeys, and your trusted contacts.',
      action: 'Choose a plan', to: '/app/settings/billing/choose-plan',
    };
  }
  if (sub.status === 'active' && sub.cancel_at_period_end) {
    return {
      tone: 'warn',
      text: `Plan ends ${new Date(sub.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      detail: "You won't be charged again. Manage your plan any time before then to change your mind.",
      action: 'Manage plan', to: '/app/settings/billing',
    };
  }
  return null; // active, not cancelling — nothing to nag about
}

const CHECKING = { value: 'Checking…', tone: 'neutral' };

function permissionDisplay(state, readyLabel) {
  if (state === 'granted') return { value: readyLabel, tone: 'good' };
  if (state === 'denied') return { value: 'Blocked', tone: 'bad' };
  if (state === 'prompt') return { value: 'Tap to enable', tone: 'warn' };
  if (state === 'checking') return CHECKING;
  return { value: 'Unknown', tone: 'neutral' };
}

function batteryDisplay(battery) {
  if (battery === null) return CHECKING;
  if (battery === 'unsupported') return { value: 'Not available', tone: 'neutral' };
  const pct = Math.round(battery.level * 100);
  return { value: pct, suffix: '%', tone: pct < 20 ? 'warn' : 'good' };
}

function contactsDisplay(contacts) {
  if (contacts === null) return CHECKING;
  if (contacts.length === 0) return { value: 'None added', tone: 'warn' };
  const verified = contacts.filter((c) => c.is_verified).length;
  return { value: `${verified}/${contacts.length} verified`, tone: verified === contacts.length ? 'good' : 'warn' };
}

function journeyDisplay(active) {
  if (active === null) return CHECKING;
  return active ? { value: 'Active', tone: 'info' } : { value: 'Inactive', tone: 'neutral' };
}

function smsDisplay(ready) {
  if (ready === null) return CHECKING;
  return ready ? { value: 'Ready', tone: 'good' } : { value: 'Not configured', tone: 'warn' };
}

const TONE_TINT = { good: 'good', warn: 'warn', bad: 'danger', info: 'info', neutral: 'brand' };

const ACTIVITY_META = {
  journey: {
    active: { title: 'Journey in progress', tone: 'info' },
    arrived: { title: 'Journey completed safely', tone: 'good' },
    escalated: { title: 'Journey escalated: missed check-in', tone: 'bad' },
    cancelled: { title: 'Journey cancelled', tone: 'neutral' },
  },
  sos: {
    pending: { title: 'SOS alert triggered', tone: 'bad' },
    active: { title: 'SOS alert active', tone: 'bad' },
    resolved: { title: 'SOS alert resolved', tone: 'good' },
    cancelled: { title: 'SOS alert cancelled', tone: 'neutral' },
  },
};

const TIPS = [
  { icon: UserCheck, text: 'Keep at least one trusted contact verified: confirming their number first makes delivery more reliable.' },
  { icon: Navigation, text: 'Start a Safe Journey before walking somewhere unfamiliar, even a short distance. It costs nothing and checks in automatically.' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gps, mic, battery, contacts, journeyActive, smsReady, activity, requestGps, requestMic } = useReliability();
  const firstName = user?.full_name?.split(' ')[0];

  const [sub, setSub] = useState(null);
  const [incomingAlerts, setIncomingAlerts] = useState([]);
  const [locationActivity, setLocationActivity] = useState({ requests: [], viewing: [] });

  // The button's own label ("HOLD FOR SOS") and hint text already promise
  // a 2s hold, not a tap — same pattern as SOSActive's hold-to-cancel/
  // hold-to-mark-safe (see its user-select CSS comment for why touch
  // devices need this: a long-press otherwise triggers the browser's own
  // text-selection/copy popup instead of registering as a hold).
  const sosHoldTimer = useRef(null);
  const startSosHold = () => {
    sosHoldTimer.current = setTimeout(() => navigate('/app/sos'), 2000);
  };
  const endSosHold = () => clearTimeout(sosHoldTimer.current);
  useEffect(() => () => clearTimeout(sosHoldTimer.current), []);

  useEffect(() => {
    api.getSubscription().then(setSub).catch(() => {});
  }, []);

  // Polls rather than fetching once — this banner is explicitly the
  // fallback for a silently-failed push notification (denied permission,
  // browser quirk, rotated subscription), so it has to actually refresh
  // while the user is sitting on this screen, not just show whatever was
  // true at the moment the page loaded.
  useEffect(() => {
    let cancelled = false;
    let latestRequestId = 0;
    const load = () => {
      const requestId = ++latestRequestId;
      api.getIncomingAlerts()
        .then((data) => {
          // A slower earlier request resolving after a faster later one
          // would otherwise clobber fresher data with stale data.
          if (!cancelled && requestId === latestRequestId) setIncomingAlerts(data);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Same reasoning as the alerts poll above — a location request or an
  // accepted share only ever reaches the requester/viewer through this
  // Dashboard banner or the Network tab, since neither sends SMS the way
  // SOS alerts do, so there's no fallback channel if push doesn't land.
  // Polls faster than the alerts effect (8s vs 20s) since this is
  // currently the only confirmation a requester gets that a request was
  // accepted.
  useEffect(() => {
    let cancelled = false;
    let latestRequestId = 0;
    const load = () => {
      const requestId = ++latestRequestId;
      Promise.all([
        api.getIncomingLocationRequests().catch(() => []),
        api.getViewingShares().catch(() => []),
      ]).then(([requests, viewing]) => {
        if (!cancelled && requestId === latestRequestId) setLocationActivity({ requests, viewing });
      });
    };
    load();
    const interval = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const planBanner = subscriptionBanner(sub, user?.admin_role);
  // A live emergency from someone who trusts this user as a contact
  // outranks every other banner on this page — surfaced here, not just
  // buried in the Alerts tab, since push notifications can fail silently
  // (denied permission, browser quirks) and this is the fallback.
  const activeIncoming = incomingAlerts.filter((a) => a.status === 'pending' || a.status === 'active');

  const RELIABILITY = [
    { icon: LocateFixed, label: 'GPS', ...permissionDisplay(gps, 'Connected'), onClick: gps === 'prompt' ? requestGps : null },
    { icon: BatteryMedium, label: 'Battery', ...batteryDisplay(battery) },
    { icon: Users, label: 'Emergency contacts', ...contactsDisplay(contacts), onClick: contacts?.length === 0 ? () => navigate('/app/contacts') : null },
    { icon: Navigation, label: 'Journey', ...journeyDisplay(journeyActive) },
    { icon: MessageSquare, label: 'SMS backup', ...smsDisplay(smsReady) },
    { icon: Mic, label: 'Recording', ...permissionDisplay(mic, 'Ready'), onClick: mic === 'prompt' ? requestMic : null },
  ];

  const hasContacts = contacts !== null && contacts.length > 0;
  const protectedState = hasContacts;

  const [tipIndex, setTipIndex] = useState(0);
  const goToTip = (i) => setTipIndex(((i % TIPS.length) + TIPS.length) % TIPS.length);
  // Restarting the timer on every change (auto or manual) means a swipe or
  // dot tap always buys a fresh 7s before the next auto-advance, instead of
  // fighting whatever was already in flight.
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 7000);
    return () => clearInterval(interval);
  }, [tipIndex]);
  const tip = TIPS[tipIndex];

  const tipTouchStart = useRef(null);
  const handleTipTouchStart = (e) => { tipTouchStart.current = e.touches[0].clientX; };
  const handleTipTouchEnd = (e) => {
    const startX = tipTouchStart.current;
    tipTouchStart.current = null;
    if (startX === null) return;
    const deltaX = e.changedTouches[0].clientX - startX;
    const SWIPE_THRESHOLD = 40;
    if (deltaX <= -SWIPE_THRESHOLD) { e.preventDefault(); goToTip(tipIndex + 1); }
    else if (deltaX >= SWIPE_THRESHOLD) { e.preventDefault(); goToTip(tipIndex - 1); }
  };

  return (
    <>
      <div className="dash">
        <div className="dash-hero">
          <div className="dash-hero-glow" aria-hidden="true" />
          <div className="dash-hero-top">
            <div>
              <p className="dash-eyebrow mono"><Sparkles size={12} strokeWidth={2.4} /> {greeting()}</p>
              <h1 className="dash-name">{firstName || 'there'}</h1>
            </div>
            <button className="dash-avatar chip-gradient mono avatar-slot" onClick={() => navigate('/app/profile')} aria-label="Open profile">
              <Avatar src={user?.avatar_url} name={user?.full_name} />
            </button>
          </div>

          <div className={`dash-status-row dash-status-${protectedState ? 'good' : 'warn'}`}>
            <span className="dash-status-icon">
              {protectedState ? <ShieldCheck size={17} strokeWidth={2.2} /> : <ShieldAlert size={17} strokeWidth={2.2} />}
            </span>
            <span className="dash-status-text">
              {protectedState ? "You're protected, monitoring active" : 'Add a trusted contact to get protected'}
            </span>
            {!protectedState && (
              <button className="dash-status-cta" onClick={() => navigate('/app/contacts')}>
                Add contact <ChevronRight size={13} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        {activeIncoming.length > 0 && (
          <div className="dash-billing-card dash-billing-bad">
            <IconTile icon={ShieldAlert} tone="bad" size={36} />
            <div className="dash-billing-text">
              <strong>
                {activeIncoming.length === 1
                  ? `${activeIncoming[0].alerter_name} triggered an emergency alert`
                  : `${activeIncoming.length} active emergency alerts`}
              </strong>
              <span>Someone who trusts you as a contact may need help right now.</span>
            </div>
            <Button size="sm" variant="primary" onClick={() => navigate('/app/alerts')}>View</Button>
          </div>
        )}

        {(locationActivity.requests.length > 0 || locationActivity.viewing.length > 0) && (
          <div className="dash-billing-card dash-billing-info">
            <IconTile icon={LocateFixed} tone="info" size={36} />
            <div className="dash-billing-text">
              <strong>
                {locationActivity.requests.length > 0
                  ? (locationActivity.requests.length === 1
                    ? `${locationActivity.requests[0].viewer_name} wants to see your location`
                    : `${locationActivity.requests.length} location requests waiting`)
                  : (locationActivity.viewing.length === 1
                    ? `${locationActivity.viewing[0].owner_name} is sharing their location with you`
                    : `${locationActivity.viewing.length} people sharing their location with you`)}
              </strong>
              <span>Open Network to respond or view live.</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/app/alerts')}>View</Button>
          </div>
        )}

        {planBanner && (
          <div className={`dash-billing-card dash-billing-${planBanner.tone}`}>
            <IconTile icon={AlertCircle} tone={planBanner.tone} size={36} />
            <div className="dash-billing-text">
              <strong>{planBanner.text}</strong>
              <span>{planBanner.detail}</span>
            </div>
            <Button size="sm" variant={planBanner.tone === 'bad' ? 'primary' : 'secondary'} onClick={() => navigate(planBanner.to)}>
              {planBanner.action}
            </Button>
          </div>
        )}

        {/* Status strip — reads like a system's vitals, using the shared
            KpiCard primitive so this feels like the same "product" as
            the admin dashboard, not a different mobile-widget style. */}
        <div className="dash-reliability">
          {RELIABILITY.map((r) => {
            const clickable = Boolean(r.onClick);
            return (
              <div
                key={r.label}
                className={`dash-kpi-wrap ${clickable ? 'dash-kpi-clickable' : ''}`}
                onClick={r.onClick || undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
              >
                <KpiCard
                  icon={r.icon}
                  label={r.label}
                  value={r.value}
                  tint={TONE_TINT[r.tone]}
                  format={(n) => `${Math.round(n)}${r.suffix || ''}`}
                />
              </div>
            );
          })}
        </div>

        {/* Below the fold: primary controls on the left, live feed on the
            right — a command-center layout on desktop, a single stacked
            column on mobile (see dashboard.css). */}
        <div className="dash-body">
          <div className="dash-col-main">
            <Card className="dash-sos-card">
              <button
                className="dash-sos-btn"
                onMouseDown={startSosHold} onMouseUp={endSosHold} onMouseLeave={endSosHold}
                onTouchStart={startSosHold} onTouchEnd={endSosHold}
              >
                <VitalRing size={172} color="green">
                  <span className="dash-sos-core">
                    <span className="dash-sos-inner mono">HOLD FOR<br /><strong>SOS</strong></span>
                  </span>
                </VitalRing>
              </button>
              <p className="dash-sos-hint">Press and hold 2 seconds to alert your trusted contacts</p>
            </Card>

            <Button full size="lg" icon={<Navigation size={17} />} onClick={() => navigate('/app/journey')}>
              Start Safe Journey
            </Button>

            <Button full variant="secondary" icon={<LocateFixed size={17} />} onClick={() => navigate('/app/share-location')}>
              Share my location
            </Button>

            <Button full variant="secondary" icon={<MapPin size={17} />} onClick={() => navigate('/app/contacts')}>
              Request a location
            </Button>
          </div>

          <div className="dash-col-side">
            <div className="dash-section-head">
              <span className="section-label"><Clock size={12} strokeWidth={2.4} /> Recent activity</span>
            </div>
            {activity === null && <Card className="dash-activity"><SkeletonRow columns={2} /></Card>}
            {activity !== null && activity.length === 0 && (
              <EmptyState title="Nothing yet" message="Your journeys and alerts will show up here." />
            )}
            {activity?.map((item) => {
              const meta = ACTIVITY_META[item.kind][item.status] || { title: item.status, tone: 'neutral' };
              const Icon = item.kind === 'sos' ? ShieldAlert : Navigation;
              return (
                <Card key={item.id} className="dash-activity">
                  <IconTile icon={Icon} tone={meta.tone} size={32} />
                  <div className="dash-activity-text">
                    <strong>{meta.title}</strong>
                    <span>
                      {item.kind === 'journey' && item.destination_label ? `${item.destination_label} · ` : ''}
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </Card>
              );
            })}

            <div className="dash-section-head">
              <span className="section-label"><UserCheck size={12} strokeWidth={2.4} /> Trusted contacts</span>
              <button className="dash-section-link" onClick={() => navigate('/app/contacts')}>
                View all <ChevronRight size={13} strokeWidth={2.4} />
              </button>
            </div>
            {contacts === null && <Card className="dash-contact-row"><SkeletonRow columns={2} /></Card>}
            {contacts !== null && contacts.length === 0 && (
              <EmptyState
                title="No trusted contacts yet"
                message="Add someone to be notified the moment you trigger an alert."
                action={<Button size="sm" onClick={() => navigate('/app/contacts')}>Add your first one</Button>}
              />
            )}
            {contacts?.slice(0, 3).map((c) => (
              <Card key={c.id} interactive className="dash-contact-row" onClick={() => navigate('/app/contacts')}>
                <span className="dash-contact-avatar chip-gradient mono"><Avatar src={c.avatar_url} name={c.name} /></span>
                <span className="dash-contact-text">
                  <strong>{c.name}</strong>
                  <span>{c.relationship_label || 'Trusted contact'}</span>
                </span>
                {c.is_verified
                  ? <Pill tone="good">Verified</Pill>
                  : <Pill tone="warn">Unverified</Pill>}
              </Card>
            ))}
          </div>
        </div>

        <div className="dash-section-head">
          <span className="section-label">Safety tips</span>
        </div>
        <div
          className="dash-tip-promo"
          onClick={() => goToTip(tipIndex + 1)}
          onTouchStart={handleTipTouchStart}
          onTouchEnd={handleTipTouchEnd}
          role="button"
          tabIndex={0}
        >
          <div className="dash-tip-promo-glow" aria-hidden="true" />
          <IconTile icon={tip.icon} tone="brand" size={40} />
          <p key={tipIndex} className="dash-tip-promo-text">{tip.text}</p>
          <ProgressDots total={TIPS.length} active={tipIndex} onSelect={goToTip} />
        </div>
      </div>
      <BottomNav />
    </>
  );
}
