from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import pytest

from app.domain.ingestion import StoredFixture, WorkerName
from app.domain.sports import (
    Fixture,
    FixtureEvent,
    FixtureEventType,
    FixtureScore,
    FixtureStatistics,
    FixtureStatus,
    LiveFixtureQuery,
    ProviderRef,
    ProviderResponse,
    TeamSummary,
)
from app.providers.sports.mock import ControlledMockSportsDataProvider, MockSportsDataset
from app.services.ingestion.live import (
    LiveIngestionScheduler,
    LiveIngestionService,
    LiveIngestionSettings,
)

NOW = datetime(2026, 8, 25, 12, 0, 7, tzinfo=UTC)
FIXTURE_UUID = UUID("10000000-0000-4000-8000-000000000001")


def ref(external_id: str) -> ProviderRef:
    return ProviderRef(provider="mock", external_id=external_id)


def fixture(
    *,
    external_id: str = "100",
    status: FixtureStatus = FixtureStatus.LIVE,
    minute: int | None = 32,
) -> Fixture:
    return Fixture(
        ref=ref(external_id),
        league_ref=ref("39"),
        season=2026,
        kickoff_at=NOW - timedelta(minutes=32),
        status=status,
        provider_status=status.value,
        home_team=TeamSummary(ref=ref("10"), name="Home"),
        away_team=TeamSummary(ref=ref("20"), name="Away"),
        score=FixtureScore(home=1, away=0),
        match_minute=minute,
        last_updated_at=NOW,
    )


def stored_fixture(*, status: str = "scheduled") -> StoredFixture:
    return StoredFixture(
        id=FIXTURE_UUID,
        provider="mock",
        provider_id="100",
        league_provider_id="39",
        home_team_provider_id="10",
        away_team_provider_id="20",
        season=2026,
        kickoff_at=NOW - timedelta(minutes=32),
        status=status,
        match_minute=32 if status != "scheduled" else None,
    )


def event() -> FixtureEvent:
    return FixtureEvent(
        fixture_ref=ref("100"),
        event_type=FixtureEventType.GOAL,
        detail="Normal Goal",
        team_ref=ref("10"),
        match_minute=31,
    )


def statistics() -> FixtureStatistics:
    return FixtureStatistics(
        fixture_ref=ref("100"),
        team_ref=ref("10"),
        captured_at=NOW,
        shots=7,
        shots_on_target=3,
        possession=54.2,
    )


class FakeClock:
    def __init__(self, value: datetime = NOW) -> None:
        self.value = value
        self.sleeps: list[float] = []

    def now(self) -> datetime:
        return self.value

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.value += timedelta(seconds=seconds)

    def advance(self, seconds: int) -> None:
        self.value += timedelta(seconds=seconds)


class FakeLocks:
    def __init__(self, denied: set[str] | None = None) -> None:
        self.denied = denied or set()
        self.keys: list[tuple[str, int]] = []

    @asynccontextmanager
    async def hold(self, key: str, *, ttl_seconds: int):
        self.keys.append((key, ttl_seconds))
        yield key not in self.denied

    async def close(self) -> None:
        return None


class FakeLiveRepository:
    def __init__(self, candidates: tuple[StoredFixture, ...]) -> None:
        self.candidates = candidates
        self.candidate_queries: list[dict[str, Any]] = []
        self.fixtures: list[Fixture] = []
        self.events: list[tuple[StoredFixture, tuple[FixtureEvent, ...], datetime]] = []
        self.statistics: list[tuple[StoredFixture, tuple[FixtureStatistics, ...], datetime]] = []

    async def list_live_candidates(
        self,
        *,
        provider: str,
        now: datetime,
        lookback_seconds: int,
        lookahead_seconds: int,
    ) -> tuple[StoredFixture, ...]:
        self.candidate_queries.append(
            {
                "provider": provider,
                "now": now,
                "lookback_seconds": lookback_seconds,
                "lookahead_seconds": lookahead_seconds,
            }
        )
        return self.candidates

    async def persist_live_fixture(
        self,
        value: Fixture,
        *,
        observed_at: datetime,
    ) -> StoredFixture:
        self.fixtures.append(value)
        existing = next(
            (item for item in self.candidates if item.provider_id == value.ref.external_id),
            stored_fixture(),
        )
        updated = existing.model_copy(
            update={"status": value.status.value, "match_minute": value.match_minute}
        )
        self.candidates = tuple(
            updated if item.provider_id == updated.provider_id else item for item in self.candidates
        )
        return updated

    async def persist_fixture_events(
        self,
        stored: StoredFixture,
        values: tuple[FixtureEvent, ...],
        *,
        observed_at: datetime,
    ) -> int:
        self.events.append((stored, values, observed_at))
        return len(values)

    async def persist_fixture_statistics(
        self,
        stored: StoredFixture,
        values: tuple[FixtureStatistics, ...],
        *,
        captured_at: datetime,
    ) -> int:
        self.statistics.append((stored, values, captured_at))
        return len(values)


