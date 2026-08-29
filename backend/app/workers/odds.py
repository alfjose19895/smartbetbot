from __future__ import annotations

import argparse
import asyncio
from decimal import Decimal

from app.core.config import Settings
from app.core.logging import configure_logging
from app.domain.ingestion import WorkerName
from app.services.ingestion.odds import OddsIngestionService
from app.workers.runtime import (
    build_worker_runtime,
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
    runtime = await build_worker_runtime(settings, WorkerName.ODDS)
    service = OddsIngestionService(
        provider=runtime.provider,
        repository=runtime.repository,
        distributed_lock=runtime.locks,
        model_probabilities=runtime.repository,
        significant_movement_threshold=Decimal(str(settings.odds_movement_relative_price_change)),
        significant_probability_delta=Decimal(str(settings.odds_movement_probability_delta)),
        live_bucket_seconds=settings.live_odds_poll_seconds,
        lock_ttl_seconds=settings.odds_worker_lock_seconds,
        max_concurrency=settings.live_max_concurrency,
        target_limit=settings.odds_target_limit,
    )
    if stop_event is None:
        stop_event = asyncio.Event()
        install_shutdown_handlers(stop_event)
    try:
        await run_worker_loop(
            cycle=lambda: run_recorded_cycle(
                runtime,
                WorkerName.ODDS,
                service.run_live_cycle,
            ),
            interval_seconds=settings.live_odds_poll_seconds,
            failure_backoff_seconds=settings.worker_failure_backoff_seconds,
            run_once=settings.worker_run_once if run_once is None else run_once,
            stop_event=stop_event,
        )
    finally:
        await runtime.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run SmartBetBot live odds ingestion.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    args = parser.parse_args()
    asyncio.run(run(run_once=True if args.once else None))


if __name__ == "__main__":
    main()
