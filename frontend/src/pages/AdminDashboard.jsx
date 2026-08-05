import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, UserPlus, Clock, CreditCard, XCircle, ShieldCheck, Lock, Ban, ArrowUpCircle } from 'lucide-react';
import TopBar from '../components/TopBar';
import { Card, Pill, Button, PasswordInput, SectionLabel } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import './admin.css';

function fmtNaira(kobo) {
  return `₦${(kobo / 100).toLocaleString()}`;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const ROLE_TONE = { none: 'neutral', viewer: 'info', super_admin: 'good' };
const SUB_TONE = { trialing: 'info', active: 'good', past_due: 'warn', cancelled: 'warn', expired: 'bad' };

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.admin_role === 'super_admin';

  const [stats, setStats] = useState(null); // null = loading, false = error
  const [users, setUsers] = useState(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = () => {
    api.adminStats().then(setStats).catch(() => setStats(false));
    api.adminUsers().then(setUsers).catch(() => setUsers(false));
  };
  useEffect(load, []);

  // This page is only reachable at all with viewer/super_admin — but a
  // direct URL visit before `user` has loaded shouldn't flash the panel
  // for a split second, so gate on the resolved role explicitly.
  if (user && user.admin_role === 'none') return <Navigate to="/app" replace />;

  const runAction = async (fn, userId) => {
    if (!masterPassword) { setActionError('Enter the master password to make changes.'); return; }
    setActionError('');
    setBusyId(userId);
    try {
      const updated = await fn();
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setActionError(err.message || 'That action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const STATS = stats && [
    { icon: Users, label: 'Total users', value: stats.total_users },
    { icon: UserPlus, label: 'Signups (7d)', value: stats.signups_last_7_days },
    { icon: Clock, label: 'Active trials', value: stats.active_trials },
    { icon: ShieldCheck, label: 'Active subscriptions', value: stats.active_subscriptions },
    { icon: XCircle, label: 'Cancelling', value: stats.cancelled_subscriptions },
    { icon: CreditCard, label: 'Revenue this month', value: fmtNaira(stats.revenue_this_month_kobo) },
  ];

  return (
    <>
      <TopBar
        title="Admin"
        back={false}
        subtitle={isSuperAdmin ? 'Super admin — full access' : 'Viewer — read-only access'}
      />
      <div className="ad-body">
        {stats === null && <p className="ad-note">Loading stats…</p>}
        {stats === false && <p className="ad-note">Couldn't load stats right now.</p>}
        {STATS && (
          <div className="ad-stats">
            {STATS.map((s) => (
              <Card key={s.label} className="ad-stat">
                <span className="ad-stat-icon"><s.icon size={15} strokeWidth={2.1} /></span>
                <span className="ad-stat-label">{s.label}</span>
                <span className="ad-stat-value">{s.value}</span>
              </Card>
            ))}
          </div>
        )}

        <SectionLabel>All users</SectionLabel>

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

        {users === null && <p className="ad-note">Loading users…</p>}
        {users === false && <p className="ad-note">Couldn't load the user list right now.</p>}
        {users?.map((u) => (
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
                    onClick={() => runAction(() => api.adminUpdateRole(u.id, 'viewer', masterPassword), u.id)}>
                    <ArrowUpCircle size={13} /> Make viewer
                  </Button>
                )}
                {u.admin_role === 'viewer' && (
                  <Button size="sm" variant="ghost" disabled={busyId === u.id}
                    onClick={() => runAction(() => api.adminUpdateRole(u.id, 'none', masterPassword), u.id)}>
                    Remove viewer access
                  </Button>
                )}
                <Button size="sm" variant={u.is_active ? 'outline-danger' : 'secondary'} disabled={busyId === u.id}
                  onClick={() => runAction(() => api.adminToggleSuspend(u.id, masterPassword), u.id)}>
                  <Ban size={13} /> {u.is_active ? 'Suspend' : 'Reactivate'}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
