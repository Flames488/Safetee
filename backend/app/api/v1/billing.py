import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.plans import interval_days, plan_public_list, price_for
from app.db.session import get_db
from app.models.enums import PaymentStatus, PlanTier, SubscriptionStatus
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.billing import CheckoutRequest, CheckoutResponse, PaymentOut, PlanOut, SubscriptionOut
from app.services.paystack.client import PaystackClient, PaystackError

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger("safetee.billing")
paystack = PaystackClient()


@router.get("/plans", response_model=list[PlanOut])
async def list_plans():
    return plan_public_list()


@router.get("/subscription", response_model=SubscriptionOut)
async def get_subscription(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if sub is None:
        # Accounts created before billing existed won't have a row yet —
        # create one on read rather than requiring a backfill migration.
        sub = Subscription(
            user_id=user.id,
            status=SubscriptionStatus.trialing,
            trial_ends_at=datetime.now(UTC) + timedelta(days=settings.trial_period_days),
        )
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return sub


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(payload: CheckoutRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.email:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Add an email address to your profile first — Paystack sends your receipt there.",
        )

    # Extra seats only exist for Organization — silently ignoring them for
    # other tiers (rather than erroring) matches price_for()'s behavior and
    # means a stray non-zero value from the client can't cause a mispriced
    # charge either way.
    extra_seats = payload.extra_seats if payload.tier == PlanTier.organization else 0
    amount_kobo = price_for(payload.tier, payload.billing_interval, extra_seats)
    reference = f"safetee_{uuid.uuid4().hex}"

    payment = Payment(
        user_id=user.id,
        tier=payload.tier,
        billing_interval=payload.billing_interval,
        extra_seats=extra_seats,
        amount_kobo=amount_kobo,
        currency="NGN",
        status=PaymentStatus.pending,
        paystack_reference=reference,
    )
    db.add(payment)
    await db.commit()

    try:
        data = await paystack.initialize_transaction(
            email=user.email,
            amount_kobo=amount_kobo,
            reference=reference,
            callback_url=f"{settings.frontend_url}/app/settings/billing",
        )
    except PaystackError as err:
        payment.status = PaymentStatus.failed
        await db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not start payment: {err}") from err

    return CheckoutResponse(authorization_url=data["authorization_url"], reference=reference)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Paystack calls this directly — never the frontend. Signature is
    verified against the raw body before anything in the payload is
    trusted, and the transaction is re-verified via a direct API call
    (not just the webhook payload) before any subscription is activated.
    This double-check is deliberate: a webhook payload alone is what an
    attacker would forge if they ever guessed this URL."""
    raw_body = await request.body()
    signature = request.headers.get("x-paystack-signature")
    if not PaystackClient.verify_webhook_signature(raw_body, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")

    payload = await request.json()
    event = payload.get("event")
    if event != "charge.success":
        return {"received": True}  # ignore events we don't act on

    reference = payload.get("data", {}).get("reference")
    if not reference:
        return {"received": True}

    result = await db.execute(select(Payment).where(Payment.paystack_reference == reference))
    payment = result.scalar_one_or_none()
    if payment is None or payment.status == PaymentStatus.success:
        return {"received": True}  # unknown reference, or already processed — webhooks can repeat

    try:
        verified = await paystack.verify_transaction(reference)
    except PaystackError:
        logger.exception("Failed to verify Paystack transaction %s", reference)
        return {"received": True}  # Paystack will retry the webhook; don't 500 and lose the event

    if verified.get("status") != "success":
        payment.status = PaymentStatus.failed
        await db.commit()
        return {"received": True}

    payment.status = PaymentStatus.success
    payment.paystack_transaction_id = str(verified.get("id", ""))
    payment.paid_at = datetime.now(UTC)

    sub_result = await db.execute(select(Subscription).where(Subscription.user_id == payment.user_id))
    sub = sub_result.scalar_one_or_none()
    if sub is None:
        sub = Subscription(user_id=payment.user_id)
        db.add(sub)

    sub.tier = payment.tier
    sub.billing_interval = payment.billing_interval
    sub.extra_seats = payment.extra_seats
    sub.status = SubscriptionStatus.active
    sub.cancel_at_period_end = False
    sub.current_period_end = datetime.now(UTC) + timedelta(days=interval_days(payment.billing_interval))

    customer = verified.get("customer", {})
    if customer.get("customer_code"):
        sub.paystack_customer_code = customer["customer_code"]
    authorization = verified.get("authorization", {})
    if authorization.get("authorization_code"):
        sub.paystack_authorization_code = authorization["authorization_code"]

    await db.commit()
    return {"received": True}


@router.post("/cancel", response_model=SubscriptionOut)
async def cancel_subscription(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Cancels at the end of the current billing period, not immediately —
    the user already paid for this period, so access continues until it
    actually ends. `current_period_end` is when access actually stops."""
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if sub is None or sub.status not in (SubscriptionStatus.active, SubscriptionStatus.past_due):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active subscription to cancel")

    sub.cancel_at_period_end = True
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("/history", response_model=list[PaymentOut])
async def payment_history(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc())
    )
    return result.scalars().all()
