from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Protocol

from app.domain.ingestion import IngestionReport, StoredFixture, WorkerName
from app.domain.sports import (
    Fixture,
    FixtureEvent,
    FixtureQuery,
    FixtureStatistics,
    FixtureStatus,
    LiveFixtureQuery,
    ProviderCapability,
)
from app.providers.sports.base import SportsDataProvider

logger = logging.getLogger("smartbetbot.worker.live")


class LiveIngestionRepository(Protocol):
    """Persistence boundary required by the live ingestion service."""

    async def list_live_candidates(
        self,
        *,
        provider: str,
        now: datetime,
        lookback_seconds: int,
        lookahead_seconds: int,
    ) -> tuple[StoredFixture, ...]: ...

    async def persist_live_fixture(
        self,
        fixture: Fixture,
        *,
        observed_at: datetime,
    ) -> StoredFixture: ...

    async def persist_fixture_events(
        self,
        fixture: StoredFixture,
        events: tuple[FixtureEvent, ...],
        *,
        observed_at: datetime,
    ) -> int: ...

    async def persist_fixture_statistics(
        self,
        fixture: StoredFixture,
        statistics: tuple[FixtureStatistics, ...],
        *,
        captured_at: datetime,
    ) -> int: ...


class DistributedLockManager(Protocol):
    def hold(
        self,
        key: str,
        *,
        ttl_seconds: int,
    ) -> AbstractAsyncContextManager[bool]: ...

    async def close(self) -> None: ...


class LiveIngestionHook(Protocol):
    async def on_fixture_update(
        self,
        fixture: StoredFixture,
        observation: Fixture,
        *,
        events_written: int,
        statistics_written: int,
    ) -> None: ...


class LiveClock(Protocol):
    def now(self) -> datetime: ...

    async def sleep(self, seconds: float) -> None: ...


class SystemLiveClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)


@dataclass(frozen=True, slots=True)
class LiveIngestionSettings:
    fixture_poll_seconds: int = 15
    event_poll_seconds: int = 15
    stats_poll_seconds: int = 60
    candidate_lookback_seconds: int = 4 * 60 * 60
    candidate_lookahead_seconds: int = 15 * 60
    lock_ttl_seconds: int = 120
    max_concurrency: int = 4

    def __post_init__(self) -> None:
        positive_values = (
            self.fixture_poll_seconds,
            self.event_poll_seconds,
            self.stats_poll_seconds,
            self.candidate_lookback_seconds,
            self.candidate_lookahead_seconds,
            self.lock_ttl_seconds,
            self.max_concurrency,
        )
        if any(value <= 0 for value in positive_values):
            raise ValueError("Live ingestion settings must be positive.")


@dataclass(frozen=True, slots=True)
class _SyncResult:
    fixtures_written: int = 0
    records_written: int = 0
    provider_requests: int = 0
    errors: tuple[str, ...] = ()


