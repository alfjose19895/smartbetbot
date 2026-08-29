from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    model_validator,
)

ExternalId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
SeasonYear = Annotated[int, Field(ge=1900, le=2200)]
NonNegativeInt = Annotated[int, Field(ge=0)]
Percentage = Annotated[float, Field(ge=0, le=100)]
Probability = Annotated[float, Field(ge=0, le=1)]


class DomainModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ProviderCapability(StrEnum):
    LEAGUES = "leagues"
    TEAMS = "teams"
    FIXTURES = "fixtures"
    LIVE_FIXTURES = "live_fixtures"
    EVENTS = "events"
    STATISTICS = "statistics"
    LINEUPS = "lineups"
    STANDINGS = "standings"
    PREMATCH_ODDS = "prematch_odds"
    LIVE_ODDS = "live_odds"
    PREDICTIONS = "predictions"
    HISTORICAL_FIXTURES = "historical_fixtures"
    TEAM_SEASON_STATISTICS = "team_season_statistics"
    INJURIES = "injuries"


class LeagueType(StrEnum):
    LEAGUE = "league"
    CUP = "cup"
    FRIENDLY = "friendly"
    UNKNOWN = "unknown"


class FixtureStatus(StrEnum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    HALFTIME = "halftime"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"
    ABANDONED = "abandoned"
    UNKNOWN = "unknown"


class FixtureEventType(StrEnum):
    GOAL = "goal"
    CARD = "card"
    SUBSTITUTION = "substitution"
    VAR = "var"
    PENALTY = "penalty"
    OTHER = "other"


class OddsPhase(StrEnum):
    PREMATCH = "prematch"
    LIVE = "live"


class ProviderRef(DomainModel):
    provider: Annotated[
        str,
        StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z0-9_]+$"),
    ]
    external_id: ExternalId


class Country(DomainModel):
    name: ShortText
    code: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            to_upper=True,
            pattern=r"^[A-Z0-9]{2,3}(?:-[A-Z0-9]{1,3})?$",
        ),
    ]
    flag_url: HttpUrl | None = None


class Coverage(DomainModel):
    events: bool = False
    lineups: bool = False
    fixture_statistics: bool = False
    player_statistics: bool = False
    standings: bool = False
    predictions: bool = False
    odds: bool = False
    injuries: bool = False


class Season(DomainModel):
    year: SeasonYear
    starts_on: date | None = None
    ends_on: date | None = None
    is_current: bool = False
    coverage: Coverage = Field(default_factory=Coverage)

    @model_validator(mode="after")
    def validate_date_order(self) -> Season:
        if self.starts_on and self.ends_on and self.starts_on > self.ends_on:
            raise ValueError("starts_on must be on or before ends_on")
        return self


class League(DomainModel):
    ref: ProviderRef
    name: ShortText
    league_type: LeagueType = LeagueType.UNKNOWN
    country: Country | None = None
    logo_url: HttpUrl | None = None
    seasons: tuple[Season, ...] = ()


class Venue(DomainModel):
    ref: ProviderRef | None = None
    name: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    capacity: NonNegativeInt | None = None
    surface: str | None = Field(default=None, max_length=100)


class Team(DomainModel):
    ref: ProviderRef
    name: ShortText
    code: str | None = Field(default=None, max_length=20)
    country: Country | None = None
    logo_url: HttpUrl | None = None
    founded_year: int | None = Field(default=None, ge=1800, le=2200)
    venue: Venue | None = None


class TeamSummary(DomainModel):
    ref: ProviderRef
    name: ShortText
    logo_url: HttpUrl | None = None


class FixtureScore(DomainModel):
    home: NonNegativeInt | None = None
    away: NonNegativeInt | None = None
    halftime_home: NonNegativeInt | None = None
    halftime_away: NonNegativeInt | None = None
    fulltime_home: NonNegativeInt | None = None
    fulltime_away: NonNegativeInt | None = None
    extra_time_home: NonNegativeInt | None = None
    extra_time_away: NonNegativeInt | None = None
    penalty_home: NonNegativeInt | None = None
    penalty_away: NonNegativeInt | None = None


