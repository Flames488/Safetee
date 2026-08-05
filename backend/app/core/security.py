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
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {"sub": subject, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
