import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LocateFixed, BatteryMedium, Users, Navigation, MessageSquare, Mic,
  ChevronRight, User, ShieldAlert, ShieldCheck, Lightbulb, Clock, UserCheck, AlertCircle,
} from 'lucide-react';
import VitalRing from '../components/VitalRing';
import { Card, Pill, Button } from '../components/ui';
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
      text: days === 0 ? 'Free trial — ends today' : `Free trial — ${days} day${days === 1 ? '' : 's'} remaining`,
      detail: 'Full access to every feature during your trial. Choose a plan any time to keep your safety network active without interruption.',
      action: 'Choose a plan', to: '/app/settings/billing/choose-plan',
    };
  }
  if (sub.status === 'past_due') {
    return {
      tone: 'bad', text: 'Payment failed',
      detail: "Your last payment didn't go through — update your billing details to avoid losing access.",
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
  return { value: `${pct}%`, tone: pct < 20 ? 'warn' : 'good' };
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

const ACTIVITY_META = {
  journey: {
    active: { title: 'Journey in progress', tone: 'info' },
    arrived: { title: 'Journey completed safely', tone: 'good' },
    escalated: { title: 'Journey escalated — missed check-in', tone: 'bad' },
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
  'Test your hidden trigger (fake PIN, power button, or gesture) somewhere safe so it becomes muscle memory.',
  'Keep at least one trusted contact verified — an unverified contact can still be alerted, but confirming their number first makes delivery more reliable.',
  'Start a Safe Journey before walking somewhere unfamiliar, even a short distance — it costs nothing and checks in automatically.',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gps, mic, battery, contacts, journeyActive, smsReady, activity, requestGps, requestMic } = useReliability();
  const firstName = user?.full_name?.split(' ')[0];
  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [sub, setSub] = useState(null);

  useEffect(() => {
    api.getSubscription().then(setSub).catch(() => {});
  }, []);

  const planBanner = subscriptionBanner(sub, user?.admin_role);

  const RELIABILITY = [
    { icon: LocateFixed, label: 'GPS', ...permissionDisplay(gps, 'Connected'), onClick: gps === 'prompt' ? requestGps : null },
    { icon: BatteryMedium, label: 'Battery', ...batteryDisplay(battery) },
    { icon: Users, label: 'Emergency contacts', ...contactsDisplay(contacts), onClick: contacts?.length === 0 ? () => navigate('/app/contacts') : null },
    { icon: Navigation, label: 'Journey', ...journeyDisplay(journeyActive) },
    { icon: MessageSquare, label: 'SMS backup', ...smsDisplay(smsReady) },
    { icon: Mic, label: 'Recording', ...permissionDisplay(mic, 'Ready'), onClick: mic === 'prompt' ? requestMic : null },
  ];

  const hasContacts = contacts !== null && contacts.length > 0;
  const protectedBanner = hasContacts
    ? { tone: 'good', text: "You're protected · monitoring active" }
    : { tone: 'warn', text: 'Add a trusted contact to get protected' };

  return (
    <>
      <div className="dash">
        <div className="dash-header">
          <div>
            <p className="dash-eyebrow mono">{greeting()}</p>
            <h1 className="dash-name">{firstName || 'there'}</h1>
          </div>
          <button className="dash-avatar mono" onClick={() => navigate('/app/profile')} aria-label="Open profile">
            {initials || <User size={18} strokeWidth={2} />}
          </button>
        </div>

        <div className={`dash-status-hero dash-status-${protectedBanner.tone}`}>
          <span className="dash-status-icon">
            {protectedBanner.tone === 'good' ? <ShieldCheck size={20} strokeWidth={2.2} /> : <ShieldAlert size={20} strokeWidth={2.2} />}
          </span>
          <span className="dash-status-text">{protectedBanner.text}</span>
        </div>

        {planBanner && (
          <div className={`dash-billing-card dash-billing-${planBanner.tone}`}>
            <span className="dash-billing-icon"><AlertCircle size={18} strokeWidth={2.2} /></span>
            <div className="dash-billing-text">
              <strong>{planBanner.text}</strong>
              <span>{planBanner.detail}</span>
            </div>
            <Button size="sm" variant={planBanner.tone === 'bad' ? 'primary' : 'secondary'} onClick={() => navigate(planBanner.to)}>
              {planBanner.action}
            </Button>
          </div>
        )}

        {/* Status strip — reads like a system's vitals, not a mobile widget list */}
        <div className="dash-reliability">
          {RELIABILITY.map((r) => {
            const Tag = r.onClick ? 'button' : 'div';
            return (
              <Tag
                key={r.label}
                className={`dash-rel-card dash-rel-${r.tone} ${r.onClick ? 'dash-rel-actionable' : ''}`}
                onClick={r.onClick || undefined}
              >
                <span className="dash-rel-icon"><r.icon size={15} strokeWidth={2.2} /></span>
                <span className="dash-rel-label">{r.label}</span>
                <span className="dash-rel-value">{r.value}</span>
              </Tag>
            );
          })}
        </div>

        {/* Below the fold: primary controls on the left, live feed on the
            right — a command-center layout on desktop, a single stacked
            column on mobile (see dashboard.css). */}
        <div className="dash-body">
          <div className="dash-col-main">
            <Card className="dash-sos-card">
              <button className="dash-sos-btn" onClick={() => navigate('/app/sos')}>
                <VitalRing size={168} color="green">
                  <span className="dash-sos-inner mono">HOLD FOR<br /><strong>SOS</strong></span>
                </VitalRing>
              </button>
              <p className="dash-sos-hint">Press and hold 2 seconds to alert your trusted contacts</p>
            </Card>

            <Button full size="lg" icon={<Navigation size={17} />} onClick={() => navigate('/app/journey')}>
              Start Safe Journey
            </Button>
          </div>

          <div className="dash-col-side">
            <div className="dash-section-head">
              <span className="section-label"><Clock size={12} strokeWidth={2.4} /> Recent activity</span>
            </div>
            {activity === null && <Card className="dash-activity-empty">Loading…</Card>}
            {activity !== null && activity.length === 0 && (
              <Card className="dash-activity-empty">Nothing yet — your journeys and alerts will show up here.</Card>
            )}
            {activity?.map((item) => {
              const meta = ACTIVITY_META[item.kind][item.status] || { title: item.status, tone: 'neutral' };
              const Icon = item.kind === 'sos' ? ShieldAlert : Navigation;
              return (
                <Card key={item.id} className="dash-activity">
                  <span className={`dash-activity-icon dash-activity-${meta.tone}`}><Icon size={15} strokeWidth={2.1} /></span>
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
            {contacts === null && <Card className="dash-activity-empty">Loading…</Card>}
            {contacts !== null && contacts.length === 0 && (
              <Card className="dash-activity-empty">
                No trusted contacts yet.{' '}
                <button className="dash-inline-link" onClick={() => navigate('/app/contacts')}>Add your first one</button>
              </Card>
            )}
            {contacts?.slice(0, 3).map((c) => (
              <Card key={c.id} className="dash-contact-row">
                <span className="dash-contact-avatar mono">{c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span>
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
        <div className="dash-tips">
          {TIPS.map((tip) => (
            <Card key={tip} className="dash-tip">
              <Lightbulb size={19} strokeWidth={2} color="var(--amber)" />
              <p>{tip}</p>
            </Card>
          ))}
        </div>
      </div>
      <BottomNav />
    </>
  );
}
