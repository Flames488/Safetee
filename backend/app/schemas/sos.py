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