class TrackingProvider(ControlledMockSportsDataProvider):
    def __init__(self, dataset: MockSportsDataset) -> None:
        super().__init__(dataset)
        self.live_queries: list[LiveFixtureQuery] = []
        self.fixture_queries: list[tuple[str, ...]] = []
        self.event_calls = 0
        self.stats_calls = 0
        self.event_error: Exception | None = None

    @staticmethod
    def _external_request[T](response: ProviderResponse[T]) -> ProviderResponse[T]:
        return response.model_copy(
            update={"metadata": response.metadata.model_copy(update={"external_requests": 1})}
        )

    async def list_live_fixtures(self, query: LiveFixtureQuery):
        self.live_queries.append(query)
        return self._external_request(await super().list_live_fixtures(query))

    async def list_fixtures(self, query):
        self.fixture_queries.append(query.fixture_external_ids)
        return self._external_request(await super().list_fixtures(query))

    async def get_fixture_events(self, fixture_ref: ProviderRef):
        self.event_calls += 1
        if self.event_error is not None:
            raise self.event_error
        return self._external_request(await super().get_fixture_events(fixture_ref))

    async def get_fixture_statistics(self, fixture_ref: ProviderRef):
        self.stats_calls += 1
        return self._external_request(await super().get_fixture_statistics(fixture_ref))


def provider_with(*fixtures: Fixture) -> TrackingProvider:
    return TrackingProvider(
        MockSportsDataset(
            fixtures=fixtures,
            events=(event(),),
            statistics=(statistics(),),
        )
    )


def service(
    provider: TrackingProvider,
    repository: FakeLiveRepository,
    *,
    clock: FakeClock | None = None,
    locks: FakeLocks | None = None,
    hook: object | None = None,
) -> LiveIngestionService:
    return LiveIngestionService(
        provider=provider,
        repository=repository,
        locks=locks or FakeLocks(),
        clock=clock or FakeClock(),
        settings=LiveIngestionSettings(),
        hook=hook,  # type: ignore[arg-type]
    )


@pytest.mark.anyio
async def test_zero_candidates_makes_no_provider_calls() -> None:
    provider = provider_with(fixture())
    repository = FakeLiveRepository(())
    locks = FakeLocks()

    report = await service(provider, repository, locks=locks).run_cycle()

    assert report.worker == WorkerName.LIVE
    assert report.skipped_reason == "no_candidates"
    assert report.provider_requests == 0
    assert provider.live_queries == []
    assert locks.keys == []


@pytest.mark.anyio
async def test_discovers_by_candidate_league_and_persists_live_data() -> None:
    live = fixture()
    provider = provider_with(live)
    repository = FakeLiveRepository((stored_fixture(),))
    locks = FakeLocks()
    clock = FakeClock()

    report = await service(provider, repository, clock=clock, locks=locks).run_cycle()

    assert provider.live_queries[0].league_external_ids == ("39",)
    assert provider.fixture_queries == []
    assert report.fixtures_seen == 1
    assert report.fixtures_written == 1
    assert report.records_written == 2
    assert report.provider_requests == 3
    assert repository.fixtures == [live]
    assert repository.events[0][1] == (event(),)
    captured_stats = repository.statistics[0]
    assert captured_stats[2] == datetime(2026, 8, 25, 12, 0, tzinfo=UTC)
    assert captured_stats[1][0].captured_at == captured_stats[2]
    assert captured_stats[1][0].match_minute == 32
    assert locks.keys == [
        ("worker:lock:live:mock:discovery", 120),
        ("worker:lock:live:mock:100", 120),
    ]


@pytest.mark.anyio
async def test_live_hook_receives_persisted_fixture_context() -> None:
    calls: list[tuple[StoredFixture, Fixture, int, int]] = []

    class Hook:
        async def on_fixture_update(
            self,
            stored: StoredFixture,
            observation: Fixture,
            *,
            events_written: int,
            statistics_written: int,
        ) -> None:
            calls.append((stored, observation, events_written, statistics_written))

    live = fixture()
    repository = FakeLiveRepository((stored_fixture(),))

    report = await service(provider_with(live), repository, hook=Hook()).run_cycle()

    assert report.errors == ()
    assert calls[0][0].id == FIXTURE_UUID
    assert calls[0][1] == live
    assert calls[0][2:] == (1, 1)


