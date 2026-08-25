import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.enums import AlertChannel, AlertStatus, SOSStatus, SOSTrigger

MediaType = Literal["audio", "video", "photo"]

# Never trust a client-supplied extension unchecked — it ends up in a
# storage path passed straight to Supabase.
ALLOWED_EXTENSIONS: dict[MediaType, set[str]] = {
    "audio": {"webm", "m4a", "mp3", "ogg"},
    "video": {"webm", "mp4", "mov"},
    "photo": {"jpg", "jpeg", "png", "webp"},
}


class SOSTriggerRequest(BaseModel):
    trigger: SOSTrigger = SOSTrigger.button
    lat: float | None = None
    lng: float | None = None
    journey_id: uuid.UUID | None = None


class SOSResolveRequest(BaseModel):
    # The frontend only ever calls /resolve once an alert has already fanned
    # out (see SOSActive.jsx — cancel, not resolve, is used during the
    # pending/countdown window). Without this, anyone holding the phone or
    # watch could silence a real emergency with a single hold gesture.
    password: str


class EvidenceUploadRequest(BaseModel):
    media_type: MediaType
    file_extension: str

    @field_validator("file_extension")
    @classmethod
    def _normalize_extension(cls, v: str) -> str:
        return v.lower().lstrip(".")

    @model_validator(mode="after")
    def _extension_allowed_for_type(self) -> "EvidenceUploadRequest":
        if self.file_extension not in ALLOWED_EXTENSIONS[self.media_type]:
            allowed = ", ".join(sorted(ALLOWED_EXTENSIONS[self.media_type]))
            raise ValueError(f"'{self.file_extension}' is not an allowed extension for {self.media_type} (allowed: {allowed})")
        return self


class EvidenceUploadResponse(BaseModel):
    upload_url: str
    path: str
    media_type: MediaType


class EvidenceConfirmRequest(BaseModel):
    media_type: MediaType
    path: str


class EvidenceOut(BaseModel):
    audio_urls: list[str] = []
    video_urls: list[str] = []
    photo_urls: list[str] = []


class SOSAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contact_id: uuid.UUID
    channel: AlertChannel
    status: AlertStatus


class SOSEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: SOSStatus
    trigger: SOSTrigger
    cancel_window_ends_at: datetime
    resolved_at: datetime | None
    created_at: datetime
    alerts: list[SOSAlertOut] = []


class IncomingAlertOut(BaseModel):
    """An SOS event triggered by someone else who has the viewer listed as
    a trusted contact — deliberately leaner than SOSEventOut (no cancel
    window, no per-contact alert breakdown; that's the owner's business,
    not the contact's)."""

    id: uuid.UUID
    status: SOSStatus
    trigger: SOSTrigger
    created_at: datetime
    resolved_at: datetime | None
    origin_lat: float | None
    origin_lng: float | None
    alerter_name: str
    alerter_avatar_url: str | None = None
