from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain.ingestion import WorkerName
from app.domain.sports import (
    Coverage,
    Fixture,
    FixtureInjury,
    FixtureStatus,
    League,
    Person,
    ProviderPrediction,
    ProviderRef,
    ProviderRequestMetadata,
    ProviderResponse,
    Season,
    StandingEntry,
    StandingsTable,
    Team,
    TeamLineup,
    TeamSeasonStatistics,
    TeamSummary,
)
from app.providers.sports.mock import ControlledMockSportsDataProvider, MockSportsDataset
from app.services.ingestion.prematch import PrematchIngestionPolicy, PrematchIngestionService

NOW = datetime(2026, 8, 25, 12, tzinfo=UTC)


def ref(external_id: str) -> ProviderRef:
    return ProviderRef(provider="mock", external_id=external_id)


class FixedClock:
    def __init__(self, value: datetime = NOW) -> None:
        self.value = value

    def now(self) -> datetime:
        return self.value


class RecordingProvider(ControlledMockSportsDataProvider):
    def __init__(
        self,
        dataset: MockSportsDataset,
        *,
        quota_remaining: int | None = 100,
        failed_league_ids: frozenset[str] = frozenset(),
    ) -> None:
        super().__init__(dataset)
        self.calls: list[str] = []
        self.quota_remaining = quota_remaining
        self.failed_league_ids = failed_league_ids

    def _response[T](self, operation: str, items: tuple[T, ...]) -> ProviderResponse[T]:
        self.calls.append(operation)
        response = super()._response(operation, items)
        return response.model_copy(
            update={
                "metadata": ProviderRequestMetadata(
                    provider=self.name,
                    operation=operation,
                    requested_at=NOW,
                    duration_ms=1,
                    external_requests=1,
                    quota_limit=1000,
                    quota_remaining=self.quota_remaining,
                )
            }
        )

    async def list_leagues(self, query):  # type: ignore[no-untyped-def]
        if query.external_id in self.failed_league_ids:
            self.calls.append("list_leagues_failed")
            raise RuntimeError("sensitive upstream response must not be reported")
        return await super().list_leagues(query)

    async def get_odds(self, query):  # type: ignore[no-untyped-def]
        raise AssertionError("Prematch ingestion must not call the odds provider operation")


class FakePrematchRepository:
    def __init__(self, *, fail_operation: str | None = None) -> None:
        self.calls: list[tuple[str, object]] = []
        self.fail_operation = fail_operation

    def _write(self, operation: str, payload: object, count: int) -> int:
        self.calls.append((operation, payload))
        if operation == self.fail_operation:
            raise RuntimeError("database details must not be reported")
        return count

    async def upsert_league(self, league: League, current_season: Season) -> int:
        return self._write("league", (league, current_season), 1)

    async def upsert_teams(
        self,
        league: League,
        current_season: Season,
        teams: tuple[Team, ...],
    ) -> int:
        return self._write("teams", (league, current_season, teams), len(teams))

    async def upsert_fixtures(self, fixtures: tuple[Fixture, ...]) -> int:
        return self._write("fixtures", fixtures, len(fixtures))

    async def store_standings(self, tables: tuple[StandingsTable, ...]) -> int:
        return self._write("standings", tables, len(tables))

    async def store_team_statistics(
        self,
        statistics: tuple[TeamSeasonStatistics, ...],
    ) -> int:
        return self._write("team_statistics", statistics, len(statistics))

    async def store_head_to_head(
        self,
        target_fixture: Fixture,
        meetings: tuple[Fixture, ...],
    ) -> int:
        return self._write("head_to_head", (target_fixture, meetings), len(meetings))

    async def store_lineups(self, lineups: tuple[TeamLineup, ...]) -> int:
        return self._write("lineups", lineups, len(lineups))

    async def store_injuries(self, injuries: tuple[FixtureInjury, ...]) -> int:
        return self._write("injuries", injuries, len(injuries))

    async def store_supplementary_predictions(
        self,
        predictions: tuple[ProviderPrediction, ...],
    ) -> int:
        assert all(item.supplementary_only for item in predictions)
        return self._write("supplementary_predictions", predictions, len(predictions))


def make_league(
    external_id: str = "league-1",
    *,
    coverage: Coverage | None = None,
    current: bool = True,
) -> League:
    return League(
        ref=ref(external_id),
        name=f"League {external_id}",
        seasons=(
            Season(
                year=2026,
                is_current=current,
                coverage=coverage or Coverage(),
            ),
        ),
    )


def make_team(external_id: str, name: str) -> Team:
    return Team(ref=ref(external_id), name=name)


def make_fixture(
    external_id: str,
    *,
    kickoff_at: datetime,
    status: FixtureStatus = FixtureStatus.SCHEDULED,
    league_external_id: str = "league-1",
    season: int = 2026,
) -> Fixture:
    return Fixture(
        ref=ref(external_id),
        league_ref=ref(league_external_id),
        season=season,
        kickoff_at=kickoff_at,
        status=status,
        home_team=TeamSummary(ref=ref("team-1"), name="Home"),
        away_team=TeamSummary(ref=ref("team-2"), name="Away"),
    )


