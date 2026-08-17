import re


def normalize_phone(phone: str) -> str:
    """Collapses cosmetic formatting differences into one canonical string,
    without ever discarding digits or the country code.

    An earlier version of this matched on the last 10 digits only, on the
    theory that it was "just for deciding whether to also try a push
    notification." It ended up also gating access to another user's SOS
    evidence and live location (`is_trusted_contact_of`/`watched_owner_ids`
    in `app.services.contact_matching`) — where a different real phone
    number (a different country code, a VOIP number deliberately chosen to
    collide) matching on its last 10 digits would be treated as the same
    trusted contact and granted access. That's why this stays a *lossless*
    transform: stripping "+234 803 123 4567" down to "+2348031234567" can
    never make two genuinely different numbers collide, unlike truncating
    to the last 10 digits (which discards the part that actually
    distinguishes them).

    Two things get normalized:
    1. Formatting punctuation (spaces, dashes, parens, dots) — purely
       cosmetic, safe to strip unconditionally.
    2. A domestically-dialed Nigerian number ("0803...", 11 digits) is
       mapped to its "+234803..." international form — the exact same
       real number, just two ways of writing it. This app is Nigeria-only
       today (Termii SMS, NGN billing, every phone placeholder in the UI
       is +234), so this is a safe, unambiguous assumption right now — if
       Safetee ever supports another country, this needs to become
       locale-aware instead of a flat rule.

    Without this, a contact added as "+234 803 123 4567" would never
    match that same person's own account stored as "+2348031234567" (or
    signed up as "08031234567") — SMS delivery worked fine regardless
    (it doesn't require a match), but every feature that depends on
    recognizing "this contact is also a Safetee account" — the Alerts/
    Network page, evidence access, location requests — silently found
    nothing, which looked like those features being broken rather than a
    stored-phone mismatch.
    """
    stripped = (phone or "").strip()
    if not stripped:
        return ""
    digits = re.sub(r"[^\d+]", "", stripped)
    if digits.startswith("0") and len(digits) == 11:
        digits = "+234" + digits[1:]
    return digits
