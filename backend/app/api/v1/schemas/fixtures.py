from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

FixtureStatus = Literal[
    "scheduled",
    "live",
    "halftime",
    "finished",
    "postponed",
    "cancelled",
    "abandoned",
]


class TeamReference(BaseModel):
    id: UUID
    name: str
    logo_url: str | None = None


class LeagueReference(BaseModel):
    id: UUID
    name: str
    country: str | None = None
    logo_url: str | None = None


class FixtureSummary(BaseModel):
    id: UUID
    league: LeagueReference
    home_team: TeamReference
    away_team: TeamReference
    kickoff_at: datetime
    status: FixtureStatus
    provider_status: str | None = None
    match_minute: int | None = None
    added_time: int | None = None
    home_score: int | None = None
    away_score: int | None = None
    round: str | None = None
    has_events: bool
    has_statistics: bool
    has_odds: bool
    last_synced_at: datetime | None = None


class FixtureDetail(FixtureSummary):
    season_id: UUID | None = None
    halftime_home_score: int | None = None
    halftime_away_score: int | None = None
    referee: str | None = None
    venue: dict[str, object]
    created_at: datetime
    updated_at: datetime


class FixtureTeamStatistics(BaseModel):
    captured_at: datetime
    match_minute: int | None = None
    shots: int | None = None
    shots_on_target: int | None = None
    possession: float | None = None
    corners: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    attacks: int | None = None
    dangerous_attacks: int | None = None


class FixtureSignalReference(BaseModel):
    id: UUID
    market: str
    selection: str
    line: float | None = None
    smart_score: float
    live_pressure_score: float | None = None
    category: str
    triggered_at: datetime


class LiveFixtureAnalysis(FixtureSummary):
    home_statistics: FixtureTeamStatistics | None = None
    away_statistics: FixtureTeamStatistics | None = None
    current_signals: list[FixtureSignalReference] = Field(default_factory=list)


class PrematchPrediction(BaseModel):
    id: UUID
    model_version_id: UUID
    market: str
    selection: str
    line: float | None = None
    probability: float
    decimal_odds: float | None = None
    fair_market_probability: float | None = None
    edge: float | None = None
    expected_value: float | None = None
    smart_score: float | None = None
    category: str | None = None
    strategy_name: str | None = None


class PrematchFixtureAnalysis(FixtureSummary):
    predictions: list[PrematchPrediction] = Field(default_factory=list)
