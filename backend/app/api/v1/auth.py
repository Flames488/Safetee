import logging
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.enums import SubscriptionStatus
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

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("safetee.auth")

_OTP_TTL_MINUTES = 10


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.phone == payload.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this phone number already exists")

    user = User(
        full_name=payload.full_name,
        phone=payload.phone,
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
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Capped independently of whether any individual guess is right or
    # wrong — otherwise this endpoint is a free way to brute-force a known
    # phone number's password with no limit on attempts.
    enforce_rate_limit(f"login:{payload.phone}", max_attempts=10, window_seconds=900)

    result = await db.execute(select(User).where(User.phone == payload.phone))
    user = result.scalar_one_or_none()

    # constant-shape error regardless of which check fails, to avoid leaking
    # whether a phone number is registered
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect phone number or password")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise ValueError
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None

    subject = decoded["sub"]
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
    )


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Always returns 204 regardless of whether the phone number is
    registered — a different response here would let someone enumerate
    which numbers have accounts. If it is registered, a 6-digit code is
    sent by SMS (Twilio, falling back to Termii) and expires in 10 minutes.
    """
    # Rate-limited by phone before touching the DB — otherwise this endpoint
    # is a free way to spam someone's phone with SMS (or run up your Twilio
    # bill) by repeatedly requesting codes for the same number.
    enforce_rate_limit(f"otp-request:{payload.phone}", max_attempts=3, window_seconds=900)

    result = await db.execute(select(User).where(User.phone == payload.phone))
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
    send_password_reset_sms.delay(user.phone, otp, _OTP_TTL_MINUTES)


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    # A 6-digit code has only a million possibilities — with no cap on
    # guesses, it's brute-forceable well within its 10-minute lifetime.
    # This caps guesses per phone number independently of whether any
    # individual guess is right or wrong.
    enforce_rate_limit(f"otp-verify:{payload.phone}", max_attempts=5, window_seconds=_OTP_TTL_MINUTES * 60)

    result = await db.execute(select(User).where(User.phone == payload.phone))
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