@pytest.mark.anyio
async def test_event_and_statistics_polling_have_independent_clocks() -> None:
    provider = provider_with(fixture())
    repository = FakeLiveRepository((stored_fixture(status="live"),))
    clock = FakeClock()
    ingestion = service(provider, repository, clock=clock)

    await ingestion.run_cycle()
    clock.advance(15)
    await ingestion.run_cycle()
    clock.advance(45)
    await ingestion.run_cycle()

    assert len(provider.live_queries) == 3
    assert provider.event_calls == 3
    assert provider.stats_calls == 2
    assert len(repository.events) == 3
    assert len(repository.statistics) == 2


@pytest.mark.anyio
async def test_active_fixture_absent_from_live_is_reconciled_by_id() -> None:
    finished = fixture(status=FixtureStatus.FINISHED, minute=90)
    provider = provider_with(finished)
    repository = FakeLiveRepository((stored_fixture(status="live"),))

    report = await service(provider, repository).run_cycle()

    assert provider.fixture_queries == [("100",)]
    assert repository.fixtures == [finished]
    assert repository.events
    assert repository.statistics
    assert report.fixtures_written == 1
    assert report.provider_requests == 4


@pytest.mark.anyio
async def test_missing_provider_detail_does_not_infer_finished_state() -> None:
    provider = provider_with()
    repository = FakeLiveRepository((stored_fixture(status="live"),))

    report = await service(provider, repository).run_cycle()

    assert provider.fixture_queries == [("100",)]
    assert repository.fixtures == []
    assert repository.events == []
    assert repository.statistics == []
    assert repository.candidates[0].status == "live"
    assert report.fixtures_written == 0
    assert report.provider_requests == 2


@pytest.mark.anyio
async def test_halftime_keeps_events_fresh_but_pauses_statistics() -> None:
    halftime = fixture(status=FixtureStatus.HALFTIME, minute=45)
    provider = provider_with(halftime)
    repository = FakeLiveRepository((stored_fixture(status="halftime"),))

    report = await service(provider, repository).run_cycle()

    assert provider.event_calls == 1
    assert provider.stats_calls == 0
    assert repository.events
    assert repository.statistics == []
    assert report.provider_requests == 2


@pytest.mark.anyio
async def test_lock_contention_skips_duplicate_fixture_work() -> None:
    provider = provider_with(fixture())
    repository = FakeLiveRepository((stored_fixture(status="live"),))
    locks = FakeLocks(denied={"worker:lock:live:mock:100"})

    report = await service(provider, repository, locks=locks).run_cycle()

    assert len(provider.live_queries) == 1
    assert repository.fixtures == []
    assert provider.event_calls == 0
    assert provider.stats_calls == 0
    assert report.fixtures_written == 0
    assert report.provider_requests == 1


@pytest.mark.anyio
async def test_unknown_status_is_not_sent_to_persistence() -> None:
    unknown = fixture(status=FixtureStatus.UNKNOWN)
    provider = provider_with(unknown)
    repository = FakeLiveRepository((stored_fixture(status="live"),))

    report = await service(provider, repository).run_cycle()

    assert repository.fixtures == []
    assert report.errors == ("fixture:100:unknown_status",)


@pytest.mark.anyio
async def test_provider_error_is_safe_and_statistics_still_persist() -> None:
    provider = provider_with(fixture())
    provider.event_error = RuntimeError("secret-provider-payload")
    repository = FakeLiveRepository((stored_fixture(status="live"),))

    report = await service(provider, repository).run_cycle()

    assert report.errors == ("events:mock:100:RuntimeError",)
    assert "secret-provider-payload" not in "".join(report.errors)
    assert repository.events == []
    assert repository.statistics


@pytest.mark.anyio
async def test_scheduler_reports_once_and_uses_fixture_interval() -> None:
    provider = provider_with()
    repository = FakeLiveRepository(())
    clock = FakeClock()
    reports = []

    async def capture(report) -> None:
        reports.append(report)

    ingestion = service(provider, repository, clock=clock)
    scheduler = LiveIngestionScheduler(
        service=ingestion,
        clock=clock,
        on_report=capture,
    )
    report = await scheduler.run_once()

    assert reports == [report]
    assert ingestion.fixture_poll_seconds == 15
