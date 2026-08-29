from __future__ import annotations

import argparse
import asyncio
from types import SimpleNamespace

from app.core.config import Settings
from app.core.database import create_database_engine
from app.core.logging import configure_logging
from app.domain.ingestion import IngestionReport, WorkerName
from app.repositories.ingestion import WorkerRunRepository
from app.repositories.settlement import SettlementRepository
from app.services.settlement import SettlementService
from app.workers.intelligence_runtime import InternalIntelligenceProvider
from app.workers.runtime import (
    WorkerConfigurationError,
    _build_lock_manager,
    install_shutdown_handlers,
    run_recorded_cycle,
    run_worker_loop,
)


async def run(
    *,
    run_once: bool | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    engine = create_database_engine(settings)
    if engine is None:
        raise WorkerConfigurationError("DATABASE_URL is required for settlement worker.")
    locks = _build_lock_manager(settings)
    repository = SettlementRepository(engine)
    runtime = SimpleNamespace(
        settings=settings,
        engine=engine,
        provider=InternalIntelligenceProvider(),
        locks=locks,
        repository=repository,
        runs=WorkerRunRepository(engine),
    )

    async def cycle() -> IngestionReport:
        async with locks.hold(
            "worker:lock:settlement:global", settings.settlement_worker_lock_seconds
        ) as acquired:
            if not acquired:
                return IngestionReport(
                    worker=WorkerName.SETTLEMENT,
                    skipped_reason="worker_lock_not_acquired",
                )
            return await SettlementService(
                repository, target_limit=settings.settlement_target_limit
            ).run_once()

    if stop_event is None:
        stop_event = asyncio.Event()
        install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,  # type: ignore[arg-type]
                WorkerName.SETTLEMENT,
                cycle,
            ),
            interval_seconds=settings.settlement_worker_interval_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await locks.close()
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot signal settlement.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