def full_dataset(*, kickoff_at: datetime = NOW + timedelta(hours=1)) -> MockSportsDataset:
    coverage = Coverage(
        fixture_statistics=True,
        injuries=True,
        lineups=True,
        standings=True,
        predictions=True,
    )
    league = make_league(coverage=coverage)
    teams = (make_team("team-1", "Home"), make_team("team-2", "Away"))
    upcoming = make_fixture("fixture-upcoming", kickoff_at=kickoff_at)
    historical = make_fixture(
        "fixture-history",
        kickoff_at=NOW - timedelta(days=30),
        status=FixtureStatus.FINISHED,
    )
    table = StandingsTable(
        league_ref=league.ref,
        season=2026,
        captured_at=NOW,
        entries=tuple(
            StandingEntry(
                rank=index,
                team=TeamSummary(ref=team.ref, name=team.name),
                points=10 - index,
                played=4,
                wins=3,
                draws=0,
                losses=1,
                goals_for=8,
                goals_against=4,
                goal_difference=4,
            )
            for index, team in enumerate(teams, start=1)
        ),
    )
    statistics = tuple(
        TeamSeasonStatistics(
            league_ref=league.ref,
            team_ref=team.ref,
            season=2026,
            captured_at=NOW,
            metrics={"fixtures.played.total": 4},
        )
        for team in teams
    )
    lineups = tuple(
        TeamLineup(
            fixture_ref=upcoming.ref,
            team=TeamSummary(ref=team.ref, name=team.name),
            formation="4-3-3",
            confirmed_at=NOW,
        )
        for team in teams
    )
    prediction = ProviderPrediction(
        fixture_ref=upcoming.ref,
        home_win_probability=0.5,
        draw_probability=0.3,
        away_win_probability=0.2,
        generated_at=NOW,
        supplementary_only=True,
    )
    injury = FixtureInjury(
        fixture_ref=upcoming.ref,
        team_ref=teams[0].ref,
        player=Person(ref=ref("player-9"), name="Forward"),
        injury_type="Missing Fixture",
        reason="Hamstring",
        captured_at=NOW,
    )
    return MockSportsDataset(
        leagues=(league,),
        teams=teams,
        fixtures=(historical, upcoming),
        standings=(table,),
        lineups=lineups,
        injuries=(injury,),
        predictions=(prediction,),
        team_season_statistics=statistics,
        team_memberships={"league-1:2026": ("team-1", "team-2")},
    )


@pytest.mark.anyio
async def test_empty_league_configuration_is_a_zero_call_safe_noop() -> None:
    provider = RecordingProvider(full_dataset())
    repository = FakePrematchRepository()
    service = PrematchIngestionService(provider, repository, clock=FixedClock())

    report = await service.run_once(PrematchIngestionPolicy(league_external_ids=()))

    assert report.worker == WorkerName.PREMATCH
    assert report.skipped_reason == "no_league_ids_configured"
    assert report.provider_requests == 0
    assert provider.calls == []
    assert repository.calls == []


@pytest.mark.anyio
async def test_complete_flow_persists_normalized_inputs_without_fetching_odds() -> None:
    provider = RecordingProvider(full_dataset())
    repository = FakePrematchRepository()
    service = PrematchIngestionService(provider, repository, clock=FixedClock())

    report = await service.run_once(
        PrematchIngestionPolicy(league_external_ids=(" league-1 ",), quota_reserve=10)
    )

    assert report.errors == ()
    assert report.fixtures_seen == 2
    assert report.fixtures_written == 2
    assert report.records_written == 13
    assert report.provider_requests == 10
    assert provider.calls == [
        "list_leagues",
        "list_teams",
        "list_fixtures",
        "get_standings",
        "get_team_season_statistics",
        "get_team_season_statistics",
        "get_head_to_head",
        "get_fixture_injuries",
        "get_fixture_lineups",
        "get_prediction",
    ]
    assert [operation for operation, _ in repository.calls] == [
        "league",
        "teams",
        "fixtures",
        "standings",
        "team_statistics",
        "team_statistics",
        "head_to_head",
        "injuries",
        "lineups",
        "supplementary_predictions",
    ]


@pytest.mark.anyio
async def test_coverage_flags_prevent_unavailable_enrichment_calls() -> None:
    dataset = full_dataset()
    dataset = dataset.model_copy(update={"leagues": (make_league(coverage=Coverage()),)})
    provider = RecordingProvider(dataset)
    repository = FakePrematchRepository()

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(PrematchIngestionPolicy(league_external_ids=("league-1",)))

    assert report.errors == ()
    assert provider.calls == ["list_leagues", "list_teams", "list_fixtures", "get_head_to_head"]
    assert "standings" not in {operation for operation, _ in repository.calls}
    assert "team_statistics" not in {operation for operation, _ in repository.calls}
    assert "lineups" not in {operation for operation, _ in repository.calls}
    assert "injuries" not in {operation for operation, _ in repository.calls}
    assert "supplementary_predictions" not in {operation for operation, _ in repository.calls}


