from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class IngestionModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class WorkerName(StrEnum):
    PREMATCH = "prematch"
    LIVE = "live"
    ODDS = "odds"
    PROBABILITY = "probability"
    SIGNAL = "signal"
    SETTLEMENT = "settlement"
    NOTIFICATION = "notification"


class StoredFixture(IngestionModel):
    id: UUID
    provider: str
    provider_id: str
    league_provider_id: str
    home_team_provider_id: str
    away_team_provider_id: str
    season: int
    kickoff_at: AwareDatetime
    status: str
    match_minute: int | None = None


class IngestionReport(IngestionModel):
    worker: WorkerName
    fixtures_seen: int = Field(default=0, ge=0)
    fixtures_written: int = Field(default=0, ge=0)
    records_written: int = Field(default=0, ge=0)
    provider_requests: int = Field(default=0, ge=0)
    significant_movements: int = Field(default=0, ge=0)
    signals_generated: int = Field(default=0, ge=0)
    skipped_reason: str | None = None
    errors: tuple[str, ...] = ()


class NormalizedOddsSnapshot(IngestionModel):
    fixture_id: UUID
    provider: str
    bookmaker: str
    market: str
    selection: str
    line: Decimal | None = Field(default=None, max_digits=8, decimal_places=3)
    decimal_odds: Decimal = Field(gt=1, max_digits=10, decimal_places=4)
    raw_implied_probability: Decimal = Field(ge=0, le=1, decimal_places=6)
    captured_at: AwareDatetime
    match_minute: int | None = Field(default=None, ge=0, le=150)
    is_live: bool
    stopped: bool = False
    fingerprint: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    raw_payload: dict[str, object] = Field(default_factory=dict)


class PreviousOddsSnapshot(IngestionModel):
    decimal_odds: Decimal
    raw_implied_probability: Decimal
    captured_at: AwareDatetime


class OddsMovement(IngestionModel):
    fixture_id: UUID
    bookmaker: str
    market: str
    selection: str
    line: Decimal | None = None
    is_live: bool
    previous_odds: Decimal
    current_odds: Decimal
    previous_implied_probability: Decimal
    current_implied_probability: Decimal
    odds_change: Decimal
    implied_probability_change: Decimal
    direction: Literal["shortening", "drifting", "unchanged"]
    significant: bool
    previous_captured_at: datetime
    current_captured_at: datetime


class OddsEvaluation(IngestionModel):
    snapshot: NormalizedOddsSnapshot
    fair_market_probability: Decimal | None = Field(default=None, ge=0, le=1)
    model_probability: Decimal | None = Field(default=None, ge=0, le=1)
    edge: Decimal | None = Field(default=None, ge=-1, le=1)
