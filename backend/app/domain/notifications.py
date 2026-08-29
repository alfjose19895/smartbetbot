from __future__ import annotations

from datetime import time
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class QueuedNotification(NotificationModel):
    id: UUID
    user_id: UUID
    signal_id: UUID
    title: str
    body: str
    timezone: str
    quiet_hours_enabled: bool
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    tokens: tuple[str, ...]
    metadata: dict[str, object]


class PushSendResult(NotificationModel):
    success: bool
    provider_message_id: str | None = None
    error_code: str | None = None
