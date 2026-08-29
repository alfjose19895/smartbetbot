from __future__ import annotations

from datetime import UTC, datetime

from pydantic import Field

from app.domain.sports import (
    DomainModel,
    Fixture,
    FixtureEvent,
    FixtureInjury,
    FixtureQuery,
    FixtureStatistics,
    FixtureStatus,
    League,
    LeagueQuery,
    LiveFixtureQuery,
    OddsPhase,
    OddsQuery,
    OddsQuote,
    ProviderCapability,
    ProviderPrediction,
    ProviderRef,
    ProviderRequestMetadata,
    ProviderResponse,
    StandingsTable,
    Team,
    TeamLineup,
    TeamQuery,
    TeamSeasonStatistics,
)
from app.providers.sports.base import SportsDataProvider


class MockSportsDataset(DomainModel):
    """Explicitly injected data; the empty default makes no performance claims."""

    leagues: tuple[League, ...] = ()
    teams: tuple[Team, ...] = ()
    fixtures: tuple[Fixture, ...] = ()
    events: tuple[FixtureEvent, ...] = ()
    statistics: tuple[FixtureStatistics, ...] = ()
    lineups: tuple[TeamLineup, ...] = ()
    injuries: tuple[FixtureInjury, ...] = ()
    standings: tuple[StandingsTable, ...] = ()
    odds: tuple[OddsQuote, ...] = ()
    predictions: tuple[ProviderPrediction, ...] = ()
    team_season_statistics: tuple[TeamSeasonStatistics, ...] = ()
    team_memberships: dict[str, tuple[str, ...]] = Field(default_factory=dict)


