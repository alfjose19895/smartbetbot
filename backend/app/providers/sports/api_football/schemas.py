from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ApiIdentity(ApiModel):
    id: int
    name: str
    logo: str | None = None


class ApiCountry(ApiModel):
    name: str
    code: str | None = None
    flag: str | None = None


class ApiSeason(ApiModel):
    year: int
    start: date | None = None
    end: date | None = None
    current: bool = False
    coverage: dict[str, Any] = Field(default_factory=dict)


class ApiLeague(ApiModel):
    id: int
    name: str
    type: str | None = None
    logo: str | None = None


class ApiLeaguePayload(ApiModel):
    league: ApiLeague
    country: ApiCountry | None = None
    seasons: list[ApiSeason] = Field(default_factory=list)


class ApiVenue(ApiModel):
    id: int | None = None
    name: str | None = None
    address: str | None = None
    city: str | None = None
    capacity: int | None = None
    surface: str | None = None


class ApiTeam(ApiIdentity):
    code: str | None = None
    country: str | None = None
    founded: int | None = None


class ApiTeamPayload(ApiModel):
    team: ApiTeam
    venue: ApiVenue | None = None


class ApiFixtureStatus(ApiModel):
    long: str | None = None
    short: str
    elapsed: int | None = None
    extra: int | None = None


class ApiFixtureCore(ApiModel):
    id: int
    referee: str | None = None
    date: datetime
    venue: ApiVenue | None = None
    status: ApiFixtureStatus


class ApiFixtureLeague(ApiLeague):
    season: int
    round: str | None = None


class ApiFixtureTeam(ApiIdentity):
    winner: bool | None = None


class ApiFixtureTeams(ApiModel):
    home: ApiFixtureTeam
    away: ApiFixtureTeam


class ApiInjuryPlayer(ApiModel):
    id: int | None = None
    name: str
    type: str | None = None
    reason: str | None = None


class ApiInjuryFixture(ApiModel):
    id: int


class ApiInjuryPayload(ApiModel):
    player: ApiInjuryPlayer
    team: ApiIdentity
    fixture: ApiInjuryFixture


class ApiScorePair(ApiModel):
    home: int | None = None
    away: int | None = None


class ApiFixtureScore(ApiModel):
    halftime: ApiScorePair | None = None
    fulltime: ApiScorePair | None = None
    extratime: ApiScorePair | None = None
    penalty: ApiScorePair | None = None


class ApiFixturePayload(ApiModel):
    fixture: ApiFixtureCore
    league: ApiFixtureLeague
    teams: ApiFixtureTeams
    goals: ApiScorePair = Field(default_factory=ApiScorePair)
    score: ApiFixtureScore = Field(default_factory=ApiFixtureScore)


class ApiPerson(ApiModel):
    id: int | None = None
    name: str | None = None


class ApiEventTime(ApiModel):
    elapsed: int | None = None
    extra: int | None = None


class ApiFixtureEventPayload(ApiModel):
    time: ApiEventTime = Field(default_factory=ApiEventTime)
    team: ApiIdentity | None = None
    player: ApiPerson | None = None
    assist: ApiPerson | None = None
    type: str | None = None
    detail: str | None = None
    comments: str | None = None


class ApiStatistic(ApiModel):
    type: str
    value: Any = None


class ApiFixtureStatisticsPayload(ApiModel):
    team: ApiIdentity
    statistics: list[ApiStatistic] = Field(default_factory=list)


class ApiLineupPlayerDetails(ApiPerson):
    number: int | None = None
    pos: str | None = None
    grid: str | None = None


class ApiLineupPlayer(ApiModel):
    player: ApiLineupPlayerDetails


class ApiFixtureLineupPayload(ApiModel):
    team: ApiIdentity
    formation: str | None = None
    coach: ApiPerson | None = None
    startXI: list[ApiLineupPlayer] = Field(default_factory=list)
    substitutes: list[ApiLineupPlayer] = Field(default_factory=list)


class ApiGoals(ApiModel):
    for_: int = Field(alias="for", ge=0)
    against: int = Field(ge=0)


class ApiStandingRecord(ApiModel):
    played: int = Field(default=0, ge=0)
    win: int = Field(default=0, ge=0)
    draw: int = Field(default=0, ge=0)
    lose: int = Field(default=0, ge=0)
    goals: ApiGoals = Field(
        default_factory=lambda: ApiGoals.model_validate({"for": 0, "against": 0})
    )


class ApiStandingEntry(ApiModel):
    rank: int = Field(ge=1)
    team: ApiIdentity
    points: int = 0
    goalsDiff: int = 0
    group: str | None = None
    form: str | None = None
    description: str | None = None
    all: ApiStandingRecord = Field(default_factory=ApiStandingRecord)


class ApiStandingsLeague(ApiLeague):
    season: int
    standings: list[list[ApiStandingEntry]] = Field(default_factory=list)


class ApiStandingsPayload(ApiModel):
    league: ApiStandingsLeague


class ApiOddsFixture(ApiModel):
    id: int
    status: dict[str, Any] = Field(default_factory=dict)


class ApiOddsValue(ApiModel):
    id: int | str | None = None
    value: str | int | float
    odd: Any
    handicap: Any = None
    main: bool | None = None
    suspended: bool | None = None


class ApiOddsBet(ApiModel):
    id: int | str | None = None
    name: str
    values: list[ApiOddsValue] = Field(default_factory=list)


class ApiOddsBookmaker(ApiModel):
    id: int | str
    name: str
    bets: list[ApiOddsBet] = Field(default_factory=list)


class ApiOddsBookmakerIdentity(ApiModel):
    id: int | str
    name: str


class ApiOddsStatus(ApiModel):
    stopped: bool = False
    blocked: bool = False
    finished: bool = False


class ApiOddsPayload(ApiModel):
    fixture: ApiOddsFixture
    update: str | None = None
    status: ApiOddsStatus | None = None
    bookmakers: list[ApiOddsBookmaker] = Field(default_factory=list)
    bookmaker: ApiOddsBookmakerIdentity | None = None
    odds: list[ApiOddsBet] = Field(default_factory=list)


class ApiPredictionWinner(ApiModel):
    id: int | None = None
    name: str | None = None
    comment: str | None = None


class ApiPredictionValues(ApiModel):
    winner: ApiPredictionWinner | None = None
    advice: str | None = None
    percent: dict[str, str | int | float | None] = Field(default_factory=dict)


class ApiPredictionPayload(ApiModel):
    predictions: ApiPredictionValues
    teams: ApiFixtureTeams


class ApiTeamStatisticsPayload(ApiModel):
    league: ApiLeague
    team: ApiTeam
    form: str | None = None
    fixtures: dict[str, Any] = Field(default_factory=dict)
    goals: dict[str, Any] = Field(default_factory=dict)
    biggest: dict[str, Any] = Field(default_factory=dict)
    clean_sheet: dict[str, Any] = Field(default_factory=dict)
    failed_to_score: dict[str, Any] = Field(default_factory=dict)
    penalty: dict[str, Any] = Field(default_factory=dict)
    lineups: list[dict[str, Any]] = Field(default_factory=list)
    cards: dict[str, Any] = Field(default_factory=dict)