@pytest.mark.anyio
async def test_time_windows_bound_lineups_and_predictions_but_allow_h2h() -> None:
    provider = RecordingProvider(full_dataset(kickoff_at=NOW + timedelta(days=5)))
    repository = FakePrematchRepository()

    await PrematchIngestionService(provider, repository, clock=FixedClock()).run_once(
        PrematchIngestionPolicy(league_external_ids=("league-1",))
    )

    assert "get_head_to_head" in provider.calls
    assert "get_fixture_lineups" not in provider.calls
    assert "get_prediction" not in provider.calls


@pytest.mark.anyio
async def test_quota_reserve_stops_only_optional_calls() -> None:
    provider = RecordingProvider(full_dataset(), quota_remaining=10)
    repository = FakePrematchRepository()

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(
        PrematchIngestionPolicy(
            league_external_ids=("league-1",),
            quota_reserve=10,
        )
    )

    assert provider.calls == ["list_leagues", "list_teams", "list_fixtures"]
    assert report.fixtures_written == 2
    assert report.skipped_reason == "quota_reserve_reached"
    assert report.provider_requests == 3


@pytest.mark.anyio
async def test_missing_current_league_is_reported_without_child_calls() -> None:
    provider = RecordingProvider(
        MockSportsDataset(leagues=(make_league(current=False),)),
    )
    repository = FakePrematchRepository()

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(PrematchIngestionPolicy(league_external_ids=("league-1",)))

    assert report.errors == ("list_leagues:league-1:LookupError",)
    assert provider.calls == ["list_leagues"]
    assert repository.calls == []


@pytest.mark.anyio
async def test_explicit_season_override_ingests_non_current_backfill() -> None:
    league = League(
        ref=ref("league-1"),
        name="Historical League",
        seasons=(Season(year=2024, is_current=False), Season(year=2026, is_current=True)),
    )
    historical = make_fixture(
        "fixture-2024",
        kickoff_at=datetime(2024, 8, 25, 12, tzinfo=UTC),
        status=FixtureStatus.FINISHED,
        season=2024,
    )
    provider = RecordingProvider(MockSportsDataset(leagues=(league,), fixtures=(historical,)))
    repository = FakePrematchRepository()

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(
        PrematchIngestionPolicy(
            league_external_ids=("league-1",),
            season_override=2024,
        )
    )

    assert report.errors == ()
    assert report.fixtures_written == 1
    stored_league, stored_season = repository.calls[0][1]
    assert stored_league == league
    assert stored_season.year == 2024


@pytest.mark.anyio
async def test_one_league_failure_does_not_stop_the_next_league() -> None:
    second_league = make_league("league-2")
    provider = RecordingProvider(
        MockSportsDataset(leagues=(second_league,)),
        failed_league_ids=frozenset({"league-1"}),
    )
    repository = FakePrematchRepository()

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(PrematchIngestionPolicy(league_external_ids=("league-1", "league-2")))

    assert report.errors == ("list_leagues:league-1:RuntimeError",)
    assert any(operation == "league" for operation, _ in repository.calls)
    assert "sensitive upstream response" not in " ".join(report.errors)


@pytest.mark.anyio
async def test_repository_errors_are_safe_and_prevent_orphan_child_writes() -> None:
    provider = RecordingProvider(full_dataset())
    repository = FakePrematchRepository(fail_operation="league")

    report = await PrematchIngestionService(
        provider,
        repository,
        clock=FixedClock(),
    ).run_once(PrematchIngestionPolicy(league_external_ids=("league-1",)))

    assert report.errors == ("upsert_league:league-1:2026:RuntimeError",)
    assert provider.calls == ["list_leagues"]
    assert [operation for operation, _ in repository.calls] == ["league"]
    assert "database details" not in " ".join(report.errors)


@pytest.mark.parametrize(
    "policy",
    [
        PrematchIngestionPolicy(league_external_ids=("league-1",)),
        PrematchIngestionPolicy(league_external_ids=()),
    ],
)
def test_policy_keeps_normalized_unique_league_ids(policy: PrematchIngestionPolicy) -> None:
    assert all(value == value.strip() for value in policy.league_external_ids)


def test_policy_rejects_duplicates_and_invalid_bounds() -> None:
    with pytest.raises(ValueError, match="unique"):
        PrematchIngestionPolicy(league_external_ids=("1", "1"))
    with pytest.raises(ValueError, match="h2h_last"):
        PrematchIngestionPolicy(league_external_ids=("1",), h2h_last=0)
    with pytest.raises(ValueError, match="non-negative"):
        PrematchIngestionPolicy(league_external_ids=("1",), quota_reserve=-1)


@pytest.mark.anyio
async def test_naive_injected_clock_is_rejected_before_time_window_decisions() -> None:
    provider = RecordingProvider(full_dataset())
    repository = FakePrematchRepository()
    naive_clock = FixedClock(datetime(2026, 8, 25, 12))

    with pytest.raises(ValueError, match="timezone-aware"):
        await PrematchIngestionService(
            provider,
            repository,
            clock=naive_clock,
        ).run_once(PrematchIngestionPolicy(league_external_ids=("league-1",)))
