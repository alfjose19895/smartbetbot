from datetime import datetime, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

MarketName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80, pattern=r"^[a-z0-9_]+$"),
]


class UserPreferences(BaseModel):
    minimum_smart_score: int = Field(ge=0, le=100)
    minimum_probability: float = Field(ge=0, le=1)
    minimum_edge: float = Field(ge=-1, le=1)
    live_enabled: bool
    prematch_enabled: bool
    markets: list[str]
    league_ids: list[UUID]
    quiet_hours_enabled: bool
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    timezone: str
    updated_at: datetime


class MeResponse(BaseModel):
    id: UUID
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    role: Literal["user", "admin", "premium", "analyst"]
    timezone: str
    created_at: datetime
    updated_at: datetime
    preferences: UserPreferences


class PreferencesPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minimum_smart_score: int | None = Field(default=None, ge=0, le=100)
    minimum_probability: float | None = Field(default=None, ge=0, le=1)
    minimum_edge: float | None = Field(default=None, ge=-1, le=1)
    live_enabled: bool | None = None
    prematch_enabled: bool | None = None
    markets: list[MarketName] | None = Field(default=None, max_length=50)
    league_ids: list[UUID] | None = Field(default=None, max_length=100)
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("timezone", mode="before")
    @classmethod
    def normalize_timezone(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def reject_null_for_required_preferences(self) -> "PreferencesPatch":
        nullable_fields = {"quiet_hours_start", "quiet_hours_end"}
        for field_name in self.model_fields_set - nullable_fields:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class PushRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fcm_token: str = Field(min_length=20, max_length=4096)
    device_id: str | None = Field(default=None, max_length=255)
    platform: Literal["web", "ios", "android"] = "web"
    user_agent: str | None = Field(default=None, max_length=1024)


class PushDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fcm_token: str = Field(min_length=20, max_length=4096)


class PushSubscriptionResponse(BaseModel):
    id: UUID
    device_id: str | None = None
    platform: Literal["web", "ios", "android"]
    is_enabled: bool
    last_seen_at: datetime
    created_at: datetime
    updated_at: datetime
