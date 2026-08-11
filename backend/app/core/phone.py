import re


def normalize_phone_for_match(phone: str) -> str:
    """Loose match key for "is this the same phone number", not a real
    E.164 parser: digits only, last 10. Neither TrustedContact.phone nor
    User.phone is normalized anywhere at write time (both are freeform
    strings), so a contact typed as "(555) 123-4567" and an account signed
    up as "+15551234567" need to compare equal here even though they're
    different strings. Trade-off: this can't distinguish two genuinely
    different numbers that happen to share their last 10 digits across
    different country codes — acceptable for "should we also try a push
    notification", not used for anything security-sensitive.
    """
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits
