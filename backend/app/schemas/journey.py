import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import JourneyStatus


class JourneyCreate(BaseModel):
    destination_label: str
    destination_lat: float | None = None
    destination_lng: float | None = None
    expected_minutes: int
    notify_contact_ids: list[uuid.UUID]


class JourneyCheckin(BaseModel):
    lat: float
    lng: float
    accuracy_m: float | None = None


class JourneyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    destination_label: str
    destination_lat: float | None = None
    destination_lng: float | None = None
    expected_minutes: int
    expected_arrival_at: datetime
    status: JourneyStatus
    notify_contact_ids: list[str]
    created_at: datetime
