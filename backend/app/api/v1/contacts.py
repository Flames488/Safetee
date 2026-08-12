import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.phone import normalize_phone
from app.db.session import get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.schemas.user import ContactCreate, ContactOut

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    contacts = (
        await db.execute(
            select(TrustedContact)
            .where(TrustedContact.user_id == user.id)
            .order_by(TrustedContact.priority.asc())
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
