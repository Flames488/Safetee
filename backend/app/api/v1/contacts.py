import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.phone import normalize_phone
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.schemas.user import ContactCreate, ContactMoveRequest, ContactOut

router = APIRouter(prefix="/contacts", tags=["contacts"])


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
    # each contact in the frontend.
    phones = {normalize_phone(c.phone) for c in contacts}
    app_user_phones = set()
    if phones:
        app_user_phones = set(
            (await db.execute(select(User.phone).where(User.phone.in_(phones)))).scalars().all()
        )

    dirty = False
    for contact in contacts:
        contact.is_app_user = normalize_phone(contact.phone) in app_user_phones
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
    contact = TrustedContact(user_id=user.id, **payload.model_dump())
    matched = (
        await db.execute(select(User.id).where(User.phone == normalize_phone(contact.phone)))
    ).scalar_one_or_none()
    if matched is not None:
        contact.is_app_user = True
        contact.is_verified = True
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
