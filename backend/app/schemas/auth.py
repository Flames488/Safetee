from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=20)
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=512)


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


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    phone: str


class ResetPasswordRequest(BaseModel):
    phone: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=512)
