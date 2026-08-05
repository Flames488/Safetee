import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AlertChannel, AlertStatus, SOSStatus, SOSTrigger


class SOSTriggerRequest(BaseModel):
    trigger: SOSTrigger = SOSTrigger.button
    lat: float | None = None
    lng: float | None = None
    journey_id: uuid.UUID | None = None


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
