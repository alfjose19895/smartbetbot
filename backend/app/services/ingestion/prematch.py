from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.sports import (
    Fixture,
    FixtureInjury,
    FixtureQuery,
    FixtureStatus,
    League,
    LeagueQuery,
    ProviderCapability,
    ProviderPrediction,
    ProviderResponse,
    Season,
    StandingsTable,
    Team,
    TeamLineup,
    TeamQuery,
    TeamSeasonStatistics,
)
from app.providers.sports.base import SportsDataProvider


class PrematchClock(Protocol):
    def now(self) -> datetime: ...


class SystemPrematchClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class PrematchIngestionRepository(Protocol):
    """Persistence port; every call owns its own short database transaction."""

    async def upsert_league(self, league: League, current_season: Season) -> int: ...

    async def upsert_teams(
        self,
        league: League,
        current_season: Season,
        teams: tuple[Team, ...],
    ) -> int: ...

    async def upsert_fixtures(self, fixtures: tuple[Fixture, ...]) -> int: ...

    async def store_standings(self, tables: tuple[StandingsTable, ...]) -> int: ...

    async def store_team_statistics(
        self,
        statistics: tuple[TeamSeasonStatistics, ...],
    ) -> int: ...

    async def store_head_to_head(
        self,
        target_fixture: Fixture,
        meetings: tuple[Fixture, ...],
    ) -> int: ...

    async def store_lineups(self, lineups: tuple[TeamLineup, ...]) -> int: ...

    async def store_injuries(self, injuries: tuple[FixtureInjury, ...]) -> int: ...

    async def store_supplementary_predictions(
        self,
        predictions: tuple[ProviderPrediction, ...],
    ) -> int: ...


@dataclass(frozen=True, slots=True)
class PrematchIngestionPolicy:
    league_external_ids: tuple[str, ...]
    season_override: int | None = None
    quota_reserve: int = 10
    context_lookahead_days: int = 14
    lineup_window_minutes: int = 120
    lineup_grace_minutes: int = 15
    prediction_window_hours: int = 72
    h2h_window_days: int = 14
    h2h_last: int = 10
    max_enriched_fixtures_per_season: int = 20

    def __post_init__(self) -> None:
        normalized_ids = tuple(value.strip() for value in self.league_external_ids)
        if any(not value for value in normalized_ids):
            raise ValueError("league_external_ids cannot contain empty values")
        if len(set(normalized_ids)) != len(normalized_ids):
            raise ValueError("league_external_ids must be unique")
        if self.quota_reserve < 0:
            raise ValueError("quota_reserve must be non-negative")
        if self.context_lookahead_days < 0:
            raise ValueError("context_lookahead_days must be non-negative")
        if self.lineup_window_minutes < 0 or self.lineup_grace_minutes < 0:
            raise ValueError("lineup windows must be non-negative")
        if self.prediction_window_hours < 0 or self.h2h_window_days < 0:
            raise ValueError("enrichment windows must be non-negative")
        if not 1 <= self.h2h_last <= 100:
            raise ValueError("h2h_last must be between 1 and 100")
        if self.max_enriched_fixtures_per_season < 0:
            raise ValueError("max_enriched_fixtures_per_season must be non-negative")
        if self.season_override is not None and not 1900 <= self.season_override <= 2200:
            raise ValueError("season_override must be between 1900 and 2200")
        object.__setattr__(self, "league_external_ids", normalized_ids)


