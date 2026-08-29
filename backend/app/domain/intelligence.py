from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class IntelligenceModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SignalCategory(StrEnum):
    ELITE = "elite"
    STRONG = "strong"
    QUALIFIED = "qualified"
    WATCH = "watch"
    NO_BET = "no_bet"


class HistoricalFixture(IntelligenceModel):
    fixture_id: UUID
    canonical_league_id: UUID
    canonical_home_team_id: UUID
    canonical_away_team_id: UUID
    kickoff_at: AwareDatetime
    home_score: int = Field(ge=0)
    away_score: int = Field(ge=0)


class PredictionTarget(IntelligenceModel):
    fixture_id: UUID
    canonical_league_id: UUID
    canonical_home_team_id: UUID
    canonical_away_team_id: UUID
    kickoff_at: AwareDatetime
    status: str


class FeatureVector(IntelligenceModel):
    fixture_id: UUID
    feature_cutoff_at: AwareDatetime
    history_matches: int = Field(ge=0)
    home_history_matches: int = Field(ge=0)
    away_history_matches: int = Field(ge=0)
    values: dict[str, float | int | None]


class ProbabilityEstimate(IntelligenceModel):
    fixture_id: UUID
    market: str
    selection: str
    line: Decimal | None = None
    probability: Decimal = Field(ge=0, le=1, decimal_places=6)
    calibrated_probability: Decimal = Field(ge=0, le=1, decimal_places=6)
    feature_cutoff_at: AwareDatetime
    features: dict[str, object]
    fingerprint: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")


class EvaluationMetrics(IntelligenceModel):
    observations: int = Field(ge=0)
    brier_score: float | None = Field(default=None, ge=0)
    log_loss: float | None = Field(default=None, ge=0)
    calibration_error: float | None = Field(default=None, ge=0, le=1)
    accuracy: float | None = Field(default=None, ge=0, le=1)
    roc_auc: float | None = Field(default=None, ge=0, le=1)
    precision: float | None = Field(default=None, ge=0, le=1)
    recall: float | None = Field(default=None, ge=0, le=1)


class ModelVersionRecord(IntelligenceModel):
    id: UUID
    name: str
    version: str
    calibration_error: float | None = None


class DataQualityInput(IntelligenceModel):
    phase: Literal["prematch", "live"]
    minute: bool = False
    score: bool = False
    events: bool = False
    statistics: bool = False
    shots: bool = False
    shots_on_target: bool = False
    possession: bool = False
    corners: bool = False
    cards: bool = False
    odds: bool = False
    historical_features: bool = False
    lineups: bool = False
    standings: bool = False


class DataQualityResult(IntelligenceModel):
    score: Decimal = Field(ge=0, le=100, decimal_places=2)
    sufficient: bool
    available: tuple[str, ...]
    missing: tuple[str, ...]


class LiveMetricSnapshot(IntelligenceModel):
    captured_at: AwareDatetime
    match_minute: int | None = Field(default=None, ge=0, le=150)
    side: Literal["home", "away"]
    shots: int | None = Field(default=None, ge=0)
    shots_on_target: int | None = Field(default=None, ge=0)
    possession: Decimal | None = Field(default=None, ge=0, le=100)
    corners: int | None = Field(default=None, ge=0)
    attacks: int | None = Field(default=None, ge=0)
    dangerous_attacks: int | None = Field(default=None, ge=0)
    yellow_cards: int | None = Field(default=None, ge=0)
    red_cards: int | None = Field(default=None, ge=0)


class LiveEvent(IntelligenceModel):
    side: Literal["home", "away"] | None = None
    event_type: str
    match_minute: int | None = Field(default=None, ge=0, le=150)


class LivePressureResult(IntelligenceModel):
    home_score: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    away_score: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    dominant_side: Literal["home", "away", "balanced"] | None = None
    windows_available: tuple[int, ...] = ()
    missing: tuple[str, ...] = ()