class ControlledMockSportsDataProvider(SportsDataProvider):
    _capabilities = frozenset(ProviderCapability)

    def __init__(self, dataset: MockSportsDataset | None = None) -> None:
        self.dataset = dataset or MockSportsDataset()

    @property
    def name(self) -> str:
        return "mock"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return self._capabilities

    def _response[T](self, operation: str, items: tuple[T, ...]) -> ProviderResponse[T]:
        return ProviderResponse[T](
            items=items,
            metadata=ProviderRequestMetadata(
                provider=self.name,
                operation=operation,
                requested_at=datetime.now(UTC),
                duration_ms=0,
                external_requests=0,
            ),
        )

    async def list_leagues(self, query: LeagueQuery) -> ProviderResponse[League]:
        items = self.dataset.leagues
        if query.external_id:
            items = tuple(item for item in items if item.ref.external_id == query.external_id)
        if query.country_code:
            items = tuple(
                item for item in items if item.country and item.country.code == query.country_code
            )
        if query.season:
            items = tuple(
                item
                for item in items
                if any(season.year == query.season for season in item.seasons)
            )
        if query.current_only:
            items = tuple(
                item for item in items if any(season.is_current for season in item.seasons)
            )
        return self._response("list_leagues", items)

    async def list_teams(self, query: TeamQuery) -> ProviderResponse[Team]:
        items = self.dataset.teams
        if query.team_external_id:
            items = tuple(item for item in items if item.ref.external_id == query.team_external_id)
        if query.country_code:
            items = tuple(
                item for item in items if item.country and item.country.code == query.country_code
            )
        if query.league_external_id:
            membership_key = f"{query.league_external_id}:{query.season or '*'}"
            allowed = set(self.dataset.team_memberships.get(membership_key, ()))
            items = tuple(item for item in items if item.ref.external_id in allowed)
        return self._response("list_teams", items)

    async def list_fixtures(self, query: FixtureQuery) -> ProviderResponse[Fixture]:
        items = self.dataset.fixtures
        if query.fixture_external_ids:
            allowed_ids = set(query.fixture_external_ids)
            items = tuple(item for item in items if item.ref.external_id in allowed_ids)
        if query.league_external_id:
            items = tuple(
                item for item in items if item.league_ref.external_id == query.league_external_id
            )
        if query.team_external_id:
            items = tuple(
                item
                for item in items
                if query.team_external_id
                in {item.home_team.ref.external_id, item.away_team.ref.external_id}
            )
        if query.season:
            items = tuple(item for item in items if item.season == query.season)
        if query.date_from:
            items = tuple(item for item in items if item.kickoff_at.date() >= query.date_from)
        if query.date_to:
            items = tuple(item for item in items if item.kickoff_at.date() <= query.date_to)
        if query.statuses:
            allowed_statuses = set(query.statuses)
            items = tuple(item for item in items if item.status in allowed_statuses)
        items = tuple(sorted(items, key=lambda item: item.kickoff_at))
        if query.last is not None:
            items = items[-query.last :]
        if query.next is not None:
            items = items[: query.next]
        return self._response("list_fixtures", items)

    async def list_live_fixtures(self, query: LiveFixtureQuery) -> ProviderResponse[Fixture]:
        live_statuses = {FixtureStatus.LIVE, FixtureStatus.HALFTIME}
        allowed_leagues = set(query.league_external_ids)
        items = tuple(
            item
            for item in self.dataset.fixtures
            if item.status in live_statuses
            and (not allowed_leagues or item.league_ref.external_id in allowed_leagues)
        )
        return self._response("list_live_fixtures", items)

    async def get_fixture_events(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureEvent]:
        items = tuple(
            item
            for item in self.dataset.events
            if item.fixture_ref.external_id == fixture_ref.external_id
        )
        return self._response("get_fixture_events", items)

    async def get_fixture_statistics(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureStatistics]:
        items = tuple(
            item
            for item in self.dataset.statistics
            if item.fixture_ref.external_id == fixture_ref.external_id
        )
        return self._response("get_fixture_statistics", items)

    async def get_fixture_lineups(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[TeamLineup]:
        items = tuple(
            item
            for item in self.dataset.lineups
            if item.fixture_ref.external_id == fixture_ref.external_id
        )
        return self._response("get_fixture_lineups", items)

    async def get_fixture_injuries(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureInjury]:
        items = tuple(
            item
            for item in self.dataset.injuries
            if item.fixture_ref.external_id == fixture_ref.external_id
        )
        return self._response("get_fixture_injuries", items)

    async def get_standings(
        self,
        league_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[StandingsTable]:
        items = tuple(
            item
            for item in self.dataset.standings
            if item.league_ref.external_id == league_ref.external_id and item.season == season
        )
        return self._response("get_standings", items)

    async def get_odds(self, query: OddsQuery) -> ProviderResponse[OddsQuote]:
        fixture_ids = set(query.fixture_external_ids)
        items = tuple(
            item
            for item in self.dataset.odds
            if item.fixture_ref.external_id in fixture_ids and item.phase == query.phase
        )
        if query.bookmaker_external_id:
            items = tuple(
                item
                for item in items
                if item.bookmaker.ref.external_id == query.bookmaker_external_id
            )
        if query.market_external_id:
            items = tuple(
                item
                for item in items
                if item.market.ref and item.market.ref.external_id == query.market_external_id
            )
        operation = "get_live_odds" if query.phase == OddsPhase.LIVE else "get_odds"
        return self._response(operation, items)

    async def get_prediction(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[ProviderPrediction]:
        items = tuple(
            item
            for item in self.dataset.predictions
            if item.fixture_ref.external_id == fixture_ref.external_id
        )
        return self._response("get_prediction", items)

    async def get_head_to_head(
        self,
        team_a_ref: ProviderRef,
        team_b_ref: ProviderRef,
        *,
        last: int = 10,
    ) -> ProviderResponse[Fixture]:
        if not 1 <= last <= 100:
            raise ValueError("last must be between 1 and 100")
        expected = {team_a_ref.external_id, team_b_ref.external_id}
        items = tuple(
            item
            for item in self.dataset.fixtures
            if {item.home_team.ref.external_id, item.away_team.ref.external_id} == expected
            and item.status == FixtureStatus.FINISHED
        )
        items = tuple(sorted(items, key=lambda item: item.kickoff_at, reverse=True)[:last])
        return self._response("get_head_to_head", items)

    async def get_team_season_statistics(
        self,
        league_ref: ProviderRef,
        team_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[TeamSeasonStatistics]:
        items = tuple(
            item
            for item in self.dataset.team_season_statistics
            if item.league_ref.external_id == league_ref.external_id
            and item.team_ref.external_id == team_ref.external_id
            and item.season == season
        )
        return self._response("get_team_season_statistics", items)
