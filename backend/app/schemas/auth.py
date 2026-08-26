from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=20)
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=512)
    # Honeypot: a field the real signup form never shows or fills (see
    # Onboarding.jsx), which simple signup bots fill anyway because they
    # parse the DOM structurally rather than rendering it. A human always
    # leaves this empty; anything else here is treated as bot traffic and
    # rejected in the signup handler. Not a full bot-protection story on
    # its own — pairs with the per-phone rate limit below — but real
    # third-party protection — see turnstile_token below, now wired up.
    website: str = ""
    # Cloudflare Turnstile widget token from the signup form; verified
    # server-side in verify_turnstile. Empty string is valid input (not a
    # validation error) — verify_turnstile itself decides whether an empty
    # token is acceptable, based on whether Turnstile is even configured.
    turnstile_token: str = ""


class LoginRequest(BaseModel):
    phone: str
    password: str
    # Best-effort, silent — only ever read on a fake-PIN duress match (see
    # POST /auth/login). Populated by the frontend only if geolocation
    # permission was already granted from an earlier session; never
    # triggers a permission prompt itself, since that would be a visible
    # tell during what's supposed to look like an ordinary login.
    lat: float | None = None
    lng: float | None = None
    turnstile_token: str = ""


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    phone: str
    turnstile_token: str = ""


class ResetPasswordRequest(BaseModel):
    phone: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=512)
