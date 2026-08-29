from __future__ import annotations

import argparse
import asyncio

from app.core.config import Settings
from app.core.logging import configure_logging
from app.domain.ingestion import IngestionReport, WorkerName
from app.services.intelligence import ProbabilityEngineService
from app.workers.intelligence_runtime import (
    IntelligenceWorkerRuntime,
    build_intelligence_runtime,
)
from app.workers.runtime import install_shutdown_handlers, run_recorded_cycle, run_worker_loop


async def _cycle(runtime: IntelligenceWorkerRuntime) -> IngestionReport:
    settings = runtime.settings
    async with runtime.locks.hold(
        "worker:lock:probability:global", settings.probability_worker_lock_seconds
    ) as acquired:
        if not acquired:
            return IngestionReport(
                worker=WorkerName.PROBABILITY,
                skipped_reason="worker_lock_not_acquired",
            )
        service = ProbabilityEngineService(
            runtime.repository,
            target_provider=settings.sports_data_provider,
            league_link_groups=settings.intelligence_league_link_groups,
            horizon_days=settings.probability_horizon_days,
            target_limit=settings.probability_target_limit,
        )
        return await service.run_once()


async def run(
    *,
    run_once: bool | None = None,
    stop_event: asyncio.Event | None = None,
) -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    runtime = await build_intelligence_runtime(settings)
    if stop_event is None:
        stop_event = asyncio.Event()
        install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,  # type: ignore[arg-type]
                WorkerName.PROBABILITY,
                lambda: _cycle(runtime),
            ),
            interval_seconds=settings.probability_worker_interval_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot Probability Engine.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