class LiveIngestionService:
    """Coordinates quota-aware, idempotent live fixture ingestion.

    The service owns scheduling decisions only. Database upserts, event fingerprints,
    snapshot conflict handling, and lock token safety remain behind injected protocols.
    """

    _active_statuses = frozenset({FixtureStatus.LIVE, FixtureStatus.HALFTIME})
    _terminal_statuses = frozenset(
        {
            FixtureStatus.FINISHED,
            FixtureStatus.POSTPONED,
            FixtureStatus.CANCELLED,
            FixtureStatus.ABANDONED,
        }
    )

    def __init__(
        self,
        *,
        provider: SportsDataProvider,
        repository: LiveIngestionRepository,
        locks: DistributedLockManager,
        clock: LiveClock | None = None,
        settings: LiveIngestionSettings | None = None,
        hook: LiveIngestionHook | None = None,
    ) -> None:
        self._provider = provider
        self._repository = repository
        self._locks = locks
        self._clock = clock or SystemLiveClock()
        self._settings = settings or LiveIngestionSettings()
        self._hook = hook
        self._last_event_poll: dict[str, datetime] = {}
        self._last_stats_poll: dict[str, datetime] = {}

    @property
    def fixture_poll_seconds(self) -> int:
        return self._settings.fixture_poll_seconds

    async def run_cycle(self) -> IngestionReport:
        if ProviderCapability.LIVE_FIXTURES not in self._provider.capabilities:
            return IngestionReport(
                worker=WorkerName.LIVE,
                skipped_reason="provider_missing_live_fixtures_capability",
            )
        now = self._clock.now()
        candidates = await self._repository.list_live_candidates(
            provider=self._provider.name,
            now=now,
            lookback_seconds=self._settings.candidate_lookback_seconds,
            lookahead_seconds=self._settings.candidate_lookahead_seconds,
        )
        candidates = tuple(item for item in candidates if item.provider == self._provider.name)
        if not candidates:
            return IngestionReport(worker=WorkerName.LIVE, skipped_reason="no_candidates")

        discovery_key = f"worker:lock:live:{self._provider.name}:discovery"
        async with self._locks.hold(
            discovery_key,
            ttl_seconds=self._settings.lock_ttl_seconds,
        ) as acquired:
            if not acquired:
                return IngestionReport(
                    worker=WorkerName.LIVE,
                    fixtures_seen=len(candidates),
                    skipped_reason="discovery_lock_not_acquired",
                )

            try:
                observations, discovery_requests = await self._discover(candidates)
            except Exception as error:
                return IngestionReport(
                    worker=WorkerName.LIVE,
                    fixtures_seen=len(candidates),
                    errors=(self._safe_error("discovery", error),),
                )

            candidate_by_key = {self._stored_key(item): item for item in candidates}
            semaphore = asyncio.Semaphore(self._settings.max_concurrency)

            async def guarded_sync(observation: Fixture) -> _SyncResult:
                async with semaphore:
                    started = monotonic()
                    key = self._fixture_key(observation)
                    was_active = self._stored_is_active(candidate_by_key.get(key))
                    result = await self._sync_fixture(
                        observation,
                        now=now,
                        was_active=was_active,
                    )
                    logger.info(
                        "live_fixture_synced",
                        extra={
                            "worker": WorkerName.LIVE.value,
                            "provider": observation.ref.provider,
                            "fixture": observation.ref.external_id,
                            "duration_ms": round((monotonic() - started) * 1000),
                            "records": result.records_written,
                            "errors": len(result.errors),
                        },
                    )
                    return result

            results = await asyncio.gather(
                *(guarded_sync(observation) for observation in observations),
            )

        seen_keys = {*candidate_by_key, *(self._fixture_key(item) for item in observations)}
        return IngestionReport(
            worker=WorkerName.LIVE,
            fixtures_seen=len(seen_keys),
            fixtures_written=sum(item.fixtures_written for item in results),
            records_written=sum(item.records_written for item in results),
            provider_requests=discovery_requests + sum(item.provider_requests for item in results),
            errors=tuple(error for item in results for error in item.errors),
        )

    async def _discover(
        self,
        candidates: tuple[StoredFixture, ...],
    ) -> tuple[tuple[Fixture, ...], int]:
        observations: dict[str, Fixture] = {}
        provider_requests = 0
        league_ids = sorted({item.league_provider_id for item in candidates})
        for league_batch in self._chunks(league_ids, 50):
            response = await self._provider.list_live_fixtures(
                LiveFixtureQuery(league_external_ids=tuple(league_batch))
            )
            provider_requests += response.metadata.external_requests
            observations.update((self._fixture_key(item), item) for item in response.items)

        active_candidates = tuple(item for item in candidates if self._stored_is_active(item))
        missing_active_ids = [
            item.provider_id
            for item in active_candidates
            if self._stored_key(item) not in observations
        ]
        for fixture_batch in self._chunks(missing_active_ids, 20):
            response = await self._provider.list_fixtures(
                FixtureQuery(fixture_external_ids=tuple(fixture_batch))
            )
            provider_requests += response.metadata.external_requests
            observations.update((self._fixture_key(item), item) for item in response.items)

        return tuple(observations.values()), provider_requests

    async def _sync_fixture(
        self,
        observation: Fixture,
        *,
        now: datetime,
        was_active: bool,
    ) -> _SyncResult:
        if ProviderCapability.EVENTS not in self._provider.capabilities:
            return _SyncResult()
        key = self._fixture_key(observation)
        lock_key = f"worker:lock:live:{key}"
        async with self._locks.hold(
            lock_key,
            ttl_seconds=self._settings.lock_ttl_seconds,
        ) as acquired:
            if not acquired:
                return _SyncResult()
            if observation.status == FixtureStatus.UNKNOWN:
                return _SyncResult(
                    errors=(f"fixture:{observation.ref.external_id}:unknown_status",)
                )
            try:
                stored = await self._repository.persist_live_fixture(
                    observation,
                    observed_at=now,
                )
            except Exception as error:
                return _SyncResult(errors=(self._safe_error(f"fixture:{key}", error),))

            result = _SyncResult(fixtures_written=1)
            force_final = was_active and observation.status in self._terminal_statuses
            if observation.status not in self._active_statuses and not force_final:
                return result

            event_result = await self._sync_events(
                stored,
                observation,
                now=now,
                force=force_final,
            )
            stats_result = await self._sync_statistics(
                stored,
                observation,
                now=now,
                force=force_final,
            )
            if observation.status in self._terminal_statuses:
                self._last_event_poll.pop(key, None)
                self._last_stats_poll.pop(key, None)
            combined = self._combine(result, event_result, stats_result)
            if self._hook is not None:
                try:
                    await self._hook.on_fixture_update(
                        stored,
                        observation,
                        events_written=event_result.records_written,
                        statistics_written=stats_result.records_written,
                    )
                except Exception as error:
                    combined = self._combine(
                        combined,
                        _SyncResult(errors=(self._safe_error(f"hook:{key}", error),)),
                    )
            return combined

    async def _sync_events(
        self,
        stored: StoredFixture,
        observation: Fixture,
        *,
        now: datetime,
        force: bool,
    ) -> _SyncResult:
        if ProviderCapability.STATISTICS not in self._provider.capabilities:
            return _SyncResult()
        key = self._fixture_key(observation)
        if not force and not self._is_due(
            self._last_event_poll.get(key), now, self._settings.event_poll_seconds
        ):
            return _SyncResult()
        self._last_event_poll[key] = now
        try:
            response = await self._provider.get_fixture_events(observation.ref)
            written = await self._repository.persist_fixture_events(
                stored,
                response.items,
                observed_at=now,
            )
            return _SyncResult(
                records_written=written,
                provider_requests=response.metadata.external_requests,
            )
        except Exception as error:
            return _SyncResult(errors=(self._safe_error(f"events:{key}", error),))

    async def _sync_statistics(
        self,
        stored: StoredFixture,
        observation: Fixture,
        *,
        now: datetime,
        force: bool,
    ) -> _SyncResult:
        key = self._fixture_key(observation)
        if observation.status == FixtureStatus.HALFTIME and not force:
            return _SyncResult()
        if not force and not self._is_due(
            self._last_stats_poll.get(key), now, self._settings.stats_poll_seconds
        ):
            return _SyncResult()
        self._last_stats_poll[key] = now
        captured_at = self._bucket(now, self._settings.stats_poll_seconds)
        try:
            response = await self._provider.get_fixture_statistics(observation.ref)
            statistics = tuple(
                item.model_copy(
                    update={
                        "captured_at": captured_at,
                        "match_minute": observation.match_minute,
                    }
                )
                for item in response.items
            )
            written = await self._repository.persist_fixture_statistics(
                stored,
                statistics,
                captured_at=captured_at,
            )
            return _SyncResult(
                records_written=written,
                provider_requests=response.metadata.external_requests,
            )
        except Exception as error:
            return _SyncResult(errors=(self._safe_error(f"statistics:{key}", error),))

    @staticmethod
    def _combine(*results: _SyncResult) -> _SyncResult:
        return _SyncResult(
            fixtures_written=sum(item.fixtures_written for item in results),
            records_written=sum(item.records_written for item in results),
            provider_requests=sum(item.provider_requests for item in results),
            errors=tuple(error for item in results for error in item.errors),
        )

    @staticmethod
    def _chunks(values: Sequence[str], size: int) -> tuple[tuple[str, ...], ...]:
        return tuple(tuple(values[index : index + size]) for index in range(0, len(values), size))

    @staticmethod
    def _stored_is_active(value: StoredFixture | None) -> bool:
        return value is not None and value.status in {
            FixtureStatus.LIVE.value,
            FixtureStatus.HALFTIME.value,
        }

    @staticmethod
    def _fixture_key(fixture: Fixture) -> str:
        return f"{fixture.ref.provider}:{fixture.ref.external_id}"

    @staticmethod
    def _stored_key(fixture: StoredFixture) -> str:
        return f"{fixture.provider}:{fixture.provider_id}"

    @staticmethod
    def _is_due(last: datetime | None, now: datetime, interval_seconds: int) -> bool:
        return last is None or now - last >= timedelta(seconds=interval_seconds)

    @staticmethod
    def _bucket(value: datetime, seconds: int) -> datetime:
        timestamp = int(value.timestamp())
        return datetime.fromtimestamp(timestamp - (timestamp % seconds), tz=UTC)

    @staticmethod
    def _safe_error(scope: str, error: Exception) -> str:
        return f"{scope}:{type(error).__name__}"


ReportCallback = Callable[[IngestionReport], Awaitable[None]]


class LiveIngestionScheduler:
    def __init__(
        self,
        *,
        service: LiveIngestionService,
        clock: LiveClock | None = None,
        on_report: ReportCallback | None = None,
    ) -> None:
        self._service = service
        self._clock = clock or SystemLiveClock()
        self._on_report = on_report

    async def run_once(self) -> IngestionReport:
        report = await self._service.run_cycle()
        if self._on_report is not None:
            await self._on_report(report)
        return report

    async def run(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            await self.run_once()
            if not stop_event.is_set():
                await self._clock.sleep(self._service.fixture_poll_seconds)
