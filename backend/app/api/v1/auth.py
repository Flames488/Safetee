import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.phone import normalize_phone
from app.core.rate_limit import enforce_rate_limit
from app.core.scheduler import run_soon
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.turnstile import verify_turnstile
from app.db.session import get_db
from app.models.enums import AccountStatus, SOSStatus, SOSTrigger, SubscriptionStatus
from app.models.login_event import LoginEvent
from app.models.sos_event import SOSEvent
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
)
from app.workers.tasks.auth_tasks import send_password_reset_sms
from app.workers.tasks.sos_tasks import fanout_sos_alerts

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("safetee.auth")

_OTP_TTL_MINUTES = 10


def _client_ip(request: Request) -> str | None:
    """The production VPS's own nginx (infra/nginx/nginx.conf) terminates
    TLS at its edge and proxies plain HTTP to this container —
    request.client.host alone would just be nginx's internal proxy address,
    not the real caller. Trusts the first hop of X-Forwarded-For since
    nothing between nginx and this container is attacker-controlled; falls
    back to request.client.host for local/direct-connection dev."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await verify_turnstile(payload.turnstile_token, _client_ip(request))

    # Honeypot — see SignupRequest.website's docstring. A filled value
    # means whatever submitted this isn't the real form; fail exactly like
    # a validation error rather than revealing the mechanism.
    if payload.website:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid request")

    # Same reasoning as login's rate limit — otherwise repeatedly hitting
    # this endpoint for the same number is free (previously the only limit
    # here at all was the 409 dedup check, which does nothing to slow down
    # an automated flood of *attempts*).
    await enforce_rate_limit(f"signup:{payload.phone}", max_attempts=5, window_seconds=3600)

    # Stored normalized so every later comparison — login, contact
    # matching for the Alerts page/evidence/location sharing — can rely on
    # an exact match against this column without each caller separately
    # re-normalizing it. See normalize_phone's docstring for why this
    # matters and why it's still a safe, lossless transform.
    phone = normalize_phone(payload.phone)
    existing = await db.execute(select(User).where(User.phone == phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this phone number already exists")

    user = User(
        full_name=payload.full_name,
        phone=phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()  # assigns user.id without committing yet

    db.add(Subscription(
        user_id=user.id,
        status=SubscriptionStatus.trialing,
        trial_ends_at=datetime.now(UTC) + timedelta(days=settings.trial_period_days),
    ))
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await verify_turnstile(payload.turnstile_token, _client_ip(request))

    # Capped independently of whether any individual guess is right or
    # wrong — otherwise this endpoint is a free way to brute-force a known
    # phone number's password with no limit on attempts.
    await enforce_rate_limit(f"login:{payload.phone}", max_attempts=10, window_seconds=900)

    # Login has to keep working regardless of which format the person
    # happens to type this time — the stored value is normalized (see
    # signup), so the lookup has to normalize the input the same way.
    result = await db.execute(select(User).where(User.phone == normalize_phone(payload.phone)))
    user = result.scalar_one_or_none()

    if user is not None and verify_password(payload.password, user.password_hash):
        # Without this, a suspended/banned/deleted account still got a
        # "successful" login response and a real token pair —
        # get_current_user's own checks would then 401 every single
        # request made with it, so the account just looked broken instead
        # of clearly blocked.
        if user.deleted_at is not None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account no longer exists")
        if user.account_status == AccountStatus.suspended:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been suspended")
        if user.account_status == AccountStatus.banned:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been banned")

        now = datetime.now(UTC)
        user.last_login_at = now
        user.last_active_at = now
        db.add(user)
        db.add(LoginEvent(user_id=user.id, ip_address=_client_ip(request), user_agent=request.headers.get("user-agent")))
        await db.commit()

        return TokenResponse(
            access_token=create_access_token(str(user.id)),
            refresh_token=create_refresh_token(str(user.id)),
        )

    # Real password didn't match — before failing, check whether this was
    # the account's fake PIN instead (set up in Settings). A match triggers
    # a silent SOS: same TokenResponse shape as a genuine successful login,
    # so nothing about the response gives away that anything happened.
    # Immediate fanout with no cancel window, unlike a manual SOS trigger —
    # there's no "oops, false alarm" screen here to cancel from, and
    # someone entering their duress PIN meant to. The event itself, and
    # anything derived from it, is filtered out of the owner's own views
    # (see SOSTrigger.fake_pin checks in history.py / sos.py) so it never
    # surfaces on the device that's presumably still being watched.
    if user is not None and user.fake_pin_hash is not None and verify_password(payload.password, user.fake_pin_hash):
        event = SOSEvent(
            user_id=user.id,
            trigger=SOSTrigger.fake_pin,
            status=SOSStatus.active,
            origin_lat=payload.lat if user.share_location_enabled else None,
            origin_lng=payload.lng if user.share_location_enabled else None,
            cancel_window_ends_at=datetime.now(UTC),
        )
        db.add(event)
        await db.commit()
        run_soon(fanout_sos_alerts, str(event.id))

        return TokenResponse(
            access_token=create_access_token(str(user.id)),
            refresh_token=create_refresh_token(str(user.id)),
        )

    # constant-shape error regardless of which check fails, to avoid leaking
    # whether a phone number is registered
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect phone number or password")


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise ValueError
        subject = decoded["sub"]
        issued_at = decoded.get("iat")
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None

    # Previously this never looked the user up at all — a still-valid
    # refresh token from a suspended/banned/deleted account, or one
    # force-logged-out via sessions_invalidated_at, could mint itself a
    # brand new access token forever. The new access token would still
    # get rejected on its next actual use (get_current_user re-checks all
    # of this), but there's no reason to hand one out at all.
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    try:
        user = await db.get(User, uuid.UUID(subject))
    except ValueError:
        raise invalid from None
    if user is None or user.account_status != AccountStatus.active or user.deleted_at is not None:
        raise invalid
    if user.sessions_invalidated_at is not None:
        if issued_at is None or datetime.fromtimestamp(issued_at, tz=UTC) < user.sessions_invalidated_at:
            raise invalid

    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(payload: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Always returns 204 regardless of whether the phone number is
    registered — a different response here would let someone enumerate
    which numbers have accounts. If it is registered, a 6-digit code is
    sent by SMS (Twilio, falling back to Termii) and expires in 10 minutes.
    """
    # This is the endpoint that actually spends real SMS credit per call,
    # unauthenticated — the highest-value place for bot protection, ahead
    # of even the per-phone rate limit below (which a bot can spread
    # across many different target numbers).
    await verify_turnstile(payload.turnstile_token, _client_ip(request))

    # Rate-limited by phone before touching the DB — otherwise this endpoint
    # is a free way to spam someone's phone with SMS (or run up your Twilio
    # bill) by repeatedly requesting codes for the same number.
    await enforce_rate_limit(f"otp-request:{payload.phone}", max_attempts=3, window_seconds=900)

    result = await db.execute(select(User).where(User.phone == normalize_phone(payload.phone)))
    user = result.scalar_one_or_none()
    if user is None:
        return

    otp = f"{secrets.randbelow(1_000_000):06d}"
    user.password_reset_otp_hash = hash_password(otp)
    user.password_reset_otp_expires_at = datetime.now(UTC) + timedelta(minutes=_OTP_TTL_MINUTES)
    db.add(user)
    await db.commit()

    # Dispatched to a worker rather than sent inline — this endpoint is
    # async and shares an event loop with every other in-flight request
    # (including SOS triggers). Calling the SMS provider synchronously
    # here would block all of them for however long Twilio/Termii take.
    run_soon(send_password_reset_sms, user.phone, otp, _OTP_TTL_MINUTES)


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    # A 6-digit code has only a million possibilities — with no cap on
    # guesses, it's brute-forceable well within its 10-minute lifetime.
    # This caps guesses per phone number independently of whether any
    # individual guess is right or wrong.
    await enforce_rate_limit(f"otp-verify:{payload.phone}", max_attempts=5, window_seconds=_OTP_TTL_MINUTES * 60)

    result = await db.execute(select(User).where(User.phone == normalize_phone(payload.phone)))
    user = result.scalar_one_or_none()

    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "That code is invalid or has expired.")
    if (
        user is None
        or user.password_reset_otp_hash is None
        or user.password_reset_otp_expires_at is None
        or user.password_reset_otp_expires_at < datetime.now(UTC)
        or not verify_password(payload.otp, user.password_reset_otp_hash)
    ):
        raise invalid

    user.password_hash = hash_password(payload.new_password)
    user.password_reset_otp_hash = None
    user.password_reset_otp_expires_at = None
    db.add(user)
    await db.commit()

    # Signing them straight in avoids a second "great, now log in" step
    # right after they've just proven who they are with the OTP.
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
