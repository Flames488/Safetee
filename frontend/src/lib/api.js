const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const ACCESS_KEY = 'safetee_access_token';
const REFRESH_KEY = 'safetee_refresh_token';

let accessToken = localStorage.getItem(ACCESS_KEY);
let refreshToken = localStorage.getItem(REFRESH_KEY);
let onUnauthorized = null;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Called once by AuthContext so api.js can hand control back to it when a
// session can't be recovered (no/garbage/expired-and-unrefreshable token).
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function hasSession() {
  return Boolean(accessToken);
}

function setTokens(tokens) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  return tokens;
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// FastAPI returns `detail` as a plain string for our own HTTPException calls,
// but as an array of Pydantic error objects for request-validation (422)
// failures — e.g. [{loc:['body','phone'], msg:'Field required', ...}]. Passed
// straight into `new Error(...)`, that array silently stringifies to
// "[object Object],[object Object]" (Error's message argument goes through
// ToString). Turn it into something a person can actually read instead.
function formatErrorDetail(detail, status) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((e) => {
      const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : null;
      return field && typeof field === 'string' ? `${field}: ${e.msg}` : e.msg;
    }).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return `Request failed: ${status}`;
}

async function rawRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new ApiError(formatErrorDetail(parsed.detail, res.status), res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Wraps rawRequest with a single refresh-and-retry attempt on 401 for
// authenticated calls, so an expired access token doesn't force a login
// screen mid-session as long as the refresh token is still good.
async function request(path, opts = {}) {
  try {
    return await rawRequest(path, opts);
  } catch (err) {
    const isAuthed = opts.auth !== false;
    if (err instanceof ApiError && err.status === 401 && isAuthed) {
      if (refreshToken) {
        try {
          setTokens(await rawRequest('/auth/refresh', {
            method: 'POST',
            body: { refresh_token: refreshToken },
            auth: false,
          }));
          return await rawRequest(path, opts);
        } catch {
          // refresh token is also invalid/expired — fall through to sign-out
        }
      }
      clearTokens();
      onUnauthorized?.();
    }
    throw err;
  }
}

export const api = {
  login: (phone, password, lat, lng, turnstileToken) =>
    rawRequest('/auth/login', { method: 'POST', body: { phone, password, lat, lng, turnstile_token: turnstileToken }, auth: false }).then(setTokens),
  signup: (payload) =>
    rawRequest('/auth/signup', { method: 'POST', body: payload, auth: false }).then(setTokens),
  logout: () => clearTokens(),
  forgotPassword: (phone, turnstileToken) =>
    rawRequest('/auth/forgot-password', { method: 'POST', body: { phone, turnstile_token: turnstileToken }, auth: false }),
  resetPassword: (payload) =>
    rawRequest('/auth/reset-password', { method: 'POST', body: payload, auth: false }).then(setTokens),
  recoverAccount: (payload) =>
    rawRequest('/auth/recover', { method: 'POST', body: payload, auth: false }).then(setTokens),

  getMe: () => request('/users/me'),
  updateProfile: (payload) => request('/users/me', { method: 'PATCH', body: payload }),
  updateTriggers: (payload) => request('/users/me/triggers', { method: 'PATCH', body: payload }),
  armPracticeDrill: () => request('/users/me/practice-drill/arm', { method: 'POST' }),
  generateBackupCodes: () => request('/users/me/backup-codes', { method: 'POST' }),
  updatePreferences: (payload) => request('/users/me/preferences', { method: 'PATCH', body: payload }),
  exportMyData: () => request('/users/me/export'),
  deleteAccount: (password) => request('/users/me', { method: 'DELETE', body: { password } }),

  createAvatarUploadUrl: (fileExtension) =>
    request('/users/me/avatar/upload-url', { method: 'POST', body: { file_extension: fileExtension } }),
  confirmAvatar: (path) => request('/users/me/avatar/confirm', { method: 'POST', body: { path } }),
  deleteAvatar: () => request('/users/me/avatar', { method: 'DELETE' }),

  registerDevice: (payload) => request('/devices', { method: 'POST', body: payload }),
  unregisterDevice: (endpoint) => request(`/devices?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }),

  listContacts: () => request('/contacts'),
  addContact: (payload) => request('/contacts', { method: 'POST', body: payload }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  // Swaps this contact with its neighbor in notify order, then renumbers
  // the whole list server-side — see move_contact in contacts.py. Returns
  // the full re-ordered list.
  moveContact: (id, direction) => request(`/contacts/${id}/move`, { method: 'POST', body: { direction } }),

  getWatchers: () => request('/locations/watchers'),
  requestLocation: (targetUserId) =>
    request('/locations/requests', { method: 'POST', body: { target_user_id: targetUserId } }),
  getIncomingLocationRequests: () => request('/locations/requests/incoming'),
  acceptLocationRequest: (id, durationMinutes) =>
    request(`/locations/requests/${id}/accept`, { method: 'POST', body: { duration_minutes: durationMinutes } }),
  declineLocationRequest: (id) => request(`/locations/requests/${id}/decline`, { method: 'POST' }),
  shareLocation: (contactId, durationMinutes) =>
    request('/locations/share', { method: 'POST', body: { contact_id: contactId, duration_minutes: durationMinutes } }),
  getActiveShares: () => request('/locations/shares/active'),
  getViewingShares: () => request('/locations/shares/viewing'),
  stopShare: (id) => request(`/locations/shares/${id}/stop`, { method: 'POST' }),
  getShare: (id) => request(`/locations/shares/${id}`),

  startJourney: (payload) => request('/journeys', { method: 'POST', body: payload }),
  getJourney: (id) => request(`/journeys/${id}`),
  checkinJourney: (id, payload) => request(`/journeys/${id}/checkin`, { method: 'POST', body: payload }),
  markArrived: (id) => request(`/journeys/${id}/arrived`, { method: 'POST' }),
  cancelJourney: (id) => request(`/journeys/${id}/cancel`, { method: 'POST' }),

  triggerSOS: (payload) => request('/sos/trigger', { method: 'POST', body: payload }),
  cancelSOS: (id) => request(`/sos/${id}/cancel`, { method: 'POST' }),
  // Password-confirmed — see backend/app/api/v1/sos.py's resolve_sos: once
  // an alert has fanned out, silencing it has to take more than a hold
  // gesture anyone with the phone/watch in hand could perform.
  resolveSOS: (id, password) => request(`/sos/${id}/resolve`, { method: 'POST', body: { password } }),
  // Already existed on the backend (returns the pending/active event with
  // its per-contact `alerts`) but was never called from the frontend —
  // SOSActive polls this to show real delivery status instead of a
  // permanent "Sending…" placeholder.
  getActiveSOS: () => request('/sos/active'),
  getIncomingAlerts: () => request('/sos/incoming'),
  acknowledgeAlert: (eventId) => request(`/sos/${eventId}/acknowledge`, { method: 'POST' }),
  createEvidenceUploadUrl: (eventId, payload) =>
    request(`/sos/${eventId}/evidence/upload-url`, { method: 'POST', body: payload }),
  confirmEvidence: (eventId, payload) =>
    request(`/sos/${eventId}/evidence/confirm`, { method: 'POST', body: payload }),
  // A share-token viewer (a trusted contact) has no account at all, so
  // this deliberately skips the authenticated request() path — no bearer
  // token exists to attach, and none is needed since the token itself is
  // the credential. Without a token, falls back to the normal authenticated
  // path for the event's own owner viewing it from inside the app.
  getEvidence: (eventId, shareToken) => {
    const qs = shareToken ? `?share_token=${encodeURIComponent(shareToken)}` : '';
    return shareToken
      ? rawRequest(`/sos/${eventId}/evidence${qs}`, { auth: false })
      : request(`/sos/${eventId}/evidence${qs}`);
  },

  journeyHistory: () => request('/history/journeys'),
  sosHistory: () => request('/history/sos'),
  // Password-confirmed for the same reason account deletion is — someone
  // else with the phone unlocked shouldn't be able to wipe the alert
  // record. Only finished journeys/alerts are eligible (see backend);
  // anything still active or pending is left alone regardless. Pass
  // sosIds/journeyIds to clear only specific entries; omit both to clear
  // everything eligible.
  clearHistory: (password, { sosIds, journeyIds } = {}) =>
    request('/history', { method: 'DELETE', body: { password, sos_ids: sosIds, journey_ids: journeyIds } }),

  systemStatus: () => request('/system/status', { auth: false }),

  listPlans: () => request('/billing/plans', { auth: false }),
  getSubscription: () => request('/billing/subscription'),
  checkout: (tier, billingInterval, extraSeats = 0) =>
    request('/billing/checkout', { method: 'POST', body: { tier, billing_interval: billingInterval, extra_seats: extraSeats } }),
  cancelSubscription: () => request('/billing/cancel', { method: 'POST' }),
  paymentHistory: () => request('/billing/history'),
  // Called right after Paystack redirects back — verifies + activates
  // synchronously instead of waiting on the webhook, which can lag the
  // browser redirect by a few seconds. Safe to call even if the webhook
  // already landed first: the backend no-ops on an already-succeeded payment.
  verifyPayment: (reference) => request(`/billing/verify/${reference}`, { method: 'POST' }),

  adminStats: () => request('/admin/stats'),
  // limit=200 (the backend's own max) rather than its 50-user default — the
  // dashboard derives a signups trend and status breakdown from this list
  // client-side, so it needs as full a picture as the endpoint allows.
  adminUsers: ({ statusFilter, trialExpiringWithinDays } = {}) => {
    const params = new URLSearchParams({ limit: '200' });
    if (statusFilter) params.set('status_filter', statusFilter);
    if (trialExpiringWithinDays != null) params.set('trial_expiring_within_days', String(trialExpiringWithinDays));
    return request(`/admin/users?${params.toString()}`);
  },
  adminUserDetail: (userId) => request(`/admin/users/${userId}`),
  adminUpdateRole: (userId, role, masterPassword) =>
    request(`/admin/users/${userId}/role`, { method: 'POST', body: { role, master_password: masterPassword } }),
  adminSuspend: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/suspend`, { method: 'POST', body: { master_password: masterPassword, reason } }),
  adminBan: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/ban`, { method: 'POST', body: { master_password: masterPassword, reason } }),
  adminReinstate: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/reinstate`, { method: 'POST', body: { master_password: masterPassword, reason: reason || null } }),
  adminForceLogout: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/force-logout`, { method: 'POST', body: { master_password: masterPassword, reason: reason || null } }),
  adminGrantTrial: (userId, masterPassword, days) =>
    request(`/admin/users/${userId}/trial`, { method: 'POST', body: { master_password: masterPassword, days } }),
  adminDeleteUser: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/delete`, { method: 'POST', body: { master_password: masterPassword, reason } }),
  adminRestoreUser: (userId, masterPassword, reason) =>
    request(`/admin/users/${userId}/restore`, { method: 'POST', body: { master_password: masterPassword, reason: reason || null } }),
  adminAuditLog: () => request('/admin/audit-log?limit=200'),
};
