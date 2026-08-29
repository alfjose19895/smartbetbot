from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.api.v1.schemas.common import Pagination
from app.api.v1.schemas.fixtures import LeagueReference, TeamReference


class SignalReason(BaseModel):
    code: str
    label: str
    numeric_value: float | None = None
    text_value: str | None = None
    unit: str | None = None
    sort_order: int
    metadata: dict[str, object]


class SignalResult(BaseModel):
    result_status: Literal["won", "lost", "void", "push", "pending"]
    home_score: int | None = None
    away_score: int | None = None
    settled_at: datetime | None = None
    settlement_odds: float | None = None
    stake_units: float
    profit_loss_units: float | None = None


class SignalSummary(BaseModel):
    id: UUID
    fixture_id: UUID
    strategy_id: UUID
    strategy_name: str
    league: LeagueReference
    home_team: TeamReference
    away_team: TeamReference
    kickoff_at: datetime
    signal_type: Literal["prematch", "live"]
    market: str
    selection: str
    line: float | None = None
    decimal_odds: float
    model_probability: float = Field(ge=0, le=1)
    raw_implied_probability: float = Field(ge=0, le=1)
    fair_market_probability: float | None = Field(default=None, ge=0, le=1)
    edge: float = Field(ge=-1, le=1)
    expected_value: float
    data_quality_score: float = Field(ge=0, le=100)
    live_pressure_score: float | None = Field(default=None, ge=0, le=100)
    smart_score: float = Field(ge=0, le=100)
    category: Literal["elite", "strong", "qualified", "watch", "no_bet"]
    status: Literal["qualified", "suppressed", "cancelled", "settled"]
    triggered_at: datetime
    match_minute: int | None = None
    critical_event: str | None = None


class SignalDetail(SignalSummary):
    prediction_id: UUID | None = None
    model_version_id: UUID | None = None
    reasons: list[SignalReason]
    result: SignalResult | None = None


class SignalPageResponse(BaseModel):
    items: list[SignalSummary]
    pagination: "Pagination"
    responsible_use_notice: str


class SignalDetailResponse(BaseModel):
    signal: SignalDetail
    responsible_use_notice: str