class SmartScoreInput(IntelligenceModel):
    phase: Literal["prematch", "live"]
    model_probability: Decimal = Field(ge=0, le=1)
    edge: Decimal = Field(ge=-1, le=1)
    data_quality: Decimal = Field(ge=0, le=100)
    live_pressure: Decimal | None = Field(default=None, ge=0, le=100)
    calibration_quality: Decimal = Field(default=Decimal("70"), ge=0, le=100)
    stability: Decimal = Field(default=Decimal("70"), ge=0, le=100)
    market_quality: Decimal = Field(default=Decimal("70"), ge=0, le=100)


class SmartScoreResult(IntelligenceModel):
    score: Decimal = Field(ge=0, le=100, decimal_places=2)
    category: SignalCategory
    components: dict[str, Decimal]


class StrategyRule(IntelligenceModel):
    id: UUID
    slug: str
    market: str
    is_live: bool
    min_probability: Decimal = Field(ge=0, le=1)
    min_edge: Decimal = Field(ge=-1, le=1)
    min_smart_score: Decimal = Field(ge=0, le=100)
    min_data_quality: Decimal = Field(ge=0, le=1)
    min_odds: Decimal | None = Field(default=None, gt=1)
    max_odds: Decimal | None = Field(default=None, gt=1)
    cooldown_seconds: int = Field(ge=0)


class MarketPrice(IntelligenceModel):
    bookmaker: str
    market: str
    selection: str
    line: Decimal | None = None
    decimal_odds: Decimal = Field(gt=1)
    raw_implied_probability: Decimal = Field(gt=0, le=1)
    captured_at: AwareDatetime
    stopped: bool = False


class SignalOpportunity(IntelligenceModel):
    fixture_id: UUID
    prediction_id: UUID
    model_version_id: UUID
    strategy: StrategyRule
    market: str
    selection: str
    line: Decimal | None = None
    model_probability: Decimal = Field(ge=0, le=1)
    quote: MarketPrice
    market_prices: tuple[MarketPrice, ...]
    match_minute: int | None = Field(default=None, ge=0, le=150)
    home_score: int | None = Field(default=None, ge=0)
    away_score: int | None = Field(default=None, ge=0)
    expected_home_goals: Decimal | None = Field(default=None, ge=0)
    expected_away_goals: Decimal | None = Field(default=None, ge=0)
    critical_event: str | None = None
    quality: DataQualityInput
    pressure_snapshots: tuple[LiveMetricSnapshot, ...] = ()
    pressure_events: tuple[LiveEvent, ...] = ()
    calibration_error: Decimal | None = Field(default=None, ge=0, le=1)
    previous_odds: Decimal | None = Field(default=None, gt=1)


class SignalReason(IntelligenceModel):
    code: str
    label: str
    numeric_value: Decimal | None = None
    text_value: str | None = None
    unit: str | None = None
    sort_order: int = 0
    metadata: dict[str, object] = Field(default_factory=dict)


class SignalDecision(IntelligenceModel):
    qualified: bool
    suppression_reason: str | None = None
    evaluated_probability: Decimal | None = Field(default=None, ge=0, le=1)
    fair_market_probability: Decimal | None = Field(default=None, ge=0, le=1)
    edge: Decimal | None = Field(default=None, ge=-1, le=1)
    expected_value: Decimal | None = None
    data_quality: DataQualityResult
    live_pressure: LivePressureResult | None = None
    smart_score: SmartScoreResult | None = None
    fingerprint: str | None = None
    reasons: tuple[SignalReason, ...] = ()


class PreviousSignal(IntelligenceModel):
    triggered_at: AwareDatetime
    decimal_odds: Decimal
    edge: Decimal
    smart_score: Decimal
    line: Decimal | None = None
    critical_event: str | None = None


class PersistedSignal(IntelligenceModel):
    id: UUID
    triggered_at: datetime
