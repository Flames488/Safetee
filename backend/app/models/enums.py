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


class AlertStatus(str, enum.Enum):
    queued = "queued"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"


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


class AdminRole(str, enum.Enum):
    none = "none"
    viewer = "viewer"            # read-only: stats and user list, no mutations
    super_admin = "super_admin"  # everything viewer can do, plus role/suspend actions — each gated separately by the master password, not by this role alone
