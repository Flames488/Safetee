# NOTE: bcrypt has a 72-byte input limit. We pre-hash with sha256 first so
# long passwords (and non-ASCII input) never silently truncate — this bit
# Vitar in production before, so it's handled here from day one.
#
# We call the `bcrypt` package directly rather than going through passlib:
# passlib 1.7.4's own bcrypt-backend self-test breaks against bcrypt>=4.1
# (a real bug hit while building this — passlib is unmaintained and this
# incompatibility has been open upstream for a while).
import base64
import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings

_BCRYPT_ROUNDS = 12


def _prehash(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS))
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode("utf-8"))
    except ValueError:
        # malformed/foreign hash format — never crash the login endpoint over it
        return False


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    # iat is what makes admin-initiated force-logout possible: get_current_user
    # (and /auth/refresh) reject any token issued before
    # User.sessions_invalidated_at, so a token that's otherwise still
    # cryptographically valid stops working the moment an admin sets that
    # field — without minting a whole separate revocation-list system.
    payload = {"sub": subject, "iat": now, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(subject: str) -> str:
    now = datetime.now(UTC)
    expire = now + timedelta(days=settings.refresh_token_expire_days)
    payload = {"sub": subject, "iat": now, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def create_share_token(scope: str, resource_id: str, contact_id: str) -> str:
    """A signed, expiring, read-only link for a trusted contact to reach one
    specific resource (an SOS event's evidence, a journey's live location)
    without an account of their own. `scope` + `resource_id` are checked by
    the caller against the actual resource being requested — this token
    proves "a contact link for exactly this thing was issued," nothing more
    (it is never accepted anywhere `type: "access"` is expected, and never
    grants write access)."""
    expire = datetime.now(UTC) + timedelta(hours=settings.share_token_expire_hours)
    payload = {
        "type": "share",
        "scope": scope,
        "resource_id": resource_id,
        "contact_id": contact_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_share_token(token: str, scope: str, resource_id: str) -> dict:
    """Raises jwt.PyJWTError (expired/malformed/wrong secret) or ValueError
    (right shape, wrong resource) — callers should treat both as "reject
    this request," the distinction only matters for logging."""
    payload = decode_token(token)
    if payload.get("type") != "share" or payload.get("scope") != scope:
        raise ValueError("wrong token type/scope")
    if payload.get("resource_id") != str(resource_id):
        raise ValueError("token not issued for this resource")
    return payload
