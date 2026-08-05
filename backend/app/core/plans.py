"""
Plan definitions — the one place plan pricing lives, read by both the
/billing/plans endpoint and the checkout endpoint (so the price a user is
shown is guaranteed to be the exact price they're charged).

⚠️  PLACEHOLDER PRICING — these amounts are illustrative only. Replace with
your real pricing before taking a single real payment. Amounts are in kobo
(Paystack's unit — 1 naira = 100 kobo).

Three tiers, deliberately structured around who's actually being protected
rather than a flat headcount:

  - individual: one person.
  - family: a household — several people, one bill.
  - organization: schools, churches, mosques, academies. Seat-based rather
    than per-member: a church with 400 congregants doesn't need 400
    licenses, it needs coverage for however many drivers/supervisors
    actually travel on its behalf. A base tier includes a handful of seats;
    more can be added at a per-seat rate without forcing the org into the
    next size bracket for one extra driver.
"""
from app.models.enums import BillingInterval, PlanTier

TIERS = {
    PlanTier.individual: {
        "name": "Individual",
        "tagline": "Full protection for one person.",
        "seats_included": 1,
        "extra_seat_kobo": None,  # not sold — this tier is single-seat by design
        "monthly_kobo": 150_000,   # ₦1,500
        "annual_kobo": 1_440_000,  # ₦14,400 — 20% off 12× monthly
    },
    PlanTier.family: {
        "name": "Family",
        "tagline": "Cover your whole household under one plan.",
        "seats_included": 6,
        "extra_seat_kobo": None,  # flat price up to 6; beyond that, Organization fits better
        "monthly_kobo": 500_000,   # ₦5,000
        "annual_kobo": 4_800_000,  # ₦48,000
    },
    PlanTier.organization: {
        "name": "Organization",
        "tagline": "For schools, churches, mosques, and academies — pay per protected seat (e.g. drivers or supervisors), not per member.",
        "seats_included": 5,
        "extra_seat_kobo": 100_000,       # ₦1,000/seat/month beyond the included 5
        "extra_seat_annual_kobo": 960_000,  # ₦9,600/seat/year — 20% off
        "monthly_kobo": 700_000,   # ₦7,000 base (covers the first 5 seats)
        "annual_kobo": 6_720_000,  # ₦67,200
    },
}

INCLUDED_FEATURES = [
    "Unlimited SOS alerts to trusted contacts",
    "Live location sharing during Safe Journeys",
    "Automatic SMS fallback when data drops",
    "Hidden triggers — fake PIN, power button, gesture",
    "Full alert and journey history",
]


def interval_days(interval: BillingInterval) -> int:
    return 365 if interval == BillingInterval.annual else 30


def price_for(tier: PlanTier, interval: BillingInterval, extra_seats: int = 0) -> int:
    """The exact amount to charge, in kobo. Extra seats only apply to
    Organization — passing them for any other tier is ignored, not
    silently charged, so a client-side bug can't overbill someone."""
    info = TIERS[tier]
    base = info["annual_kobo"] if interval == BillingInterval.annual else info["monthly_kobo"]
    if tier != PlanTier.organization or extra_seats <= 0:
        return base
    per_seat = info["extra_seat_annual_kobo"] if interval == BillingInterval.annual else info["extra_seat_kobo"]
    return base + per_seat * extra_seats


def plan_public_list() -> list[dict]:
    """Shape returned to the frontend — no internal fields, just what the
    pricing page needs to render both billing intervals without a second
    round trip."""
    return [
        {
            "id": tier.value,
            "name": info["name"],
            "tagline": info["tagline"],
            "seats_included": info["seats_included"],
            "extra_seat_monthly_kobo": info.get("extra_seat_kobo"),
            "extra_seat_annual_kobo": info.get("extra_seat_annual_kobo"),
            "monthly_kobo": info["monthly_kobo"],
            "annual_kobo": info["annual_kobo"],
            "features": INCLUDED_FEATURES,
        }
        for tier, info in TIERS.items()
    ]
