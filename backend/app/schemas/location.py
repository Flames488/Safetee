import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import LocationShareStatus


class WatcherOut(BaseModel):
    """Someone who has the current user listed as a trusted contact — i.e.
    someone the current user could request a location from."""

    user_id: uuid.UUID
    full_name: str


class LocationRequestCreate(BaseModel):
    target_user_id: uuid.UUID


class LocationShareCreate(BaseModel):
    """Self-initiated ('share at will') — contact_id identifies which of
    the caller's own TrustedContact rows to share with. The backend
    resolves that to a matching User account; contact_id alone isn't
    enough since sharing requires a real account to notify and authorize."""

    contact_id: uuid.UUID
    duration_minutes: int | None = Field(default=None, gt=0)  # None => settings.location_share_default_minutes


class LocationShareRespond(BaseModel):
    duration_minutes: int | None = Field(default=None, gt=0)  # accept only; ignored by decline


class LocationShareOut(BaseModel):
    id: uuid.UUID
    status: LocationShareStatus
    initiated_by_viewer: bool
    duration_minutes: int
    started_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    owner_id: uuid.UUID
    viewer_id: uuid.UUID
    owner_name: str
    viewer_name: str
