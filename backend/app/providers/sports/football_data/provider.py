from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any, TypeVar

from pydantic import ValidationError

from app.domain.sports import (
    Fixture,
    FixtureEvent,
    FixtureInjury,
    FixtureQuery,
    FixtureStatistics,
    FixtureStatus,
    League,
    LeagueQuery,
    LiveFixtureQuery,
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
from app.providers.sports.errors import ProviderConfigurationError, ProviderPayloadError
from app.providers.sports.football_data.client import FootballDataClient, FootballDataResult
from app.providers.sports.football_data.mappers import (
    map_fixture,
    map_league,
    map_standings,
    map_team,
)

T = TypeVar("T")


class FootballDataProvider(SportsDataProvider):
    """football-data.org v4 adapter for current catalog, fixtures, and standings."""

    _capabilities = frozenset(
        {
            ProviderCapability.LEAGUES,
            ProviderCapability.TEAMS,
            ProviderCapability.FIXTURES,
            ProviderCapability.LIVE_FIXTURES,
            ProviderCapability.STANDINGS,
        }
    )
    _ttl = {
        "leagues": 86400,
        "teams": 86400,
        "fixtures": 300,
        "historical_fixtures": 3600,
        "live_fixtures": 30,
        "standings": 3600,
    }
    _statuses = {
        FixtureStatus.SCHEDULED: ("SCHEDULED", "TIMED"),
        FixtureStatus.LIVE: ("IN_PLAY",),
        FixtureStatus.HALFTIME: ("PAUSED",),
        FixtureStatus.FINISHED: ("FINISHED", "AWARDED"),
        FixtureStatus.POSTPONED: ("SUSPENDED", "POSTPONED"),
        FixtureStatus.CANCELLED: ("CANCELLED",),
    }

    def __init__(self, client: FootballDataClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "football_data"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return self._capabilities

    async def list_leagues(self, query: LeagueQuery) -> ProviderResponse[League]:
        endpoint = f"/competitions/{query.external_id}" if query.external_id else "/competitions"
        result = await self._client.get(
            endpoint,
            ttl_seconds=self._ttl["leagues"],
            operation="leagues",
        )
        payloads = self._payload_items(result.payload, "competitions")
        leagues = self._map(result, (map_league(item) for item in payloads), "leagues")
        items = leagues.items
        if query.external_id:
            items = tuple(item for item in items if item.ref.external_id == str(query.external_id))
        if query.country_code:
            items = tuple(
                item for item in items if item.country and item.country.code == query.country_code
            )
        if query.season:
            items = tuple(
                item.model_copy(
                    update={
                        "seasons": tuple(
                            season for season in item.seasons if season.year == query.season
                        )
                    }
                )
                for item in items
                if any(season.year == query.season for season in item.seasons)
            )
        if query.current_only:
            items = tuple(
                item.model_copy(
                    update={
                        "seasons": tuple(season for season in item.seasons if season.is_current)
                    }
                )
                for item in items
                if any(season.is_current for season in item.seasons)
            )
        return leagues.model_copy(update={"items": items})

    async def list_teams(self, query: TeamQuery) -> ProviderResponse[Team]:
        if query.league_external_id and query.season is None:
            raise ProviderConfigurationError(
                "football-data.org team discovery requires a season with a competition.",
                provider=self.name,
            )
        params: dict[str, str | int] = {}
        if query.team_external_id:
            endpoint = f"/teams/{query.team_external_id}"
        elif query.league_external_id:
            endpoint = f"/competitions/{query.league_external_id}/teams"
            params["season"] = query.season or ""
        else:
            endpoint = "/teams"
        result = await self._client.get(
            endpoint,
            params=params,
            ttl_seconds=self._ttl["teams"],
            operation="teams",
        )
        response = self._map(
            result,
            (map_team(item) for item in self._payload_items(result.payload, "teams")),
            "teams",
        )
        items = response.items
        if query.team_external_id:
            items = tuple(item for item in items if item.ref.external_id == query.team_external_id)
        if query.country_code:
            items = tuple(
                item for item in items if item.country and item.country.code == query.country_code
            )
        if query.country_name:
            items = tuple(
                item
                for item in items
                if item.country and item.country.name.casefold() == query.country_name.casefold()
            )
        return response.model_copy(update={"items": items})

    async def list_fixtures(self, query: FixtureQuery) -> ProviderResponse[Fixture]:
        endpoint, params = self._fixture_request(query)
        is_history = bool(
            query.last or (query.date_to and query.date_to < datetime.now(UTC).date())
        )
        operation = "historical_fixtures" if is_history else "fixtures"
        result = await self._client.get(
            endpoint,
            params=params,
            ttl_seconds=self._ttl[operation],
            operation=operation,
        )
        response = self._map(
            result,
            (
                map_fixture(item, result.observed_at)
                for item in self._payload_items(result.payload, "matches")
            ),
            operation,
        )
        items = self._filter_fixtures(response.items, query)
        return response.model_copy(update={"items": items})

    async def list_live_fixtures(
        self,
        query: LiveFixtureQuery,
    ) -> ProviderResponse[Fixture]:
        results: list[FootballDataResult] = []
        fixtures: list[Fixture] = []
        competition_ids = query.league_external_ids or (None,)
        for competition_id in competition_ids:
            endpoint = (
                f"/competitions/{competition_id}/matches"
                if competition_id is not None
                else "/matches"
            )
            result = await self._client.get(
                endpoint,
                params={"status": "LIVE"},
                ttl_seconds=self._ttl["live_fixtures"],
                operation="live_fixtures",
            )
            results.append(result)
            try:
                fixtures.extend(
                    map_fixture(item, result.observed_at)
                    for item in self._payload_items(result.payload, "matches")
                )
            except (KeyError, TypeError, ValueError, ValidationError) as error:
                raise ProviderPayloadError(
                    provider=self.name,
                    operation="live_fixtures",
                ) from error
        return ProviderResponse[Fixture](
            items=tuple(fixtures),
            metadata=self._combine_metadata(results, "live_fixtures"),
        )

    async def get_fixture_events(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureEvent]:
        self._ensure_ref(fixture_ref, "events")
        self.require_capability(ProviderCapability.EVENTS)
        raise AssertionError("unreachable")

    async def get_fixture_statistics(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureStatistics]:
        self._ensure_ref(fixture_ref, "statistics")
        self.require_capability(ProviderCapability.STATISTICS)
        raise AssertionError("unreachable")

    async def get_fixture_lineups(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[TeamLineup]:
        self._ensure_ref(fixture_ref, "lineups")
        self.require_capability(ProviderCapability.LINEUPS)
        raise AssertionError("unreachable")

    async def get_fixture_injuries(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureInjury]:
        self._ensure_ref(fixture_ref, "injuries")
        self.require_capability(ProviderCapability.INJURIES)
        raise AssertionError("unreachable")

    async def get_standings(
        self,
        league_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[StandingsTable]:
        self._ensure_ref(league_ref, "standings")
        result = await self._client.get(
            f"/competitions/{league_ref.external_id}/standings",
            params={"season": season},
            ttl_seconds=self._ttl["standings"],
            operation="standings",
        )
        return self._map(
            result,
            map_standings(result.payload, result.observed_at),
            "standings",
        )

    async def get_odds(self, query: OddsQuery) -> ProviderResponse[OddsQuote]:
        capability = (
            ProviderCapability.LIVE_ODDS
            if query.phase.value == "live"
            else ProviderCapability.PREMATCH_ODDS
        )
        self.require_capability(capability)
        raise AssertionError("unreachable")

    async def get_prediction(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[ProviderPrediction]:
        self._ensure_ref(fixture_ref, "predictions")
        self.require_capability(ProviderCapability.PREDICTIONS)
        raise AssertionError("unreachable")

    async def get_head_to_head(
        self,
        team_a_ref: ProviderRef,
        team_b_ref: ProviderRef,
        *,
        last: int = 10,
    ) -> ProviderResponse[Fixture]:
        self._ensure_ref(team_a_ref, "historical_fixtures")
        self._ensure_ref(team_b_ref, "historical_fixtures")
        self.require_capability(ProviderCapability.HISTORICAL_FIXTURES)
        raise AssertionError("unreachable")

    async def get_team_season_statistics(
        self,
        league_ref: ProviderRef,
        team_ref: ProviderRef,
        season: int,
    ) -> ProviderResponse[TeamSeasonStatistics]:
        self._ensure_ref(league_ref, "team_season_statistics")
        self._ensure_ref(team_ref, "team_season_statistics")
        self.require_capability(ProviderCapability.TEAM_SEASON_STATISTICS)
        raise AssertionError("unreachable")

    async def close(self) -> None:
        await self._client.close()

    def _fixture_request(self, query: FixtureQuery) -> tuple[str, dict[str, str | int]]:
        params: dict[str, str | int] = {}
        if query.fixture_external_ids:
            endpoint = "/matches"
            params["ids"] = ",".join(query.fixture_external_ids)
        elif query.league_external_id:
            endpoint = f"/competitions/{query.league_external_id}/matches"
        elif query.team_external_id:
            endpoint = f"/teams/{query.team_external_id}/matches"
        else:
            endpoint = "/matches"
        if query.season:
            params["season"] = query.season
        if query.date_from:
            params["dateFrom"] = query.date_from.isoformat()
        if query.date_to:
            params["dateTo"] = query.date_to.isoformat()
        provider_statuses = tuple(
            dict.fromkeys(
                status
                for requested in query.statuses
                for status in self._statuses.get(requested, ())
            )
        )
        if provider_statuses:
            params["status"] = ",".join(provider_statuses)
        return endpoint, params

    @staticmethod
    def _filter_fixtures(
        items: tuple[Fixture, ...],
        query: FixtureQuery,
    ) -> tuple[Fixture, ...]:
        filtered = items
        if query.fixture_external_ids:
            fixture_ids = set(query.fixture_external_ids)
            filtered = tuple(item for item in filtered if item.ref.external_id in fixture_ids)
        if query.league_external_id:
            filtered = tuple(
                item for item in filtered if item.league_ref.external_id == query.league_external_id
            )
        if query.team_external_id:
            filtered = tuple(
                item
                for item in filtered
                if query.team_external_id
                in {
                    item.home_team.ref.external_id,
                    item.away_team.ref.external_id,
                }
            )
        if query.season:
            filtered = tuple(item for item in filtered if item.season == query.season)
        if query.date_from:
            filtered = tuple(item for item in filtered if item.kickoff_at.date() >= query.date_from)
        if query.date_to:
            filtered = tuple(item for item in filtered if item.kickoff_at.date() <= query.date_to)
        if query.statuses:
            statuses = set(query.statuses)
            filtered = tuple(item for item in filtered if item.status in statuses)
        filtered = tuple(sorted(filtered, key=lambda item: item.kickoff_at))
        if query.last is not None:
            filtered = filtered[-query.last :]
        if query.next is not None:
            filtered = filtered[: query.next]
        return filtered

    @staticmethod
    def _payload_items(
        payload: Mapping[str, Any],
        collection_key: str,
    ) -> tuple[Mapping[str, Any], ...]:
        collection = payload.get(collection_key)
        if isinstance(collection, list):
            return tuple(item for item in collection if isinstance(item, Mapping))
        return (payload,)

    def _map(
        self,
        result: FootballDataResult,
        values: Iterable[T],
        operation: str,
    ) -> ProviderResponse[T]:
        try:
            items = tuple(values)
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            raise ProviderPayloadError(provider=self.name, operation=operation) from error
        return ProviderResponse[T](items=items, metadata=result.metadata)

    def _ensure_ref(self, value: ProviderRef, operation: str) -> None:
        if value.provider != self.name:
            raise ProviderConfigurationError(
                f"football-data.org reference required for {operation}.",
                provider=self.name,
            )

    def _combine_metadata(
        self,
        results: Sequence[FootballDataResult],
        operation: str,
    ) -> ProviderRequestMetadata:
        if not results:
            return ProviderRequestMetadata(
                provider=self.name,
                operation=operation,
                requested_at=datetime.now(UTC),
                duration_ms=0,
                external_requests=0,
            )
        remaining = [
            result.metadata.quota_remaining
            for result in results
            if result.metadata.quota_remaining is not None
        ]
        return ProviderRequestMetadata(
            provider=self.name,
            operation=operation,
            requested_at=min(result.metadata.requested_at for result in results),
            duration_ms=sum(result.metadata.duration_ms for result in results),
            external_requests=sum(result.metadata.external_requests for result in results),
            quota_remaining=min(remaining) if remaining else None,
            from_cache=all(result.metadata.from_cache for result in results),
        )
