from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.api.v1.schemas.common import Pagination


class PerformanceMetrics(BaseModel):
    settled_signals: int = Field(ge=0)
    resolved_signals: int = Field(ge=0)
    wins: int = Field(ge=0)
    losses: int = Field(ge=0)
    pushes: int = Field(ge=0)
    voids: int = Field(ge=0)
    win_rate: float | None = None
    average_odds: float | None = None
    stake_units: float
    profit_loss_units: float
    roi: float | None = None
    yield_rate: float | None = None


class PerformanceResponse(BaseModel):
    metrics: PerformanceMetrics
    responsible_use_notice: str


class PerformanceGroup(BaseModel):
    key: str
    label: str
    metrics: PerformanceMetrics


class PerformanceGroupsResponse(BaseModel):
    items: list[PerformanceGroup]
    responsible_use_notice: str


class TrackRecordItem(BaseModel):
    signal_id: UUID
    fixture_id: UUID
    kickoff_at: datetime
    home_team: str
    away_team: str
    league: str
    market: str
    selection: str
    signal_type: Literal["prematch", "live"]
    strategy_name: str
    decimal_odds: float
    model_probability: float
    smart_score: float
    result_status: Literal["won", "lost", "void", "push"]
    settled_at: datetime
    stake_units: float
    profit_loss_units: float | None = None


class TrackRecordResponse(BaseModel):
    items: list[TrackRecordItem]
    pagination: Pagination
    responsible_use_notice: str
