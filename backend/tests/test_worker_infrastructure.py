from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.domain.ingestion import IngestionReport, WorkerName
from app.domain.sports import ProviderRef, StandingsTable, TeamSeasonStatistics
from app.providers.locks import InMemoryWorkerLockManager, UpstashWorkerLockManager
from app.repositories.ingestion import (
    SportsIngestionRepository,
    bucket_timestamp,
    stable_fingerprint,
)
from app.workers.runtime import (
    WorkerConfigurationError,
    _build_lock_manager,
    run_recorded_cycle,
    run_worker_loop,
)


def test_empty_optional_season_override_is_normalized() -> None:
    settings = Settings(prematch_season_override="")  # type: ignore[arg-type]

    assert settings.prematch_season_override is None


class _TransactionContext:
    def __init__(self, connection: object) -> None:
        self.connection = connection

    async def __aenter__(self) -> object:
        return self.connection

    async def __aexit__(self, *_args: object) -> None:
        return None


class _EngineStub:
    def __init__(self, connection: object) -> None:
        self.connection = connection

    def begin(self) -> _TransactionContext:
        return _TransactionContext(self.connection)


class _ScalarResult:
    def __init__(self, value: object) -> None:
        self.value = value

    def scalar_one_or_none(self) -> object:
        return self.value


@pytest.mark.anyio
async def test_snapshot_writers_preserve_catalog_current_season(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    league_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    season_id = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    team_id = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    connection = SimpleNamespace(
        execute=AsyncMock(side_effect=[_ScalarResult(1), _ScalarResult(team_id), _ScalarResult(1)])
    )
    repository = SportsIngestionRepository(_EngineStub(connection))  # type: ignore[arg-type]
    league_ref = ProviderRef(provider="football_data", external_id="2021")
    team_ref = ProviderRef(provider="football_data", external_id="1")
    league_lookup = AsyncMock(return_value=league_id)
    season_upsert = AsyncMock(return_value=season_id)
    monkeypatch.setattr(repository, "_league_id", league_lookup)
    monkeypatch.setattr(repository, "_upsert_season", season_upsert)

    await repository.persist_standings(
        StandingsTable(
            league_ref=league_ref,
            season=2026,
            entries=(),
            captured_at=datetime(2026, 8, 25, tzinfo=UTC),
        )
    )
    await repository.persist_team_statistics(
        TeamSeasonStatistics(
            league_ref=league_ref,
            team_ref=team_ref,
            season=2026,
            captured_at=datetime(2026, 8, 25, tzinfo=UTC),
            metrics={},
        )
    )

    assert season_upsert.await_count == 2
    assert all(call.kwargs["preserve_existing"] is True for call in season_upsert.await_args_list)


@pytest.mark.anyio
async def test_in_memory_lock_is_exclusive_and_owner_safe() -> None:
    manager = InMemoryWorkerLockManager()
    first = await manager.acquire("worker:lock:live", 30)
    blocked = await manager.acquire("worker:lock:live", 30)

    assert first.acquired is True
    assert blocked.acquired is False

    await manager.release(blocked)
    still_blocked = await manager.acquire("worker:lock:live", 30)
    assert still_blocked.acquired is False
    assert await manager.renew(first, 30) is True
    assert await manager.renew(blocked, 30) is False

    await manager.release(first)
    available = await manager.acquire("worker:lock:live", 30)
    assert available.acquired is True


@pytest.mark.anyio
async def test_upstash_lock_uses_set_nx_and_compare_delete() -> None:
    commands: list[list[object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        command = json.loads(request.content)
        commands.append(command)
        return httpx.Response(200, json={"result": "OK" if command[0] == "SET" else 1})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        manager = UpstashWorkerLockManager(
            rest_url="https://cache.example.test",
            token="redis-secret",
            http_client=http_client,
        )
        lease = await manager.acquire("worker:lock:odds", 45)
        renewed = await manager.renew(lease, 45)
        await manager.release(lease)

    assert commands[0][0:2] == ["SET", "worker:lock:odds"]
    assert commands[0][3:] == ["NX", "EX", 45]
    assert renewed is True
    assert commands[1][0] == "EVAL"
    assert commands[1][-3:] == ["worker:lock:odds", lease.token, 45]
    assert commands[2][0] == "EVAL"
    assert commands[2][-2:] == ["worker:lock:odds", lease.token]
    assert "redis-secret" not in json.dumps(commands)


def test_snapshot_fingerprints_are_canonical_and_time_buckets_are_stable() -> None:
    first = stable_fingerprint({"fixture": 1, "market": "total", "line": "2.500"})
    reordered = stable_fingerprint({"line": "2.500", "market": "total", "fixture": 1})

    assert first == reordered
    assert len(first) == 64
    assert bucket_timestamp(datetime(2026, 8, 25, 10, 3, 59, tzinfo=UTC), 60) == datetime(
        2026, 8, 25, 10, 3, tzinfo=UTC
    )


def test_worker_settings_are_bounded_and_league_targets_are_explicit() -> None:
    settings = Settings(
        environment="test",
        prematch_league_ids="39, 140,39",
        upstash_redis_rest_url=None,
        upstash_redis_rest_token=None,
    )

    assert settings.prematch_league_id_list == ("39", "140")
    assert settings.live_fixture_poll_seconds == 15
    assert settings.live_stats_poll_seconds == 60


def test_distributed_locks_are_required_in_deployed_environments() -> None:
    # Bypass the settings validator to retain defense-in-depth coverage at the worker boundary.
    settings = Settings.model_construct(
        environment="production",
        upstash_redis_rest_url=None,
        upstash_redis_rest_token=None,
    )

    with pytest.raises(WorkerConfigurationError, match="Upstash"):
        _build_lock_manager(settings)


class _FakeWorkerRuns:
    def __init__(self) -> None:
        self.finished: dict[str, object] | None = None

    async def start(self, worker: WorkerName) -> UUID:
        assert worker == WorkerName.LIVE
        return UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

    async def finish(self, _run_id: UUID, **values: object) -> None:
        self.finished = values


@pytest.mark.anyio
async def test_recorded_cycle_persists_partial_report_without_sensitive_details() -> None:
    runs = _FakeWorkerRuns()
    runtime = SimpleNamespace(
        runs=runs,
        provider=SimpleNamespace(name="api_football"),
    )

    async def operation() -> IngestionReport:
        return IngestionReport(
            worker=WorkerName.LIVE,
            fixtures_seen=2,
            records_written=3,
            provider_requests=4,
            errors=("events:api_football:TimeoutError",),
        )

    report = await run_recorded_cycle(runtime, WorkerName.LIVE, operation)

    assert report.records_written == 3
    assert runs.finished is not None
    assert runs.finished["status"] == "partial"
    assert runs.finished["fixtures_processed"] == 2
    assert runs.finished["errors"] == 1
    assert runs.finished["metadata"] == {
        "fixtures_written": 0,
        "records_written": 3,
        "provider_requests": 4,
        "significant_movements": 0,
        "signals_generated": 0,
        "skipped_reason": None,
        "error_codes": ["events:api_football:TimeoutError"],
    }


@pytest.mark.anyio
async def test_run_once_executes_exactly_one_worker_cycle() -> None:
    calls = 0

    async def cycle() -> IngestionReport:
        nonlocal calls
        calls += 1
        return IngestionReport(worker=WorkerName.ODDS)

    await run_worker_loop(
        cycle=cycle,
        interval_seconds=15,
        failure_backoff_seconds=5,
        run_once=True,
        stop_event=asyncio.Event(),
    )

    assert calls == 1