class Fixture(DomainModel):
    ref: ProviderRef
    league_ref: ProviderRef
    season: SeasonYear
    kickoff_at: AwareDatetime
    status: FixtureStatus
    provider_status: str | None = Field(default=None, max_length=50)
    home_team: TeamSummary
    away_team: TeamSummary
    score: FixtureScore = Field(default_factory=FixtureScore)
    match_minute: int | None = Field(default=None, ge=0, le=150)
    added_time: int | None = Field(default=None, ge=0, le=30)
    round: str | None = Field(default=None, max_length=255)
    referee: str | None = Field(default=None, max_length=255)
    venue: Venue | None = None
    last_updated_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_teams(self) -> Fixture:
        if self.home_team.ref == self.away_team.ref:
            raise ValueError("home_team and away_team must differ")
        return self


class Person(DomainModel):
    ref: ProviderRef | None = None
    name: ShortText


class FixtureEvent(DomainModel):
    fixture_ref: ProviderRef
    event_ref: ProviderRef | None = None
    event_type: FixtureEventType
    detail: str | None = Field(default=None, max_length=255)
    team_ref: ProviderRef | None = None
    player: Person | None = None
    assist: Person | None = None
    match_minute: int | None = Field(default=None, ge=0, le=150)
    extra_minute: int | None = Field(default=None, ge=0, le=30)
    comments: str | None = Field(default=None, max_length=1000)


class FixtureStatistics(DomainModel):
    fixture_ref: ProviderRef
    team_ref: ProviderRef
    captured_at: AwareDatetime
    match_minute: int | None = Field(default=None, ge=0, le=150)
    shots: NonNegativeInt | None = None
    shots_on_target: NonNegativeInt | None = None
    shots_off_target: NonNegativeInt | None = None
    blocked_shots: NonNegativeInt | None = None
    possession: Percentage | None = None
    corners: NonNegativeInt | None = None
    fouls: NonNegativeInt | None = None
    yellow_cards: NonNegativeInt | None = None
    red_cards: NonNegativeInt | None = None
    goalkeeper_saves: NonNegativeInt | None = None
    passes_total: NonNegativeInt | None = None
    passes_accurate: NonNegativeInt | None = None
    attacks: NonNegativeInt | None = None
    dangerous_attacks: NonNegativeInt | None = None
    extras: dict[str, int | float | str | None] = Field(default_factory=dict)


class LineupPlayer(DomainModel):
    player: Person
    number: NonNegativeInt | None = None
    position: str | None = Field(default=None, max_length=50)
    grid: str | None = Field(default=None, max_length=20)


class TeamLineup(DomainModel):
    fixture_ref: ProviderRef
    team: TeamSummary
    formation: str | None = Field(default=None, max_length=30)
    coach: Person | None = None
    starting_xi: tuple[LineupPlayer, ...] = ()
    substitutes: tuple[LineupPlayer, ...] = ()
    confirmed_at: AwareDatetime | None = None


class FixtureInjury(DomainModel):
    fixture_ref: ProviderRef
    team_ref: ProviderRef
    player: Person
    injury_type: str | None = Field(default=None, max_length=255)
    reason: str | None = Field(default=None, max_length=500)
    captured_at: AwareDatetime


class StandingEntry(DomainModel):
    rank: Annotated[int, Field(ge=1)]
    team: TeamSummary
    points: int
    played: NonNegativeInt
    wins: NonNegativeInt
    draws: NonNegativeInt
    losses: NonNegativeInt
    goals_for: NonNegativeInt
    goals_against: NonNegativeInt
    goal_difference: int
    form: str | None = Field(default=None, max_length=30)
    description: str | None = Field(default=None, max_length=255)


class StandingsTable(DomainModel):
    league_ref: ProviderRef
    season: SeasonYear
    group: str | None = Field(default=None, max_length=255)
    entries: tuple[StandingEntry, ...]
    captured_at: AwareDatetime


class Bookmaker(DomainModel):
    ref: ProviderRef
    name: ShortText


class OddsMarket(DomainModel):
    ref: ProviderRef | None = None
    name: ShortText
    canonical_name: str | None = Field(default=None, max_length=100)


class OddsSelection(DomainModel):
    ref: ProviderRef | None = None
    name: ShortText
    canonical_name: str | None = Field(default=None, max_length=100)


