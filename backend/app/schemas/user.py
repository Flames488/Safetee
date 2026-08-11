import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AdminRole
from app.schemas.journey import JourneyOut
from app.schemas.sos import SOSEventOut


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str
    email: str | None
    is_verified: bool
    has_fake_pin: bool = False
    power_button_trigger_enabled: bool
    gesture_trigger_enabled: bool
    share_location_enabled: bool
    evidence_audio_enabled: bool
    evidence_video_enabled: bool
    evidence_photo_enabled: bool
    admin_role: AdminRole
    medical_info: str | None = None


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
    power_button_trigger_enabled: bool | None = None
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


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    relationship_label: str | None
    phone: str
    priority: int
    is_verified: bool


class AccountDeleteRequest(BaseModel):
    password: str


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
