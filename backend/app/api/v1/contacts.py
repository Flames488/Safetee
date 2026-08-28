import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.phone import normalize_phone
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.schemas.user import ContactCreate, ContactMoveRequest, ContactOut
from app.services.contact_matching import watched_owner_ids

router = APIRouter(prefix="/contacts", tags=["contacts"])

# Every contact added here is someone who gets a real SMS (real money, real
# rate-limit budget on the Twilio/Termii account) on every SOS this user
# ever triggers — unlike a plain read/write, an unbounded contact list is a
# standing cost and abuse surface, not just extra rows.
_MAX_CONTACTS_PER_USER = 25


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    contacts = (
        await db.execute(
            select(TrustedContact)
            .where(TrustedContact.user_id == user.id)
            # created_at as a tiebreak: every contact starts at the same
            # default priority (see the model), so without this, contacts
            # tied on priority would sort in whatever order Postgres feels
            # like on a given query — not necessarily the same order twice.
            .order_by(TrustedContact.priority.asc(), TrustedContact.created_at.asc())
        )
    ).scalars().all()

    # One batched query for the whole list rather than one per contact —
    # is_app_user drives whether "Request/share location" shows up for
    # each contact in the frontend, and the matched account (when any) is
    # also where that contact's avatar comes from — ContactOut never had
    # anywhere else to get one, which is why contact photos never showed.
    phones = {normalize_phone(c.phone) for c in contacts}
    app_users_by_phone: dict[str, User] = {}
    if phones:
        matched = (await db.execute(select(User).where(User.phone.in_(phones)))).scalars().all()
        app_users_by_phone = {u.phone: u for u in matched}

    # last_active_at is presence data — unlike is_app_user/avatar_url
    # (which just reflect a public-ish "this number belongs to a real
    # account" fact), it's only ever shown for a contact who has *also*
    # added this user back, matching the reciprocity POST
    # /locations/requests itself enforces. Otherwise saving a stranger's
    # number would be enough to see whether they're currently active,
    # with no consent on their part at all.
    mutual_ids = await watched_owner_ids(db, user.phone)

    dirty = False
    for contact in contacts:
        matched_user = app_users_by_phone.get(normalize_phone(contact.phone))
        contact.is_app_user = matched_user is not None
        contact.avatar_url = matched_user.avatar_url if matched_user else None
        contact.matched_user_id = matched_user.id if matched_user else None
        contact.last_active_at = (
            matched_user.last_active_at if matched_user and matched_user.id in mutual_ids else None
        )
        # There's no SMS-OTP contact-verification flow built (is_verified
        # otherwise never gets set at all) — but a phone that matches a
        # registered account has already proven ownership of that number
        # via that account's own signup, which is stronger evidence than
        # nothing. Persisted, not just computed for this response, so it's
        # reflected everywhere ContactOut is used (export, etc.).
        if contact.is_app_user and not contact.is_verified:
            contact.is_verified = True
            dirty = True
    if dirty:
        await db.commit()
    return contacts


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Nothing was previously stopping repeated calls to this endpoint —
    # unlike login/signup/OTP, a plain per-request count is what's needed
    # here (there's no "wrong guess" to count), but the risk is the same
    # shape: free to hammer without this.
    await enforce_rate_limit(f"contact-create:{user.id}", max_attempts=20, window_seconds=3600)

    existing_count = (
        await db.execute(
            select(func.count()).select_from(TrustedContact).where(TrustedContact.user_id == user.id)
        )
    ).scalar_one()
    if existing_count >= _MAX_CONTACTS_PER_USER:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"You can have at most {_MAX_CONTACTS_PER_USER} trusted contacts. Remove one before adding another.",
        )

    # Stored normalized — see normalize_phone's docstring. Without this,
    # a contact added as "+234 803 123 4567" would never match that same
    # person's own account (stored as, say, "+2348031234567"), which
    # silently broke every feature that depends on recognizing "this
    # contact is also a Safetee account": the Alerts/Network page,
    # evidence access, location requests.
    data = payload.model_dump()
    data["phone"] = normalize_phone(data["phone"])
    contact = TrustedContact(user_id=user.id, **data)
    matched = (
        await db.execute(select(User).where(User.phone == contact.phone))
    ).scalar_one_or_none()
    if matched is not None:
        contact.is_app_user = True
        contact.is_verified = True
        contact.avatar_url = matched.avatar_url
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedContact).where(
            TrustedContact.id == contact_id, TrustedContact.user_id == user.id
        )
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    await db.delete(contact)
    await db.commit()


@router.post("/{contact_id}/move", response_model=list[ContactOut])
async def move_contact(
    contact_id: uuid.UUID,
    payload: ContactMoveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Swaps this contact with its neighbor in the notify-order list, then
    renumbers everyone to a clean 0..N-1 sequence. Renumbering the whole
    list (not just the two being swapped) is what makes this work correctly
    the first time it's ever called for a given user — every contact starts
    at the same default priority (see the model), so a plain two-way swap
    of tied values would be a no-op."""
    contacts = (
        await db.execute(
            select(TrustedContact)
            .where(TrustedContact.user_id == user.id)
            .order_by(TrustedContact.priority.asc(), TrustedContact.created_at.asc())
        )
    ).scalars().all()

    idx = next((i for i, c in enumerate(contacts) if c.id == contact_id), None)
    if idx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")

    swap_idx = idx - 1 if payload.direction == "up" else idx + 1
    if 0 <= swap_idx < len(contacts):
        contacts[idx], contacts[swap_idx] = contacts[swap_idx], contacts[idx]
    # else: already at that end of the list — no-op, not an error

    for rank, contact in enumerate(contacts):
        contact.priority = rank
    await db.commit()
    return contacts
