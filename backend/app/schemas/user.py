import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import AdminRole
from app.schemas.journey import JourneyOut
from app.schemas.sos import SOSEventOut

# Never trust a client-supplied extension unchecked — same reasoning as
# ALLOWED_EXTENSIONS in app.schemas.sos, it ends up in a storage path
# passed straight to Supabase.
AVATAR_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None
    is_verified: bool
    has_fake_pin: bool = False
    gesture_trigger_enabled: bool
    share_location_enabled: bool
    evidence_audio_enabled: bool
    evidence_video_enabled: bool
    evidence_photo_enabled: bool
    admin_role: AdminRole
    medical_info: str | None = None
    avatar_url: str | None = None
    practice_armed_until: datetime | None = None


class BackupCodesOut(BaseModel):
    # Plaintext, on purpose — the only moment these are ever shown. Not
    # persisted anywhere in this form; the DB only ever holds code_hash.
    codes: list[str]


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    medical_info: str | None = Field(default=None, max_length=2000)


class TriggerUpdate(BaseModel):
    # Any field left unset (None) is left unchanged — this is a partial
    # update, not a full replace. To explicitly clear the fake PIN, send
    # an empty string rather than omitting the field.
    fake_pin: str | None = Field(default=None, min_length=4, max_length=12)
    clear_fake_pin: bool = False
    gesture_trigger_enabled: bool | None = None


class PreferencesUpdate(BaseModel):
    # What gets shared/captured during an emergency — distinct from
    # TriggerUpdate, which controls how an SOS gets *started*, not what it
    # does once it has. Every field left unset (None) is left unchanged.
    share_location_enabled: bool | None = None
    evidence_audio_enabled: bool | None = None
    evidence_video_enabled: bool | None = None
    evidence_photo_enabled: bool | None = None


class DeviceRegister(BaseModel):
    # Mirrors the browser's PushSubscription shape exactly — passed straight
    # through to pywebpush's subscription_info, never reshaped in between.
    endpoint: str
    keys: dict[str, str]
    platform: str = "web"


class ContactCreate(BaseModel):
    name: str
    relationship_label: str | None = None
    phone: str
    priority: int = 100


class ContactMoveRequest(BaseModel):
    direction: Literal["up", "down"]


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    relationship_label: str | None
    phone: str
    priority: int
    is_verified: bool
    # Whether this contact's phone matches a registered Safetee account —
    # only such contacts can receive a location share or a request (see
    # app/api/v1/locations.py). Defaults False rather than failing outright
    # for callers that build a ContactOut without setting it explicitly
    # (e.g. DataExportOut) — a stale/unknown "no" is safe, a fabricated
    # "yes" wouldn't be.
    is_app_user: bool = False
    # Only ever populated for an is_app_user contact — the matched account's
    # own uploaded avatar, looked up server-side (see list_contacts). None
    # for a contact who isn't a registered user, or hasn't set a picture.
    avatar_url: str | None = None


class AccountDeleteRequest(BaseModel):
    password: str


class AvatarUploadRequest(BaseModel):
    file_extension: str

    @field_validator("file_extension")
    @classmethod
    def _normalize_extension(cls, v: str) -> str:
        return v.lower().lstrip(".")

    @model_validator(mode="after")
    def _extension_allowed(self) -> "AvatarUploadRequest":
        if self.file_extension not in AVATAR_ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(AVATAR_ALLOWED_EXTENSIONS))
            raise ValueError(f"'{self.file_extension}' is not an allowed extension for a profile picture (allowed: {allowed})")
        return self


class AvatarUploadResponse(BaseModel):
    upload_url: str
    path: str


class AvatarConfirmRequest(BaseModel):
    path: str


class DataExportOut(BaseModel):
    """Everything Safetee holds on the requesting user, as a single
    downloadable snapshot — the self-serve half of the Privacy Policy's
    "review, edit, or delete... at any time" promise. Deliberately built
    from the same *Out schemas the app already serves elsewhere (ContactOut,
    JourneyOut, SOSEventOut) rather than a bespoke shape, so this can't
    drift from what those endpoints actually return."""

    exported_at: datetime
    profile: UserOut
    contacts: list[ContactOut]
    journeys: list[JourneyOut]
    sos_events: list[SOSEventOut]
