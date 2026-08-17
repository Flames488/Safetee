"""normalize stored phone numbers

Revision ID: b7e2c94f1a58
Revises: a3d8f61c9e27
Create Date: 2026-08-18 00:00:00.000000

users.phone/trusted_contacts.phone were both stored exactly as typed —
never normalized. Every contact-matching lookup ("is this contact also a
Safetee account", which powers the Alerts/Network page, evidence access,
and location requests) compares these with an exact string match, so a
contact added as "+234 803 123 4567" never matched that same person's own
account stored as "+2348031234567" — SMS delivery still worked fine (it
doesn't require a match), which is exactly why this went unnoticed as a
stored-phone-format problem rather than a broken feature. See
app/core/phone.py's normalize_phone (app/api/v1/auth.py and
app/api/v1/contacts.py now write through it going forward) — this
migration is the one-time backfill for rows that predate that fix.
"""
import re

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'b7e2c94f1a58'
down_revision = 'a3d8f61c9e27'
branch_labels = None
depends_on = None


def _normalize(phone: str | None) -> str:
    """Must stay in lockstep with app/core/phone.py's normalize_phone —
    duplicated here (not imported) because migrations should be frozen in
    time, not depend on application code that can change later."""
    stripped = (phone or "").strip()
    if not stripped:
        return stripped
    digits = re.sub(r"[^\d+]", "", stripped)
    if digits.startswith("0") and len(digits) == 11:
        digits = "+234" + digits[1:]
    return digits


def upgrade() -> None:
    conn = op.get_bind()

    # users.phone is unique. Normalizing two differently-formatted rows
    # onto the same canonical string would violate that constraint — only
    # possible if the same real person somehow ended up with two separate
    # accounts, which the app's own signup dedup check (itself an exact
    # string match, pre-fix) wouldn't have caught. Skip any collision
    # rather than let it abort the whole migration; it's logged so it's
    # visible instead of silently papered over.
    #
    # Two passes: first record every value already occupying a normalized
    # slot (a row that needs no change also claims its own slot), *then*
    # decide which of the rows that do need changing can safely take
    # theirs — a row already sitting at the target value (never entering
    # the "needs update" set) would otherwise go undetected as a collision.
    users = conn.execute(sa.text("SELECT id, phone FROM users")).fetchall()
    claimed: dict[str, object] = {}
    to_update: list[tuple[object, str]] = []
    for row in users:
        normalized = _normalize(row.phone)
        if normalized == row.phone:
            claimed[normalized] = row.id
        else:
            to_update.append((row.id, normalized))

    for user_id, normalized in to_update:
        if normalized in claimed:
            print(f"normalize_stored_phone_numbers: skipping user {user_id} — "  # noqa: T201
                  f"normalized phone {normalized!r} collides with user {claimed[normalized]}")
            continue
        claimed[normalized] = user_id
        conn.execute(sa.text("UPDATE users SET phone = :phone WHERE id = :id"), {"phone": normalized, "id": user_id})

    # No uniqueness constraint on trusted_contacts.phone, so no collision
    # handling needed here.
    contacts = conn.execute(sa.text("SELECT id, phone FROM trusted_contacts")).fetchall()
    for row in contacts:
        normalized = _normalize(row.phone)
        if normalized != row.phone:
            conn.execute(
                sa.text("UPDATE trusted_contacts SET phone = :phone WHERE id = :id"),
                {"phone": normalized, "id": row.id},
            )


def downgrade() -> None:
    # Not reversible — the original raw formatting isn't preserved.
    pass
