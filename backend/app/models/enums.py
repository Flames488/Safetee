import enum


class JourneyStatus(str, enum.Enum):
    active = "active"
    arrived = "arrived"
    escalated = "escalated"     # missed check-in, auto-converted to SOS
    cancelled = "cancelled"


class SOSStatus(str, enum.Enum):
    pending = "pending"         # inside the cancel window
    active = "active"           # alerts fanning out / fanned out
    resolved = "resolved"       # user marked safe
    cancelled = "cancelled"     # cancelled inside the grace window


class SOSTrigger(str, enum.Enum):
    button = "button"
    fake_pin = "fake_pin"
    power_button = "power_button"
    gesture = "gesture"
    journey_timeout = "journey_timeout"


class AlertChannel(str, enum.Enum):
    push = "push"
    sms_twilio = "sms_twilio"
    sms_termii = "sms_termii"
    call = "call"
    simulated = "simulated"  # practice drill — see SOSEvent.is_practice


class AlertStatus(str, enum.Enum):
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    # Practice drill only — never a real send. Deliberately distinct from
    # `sent` so retry_failed_alerts/notify_contacts_of_resolution, which
    # filter on specific statuses, exclude these without needing their own
    # is_practice check.
    simulated = "simulated"


class PlanTier(str, enum.Enum):
    individual = "individual"
    family = "family"
    organization = "organization"


class BillingInterval(str, enum.Enum):
    monthly = "monthly"
    annual = "annual"


class SubscriptionStatus(str, enum.Enum):
    trialing = "trialing"
    active = "active"
    past_due = "past_due"       # payment failed, grace period before expiring
    cancelled = "cancelled"     # user cancelled, access continues until current_period_end
    expired = "expired"         # no active access


class PaymentStatus(str, enum.Enum):
    pending = "pending"         # transaction initialized, awaiting Paystack webhook
    success = "success"
    failed = "failed"
    abandoned = "abandoned"      # user never completed the Paystack checkout


class LocationShareStatus(str, enum.Enum):
    pending = "pending"     # a viewer requested it; owner hasn't responded yet
    active = "active"       # owner accepted (or self-initiated) — check expires_at, not this alone, for "is it actually still live"
    declined = "declined"   # owner declined a viewer's request
    stopped = "stopped"     # owner ended an active share early


class AdminRole(str, enum.Enum):
    none = "none"
    viewer = "viewer"            # read-only: stats and user list, no mutations
    super_admin = "super_admin"  # everything viewer can do, plus role/suspend actions — each gated separately by the master password, not by this role alone


class AccountStatus(str, enum.Enum):
    """Replaces the old plain is_active boolean. suspended and banned have
    the identical practical effect (blocks login/get_current_user) — the
    distinction is audit trail and admin intent, not different enforcement.
    Both can be cleared back to active via reinstate."""
    active = "active"
    suspended = "suspended"
    banned = "banned"


class AdminAction(str, enum.Enum):
    """What AdminAuditLog.action records — one row per mutating admin
    action taken against a user, see app/api/v1/admin.py."""
    role_change = "role_change"
    suspend = "suspend"
    ban = "ban"
    reinstate = "reinstate"
    grant_trial = "grant_trial"
    soft_delete = "soft_delete"
    restore = "restore"
    force_logout = "force_logout"
