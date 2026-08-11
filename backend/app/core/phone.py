def normalize_phone(phone: str) -> str:
    """Whitespace-trim only — deliberately NOT a fuzzy/loose matcher.

    An earlier version of this matched on the last 10 digits only, on the
    theory that it was "just for deciding whether to also try a push
    notification." It ended up also gating access to another user's SOS
    evidence and live location (`_is_trusted_contact_of` in
    `app/api/v1/sos.py`) — where a different real phone number (a
    different country code, a VOIP number deliberately chosen to collide)
    matching on its last 10 digits would be treated as the same trusted
    contact and granted access. Matching on the exact stored value is a
    real limitation — no tolerance for a contact's phone being typed with
    different formatting than the matching account signed up with — but it
    fails closed: a missed match just denies a convenience feature, a
    false match would leak private, safety-critical data to the wrong
    person.
    """
    return (phone or "").strip()
