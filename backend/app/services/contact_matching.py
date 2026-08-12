import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phone import normalize_phone
from app.models.contact import TrustedContact

# Shared by sos.py (evidence/incoming-alert access) and locations.py
# (location requests/shares) — the one place this security-sensitive
# phone-matching logic lives, rather than each feature growing its own
# copy. See normalize_phone's docstring for why this is an exact match,
# not a fuzzy one.


async def is_trusted_contact_of(db: AsyncSession, owner_id: uuid.UUID, viewer_phone: str) -> bool:
    """Does `owner_id` have a trusted contact whose phone exactly matches
    viewer_phone? Used to authorize a logged-in account — not just an SMS
    share-link — as genuinely one of the owner's trusted contacts."""
    target = normalize_phone(viewer_phone)
    if not target:
        return False
    result = await db.execute(
        select(TrustedContact.id).where(TrustedContact.user_id == owner_id, TrustedContact.phone == target)
    )
    return result.scalar_one_or_none() is not None


async def watched_owner_ids(db: AsyncSession, viewer_phone: str) -> set[uuid.UUID]:
    """Every owner_id who has viewer_phone listed as a trusted contact —
    "who am I a trusted contact for"."""
    target = normalize_phone(viewer_phone)
    if not target:
        return set()
    rows = (
        await db.execute(select(TrustedContact.user_id).where(TrustedContact.phone == target))
    ).scalars().all()
    return set(rows)
