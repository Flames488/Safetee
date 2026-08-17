import hmac
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.phone import normalize_phone
from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import AdminRole
from app.models.user import User

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
    except (jwt.PyJWTError, KeyError, ValueError):
        raise credentials_error from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
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
