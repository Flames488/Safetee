import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Users, UserPlus, Clock, ShieldCheck, XCircle, Lock, Ban, ArrowUpCircle, Search, Wallet,
} from 'lucide-react';
import TopBar from '../components/TopBar';
import {
  Card, Pill, Button, PasswordInput, SectionLabel, KpiCard, KpiCardSkeleton, CountUp,
  ConfirmDialog, ErrorState, EmptyState, SkeletonTable, useToast,
} from '../components/ui';
import { TrendChart, BreakdownBar } from '../components/charts';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './admin.css';

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const ROLE_TONE = { none: 'neutral', viewer: 'info', super_admin: 'good' };
const SUB_TONE = { trialing: 'info', active: 'good', past_due: 'warn', cancelled: 'warn', expired: 'bad' };
const STATUS_LABEL = { active: 'Active', trialing: 'Trialing', past_due: 'Past due', cancelled: 'Cancelling', expired: 'Expired', none: 'No subscription' };
const ROLE_LABEL = { none: 'No admin access', viewer: 'Viewer', super_admin: 'Super admin' };

// Buckets `created_at` from the already-fetched user list into one row per
// day for the last 30 days — the one real trend this data supports (no
// backend history endpoint exists, so this is entirely client-derived).
function buildSignupsTrend(users) {
  const DAYS = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ time: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: 0 });
  }
  const start = buckets[0].time;
  for (const u of users) {
    const created = new Date(u.created_at);
    created.setHours(0, 0, 0, 0);
    const idx = Math.round((created.getTime() - start) / 86_400_000);
    if (idx >= 0 && idx < buckets.length) buckets[idx].value += 1;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

function buildStatusBreakdown(users) {
  const counts = {};
  for (const u of users) {
    const key = u.subscription_status || 'none';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ label: STATUS_LABEL[key] || key, value, tone: SUB_TONE[key] || 'neutral' }));
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const isSuperAdmin = user?.admin_role === 'super_admin';

  const [stats, setStats] = useState(null); // null = loading, false = error
  const [users, setUsers] = useState(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null); // user being suspended, pending confirm

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    setStats(null);
    setUsers(null);
    api.adminStats().then(setStats).catch(() => setStats(false));
    api.adminUsers().then(setUsers).catch(() => setUsers(false));
  };
  useEffect(load, []);

  const signupsTrend = useMemo(() => (Array.isArray(users) ? buildSignupsTrend(users) : null), [users]);
  const statusBreakdown = useMemo(() => (Array.isArray(users) ? buildStatusBreakdown(users) : null), [users]);

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return users;
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.admin_role !== roleFilter) return false;
      if (statusFilter !== 'all' && (u.subscription_status || 'none') !== statusFilter) return false;
      if (!q) return true;
      return `${u.full_name} ${u.phone} ${u.email || ''}`.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter, statusFilter]);

  // This page is only reachable at all with viewer/super_admin — but a
  // direct URL visit before `user` has loaded shouldn't flash the panel
  // for a split second, so gate on the resolved role explicitly.
  if (user && user.admin_role === 'none') return <Navigate to="/app" replace />;

  const runAction = async (fn, userId, successMessage) => {
    if (!masterPassword) { setActionError('Enter the master password to make changes.'); return; }
    setActionError('');
    setBusyId(userId);
    try {
      const updated = await fn();
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      if (successMessage) toast(successMessage, { tone: 'good' });
    } catch (err) {
      toast(err.message || 'That action failed.', { tone: 'bad' });
    } finally {
      setBusyId(null);
      setConfirmTarget(null);
    }
  };

  const KPIS = stats && [
    { icon: Users, label: 'Total users', value: stats.total_users, tint: 'brand' },
    { icon: UserPlus, label: 'Signups (7d)', value: stats.signups_last_7_days, tint: 'info' },
    { icon: Clock, label: 'Active trials', value: stats.active_trials, tint: 'warn' },
    { icon: ShieldCheck, label: 'Active subscriptions', value: stats.active_subscriptions, tint: 'good' },
    { icon: XCircle, label: 'Cancelling', value: stats.cancelled_subscriptions, tint: 'danger' },
  ];

  return (
    <>
      <TopBar
        title="Admin"
        back={false}
        subtitle={isSuperAdmin ? 'Super admin — full access' : 'Viewer — read-only access'}
      />
      <div className="ad-body">
        {stats === false ? (
          <ErrorState message="Couldn't load platform stats right now." onRetry={load} />
        ) : (
          <div className="ad-hero-row">
            <Card className="ad-hero">
              <Wallet size={18} strokeWidth={2} className="ad-hero-icon" />
              <span className="ad-hero-label">Revenue this month</span>
              <div className="ad-hero-value">
                {stats ? (
                  <>
                    <span className="ad-hero-currency">₦</span>
                    <span className="stat-figure">
                      <CountUp value={stats.revenue_this_month_kobo / 100} format={(n) => Math.round(n).toLocaleString()} />
                    </span>
                  </>
                ) : <div className="skel skel-line ad-hero-skel" />}
              </div>
              <p className="ad-hero-sub">Successful payments, current calendar month</p>
            </Card>
            <div className="ad-kpi-grid">
              {KPIS ? KPIS.map((k) => <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} tint={k.tint} />)
                : Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)}
            </div>
          </div>
        )}

        <div className="ad-charts">
          <Card className="ad-chart-card">
            <SectionLabel>Signups — last 30 days</SectionLabel>
            {users === false && <ErrorState message="Couldn't load signup history." onRetry={load} />}
            {users === null && <div className="skel ad-chart-skel" />}
            {Array.isArray(users) && <TrendChart data={signupsTrend} />}
          </Card>
          <Card className="ad-chart-card">
            <SectionLabel>Subscription mix</SectionLabel>
            {users === false && <ErrorState message="Couldn't load subscription data." onRetry={load} />}
            {users === null && <div className="skel ad-chart-skel" />}
            {Array.isArray(users) && <BreakdownBar segments={statusBreakdown} />}
          </Card>
        </div>

        <div className="ad-table-head">
          <SectionLabel>All users</SectionLabel>
          <div className="ad-table-controls">
            <div className="ad-search">
              <Search size={14} strokeWidth={2.2} />
              <input placeholder="Search name, phone, email…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">Any role</option>
              <option value="none">No admin access</option>
              <option value="viewer">Viewer</option>
              <option value="super_admin">Super admin</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Any subscription</option>
              {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>

        {isSuperAdmin && (
          <Card className="ad-master">
            <Lock size={14} strokeWidth={2.2} />
            <PasswordInput
              value={masterPassword}
              onChange={(e) => { setMasterPassword(e.target.value); setActionError(''); }}
              placeholder="Master password — required to change anything below"
            />
          </Card>
        )}
        {actionError && <p className="ad-error" role="alert">{actionError}</p>}

        {users === null && <SkeletonTable rows={6} columns={3} />}
        {users === false && <ErrorState message="Couldn't load the user list right now." onRetry={load} />}
        {Array.isArray(filteredUsers) && filteredUsers.length === 0 && (
          <EmptyState title="No matching users" message="Try a different search term or filter." />
        )}
        {filteredUsers?.map((u) => (
          <Card key={u.id} className="ad-user-row">
            <div className="ad-user-info">
              <strong>{u.full_name}</strong>
              <span>{u.phone}{u.email ? ` · ${u.email}` : ''}</span>
              <span className="ad-user-joined">Joined {fmtDate(u.created_at)}</span>
            </div>
            <div className="ad-user-badges">
              <Pill tone={ROLE_TONE[u.admin_role]}>{u.admin_role.replace('_', ' ')}</Pill>
              {u.subscription_status && <Pill tone={SUB_TONE[u.subscription_status]}>{u.subscription_status}</Pill>}
              {!u.is_active && <Pill tone="bad">suspended</Pill>}
            </div>
            {isSuperAdmin && (
              <div className="ad-user-actions">
                {u.admin_role === 'none' && (
                  <Button size="sm" variant="secondary" disabled={busyId === u.id}
                    onClick={() => runAction(() => api.adminUpdateRole(u.id, 'viewer', masterPassword), u.id, `${u.full_name} is now a viewer`)}>
                    <ArrowUpCircle size={13} /> Make viewer
                  </Button>
                )}
                {u.admin_role === 'viewer' && (
                  <Button size="sm" variant="ghost" disabled={busyId === u.id}
                    onClick={() => runAction(() => api.adminUpdateRole(u.id, 'none', masterPassword), u.id, `Viewer access removed for ${u.full_name}`)}>
                    Remove viewer access
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={u.is_active ? 'outline-danger' : 'secondary'}
                  disabled={busyId === u.id}
                  onClick={() => {
                    if (u.is_active) setConfirmTarget(u);
                    else runAction(() => api.adminToggleSuspend(u.id, masterPassword), u.id, `${u.full_name} reactivated`);
                  }}
                >
                  <Ban size={13} /> {u.is_active ? 'Suspend' : 'Reactivate'}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && runAction(
          () => api.adminToggleSuspend(confirmTarget.id, masterPassword),
          confirmTarget.id,
          `${confirmTarget.full_name} suspended`,
        )}
        title="Suspend this account?"
        body={confirmTarget && `${confirmTarget.full_name} (${ROLE_LABEL[confirmTarget.admin_role]}) will immediately lose access until reactivated.`}
        confirmLabel="Suspend account"
        tone="danger"
        busy={busyId === confirmTarget?.id}
      />
    </>
  );
}