@dataclass(slots=True)
class _RunState:
    fixtures_seen: int = 0
    fixtures_written: int = 0
    records_written: int = 0
    provider_requests: int = 0
    quota_remaining: int | None = None
    quota_skipped: bool = False
    errors: list[str] = field(default_factory=list)

    def observe(self, response: ProviderResponse[object]) -> None:
        self.provider_requests += response.metadata.external_requests
        remaining = response.metadata.quota_remaining
        if remaining is not None:
            self.quota_remaining = (
                remaining if self.quota_remaining is None else min(self.quota_remaining, remaining)
            )

    def optional_call_allowed(self, reserve: int) -> bool:
        allowed = self.quota_remaining is None or self.quota_remaining > reserve
        if not allowed:
            self.quota_skipped = True
        return allowed

    def add_error(self, operation: str, identifier: str, error: Exception) -> None:
        # Error messages intentionally exclude upstream payloads and exception text.
        self.errors.append(f"{operation}:{identifier}:{type(error).__name__}")


class PrematchIngestionService:
    """Synchronize current league seasons and bounded prematch context.

    Provider calls finish before the repository call that stores their normalized result. The
    repository therefore never has to keep a database transaction open while waiting on HTTP.
    """

    def __init__(
        self,
        provider: SportsDataProvider,
        repository: PrematchIngestionRepository,
        *,
        clock: PrematchClock | None = None,
    ) -> None:
        self._provider = provider
        self._repository = repository
        self._clock = clock or SystemPrematchClock()

    async def run_once(self, policy: PrematchIngestionPolicy) -> IngestionReport:
        if not policy.league_external_ids:
            return IngestionReport(
                worker=WorkerName.PREMATCH,
                skipped_reason="no_league_ids_configured",
            )

        state = _RunState()
        if ProviderCapability.LEAGUES not in self._provider.capabilities:
            return self._report(
                state,
                skipped_reason="provider_missing_leagues_capability",
            )

        for league_external_id in policy.league_external_ids:
            await self._ingest_league(league_external_id, policy, state)

        return self._report(
            state,
            skipped_reason="quota_reserve_reached" if state.quota_skipped else None,
        )

    async def _ingest_league(
        self,
        league_external_id: str,
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        try:
            response = await self._provider.list_leagues(
                LeagueQuery(
                    external_id=league_external_id,
                    season=policy.season_override,
                    current_only=policy.season_override is None,
                )
            )
            state.observe(response)
        except Exception as error:
            state.add_error("list_leagues", league_external_id, error)
            return

        leagues = tuple(
            league for league in response.items if league.ref.external_id == league_external_id
        )
        if not leagues:
            state.add_error("list_leagues", league_external_id, LookupError())
            return

        for league in leagues:
            target_seasons = tuple(
                season
                for season in league.seasons
                if (
                    season.year == policy.season_override
                    if policy.season_override is not None
                    else season.is_current
                )
            )
            if not target_seasons:
                operation = (
                    "target_season" if policy.season_override is not None else "current_season"
                )
                state.add_error(operation, league_external_id, LookupError())
                continue
            # The database contract permits one current season for a league. In the event of an
            # inconsistent provider payload, prefer the newest current season deterministically.
            target_season = max(target_seasons, key=lambda season: season.year)
            await self._ingest_season(league, target_season, policy, state)

    async def _ingest_season(
        self,
        league: League,
        current_season: Season,
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        scope = f"{league.ref.external_id}:{current_season.year}"
        try:
            state.records_written += max(
                0,
                await self._repository.upsert_league(league, current_season),
            )
        except Exception as error:
            state.add_error("upsert_league", scope, error)
            return

        teams = await self._fetch_and_store_teams(league, current_season, state)
        fixtures = await self._fetch_and_store_fixtures(league, current_season, state)

        await self._ingest_standings(league, current_season, policy, state)

        upcoming = self._upcoming_context_fixtures(fixtures, policy)
        candidate_teams = self._candidate_teams(upcoming, teams)
        await self._ingest_team_statistics(
            league,
            current_season,
            candidate_teams,
            policy,
            state,
        )
        for fixture in upcoming:
            await self._ingest_fixture_context(
                fixture,
                current_season,
                policy,
                state,
            )

    async def _fetch_and_store_teams(
        self,
        league: League,
        current_season: Season,
        state: _RunState,
    ) -> tuple[Team, ...]:
        if ProviderCapability.TEAMS not in self._provider.capabilities:
            return ()
        scope = f"{league.ref.external_id}:{current_season.year}"
        try:
            response = await self._provider.list_teams(
                TeamQuery(
                    league_external_id=league.ref.external_id,
                    season=current_season.year,
                )
            )
            state.observe(response)
            teams = response.items
            state.records_written += max(
                0,
                await self._repository.upsert_teams(league, current_season, teams),
            )
            return teams
        except Exception as error:
            state.add_error("teams", scope, error)
            return ()

    async def _fetch_and_store_fixtures(
        self,
        league: League,
        current_season: Season,
        state: _RunState,
    ) -> tuple[Fixture, ...]:
        if ProviderCapability.FIXTURES not in self._provider.capabilities:
            return ()
        scope = f"{league.ref.external_id}:{current_season.year}"
        try:
            response = await self._provider.list_fixtures(
                FixtureQuery(
                    league_external_id=league.ref.external_id,
                    season=current_season.year,
                )
            )
            state.observe(response)
            fixtures = response.items
            state.fixtures_seen += len(fixtures)
            written = max(0, await self._repository.upsert_fixtures(fixtures))
            state.fixtures_written += written
            state.records_written += written
            return fixtures
        except Exception as error:
            state.add_error("fixtures", scope, error)
            return ()

    async def _ingest_standings(
        self,
        league: League,
        current_season: Season,
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        if (
            not current_season.coverage.standings
            or ProviderCapability.STANDINGS not in self._provider.capabilities
            or not state.optional_call_allowed(policy.quota_reserve)
        ):
            return
        scope = f"{league.ref.external_id}:{current_season.year}"
        try:
            response = await self._provider.get_standings(
                league.ref,
                current_season.year,
            )
            state.observe(response)
            state.records_written += max(
                0,
                await self._repository.store_standings(response.items),
            )
        except Exception as error:
            state.add_error("standings", scope, error)

    async def _ingest_team_statistics(
        self,
        league: League,
        current_season: Season,
        teams: tuple[Team, ...],
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        if (
            not current_season.coverage.fixture_statistics
            or ProviderCapability.TEAM_SEASON_STATISTICS not in self._provider.capabilities
        ):
            return
        for team in teams:
            if not state.optional_call_allowed(policy.quota_reserve):
                return
            scope = f"{league.ref.external_id}:{current_season.year}:{team.ref.external_id}"
            try:
                response = await self._provider.get_team_season_statistics(
                    league.ref,
                    team.ref,
                    current_season.year,
                )
                state.observe(response)
                state.records_written += max(
                    0,
                    await self._repository.store_team_statistics(response.items),
                )
            except Exception as error:
                state.add_error("team_statistics", scope, error)

    async def _ingest_fixture_context(
        self,
        fixture: Fixture,
        current_season: Season,
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        now = self._now()
        until_kickoff = fixture.kickoff_at - now

        if (
            ProviderCapability.HISTORICAL_FIXTURES in self._provider.capabilities
            and until_kickoff >= timedelta(0)
            and until_kickoff <= timedelta(days=policy.h2h_window_days)
            and state.optional_call_allowed(policy.quota_reserve)
        ):
            await self._ingest_h2h(fixture, policy, state)

        if (
            current_season.coverage.injuries
            and ProviderCapability.INJURIES in self._provider.capabilities
            and until_kickoff >= timedelta(0)
            and until_kickoff <= timedelta(days=policy.context_lookahead_days)
            and state.optional_call_allowed(policy.quota_reserve)
        ):
            await self._ingest_injuries(fixture, state)

        if (
            current_season.coverage.lineups
            and ProviderCapability.LINEUPS in self._provider.capabilities
            and until_kickoff >= timedelta(minutes=-policy.lineup_grace_minutes)
            and until_kickoff <= timedelta(minutes=policy.lineup_window_minutes)
            and state.optional_call_allowed(policy.quota_reserve)
        ):
            await self._ingest_lineups(fixture, state)

        if (
            current_season.coverage.predictions
            and ProviderCapability.PREDICTIONS in self._provider.capabilities
            and until_kickoff >= timedelta(0)
            and until_kickoff <= timedelta(hours=policy.prediction_window_hours)
            and state.optional_call_allowed(policy.quota_reserve)
        ):
            await self._ingest_supplementary_prediction(fixture, state)

    async def _ingest_h2h(
        self,
        fixture: Fixture,
        policy: PrematchIngestionPolicy,
        state: _RunState,
    ) -> None:
        try:
            response = await self._provider.get_head_to_head(
                fixture.home_team.ref,
                fixture.away_team.ref,
                last=policy.h2h_last,
            )
            state.observe(response)
            state.records_written += max(
                0,
                await self._repository.store_head_to_head(fixture, response.items),
            )
        except Exception as error:
            state.add_error("head_to_head", fixture.ref.external_id, error)

    async def _ingest_lineups(self, fixture: Fixture, state: _RunState) -> None:
        try:
            response = await self._provider.get_fixture_lineups(fixture.ref)
            state.observe(response)
            state.records_written += max(
                0,
                await self._repository.store_lineups(response.items),
            )
        except Exception as error:
            state.add_error("lineups", fixture.ref.external_id, error)

    async def _ingest_injuries(self, fixture: Fixture, state: _RunState) -> None:
        try:
            response = await self._provider.get_fixture_injuries(fixture.ref)
            state.observe(response)
            state.records_written += max(
                0,
                await self._repository.store_injuries(response.items),
            )
        except Exception as error:
            state.add_error("injuries", fixture.ref.external_id, error)

    async def _ingest_supplementary_prediction(
        self,
        fixture: Fixture,
        state: _RunState,
    ) -> None:
        try:
            response = await self._provider.get_prediction(fixture.ref)
            state.observe(response)
            # This port must never write these values into the model-versioned predictions table.
            state.records_written += max(
                0,
                await self._repository.store_supplementary_predictions(response.items),
            )
        except Exception as error:
            state.add_error("supplementary_prediction", fixture.ref.external_id, error)

    def _upcoming_context_fixtures(
        self,
        fixtures: tuple[Fixture, ...],
        policy: PrematchIngestionPolicy,
    ) -> tuple[Fixture, ...]:
        now = self._now()
        horizon = now + timedelta(days=policy.context_lookahead_days)
        candidates = sorted(
            (
                fixture
                for fixture in fixtures
                if fixture.status == FixtureStatus.SCHEDULED
                and fixture.kickoff_at >= now - timedelta(minutes=policy.lineup_grace_minutes)
                and fixture.kickoff_at <= horizon
            ),
            key=lambda fixture: (fixture.kickoff_at, fixture.ref.external_id),
        )
        return tuple(candidates[: policy.max_enriched_fixtures_per_season])

    @staticmethod
    def _candidate_teams(
        fixtures: tuple[Fixture, ...],
        teams: tuple[Team, ...],
    ) -> tuple[Team, ...]:
        required_refs = {
            team_ref
            for fixture in fixtures
            for team_ref in (fixture.home_team.ref, fixture.away_team.ref)
        }
        return tuple(team for team in teams if team.ref in required_refs)

    def _now(self) -> datetime:
        value = self._clock.now()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Prematch clock must return a timezone-aware datetime")
        return value

    @staticmethod
    def _report(
        state: _RunState,
        *,
        skipped_reason: str | None,
    ) -> IngestionReport:
        return IngestionReport(
            worker=WorkerName.PREMATCH,
            fixtures_seen=state.fixtures_seen,
            fixtures_written=state.fixtures_written,
            records_written=state.records_written,
            provider_requests=state.provider_requests,
            skipped_reason=skipped_reason,
            errors=tuple(state.errors),
        )
