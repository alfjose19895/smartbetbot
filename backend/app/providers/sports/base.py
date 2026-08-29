from __future__ import annotations

from abc import ABC, abstractmethod
from types import TracebackType

from app.domain.sports import (
    Fixture,
    FixtureEvent,
    FixtureInjury,
    FixtureQuery,
    FixtureStatistics,
    League,
    LeagueQuery,
    LiveFixtureQuery,
    OddsQuery,
    OddsQuote,
    ProviderCapability,
    ProviderPrediction,
    ProviderRef,
    ProviderResponse,
    StandingsTable,
    Team,
    TeamLineup,
    TeamQuery,
    TeamSeasonStatistics,
)
from app.providers.sports.errors import UnsupportedCapabilityError


class SportsDataProvider(ABC):
    """Provider-neutral asynchronous port for all external football data."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Stable provider slug persisted alongside normalized records."""

    @property
    @abstractmethod
    def capabilities(self) -> frozenset[ProviderCapability]:
        """Declare available operations before consuming provider quota."""

    def require_capability(self, capability: ProviderCapability) -> None:
        if capability not in self.capabilities:
            raise UnsupportedCapabilityError(provider=self.name, capability=capability.value)

    @abstractmethod
    async def list_leagues(self, query: LeagueQuery) -> ProviderResponse[League]:
        """Return normalized competitions, seasons, and coverage flags."""

    @abstractmethod
    async def list_teams(self, query: TeamQuery) -> ProviderResponse[Team]:
        """Return normalized teams for discovery or league-season ingestion."""

    @abstractmethod
    async def list_fixtures(self, query: FixtureQuery) -> ProviderResponse[Fixture]:
        """Return scheduled, completed, or historical fixtures matching the query."""

    @abstractmethod
    async def list_live_fixtures(self, query: LiveFixtureQuery) -> ProviderResponse[Fixture]:
        """Return only fixtures currently in a live state."""

    @abstractmethod
    async def get_fixture_events(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureEvent]:
        """Return the provider's normalized match timeline."""

    @abstractmethod
    async def get_fixture_statistics(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureStatistics]:
        """Return per-team fixture statistics while preserving missing values."""

    @abstractmethod
    async def get_fixture_lineups(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[TeamLineup]:
        """Return confirmed or provisional team lineups when available."""

    @abstractmethod
    async def get_fixture_injuries(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureInjury]:
        """Return provider-reported player absences for a fixture when covered."""

    @abstractmethod
    async def get_standings(
        self,
        league_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[StandingsTable]:
        """Return one or more overall/group standings tables."""

    @abstractmethod
    async def get_odds(self, query: OddsQuery) -> ProviderResponse[OddsQuote]:
        """Return normalized prematch or live market quotes."""

    @abstractmethod
    async def get_prediction(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[ProviderPrediction]:
        """Return optional provider estimates as supplementary context only."""

    @abstractmethod
    async def get_head_to_head(
        self,
        team_a_ref: ProviderRef,
        team_b_ref: ProviderRef,
        *,
        last: int = 10,
    ) -> ProviderResponse[Fixture]:
        """Return historical meetings without treating them as future knowledge."""

    @abstractmethod
    async def get_team_season_statistics(
        self,
        league_ref: ProviderRef,
        team_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[TeamSeasonStatistics]:
        """Return normalized season aggregates for leakage-safe feature generation."""

    async def close(self) -> None:
        """Release adapter resources. Stateless implementations may keep the default no-op."""
        return None

    async def __aenter__(self) -> SportsDataProvider:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.close()