class OddsQuote(DomainModel):
    fixture_ref: ProviderRef
    bookmaker: Bookmaker
    market: OddsMarket
    selection: OddsSelection
    phase: OddsPhase
    decimal_odds: Annotated[Decimal, Field(gt=1, max_digits=10, decimal_places=4)]
    captured_at: AwareDatetime
    line: Decimal | None = Field(default=None, max_digits=8, decimal_places=3)
    match_minute: int | None = Field(default=None, ge=0, le=150)
    stopped: bool = False


class ProviderPrediction(DomainModel):
    fixture_ref: ProviderRef
    home_win_probability: Probability | None = None
    draw_probability: Probability | None = None
    away_win_probability: Probability | None = None
    predicted_winner_ref: ProviderRef | None = None
    advice: str | None = Field(default=None, max_length=1000)
    generated_at: AwareDatetime | None = None
    supplementary_only: Literal[True] = True


class TeamSeasonStatistics(DomainModel):
    league_ref: ProviderRef
    team_ref: ProviderRef
    season: SeasonYear
    captured_at: AwareDatetime
    metrics: dict[str, int | float | str | None]


class LeagueQuery(DomainModel):
    external_id: ExternalId | None = None
    country_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{2,3}(?:-[A-Z0-9]{1,3})?$")
    season: SeasonYear | None = None
    current_only: bool = False


class TeamQuery(DomainModel):
    league_external_id: ExternalId | None = None
    season: SeasonYear | None = None
    team_external_id: ExternalId | None = None
    country_name: str | None = Field(default=None, min_length=3, max_length=255)
    country_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{2,3}(?:-[A-Z0-9]{1,3})?$")

    @model_validator(mode="after")
    def validate_country_filter(self) -> TeamQuery:
        if self.country_name and self.country_code:
            raise ValueError("country_name and country_code cannot be combined")
        return self


class FixtureQuery(DomainModel):
    fixture_external_ids: tuple[ExternalId, ...] = Field(default=(), max_length=20)
    league_external_id: ExternalId | None = None
    team_external_id: ExternalId | None = None
    season: SeasonYear | None = None
    date_from: date | None = None
    date_to: date | None = None
    statuses: tuple[FixtureStatus, ...] = ()
    last: int | None = Field(default=None, ge=1, le=100)
    next: int | None = Field(default=None, ge=1, le=100)

    @model_validator(mode="after")
    def validate_filters(self) -> FixtureQuery:
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must be on or before date_to")
        if self.last is not None and self.next is not None:
            raise ValueError("last and next cannot be combined")
        if len(set(self.fixture_external_ids)) != len(self.fixture_external_ids):
            raise ValueError("fixture_external_ids must be unique")
        return self


class LiveFixtureQuery(DomainModel):
    league_external_ids: tuple[ExternalId, ...] = Field(default=(), max_length=50)


class OddsQuery(DomainModel):
    fixture_external_ids: tuple[ExternalId, ...] = Field(min_length=1, max_length=20)
    phase: OddsPhase
    bookmaker_external_id: ExternalId | None = None
    market_external_id: ExternalId | None = None

    @model_validator(mode="after")
    def validate_unique_fixtures(self) -> OddsQuery:
        if len(set(self.fixture_external_ids)) != len(self.fixture_external_ids):
            raise ValueError("fixture_external_ids must be unique")
        return self


class ProviderRequestMetadata(DomainModel):
    provider: str
    operation: str
    requested_at: AwareDatetime
    duration_ms: float = Field(ge=0)
    external_requests: int = Field(default=1, ge=0)
    quota_limit: int | None = Field(default=None, ge=0)
    quota_remaining: int | None = Field(default=None, ge=0)
    page: int | None = Field(default=None, ge=1)
    total_pages: int | None = Field(default=None, ge=1)
    from_cache: bool = False


class ProviderResponse[T](DomainModel):
    items: tuple[T, ...]
    metadata: ProviderRequestMetadata


NormalizedSportsEntity = (
    League
    | Team
    | Fixture
    | FixtureEvent
    | FixtureStatistics
    | TeamLineup
    | StandingsTable
    | OddsQuote
    | ProviderPrediction
    | TeamSeasonStatistics
)


def provider_payload_schema() -> dict[str, Any]:
    """Expose the normalized contract without importing an adapter payload type."""
    return ProviderResponse[Fixture].model_json_schema()
