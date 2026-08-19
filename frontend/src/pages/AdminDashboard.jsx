import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Users, UserPlus, Clock, ShieldCheck, XCircle, Lock, Search, Wallet, History, ArrowLeft,
} from 'lucide-react';
import TopBar from '../components/TopBar';
import {
  Card, Pill, Button, PasswordInput, SectionLabel, KpiCard, KpiCardSkeleton, CountUp,
  Modal, ReasonConfirmDialog, Drawer, ErrorState, EmptyState, SkeletonTable, SkeletonRow, useToast,
} from '../components/ui';
import { TrendChart, BreakdownBar } from '../components/charts';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './admin.css';

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
// Whole days remaining, rounded up — "1 day left" for anything under 24h
// still reads as "not expired yet" rather than "0 days left".
function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

const ROLE_TONE = { none: 'neutral', viewer: 'info', super_admin: 'good' };
const SUB_TONE = { trialing: 'info', active: 'good', past_due: 'warn', cancelled: 'warn', expired: 'bad' };
const STATUS_LABEL = { active: 'Active', trialing: 'Trialing', past_due: 'Past due', cancelled: 'Cancelling', expired: 'Expired', none: 'No subscription' };
const ROLE_LABEL = { none: 'No admin access', viewer: 'Viewer', super_admin: 'Super admin' };
const ACCOUNT_TONE = { active: 'good', suspended: 'warn', banned: 'bad' };
const ACCOUNT_LABEL = { active: 'Active', suspended: 'Suspended', banned: 'Banned' };
const ACTION_LABEL = {
  role_change: 'Role changed', suspend: 'Suspended', ban: 'Banned', reinstate: 'Reinstated',
  grant_trial: 'Trial granted', soft_delete: 'Deleted', restore: 'Restored', force_logout: 'Forced logout',
};

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

  const [view, setView] = useState('users'); // 'users' | 'audit-log'
  const [stats, setStats] = useState(null); // null = loading, false = error
  const [users, setUsers] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [actionError, setActionError] = useState('');

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);

  const [detailId, setDetailId] = useState(null); // user id the drawer is open for
  const [detail, setDetail] = useState(null); // null = loading, false = error
  const [actionModal, setActionModal] = useState(null); // { type, reason, days, busy }
  const [roleBusy, setRoleBusy] = useState(false); // role change has no modal/reason, just its own busy flag

  const loadUsers = () => {
    setUsers(null);
    api.adminUsers({
      statusFilter: accountFilter === 'all' ? undefined : accountFilter,
      trialExpiringWithinDays: expiringSoonOnly ? 7 : undefined,
    }).then(setUsers).catch(() => setUsers(false));
  };
  const loadStats = () => {
    setStats(null);
    api.adminStats().then(setStats).catch(() => setStats(false));
  };
  // Stats load once; users load on mount *and* whenever a server-side
  // filter changes — one effect handles both cases instead of this firing
  // twice on mount (loadUsers called directly here, then again by a
  // separate effect keyed on the filters, which also always runs once on
  // mount regardless of its dependency list).
  useEffect(loadStats, []);
  useEffect(loadUsers, [accountFilter, expiringSoonOnly]);
  const load = () => { loadStats(); loadUsers(); };

  const loadAuditLog = () => {
    setAuditLog(null);
    api.adminAuditLog().then(setAuditLog).catch(() => setAuditLog(false));
  };
  useEffect(() => { if (view === 'audit-log' && auditLog === null) loadAuditLog(); }, [view]);

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

  const openDetail = (userId) => {
    setDetailId(userId);
    setDetail(null);
    api.adminUserDetail(userId).then(setDetail).catch(() => setDetail(false));
  };
  const closeDetail = () => { setDetailId(null); setDetail(null); setActionModal(null); };

  const applyUpdate = (updated) => {
    setUsers((list) => (Array.isArray(list) ? list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)) : list));
    setDetail((d) => (d ? { ...d, ...updated } : d));
  };

  const runAction = async (fn, successMessage) => {
    if (!masterPassword) { setActionError('Enter the master password to make changes.'); return; }
    setActionError('');
    setActionModal((m) => ({ ...m, busy: true }));
    try {
      const updated = await fn();
      applyUpdate(updated);
      toast(successMessage, { tone: 'good' });
      setActionModal(null);
    } catch (err) {
      toast(err.message || 'That action failed.', { tone: 'bad' });
      setActionModal((m) => ({ ...m, busy: false }));
    }
  };

  const runRoleChange = async (fn, successMessage) => {
    if (!masterPassword) { setActionError('Enter the master password to make changes.'); return; }
    setActionError('');
    setRoleBusy(true);
    try {
      applyUpdate(await fn());
      toast(successMessage, { tone: 'good' });
    } catch (err) {
      toast(err.message || 'That action failed.', { tone: 'bad' });
    } finally {
      setRoleBusy(false);
    }
  };

  const target = detail || users?.find((u) => u.id === detailId);

  const ACTIONS = {
    suspend: {
      title: 'Suspend this account?', confirmLabel: 'Suspend', tone: 'danger', reasonRequired: true,
      body: target && `${target.full_name} will immediately lose access until reinstated.`,
      run: (reason) => runAction(() => api.adminSuspend(target.id, masterPassword, reason), `${target.full_name} suspended`),
    },
    ban: {
      title: 'Ban this account?', confirmLabel: 'Ban', tone: 'danger', reasonRequired: true,
      body: target && `${target.full_name} will immediately lose access. This is meant for cause — use Suspend for anything temporary.`,
      run: (reason) => runAction(() => api.adminBan(target.id, masterPassword, reason), `${target.full_name} banned`),
    },
    reinstate: {
      title: 'Reinstate this account?', confirmLabel: 'Reinstate', tone: 'primary', reasonRequired: false,
      body: target && `${target.full_name} will regain access immediately.`,
      run: (reason) => runAction(() => api.adminReinstate(target.id, masterPassword, reason), `${target.full_name} reinstated`),
    },
    'force-logout': {
      title: 'Force logout?', confirmLabel: 'Force logout', tone: 'danger', reasonRequired: false,
      body: target && `Every device currently signed in to ${target.full_name}'s account will be signed out. They can log back in right away.`,
      run: (reason) => runAction(() => api.adminForceLogout(target.id, masterPassword, reason), `${target.full_name} logged out everywhere`),
    },
    delete: {
      title: 'Delete this account?', confirmLabel: 'Delete', tone: 'danger', reasonRequired: true,
      body: target && `${target.full_name} will immediately lose access. The account is kept for 30 days in case this needs reversing, then permanently deleted.`,
      run: (reason) => runAction(() => api.adminDeleteUser(target.id, masterPassword, reason), `${target.full_name} deleted (recoverable for 30 days)`),
    },
    restore: {
      title: 'Restore this account?', confirmLabel: 'Restore', tone: 'primary', reasonRequired: false,
      body: target && `${target.full_name} will regain access immediately and won't be auto-purged.`,
      run: (reason) => runAction(() => api.adminRestoreUser(target.id, masterPassword, reason), `${target.full_name} restored`),
    },
  };
  const activeAction = actionModal && ACTIONS[actionModal.type];

  const handleGrantTrial = () => {
    if (!masterPassword) { setActionError('Enter the master password to make changes.'); return; }
    setActionError('');
    setActionModal((m) => ({ ...m, busy: true }));
    api.adminGrantTrial(target.id, masterPassword, actionModal.days)
      .then((updated) => { applyUpdate(updated); toast(`${target.full_name} granted ${actionModal.days} more days`, { tone: 'good' }); setActionModal(null); })
      .catch((err) => { toast(err.message || 'That action failed.', { tone: 'bad' }); setActionModal((m) => ({ ...m, busy: false })); });
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
        subtitle={isSuperAdmin ? 'Super admin — full access' : 'Viewer — read-only access'}
        action={
          <Button size="sm" variant={view === 'audit-log' ? 'secondary' : 'ghost'} onClick={() => setView(view === 'audit-log' ? 'users' : 'audit-log')}>
            {view === 'audit-log' ? <><ArrowLeft size={13} /> Back to users</> : <><History size={13} /> Audit log</>}
          </Button>
        }
      />
      <div className="ad-body">
        {view === 'audit-log' ? (
          <>
            <SectionLabel>Admin audit log</SectionLabel>
            {auditLog === null && <SkeletonTable rows={8} columns={3} />}
            {auditLog === false && <ErrorState message="Couldn't load the audit log right now." onRetry={loadAuditLog} />}
            {Array.isArray(auditLog) && auditLog.length === 0 && (
              <EmptyState title="Nothing here yet" message="Admin actions (suspend, ban, grant trial, etc.) will show up here as they happen." />
            )}
            {auditLog?.map((e) => (
              <Card key={e.id} className="ad-audit-row">
                <div className="ad-audit-info">
                  <strong>{ACTION_LABEL[e.action] || e.action}</strong>
                  <span>{e.target_user_name || '(deleted account)'} · by {e.admin_name || '(removed admin)'}</span>
                  {e.reason && <span className="ad-audit-reason">"{e.reason}"</span>}
                </div>
                <span className="ad-audit-time mono">{fmtDateTime(e.created_at)}</span>
              </Card>
            ))}
          </>
        ) : (
          <>
        {stats === false ? (
          <ErrorState message="Couldn't load platform stats right now." onRetry={load} />
        ) : (
          <div className="ad-hero-row">
            <Card className="ad-hero">
              <Wallet size={148} strokeWidth={1.2} className="ad-hero-watermark" aria-hidden="true" />
              <div className="ad-hero-top">
                <Wallet size={18} strokeWidth={2} className="ad-hero-icon" />
                <span className="ad-hero-label">Revenue this month</span>
              </div>
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
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="all">Any account status</option>
              {Object.entries(ACCOUNT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <Button
              size="sm" variant={expiringSoonOnly ? 'secondary' : 'ghost'}
              onClick={() => setExpiringSoonOnly((v) => !v)}
            >
              <Clock size={13} /> Trial expiring ≤7d
            </Button>
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
        {filteredUsers?.map((u) => {
          const trialDays = u.subscription_status === 'trialing' ? daysUntil(u.trial_ends_at) : null;
          return (
            <Card key={u.id} className="ad-user-row" interactive onClick={() => openDetail(u.id)}>
              <div className="ad-user-info">
                <strong>{u.full_name}</strong>
                <span>{u.phone}{u.email ? ` · ${u.email}` : ''}</span>
                <span className="ad-user-joined">Joined {fmtDate(u.created_at)} · Last active {fmtDateTime(u.last_active_at)}</span>
              </div>
              <div className="ad-user-badges">
                <Pill tone={ROLE_TONE[u.admin_role]}>{u.admin_role.replace('_', ' ')}</Pill>
                {u.subscription_status && <Pill tone={SUB_TONE[u.subscription_status]}>{u.subscription_status}</Pill>}
                {trialDays !== null && <Pill tone={trialDays <= 3 ? 'bad' : 'warn'}>{trialDays > 0 ? `Trial: ${trialDays}d left` : 'Trial expired'}</Pill>}
                {u.account_status !== 'active' && <Pill tone={ACCOUNT_TONE[u.account_status]}>{ACCOUNT_LABEL[u.account_status]}</Pill>}
                {u.deleted_at && <Pill tone="bad">deleted</Pill>}
              </div>
              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openDetail(u.id); }}>Manage</Button>
            </Card>
          );
        })}
          </>
        )}
      </div>

      <Drawer open={Boolean(detailId)} onClose={closeDetail} title={target?.full_name || 'User detail'}>
        {detail === false && <ErrorState message="Couldn't load this user right now." onRetry={() => openDetail(detailId)} />}
        {detail === null && <SkeletonRow columns={2} />}
        {target && (
          <>
            <div className="ad-detail-meta">
              <span>{target.phone}{target.email ? ` · ${target.email}` : ''}</span>
              <span>Joined {fmtDate(target.created_at)}</span>
              <span>Last login {fmtDateTime(target.last_login_at)}</span>
              <span>Last active {fmtDateTime(target.last_active_at)}</span>
            </div>
            <div className="ad-user-badges">
              <Pill tone={ROLE_TONE[target.admin_role]}>{ROLE_LABEL[target.admin_role]}</Pill>
              <Pill tone={ACCOUNT_TONE[target.account_status]}>{ACCOUNT_LABEL[target.account_status]}</Pill>
              {target.subscription_status && <Pill tone={SUB_TONE[target.subscription_status]}>{STATUS_LABEL[target.subscription_status]}</Pill>}
              {target.trial_ends_at && <Pill tone="info">Trial ends {fmtDate(target.trial_ends_at)}</Pill>}
              {target.deleted_at && <Pill tone="bad">Deleted {fmtDate(target.deleted_at)}</Pill>}
            </div>

            {isSuperAdmin && (
              <>
                <SectionLabel>Actions</SectionLabel>
                <div className="ad-detail-actions">
                  {target.admin_role === 'none' && (
                    <Button size="sm" variant="secondary" disabled={roleBusy}
                      onClick={() => runRoleChange(() => api.adminUpdateRole(target.id, 'viewer', masterPassword), `${target.full_name} is now a viewer`)}>
                      Make viewer
                    </Button>
                  )}
                  {target.admin_role === 'viewer' && (
                    <Button size="sm" variant="ghost" disabled={roleBusy}
                      onClick={() => runRoleChange(() => api.adminUpdateRole(target.id, 'none', masterPassword), `Viewer access removed for ${target.full_name}`)}>
                      Remove viewer access
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setActionModal({ type: 'trial', days: 7, busy: false })}>
                    Grant free trial
                  </Button>
                  {target.account_status === 'active' ? (
                    <>
                      <Button size="sm" variant="outline-danger" onClick={() => setActionModal({ type: 'suspend', reason: '', busy: false })}>Suspend</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => setActionModal({ type: 'ban', reason: '', busy: false })}>Ban</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setActionModal({ type: 'reinstate', reason: '', busy: false })}>Reinstate</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setActionModal({ type: 'force-logout', reason: '', busy: false })}>Force logout</Button>
                  {target.deleted_at ? (
                    <Button size="sm" variant="secondary" onClick={() => setActionModal({ type: 'restore', reason: '', busy: false })}>Restore</Button>
                  ) : (
                    <Button size="sm" variant="outline-danger" onClick={() => setActionModal({ type: 'delete', reason: '', busy: false })}>Delete account</Button>
                  )}
                </div>
              </>
            )}

            <SectionLabel>Recent logins</SectionLabel>
            {target.login_history?.length ? (
              <div className="ad-login-history">
                {target.login_history.map((l, i) => (
                  <div key={i} className="ad-login-row">
                    <span>{fmtDateTime(l.created_at)}</span>
                    <span className="ad-login-meta">{l.ip_address || 'Unknown IP'}{l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ad-detail-empty">No login history yet.</p>
            )}
          </>
        )}
      </Drawer>

      {activeAction && (
        <ReasonConfirmDialog
          open
          onClose={() => setActionModal(null)}
          onConfirm={() => activeAction.run(actionModal.reason)}
          title={activeAction.title}
          body={activeAction.body}
          confirmLabel={activeAction.confirmLabel}
          tone={activeAction.tone}
          busy={actionModal.busy}
          reason={actionModal.reason || ''}
          onReasonChange={(v) => setActionModal((m) => ({ ...m, reason: v }))}
          reasonRequired={activeAction.reasonRequired}
        />
      )}

      <Modal open={actionModal?.type === 'trial'} onClose={() => setActionModal(null)} title="Grant free trial" width={420}>
        {target && (
          <>
            <p className="confirm-body">Extend {target.full_name}'s trial by:</p>
            <div className="ad-trial-days">
              {[7, 14, 30].map((d) => (
                <Button key={d} size="sm" variant={actionModal?.days === d ? 'secondary' : 'ghost'}
                  onClick={() => setActionModal((m) => ({ ...m, days: d }))}>
                  {d} days
                </Button>
              ))}
            </div>
            <div className="confirm-actions">
              <Button variant="ghost" onClick={() => setActionModal(null)} disabled={actionModal?.busy}>Cancel</Button>
              <Button variant="primary" onClick={handleGrantTrial} disabled={actionModal?.busy}>
                {actionModal?.busy ? 'Working…' : `Grant ${actionModal?.days} days`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
