import hmac
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.phone import normalize_phone
from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import AccountStatus, AdminRole
from app.models.user import User

# How often last_active_at actually writes to the DB — see the field's
# docstring on the model. Touched on every authenticated request but only
# persisted this often, so "last seen" stays real without adding a write
# to every single API call in the app.
_LAST_ACTIVE_THROTTLE = timedelta(minutes=15)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        user_id = uuid.UUID(payload["sub"])
        issued_at = payload.get("iat")
    except (jwt.PyJWTError, KeyError, ValueError):
        raise credentials_error from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.account_status != AccountStatus.active or user.deleted_at is not None:
        raise credentials_error

    # Admin-initiated force-logout: any token issued before this moment is
    # rejected even though it's still cryptographically valid and unexpired
    # — see sessions_invalidated_at's docstring on the model for why this
    # is what makes "log this device out" possible without a separate
    # revocation-list table.
    if user.sessions_invalidated_at is not None:
        if issued_at is None or datetime.fromtimestamp(issued_at, tz=UTC) < user.sessions_invalidated_at:
            raise credentials_error

    # Bootstraps your own account into super_admin with zero manual DB
    # writes: set SUPER_ADMIN_PHONE in .env to your own phone number, and
    # the next time you log in (or any request that resolves the current
    # user) it's applied. Blank by default — nobody is auto-promoted unless
    # you explicitly configure this.
    if (
        settings.super_admin_phone
        and user.phone == normalize_phone(settings.super_admin_phone)
        and user.admin_role != AdminRole.super_admin
    ):
        user.admin_role = AdminRole.super_admin
        db.add(user)
        await db.commit()
        await db.refresh(user)

    now = datetime.now(UTC)
    if user.last_active_at is None or now - user.last_active_at > _LAST_ACTIVE_THROTTLE:
        user.last_active_at = now
        db.add(user)
        await db.commit()

    return user


async def require_admin_viewer(user: User = Depends(get_current_user)) -> User:
    """Viewer or super_admin — read access to /admin/* endpoints."""
    if user.admin_role not in (AdminRole.viewer, AdminRole.super_admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """super_admin role only — still not enough on its own to mutate
    anything. Endpoints that change data additionally require the master
    password on that specific request (see verify_master_password)."""
    if user.admin_role != AdminRole.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super admin access required")
    return user


def verify_master_password(master_password: str) -> None:
    if not settings.admin_master_password or not hmac.compare_digest(
        master_password, settings.admin_master_password
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect master password")
