from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import TypeVar

from pydantic import ValidationError

from app.domain.sports import (
    Fixture,
    FixtureEvent,
    FixtureInjury,
    FixtureQuery,
    FixtureStatistics,
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
from app.providers.sports.api_football.client import ApiFootballClient, ApiFootballResult
from app.providers.sports.api_football.mappers import (
    map_fixture,
    map_fixture_event,
    map_fixture_injury,
    map_fixture_lineup,
    map_fixture_statistics,
    map_league,
    map_odds,
    map_prediction,
    map_standings,
    map_team,
    map_team_statistics,
)
from app.providers.sports.api_football.schemas import ApiCountry
from app.providers.sports.base import SportsDataProvider
from app.providers.sports.errors import ProviderConfigurationError, ProviderPayloadError

T = TypeVar("T")


class ApiFootballProvider(SportsDataProvider):
    """Production API-Football v3 adapter with provider-neutral output."""

    _capabilities = frozenset(ProviderCapability)
    _fixture_statuses = {
        "scheduled": ("TBD", "NS"),
        "live": ("1H", "2H", "ET", "BT", "P", "LIVE"),
        "halftime": ("HT",),
        "finished": ("FT", "AET", "PEN", "AWD", "WO"),
        "postponed": ("PST", "SUSP", "INT"),
        "cancelled": ("CANC",),
        "abandoned": ("ABD",),
    }
    _ttl = {
        "leagues": 86400,
        "teams": 86400,
        "fixtures": 300,
        "historical_fixtures": 3600,
        "live_fixtures": 15,
        "events": 15,
        "statistics": 60,
        "lineups": 300,
        "injuries": 1800,
        "standings": 3600,
        "prematch_odds": 10800,
        "live_odds": 15,
        "predictions": 3600,
        "team_season_statistics": 43200,
    }

    def __init__(self, client: ApiFootballClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "api_football"

    @property
    def capabilities(self) -> frozenset[ProviderCapability]:
        return self._capabilities

    async def list_leagues(self, query: LeagueQuery) -> ProviderResponse[League]:
        params: dict[str, str | int] = {}
        if query.external_id:
            params["id"] = query.external_id
        if query.country_code:
            params["code"] = query.country_code
        if query.season:
            params["season"] = query.season
        if query.current_only:
            params["current"] = "true"
        result = await self._client.get(
            "/leagues", params=params, ttl_seconds=self._ttl["leagues"], operation="leagues"
        )
        return self._mapped(result, (map_league(item) for item in result.items), "leagues")

    async def list_teams(self, query: TeamQuery) -> ProviderResponse[Team]:
        if bool(query.league_external_id) != bool(query.season):
            raise ProviderConfigurationError(
                "API-Football team discovery requires league and season together.",
                provider=self.name,
            )
        if not any(
            (
                query.team_external_id,
                query.league_external_id,
                query.country_name,
                query.country_code,
            )
        ):
            raise ProviderConfigurationError(
                "API-Football team discovery requires a team, league-season, or country filter.",
                provider=self.name,
            )
        params: dict[str, str | int] = {}
        supporting_results: list[ApiFootballResult] = []
        if query.team_external_id:
            params["id"] = query.team_external_id
        if query.league_external_id:
            params["league"] = query.league_external_id
        if query.season:
            params["season"] = query.season
        if query.country_name:
            params["country"] = query.country_name
        elif query.country_code:
            countries_result = await self._client.get(
                "/teams/countries",
                ttl_seconds=self._ttl["teams"],
                operation="team_countries",
            )
            supporting_results.append(countries_result)
            try:
                countries = tuple(
                    ApiCountry.model_validate(country) for country in countries_result.items
                )
                matching_country = next(
                    (
                        country.name
                        for country in countries
                        if (country.code or "").upper() == query.country_code.upper()
                    ),
                    None,
                )
            except (ValidationError, ValueError, TypeError) as error:
                raise ProviderPayloadError(provider=self.name, operation="teams") from error
            if not isinstance(matching_country, str) or not matching_country:
                return ProviderResponse(
                    items=(),
                    metadata=self._combine_metadata(supporting_results, "teams"),
                )
            params["country"] = matching_country
        result = await self._client.get(
            "/teams", params=params, ttl_seconds=self._ttl["teams"], operation="teams"
        )
        mapped = self._mapped(
            result,
            (map_team(item, query.country_code) for item in result.items),
            "teams",
        )
        if not supporting_results:
            return mapped
        return ProviderResponse(
            items=mapped.items,
            metadata=self._combine_metadata([*supporting_results, result], "teams"),
        )

    async def list_fixtures(self, query: FixtureQuery) -> ProviderResponse[Fixture]:
        params: dict[str, str | int] = {"timezone": "UTC"}
        if query.fixture_external_ids:
            params["ids"] = "-".join(query.fixture_external_ids)
        if query.league_external_id:
            params["league"] = query.league_external_id
        if query.team_external_id:
            params["team"] = query.team_external_id
        if query.season:
            params["season"] = query.season
        if query.date_from:
            params["from"] = query.date_from.isoformat()
        if query.date_to:
            params["to"] = query.date_to.isoformat()
        if query.statuses:
            provider_statuses = [
                provider_status
                for status in query.statuses
                for provider_status in self._fixture_statuses.get(status.value, ())
            ]
            if provider_statuses:
                params["status"] = "-".join(provider_statuses)
        if query.last:
            params["last"] = query.last
        if query.next:
            params["next"] = query.next
        is_history = bool(
            query.last or (query.date_to and query.date_to < datetime.now(UTC).date())
        )
        operation = "historical_fixtures" if is_history else "fixtures"
        result = await self._client.get(
            "/fixtures", params=params, ttl_seconds=self._ttl[operation], operation=operation
        )
        return self._mapped(
            result,
            (map_fixture(item, result.observed_at) for item in result.items),
            operation,
        )

    async def list_live_fixtures(self, query: LiveFixtureQuery) -> ProviderResponse[Fixture]:
        live_filter = "-".join(query.league_external_ids) or "all"
        result = await self._client.get(
            "/fixtures",
            params={"live": live_filter, "timezone": "UTC"},
            ttl_seconds=self._ttl["live_fixtures"],
            operation="live_fixtures",
        )
        return self._mapped(
            result,
            (map_fixture(item, result.observed_at) for item in result.items),
            "live_fixtures",
        )

    async def get_fixture_events(self, fixture_ref: ProviderRef) -> ProviderResponse[FixtureEvent]:
        self._ensure_ref(fixture_ref, "events")
        result = await self._client.get(
            "/fixtures/events",
            params={"fixture": fixture_ref.external_id},
            ttl_seconds=self._ttl["events"],
            operation="events",
        )
        return self._mapped(
            result,
            (map_fixture_event(item, fixture_ref) for item in result.items),
            "events",
        )

    async def get_fixture_statistics(
        self, fixture_ref: ProviderRef
    ) -> ProviderResponse[FixtureStatistics]:
        self._ensure_ref(fixture_ref, "statistics")
        result = await self._client.get(
            "/fixtures/statistics",
            params={"fixture": fixture_ref.external_id},
            ttl_seconds=self._ttl["statistics"],
            operation="statistics",
        )
        return self._mapped(
            result,
            (
                map_fixture_statistics(item, fixture_ref, result.observed_at)
                for item in result.items
            ),
            "statistics",
        )

    async def get_fixture_lineups(self, fixture_ref: ProviderRef) -> ProviderResponse[TeamLineup]:
        self._ensure_ref(fixture_ref, "lineups")
        result = await self._client.get(
            "/fixtures/lineups",
            params={"fixture": fixture_ref.external_id},
            ttl_seconds=self._ttl["lineups"],
            operation="lineups",
        )
        return self._mapped(
            result,
            (map_fixture_lineup(item, fixture_ref, result.observed_at) for item in result.items),
            "lineups",
        )

    async def get_fixture_injuries(
        self,
        fixture_ref: ProviderRef,
    ) -> ProviderResponse[FixtureInjury]:
        self._ensure_ref(fixture_ref, "injuries")
        result = await self._client.get(
            "/injuries",
            params={"fixture": fixture_ref.external_id},
            ttl_seconds=self._ttl["injuries"],
            operation="injuries",
        )
        return self._mapped(
            result,
            (map_fixture_injury(item, result.observed_at) for item in result.items),
            "injuries",
        )

    async def get_standings(
        self, league_ref: ProviderRef, season: int
    ) -> ProviderResponse[StandingsTable]:
        self._ensure_ref(league_ref, "standings")
        result = await self._client.get(
            "/standings",
            params={"league": league_ref.external_id, "season": season},
            ttl_seconds=self._ttl["standings"],
            operation="standings",
        )
        tables = (
            table for item in result.items for table in map_standings(item, result.observed_at)
        )
        return self._mapped(result, tables, "standings")

    async def get_odds(self, query: OddsQuery) -> ProviderResponse[OddsQuote]:
        operation = "live_odds" if query.phase == OddsPhase.LIVE else "prematch_odds"
        endpoint = "/odds/live" if query.phase == OddsPhase.LIVE else "/odds"
        results: list[ApiFootballResult] = []
        items: list[OddsQuote] = []
        for fixture_id in query.fixture_external_ids:
            params: dict[str, str | int] = {"fixture": fixture_id}
            if query.bookmaker_external_id:
                params["bookmaker"] = query.bookmaker_external_id
            if query.market_external_id:
                params["bet"] = query.market_external_id
            result = await self._client.get(
                endpoint,
                params=params,
                ttl_seconds=self._ttl[operation],
                all_pages=query.phase == OddsPhase.PREMATCH,
                operation=operation,
            )
            results.append(result)
            try:
                for item in result.items:
                    items.extend(map_odds(item, query.phase, result.observed_at))
            except (ValidationError, ValueError, TypeError, KeyError) as error:
                raise ProviderPayloadError(provider=self.name, operation=operation) from error
        return ProviderResponse(
            items=tuple(items), metadata=self._combine_metadata(results, operation)
        )

    async def get_prediction(
        self, fixture_ref: ProviderRef
    ) -> ProviderResponse[ProviderPrediction]:
        self._ensure_ref(fixture_ref, "predictions")
        result = await self._client.get(
            "/predictions",
            params={"fixture": fixture_ref.external_id},
            ttl_seconds=self._ttl["predictions"],
            operation="predictions",
        )
        return self._mapped(
            result,
            (map_prediction(item, fixture_ref, result.observed_at) for item in result.items),
            "predictions",
        )

    async def get_head_to_head(
        self,
        team_a_ref: ProviderRef,
        team_b_ref: ProviderRef,
        *,
        last: int = 10,
    ) -> ProviderResponse[Fixture]:
        self._ensure_ref(team_a_ref, "historical_fixtures")
        self._ensure_ref(team_b_ref, "historical_fixtures")
        if not 1 <= last <= 100:
            raise ProviderConfigurationError(
                "Head-to-head history must request between 1 and 100 fixtures.",
                provider=self.name,
            )
        result = await self._client.get(
            "/fixtures/headtohead",
            params={
                "h2h": f"{team_a_ref.external_id}-{team_b_ref.external_id}",
                "last": last,
                "timezone": "UTC",
            },
            ttl_seconds=self._ttl["historical_fixtures"],
            operation="historical_fixtures",
        )
        return self._mapped(
            result,
            (map_fixture(item, result.observed_at) for item in result.items),
            "historical_fixtures",
        )

    async def get_team_season_statistics(
        self, league_ref: ProviderRef, team_ref: ProviderRef, season: int
    ) -> ProviderResponse[TeamSeasonStatistics]:
        self._ensure_ref(league_ref, "team_season_statistics")
        self._ensure_ref(team_ref, "team_season_statistics")
        result = await self._client.get(
            "/teams/statistics",
            params={
                "league": league_ref.external_id,
                "team": team_ref.external_id,
                "season": season,
            },
            ttl_seconds=self._ttl["team_season_statistics"],
            operation="team_season_statistics",
        )
        return self._mapped(
            result,
            (
                map_team_statistics(item, season=season, captured_at=result.observed_at)
                for item in result.items
            ),
            "team_season_statistics",
        )

    def _ensure_ref(self, value: ProviderRef, operation: str) -> None:
        if value.provider != self.name:
            raise ProviderConfigurationError(
                f"Operation '{operation}' requires an API-Football reference.",
                provider=self.name,
            )

    def _mapped(
        self,
        result: ApiFootballResult,
        values: Iterable[T],
        operation: str,
    ) -> ProviderResponse[T]:
        try:
            return ProviderResponse(items=tuple(values), metadata=result.metadata)
        except (ValidationError, ValueError, TypeError, KeyError) as error:
            raise ProviderPayloadError(provider=self.name, operation=operation) from error

    def _combine_metadata(
        self, results: list[ApiFootballResult], operation: str
    ) -> ProviderRequestMetadata:
        if not results:
            return ProviderRequestMetadata(
                provider=self.name,
                operation=operation,
                requested_at=datetime.now(UTC),
                duration_ms=0,
                external_requests=0,
                from_cache=True,
            )
        metadata = [result.metadata for result in results]
        quota_values = [
            item.quota_remaining for item in metadata if item.quota_remaining is not None
        ]
        limits = [item.quota_limit for item in metadata if item.quota_limit is not None]
        return ProviderRequestMetadata(
            provider=self.name,
            operation=operation,
            requested_at=min(item.requested_at for item in metadata),
            duration_ms=sum(item.duration_ms for item in metadata),
            external_requests=sum(item.external_requests for item in metadata),
            quota_limit=max(limits) if limits else None,
            quota_remaining=min(quota_values) if quota_values else None,
            page=max((item.page or 1) for item in metadata),
            total_pages=max((item.total_pages or 1) for item in metadata),
            from_cache=all(item.from_cache for item in metadata),
        )

    async def close(self) -> None:
        await self._client.close()
