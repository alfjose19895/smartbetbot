from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable
from contextlib import suppress
from dataclasses import dataclass
from time import monotonic

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.database import create_database_engine
from app.domain.ingestion import IngestionReport, WorkerName
from app.providers.locks import (
    InMemoryWorkerLockManager,
    UpstashWorkerLockManager,
    WorkerLockManager,
)
from app.providers.sports.base import SportsDataProvider
from app.providers.sports.factory import build_sports_data_provider
from app.repositories.ingestion import SportsIngestionRepository, WorkerRunRepository

logger = logging.getLogger("smartbetbot.worker")


class WorkerConfigurationError(RuntimeError):
    pass


@dataclass(slots=True)
class WorkerRuntime:
    settings: Settings
    engine: AsyncEngine
    provider: SportsDataProvider
    locks: WorkerLockManager
    repository: SportsIngestionRepository
    runs: WorkerRunRepository

    async def close(self) -> None:
        await self.provider.close()
        await self.locks.close()
        await self.engine.dispose()


def _build_lock_manager(settings: Settings) -> WorkerLockManager:
    has_url = bool(settings.upstash_redis_rest_url)
    has_token = bool(settings.upstash_token)
    if has_url != has_token:
        raise WorkerConfigurationError(
            "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together."
        )
    if has_url and has_token:
        return UpstashWorkerLockManager(
            rest_url=settings.upstash_redis_rest_url or "",
            token=settings.upstash_token or "",
        )
    if settings.environment in {"staging", "production"}:
        raise WorkerConfigurationError(
            "Upstash REST credentials are required for distributed worker locks."
        )
    logger.warning("worker_lock_fallback", extra={"lock_backend": "in_memory"})
    return InMemoryWorkerLockManager()


async def build_worker_runtime(settings: Settings, worker: WorkerName) -> WorkerRuntime:
    engine = create_database_engine(settings)
    if engine is None:
        raise WorkerConfigurationError("DATABASE_URL is required for ingestion workers.")
    try:
        provider = build_sports_data_provider(
            settings,
            database_engine=engine,
            worker=worker.value,
        )
        locks = _build_lock_manager(settings)
    except Exception:
        await engine.dispose()
        raise
    return WorkerRuntime(
        settings=settings,
        engine=engine,
        provider=provider,
        locks=locks,
        repository=SportsIngestionRepository(engine),
        runs=WorkerRunRepository(engine),
    )


def _report_status(report: IngestionReport) -> str:
    return "partial" if report.errors else "succeeded"


async def run_recorded_cycle(
    runtime: WorkerRuntime,
    worker: WorkerName,
    operation: Callable[[], Awaitable[IngestionReport]],
) -> IngestionReport:
    started = monotonic()
    run_id = await runtime.runs.start(worker)
    logger.info(
        "worker_cycle_started",
        extra={
            "worker": worker.value,
            "provider": runtime.provider.name,
            "run_id": str(run_id),
        },
    )
    try:
        report = await operation()
    except Exception as error:
        duration_ms = round((monotonic() - started) * 1000)
        await runtime.runs.finish(
            run_id,
            status="failed",
            fixtures_processed=0,
            errors=1,
            duration_ms=duration_ms,
            metadata={"error_type": type(error).__name__},
        )
        logger.error(
            "worker_cycle_failed",
            extra={
                "worker": worker.value,
                "provider": runtime.provider.name,
                "run_id": str(run_id),
                "duration_ms": duration_ms,
                "error_type": type(error).__name__,
            },
        )
        raise

    duration_ms = round((monotonic() - started) * 1000)
    status = _report_status(report)
    await runtime.runs.finish(
        run_id,
        status=status,
        fixtures_processed=report.fixtures_seen,
        errors=len(report.errors),
        duration_ms=duration_ms,
        signals_generated=report.signals_generated,
        metadata={
            "fixtures_written": report.fixtures_written,
            "records_written": report.records_written,
            "provider_requests": report.provider_requests,
            "significant_movements": report.significant_movements,
            "signals_generated": report.signals_generated,
            "skipped_reason": report.skipped_reason,
            "error_codes": list(report.errors),
        },
    )
    logger.info(
        "worker_cycle_finished",
        extra={
            "worker": worker.value,
            "provider": runtime.provider.name,
            "run_id": str(run_id),
            "status": status,
            "duration_ms": duration_ms,
            "fixtures": report.fixtures_seen,
            "records": report.records_written,
            "signals": report.signals_generated,
            "provider_requests": report.provider_requests,
            "errors": len(report.errors),
            "skipped_reason": report.skipped_reason,
        },
    )
    return report


async def _wait_or_stop(stop_event: asyncio.Event, seconds: float) -> None:
    with suppress(TimeoutError):
        await asyncio.wait_for(stop_event.wait(), timeout=seconds)


async def run_worker_loop(
    *,
    cycle: Callable[[], Awaitable[IngestionReport]],
    interval_seconds: int,
    failure_backoff_seconds: int,
    run_once: bool,
    stop_event: asyncio.Event,
) -> None:
    while not stop_event.is_set():
        failed = False
        try:
            await cycle()
        except Exception:
            failed = True
            if run_once:
                raise
        if run_once:
            return
        delay = failure_backoff_seconds if failed else interval_seconds
        await _wait_or_stop(stop_event, delay)


def install_shutdown_handlers(stop_event: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    for name in ("SIGTERM", "SIGINT"):
        signum = getattr(signal, name, None)
        if signum is None:
            continue
        try:
            loop.add_signal_handler(signum, stop_event.set)
        except NotImplementedError:
            continue
